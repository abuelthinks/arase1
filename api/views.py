"""
API Views — thin orchestrators.
Business logic lives in api/services/*.
"""

from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import (
    Student, ReportCycle, GeneratedDocument, DocumentVersion,
    ParentAssessment, MultidisciplinaryAssessment, SpedAssessment,
    ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker,
    User, Invitation, PhoneVerification
)
from .serializers import (
    StudentSerializer, GeneratedDocumentSerializer, CustomTokenObtainPairSerializer,
    ParentAssessmentSerializer, MultidisciplinaryAssessmentSerializer, SpedAssessmentSerializer,
    ParentProgressTrackerSerializer, MultidisciplinaryProgressTrackerSerializer, SpedProgressTrackerSerializer,
    UserSerializer, InvitationSerializer, AcceptInvitationSerializer
)

# ─── Auth ────────────────────────────────────────────────────────────────────

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

# ─── Students ────────────────────────────────────────────────────────────────

class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'ADMIN':
            return Student.objects.all()
        return Student.objects.filter(assigned_users__user=user).distinct()

    def create(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can register students."}, status=status.HTTP_403_FORBIDDEN)

        parent_email = request.data.get('parent_email', None)
        if not parent_email:
            return Response({"error": "Parent email is required."}, status=status.HTTP_400_BAD_REQUEST)

        from .services.student_service import create_student_with_invitation

        student_data = {k: v for k, v in request.data.items() if k != 'parent_email'}
        # Title-case names
        if 'first_name' in student_data:
            student_data['first_name'] = student_data['first_name'].strip().title()
        if 'last_name' in student_data:
            student_data['last_name'] = student_data['last_name'].strip().title()

        serializer = self.get_serializer(data=student_data)
        serializer.is_valid(raise_exception=True)

        # Use service to create student + invitation
        student, invitation = create_student_with_invitation(
            dict(serializer.validated_data), parent_email
        )

        response_data = StudentSerializer(student).data
        response_data['invitation_token'] = str(invitation.token)
        headers = self.get_success_headers(response_data)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can delete students."}, status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

# ─── Users ───────────────────────────────────────────────────────────────────

class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'ADMIN':
            return User.objects.all().order_by('-date_joined')
        return User.objects.filter(id=user.id)

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can delete users."}, status=status.HTTP_403_FORBIDDEN)
        instance = self.get_object()
        if instance == request.user:
            return Response({"error": "Cannot delete your own account."}, status=status.HTTP_400_BAD_REQUEST)
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

# ─── Form Input ViewSets ─────────────────────────────────────────────────────

class BaseInputViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(submitted_by=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        # On-demand translation fallback for missing background tasks
        if request.user.role in ['ADMIN', 'SPECIALIST', 'TEACHER'] and \
           not instance.translated_data and instance.form_data:
            try:
                from .services.translation_service import translate_form_data
                translated_data, detected_lang = translate_form_data(instance.form_data)
                # If a translation was actually found (not just English)
                if detected_lang not in ['en', 'english']:
                    instance.translated_data = translated_data
                    instance.original_language = detected_lang
                    # Use update_fields to avoid triggering signals that might expect full saves
                    instance.save(update_fields=['translated_data', 'original_language'])
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"On-demand translation failed for {instance._meta.model_name} {instance.id}: {e}")
        
        return super().retrieve(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        if user.role == 'ADMIN':
            return self.queryset
        if user.role == 'PARENT':
            return self.queryset.filter(submitted_by=user)
        from .models import StudentAccess
        assigned_student_ids = StudentAccess.objects.filter(user=user).values_list('student_id', flat=True)
        return self.queryset.filter(student_id__in=assigned_student_ids)


class ParentAssessmentViewSet(BaseInputViewSet):
    queryset = ParentAssessment.objects.all()
    serializer_class = ParentAssessmentSerializer


class MultidisciplinaryAssessmentViewSet(BaseInputViewSet):
    queryset = MultidisciplinaryAssessment.objects.all()
    serializer_class = MultidisciplinaryAssessmentSerializer

    def perform_create(self, serializer):
        instance = serializer.save(submitted_by=self.request.user)
        student = instance.student
        # Auto-advance to OBSERVATION_PENDING when a specialist submits an assessment
        if student.status in ['PENDING_ASSESSMENT', 'ASSESSMENT_SCHEDULED']:
            student.status = 'OBSERVATION_PENDING'
            student.save()


class SpedAssessmentViewSet(BaseInputViewSet):
    queryset = SpedAssessment.objects.all()
    serializer_class = SpedAssessmentSerializer

    def perform_create(self, serializer):
        instance = serializer.save(submitted_by=self.request.user)
        student = instance.student
        # Auto-advance to ASSESSED when a teacher submits an assessment
        if student.status in ['OBSERVATION_PENDING', 'OBSERVATION_SCHEDULED']:
            student.status = 'ASSESSED'
            student.save()


class ParentProgressTrackerViewSet(BaseInputViewSet):
    queryset = ParentProgressTracker.objects.all()
    serializer_class = ParentProgressTrackerSerializer

    def perform_create(self, serializer):
        instance = serializer.save(submitted_by=self.request.user)
        from .services.cycle_service import check_and_trigger_auto_generation
        check_and_trigger_auto_generation(instance.student, instance.report_cycle)


class MultidisciplinaryProgressTrackerViewSet(BaseInputViewSet):
    queryset = MultidisciplinaryProgressTracker.objects.all()
    serializer_class = MultidisciplinaryProgressTrackerSerializer

    def create(self, request, *args, **kwargs):
        # Double check student status for progress tracking
        student_id = request.data.get('student')
        try:
            student = Student.objects.get(id=student_id)
            if student.status != 'ENROLLED' and request.user.role != 'ADMIN':
                return Response({"error": "Progress tracking is only available for active (enrolled) students."}, status=status.HTTP_400_BAD_REQUEST)
        except Student.DoesNotExist:
            pass
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        instance = serializer.save(submitted_by=self.request.user)
        from .services.cycle_service import check_and_trigger_auto_generation
        check_and_trigger_auto_generation(instance.student, instance.report_cycle)


class SpedProgressTrackerViewSet(BaseInputViewSet):
    queryset = SpedProgressTracker.objects.all()
    serializer_class = SpedProgressTrackerSerializer

    def perform_create(self, serializer):
        instance = serializer.save(submitted_by=self.request.user)
        from .services.cycle_service import check_and_trigger_auto_generation
        check_and_trigger_auto_generation(instance.student, instance.report_cycle)

# ─── Parent Onboarding ───────────────────────────────────────────────────────

class ParentOnboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.role != 'PARENT':
            return Response({"error": "Only parents can use the onboarding endpoint."}, status=status.HTTP_403_FORBIDDEN)

        student_data = request.data.get('student', {})
        form_data = request.data.get('form_data', {})
        student_id = request.data.get('student_id')

        if not all([student_data.get('first_name'), student_data.get('last_name'),
                     student_data.get('date_of_birth'), student_data.get('grade')]):
            return Response({"error": "Missing required student information."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from .services.student_service import onboard_parent_student
            student, is_new = onboard_parent_student(user, student_data, form_data, student_id)

            if is_new:
                return Response({
                    "message": "Student profile created and initial input submitted successfully.",
                    "student_id": student.id,
                }, status=status.HTTP_201_CREATED)
            else:
                return Response({
                    "message": "Student profile updated and input submitted successfully.",
                    "student_id": student.id,
                }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# ─── Student Profile ─────────────────────────────────────────────────────────

class StudentProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, student_id):
        try:
            if request.user.role == 'ADMIN':
                student = Student.objects.get(id=student_id)
            else:
                student = Student.objects.get(id=student_id, assigned_users__user=request.user)
        except Student.DoesNotExist:
            return Response({"error": "Student not found or access denied."}, status=status.HTTP_404_NOT_FOUND)

        from .services.student_service import get_student_profile_data
        return Response(get_student_profile_data(student, request.user))

# ─── Dashboard Actions ───────────────────────────────────────────────────────

class AdminDashboardActionsView(APIView):
    """GET: Return actionable items for the Admin Action Center."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != 'ADMIN':
            return Response({"error": "Admin only"}, status=status.HTTP_403_FORBIDDEN)
        
        actions = []
        
        # 1. Monthly report cycle status for each enrolled student
        active_students = Student.objects.filter(status='ENROLLED')
        for s in active_students:
            cycle = ReportCycle.objects.filter(student=s, is_active=True).first()
            if not cycle:
                continue

            p_done = ParentProgressTracker.objects.filter(student=s, report_cycle=cycle).exists()
            m_done = MultidisciplinaryProgressTracker.objects.filter(student=s, report_cycle=cycle).exists()
            sp_done = SpedProgressTracker.objects.filter(student=s, report_cycle=cycle).exists()
            submitted = sum([p_done, m_done, sp_done])

            # Check if a report was auto-generated and needs review
            report = GeneratedDocument.objects.filter(
                student=s, report_cycle=cycle, document_type='MONTHLY'
            ).first()

            if report and report.status == 'DRAFT':
                actions.append({
                    "id": f"review_report_{s.id}",
                    "title": f"Review Monthly Report: {s.first_name} {s.last_name}",
                    "description": f"{cycle.label} report auto-generated. Review and finalize.",
                    "action_text": "Review →",
                    "link": f"/admin/monthly-report?id={report.id}",
                    "type": "positive"
                })
            elif p_done and m_done and sp_done and not report:
                actions.append({
                    "id": f"monthly_{s.id}",
                    "title": f"Ready for Monthly Report: {s.first_name} {s.last_name}",
                    "description": "All 3 trackers have been submitted.",
                    "action_text": "Generate →",
                    "link": f"/admin/reports?studentId={s.id}",
                    "type": "positive"
                })
            elif submitted > 0 and submitted < 3:
                missing = []
                if not p_done: missing.append("Parent")
                if not m_done: missing.append("Specialist")
                if not sp_done: missing.append("Teacher")
                actions.append({
                    "id": f"pending_{s.id}",
                    "title": f"Trackers Pending: {s.first_name} {s.last_name}",
                    "description": f"{submitted}/3 submitted for {cycle.label}. Waiting: {', '.join(missing)}.",
                    "action_text": "View →",
                    "link": f"/students/{s.id}",
                    "type": "warning"
                })

        # 2. Ready for Enrollment Review (all assessments done, waiting for admin decision)
        in_review = Student.objects.filter(status='ASSESSED')
        for s in in_review:
            actions.append({
                "id": f"review_{s.id}",
                "title": f"Ready for Enrollment Review: {s.first_name} {s.last_name}",
                "description": "Both Specialist and Teacher assessments complete. Awaiting admin enrollment decision.",
                "action_text": "Review →",
                "link": f"/students/{s.id}",
                "type": "info"
            })

        # 2.5 Ready for Teacher Trial Assignment
        obs_pending = Student.objects.filter(status='OBSERVATION_PENDING')
        for s in obs_pending:
            actions.append({
                "id": f"obs_{s.id}",
                "title": f"Assign Teacher Observation: {s.first_name} {s.last_name}",
                "description": "Specialist assessment complete. Review clinical notes and assign a Teacher for trial observation.",
                "action_text": "Assign →",
                "link": f"/students/{s.id}",
                "type": "info"
            })

        # 3. Parent Onboarding Submitted (in INQUIRY, parent input received)
        inquiry = Student.objects.filter(status='PENDING_ASSESSMENT')
        for s in inquiry:
            if ParentAssessment.objects.filter(student=s).exists():
                actions.append({
                    "id": f"inquiry_{s.id}",
                    "title": f"Parent Onboarding Complete: {s.first_name} {s.last_name}",
                    "description": "Parent has submitted initial assessment. Assign a specialist to begin evaluation.",
                    "action_text": "Assign →",
                    "link": f"/students/{s.id}",
                    "type": "info"
                })

        return Response({"actions": actions})

# ─── Student Actions ─────────────────────────────────────────────────────────

class RequestAssessmentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, student_id):
        try:
            student = Student.objects.get(id=student_id, assigned_users__user=request.user)
            student.status = 'ASSESSMENT_SCHEDULED'
            student.save()
            return Response({"message": "Evaluation requested successfully."})
        except Student.DoesNotExist:
            return Response({"error": "Student not found."}, status=status.HTTP_404_NOT_FOUND)


class AssignSpecialistView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, student_id):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only Admins can assign specialists."}, status=status.HTTP_403_FORBIDDEN)

        specialist_id = request.data.get('specialist_id')
        if not specialist_id:
            return Response({"error": "specialist_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from .services.student_service import assign_staff_to_student
            staff, student = assign_staff_to_student(student_id, specialist_id, 'SPECIALIST')
            return Response({"message": f"Specialist {staff.username} assigned."})
        except (User.DoesNotExist, Student.DoesNotExist):
            return Response({"error": "Specialist or Student not found."}, status=status.HTTP_404_NOT_FOUND)


class AssignTeacherView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, student_id):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only Admins can assign teachers."}, status=status.HTTP_403_FORBIDDEN)

        teacher_id = request.data.get('teacher_id')
        if not teacher_id:
            return Response({"error": "teacher_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from .services.student_service import assign_staff_to_student
            staff, student = assign_staff_to_student(student_id, teacher_id, 'TEACHER')
            return Response({"message": f"Teacher {staff.username} assigned to {student.first_name}."})
        except (User.DoesNotExist, Student.DoesNotExist):
            return Response({"error": "Teacher or Student not found."}, status=status.HTTP_404_NOT_FOUND)


class AssignParentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, student_id):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only Admins can assign parents."}, status=status.HTTP_403_FORBIDDEN)

        parent_id = request.data.get('parent_id')
        if not parent_id:
            return Response({"error": "parent_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from .services.student_service import assign_staff_to_student
            staff, student = assign_staff_to_student(student_id, parent_id, 'PARENT')
            return Response({"message": f"Parent {staff.username} assigned to {student.first_name}."})
        except (User.DoesNotExist, Student.DoesNotExist):
            return Response({"error": "Parent or Student not found."}, status=status.HTTP_404_NOT_FOUND)

# ─── Staff List ──────────────────────────────────────────────────────────────

class StaffListView(APIView):
    """Returns all specialists and teachers with caseload and recommendation."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != 'ADMIN':
            return Response({"error": "Admin only."}, status=status.HTTP_403_FORBIDDEN)

        from .services.user_service import score_staff_for_student
        student_id = request.query_params.get('student_id')
        return Response(score_staff_for_student(student_id))


class AIRecommendSpecialtyView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, student_id):
        return Response({
            "recommendation": "Speech Language Pathologist (75% Match)",
            "reasoning": "Based on the Parent Input, there are significant delays in expressive language milestones."
        })


class EnrollStudentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, student_id):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only Admins can enroll students."}, status=status.HTTP_403_FORBIDDEN)

        try:
            student = Student.objects.get(id=student_id)
            student.status = 'ENROLLED'
            student.save()
            return Response({"message": "Student successfully enrolled and set to Active."})
        except Student.DoesNotExist:
            return Response({"error": "Student not found."}, status=status.HTTP_404_NOT_FOUND)


class ArchiveStudentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, student_id):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only Admins can archive students."}, status=status.HTTP_403_FORBIDDEN)

        try:
            student = Student.objects.get(id=student_id)
            student.status = 'ARCHIVED'
            student.save()
            return Response({"message": "Student archived successfully."})
        except Student.DoesNotExist:
            return Response({"error": "Student not found."}, status=status.HTTP_404_NOT_FOUND)


# ─── AI Goals ────────────────────────────────────────────────────────────────

class AIGenerateGoalsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        return Response({
            "generated_goals": [
                {"goal": "Improve expressive language to 4-word sentences", "objective": "Child will use 4 words in 4/5 daily interactions.", "timeframe": "3 months"},
                {"goal": "Enhance fine motor skills for writing", "objective": "Child will accurately trace their name.", "timeframe": "6 months"}
            ],
            "recommended_activities": [
                "Practice tracing letters in sand.",
                "Use word correlation games during free play."
            ]
        }, status=status.HTTP_200_OK)

# ─── Report Generation ───────────────────────────────────────────────────────

class GenerateReportDraftView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.role != 'ADMIN':
            return Response({"error": "Only admins can generate reports."}, status=status.HTTP_403_FORBIDDEN)

        student_id = request.data.get('student_id')
        report_cycle_id = request.data.get('report_cycle_id')
        doc_type = request.data.get('document_type')

        if not all([student_id, report_cycle_id, doc_type]):
            return Response({"error": "student_id, report_cycle_id, and document_type are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            student = Student.objects.get(id=student_id)
            cycle = ReportCycle.objects.get(id=report_cycle_id)
        except (Student.DoesNotExist, ReportCycle.DoesNotExist):
            return Response({"error": "Student or Report Cycle not found."}, status=status.HTTP_404_NOT_FOUND)

        if doc_type == 'ASSESSMENT' and student.status not in ['ASSESSED', 'ENROLLED']:
            return Response({"error": "Cannot generate Assessment report. Student has not been fully assessed yet."}, status=status.HTTP_400_BAD_REQUEST)
        if doc_type in ['IEP', 'MONTHLY'] and student.status != 'ENROLLED':
            return Response({"error": f"Cannot generate {doc_type} report. Student is not active (enrolled)."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from .services.report_service import build_report_inputs, generate_draft_data
            inputs = build_report_inputs(student, cycle)
            draft_data = generate_draft_data(student, cycle, inputs, doc_type)
            return Response({"message": "Draft generated successfully.", "draft_data": draft_data}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": f"Failed to generate draft: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GenerateReportFinalView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.role != 'ADMIN':
            return Response({"error": "Only admins can generate reports."}, status=status.HTTP_403_FORBIDDEN)

        student_id = request.data.get('student_id')
        report_cycle_id = request.data.get('report_cycle_id')
        doc_type = request.data.get('document_type')
        draft_data = request.data.get('draft_data')

        if not all([student_id, report_cycle_id, doc_type, draft_data]):
            return Response({"error": "Missing required fields including draft_data."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            student = Student.objects.get(id=student_id)
            cycle = ReportCycle.objects.get(id=report_cycle_id)
        except (Student.DoesNotExist, ReportCycle.DoesNotExist):
            return Response({"error": "Student or Report Cycle not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            # Dispatch to Celery for async processing
            from .tasks import generate_report_final_task
            task = generate_report_final_task.delay(student_id, report_cycle_id, doc_type, draft_data)
            return Response({
                "message": f"{doc_type} report generation started.",
                "task_id": task.id,
            }, status=status.HTTP_202_ACCEPTED)
        except Exception as e:
            # Fallback to sync if Celery is unavailable
            try:
                from .services.report_service import generate_final_pdf
                doc = generate_final_pdf(student, cycle, doc_type, draft_data)
                file_url = request.build_absolute_uri(doc.file.url)
                return Response({
                    "message": f"{doc_type} report generated successfully.",
                    "file_url": file_url,
                }, status=status.HTTP_200_OK)
            except Exception as sync_err:
                return Response({"error": f"Failed to generate document: {str(sync_err)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# ─── Invitations ─────────────────────────────────────────────────────────────

class CreateInvitationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can invite users."}, status=status.HTTP_403_FORBIDDEN)

        serializer = InvitationSerializer(data=request.data)
        if serializer.is_valid():
            invitation = serializer.save()
            try:
                from .services.user_service import send_invitation_email
                send_invitation_email(invitation)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Invitation created but email failed: {e}")
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def get(self, request):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can view invitations."}, status=status.HTTP_403_FORBIDDEN)
        invitations = Invitation.objects.all().order_by('-created_at')
        serializer = InvitationSerializer(invitations, many=True)
        return Response(serializer.data)


class ManageInvitationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can delete invitations."}, status=status.HTTP_403_FORBIDDEN)

        from django.shortcuts import get_object_or_404
        invitation = get_object_or_404(Invitation, pk=pk)
        invitation.delete()
        return Response({"message": "Invitation deleted successfully."}, status=status.HTTP_204_NO_CONTENT)


class ResendInvitationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can resend invitations."}, status=status.HTTP_403_FORBIDDEN)

        from django.shortcuts import get_object_or_404
        invitation = get_object_or_404(Invitation, pk=pk)

        if invitation.is_used:
            return Response({"error": "This invitation has already been accepted."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from .services.user_service import resend_invitation
            new_invite = resend_invitation(invitation)
            from .serializers import InvitationSerializer
            return Response({
                "message": f"Invitation resent to {new_invite.email}.",
                "invitation": InvitationSerializer(new_invite).data,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": f"Failed to resend invitation: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AcceptInvitationView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        token = request.query_params.get('token')
        if not token:
            return Response({"error": "Token is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            invitation = Invitation.objects.get(token=token, is_used=False)
            from django.utils import timezone
            if invitation.expires_at < timezone.now():
                return Response({"error": "This invitation link has expired. Please contact your admin for a new one."}, status=status.HTTP_410_GONE)
            return Response({"email": invitation.email, "role": invitation.role, "expires_at": invitation.expires_at})
        except Invitation.DoesNotExist:
            return Response({"error": "Invalid or expired invitation token."}, status=status.HTTP_404_NOT_FOUND)

    def post(self, request):
        serializer = AcceptInvitationSerializer(data=request.data)
        if serializer.is_valid():
            token = serializer.validated_data['token']
            try:
                invitation = Invitation.objects.get(token=token, is_used=False)
            except Invitation.DoesNotExist:
                return Response({"error": "Invalid or expired invitation token."}, status=status.HTTP_400_BAD_REQUEST)

            from django.utils import timezone
            if invitation.expires_at < timezone.now():
                return Response({"error": "This invitation link has expired. Please contact your admin for a new one."}, status=status.HTTP_410_GONE)

            if User.objects.filter(email=invitation.email).exists():
                return Response({"error": "User with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

            from .services.user_service import create_invited_user
            user = create_invited_user(
                invitation,
                serializer.validated_data['password'],
                serializer.validated_data.get('first_name', ''),
                serializer.validated_data.get('last_name', ''),
                serializer.validated_data.get('phone_number', ''),
            )

            return Response({"message": "User registered successfully."}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# ─── SMS Verification ─────────────────────────────────────────────────────────

class SendVerificationSMSView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user

        if user.is_phone_verified:
            return Response({"error": "Phone number is already verified."}, status=status.HTTP_400_BAD_REQUEST)

        if not user.phone_number:
            # Account was created before the phone number field was added.
            # Return a special error code the frontend can use to show a helpful message.
            return Response(
                {"error": "no_phone_number", "detail": "No phone number is associated with your account. Please contact the administrator to update your information."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )

        import random
        from django.utils import timezone

        # Invalidate any previously issued codes for this user
        PhoneVerification.objects.filter(user=user, is_used=False).update(is_used=True)

        code = str(random.randint(100000, 999999))
        PhoneVerification.objects.create(
            user=user,
            code=code,
            expires_at=timezone.now() + timezone.timedelta(minutes=10)
        )

        from .services.sms_service import send_sms
        message = f"Your ARASE verification code is: {code}. It expires in 10 minutes."
        success = send_sms(user.phone_number, message)

        if success:
            return Response({"message": "Verification code sent.", "phone_number": user.phone_number})
        else:
            return Response({"error": "Failed to send SMS. Please try again later."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class VerifySMSView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        code = request.data.get('code')
        if not code:
            return Response({"error": "Code is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            verification = PhoneVerification.objects.get(user=user, code=code, is_used=False)
            if not verification.is_valid():
                return Response({"error": "Verification code has expired."}, status=status.HTTP_400_BAD_REQUEST)
            
            verification.is_used = True
            verification.save()

            user.is_phone_verified = True
            user.save()

            return Response({"message": "Phone number verified successfully."})
        except PhoneVerification.DoesNotExist:
            return Response({"error": "Invalid verification code."}, status=status.HTTP_400_BAD_REQUEST)

# ─── IEP Generation & Management ────────────────────────────────────────────

class GenerateIEPView(APIView):
    """POST: Generate a comprehensive IEP using Gemini AI."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can generate IEPs."}, status=status.HTTP_403_FORBIDDEN)

        student_id = request.data.get('student_id')
        report_cycle_id = request.data.get('report_cycle_id')

        if not student_id or not report_cycle_id:
            return Response({"error": "student_id and report_cycle_id are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            Student.objects.get(id=student_id)
            ReportCycle.objects.get(id=report_cycle_id)
        except (Student.DoesNotExist, ReportCycle.DoesNotExist):
            return Response({"error": "Student or Report Cycle not found."}, status=status.HTTP_404_NOT_FOUND)

        # Always run synchronously — Celery workers are not guaranteed on deployment.
        # Sync generation returns the doc.id immediately so the frontend can navigate.
        try:
            from .services.iep_service import run_iep_generation
            from .services.document_service import record_document_version
            doc, iep_data = run_iep_generation(student_id, report_cycle_id)
            record_document_version(doc, request.user, 'GENERATED')
            return Response({
                "message": "IEP generated successfully.",
                "iep_id": doc.id,
                "iep_data": iep_data,
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            return Response({"error": f"Failed to generate IEP: {str(e)}", "debug_traceback": tb}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class IEPDetailView(APIView):
    """GET: Retrieve IEP data. PATCH: Update fields."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            doc = GeneratedDocument.objects.select_related('student', 'report_cycle').get(id=pk, document_type='IEP')
        except GeneratedDocument.DoesNotExist:
            return Response({"error": "IEP not found."}, status=status.HTTP_404_NOT_FOUND)

        if request.user.role != 'ADMIN':
            from .models import StudentAccess
            if not StudentAccess.objects.filter(user=request.user, student=doc.student).exists():
                return Response({"error": "You do not have permission to view this document."}, status=status.HTTP_403_FORBIDDEN)
            if request.user.role == 'PARENT' and doc.status != 'FINAL':
                return Response({"error": "This document is not yet finalized."}, status=status.HTTP_403_FORBIDDEN)

        return Response({
            "id": doc.id,
            "student_id": doc.student_id,
            "student_name": f"{doc.student.first_name} {doc.student.last_name}",
            "report_cycle": {"start": str(doc.report_cycle.start_date), "end": str(doc.report_cycle.end_date)},
            "created_at": doc.created_at.isoformat(),
            "status": doc.status,
            "iep_data": doc.iep_data,
        })

    def patch(self, request, pk):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can edit IEPs."}, status=status.HTTP_403_FORBIDDEN)

        try:
            doc = GeneratedDocument.objects.get(id=pk, document_type='IEP')
        except GeneratedDocument.DoesNotExist:
            return Response({"error": "IEP not found."}, status=status.HTTP_404_NOT_FOUND)

        new_data = request.data.get('iep_data')
        new_status = request.data.get('status')
        if not new_data and not new_status:
            return Response({"error": "iep_data or status is required."}, status=status.HTTP_400_BAD_REQUEST)

        if new_data:
            doc.iep_data = new_data
        if new_status in [choice[0] for choice in GeneratedDocument.STATUS_CHOICES]:
            doc.status = new_status

        doc.save()
        
        # Record the version snapshot
        from .services.document_service import record_document_version
        action_label = 'FINALIZED' if new_status == 'FINAL' else 'EDITED_DRAFT'
        record_document_version(doc, request.user, action_label)

        return Response({"message": "IEP updated.", "iep_data": doc.iep_data, "status": doc.status})


class IEPDownloadView(APIView):
    """GET: Render the IEP JSON as a PDF and return for download."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        # Support both cookie auth and token query param
        token = request.GET.get('token')
        if not token:
            # Try cookie auth
            if not request.user or not request.user.is_authenticated:
                return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)
            user = request.user
        else:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            try:
                auth = JWTAuthentication()
                validated_token = auth.get_validated_token(token)
                user = auth.get_user(validated_token)
            except Exception:
                return Response({"detail": "Invalid or expired token."}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            doc = GeneratedDocument.objects.select_related('student', 'report_cycle').get(id=pk, document_type='IEP')
        except GeneratedDocument.DoesNotExist:
            return Response({"error": "IEP not found."}, status=status.HTTP_404_NOT_FOUND)

        if user.role != 'ADMIN':
            from .models import StudentAccess
            if not StudentAccess.objects.filter(user=user, student=doc.student).exists():
                return Response({"error": "You do not have permission to view this document."}, status=status.HTTP_403_FORBIDDEN)
            if user.role == 'PARENT' and doc.status != 'FINAL':
                return Response({"error": "This document is not yet finalized."}, status=status.HTTP_403_FORBIDDEN)

        from io import BytesIO
        from django.http import HttpResponse
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

        buffer = BytesIO()
        pdf = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=50, leftMargin=50, topMargin=50, bottomMargin=50)
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('TitleStyle', parent=styles['Heading1'], alignment=1, spaceAfter=20, fontSize=16)
        h2 = ParagraphStyle('H2', parent=styles['Heading2'], textColor=colors.HexColor("#1e40af"), spaceBefore=14, spaceAfter=6)
        h3 = ParagraphStyle('H3', parent=styles['Heading3'], spaceBefore=8, spaceAfter=4)
        normal = styles['Normal']

        elements = []
        iep = doc.iep_data
        student = doc.student

        elements.append(Paragraph("THERUNI – Comprehensive AI-Generated IEP", title_style))
        elements.append(Spacer(1, 10))

        # Section 1
        s1 = iep.get('section1_student_info', {})
        elements.append(Paragraph("Section 1 — Student Information", h2))
        for label, key in [("Student Name", "student_name"), ("Date of Birth", "date_of_birth"), ("Gender", "gender"), ("Grade/Level", "grade_level"), ("IEP Dates", None)]:
            if key:
                elements.append(Paragraph(f"<b>{label}:</b> {s1.get(key, 'N/A')}", normal))
            else:
                elements.append(Paragraph(f"<b>{label}:</b> {s1.get('iep_start_date', '')} to {s1.get('iep_end_date', '')}", normal))
        elements.append(Spacer(1, 8))

        # Section 2
        s2 = iep.get('section2_background', {})
        elements.append(Paragraph("Section 2 — Background & Developmental Summary", h2))
        for sub_label, sub_key in [("Developmental History", "developmental_history"), ("Classroom Functioning", "classroom_functioning"), ("Family Input Summary", "family_input_summary")]:
            elements.append(Paragraph(f"<b>{sub_label}</b>", h3))
            elements.append(Paragraph(str(s2.get(sub_key, 'N/A')), normal))
        elements.append(Spacer(1, 8))

        # Section 3
        s3 = iep.get('section3_strengths', {})
        elements.append(Paragraph("Section 3 — Strengths & Interests", h2))
        elements.append(Paragraph("<b>Strengths:</b> " + ", ".join(s3.get("strengths", [])), normal))
        elements.append(Paragraph("<b>Interests:</b> " + ", ".join(s3.get("interests", [])), normal))
        elements.append(Spacer(1, 8))

        # Section 4 — PLOP
        s4 = iep.get('section4_plop', {})
        elements.append(Paragraph("Section 4 — Present Levels of Performance (PLOP)", h2))
        domain_labels = {
            "communication_slp": "Communication (SLP)",
            "fine_motor_ot": "Fine Motor, Sensory & ADLs (OT)",
            "gross_motor_pt": "Gross Motor (PT)",
            "behavioral_psych": "Behavioral & Emotional (Psych)",
            "academic_sped": "Academic/Learning (SPED)",
            "adaptive_life_skills": "Adaptive & Life Skills",
        }
        for domain_key, domain_label in domain_labels.items():
            domain_data = s4.get(domain_key, {})
            if domain_data:
                elements.append(Paragraph(domain_label, h3))
                for field_key, field_val in domain_data.items():
                    elements.append(Paragraph(f"<b>{field_key.replace('_', ' ').title()}:</b> {field_val}", normal))
        elements.append(Spacer(1, 8))

        # Section 5 — LTG
        elements.append(Paragraph("Section 5 — Long-Term IEP Goals (1 Year)", h2))
        for ltg in iep.get('section5_ltg', []):
            elements.append(Paragraph(f"<b>{ltg.get('id', '')} – {ltg.get('domain', '')}:</b> {ltg.get('goal', '')}", normal))
            elements.append(Paragraph(f"<i>Aligned disciplines: {ltg.get('disciplines', '')}</i>", normal))
        elements.append(Spacer(1, 8))

        # Section 6 — STO
        elements.append(Paragraph("Section 6 — Short-Term Objectives (3–4 months)", h2))
        for sto in iep.get('section6_sto', []):
            elements.append(Paragraph(f"<b>Objective {sto.get('id', '')} ({sto.get('ltg_ref', '')}):</b> {sto.get('objective', '')}", normal))
            elements.append(Paragraph(f"Target: {sto.get('target_skill', '')} | Method: {sto.get('teaching_method', '')} | Criteria: {sto.get('success_criteria', '')} | Freq: {sto.get('frequency', '')} | By: {sto.get('responsible', '')}", normal))
            elements.append(Spacer(1, 4))
        elements.append(Spacer(1, 8))

        # Section 7
        s7 = iep.get('section7_accommodations', {})
        elements.append(Paragraph("Section 7 — Accommodations & Modifications", h2))
        elements.append(Paragraph("<b>Classroom:</b> " + ", ".join(s7.get("classroom", [])), normal))
        elements.append(Paragraph("<b>Learning Modifications:</b> " + ", ".join(s7.get("learning_modifications", [])), normal))
        elements.append(Paragraph("<b>Communication Supports:</b> " + ", ".join(s7.get("communication_supports", [])), normal))
        elements.append(Spacer(1, 8))

        # Section 8
        s8 = iep.get('section8_therapies', {})
        elements.append(Paragraph("Section 8 — Therapies & Intervention Plan", h2))
        for therapy_key, therapy_label in [("speech_therapy", "Speech Therapy"), ("occupational_therapy", "OT"), ("physical_therapy", "PT"), ("psychology", "Psychology"), ("sped_sessions", "SPED"), ("shadow_teacher", "Shadow Teacher")]:
            t = s8.get(therapy_key, {})
            if therapy_key == "shadow_teacher":
                elements.append(Paragraph(f"<b>{therapy_label}:</b> Hours: {t.get('hours', 'N/A')}", normal))
            else:
                elements.append(Paragraph(f"<b>{therapy_label}:</b> {t.get('frequency', 'N/A')} — {t.get('focus_areas', 'N/A')}", normal))
        elements.append(Spacer(1, 8))

        # Section 9
        s9 = iep.get('section9_home_program', {})
        elements.append(Paragraph("Section 9 — Home Program", h2))
        for hp_key, hp_label in [("speech_tasks", "Speech Tasks"), ("sensory_ot_tasks", "Sensory/OT Tasks"), ("behavioral_tasks", "Behavioral Tasks"), ("academic_tasks", "Academic Tasks")]:
            items = s9.get(hp_key, [])
            elements.append(Paragraph(f"<b>{hp_label}:</b>", normal))
            for item in items:
                elements.append(Paragraph(f"  • {item}", normal))

        pdf.build(elements)
        pdf_bytes = buffer.getvalue()
        buffer.close()

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{student.last_name}_{student.first_name}_IEP.pdf"'
        return response


# ─── Monthly Report Generation & Management ───────────────────────────────────

class GenerateMonthlyReportView(APIView):
    """POST: Generate a Monthly Progress Report using Gemini AI."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can generate reports."}, status=status.HTTP_403_FORBIDDEN)

        student_id = request.data.get('student_id')
        report_cycle_id = request.data.get('report_cycle_id')

        if not student_id or not report_cycle_id:
            return Response({"error": "student_id and report_cycle_id are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            Student.objects.get(id=student_id)
            ReportCycle.objects.get(id=report_cycle_id)
        except (Student.DoesNotExist, ReportCycle.DoesNotExist):
            return Response({"error": "Student or Report Cycle not found."}, status=status.HTTP_404_NOT_FOUND)

        # Always run synchronously — Celery workers are not guaranteed on deployment.
        try:
            from .services.iep_service import run_monthly_report_generation
            from .services.document_service import record_document_version
            doc, report_data = run_monthly_report_generation(student_id, report_cycle_id)
            record_document_version(doc, request.user, 'GENERATED')
            return Response({
                "message": "Monthly report generated successfully.",
                "report_id": doc.id,
                "report_data": report_data,
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"error": f"Failed to generate monthly report: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MonthlyReportDetailView(APIView):
    """GET: Retrieve monthly report data."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            doc = GeneratedDocument.objects.select_related('student', 'report_cycle').get(id=pk, document_type='MONTHLY')
        except GeneratedDocument.DoesNotExist:
            return Response({"error": "Monthly report not found."}, status=status.HTTP_404_NOT_FOUND)

        if request.user.role != 'ADMIN':
            from .models import StudentAccess
            if not StudentAccess.objects.filter(user=request.user, student=doc.student).exists():
                return Response({"error": "You do not have permission to view this document."}, status=status.HTTP_403_FORBIDDEN)
            if request.user.role == 'PARENT' and doc.status != 'FINAL':
                return Response({"error": "This document is not yet finalized."}, status=status.HTTP_403_FORBIDDEN)

        return Response({
            "id": doc.id,
            "student_id": doc.student_id,
            "student_name": f"{doc.student.first_name} {doc.student.last_name}",
            "report_cycle": {"start": str(doc.report_cycle.start_date), "end": str(doc.report_cycle.end_date)},
            "created_at": doc.created_at.isoformat(),
            "status": doc.status,
            "report_data": doc.iep_data,
        })

    def patch(self, request, pk):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can edit reports."}, status=status.HTTP_403_FORBIDDEN)

        try:
            doc = GeneratedDocument.objects.get(id=pk, document_type='MONTHLY')
        except GeneratedDocument.DoesNotExist:
            return Response({"error": "Monthly report not found."}, status=status.HTTP_404_NOT_FOUND)

        new_data = request.data.get('report_data')
        new_status = request.data.get('status')
        if not new_data and not new_status:
            return Response({"error": "report_data or status is required."}, status=status.HTTP_400_BAD_REQUEST)

        if new_data:
            doc.iep_data = new_data
        if new_status in [choice[0] for choice in GeneratedDocument.STATUS_CHOICES]:
            doc.status = new_status

        doc.save()

        # Record the version snapshot
        from .services.document_service import record_document_version
        action_label = 'FINALIZED' if new_status == 'FINAL' else 'EDITED_DRAFT'
        record_document_version(doc, request.user, action_label)

        # When finalizing, complete the cycle and notify parents
        if new_status == 'FINAL':
            try:
                from .services.cycle_service import complete_cycle
                complete_cycle(doc.report_cycle)
            except Exception:
                pass  # Don't block finalization if cycle update fails
            try:
                from .services.notification_service import notify_parent_report_finalized
                from .models import StudentAccess
                parents = StudentAccess.objects.filter(
                    student=doc.student, user__role='PARENT'
                ).select_related('user')
                for sa in parents:
                    notify_parent_report_finalized(sa.user, doc.student, doc.id)
            except Exception:
                pass  # Don't block finalization if notification fails

        return Response({"message": "Monthly Report updated.", "report_data": doc.iep_data, "status": doc.status})


class MonthlyReportDownloadView(APIView):
    """GET: Render the Monthly Report JSON as a PDF for download."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        # Support both cookie auth and token query param
        token = request.GET.get('token')
        if not token:
            if not request.user or not request.user.is_authenticated:
                return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)
            user = request.user
        else:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            try:
                auth = JWTAuthentication()
                validated_token = auth.get_validated_token(token)
                user = auth.get_user(validated_token)
            except Exception:
                return Response({"detail": "Invalid or expired token."}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            doc = GeneratedDocument.objects.select_related('student', 'report_cycle').get(id=pk, document_type='MONTHLY')
        except GeneratedDocument.DoesNotExist:
            return Response({"error": "Monthly report not found."}, status=status.HTTP_404_NOT_FOUND)

        if user.role != 'ADMIN':
            from .models import StudentAccess
            if not StudentAccess.objects.filter(user=user, student=doc.student).exists():
                return Response({"error": "You do not have permission to view this document."}, status=status.HTTP_403_FORBIDDEN)
            if user.role == 'PARENT' and doc.status != 'FINAL':
                return Response({"error": "This document is not yet finalized."}, status=status.HTTP_403_FORBIDDEN)

        from io import BytesIO
        from django.http import HttpResponse
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

        buffer = BytesIO()
        pdf = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=50, leftMargin=50, topMargin=50, bottomMargin=50)
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('TitleStyle', parent=styles['Heading1'], alignment=1, spaceAfter=20, fontSize=16)
        h2 = ParagraphStyle('H2', parent=styles['Heading2'], textColor=colors.HexColor("#1e40af"), spaceBefore=14, spaceAfter=6)
        h3 = ParagraphStyle('H3', parent=styles['Heading3'], spaceBefore=8, spaceAfter=4)
        normal = styles['Normal']

        elements = []
        report = doc.iep_data
        student = doc.student

        elements.append(Paragraph("THERUNI – Monthly Progress Report", title_style))
        elements.append(Spacer(1, 10))

        si = report.get('student_info', {})
        elements.append(Paragraph("Student Information", h2))
        elements.append(Paragraph(f"<b>Student Name:</b> {si.get('student_name', 'N/A')}", normal))
        elements.append(Paragraph(f"<b>Date of Birth:</b> {si.get('date_of_birth', 'N/A')}", normal))
        elements.append(Paragraph(f"<b>Grade/Level:</b> {si.get('grade_level', 'N/A')}", normal))
        elements.append(Paragraph(f"<b>Report Period:</b> {report.get('report_period', 'N/A')}", normal))
        elements.append(Spacer(1, 8))

        elements.append(Paragraph("Executive Summary", h2))
        elements.append(Paragraph(str(report.get('executive_summary', 'N/A')), normal))
        elements.append(Spacer(1, 8))

        progress_sections = [
            ("Communication Progress", "communication_progress"),
            ("Behavioral & Social Progress", "behavioral_social_progress"),
            ("Academic Progress", "academic_progress"),
            ("Motor & Sensory Progress", "motor_sensory_progress"),
            ("Daily Living & Independence", "daily_living_independence"),
        ]
        for section_title, section_key in progress_sections:
            section_data = report.get(section_key, {})
            if section_data:
                elements.append(Paragraph(section_title, h2))
                elements.append(Paragraph(str(section_data.get('summary', 'No data submitted this month.')), normal))
                highlights = section_data.get('highlights', [])
                if highlights:
                    elements.append(Paragraph("<b>Highlights:</b>", h3))
                    for h in highlights:
                        elements.append(Paragraph(f"  • {h}", normal))
                concerns = section_data.get('concerns', [])
                if concerns:
                    elements.append(Paragraph("<b>Concerns:</b>", h3))
                    for c in concerns:
                        elements.append(Paragraph(f"  • {c}", normal))
                elements.append(Spacer(1, 6))

        gas = report.get('goal_achievement_scores', [])
        if gas:
            elements.append(Paragraph("Goal Achievement Scores (GAS)", h2))
            table_data = [["Goal", "Domain", "Score (1–5)", "Notes"]]
            score_row_styles = []
            for row_idx, g in enumerate(gas, start=1):
                score = g.get('score', 0)
                try:
                    score_int = int(score)
                except (ValueError, TypeError):
                    score_int = 0
                score_label = {
                    5: "5 — Achieved", 4: "4 — Exceeds",
                    3: "3 — Expected", 2: "2 — Minimal", 1: "1 — No progress"
                }.get(score_int, str(score))
                table_data.append([
                    str(g.get('goal_id', '')),
                    str(g.get('domain', '')),
                    score_label,
                    str(g.get('note', '')),
                ])
                bg = (colors.HexColor("#dcfce7") if score_int >= 4
                      else colors.HexColor("#dbeafe") if score_int == 3
                      else colors.HexColor("#fef3c7") if score_int == 2
                      else colors.HexColor("#fee2e2") if score_int == 1
                      else colors.white)
                score_row_styles.append(('BACKGROUND', (2, row_idx), (2, row_idx), bg))

            t = Table(table_data, colWidths=[52, 130, 90, 208])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e40af")),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                *score_row_styles,
            ]))
            elements.append(t)
            elements.append(Spacer(1, 8))

        tss = report.get('therapy_session_summary', {})
        if tss:
            elements.append(Paragraph("Therapy Session Summary", h2))
            elements.append(Paragraph(f"<b>Discipline:</b> {tss.get('discipline', 'N/A')}", normal))
            elements.append(Paragraph(f"<b>Sessions Completed:</b> {tss.get('sessions_completed', 'N/A')}", normal))
            elements.append(Paragraph(f"<b>Attendance:</b> {tss.get('attendance', 'N/A')}", normal))
            if tss.get('key_progress'):
                elements.append(Paragraph(f"<b>Key Progress:</b> {tss.get('key_progress')}", normal))
            elements.append(Spacer(1, 8))

        po = report.get('parent_observations', {})
        if po:
            elements.append(Paragraph("Parent Observations", h2))
            elements.append(Paragraph(f"<b>Overall Comparison:</b> {po.get('overall_comparison', 'N/A')}", normal))
            for concern in po.get('top_concerns', []):
                elements.append(Paragraph(f"  • Concern: {concern}", normal))
            for goal in po.get('parent_goals', []):
                elements.append(Paragraph(f"  • Goal: {goal}", normal))
            elements.append(Spacer(1, 8))

        recs = report.get('recommendations', {})
        if recs:
            elements.append(Paragraph("Recommendations", h2))
            for rec in recs.get('classroom', []):
                elements.append(Paragraph(f"  • [Classroom] {rec}", normal))
            for rec in recs.get('home_program', []):
                elements.append(Paragraph(f"  • [Home] {rec}", normal))
            for rec in recs.get('therapy_adjustments', []):
                elements.append(Paragraph(f"  • [Therapy] {rec}", normal))
            elements.append(Spacer(1, 8))

        focus = report.get('next_month_focus_areas', [])
        if focus:
            elements.append(Paragraph("Next Month Focus Areas", h2))
            for item in focus:
                elements.append(Paragraph(f"  • {item}", normal))

        pdf.build(elements)
        pdf_bytes = buffer.getvalue()
        buffer.close()

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{student.last_name}_{student.first_name}_Monthly_Report.pdf"'
        return response

# ─── Audit Logs ─────────────────────────────────────────────────────────────

class DocumentHistoryView(APIView):
    """GET: Retrieve version history for a given document."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            doc = GeneratedDocument.objects.get(id=pk)
        except GeneratedDocument.DoesNotExist:
            return Response({"error": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        if request.user.role != 'ADMIN':
            from .models import StudentAccess
            if not StudentAccess.objects.filter(user=request.user, student=doc.student).exists():
                return Response({"error": "You do not have permission to view this document."}, status=status.HTTP_403_FORBIDDEN)
            if request.user.role == 'PARENT':
                return Response({"error": "Parents cannot view document audit history."}, status=status.HTTP_403_FORBIDDEN)

        versions = doc.versions.all().order_by('-created_at')
        history = []
        for v in versions:
            history.append({
                "id": v.id,
                "action": v.action,
                "edited_by": f"{v.edited_by.first_name} {v.edited_by.last_name}" if v.edited_by else "System",
                "status": v.status,
                "created_at": v.created_at.isoformat(),
            })
            
        return Response({"history": history})

# ─── Cycle Management ───────────────────────────────────────────────────────

class CreateCycleView(APIView):
    """POST: Manually create a new cycle for a student (admin fallback)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role != 'ADMIN':
            return Response({"error": "Admin only."}, status=status.HTTP_403_FORBIDDEN)

        student_id = request.data.get('student_id')
        if not student_id:
            return Response({"error": "student_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            student = Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            return Response({"error": "Student not found."}, status=status.HTTP_404_NOT_FOUND)

        from .services.cycle_service import ensure_current_cycle
        cycle = ensure_current_cycle(student)
        return Response({
            "message": f"Cycle '{cycle.label}' is active.",
            "cycle_id": cycle.id,
            "label": cycle.label,
            "start_date": str(cycle.start_date),
            "end_date": str(cycle.end_date),
            "status": cycle.status,
        }, status=status.HTTP_200_OK)


class SendRemindersView(APIView):
    """POST: Send tracker submission reminders to all users with missing trackers."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role != 'ADMIN':
            return Response({"error": "Admin only."}, status=status.HTTP_403_FORBIDDEN)

        from .services.notification_service import send_tracker_reminders_for_all_students
        sent_count = send_tracker_reminders_for_all_students()
        return Response({"message": f"Sent {sent_count} reminder(s).", "count": sent_count})

