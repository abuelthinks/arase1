"""
IEP generation business logic extracted from views.py.
"""

from api.models import (
    Student, ReportCycle, GeneratedDocument,
    ParentAssessment, MultidisciplinaryAssessment, SpedAssessment,
)


def collect_iep_inputs(student, cycle):
    """
    Collects form inputs required for IEP generation.
    Returns: dict of model instances (or None)
    """
    return {
        'parent_assessment': ParentAssessment.objects.filter(student=student, report_cycle=cycle).first(),
        'multi_assessment': MultidisciplinaryAssessment.objects.filter(student=student, report_cycle=cycle).first(),
        'sped_assessment': SpedAssessment.objects.filter(student=student, report_cycle=cycle).first(),
    }


def run_iep_generation(student_id, cycle_id):
    """
    Runs the full IEP generation and persists the result.
    Can be called synchronously or from a Celery task.

    Returns: (doc, iep_data)
    """
    from api.iep_generator import generate_iep

    student = Student.objects.get(id=student_id)
    cycle = ReportCycle.objects.get(id=cycle_id)
    inputs = collect_iep_inputs(student, cycle)

    iep_data = generate_iep(student, cycle, inputs)

    doc = GeneratedDocument.objects.create(
        student=student,
        report_cycle=cycle,
        document_type='IEP',
        iep_data=iep_data,
    )

    return doc, iep_data


def run_weekly_report_generation(student_id, cycle_id):
    """
    Runs the full weekly report generation and persists the result.
    Can be called synchronously or from a Celery task.

    Returns: (doc, report_data)
    """
    from api.weekly_report_generator import generate_weekly_report
    from api.models import ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker

    student = Student.objects.get(id=student_id)
    cycle = ReportCycle.objects.get(id=cycle_id)

    inputs = {
        'parent_tracker': ParentProgressTracker.objects.filter(student=student, report_cycle=cycle).order_by('-created_at').first(),
        'multi_tracker': MultidisciplinaryProgressTracker.objects.filter(student=student, report_cycle=cycle).order_by('-created_at').first(),
        'sped_tracker': SpedProgressTracker.objects.filter(student=student, report_cycle=cycle).order_by('-created_at').first(),
    }

    report_data = generate_weekly_report(student, cycle, inputs)

    doc = GeneratedDocument.objects.create(
        student=student,
        report_cycle=cycle,
        document_type='WEEKLY',
        iep_data=report_data,  # reusing iep_data JSONField
    )

    return doc, report_data
