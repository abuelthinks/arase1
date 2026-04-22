"""
IEP generation business logic extracted from views.py.
"""
import logging

from django.db import transaction

from api.models import (
    Student, ReportCycle, GeneratedDocument,
    ParentAssessment, MultidisciplinaryAssessment, SpedAssessment,
)

logger = logging.getLogger(__name__)


def collect_iep_inputs(student, cycle):
    """
    Collects form inputs required for IEP generation.
    Returns: dict of model instances (or None)
    """
    return {
        'parent_assessment': ParentAssessment.objects.filter(student=student, report_cycle=cycle).first(),
        'multi_assessment': MultidisciplinaryAssessment.objects.filter(student=student, report_cycle=cycle).first(),
    }


def run_iep_generation(student_id, cycle_id):
    """
    Runs the full IEP generation and persists the result.
    Returns: (doc, iep_data)
    """
    from api.iep_generator import generate_iep

    student = Student.objects.get(id=student_id)
    cycle = ReportCycle.objects.get(id=cycle_id)

    existing_doc = GeneratedDocument.objects.filter(
        student=student,
        report_cycle=cycle,
        document_type='IEP',
    ).order_by('-created_at').first()
    if existing_doc:
        logger.info(
            "IEP already exists for student=%s cycle=%s (doc_id=%s); skipping duplicate generation.",
            student.id,
            cycle.id,
            existing_doc.id,
        )
        return existing_doc, existing_doc.iep_data or {}

    inputs = collect_iep_inputs(student, cycle)

    iep_data = generate_iep(student, cycle, inputs)

    doc = GeneratedDocument.objects.create(
        student=student,
        report_cycle=cycle,
        document_type='IEP',
        iep_data=iep_data,
    )

    # Generate PDF and save to storage (S3 in production, local in dev)
    try:
        from api.document_generator import _generate_iep_pdf
        filename = f"{student.last_name}_{student.first_name}_IEP_{cycle.start_date}.pdf"
        file_content = _generate_iep_pdf(student, iep_data)
        doc.file.save(filename, file_content, save=True)
        logger.info("IEP PDF saved to storage for student=%s (doc_id=%s)", student.id, doc.id)
    except Exception as e:
        logger.warning("Could not save IEP PDF to storage: %s", e)

    return doc, iep_data


def _extract_regression_flags(report_data):
    """Pull regression/alert language from concerns across all domains."""
    flags = []
    domains = [
        'communication_progress', 'behavioral_social_progress',
        'academic_progress', 'motor_sensory_progress', 'daily_living_independence',
    ]
    for domain in domains:
        concerns = report_data.get(domain, {}).get('concerns', [])
        for concern in concerns:
            if any(word in concern.lower() for word in ['regress', 'decline', 'worse', 'alert', 'self-harm', 'aggress']):
                flags.append(f"[{domain.replace('_', ' ').title()}] {concern}")
    return "; ".join(flags) if flags else "No regression indicators reported."


def _extract_attendance(report_data):
    """Pull attendance info from therapy session summary."""
    tss = report_data.get('therapy_session_summary', {})
    sessions = tss.get('sessions_completed', 'N/A')
    attendance = tss.get('attendance', 'N/A')
    discipline = tss.get('discipline', '')
    return f"{discipline}: {sessions} session(s) — {attendance}".strip(': ')


def _update_iep_section10(student, cycle, report_data):
    """Find the student's latest IEP and update Section 10 with progress data."""
    iep_qs = GeneratedDocument.objects.filter(
        student=student, document_type='IEP'
    ).order_by('-created_at')
    latest_iep = iep_qs.filter(status='FINAL').first() or iep_qs.first()

    if not latest_iep or not latest_iep.iep_data:
        logger.info("No IEP found for student=%s — skipping Section 10 update.", student.id)
        return

    iep_data = latest_iep.iep_data
    iep_data['section10_progress'] = {
        'gas_scores': report_data.get('goal_achievement_scores', []),
        'narrative_summary': report_data.get('executive_summary', ''),
        'regression_indicators': _extract_regression_flags(report_data),
        'attendance_summary': _extract_attendance(report_data),
        'last_updated': str(cycle.end_date),
        'report_period': report_data.get('report_period', ''),
    }
    latest_iep.iep_data = iep_data
    latest_iep.save()
    logger.info("IEP Section 10 updated for student=%s (iep_id=%s)", student.id, latest_iep.id)


def run_monthly_report_generation(student_id, cycle_id):
    """
    Runs the full monthly report generation and persists the result.
    Also auto-updates IEP Section 10 (Progress Monitoring) with fresh GAS data.
    Returns: (doc, report_data)
    """
    from api.monthly_report_generator import generate_monthly_report
    from api.models import ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker

    with transaction.atomic():
        cycle = ReportCycle.objects.select_for_update().get(id=cycle_id)
        student = Student.objects.get(id=student_id)
        existing_doc = GeneratedDocument.objects.filter(
            student=student,
            report_cycle=cycle,
            document_type='MONTHLY',
        ).order_by('-created_at').first()
        if existing_doc:
            if cycle.status == 'GENERATING':
                cycle.status = 'COMPLETED'
                cycle.save(update_fields=['status'])
            logger.info(
                "Monthly report already exists for student=%s cycle=%s (doc_id=%s); skipping duplicate generation.",
                student.id,
                cycle.id,
                existing_doc.id,
            )
            return existing_doc, existing_doc.iep_data or {}

    inputs = {
        'parent_tracker': ParentProgressTracker.objects.filter(student=student, report_cycle=cycle).order_by('-created_at').first(),
        'multi_tracker': MultidisciplinaryProgressTracker.objects.filter(student=student, report_cycle=cycle).order_by('-created_at').first(),
        'sped_tracker': SpedProgressTracker.objects.filter(student=student, report_cycle=cycle).order_by('-created_at').first(),
    }

    report_data = generate_monthly_report(student, cycle, inputs)

    doc = GeneratedDocument.objects.create(
        student=student,
        report_cycle=cycle,
        document_type='MONTHLY',
        iep_data=report_data,  # reusing iep_data JSONField
    )

    # Generate PDF and save to storage (S3 in production, local in dev)
    try:
        from api.document_generator import _generate_monthly_pdf
        filename = f"{student.last_name}_{student.first_name}_MonthlyReport_{cycle.start_date}.pdf"
        file_content = _generate_monthly_pdf(student, report_data)
        doc.file.save(filename, file_content, save=True)
        logger.info("Monthly report PDF saved to storage for student=%s (doc_id=%s)", student.id, doc.id)
    except Exception as e:
        logger.warning("Could not save monthly report PDF to storage: %s", e)

    # Auto-update IEP Section 10 with the fresh progress data
    try:
        _update_iep_section10(student, cycle, report_data)
    except Exception as e:
        logger.warning("Could not update IEP Section 10: %s", e)

    if cycle.status == 'GENERATING':
        cycle.status = 'COMPLETED'
        cycle.save(update_fields=['status'])

    return doc, report_data
