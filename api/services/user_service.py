"""
User/invitation business logic extracted from views.py.
"""

from api.models import User, Invitation, Student, StudentAccess


def create_invited_user(invitation, password, first_name, last_name):
    """
    Creates a user from an invitation and links them to assigned students.
    Returns: User instance
    """
    user = User.objects.create_user(
        username=invitation.email,
        email=invitation.email,
        password=password,
        first_name=first_name.strip().title(),
        last_name=last_name.strip().title(),
        role=invitation.role,
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
        "communication": ["speech", "language", "slp"],
        "speech": ["speech", "language", "slp"],
        "motor": ["occupational", "ot", "physical", "motor"],
        "motor skills": ["occupational", "ot", "physical", "motor"],
        "sensory": ["occupational", "ot", "sensory"],
        "behavior": ["behavioral", "aba", "behavior", "applied"],
        "emotions": ["behavioral", "aba", "psychology", "counseling"],
        "social": ["behavioral", "social", "autism", "aba"],
        "autism": ["autism", "aba", "behavioral"],
        "adhd": ["adhd", "behavioral", "executive"],
        "learning": ["learning", "sped", "academic", "education"],
        "daily living": ["occupational", "ot", "life skills"],
        "safety": ["behavioral", "aba"],
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

    def _score(specialty, concerns_list):
        specialty_lower = specialty.lower()
        score = 0
        for concern in concerns_list:
            keywords = CONCERN_SPECIALTY.get(concern.lower(), [])
            for kw in keywords:
                if kw in specialty_lower:
                    score += 2
                    break
        return score

    scored = []
    for u in staff_qs:
        specialty_score = _score(u.specialty, concerns) if concerns else 0
        combined = (specialty_score * 3) - u.caseload
        scored.append((combined, u))

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

    return result
