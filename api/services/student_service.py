"""
Student-related business logic extracted from views.py.
"""

from datetime import date
from dateutil.relativedelta import relativedelta
from api.models import (
    Student, StudentAccess, ReportCycle,
    ParentAssessment, MultidisciplinaryAssessment, User, Invitation,
)
from api.specialties import normalize_specialty, validate_specialties
from rest_framework.exceptions import PermissionDenied, ValidationError


def create_student_with_invitation(student_data, parent_email):
    """
    Creates a student and an associated parent invitation.
    If the parent already has an account, grants access immediately.

    Returns: (student, invitation)
    """
    student = Student.objects.create(**student_data)

    invitation = Invitation.objects.create(
        email=parent_email,
        role='PARENT',
        student=student,
    )

    # Send the invitation email via Django's email system (routed to Mailpit in dev)
    try:
        from api.services.user_service import send_invitation_email
        send_invitation_email(invitation)
    except Exception as e:
        # Don't block student creation if email fails — log it instead
        import logging
        logging.getLogger(__name__).warning(f"Failed to send invitation email to {parent_email}: {e}")

    # If this parent already has an account, grant access now
    try:
        existing_parent = User.objects.get(email=parent_email, role='PARENT')
        StudentAccess.objects.get_or_create(user=existing_parent, student=student)
    except User.DoesNotExist:
        pass

    return student, invitation


def onboard_parent_student(user, student_data, form_data, student_id=None):
    """
    Handles parent onboarding — creates or updates a student profile
    and submits the parent assessment.

    Returns: (student, is_new)
    """
    first_name = student_data.get('first_name', '').strip().title()
    last_name = student_data.get('last_name', '').strip().title()
    dob = student_data.get('date_of_birth')
    grade = student_data.get('grade', '')

    if student_id:
        # Update existing student
        student = Student.objects.get(id=student_id)
        if not StudentAccess.objects.filter(user=user, student=student).exists():
            raise PermissionDenied("You do not have permission to update this student.")
        student.first_name = first_name
        student.last_name = last_name
        student.date_of_birth = dob
        student.grade = grade
        student.save()

        cycle = ReportCycle.objects.filter(student=student, is_active=True).first()
        if not cycle:
            today = date.today()
            cycle = ReportCycle.objects.create(
                student=student,
                start_date=today,
                end_date=today + relativedelta(months=6),
                is_active=True,
            )

        ParentAssessment.objects.update_or_create(
            student=student,
            report_cycle=cycle,
            defaults={'submitted_by': user, 'form_data': form_data},
        )
        return student, False
    else:
        # Create new student
        student = Student.objects.create(
            first_name=first_name,
            last_name=last_name,
            date_of_birth=dob,
            grade=grade,
            status='PENDING_ASSESSMENT',
        )
        StudentAccess.objects.create(user=user, student=student)

        today = date.today()
        cycle = ReportCycle.objects.create(
            student=student,
            start_date=today,
            end_date=today + relativedelta(months=6),
            is_active=True,
        )

        ParentAssessment.objects.create(
            student=student,
            report_cycle=cycle,
            submitted_by=user,
            form_data=form_data,
        )
        return student, True


