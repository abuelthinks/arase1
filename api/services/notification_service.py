"""
Notification Service
=====================
Centralised notification dispatch for the ARASE platform.
Supports in-app, email, SMS, and WebSocket real-time push channels.
Gracefully degrades if any channel fails.
"""

import logging
from django.conf import settings

logger = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _user_display_name(user):
    """Return a human-readable display name for a user."""
    name = f"{user.first_name} {user.last_name}".strip()
    return name or user.email


def _broadcast_notification(notification):
    """Push a notification to the user's WebSocket channel (fire-and-forget)."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            f"notifications_{notification.recipient_id}",
            {
                "type": "notification.push",
                "notification": {
                    "id": notification.id,
                    "notification_type": notification.notification_type,
                    "title": notification.title,
                    "message": notification.message,
                    "link": notification.link,
                    "actor_name": notification.actor_name,
                    "is_read": False,
                    "created_at": notification.created_at.isoformat(),
                },
            },
        )
    except Exception as e:
        # Channels may not be installed or configured — that's fine
        logger.debug("WebSocket broadcast skipped: %s", e)


# ─── Core Dispatch ────────────────────────────────────────────────────────────

def _create_notification(user, notification_type, title, message, link='', actor_name='', dedupe_key=''):
    """Create one notification, optionally suppressing repeats for the same event."""
    from django.db import IntegrityError
    from api.models import Notification

    defaults = {
        'notification_type': notification_type,
        'title': title,
        'message': message,
        'link': link,
        'actor_name': actor_name,
    }

    if dedupe_key:
        try:
            notification, created = Notification.objects.get_or_create(
                recipient=user,
                dedupe_key=dedupe_key,
                defaults=defaults,
            )
        except IntegrityError:
            notification = Notification.objects.get(recipient=user, dedupe_key=dedupe_key)
            created = False
        if created:
            _broadcast_notification(notification)
        return notification

    notification = Notification.objects.create(recipient=user, **defaults)
    _broadcast_notification(notification)
    return notification


def notify_admins_in_app(notification_type, title, message, link='', exclude_user=None, actor_name='', dedupe_key=''):
    """
    Create an in-app notification for every admin user, optionally excluding
    the admin who triggered the action (to avoid self-notifications).
    """
    from api.models import Notification, User

    admins = User.objects.filter(role='ADMIN')
    if exclude_user and exclude_user.role == 'ADMIN':
        admins = admins.exclude(id=exclude_user.id)

    if dedupe_key:
        for admin in admins:
            _create_notification(
                admin,
                notification_type,
                title,
                message,
                link=link,
                actor_name=actor_name,
                dedupe_key=dedupe_key,
            )
        return

    notifications = [
        Notification(
            recipient=admin,
            notification_type=notification_type,
            title=title,
            message=message,
            link=link,
            actor_name=actor_name,
        )
        for admin in admins
    ]
    if notifications:
        created = Notification.objects.bulk_create(notifications)
        for n in created:
            _broadcast_notification(n)


def notify_user_in_app(user, notification_type, title, message, link='', actor_name='', dedupe_key=''):
    """Create an in-app notification for a specific user."""
    return _create_notification(
        user,
        notification_type,
        title,
        message,
        link=link,
        actor_name=actor_name,
        dedupe_key=dedupe_key,
    )


# ─── Form Submission Notifications ────────────────────────────────────────────

def notify_parent_welcome_to_register_child(user, student=None):
    """Welcome a newly invited parent and point them to child onboarding."""
    if user.role != 'PARENT':
        return None

    first_name = (user.first_name or '').strip()
    title = f"Welcome to ARASE{f', {first_name}' if first_name else ''}"
    link = f"/parent-onboarding?studentId={student.id}" if student else "/parent-onboarding"
    message = (
        f"Start by registering {student.first_name} and completing the parent assessment."
        if student
        else "Start by registering your child and completing the parent assessment."
    )

    return notify_user_in_app(
        user=user,
        notification_type='SYSTEM',
        title=title,
        message=message,
        link=link,
        actor_name="ARASE",
        dedupe_key=f"parent-welcome-register-child:{user.id}",
    )


def notify_specialist_welcome_to_complete_profile(user):
    """Welcome a newly registered specialist and point them at onboarding."""
    if user.role != 'SPECIALIST':
        return None

    first_name = (user.first_name or '').strip()
    title = f"Welcome to ARASE{f', {first_name}' if first_name else ''}"

    specialties = user.specialty_list()
    if specialties:
        message = (
            f"You're set up for {', '.join(specialties)}. "
            "Add your name and session languages to finish your profile — "
            "you can ask admin to correct your specialties there if anything looks wrong."
        )
    else:
        message = (
            "Add your name and session languages to finish your profile. "
            "Admin will assign your specialties shortly."
        )

    return notify_user_in_app(
        user=user,
        notification_type='SYSTEM',
        title=title,
        message=message,
        link="/specialist-onboarding",
        actor_name="ARASE",
        dedupe_key=f"specialist-welcome-complete-profile:{user.id}",
    )


def notify_teacher_welcome_to_complete_profile(user):
    """Welcome a newly registered teacher and point them at their profile.

    Unlike the specialist version this is a nudge, not a gate — a teacher can
    work with an incomplete profile, but their languages feed student matching.
    """
    if user.role != 'TEACHER':
        return None

    first_name = (user.first_name or '').strip()
    title = f"Welcome to ARASE{f', {first_name}' if first_name else ''}"

    grade_level = user.grade_level or ''
    if grade_level:
        message = (
            f"You're set up for {grade_level}. "
            "Add the languages you can use with families so students get matched to you correctly — "
            "ask admin if your grade level looks wrong."
        )
    else:
        message = (
            "Add the languages you can use with families so students get matched to you correctly. "
            "Admin will assign your grade level shortly."
        )

    return notify_user_in_app(
        user=user,
        notification_type='SYSTEM',
        title=title,
        message=message,
        link=f"/users/{user.id}",
        actor_name="ARASE",
        dedupe_key=f"teacher-welcome-complete-profile:{user.id}",
    )


def notify_parent_assessment_unlock_requested(parent_user, student):
    """Notify admins that a parent asked to edit a submitted parent assessment."""
    student_name = f"{student.first_name} {student.last_name}".strip()
    actor = _user_display_name(parent_user)
    notify_admins_in_app(
        notification_type='UNLOCK_REQUESTED',
        title='Parent assessment unlock requested',
        message=f"{actor} requested to unlock the parent assessment for {student_name}.",
        link=f"/workspace?studentId={student.id}&workspace=forms&tab=parent_assessment",
        actor_name=actor,
    )


def notify_specialist_assessment_unlock_requested(specialist_user, student):
    """Notify admins that a specialist asked to unlock the multidisciplinary assessment."""
    student_name = f"{student.first_name} {student.last_name}".strip()
    actor = _user_display_name(specialist_user)
    notify_admins_in_app(
        notification_type='UNLOCK_REQUESTED',
        title='Unlock Request',
        message=f"{actor} has requested to unlock the specialist assessment for {student_name}.",
        link=f"/workspace?studentId={student.id}&workspace=forms&tab=multi_assessment",
        actor_name=actor,
    )


def notify_specialist_tracker_unlock_requested(specialist_user, student):
    """Notify admins that a specialist asked to unlock the multidisciplinary progress tracker."""
    student_name = f"{student.first_name} {student.last_name}".strip()
    actor = _user_display_name(specialist_user)
    notify_admins_in_app(
        notification_type='UNLOCK_REQUESTED',
        title='Unlock Request',
        message=f"{actor} has requested to unlock the specialist progress tracker for {student_name}.",
        link=f"/workspace?studentId={student.id}&workspace=forms&tab=multi_tracker",
        actor_name=actor,
    )


def _describe_specialty_delta(added, removed):
    """Human-readable summary of an add/remove specialty delta."""
    parts = []
    if added:
        parts.append(f"add {', '.join(added)}")
    if removed:
        parts.append(f"remove {', '.join(removed)}")
    return ' and '.join(parts) if parts else 'no change'


def notify_specialty_change_requested(change_request):
    """Notify admins that a specialist asked to add or remove specialties."""
    specialist = change_request.specialist
    actor = _user_display_name(specialist)
    delta = _describe_specialty_delta(
        change_request.added_specialties(),
        change_request.removed_specialties(),
    )
    message = f"{actor} requested to {delta}."
    if change_request.note:
        message = f"{message} Note: {change_request.note}"

    notify_admins_in_app(
        notification_type='SYSTEM',
        title=f"Specialty change request: {actor}",
        message=message,
        link=f"/users/{specialist.id}",
        actor_name=actor,
    )


def notify_specialty_change_reviewed(change_request):
    """Notify the specialist that an admin approved or rejected their request."""
    specialist = change_request.specialist
    reviewer = _user_display_name(change_request.reviewed_by) if change_request.reviewed_by else 'Admin'
    approved = change_request.status == 'APPROVED'

    if approved:
        applied = ', '.join(change_request.requested_specialties or []) or 'no specialties'
        message = f"{reviewer} approved your specialty change request. You are now assigned to {applied}."
    else:
        delta = _describe_specialty_delta(
            change_request.added_specialties(),
            change_request.removed_specialties(),
        )
        message = f"{reviewer} declined your request to {delta}. Your specialties are unchanged."

    if change_request.admin_note:
        message = f"{message} Note: {change_request.admin_note}"

    return notify_user_in_app(
        user=specialist,
        notification_type='SYSTEM',
        title='Specialty change approved' if approved else 'Specialty change declined',
        message=message,
        link='/workspace',
        actor_name=reviewer,
    )


def notify_parent_assessment_unlocked(parent_user, student, unlocked_by=None):
    """Notify a parent that an admin unlocked their submitted parent assessment."""
    if not parent_user or parent_user.role != 'PARENT':
        return None

    student_name = f"{student.first_name} {student.last_name}".strip()
    actor = _user_display_name(unlocked_by) if unlocked_by else 'Admin'
    return notify_user_in_app(
        user=parent_user,
        notification_type='SYSTEM',
        title='Parent assessment unlocked',
        message=f"Your parent assessment for {student_name} has been unlocked. You can edit and resubmit it now.",
        link=f"/workspace?studentId={student.id}&workspace=forms&tab=parent_assessment",
        actor_name=actor,
    )


def notify_specialist_form_unlocked(student, form_label, unlocked_by=None):
    """Notify assigned specialists that an admin unlocked the multidisciplinary assessment/tracker."""
    from api.models import StudentAccess

    student_name = f"{student.first_name} {student.last_name}".strip()
    actor = _user_display_name(unlocked_by) if unlocked_by else 'Admin'

    form_tab_map = {
        'Specialist Assessment': 'multi_assessment',
        'Specialist Progress Tracker': 'multi_tracker',
    }
    form_tab = form_tab_map.get(form_label, '')
    link = f"/workspace?studentId={student.id}&workspace=forms"
    if form_tab:
        link += f"&tab={form_tab}"

    assigned_specialists = (
        StudentAccess.objects
        .filter(student=student, user__role='SPECIALIST')
        .select_related('user')
    )

    notifications = []
    for sa in assigned_specialists:
        n = notify_user_in_app(
            user=sa.user,
            notification_type='SYSTEM',
            title=f"{form_label} unlocked",
            message=f"The {form_label.lower()} for {student_name} has been unlocked by {actor}.",
            link=link,
            actor_name=actor,
        )
        if n:
            notifications.append(n)

    return notifications


def notify_form_submitted(user, student, form_label, link='', dedupe_key='', is_resubmission=False):
    """
    Notify admins when any user submits a form.
    Also notify relevant assigned users (specialists, teachers) about
    forms submitted by other roles for the same student.
    """
    from api.models import StudentAccess

    student_name = f"{student.first_name} {student.last_name}"
    actor = _user_display_name(user)

    # Map form labels to workspace tab IDs
    form_tab_map = {
        'Parent Assessment': 'parent_assessment',
        'Specialist Assessment': 'multi_assessment',
        'SPED Assessment': 'sped_assessment',
        'Parent Progress': 'parent_tracker',
        'Specialist Progress': 'multi_tracker',
        'Teacher Progress': 'sped_tracker',
    }
    form_tab = form_tab_map.get(form_label, '')
    default_link = f"/workspace?studentId={student.id}&workspace=forms"
    if form_tab:
        default_link += f"&tab={form_tab}"

    verb = "resubmitted" if is_resubmission else "submitted"

    # Notify admins (exclude the submitter if they are an admin)
    notify_admins_in_app(
        notification_type='FORM_SUBMITTED',
        title=f"{form_label} {verb} for {student_name}",
        message=f"{actor} {verb} the {form_label.lower()}.",
        link=link or default_link,
        exclude_user=user,
        actor_name=actor,
        dedupe_key=dedupe_key,
    )

    # Notify other assigned users for this student (not the submitter, not admins)
    other_assigned = (
        StudentAccess.objects
        .filter(student=student)
        .exclude(user=user)
        .exclude(user__role='ADMIN')
        .select_related('user')
    )
    for sa in other_assigned:
        notify_user_in_app(
            user=sa.user,
            notification_type='FORM_SUBMITTED',
            title=f"{form_label} {verb} for {student_name}",
            message=f"{actor} {verb} the {form_label.lower()}.",
            link=link or default_link,
            actor_name=actor,
            dedupe_key=dedupe_key,
        )


def _tracker_progress_counts(student, cycle):
    from api.models import (
        ParentProgressTracker,
        MultidisciplinaryProgressTracker,
        SpedProgressTracker,
    )
    parent_done = ParentProgressTracker.objects.filter(
        student=student,
        report_cycle=cycle,
    ).exists()
    specialist_done = MultidisciplinaryProgressTracker.objects.filter(
        student=student,
        report_cycle=cycle,
        finalized_at__isnull=False,
    ).exists()
    teacher_required = student.status == 'INTEGRATED'
    teacher_done = teacher_required and SpedProgressTracker.objects.filter(
        student=student,
        report_cycle=cycle,
    ).exists()
    return sum([parent_done, specialist_done, teacher_done]), 3 if teacher_required else 2


def notify_tracker_progress(user, student, cycle, submitted_count=None, total_required=None):
    """
    Notify admins about tracker progress (e.g., "2/2 trackers submitted").
    """
    student_name = f"{student.first_name} {student.last_name}"
    actor = _user_display_name(user) if user else "ARASE"
    label = cycle.label or "the active cycle"
    if submitted_count is None or total_required is None:
        submitted_count, total_required = _tracker_progress_counts(student, cycle)

    if submitted_count >= total_required:
        title = f"All trackers submitted for {student_name}"
        message = f"All {total_required} progress trackers are in for {label}. Report auto-generation will begin."
    else:
        title = f"Tracker progress: {student_name} ({submitted_count}/{total_required})"
        message = f"{actor} submitted a tracker for {label}."

    notify_admins_in_app(
        notification_type='FORM_SUBMITTED',
        title=title,
        message=message,
        link=f"/workspace?studentId={student.id}&workspace=forms",
        exclude_user=user if user else None,
        actor_name=actor,
        dedupe_key=f"tracker-progress:{student.id}:{cycle.id}:{submitted_count}:{total_required}",
    )


# ─── Status Change Notifications ─────────────────────────────────────────────

def notify_student_status_change(student, new_status, changed_by=None):
    """Notify relevant users when a student's status changes."""
    from api.models import StudentAccess

    student_name = f"{student.first_name} {student.last_name}"
    actor = _user_display_name(changed_by) if changed_by else "System"
    link = f"/workspace?studentId={student.id}"

    status_messages = {
        'ENROLLED': {
            'admin_title': f"Student enrolled: {student_name}",
            'admin_msg': f"{actor} formally enrolled the student.",
            'user_title': f"{student_name} has been enrolled",
            'user_msg': "The student is now active. Monthly tracking will begin.",
        },
        'ASSESSED': {
            'admin_title': f"Assessment complete: {student_name}",
            'admin_msg': f"Specialist assessment submitted. Ready for enrollment review.",
            'user_title': f"Assessment complete for {student_name}",
            'user_msg': "The specialist assessment has been completed.",
        },
        'ARCHIVED': {
            'admin_title': f"Student archived: {student_name}",
            'admin_msg': f"{actor} archived the student record.",
            'user_title': f"{student_name} has been archived",
            'user_msg': "The student record has been archived.",
        },
    }

    if new_status not in status_messages:
        return

    msgs = status_messages[new_status]

    # Notify admins
    notify_admins_in_app(
        notification_type='STUDENT_ENROLLED' if new_status == 'ENROLLED' else 'SYSTEM',
        title=msgs['admin_title'],
        message=msgs['admin_msg'],
        link=link,
        exclude_user=changed_by,
        actor_name=actor,
    )

    # Notify assigned non-admin users
    assigned = (
        StudentAccess.objects
        .filter(student=student)
        .exclude(user__role='ADMIN')
        .select_related('user')
    )
    if changed_by:
        assigned = assigned.exclude(user=changed_by)

    for sa in assigned:
        notify_user_in_app(
            user=sa.user,
            notification_type='STUDENT_ENROLLED' if new_status == 'ENROLLED' else 'SYSTEM',
            title=msgs['user_title'],
            message=msgs['user_msg'],
            link=link,
            actor_name=actor,
        )


