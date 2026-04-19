"""
Celery tasks for async processing.
These tasks are dispatched from views and run in the background by Celery workers.
"""

from celery import shared_task


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def generate_iep_task(self, student_id, cycle_id, user_id=None):
    """
    Generate an IEP asynchronously using OpenAI.
    Returns the generated document ID.
    """
    try:
        from api.services.iep_service import run_iep_generation
        doc, iep_data = run_iep_generation(student_id, cycle_id)
        if user_id:
            from django.contrib.auth import get_user_model
            from api.services.document_service import record_document_version
            User = get_user_model()
            try:
                user = User.objects.get(id=user_id)
                record_document_version(doc, user, 'GENERATED')
            except User.DoesNotExist:
                pass
        return {'doc_id': doc.id, 'status': 'completed'}
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def generate_monthly_report_task(self, student_id, cycle_id, user_id=None):
    """
    Generate a Monthly Report asynchronously using OpenAI.
    Returns the generated document ID.
    """
    try:
        from api.services.iep_service import run_monthly_report_generation
        doc, report_data = run_monthly_report_generation(student_id, cycle_id)
        if user_id:
            from django.contrib.auth import get_user_model
            from api.services.document_service import record_document_version
            User = get_user_model()
            try:
                user = User.objects.get(id=user_id)
                record_document_version(doc, user, 'GENERATED')
            except User.DoesNotExist:
                pass
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
@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def translate_form_data_task(self, model_name, instance_id):
    """
    Translate form data for a given model instance asynchronously.
    """
    try:
        from django.apps import apps
        from api.services.translation_service import translate_form_data
        
        ModelClass = apps.get_model('api', model_name)
        instance = ModelClass.objects.get(id=instance_id)
        
        if instance.form_data:
            translated_data, detected_lang = translate_form_data(instance.form_data)
            instance.translated_data = translated_data
            instance.original_language = detected_lang
            instance.save(update_fields=['translated_data', 'original_language'])
            
            return {'instance_id': instance.id, 'language': detected_lang, 'status': 'completed'}
        return {'instance_id': instance.id, 'status': 'skipped', 'reason': 'no form_data'}
    except Exception as exc:
        raise self.retry(exc=exc)
