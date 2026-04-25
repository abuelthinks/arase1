"""
User/invitation business logic extracted from views.py.
"""

from api.models import User, Invitation, Student, StudentAccess
from api.specialties import (
    APPLIED_BEHAVIOR_ANALYSIS,
    DEVELOPMENTAL_PSYCHOLOGY,
    OCCUPATIONAL_THERAPY,
    PHYSICAL_THERAPY,
    SPEECH_LANGUAGE_PATHOLOGY,
    normalize_specialty,
)


def send_invitation_email(invitation):
    """
    Sends an HTML invitation email to the invitee via Django's email system.
    In dev this is routed to Mailpit; in production swap EMAIL_HOST settings.
    """
    from django.core.mail import EmailMultiAlternatives
    from django.conf import settings

    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    invite_link = f"{frontend_url}/invite/{invitation.token}"
    expires_at = invitation.expires_at.strftime("%B %d, %Y at %I:%M %p")

    subject = "You've been invited to ARASE"

    text_body = (
        f"Hello,\n\n"
        f"You have been invited to join ARASE as a {invitation.role.title()}.\n\n"
        f"Click the link below to set up your account (expires {expires_at}):\n"
        f"{invite_link}\n\n"
        f"If you did not expect this invitation, you can safely ignore this email.\n\n"
        f"— The ARASE Team"
    )

    html_body = f"""
    <div style="font-family: Inter, Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f8fafc; padding: 32px; border-radius: 12px;">
      <div style="background: white; border-radius: 10px; padding: 32px; border: 1px solid #e2e8f0;">
        <h1 style="margin: 0 0 8px 0; font-size: 1.5rem; color: #1e293b;">You're invited to ARASE 🎉</h1>
        <p style="color: #64748b; margin: 0 0 24px 0;">You have been invited to join as a <strong>{invitation.role.title()}</strong>.</p>

        <a href="{invite_link}"
           style="display: inline-block; background: #2563eb; color: white; padding: 12px 28px;
                  border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 1rem;">
          Set Up My Account
        </a>

        <p style="margin: 24px 0 0 0; font-size: 0.8rem; color: #94a3b8;">
          This link expires on <strong>{expires_at}</strong>.<br/>
          If you did not expect this email, you can safely ignore it.
        </p>
      </div>
      <p style="text-align: center; color: #cbd5e1; font-size: 0.75rem; margin-top: 16px;">ARASE — Automated Reporting App for SPED</p>
    </div>
    """

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[invitation.email],
    )
    msg.attach_alternative(html_body, "text/html")
    msg.send()


def resend_invitation(old_invitation):
    """
    Revokes the old invitation and issues a fresh one with a new 72-hour TTL.
    Sends the invite email and returns the new Invitation instance.
    """
    from django.utils import timezone

    email = old_invitation.email
    role = old_invitation.role
    student = old_invitation.student

    # Revoke the old token
    old_invitation.delete()

    # Create a fresh invitation
    new_invite = Invitation.objects.create(
        email=email,
        role=role,
        student=student,
    )

    # Fire the email
    send_invitation_email(new_invite)

    return new_invite


def create_invited_user(invitation, password, first_name="", last_name="", phone_number=""):
    """
    Creates a user from an invitation and links them to assigned students.
    Returns: User instance
    """
    user = User.objects.create_user(
        
        email=invitation.email,
        password=password,
        first_name=(first_name or "").strip().title(),
        last_name=(last_name or "").strip().title(),
        role=invitation.role,
        phone_number=(phone_number or "").strip()
    )

    invitation.is_used = True
    invitation.save()

    # Auto-link parent to all students registered under their email
    if invitation.role == 'PARENT':
        linked_students = Student.objects.filter(
            invitations__email=invitation.email,
            invitations__is_used=True,
        ).distinct()
        for student in linked_students:
            StudentAccess.objects.get_or_create(user=user, student=student)

    return user


def score_staff_for_student(student_id=None):
    """
    Scores and ranks specialists and teachers based on caseload
    and match to student concerns.

    Returns: list of scored staff dicts
    """
    from django.db.models import Count
    from api.models import ParentAssessment

    CONCERN_SPECIALTY = {
        "communication": {SPEECH_LANGUAGE_PATHOLOGY},
        "speech": {SPEECH_LANGUAGE_PATHOLOGY},
        "speech delay": {SPEECH_LANGUAGE_PATHOLOGY},
        "motor": {OCCUPATIONAL_THERAPY, PHYSICAL_THERAPY},
        "motor skills": {OCCUPATIONAL_THERAPY, PHYSICAL_THERAPY},
        "sensory": {OCCUPATIONAL_THERAPY},
        "sensory difficulty": {OCCUPATIONAL_THERAPY},
        "daily living": {OCCUPATIONAL_THERAPY},
        "behavior": {APPLIED_BEHAVIOR_ANALYSIS},
        "behavioral concerns": {APPLIED_BEHAVIOR_ANALYSIS},
        "emotions": {DEVELOPMENTAL_PSYCHOLOGY},
        "social": {APPLIED_BEHAVIOR_ANALYSIS, DEVELOPMENTAL_PSYCHOLOGY},
        "autism": {APPLIED_BEHAVIOR_ANALYSIS, DEVELOPMENTAL_PSYCHOLOGY},
        "adhd": {APPLIED_BEHAVIOR_ANALYSIS, DEVELOPMENTAL_PSYCHOLOGY},
        "learning": {DEVELOPMENTAL_PSYCHOLOGY},
        "developmental delay": {DEVELOPMENTAL_PSYCHOLOGY},
        "safety": {APPLIED_BEHAVIOR_ANALYSIS},
    }

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

    staff_qs = User.objects.filter(
        role__in=['SPECIALIST', 'TEACHER']
    ).annotate(
        caseload=Count('student_access', distinct=True)
    ).order_by('role', 'first_name')

    def _score(specialties_list, concerns_list):
        normalized = [
            normalize_specialty(s) for s in (specialties_list or []) if s
        ]
        normalized = [s for s in normalized if s]
        if not normalized:
            return 0
        score = 0
        for concern in concerns_list:
            matches = CONCERN_SPECIALTY.get(concern.lower(), set())
            if any(s in matches for s in normalized):
                score += 2
        return score

    scored = []
    for u in staff_qs:
        user_specialties = u.specialty_list()
        specialty_score = _score(user_specialties, concerns) if concerns else 0
        combined = (specialty_score * 3) - u.caseload
        scored.append((combined, u, user_specialties))

    best_by_role = {}
    for combined, u, _ in scored:
        if u.role not in best_by_role or combined > best_by_role[u.role][0]:
            best_by_role[u.role] = (combined, u.id)

    result = []
    for combined, u, user_specialties in scored:
        is_recommended = best_by_role.get(u.role, (None, None))[1] == u.id
        normalized_list = [normalize_specialty(s) for s in user_specialties if s]
        normalized_list = [s for s in normalized_list if s]
        result.append({
            "id": u.id,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "email": u.email,
            "role": u.role,
            "specialty": normalized_list[0] if normalized_list else "",
            "specialties": normalized_list,
            "caseload": u.caseload,
            "recommended": is_recommended,
        })

    return result