def notify_staff_assigned(student, staff_user, role_label, assigned_by=None, dedupe_key=''):
    """Notify the assigned staff member that they've been assigned to a student."""
    student_name = f"{student.first_name} {student.last_name}"
    actor = _user_display_name(assigned_by) if assigned_by else "Admin"
    link = f"/workspace?studentId={student.id}"

    type_map = {
        'SPECIALIST': 'SPECIALIST_ASSIGNED',
        'TEACHER': 'TEACHER_ASSIGNED',
    }

    # Notify the assigned staff
    notify_user_in_app(
        user=staff_user,
        notification_type=type_map.get(staff_user.role, 'SYSTEM'),
        title=f"You've been assigned to {student_name}",
        message=f"{actor} assigned you as {role_label.lower()} for {student_name}.",
        link=link,
        actor_name=actor,
        dedupe_key=dedupe_key,
    )


def notify_parent_team_updated(student, staff_user, role_label, assigned_by=None, dedupe_key=''):
    """Warm parent-facing notice when a specialist or teacher is added to the team."""
    from api.models import StudentAccess

    student_name = f"{student.first_name} {student.last_name}"
    staff_name = _user_display_name(staff_user)
    link = f"/workspace?studentId={student.id}&workspace=team"

    parents = StudentAccess.objects.filter(
        student=student,
        user__role='PARENT',
    ).select_related('user')
    for sa in parents:
        notify_user_in_app(
            user=sa.user,
            notification_type='SPECIALIST_ASSIGNED' if staff_user.role == 'SPECIALIST' else 'TEACHER_ASSIGNED',
            title=f"{student_name}'s team was updated",
            message=f"{staff_name} was added as {role_label.lower()} for {student_name}.",
            link=link,
            actor_name=_user_display_name(assigned_by) if assigned_by else "ARASE",
            dedupe_key=dedupe_key,
        )


