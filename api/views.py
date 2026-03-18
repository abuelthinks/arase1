"""
API Views — thin orchestrators.
Business logic lives in api/services/*.
"""

from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import (
    Student, ReportCycle, GeneratedDocument,
    ParentAssessment, MultidisciplinaryAssessment, SpedAssessment,
    ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker,
    User, Invitation
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

    def get_queryset(self):
        user = self.request.user
        if user.role == 'ADMIN':
            return self.queryset
        return self.queryset.filter(submitted_by=user)


class ParentAssessmentViewSet(BaseInputViewSet):
    queryset = ParentAssessment.objects.all()
    serializer_class = ParentAssessmentSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == 'ADMIN':
            return self.queryset
        if user.role == 'PARENT':
            return self.queryset.filter(submitted_by=user)
        from .models import StudentAccess
        assigned_student_ids = StudentAccess.objects.filter(user=user).values_list('student_id', flat=True)
        return self.queryset.filter(student_id__in=assigned_student_ids)


class MultidisciplinaryAssessmentViewSet(BaseInputViewSet):
    queryset = MultidisciplinaryAssessment.objects.all()
    serializer_class = MultidisciplinaryAssessmentSerializer

    def perform_create(self, serializer):
        instance = serializer.save(submitted_by=self.request.user)
        student = instance.student
        if student.status in ['PENDING_ASSESSMENT', 'ASSESSMENT_SCHEDULED']:
            student.status = 'ASSESSED'
            student.save()


class SpedAssessmentViewSet(BaseInputViewSet):
    queryset = SpedAssessment.objects.all()
    serializer_class = SpedAssessmentSerializer


class ParentProgressTrackerViewSet(BaseInputViewSet):
    queryset = ParentProgressTracker.objects.all()
    serializer_class = ParentProgressTrackerSerializer


class MultidisciplinaryProgressTrackerViewSet(BaseInputViewSet):
    queryset = MultidisciplinaryProgressTracker.objects.all()
    serializer_class = MultidisciplinaryProgressTrackerSerializer


class SpedProgressTrackerViewSet(BaseInputViewSet):
    queryset = SpedProgressTracker.objects.all()
    serializer_class = SpedProgressTrackerSerializer

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
        return Response(get_student_profile_data(student))

# ─── Student Actions ─────────────────────────────────────────────────────────

class RequestAssessmentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, student_id):
        try:
            student = Student.objects.get(id=student_id, assigned_users__user=request.user)
            student.status = 'ASSESSMENT_REQUESTED'
            student.save()
            return Response({"message": "Assessment requested successfully."})
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
            return Response({"message": "Student successfully enrolled."})
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
        if doc_type in ['IEP', 'WEEKLY'] and student.status != 'ENROLLED':
            return Response({"error": f"Cannot generate {doc_type} report. Student is not enrolled."}, status=status.HTTP_400_BAD_REQUEST)

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


