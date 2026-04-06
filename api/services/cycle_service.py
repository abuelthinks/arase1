"""
Cycle Management Service
=========================
Handles monthly cycle rotation, lazy creation, auto-generation triggers,
and carry-forward of recommendations from previous reports.
"""

import logging
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from api.models import (
    Student, ReportCycle, GeneratedDocument,
    ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker,
)

logger = logging.getLogger(__name__)

GRACE_PERIOD_DAYS = ReportCycle.GRACE_PERIOD_DAYS


# ─── Lazy Cycle Creation ─────────────────────────────────────────────────────

def ensure_current_cycle(student):
    """
    Ensures a ReportCycle exists for the current calendar month.
    Uses lazy evaluation — called on every profile/form access, no cron required.

    For mid-month enrollments the first cycle starts on the enrollment date
    but always ends on the last day of the month.

    Returns the active cycle.
    """
    if student.status != 'ENROLLED':
        # Non-enrolled students keep whatever cycle they have (assessment cycle)
        return ReportCycle.objects.filter(student=student, is_active=True).first()

    today = date.today()
    month_start = today.replace(day=1)
    month_end = (month_start + relativedelta(months=1)) - timedelta(days=1)

    # Look for an active cycle that covers this month
    cycle = ReportCycle.objects.filter(
        student=student,
        is_active=True,
        start_date__lte=month_end,
        end_date__gte=month_start,
    ).first()

    if cycle:
        # Check if we need to transition to GRACE status
        if cycle.status == 'OPEN' and today > cycle.end_date:
            grace_deadline = cycle.end_date + timedelta(days=GRACE_PERIOD_DAYS)
            if today <= grace_deadline:
                cycle.status = 'GRACE'
                cycle.save(update_fields=['status'])
            else:
                # Grace period expired — close this cycle
                cycle.is_active = False
                cycle.status = 'COMPLETED'
                cycle.save(update_fields=['is_active', 'status'])
                cycle = None  # Fall through to create a new one
        return cycle

    # Close any stale active cycles from prior months
    stale = ReportCycle.objects.filter(student=student, is_active=True)
    for old in stale:
        if old.status not in ('COMPLETED',):
            old.status = 'COMPLETED'
        old.is_active = False
        old.save(update_fields=['is_active', 'status'])

    # Create the new cycle
    label = today.strftime("%B %Y")  # e.g. "April 2026"
    cycle = ReportCycle.objects.create(
        student=student,
        label=label,
        start_date=month_start,
        end_date=month_end,
        is_active=True,
        status='OPEN',
    )
    logger.info("Created new cycle '%s' for student=%s", label, student.id)
    return cycle


# ─── Auto-Generation Trigger ─────────────────────────────────────────────────

def check_and_trigger_auto_generation(student, cycle):
    """
    Called after every tracker submission.  If all 3 trackers exist for this
    cycle, triggers monthly report generation (sync — no Celery dependency).

    The generated report is saved as DRAFT so the admin can review before
    finalising.

    Returns: (triggered: bool, doc_or_none)
    """
    if cycle.status in ('GENERATING', 'COMPLETED'):
        return False, None

    p = ParentProgressTracker.objects.filter(student=student, report_cycle=cycle).exists()
    m = MultidisciplinaryProgressTracker.objects.filter(student=student, report_cycle=cycle).exists()
    s = SpedProgressTracker.objects.filter(student=student, report_cycle=cycle).exists()

    if not (p and m and s):
        return False, None

    cycle.status = 'GENERATING'
    cycle.save(update_fields=['status'])

    # Try Celery first, fall back to synchronous generation
    try:
        from api.tasks import generate_monthly_report_task
        generate_monthly_report_task.delay(student.id, cycle.id)
        logger.info("Auto-generation dispatched via Celery for student=%s cycle=%s", student.id, cycle.id)
        return True, None
    except Exception:
        logger.info("Celery unavailable — running synchronous auto-generation for student=%s", student.id)
        try:
            from api.services.iep_service import run_monthly_report_generation
            doc, _ = run_monthly_report_generation(student.id, cycle.id)
            _notify_admins_report_ready(student, doc)
            return True, doc
        except Exception as exc:
            logger.error("Synchronous auto-generation failed for student=%s: %s", student.id, exc)
            cycle.status = 'OPEN'  # Reset so it can be retried
            cycle.save(update_fields=['status'])
            return False, None


# ─── Carry-Forward Recommendations ───────────────────────────────────────────

def get_previous_recommendations(student):
    """
    Returns the most recent monthly report's recommendations and focus areas
    so they can be displayed at the top of tracker forms as context.
    """
    latest = (
        GeneratedDocument.objects
        .filter(student=student, document_type='MONTHLY')
        .order_by('-created_at')
        .first()
    )
    if not latest or not latest.iep_data:
        return None

    data = latest.iep_data
    recs = data.get('recommendations', {})
    focus = data.get('next_month_focus_areas', [])

    # Flatten recommendations into a simple list
    all_recs = (
        recs.get('classroom', []) +
        recs.get('home_program', []) +
        recs.get('therapy_adjustments', [])
    )

    if not all_recs and not focus:
        return None

    return {
        'focus_areas': focus,
        'recommendations': all_recs,
        'report_period': data.get('report_period', ''),
        'report_id': latest.id,
    }


# ─── Cycle Status Summary ────────────────────────────────────────────────────

def get_cycle_status_summary(student, cycle):
    """
    Returns a display-ready dict of the cycle's current state for the frontend.
    """
    if not cycle:
        return None

    today = date.today()
    days_remaining = max(0, (cycle.end_date - today).days)
    grace_deadline = cycle.end_date + timedelta(days=GRACE_PERIOD_DAYS)

    p = ParentProgressTracker.objects.filter(student=student, report_cycle=cycle).exists()
    m = MultidisciplinaryProgressTracker.objects.filter(student=student, report_cycle=cycle).exists()
    s = SpedProgressTracker.objects.filter(student=student, report_cycle=cycle).exists()
    submitted_count = sum([p, m, s])

    # Check if a monthly report already exists for this cycle
    report = GeneratedDocument.objects.filter(
        student=student, report_cycle=cycle, document_type='MONTHLY'
    ).first()

    return {
        'cycle_id': cycle.id,
        'label': cycle.label or cycle.start_date.strftime("%B %Y"),
        'start_date': str(cycle.start_date),
        'end_date': str(cycle.end_date),
        'status': cycle.status,
        'days_remaining': days_remaining,
        'grace_deadline': str(grace_deadline),
        'trackers': {
            'parent': p,
            'specialist': m,
            'teacher': s,
            'submitted_count': submitted_count,
            'total': 3,
        },
        'report': {
            'exists': bool(report),
            'id': report.id if report else None,
            'status': report.status if report else None,
        } if report else None,
    }


# ─── Internal Helpers ─────────────────────────────────────────────────────────

def _notify_admins_report_ready(student, doc):
    """Notify all admin users that a monthly report was auto-generated."""
    try:
        from api.services.notification_service import notify_report_ready
        from api.models import User
        admins = User.objects.filter(role='ADMIN')
        for admin in admins:
            notify_report_ready(admin, student, doc.id)
    except Exception as e:
        logger.warning("Failed to notify admins about auto-generated report: %s", e)


def complete_cycle(cycle):
    """
    Mark a cycle as completed and deactivate it.
    Called when the admin finalises the monthly report.
    """
    cycle.status = 'COMPLETED'
    cycle.is_active = False
    cycle.save(update_fields=['status', 'is_active'])
    logger.info("Cycle %s completed for student=%s", cycle.id, cycle.student_id)