def notify_staff_unassigned(student, staff_user, role_label, unassigned_by=None):
    """Notify a staff member that they were removed from a student's team."""
    student_name = f"{student.first_name} {student.last_name}"
    actor = _user_display_name(unassigned_by) if unassigned_by else "Admin"
    notify_user_in_app(
        user=staff_user,
        notification_type='SYSTEM',
        title=f"Removed from team: {student_name}",
        message=f"{actor} removed you as {role_label.lower()} for {student_name}.",
        link=f"/workspace?studentId={student.id}",
        actor_name=actor,
    )


def notify_parent_team_member_removed(student, staff_user, role_label, unassigned_by=None):
    """Warm parent-facing notice when someone is removed from the child's team."""
    from api.models import StudentAccess

    student_name = f"{student.first_name} {student.last_name}"
    staff_name = _user_display_name(staff_user)
    parents = StudentAccess.objects.filter(
        student=student,
        user__role='PARENT',
    ).select_related('user')
    for sa in parents:
        notify_user_in_app(
            user=sa.user,
            notification_type='SYSTEM',
            title=f"{student_name}'s team was updated",
            message=f"{staff_name} was removed as {role_label.lower()} for {student_name}.",
            link=f"/workspace?studentId={student.id}&workspace=team",
            actor_name=_user_display_name(unassigned_by) if unassigned_by else "ARASE",
        )


