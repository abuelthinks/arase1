"""
Cycle Management Service
=========================
Handles monthly cycle rotation, lazy creation, and carry-forward of
recommendations from previous reports.

Documents are never generated from here — an admin reviews the submitted
inputs and triggers the IEP or the monthly report explicitly.
"""

import logging
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from api.models import (
    ReportCycle, GeneratedDocument,
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
    if student.status not in ('ENROLLED', 'INTEGRATED'):
        # Non-enrolled students keep whatever cycle they have (assessment cycle)
        return ReportCycle.objects.filter(student=student, is_active=True).first()

    today = date.today()
    month_start = today.replace(day=1)
    month_end = (month_start + relativedelta(months=1)) - timedelta(days=1)

    # Look for an active MONTHLY cycle that covers this month. The six-month
    # assessment cycle created at registration also overlaps the current month,
    # so filter it out by span — otherwise it stays active forever and monthly
    # cycles are never created for enrolled students.
    cycle = None
    for candidate in ReportCycle.objects.filter(student=student, is_active=True):
        covers_month = candidate.start_date <= month_end and candidate.end_date >= month_start
        is_monthly = (candidate.end_date - candidate.start_date).days <= 31
        if covers_month and is_monthly:
            cycle = candidate
            break

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
    try:
        from api.services.realtime_service import create_activity_event
        create_activity_event(
            event_type='STUDENT_UPDATED',
            title=f"New cycle opened for {student}",
            student=student,
            metadata={'cycle_id': cycle.id},
        )
    except Exception:
        pass
    return cycle


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
    m = MultidisciplinaryProgressTracker.objects.filter(
        student=student,
        report_cycle=cycle,
        finalized_at__isnull=False,
    ).exists()
    teacher_required = student.status == 'INTEGRATED'
    s = teacher_required and SpedProgressTracker.objects.filter(student=student, report_cycle=cycle).exists()
    submitted_count = sum([p, m, s])
    total_required = 3 if teacher_required else 2

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
            'total': total_required,
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
    try:
        from api.services.realtime_service import create_activity_event
        create_activity_event(
            event_type='STUDENT_UPDATED',
            title=f"Cycle completed for {cycle.student}",
            student=cycle.student,
            metadata={'cycle_id': cycle.id},
        )
    except Exception:
        pass
