"""
Celery tasks for async processing.
These tasks are dispatched from views and run in the background by Celery workers.
"""

from celery import shared_task


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def generate_iep_task(self, student_id, cycle_id):
    """
    Generate an IEP asynchronously using Gemini AI.
    Returns the generated document ID.
    """
    try:
        from api.services.iep_service import run_iep_generation
        doc, iep_data = run_iep_generation(student_id, cycle_id)
        return {'doc_id': doc.id, 'status': 'completed'}
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def generate_weekly_report_task(self, student_id, cycle_id):
    """
    Generate a Weekly Report asynchronously using Gemini AI.
    Returns the generated document ID.
    """
    try:
        from api.services.iep_service import run_weekly_report_generation
        doc, report_data = run_weekly_report_generation(student_id, cycle_id)
        return {'doc_id': doc.id, 'status': 'completed'}
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def generate_report_final_task(self, student_id, cycle_id, doc_type, draft_data):
    """
    Generate a final PDF report asynchronously.
    Returns the generated document ID.
    """
    try:
        from api.services.report_service import generate_final_pdf
        from api.models import Student, ReportCycle

        student = Student.objects.get(id=student_id)
        cycle = ReportCycle.objects.get(id=cycle_id)
        doc = generate_final_pdf(student, cycle, doc_type, draft_data)
        return {'doc_id': doc.id, 'file_url': doc.file.url if doc.file else '', 'status': 'completed'}
    except Exception as exc:
        raise self.retry(exc=exc)