class AcceptInvitationView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = AcceptInvitationSerializer(data=request.data)
        if serializer.is_valid():
            token = serializer.validated_data['token']
            try:
                invitation = Invitation.objects.get(token=token, is_used=False)
            except Invitation.DoesNotExist:
                return Response({"error": "Invalid or expired invitation token."}, status=status.HTTP_400_BAD_REQUEST)

            if User.objects.filter(email=invitation.email).exists():
                return Response({"error": "User with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

            from .services.user_service import create_invited_user
            user = create_invited_user(
                invitation,
                serializer.validated_data['password'],
                serializer.validated_data['first_name'],
                serializer.validated_data['last_name'],
            )

            return Response({"message": "User registered successfully."}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


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

        try:
            # Try async via Celery
            from .tasks import generate_iep_task
            task = generate_iep_task.delay(student_id, report_cycle_id)
            return Response({
                "message": "IEP generation started.",
                "task_id": task.id,
            }, status=status.HTTP_202_ACCEPTED)
        except Exception:
            # Fallback to sync if Celery is unavailable
            try:
                from .services.iep_service import run_iep_generation
                doc, iep_data = run_iep_generation(student_id, report_cycle_id)
                return Response({
                    "message": "IEP generated successfully.",
                    "iep_id": doc.id,
                    "iep_data": iep_data,
                }, status=status.HTTP_201_CREATED)
            except Exception as e:
                import traceback
                traceback.print_exc()
                return Response({"error": f"Failed to generate IEP: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class IEPDetailView(APIView):
    """GET: Retrieve IEP data. PATCH: Update fields."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            doc = GeneratedDocument.objects.select_related('student', 'report_cycle').get(id=pk, document_type='IEP')
        except GeneratedDocument.DoesNotExist:
            return Response({"error": "IEP not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "id": doc.id,
            "student_id": doc.student_id,
            "student_name": f"{doc.student.first_name} {doc.student.last_name}",
            "report_cycle": {"start": str(doc.report_cycle.start_date), "end": str(doc.report_cycle.end_date)},
            "created_at": doc.created_at.isoformat(),
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
        if not new_data:
            return Response({"error": "iep_data is required."}, status=status.HTTP_400_BAD_REQUEST)

        doc.iep_data = new_data
        doc.save()
        return Response({"message": "IEP updated.", "iep_data": doc.iep_data})


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


# ─── Weekly Report Generation & Management ───────────────────────────────────

class GenerateWeeklyReportView(APIView):
    """POST: Generate a Weekly Progress Report using Gemini AI."""
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

        try:
            # Try async via Celery
            from .tasks import generate_weekly_report_task
            task = generate_weekly_report_task.delay(student_id, report_cycle_id)
            return Response({
                "message": "Weekly report generation started.",
                "task_id": task.id,
            }, status=status.HTTP_202_ACCEPTED)
        except Exception:
            # Fallback to sync
            try:
                from .services.iep_service import run_weekly_report_generation
                doc, report_data = run_weekly_report_generation(student_id, report_cycle_id)
                return Response({
                    "message": "Weekly report generated successfully.",
                    "report_id": doc.id,
                    "report_data": report_data,
                }, status=status.HTTP_201_CREATED)
            except Exception as e:
                import traceback
                traceback.print_exc()
                return Response({"error": f"Failed to generate weekly report: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class WeeklyReportDetailView(APIView):
    """GET: Retrieve weekly report data."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            doc = GeneratedDocument.objects.select_related('student', 'report_cycle').get(id=pk, document_type='WEEKLY')
        except GeneratedDocument.DoesNotExist:
            return Response({"error": "Weekly report not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "id": doc.id,
            "student_id": doc.student_id,
            "student_name": f"{doc.student.first_name} {doc.student.last_name}",
            "report_cycle": {"start": str(doc.report_cycle.start_date), "end": str(doc.report_cycle.end_date)},
            "created_at": doc.created_at.isoformat(),
            "report_data": doc.iep_data,
        })


class WeeklyReportDownloadView(APIView):
    """GET: Render the Weekly Report JSON as a PDF for download."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        # Support both cookie auth and token query param
        token = request.GET.get('token')
        if not token:
            if not request.user or not request.user.is_authenticated:
                return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)
        else:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            try:
                auth = JWTAuthentication()
                validated_token = auth.get_validated_token(token)
                user = auth.get_user(validated_token)
            except Exception:
                return Response({"detail": "Invalid or expired token."}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            doc = GeneratedDocument.objects.select_related('student', 'report_cycle').get(id=pk, document_type='WEEKLY')
        except GeneratedDocument.DoesNotExist:
            return Response({"error": "Weekly report not found."}, status=status.HTTP_404_NOT_FOUND)

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

        elements.append(Paragraph("THERUNI – Weekly Progress Report", title_style))
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
                elements.append(Paragraph(str(section_data.get('summary', 'No data submitted this week.')), normal))
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
            table_data = [["Goal", "Domain", "Score", "Notes"]]
            for g in gas:
                table_data.append([str(g.get('goal_id', '')), str(g.get('domain', '')), str(g.get('score', '')), str(g.get('note', ''))])
            t = Table(table_data, colWidths=[60, 120, 50, 250])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#dbeafe")),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#1e40af")),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]))
            elements.append(t)
            elements.append(Spacer(1, 8))

        tss = report.get('therapy_session_summary', {})
        if tss:
            elements.append(Paragraph("Therapy Session Summary", h2))
            elements.append(Paragraph(f"<b>Discipline:</b> {tss.get('discipline', 'N/A')}", normal))
            elements.append(Paragraph(f"<b>Sessions Completed:</b> {tss.get('sessions_completed', 'N/A')}", normal))
            elements.append(Paragraph(f"<b>Attendance:</b> {tss.get('attendance', 'N/A')}", normal))
            elements.append(Paragraph(f"<b>Key Progress:</b> {tss.get('key_progress', 'N/A')}", normal))
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

        focus = report.get('next_week_focus_areas', [])
        if focus:
            elements.append(Paragraph("Next Week Focus Areas", h2))
            for item in focus:
                elements.append(Paragraph(f"  • {item}", normal))

        pdf.build(elements)
        pdf_bytes = buffer.getvalue()
        buffer.close()

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{student.last_name}_{student.first_name}_Weekly_Report.pdf"'
        return response