def notify_specialist_form_finalized(user, student, cycle, form_label):
    """Notify admins once the full specialist-owned assessment/tracker is finalized."""
    from api.models import Notification
    from django.utils import timezone

    student_name = f"{student.first_name} {student.last_name}"
    actor = _user_display_name(user) if user else "Specialist team"
    form_tab_map = {
        'Specialist Assessment': 'multi_assessment',
        'Specialist Progress': 'multi_tracker',
    }
    form_tab = form_tab_map.get(form_label, '')
    link = f"/workspace?studentId={student.id}&workspace=forms"
    if form_tab:
        link += f"&tab={form_tab}"

    base_dedupe_key = f"specialist-form-finalized:{form_label}:{student.id}:{cycle.id}"
    is_refinalization = Notification.objects.filter(dedupe_key=base_dedupe_key).exists()

    if is_refinalization:
        verb = "refinalized"
        dedupe_key = f"{base_dedupe_key}:refinalize-{timezone.now().timestamp()}"
    else:
        verb = "finalized"
        dedupe_key = base_dedupe_key

    notify_admins_in_app(
        notification_type='FORM_SUBMITTED',
        title=f"{form_label} {verb} for {student_name}",
        message=f"{actor} {verb} the {form_label.lower()}.",
        link=link,
        exclude_user=user,
        actor_name=actor,
        dedupe_key=dedupe_key,
    )


