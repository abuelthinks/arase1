"""Section-scoped writes for multi-specialist forms.

Each specialist edits only sections owned by their specialty (or shared
sections) on the MultidisciplinaryAssessment / MultidisciplinaryProgressTracker.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from ..models import (
    MultidisciplinaryAssessment,
    MultidisciplinaryProgressTracker,
    SectionContribution,
    StudentAccess,
)
from ..specialties import (
    SHARED_SECTION,
    can_edit_section,
    get_section_owners,
    required_owner_sections,
)


FORM_MODELS = {
    "assessment": MultidisciplinaryAssessment,
    "tracker": MultidisciplinaryProgressTracker,
}


class SectionPermissionError(Exception):
    pass


class SectionLockedError(Exception):
    pass


class SectionValidationError(Exception):
    pass


def _fk_field(form_type: str) -> str:
    return "assessment" if form_type == "assessment" else "tracker"


def _is_shared_locked(form_type: str, instance, section_key: str) -> bool:
    """Shared-section lock rule: Section A is locked once verification == 'matches'."""
    if form_type != "assessment":
        return False
    if section_key != "A":
        return False
    data = (instance.form_data or {}).get("v2", {}) or {}
    return data.get("a2_verification") == "matches"


def _get_or_create_form(form_type: str, user, student_id, report_cycle_id):
    Model = FORM_MODELS[form_type]
    instance = Model.objects.filter(
        student_id=student_id, report_cycle_id=report_cycle_id
    ).first()
    if instance:
        return instance, False
    instance = Model.objects.create(
        student_id=student_id,
        report_cycle_id=report_cycle_id,
        submitted_by=user,
        form_data={},
    )
    return instance, True


def ensure_form(*, form_type: str, user, student_id: int, report_cycle_id: int):
    """Public wrapper that creates the parent record on demand (no section write).

    Used by the frontend to materialize a MultidisciplinaryAssessment /
    MultidisciplinaryProgressTracker row before any specialist has saved a
    section, so the real-time collaboration WS can hook in immediately.
    """
    if user.role not in ("ADMIN", "SPECIALIST", "TEACHER"):
        raise SectionPermissionError("You do not have access to this form.")
    instance, created = _get_or_create_form(
        form_type, user, student_id, report_cycle_id
    )
    # Verify the user actually has access to this student before returning.
    _get_student_access(user, instance)
    return instance, created


def _get_student_access(user, instance):
    if user.role == "ADMIN":
        return None
    access = StudentAccess.objects.filter(user=user, student_id=instance.student_id).select_related("user").first()
    if not access:
        raise SectionPermissionError("You do not have access to this student.")
    return access


def _check_section_edit(form_type: str, instance, user, section_key: str):
    """Permission gate for editing a section."""
    if user.role == "ADMIN":
        return
    if user.role != "SPECIALIST":
        raise SectionPermissionError("Only specialists may edit section inputs.")
    if not user.is_specialist_onboarding_complete():
        raise SectionPermissionError("Complete your profile setup before editing specialist work.")

    owners = get_section_owners(form_type)
    if section_key not in owners:
        raise SectionValidationError(f"Unknown section: {section_key}")

    access = _get_student_access(user, instance)
    user_specialties = access.specialty_list() if access else user.specialty_list()
    if not can_edit_section(form_type, section_key, user_specialties):
        raise SectionPermissionError(
            f"Your specialty is not authorized to edit section {section_key}."
        )

    if instance.finalized_at:
        raise SectionLockedError("This form is finalized and can no longer be edited.")

    contribution = SectionContribution.objects.filter(
        **{_fk_field(form_type): instance}, section_key=section_key
    ).first()

    # Own submitted section cannot be edited again (only admin can reopen).
    if contribution and contribution.status == "submitted":
        raise SectionLockedError(f"Section {section_key} has already been submitted.")

    if _is_shared_locked(form_type, instance, section_key):
        raise SectionLockedError(
            f"Section {section_key} is locked (verified/matched)."
        )


def save_section(
    *, form_type: str, user, student_id: int, report_cycle_id: int,
    section_key: str, section_data: dict,
):
    """Persist a draft write for a single section slice. Auto-creates parent record."""
    with transaction.atomic():
        instance, created = _get_or_create_form(
            form_type, user, student_id, report_cycle_id
        )
        _get_student_access(user, instance)
        _check_section_edit(form_type, instance, user, section_key)

        form_data = instance.form_data or {}
        if form_type == "assessment":
            # Nest all assessment section data under v2.
            v2 = form_data.setdefault("v2", {})
            if isinstance(section_data, dict):
                v2.update(section_data)
            else:
                raise SectionValidationError("section_data must be an object.")
        else:
            # Tracker data is namespaced per section already (section_a, section_b,
            # section_c_slp, etc). Merge into the top-level slot.
            if not isinstance(section_data, dict):
                raise SectionValidationError("section_data must be an object.")
            form_data[section_key] = {
                **(form_data.get(section_key) or {}),
                **section_data,
            }

        instance.form_data = form_data
        instance.save(update_fields=["form_data"])

        access = _get_student_access(user, instance)
        owners = get_section_owners(form_type)
        owner = owners[section_key]
        specialty = "" if owner == SHARED_SECTION else owner
        fallback_specialties = access.specialty_list() if access else user.specialty_list()

        SectionContribution.objects.update_or_create(
            defaults={
                "form_type": form_type,
                "specialist": user,
                "specialty": specialty or (fallback_specialties[0] if fallback_specialties else ""),
                "status": "draft",
            },
            **{_fk_field(form_type): instance},
            section_key=section_key,
        )

        # Real-time fan-out to other open clients editing this form.
        from .collaboration_service import broadcast_section_saved
        form_data_v2 = (instance.form_data or {}).get("v2") if form_type == "assessment" else instance.form_data
        transaction.on_commit(lambda: broadcast_section_saved(
            form_type=form_type, instance=instance, section_key=section_key,
            user=user, form_data_v2=form_data_v2,
        ))
        return instance, created


def submit_section(
    *, form_type: str, user, student_id: int, report_cycle_id: int,
    section_key: str,
):
    """Flip a section to submitted. Auto-finalize when all owner sections are submitted."""
    with transaction.atomic():
        instance, _ = _get_or_create_form(
            form_type, user, student_id, report_cycle_id
        )
        access = _get_student_access(user, instance)
        _check_section_edit(form_type, instance, user, section_key)

        owners = get_section_owners(form_type)
        owner = owners[section_key]
        specialty = "" if owner == SHARED_SECTION else owner
        fallback_specialties = access.specialty_list() if access else user.specialty_list()

        contribution, _created = SectionContribution.objects.update_or_create(
            defaults={
                "form_type": form_type,
                "specialist": user,
                "specialty": specialty or (fallback_specialties[0] if fallback_specialties else ""),
                "status": "submitted",
                "submitted_at": timezone.now(),
            },
            **{_fk_field(form_type): instance},
            section_key=section_key,
        )

        _maybe_finalize(form_type, instance, user)

        # Drop any presence lock the user held on this section + tell peers.
        from .collaboration_service import (
            release_lock, broadcast_lock_changed, broadcast_section_submitted,
        )
        release_lock(
            form_type=form_type, instance_id=instance.id,
            section_key=section_key, user=user,
        )
        finalized = bool(instance.finalized_at)
        transaction.on_commit(lambda: (
            broadcast_section_submitted(
                form_type=form_type, instance=instance, section_key=section_key,
                user=user, finalized=finalized,
            ),
            broadcast_lock_changed(form_type, instance.id),
        ))
        return instance, contribution


def _maybe_finalize(form_type: str, instance, user):
    """If every owner-section is submitted, mark the form finalized."""
    if instance.finalized_at:
        return

    assigned_specialties: list[str] = []
    for access in StudentAccess.objects.filter(
        student_id=instance.student_id,
        user__role="SPECIALIST",
    ).select_related("user"):
        for specialty in access.specialty_list():
            if specialty and specialty not in assigned_specialties:
                assigned_specialties.append(specialty)

    required = required_owner_sections(form_type, assigned_specialties)
    submitted = SectionContribution.objects.filter(
        **{_fk_field(form_type): instance},
        section_key__in=required,
        status="submitted",
    ).values_list("section_key", flat=True)

    if set(submitted) >= set(required):
        instance.finalized_at = timezone.now()
        instance.finalized_by = user
        instance.submitted_by = user
        instance.save(update_fields=["finalized_at", "finalized_by", "submitted_by"])

        if form_type == "assessment":
            from .cycle_service import check_and_trigger_iep_generation
            student = instance.student
            if student.status in ["PENDING_ASSESSMENT", "ASSESSMENT_SCHEDULED"]:
                student.status = "ASSESSED"
                student.save()
            check_and_trigger_iep_generation(student, instance.report_cycle)
        else:
            from .cycle_service import check_and_trigger_auto_generation
            check_and_trigger_auto_generation(instance.student, instance.report_cycle)