def get_student_profile_data(student, user=None):
    """
    Aggregates all profile data for a student — cycle, form statuses,
    documents, parent info, and assigned staff.

    Returns: dict
    """
    from api.models import (
        MultidisciplinaryAssessment,
        ParentProgressTracker, MultidisciplinaryProgressTracker,
        SpedProgressTracker, GeneratedDocument, DiagnosticReport,
    )
    from api.services.cycle_service import (
        ensure_current_cycle, get_cycle_status_summary, get_previous_recommendations,
    )

    # Lazy-create monthly cycle for enrolled students
    if student.status == 'ENROLLED':
        cycle = ensure_current_cycle(student)
    else:
        cycle = ReportCycle.objects.filter(student=student, is_active=True).first()

    form_statuses = {
        "parent_assessment": {"submitted": False, "id": None},
        "multi_assessment": {"submitted": False, "id": None},
        "diagnostic_report": {"submitted": False, "id": None},
        "parent_tracker": {"submitted": False, "id": None},
        "multi_tracker": {"submitted": False, "id": None},
        "sped_tracker": {"submitted": False, "id": None},
    }
    cycle_data = None

    if cycle:
        cycle_data = {
            "id": cycle.id,
            "start_date": cycle.start_date,
            "end_date": cycle.end_date,
            "label": cycle.label or cycle.start_date.strftime("%B %Y"),
            "status": cycle.status,
        }
        form_map = {
            "parent_assessment": ParentAssessment,
            "multi_assessment": MultidisciplinaryAssessment,
            "parent_tracker": ParentProgressTracker,
            "multi_tracker": MultidisciplinaryProgressTracker,
            "sped_tracker": SpedProgressTracker,
        }
        for key, model in form_map.items():
            if user and user.role == 'PARENT' and key != 'parent_assessment':
                form_statuses[key] = {"submitted": False, "id": None}
                continue
            if key in ['parent_assessment', 'multi_assessment']:
                obj = model.objects.select_related('submitted_by').filter(student=student).order_by('-created_at').first()
            else:
                obj = model.objects.select_related('submitted_by').filter(student=student, report_cycle=cycle).first()
            submitted = bool(obj)
            submitted_at = obj.created_at if obj else None
            if key == 'multi_assessment' and obj:
                submitted = bool(obj.finalized_at)
                submitted_at = obj.finalized_at
            form_statuses[key] = {
                "submitted": submitted,
                "id": obj.id if obj else None,
                "submitted_at": submitted_at,
                "submitted_by": {
                    "id": obj.submitted_by.id,
                    "name": (
                        f"{obj.submitted_by.first_name} {obj.submitted_by.last_name}".strip()
                        or obj.submitted_by.email
                    ),
                    "role": obj.submitted_by.role,
                } if obj and obj.submitted_by else None,
            }

        # Diagnostic report (separate model, not cycle-scoped)
        diag = DiagnosticReport.objects.filter(student=student).order_by('-created_at').first()
        form_statuses["diagnostic_report"] = {
            "submitted": bool(diag),
            "id": diag.id if diag else None,
            "submitted_at": diag.created_at if diag else None,
            "original_filename": diag.original_filename if diag else None,
            "uploaded_by": {
                "id": diag.uploaded_by.id,
                "name": f"{diag.uploaded_by.first_name} {diag.uploaded_by.last_name}".strip() or diag.uploaded_by.email,
                "role": diag.uploaded_by.role,
            } if diag and diag.uploaded_by else None,
        }


    # Generated documents
    docs = GeneratedDocument.objects.filter(student=student).order_by('-created_at')
    docs_data = []
    for d in docs:
        if user and user.role == 'PARENT' and d.status != 'FINAL':
            continue
        docs_data.append({
            "id": d.id,
            "type": d.document_type,
            "file_url": d.file.url if d.file else "",
            "created_at": d.created_at,
            "status": d.status,
            "has_iep_data": bool(d.iep_data),
        })

    # Parent info (supports v2 format and legacy)
    parent_input = ParentAssessment.objects.filter(student=student).order_by('-created_at').first()
    parent_info = {}
    if parent_input and parent_input.form_data:
        fd = parent_input.form_data
        if 'v2' in fd:
            v2 = fd['v2']
            parent_info = {
                "gender": v2.get("gender", ""),
                "primary_language": v2.get("primary_language", []),
                "primary_language_other": v2.get("primary_language_other", ""),
                "medical_alerts": v2.get("medical_alerts", ""),
                "medical_alerts_detail": v2.get("medical_alerts_detail", ""),
                "known_conditions": v2.get("known_conditions", []),
                "known_conditions_other": v2.get("known_conditions_other", ""),
                "parent_guardian_name": v2.get("parent_name", ""),
                "parent_phone": v2.get("phone", ""),
                "parent_email": v2.get("email", ""),
            }
        else:
            parent_info = {
                "gender": fd.get("gender", ""),
                "primary_language": fd.get("primary_language", ""),
                "primary_language_other": fd.get("primary_language_other", ""),
                "medical_alerts": fd.get("medical_alerts", ""),
                "medical_alerts_detail": fd.get("medical_alerts_detail", ""),
                "known_conditions": fd.get("known_conditions", []),
                "known_conditions_other": fd.get("known_conditions_other", ""),
                "parent_guardian_name": fd.get("parent_guardian_name", ""),
                "parent_phone": fd.get("phone", ""),
                "parent_email": fd.get("email", ""),
            }

    # Assigned staff
    assigned_users = (
        StudentAccess.objects.filter(student=student)
        .select_related('user')
        .exclude(user__role='PARENT')
        .exclude(user__role='ADMIN')
    )
    assigned_staff = []
    if not (user and user.role == 'PARENT'):
        assigned_staff = [{
            "id": sa.user.id,
            "role": sa.user.role,
            "first_name": sa.user.first_name,
            "last_name": sa.user.last_name,
            "specialty": normalize_specialty(sa.specialty_list()[0] if sa.specialty_list() else sa.user.specialty),
            "specialties": [
                normalize_specialty(s) for s in sa.specialty_list() if s
            ],
        } for sa in assigned_users]

    # Cycle status summary and carry-forward recommendations
    cycle_status = get_cycle_status_summary(student, cycle) if cycle and student.status == 'ENROLLED' else None
    prev_recs = get_previous_recommendations(student) if student.status == 'ENROLLED' else None

    return {
        "student": {
            "id": student.id,
            "first_name": student.first_name,
            "last_name": student.last_name,
            "grade": student.grade,
            "date_of_birth": student.date_of_birth,
            "status": student.get_status_display(),
            **parent_info,
        },
        "active_cycle": cycle_data,
        "cycle_status": cycle_status,
        "previous_recommendations": prev_recs,
        "form_statuses": form_statuses,
        "generated_documents": docs_data,
        "assigned_staff": assigned_staff,
    }