def notify_iep_finalized(student, doc_id):
    """Notify parents and assigned specialists when the finalized IEP is ready."""
    from api.models import StudentAccess

    student_name = f"{student.first_name} {student.last_name}"
    link = f"/workspace?studentId={student.id}&workspace=reports&view=iep&docId={doc_id}"
    access_entries = StudentAccess.objects.filter(
        student=student,
        user__role__in=['PARENT', 'SPECIALIST'],
    ).select_related('user')

    for access in access_entries:
        user = access.user
        if user.role == 'PARENT':
            title = f"{student_name}'s IEP is ready"
            message = f"The finalized IEP for {student_name} is ready to view."
        else:
            title = f"IEP finalized: {student_name}"
            message = "The IEP has been finalized and is ready to view."

        notify_user_in_app(
            user=user,
            notification_type='IEP_GENERATED',
            title=title,
            message=message,
            link=link,
            actor_name="ARASE",
            dedupe_key=f"iep-finalized:{doc_id}",
        )


def notify_monthly_report_finalized(student, doc_id):
    """Notify parents, specialists, and teachers when a monthly report is ready."""
    from api.models import StudentAccess

    student_name = f"{student.first_name} {student.last_name}"
    link = f"/workspace?studentId={student.id}&workspace=reports&view=monthly&docId={doc_id}"
    access_entries = StudentAccess.objects.filter(
        student=student,
        user__role__in=['PARENT', 'SPECIALIST', 'TEACHER'],
    ).select_related('user')

    for access in access_entries:
        user = access.user
        if user.role == 'PARENT':
            title = f"{student_name}'s monthly report is ready"
            message = f"The finalized monthly progress report for {student_name} is ready to view."
        else:
            title = f"Monthly report finalized: {student_name}"
            message = "The monthly progress report has been finalized and is ready to view."

        notify_user_in_app(
            user=user,
            notification_type='REPORT_FINALIZED',
            title=title,
            message=message,
            link=link,
            actor_name="ARASE",
            dedupe_key=f"monthly-report-finalized:{doc_id}",
        )


