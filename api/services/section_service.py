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


# Per-section field IDs for emptiness checks. Two frontends write to the
# section-scoped endpoints with DIFFERENT field name conventions, so we keep
# the union of both. A section is "non-empty" if any of these fields holds
# real content.
#   * Schema-driven workspace form (frontend/.../[type]/page.tsx + JSON schema)
#   * Legacy bespoke form           (frontend/.../specialist-a/page.tsx)
ASSESSMENT_SECTION_FIELDS: dict[str, list[str]] = {
    "A": [
        # specialist-a/page.tsx
        "therapist_name", "date",
        "a2_verification", "a2_correction_notes",
        "a3_reports_reviewed", "a3_notes",
        # JSON schema (workspace [type]/page.tsx)
        "parent_provided_information", "therapist_verification",
        "correction_notes", "clinical_notes", "additional_clinical_notes",
    ],
    "B": [
        "b1_milestones", "b2_developmental_concerns",
        "developmental_milestones", "developmental_concerns",
    ],
    "C": [
        "c1_expressive", "c2_receptive", "c3_articulation", "c4_pragmatics", "c_notes",
        "expressive_language", "receptive_language", "speech_sound", "pragmatics", "slp_notes",
    ],
    "D": [
        "d1_fine_motor", "d2_sensory", "d3_adls", "d4_regulation", "d_notes",
        "fine_motor_skills", "sensory_processing", "adls",
        "ot_emotional_regulation", "ot_notes",
    ],
    "E": [
        "e1_gross_motor", "e2_strength", "e3_posture", "e4_motor_planning", "e_notes",
        "gross_motor_skills", "strength_endurance", "posture_alignment",
        "motor_planning", "pt_notes",
    ],
    "F1": [
        "f1_behavior", "f2_emotional", "f_aba_notes",
        "behavioral_observations", "psych_emotional_functioning", "psych_notes",
    ],
    "F2": [
        "f3_cognitive", "f4_autism", "f_dev_psych_notes",
        "cognitive_play_skills", "autism_characteristics",
    ],
    "G": [
        "g1_slp_summary", "g1_ot_summary", "g1_pt_summary", "g1_aba_summary",
        "g1_developmental_psychology_summary",
        "g2_strengths", "g3_needs", "g4_frequency", "g5_follow_up",
        "slp_summary", "ot_summary", "pt_summary", "aba_summary",
        "developmental_psychology_summary",
        "unified_strengths", "unified_needs",
        "recommended_therapy_frequency", "follow_up_plan",
    ],
}


def _is_value_blank(value) -> bool:
    """A field is "blank" if the user hasn't put real content in it."""
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == "" or value.strip() == "0"
    if isinstance(value, (list, tuple, dict, set)):
        return len(value) == 0
    if isinstance(value, bool):
        return value is False
    if isinstance(value, (int, float)):
        return value == 0
    return False


def _section_has_content(form_type: str, instance, section_key: str) -> bool:
    """True if the section has at least one non-blank field value persisted."""
    if form_type == "assessment":
        v2 = (instance.form_data or {}).get("v2", {}) or {}
        fields = ASSESSMENT_SECTION_FIELDS.get(section_key, [])
        if not fields:
            # Unknown section — fall back to permissive (don't block).
            return True
        return any(not _is_value_blank(v2.get(f)) for f in fields)
    # Tracker form: section data is namespaced under form_data[section_key].
    section_data = (instance.form_data or {}).get(section_key)
    if not isinstance(section_data, dict):
        return False
    return any(not _is_value_blank(v) for v in section_data.values())


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

        # Specialty-owned sections must have at least one filled field before
        # they can be submitted. Shared sections are allowed to submit empty
        # (whoever opts in is signaling "nothing to add here").
        if owner != SHARED_SECTION and user.role != "ADMIN":
            if not _section_has_content(form_type, instance, section_key):
                raise SectionValidationError(
                    f"Section {section_key} is empty. Please fill out the section before submitting."
                )

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
        from .realtime_service import create_activity_event
        label = "Specialist assessment" if form_type == "assessment" else "Specialist tracker"
        create_activity_event(
            event_type="FORM_FINALIZED" if finalized else "FORM_SUBMITTED",
            title=f"{label} section {section_key} submitted for {instance.student}",
            actor=user,
            student=instance.student,
            metadata={"form_type": form_type, "section_key": section_key},
        )
        return instance, contribution


