"""
Notification Service
=====================
Centralised notification dispatch for the monthly cycle workflow.
Uses both email and SMS channels.  Gracefully degrades if either fails.
"""

import logging
from django.conf import settings

logger = logging.getLogger(__name__)


def notify_admins_in_app(notification_type, title, message, link=''):
    """
    Create an in-app notification for every admin user.
    """
    from api.models import Notification, User

    admins = User.objects.filter(role='ADMIN')
    notifications = [
        Notification(
            recipient=admin,
            notification_type=notification_type,
            title=title,
            message=message,
            link=link,
        )
        for admin in admins
    ]
    if notifications:
        Notification.objects.bulk_create(notifications)


def notify_tracker_reminder(user, student, days_remaining):
    """
    Remind a user (parent/specialist/teacher) to submit their monthly tracker.
    """
    student_name = f"{student.first_name} {student.last_name}"
    subject = f"Reminder: Monthly tracker for {student_name} is due"
    message = (
        f"Hi {user.first_name or user.username},\n\n"
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
    from api.models import Notification

    student_name = f"{student.first_name} {student.last_name}"
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    form_url = f"{frontend_url}/parent-onboarding?studentId={student.id}"
    title = f"Parent assessment needed for {student_name}"
    message = (
        f"Hi {user.first_name or user.username},\n\n"
        f"This is a friendly reminder to complete the parent assessment for {student_name}.\n\n"
        f"Complete it here: {form_url}\n\n"
        f"â€” The ARASE Team"
    )

    Notification.objects.create(
        recipient=user,
        notification_type='REMINDER',
        title=title,
        message=f"Please complete the parent assessment for {student_name}.",
        link=f"/parent-onboarding?studentId={student.id}",
    )
    _send_email(user.email, title, message)
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
    message = (
        f"Hi {parent_user.first_name or parent_user.username},\n\n"
        f"The monthly progress report for {student_name} has been finalized "
        f"and is now available for you to review.\n\n"
        f"View it here: {report_url}\n\n"
        f"— The ARASE Team"
    )
    _send_email(parent_user.email, subject, message)
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