def notify_new_user_registered(new_user):
    """Notify admins when a new user accepts an invitation and registers."""
    name = _user_display_name(new_user)
    role = new_user.get_role_display() if hasattr(new_user, 'get_role_display') else new_user.role

    notify_admins_in_app(
        notification_type='SYSTEM',
        title=f"New {role.lower()} registered: {name}",
        message=f"{name} accepted their invitation and created an account.",
        link=f"/dashboard?tab=users",
        actor_name=name,
    )


# ─── Assessment Scheduling Notifications ─────────────────────────────────────

def notify_assessment_scheduled(appointment, booked_by=None):
    """Notify specialist, parent, and admins about a scheduled assessment."""
    from django.utils import timezone as tz
    student_name = f"{appointment.student.first_name} {appointment.student.last_name}"
    when = tz.localtime(appointment.start_at).strftime("%b %d, %Y %I:%M %p")
    link = f"/workspace?studentId={appointment.student_id}&workspace=forms&tab=multi_assessment"
    actor = _user_display_name(booked_by) if booked_by else "System"

    recipients = [r for r in [appointment.specialist, appointment.parent] if r and r != booked_by]
    for recipient in recipients:
        notify_user_in_app(
            user=recipient,
            notification_type='SYSTEM',
            title=f"Assessment scheduled for {student_name}",
            message=f"The online assessment is scheduled for {when}.",
            link=link,
            actor_name=actor,
        )

    notify_admins_in_app(
        'SYSTEM',
        f"Assessment scheduled for {student_name}",
        f"Assessment scheduled for {when}.",
        link=link,
        exclude_user=booked_by,
        actor_name=actor,
    )


def notify_assessment_cancelled(appointment, cancelled_by):
    """Notify specialist, parent, and admins about a cancelled assessment."""
    from django.utils import timezone as tz
    student_name = f"{appointment.student.first_name} {appointment.student.last_name}"
    when = tz.localtime(appointment.start_at).strftime("%b %d, %Y %I:%M %p")
    link = f"/workspace?studentId={appointment.student_id}&workspace=forms&tab=multi_assessment"
    actor = _user_display_name(cancelled_by)

    recipients = [r for r in [appointment.specialist, appointment.parent] if r and r != cancelled_by]
    for recipient in recipients:
        notify_user_in_app(
            user=recipient,
            notification_type='SYSTEM',
            title=f"Assessment cancelled for {student_name}",
            message=f"The assessment scheduled for {when} was cancelled by {actor}.",
            link=link,
            actor_name=actor,
        )

    notify_admins_in_app(
        'SYSTEM',
        f"Assessment cancelled for {student_name}",
        f"The assessment scheduled for {when} was cancelled by {actor}.",
        link=link,
        exclude_user=cancelled_by,
        actor_name=actor,
    )


# ─── Reminder Notifications ──────────────────────────────────────────────────