def assign_staff_to_student(student_id, staff_id, expected_role, specialties=None):
    """
    Assigns a user (specialist/teacher/parent) to a student.

    Returns: (message, status_update_needed)
    """
    staff = User.objects.get(id=staff_id, role=expected_role)
    student = Student.objects.get(id=student_id)
    
    # ---------------------------------------------------------
    # WORKFLOW VALIDATION: Enforce sequential input progression
    # ---------------------------------------------------------
    if expected_role == 'SPECIALIST':
        # Must have Parent Assessment input before assigning Specialist
        has_parent_input = ParentAssessment.objects.filter(student=student).exists()
        if not has_parent_input:
            raise ValidationError("Cannot assign a Specialist until the Parent Assessment is submitted.")

        staff_specialties = {
            normalize_specialty(s) for s in staff.specialty_list() if s
        }
        try:
            assigned_specialties = validate_specialties(
                'SPECIALIST',
                specialties if specialties is not None else list(staff_specialties),
            )
        except ValueError as exc:
            raise ValidationError(str(exc))
        new_specialties = {normalize_specialty(s) for s in assigned_specialties if s}
        if not new_specialties:
            raise ValidationError("Select at least one specialist discipline to assign.")

        unsupported = new_specialties - staff_specialties
        if unsupported:
            raise ValidationError(
                f"Specialist does not have: {', '.join(sorted(unsupported))}."
            )

        # Enforce: only one specialist per assigned specialty per student.
        if new_specialties:
            already = (
                StudentAccess.objects
                .filter(student=student, user__role='SPECIALIST')
                .exclude(user_id=staff.id)
                .select_related('user')
            )
            covered = set()
            for sa in already:
                for s in sa.specialty_list():
                    if s:
                        covered.add(normalize_specialty(s))
            overlap = new_specialties & covered
            if overlap:
                raise ValidationError(
                    f"A specialist is already assigned for: {', '.join(sorted(overlap))}."
                )

    elif expected_role == 'TEACHER':
        # Teacher assignment is locked until the student is Enrolled
        if student.status != 'ENROLLED':
            raise ValidationError("Cannot assign a Teacher until the student is ENROLLED.")
            
    access, _ = StudentAccess.objects.get_or_create(user=staff, student=student)
    if expected_role == 'SPECIALIST':
        access.assigned_specialties = assigned_specialties
        access.save(update_fields=['assigned_specialties'])

    # Update student status based on assignment
    if expected_role == 'SPECIALIST' and student.status == 'PENDING_ASSESSMENT':
        student.status = 'ASSESSMENT_SCHEDULED'
        student.save()
    # Removed observation status update because teacher is assigned post-enrollment

    return staff, student


def unassign_staff_from_student(student_id, staff_id, specialty=None):
    """
    Unassigns a staff member from a student.
    If specialty is provided (for SPECIALIST), it removes only that specialty.
    If the specialist has no more specialties, or if it's a TEACHER, it removes the access entirely.
    """
    try:
        access = StudentAccess.objects.get(student_id=student_id, user_id=staff_id)
    except StudentAccess.DoesNotExist:
        return False
        
    if specialty and access.user.role == 'SPECIALIST':
        normalized_specialty = normalize_specialty(specialty)
        if normalized_specialty in access.assigned_specialties:
            access.assigned_specialties.remove(normalized_specialty)
            if not access.assigned_specialties:
                access.delete()
            else:
                access.save(update_fields=['assigned_specialties'])
            return True
        return False
        
    # If no specialty specified or it's a teacher, just delete the access
    access.delete()
    return True

