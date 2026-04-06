"""
Report generation business logic extracted from views.py.
"""

from api.models import (
    Student, ReportCycle, GeneratedDocument,
    ParentAssessment, MultidisciplinaryAssessment, SpedAssessment,
    ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker,
)


def build_report_inputs(student, cycle):
    """
    Collects all form inputs for report generation.
    Returns: dict of model instances (or None)
    """
    return {
        'parent_assessment': ParentAssessment.objects.filter(student=student, report_cycle=cycle).first(),
        'multi_assessment': MultidisciplinaryAssessment.objects.filter(student=student, report_cycle=cycle).first(),
        'sped_assessment': SpedAssessment.objects.filter(student=student, report_cycle=cycle).first(),
        'parent_tracker': ParentProgressTracker.objects.filter(student=student, report_cycle=cycle).first(),
        'multi_tracker': MultidisciplinaryProgressTracker.objects.filter(student=student, report_cycle=cycle).first(),
        'sped_tracker': SpedProgressTracker.objects.filter(student=student, report_cycle=cycle).first(),
    }


def generate_draft_data(student, cycle, inputs, doc_type):
    """
    Generates draft data based on document type.
    Returns: dict of draft data
    """
    from api.document_extractor import extract_assessment_draft, extract_iep_draft, extract_monthly_draft

    if doc_type == 'ASSESSMENT':
        return extract_assessment_draft(student, cycle, inputs)
    elif doc_type == 'IEP':
        return extract_iep_draft(student, cycle, inputs)
    elif doc_type == 'MONTHLY':
        return extract_monthly_draft(student, cycle, inputs)
    return {}


def generate_final_pdf(student, cycle, doc_type, draft_data):
    """
    Generates the final PDF from draft data and saves a GeneratedDocument.
    Returns: (doc, file_url_path)
    """
    from api.document_generator import generate_pdf_from_draft

    filename = f"{student.last_name}_{student.first_name}_{doc_type}_{cycle.start_date}.pdf"
    file_name, file_content = generate_pdf_from_draft(student, cycle, draft_data, filename)

    doc = GeneratedDocument.objects.create(
        student=student,
        report_cycle=cycle,
        document_type=doc_type,
    )
    doc.file.save(file_name, file_content)

    return doc