def notify_tracker_reminder(user, student, days_remaining):
    """
    Remind a user (parent/specialist/teacher) to submit their monthly tracker.
    """
    student_name = f"{student.first_name} {student.last_name}"
    subject = f"Reminder: Monthly tracker for {student_name} is due"
    message = (
        f"Hi {user.first_name or user.email},\n\n"
        f"This is a friendly reminder that your monthly progress tracker "
        f"for {student_name} is due in {days_remaining} day(s).\n\n"
        f"Please log in to ARASE to submit your tracker.\n\n"
        f"— The ARASE Team"
    )
    _send_email(user.email, subject, message)
    if user.phone_number and user.is_phone_verified:
        _send_sms(user.phone_number, f"ARASE: Monthly tracker for {student_name} due in {days_remaining} day(s). Please log in to submit.")


def notify_parent_assessment_reminder(user, student):
    """
    Remind a parent to complete the initial parent assessment for a student.
    """
    student_name = f"{student.first_name} {student.last_name}"
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    form_url = f"{frontend_url}/parent-onboarding?studentId={student.id}"
    title = f"Checking in on {student.first_name}'s assessment"
    email_message = (
        f"Hi {user.first_name or user.email},\n\n"
        f"We hope you're doing well!\n\n"
        f"We wanted to quickly check in and see if you had a moment to complete the parent assessment for {student.first_name}. "
        f"Your insights as a parent are incredibly valuable and help us provide the best possible support.\n\n"
        f"You can complete it right here whenever you're ready:\n"
        f"{form_url}\n\n"
        f"Warmly,\n"
        f"The ARASE Team"
    )

    notify_user_in_app(
        user=user,
        notification_type='REMINDER',
        title=title,
        message=f"We're excited to learn more about {student.first_name}! Please take a few minutes to share your insights when you get a chance.",
        link=f"/parent-onboarding?studentId={student.id}",
        actor_name="ARASE",
    )
    _send_email(user.email, f"Checking in: Parent assessment for {student.first_name}", email_message)
    if user.phone_number and user.is_phone_verified:
        _send_sms(user.phone_number, f"ARASE: Hi! Just checking in to see if you had a moment to complete the parent assessment for {student.first_name}.")


def notify_specialist_assessment_reminder(user, student):
    """
    Remind a specialist to complete/finalize the multidisciplinary assessment for a student.
    """
    student_name = f"{student.first_name} {student.last_name}"
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    form_url = f"{frontend_url}/workspace?studentId={student.id}&workspace=forms&tab=multi_assessment"
    email_message = (
        f"Hi {user.first_name or user.email},\n\n"
        f"This is a friendly reminder to complete and finalize the specialist assessment for {student_name}.\n\n"
        f"You can continue the assessment here:\n"
        f"{form_url}\n\n"
        f"Thank you,\n"
        f"The ARASE Team"
    )

    notify_user_in_app(
        user=user,
        notification_type='REMINDER',
        title=f"Specialist assessment reminder: {student_name}",
        message=f"Please complete and finalize the specialist assessment for {student_name}.",
        link=f"/workspace?studentId={student.id}&workspace=forms&tab=multi_assessment",
        actor_name="ARASE",
    )
    _send_email(user.email, f"Reminder: Specialist assessment for {student_name}", email_message)
    if user.phone_number and user.is_phone_verified:
        _send_sms(user.phone_number, f"ARASE: Please complete the specialist assessment for {student_name}.")


def notify_report_ready(admin_user, student, report_id):
    """
    Notify an admin that a monthly report was auto-generated and is ready for review.
    """
    student_name = f"{student.first_name} {student.last_name}"
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    report_url = f"{frontend_url}/workspace?studentId={student.id}&workspace=reports"
    total_required = 3 if student.status == 'INTEGRATED' else 2
    subject = f"Monthly report auto-generated for {student_name}"
    message = (
        f"Hi {admin_user.first_name or 'Admin'},\n\n"
        f"All {total_required} progress trackers have been submitted for {student_name}. "
        f"The monthly progress report has been automatically generated and saved as a DRAFT.\n\n"
        f"Please review and finalize it here:\n"
        f"{report_url}\n\n"
        f"— ARASE System"
    )
    _send_email(admin_user.email, subject, message)