def reopen_section(
    *, form_type: str, user, student_id: int, report_cycle_id: int,
    section_key: str,
):
    """Revert a submitted section back to draft status.

    Rules:
      - Form must NOT be finalized. Once finalized, only admin can reopen
        through admin tools.
      - Shared sections (Section A, B, G, etc.): any specialist with student
        access may reopen — they're taking over collaborative editing.
      - Owned (specialty-specific) sections: only a specialist whose specialty
        owns the section may reopen — they're correcting their own work.
    """
    with transaction.atomic():
        instance, _ = _get_or_create_form(
            form_type, user, student_id, report_cycle_id
        )

        if instance.finalized_at:
            raise SectionLockedError("This form is finalized and cannot be reopened.")

        owners = get_section_owners(form_type)
        owner = owners.get(section_key)
        if owner is None:
            raise SectionValidationError(f"Unknown section: {section_key}")

        access = _get_student_access(user, instance)
        if user.role != "SPECIALIST" and user.role != "ADMIN":
            raise SectionPermissionError("Only specialists or admins can reopen sections.")

        # Owned-section reopens are restricted to the owning specialty (admins
        # always allowed). Shared sections stay open to any team member.
        if owner != SHARED_SECTION and user.role != "ADMIN":
            user_specialties = access.specialty_list() if access else user.specialty_list()
            if not can_edit_section(form_type, section_key, user_specialties):
                raise SectionPermissionError(
                    "Only the assigned specialist may reopen this section."
                )

        if _is_shared_locked(form_type, instance, section_key):
            raise SectionLockedError(f"Section {section_key} is locked (verified) and cannot be reopened.")

        contribution = SectionContribution.objects.filter(
            **{_fk_field(form_type): instance}, section_key=section_key
        ).first()
        
        if not contribution or contribution.status != "submitted":
            return instance, contribution
            
        contribution.status = "draft"
        contribution.submitted_at = None
        contribution.save(update_fields=["status", "submitted_at"])
        
        from .collaboration_service import broadcast_lock_changed
        transaction.on_commit(lambda: broadcast_lock_changed(form_type, instance.id))
        from .realtime_service import create_activity_event
        create_activity_event(
            event_type="FORM_SUBMITTED",
            title=f"Section {section_key} reopened for {instance.student}",
            actor=user,
            student=instance.student,
            metadata={"form_type": form_type, "section_key": section_key},
        )
        
        return instance, contribution


