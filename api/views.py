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

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'ADMIN':
            return Student.objects.all()
        # Non-admins only see students they have access to
        return Student.objects.filter(assigned_users__user=user).distinct()

    def create(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can register students."}, status=status.HTTP_403_FORBIDDEN)

        parent_email = request.data.get('parent_email', None)
        if not parent_email:
            return Response({"error": "Parent email is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Build student data without parent_email
        student_data = {k: v for k, v in request.data.items() if k != 'parent_email'}
        serializer = self.get_serializer(data=student_data)
        serializer.is_valid(raise_exception=True)
        student = serializer.save()

        # Create or retrieve invitation for this parent email, linked to this student
        invitation = Invitation.objects.create(
            email=parent_email,
            role='PARENT',
            student=student
        )

        # If the parent already has an account, grant access immediately
        try:
            existing_parent = User.objects.get(email=parent_email, role='PARENT')
            from .models import StudentAccess
            StudentAccess.objects.get_or_create(user=existing_parent, student=student)
        except User.DoesNotExist:
            pass  # Parent hasn't registered yet; access granted on invite acceptance

        headers = self.get_success_headers(serializer.data)
        response_data = serializer.data
        response_data['invitation_token'] = str(invitation.token)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

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
        # Specialists and teachers can read parent assessments for their assigned students
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

class ParentOnboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.role != 'PARENT':
            return Response({"error": "Only parents can use the onboarding endpoint."}, status=status.HTTP_403_FORBIDDEN)
        
        # Expecting student dict and form_data dict
        student_data = request.data.get('student', {})
        form_data = request.data.get('form_data', {})
        
        first_name = student_data.get('first_name')
        last_name = student_data.get('last_name')
        dob = student_data.get('date_of_birth')
        grade = student_data.get('grade')
        
        student_id = request.data.get('student_id')

        if not all([first_name, last_name, dob, grade]):
            return Response({"error": "Missing required student information."}, status=status.HTTP_400_BAD_REQUEST)
            
        from datetime import date
        from dateutil.relativedelta import relativedelta
        import datetime
        from .models import StudentAccess
        
        try:
            if student_id:
                # Update existing student
                student = Student.objects.get(id=student_id)
                student.first_name = first_name
                student.last_name = last_name
                student.date_of_birth = dob
                student.grade = grade
                # If they were pending assessment, moving them forward is handled elsewhere or kept as is
                student.save()
                
                # Ensure parent has access
                StudentAccess.objects.get_or_create(user=user, student=student)
                
                # Get or create active cycle
                cycle = ReportCycle.objects.filter(student=student, is_active=True).first()
                if not cycle:
                    today = date.today()
                    end_date = today + relativedelta(months=6)
                    cycle = ReportCycle.objects.create(
                        student=student,
                        start_date=today,
                        end_date=end_date,
                        is_active=True
                    )
                    
                # Update or create the assessment for this cycle
                parent_assessment, created = ParentAssessment.objects.update_or_create(
                    student=student,
                    report_cycle=cycle,
                    defaults={
                        'submitted_by': user,
                        'form_data': form_data
                    }
                )
                
                return Response({
                    "message": "Student profile updated and input submitted successfully.",
                    "student_id": student.id
                }, status=status.HTTP_200_OK)

            else:
                # Create NEW Student
                student = Student.objects.create(
                    first_name=first_name,
                    last_name=last_name,
                    date_of_birth=dob,
                    grade=grade,
                    status='PENDING_ASSESSMENT'
                )
                
                # Map Parent to Student
                StudentAccess.objects.create(user=user, student=student)
                
                # Create a 6-month Report Cycle starting today
                today = date.today()
                end_date = today + relativedelta(months=6)
                cycle = ReportCycle.objects.create(
                    student=student,
                    start_date=today,
                    end_date=end_date,
                    is_active=True
                )
                
                # Create Parent Assessment
                parent_assessment = ParentAssessment.objects.create(
                    student=student,
                    report_cycle=cycle,
                    submitted_by=user,
                    form_data=form_data
                )
                
                return Response({
                    "message": "Student profile created and initial input submitted successfully.",
                    "student_id": student.id
                }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class StudentProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, student_id):
        # 1. Fetch Student. Verify the user has access.
        try:
            if request.user.role == 'ADMIN':
                student = Student.objects.get(id=student_id)
            else:
                student = Student.objects.get(id=student_id, assigned_users__user=request.user)
        except Student.DoesNotExist:
            return Response({"error": "Student not found or access denied."}, status=status.HTTP_404_NOT_FOUND)

        # 2. Get active ReportCycle
        from .models import ReportCycle, GeneratedDocument
        cycle = ReportCycle.objects.filter(student=student, is_active=True).first()
        
        cycle_data = None
        form_statuses = {
            "parent_assessment": {"submitted": False, "id": None},
            "multi_assessment": {"submitted": False, "id": None},
            "sped_assessment": {"submitted": False, "id": None},
            "parent_tracker": {"submitted": False, "id": None},
            "multi_tracker": {"submitted": False, "id": None},
            "sped_tracker": {"submitted": False, "id": None}
        }
        
        if cycle:
            cycle_data = {
                "id": cycle.id,
                "start_date": cycle.start_date,
                "end_date": cycle.end_date
            }
            pa = ParentAssessment.objects.filter(student=student, report_cycle=cycle).first()
            form_statuses["parent_assessment"] = {"submitted": bool(pa), "id": pa.id if pa else None}
            
            ma = MultidisciplinaryAssessment.objects.filter(student=student, report_cycle=cycle).first()
            form_statuses["multi_assessment"] = {"submitted": bool(ma), "id": ma.id if ma else None}
            
            sa = SpedAssessment.objects.filter(student=student, report_cycle=cycle).first()
            form_statuses["sped_assessment"] = {"submitted": bool(sa), "id": sa.id if sa else None}
            
            pt = ParentProgressTracker.objects.filter(student=student, report_cycle=cycle).first()
            form_statuses["parent_tracker"] = {"submitted": bool(pt), "id": pt.id if pt else None}
            
            mt = MultidisciplinaryProgressTracker.objects.filter(student=student, report_cycle=cycle).first()
            form_statuses["multi_tracker"] = {"submitted": bool(mt), "id": mt.id if mt else None}
            
            st = SpedProgressTracker.objects.filter(student=student, report_cycle=cycle).first()
            form_statuses["sped_tracker"] = {"submitted": bool(st), "id": st.id if st else None}

        # 3. Get Generated Documents
        docs = GeneratedDocument.objects.filter(student=student).order_by('-created_at')
        docs_data = [{"id": d.id, "type": d.document_type, "file_url": d.file.url if d.file else "", "created_at": d.created_at, "has_iep_data": bool(d.iep_data)} for d in docs]

        # 4. Get Parent Input Info (supports new v2 format and old flat format)
        parent_input = ParentAssessment.objects.filter(student=student).order_by('-created_at').first()
        parent_info = {}
        if parent_input and parent_input.form_data:
            fd = parent_input.form_data
            # New v2 format: all data nested under 'v2'
            if 'v2' in fd:
                v2 = fd['v2']
                parent_info = {
                    "gender": v2.get("gender", ""),
                    "primary_language": v2.get("primary_language", []),
                    "parent_guardian_name": v2.get("parent_name", "")
                }
            else:
                # Legacy flat format
                parent_info = {
                    "gender": fd.get("gender", ""),
                    "primary_language": fd.get("primary_language", ""),
                    "parent_guardian_name": fd.get("parent_guardian_name", "")
                }

        # 5. Get already-assigned staff for this student
        from .models import StudentAccess
        assigned_users = StudentAccess.objects.filter(student=student).select_related('user').exclude(user__role='PARENT').exclude(user__role='ADMIN')
        assigned_staff = [
            {"id": sa.user.id, "role": sa.user.role}
            for sa in assigned_users
        ]

        return Response({
            "student": {
                "id": student.id,
                "first_name": student.first_name,
                "last_name": student.last_name,
                "grade": student.grade,
                "date_of_birth": student.date_of_birth,
                "status": student.get_status_display(),
                **parent_info
            },
            "active_cycle": cycle_data,
            "form_statuses": form_statuses,
            "generated_documents": docs_data,
            "assigned_staff": assigned_staff
        })

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
            from .models import User, StudentAccess
            specialist = User.objects.get(id=specialist_id, role='SPECIALIST')
            student = Student.objects.get(id=student_id)
            
            # Grant access
            StudentAccess.objects.get_or_create(user=specialist, student=student)
            
            student.status = 'ASSESSMENT_SCHEDULED'
            student.save()
            return Response({"message": f"Specialist {specialist.username} assigned."})
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
            from .models import User, StudentAccess
            teacher = User.objects.get(id=teacher_id, role='TEACHER')
            student = Student.objects.get(id=student_id)
            
            # Grant access
            StudentAccess.objects.get_or_create(user=teacher, student=student)
            
            return Response({"message": f"Teacher {teacher.username} assigned to {student.first_name}."})
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
            from .models import User, StudentAccess
            parent = User.objects.get(id=parent_id, role='PARENT')
            student = Student.objects.get(id=student_id)
            
            # Grant access
            StudentAccess.objects.get_or_create(user=parent, student=student)
            
            return Response({"message": f"Parent {parent.username} assigned to {student.first_name}."})
        except (User.DoesNotExist, Student.DoesNotExist):
            return Response({"error": "Parent or Student not found."}, status=status.HTTP_404_NOT_FOUND)

class StaffListView(APIView):
    """Returns all specialists and teachers with caseload, specialty, and best-match recommendation."""
    permission_classes = [permissions.IsAuthenticated]

    # Maps concern/condition keywords → specialty keywords to match against staff specialty field
    CONCERN_SPECIALTY = {
        "communication": ["speech", "language", "slp"],
        "speech":        ["speech", "language", "slp"],
        "motor":         ["occupational", "ot", "physical", "motor"],
        "motor skills":  ["occupational", "ot", "physical", "motor"],
        "sensory":       ["occupational", "ot", "sensory"],
        "behavior":      ["behavioral", "aba", "behavior", "applied"],
        "emotions":      ["behavioral", "aba", "psychology", "counseling"],
        "social":        ["behavioral", "social", "autism", "aba"],
        "autism":        ["autism", "aba", "behavioral"],
        "adhd":          ["adhd", "behavioral", "executive"],
        "learning":      ["learning", "sped", "academic", "education"],
        "daily living":  ["occupational", "ot", "life skills"],
        "safety":        ["behavioral", "aba"],
    }

    def _score_specialty(self, staff_specialty, concerns):
        specialty_lower = staff_specialty.lower()
        score = 0
        for concern in concerns:
            keywords = self.CONCERN_SPECIALTY.get(concern.lower(), [])
            for kw in keywords:
                if kw in specialty_lower:
                    score += 2
                    break
        return score

    def get(self, request):
        if request.user.role != 'ADMIN':
            return Response({"error": "Admin only."}, status=status.HTTP_403_FORBIDDEN)

        from django.db.models import Count

        student_id = request.query_params.get('student_id')
        concerns = []

        if student_id:
            try:
                student = Student.objects.get(id=student_id)
                pa = ParentAssessment.objects.filter(student=student).order_by('-created_at').first()
                if pa and pa.form_data:
                    fd = pa.form_data
                    v2 = fd.get('v2', {})
                    if v2:
                        concerns = (
                            v2.get('areas_of_concern', []) +
                            v2.get('primary_concerns', []) +
                            v2.get('known_conditions', [])
                        )
                    else:
                        concerns = fd.get('areas_of_concern', [])
            except Student.DoesNotExist:
                pass

        staff_qs = User.objects.filter(role__in=['SPECIALIST', 'TEACHER']).annotate(
            caseload=Count('student_access', distinct=True)
        ).order_by('role', 'first_name')

        # Score each staff member
        scored = []
        for u in staff_qs:
            specialty_score = self._score_specialty(u.specialty, concerns) if concerns else 0
            combined = (specialty_score * 3) - u.caseload
            scored.append((combined, u))

        # Find best id per role
        best_by_role = {}
        for combined, u in scored:
            if u.role not in best_by_role or combined > best_by_role[u.role][0]:
                best_by_role[u.role] = (combined, u.id)

        result = []
        for combined, u in scored:
            is_recommended = best_by_role.get(u.role, (None, None))[1] == u.id
            result.append({
                "id": u.id,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "email": u.email,
                "username": u.username,
                "role": u.role,
                "specialty": u.specialty,
                "caseload": u.caseload,
                "recommended": is_recommended,
            })

        return Response(result)

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
            
        from .models import ReportCycle, Student
        from .document_extractor import extract_assessment_draft, extract_iep_draft, extract_weekly_draft
        
        try:
            student = Student.objects.get(id=student_id)
            cycle = ReportCycle.objects.get(id=report_cycle_id)
        except (Student.DoesNotExist, ReportCycle.DoesNotExist):
            return Response({"error": "Student or Report Cycle not found."}, status=status.HTTP_404_NOT_FOUND)
            
        if doc_type == 'ASSESSMENT' and student.status not in ['ASSESSED', 'ENROLLED']:
            return Response({"error": "Cannot generate Assessment report. Student has not been fully assessed yet."}, status=status.HTTP_400_BAD_REQUEST)
            
        if doc_type in ['IEP', 'WEEKLY'] and student.status != 'ENROLLED':
            return Response({"error": f"Cannot generate {doc_type} report. Student is not enrolled."}, status=status.HTTP_400_BAD_REQUEST)
            
        inputs = {
            'parent_assessment': ParentAssessment.objects.filter(student=student, report_cycle=cycle).first(),
            'multi_assessment': MultidisciplinaryAssessment.objects.filter(student=student, report_cycle=cycle).first(),
            'sped_assessment': SpedAssessment.objects.filter(student=student, report_cycle=cycle).first(),
            'parent_tracker': ParentProgressTracker.objects.filter(student=student, report_cycle=cycle).first(),
            'multi_tracker': MultidisciplinaryProgressTracker.objects.filter(student=student, report_cycle=cycle).first(),
            'sped_tracker': SpedProgressTracker.objects.filter(student=student, report_cycle=cycle).first(),
        }
        
        try:
            draft_data = {}
            if doc_type == 'ASSESSMENT':
                draft_data = extract_assessment_draft(student, cycle, inputs)
            elif doc_type == 'IEP':
                draft_data = extract_iep_draft(student, cycle, inputs)
            elif doc_type == 'WEEKLY':
                draft_data = extract_weekly_draft(student, cycle, inputs)
                
            return Response({
                "message": "Draft generated successfully.", 
                "draft_data": draft_data
            }, status=status.HTTP_200_OK)
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
            
        from .document_generator import generate_pdf_from_draft
        from .models import GeneratedDocument, ReportCycle, Student
        
        try:
            student = Student.objects.get(id=student_id)
            cycle = ReportCycle.objects.get(id=report_cycle_id)
        except (Student.DoesNotExist, ReportCycle.DoesNotExist):
            return Response({"error": "Student or Report Cycle not found."}, status=status.HTTP_404_NOT_FOUND)
            
        try:
            filename = f"{student.last_name}_{student.first_name}_{doc_type}_{cycle.start_date}.pdf"
            file_name, file_content = generate_pdf_from_draft(student, cycle, draft_data, filename)
            
            doc = GeneratedDocument.objects.create(
                student=student,
                report_cycle=cycle,
                document_type=doc_type,
            )
            doc.file.save(file_name, file_content)
            
            request_url = request.build_absolute_uri(doc.file.url)
            return Response({"message": f"{doc_type} report generation triggered successfully.", "file_url": request_url}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": f"Failed to generate document: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class CreateInvitationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can invite users."}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = InvitationSerializer(data=request.data)
        if serializer.is_valid():
            invitation = serializer.save()
            # In a real app, send an email here with the generated link:
            # e.g., f"http://localhost:5173/invite/{invitation.token}"
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

            # Create user
            if User.objects.filter(email=invitation.email).exists():
                return Response({"error": "User with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

            user = User.objects.create_user(
                username=invitation.email,
                email=invitation.email,
                password=serializer.validated_data['password'],
                first_name=serializer.validated_data['first_name'],
                last_name=serializer.validated_data['last_name'],
                role=invitation.role
            )

            # Mark invitation as used
            invitation.is_used = True
            invitation.save()

            # Auto-link parent to all students registered under their email
            if invitation.role == 'PARENT':
                from .models import StudentAccess
                linked_students = Student.objects.filter(
                    invitations__email=invitation.email,
                    invitations__is_used=True
                ).distinct()
                for student in linked_students:
                    StudentAccess.objects.get_or_create(user=user, student=student)

            return Response({"message": "User registered successfully."}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ──────────────────────────────────────────────────────────────────────────────
# IEP Generation & Management
# ──────────────────────────────────────────────────────────────────────────────

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
            student = Student.objects.get(id=student_id)
            cycle = ReportCycle.objects.get(id=report_cycle_id)
        except (Student.DoesNotExist, ReportCycle.DoesNotExist):
            return Response({"error": "Student or Report Cycle not found."}, status=status.HTTP_404_NOT_FOUND)

        # Collect form inputs
        inputs = {
            'parent_assessment': ParentAssessment.objects.filter(student=student, report_cycle=cycle).first(),
            'multi_assessment': MultidisciplinaryAssessment.objects.filter(student=student, report_cycle=cycle).first(),
            'sped_assessment': SpedAssessment.objects.filter(student=student, report_cycle=cycle).first(),
        }

        try:
            from .iep_generator import generate_iep
            iep_data = generate_iep(student, cycle, inputs)

            # Save to GeneratedDocument
            doc = GeneratedDocument.objects.create(
                student=student,
                report_cycle=cycle,
                document_type='IEP',
                iep_data=iep_data,
            )

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
        token = request.GET.get('token')
        if not token:
            return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)
        
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
        bold = ParagraphStyle('Bold', parent=normal, fontName='Helvetica-Bold')

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