def notify_parent_report_finalized(parent_user, student, report_id):
    """
    Notify a parent that their child's monthly report has been finalized.
    """
    student_name = f"{student.first_name} {student.last_name}"
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    report_url = f"{frontend_url}/students/{student.id}"
    subject = f"Monthly progress report ready for {student_name}"
    email_message = (
        f"Hi {parent_user.first_name or parent_user.email},\n\n"
        f"The monthly progress report for {student_name} has been finalized "
        f"and is now available for you to review.\n\n"
        f"View it here: {report_url}\n\n"
        f"— The ARASE Team"
    )

    # In-app notification for parent
    notify_user_in_app(
        user=parent_user,
        notification_type='REPORT_FINALIZED',
        title=f"Monthly report ready for {student_name}",
        message="The monthly progress report has been finalized and is ready for you to review.",
        link=f"/workspace?studentId={student.id}&workspace=reports",
        actor_name="ARASE",
    )

    _send_email(parent_user.email, subject, email_message)
    if parent_user.phone_number and parent_user.is_phone_verified:
        _send_sms(
            parent_user.phone_number,
            f"ARASE: The monthly report for {student_name} is ready. Log in to view it."
        )


def send_tracker_reminders_for_all_students():
    """
    Bulk operation: Find all enrolled students with incomplete trackers
    in active cycles and send reminders to relevant users.
    Designed to be called from an admin button or external cron.
    """
    from api.models import (
        Student, ReportCycle, StudentAccess,
        ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker,
    )
    from datetime import date

    today = date.today()
    active_cycles = ReportCycle.objects.filter(
        is_active=True,
        status__in=['OPEN', 'GRACE'],
        student__status='ENROLLED',
    ).select_related('student')

    sent_count = 0
    for cycle in active_cycles:
        student = cycle.student
        days_remaining = max(0, (cycle.end_date - today).days)

        # Check which trackers are missing
        has_parent = ParentProgressTracker.objects.filter(student=student, report_cycle=cycle).exists()
        has_multi = MultidisciplinaryProgressTracker.objects.filter(student=student, report_cycle=cycle).exists()
        has_sped = SpedProgressTracker.objects.filter(student=student, report_cycle=cycle).exists()

        access_entries = StudentAccess.objects.filter(student=student).select_related('user')

        for sa in access_entries:
            user = sa.user
            if user.role == 'PARENT' and not has_parent:
                notify_tracker_reminder(user, student, days_remaining)
                sent_count += 1
            elif user.role == 'SPECIALIST' and not has_multi:
                notify_tracker_reminder(user, student, days_remaining)
                sent_count += 1
            elif user.role == 'TEACHER' and not has_sped:
                notify_tracker_reminder(user, student, days_remaining)
                sent_count += 1

    logger.info("Sent %d tracker reminder(s)", sent_count)
    return sent_count


def send_assessment_appointment_reminders():
    """
    Send in-app reminders for scheduled online assessments happening in the next 24 hours.
    """
    from django.utils import timezone
    from datetime import timedelta
    from api.models import AssessmentAppointment

    now = timezone.now()
    upcoming = now + timedelta(hours=24)
    appointments = (
        AssessmentAppointment.objects
        .filter(
            status='SCHEDULED',
            reminder_24h_sent_at__isnull=True,
            start_at__gt=now,
            start_at__lte=upcoming,
        )
        .select_related('student', 'parent', 'specialist')
    )

    sent_count = 0
    for appointment in appointments:
        student_name = f"{appointment.student.first_name} {appointment.student.last_name}"
        when = timezone.localtime(appointment.start_at).strftime("%b %d, %Y %I:%M %p")
        link = f"/workspace?studentId={appointment.student_id}&workspace=forms&tab=multi_assessment"
        recipients = [appointment.specialist]
        if appointment.parent:
            recipients.append(appointment.parent)
        for recipient in recipients:
            notify_user_in_app(
                user=recipient,
                notification_type='REMINDER',
                title=f"Assessment reminder: {student_name}",
                message=f"Online assessment is scheduled for {when}.",
                link=link,
                actor_name="ARASE",
            )
            sent_count += 1
        appointment.reminder_24h_sent_at = now
        appointment.save(update_fields=['reminder_24h_sent_at'])

    logger.info("Sent %d assessment appointment reminder(s)", sent_count)
    return sent_count


# ─── Internal Helpers ─────────────────────────────────────────────────────────

def _send_email(to_email, subject, text_body):
    """Send a simple email. Fails silently with a log warning."""
    try:
        from django.core.mail import send_mail
        send_mail(
            subject=subject,
            message=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to_email],
            fail_silently=False,
        )
        logger.info("[Notification] Email sent to %s: %s", to_email, subject)
    except Exception as e:
        logger.warning("[Notification] Email failed to %s: %s", to_email, e)


def _send_sms(phone_number, message):
    """Send an SMS via the SMS service. Fails silently with a log warning."""
    try:
        from api.services.sms_service import send_sms
        send_sms(phone_number, message)
    except Exception as e:
        logger.warning("[Notification] SMS failed to %s: %s", phone_number, e)