def submit_all_sections(
    *, form_type: str, user, student_id: int, report_cycle_id: int,
):
    """Bulk-submit every draft section the user has contributed to.

    All-or-nothing: if any section fails the submit checks, nothing changes.

    Validation:
      - User's *assigned* specialty sections must each have an existing
        contribution (drafted or submitted). Missing ones block the submit.
      - Shared sections with no contribution are not required.

    Returns: {"submitted": [keys], "finalized": bool, "instance": instance}.
    """
    if user.role not in ("SPECIALIST", "ADMIN"):
        raise SectionPermissionError("Only specialists may submit form sections.")
    if user.role == "SPECIALIST" and not user.is_specialist_onboarding_complete():
        raise SectionPermissionError("Complete your profile setup before submitting work.")

    with transaction.atomic():
        instance, _ = _get_or_create_form(
            form_type, user, student_id, report_cycle_id
        )
        access = _get_student_access(user, instance)

        if instance.finalized_at:
            raise SectionLockedError("This form is finalized.")

        user_specialties = (
            access.specialty_list() if access else user.specialty_list()
        )

        # Required sections for *this* user (their owned-specialty sections).
        my_required = required_owner_sections(form_type, user_specialties)

        # A required section is only "ready" if it has a contribution AND that
        # contribution's persisted form_data actually contains something.
        existing = {
            c.section_key: c
            for c in SectionContribution.objects.filter(
                **{_fk_field(form_type): instance},
                section_key__in=my_required,
            )
        }

        missing = [
            key for key in my_required
            if key not in existing or not _section_has_content(form_type, instance, key)
        ]
        if missing:
            label = ", ".join(missing)
            raise SectionValidationError(
                f"Please fill out your assigned section(s) before submitting: {label}"
            )

        # Submit every draft contribution where this user is the latest editor.
        my_drafts = SectionContribution.objects.filter(
            **{_fk_field(form_type): instance},
            specialist=user,
            status="draft",
        ).order_by("section_key")

        submitted_keys: list[str] = []
        for contrib in my_drafts:
            submit_section(
                form_type=form_type,
                user=user,
                student_id=student_id,
                report_cycle_id=report_cycle_id,
                section_key=contrib.section_key,
            )
            submitted_keys.append(contrib.section_key)

    instance.refresh_from_db()
    return {
        "submitted": submitted_keys,
        "finalized": bool(instance.finalized_at),
        "finalized_at": instance.finalized_at,
        "instance": instance,
    }


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
        
        last_contrib = SectionContribution.objects.filter(
            **{_fk_field(form_type): instance}, status="submitted"
        ).order_by("-submitted_at").first()
        finalizing_user = user or (last_contrib.specialist if last_contrib else None)
        
        instance.finalized_by = finalizing_user
        if not instance.submitted_by:
            instance.submitted_by = finalizing_user
        instance.save(update_fields=["finalized_at", "finalized_by", "submitted_by"])

        try:
            from .notification_service import notify_specialist_form_finalized
            notify_specialist_form_finalized(
                finalizing_user,
                instance.student,
                instance.report_cycle,
                "Specialist Assessment" if form_type == "assessment" else "Specialist Progress Tracker",
            )
        except Exception:
            pass

        if form_type == "assessment":
            from .cycle_service import check_and_trigger_iep_generation
            student = instance.student
            if student.status in ["PENDING_ASSESSMENT", "ASSESSMENT_SCHEDULED"]:
                student.status = "ASSESSED"
                student.save()
            check_and_trigger_iep_generation(student, instance.report_cycle)
        else:
            from .cycle_service import check_and_trigger_auto_generation
            try:
                from .notification_service import notify_tracker_progress
                notify_tracker_progress(finalizing_user, instance.student, instance.report_cycle)
            except Exception:
                pass
            check_and_trigger_auto_generation(instance.student, instance.report_cycle)


def re_evaluate_finalization(student_id: int):
    """
    Called when specialist assignments change (e.g. a specialist is removed).
    Checks open Multidisciplinary assessments and trackers to see if they 
    now meet the requirements to finalize.
    """
    from .cycle_service import ensure_current_cycle
    from ..models import Student, ReportCycle
    
    student = Student.objects.get(id=student_id)
    cycle = ensure_current_cycle(student) if student.status in ('ENROLLED', 'INTEGRATED') else None
    if not cycle:
        cycle = ReportCycle.objects.filter(student=student, is_active=True).first()
        
    if not cycle:
        return

    # Check assessment
    assessment = MultidisciplinaryAssessment.objects.filter(student=student, report_cycle=cycle, finalized_at__isnull=True).first()
    if assessment:
        _maybe_finalize("assessment", assessment, None)

    # Check tracker
    tracker = MultidisciplinaryProgressTracker.objects.filter(student=student, report_cycle=cycle, finalized_at__isnull=True).first()
    if tracker:
        _maybe_finalize("tracker", tracker, None)
