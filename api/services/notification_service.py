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

def notify_admins_in_app(notification_type, title, message, link='', exclude_user=None, actor_name=''):
    """
    Create an in-app notification for every admin user, optionally excluding
    the admin who triggered the action (to avoid self-notifications).
    """
    from api.models import Notification, User

    admins = User.objects.filter(role='ADMIN')
    if exclude_user and exclude_user.role == 'ADMIN':
        admins = admins.exclude(id=exclude_user.id)

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


def notify_user_in_app(user, notification_type, title, message, link='', actor_name=''):
    """Create an in-app notification for a specific user."""
    from api.models import Notification

    notification = Notification.objects.create(
        recipient=user,
        notification_type=notification_type,
        title=title,
        message=message,
        link=link,
        actor_name=actor_name,
    )
    _broadcast_notification(notification)
    return notification


# ─── Form Submission Notifications ────────────────────────────────────────────

def notify_form_submitted(user, student, form_label, link=''):
    """
    Notify admins when any user submits a form.
    Also notify relevant assigned users (specialists, teachers) about
    forms submitted by other roles for the same student.
    """
    from api.models import StudentAccess

    student_name = f"{student.first_name} {student.last_name}"
    actor = _user_display_name(user)

    # Notify admins (exclude the submitter if they are an admin)
    notify_admins_in_app(
        notification_type='FORM_SUBMITTED',
        title=f"{form_label} submitted for {student_name}",
        message=f"{actor} submitted the {form_label.lower()}.",
        link=link or f"/workspace?studentId={student.id}&workspace=forms",
        exclude_user=user,
        actor_name=actor,
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
            title=f"{form_label} submitted for {student_name}",
            message=f"{actor} submitted the {form_label.lower()}.",
            link=link or f"/workspace?studentId={student.id}&workspace=forms",
            actor_name=actor,
        )


def notify_tracker_progress(user, student, cycle, submitted_count):
    """
    Notify admins about tracker progress (e.g., "2/3 trackers submitted").
    """
    student_name = f"{student.first_name} {student.last_name}"
    actor = _user_display_name(user)
    label = cycle.label or "the active cycle"

    if submitted_count >= 3:
        title = f"All trackers submitted for {student_name}"
        message = f"All 3 progress trackers are in for {label}. Report auto-generation will begin."
    else:
        title = f"Tracker progress: {student_name} ({submitted_count}/3)"
        message = f"{actor} submitted a tracker for {label}."

    notify_admins_in_app(
        notification_type='FORM_SUBMITTED',
        title=title,
        message=message,
        link=f"/workspace?studentId={student.id}&workspace=forms",
        exclude_user=user,
        actor_name=actor,
    )


# ─── Auto-Generation Notifications ───────────────────────────────────────────

def notify_auto_report_ready(student, doc):
    """Notify admins that a monthly report was auto-generated and needs review."""
    student_name = f"{student.first_name} {student.last_name}"
    notify_admins_in_app(
        notification_type='REPORT_GENERATED',
        title=f"Monthly report ready: {student_name}",
        message=f"All trackers submitted. Draft report auto-generated and awaiting review.",
        link=f"/admin/monthly-report?id={doc.id}",
        actor_name="System",
    )

    # Also notify assigned parents that progress tracking is complete
    from api.models import StudentAccess
    parents = StudentAccess.objects.filter(
        student=student, user__role='PARENT'
    ).select_related('user')
    for sa in parents:
        notify_user_in_app(
            user=sa.user,
            notification_type='REPORT_GENERATED',
            title=f"Progress report in review for {student_name}",
            message="All monthly trackers have been submitted. The report is being reviewed.",
            link=f"/workspace?studentId={student.id}&workspace=documents",
            actor_name="System",
        )


def notify_auto_iep_ready(student, doc):
    """Notify admins that an IEP was auto-generated."""
    student_name = f"{student.first_name} {student.last_name}"
    notify_admins_in_app(
        notification_type='IEP_GENERATED',
        title=f"IEP draft ready for review: {student_name}",
        message="Multidisciplinary assessment finalized — IEP draft auto-generated. Review and finalize when ready.",
        link=f"/admin/iep?id={doc.id}",
        actor_name="System",
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


def notify_staff_assigned(student, staff_user, role_label, assigned_by=None):
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
    title = f"Parent assessment needed for {student_name}"
    email_message = (
        f"Hi {user.first_name or user.email},\n\n"
        f"This is a friendly reminder to complete the parent assessment for {student_name}.\n\n"
        f"Complete it here: {form_url}\n\n"
        f"— The ARASE Team"
    )

    notify_user_in_app(
        user=user,
        notification_type='REMINDER',
        title=title,
        message=f"Please complete the parent assessment for {student_name}.",
        link=f"/parent-onboarding?studentId={student.id}",
        actor_name="ARASE",
    )
    _send_email(user.email, title, email_message)
    if user.phone_number and user.is_phone_verified:
        _send_sms(user.phone_number, f"ARASE: Please complete the parent assessment for {student_name}.")


def notify_report_ready(admin_user, student, report_id):
    """
    Notify an admin that a monthly report was auto-generated and is ready for review.
    """
    student_name = f"{student.first_name} {student.last_name}"
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    report_url = f"{frontend_url}/admin/monthly-report?id={report_id}"
    subject = f"Monthly report auto-generated for {student_name}"
    message = (
        f"Hi {admin_user.first_name or 'Admin'},\n\n"
        f"All 3 progress trackers have been submitted for {student_name}. "
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
        link=f"/workspace?studentId={student.id}&workspace=documents",
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
