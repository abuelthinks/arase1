"""
Report generation business logic extracted from views.py.
"""

from api.models import (
    Student, ReportCycle, GeneratedDocument,
    ParentAssessment, MultidisciplinaryAssessment,
    ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker,
    DiagnosticReport,
)


def build_report_inputs(student, cycle):
    """
    Collects all form inputs for report generation.
    Returns: dict of model instances (or None)
    """
    return {
        'parent_assessment': ParentAssessment.objects.filter(student=student, report_cycle=cycle).first(),
        'multi_assessment': MultidisciplinaryAssessment.objects.filter(student=student, report_cycle=cycle).first(),
        'diagnostic_report': DiagnosticReport.objects.filter(student=student).order_by('-created_at').first(),
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


def generate_assessment_document(student_id, cycle_id):
    """
    Generate the SPED Assessment document from parent + specialist inputs + diagnostic.
    Called by cycle_service.check_and_trigger_assessment_generation.
    Returns: GeneratedDocument
    """
    student = Student.objects.get(id=student_id)
    cycle = ReportCycle.objects.get(id=cycle_id)

    # Check for existing
    existing = GeneratedDocument.objects.filter(
        student=student, report_cycle=cycle, document_type='ASSESSMENT',
    ).first()
    if existing:
        return existing

    inputs = {
        'parent_assessment': ParentAssessment.objects.filter(student=student, report_cycle=cycle).first(),
        'multi_assessment': MultidisciplinaryAssessment.objects.filter(student=student, report_cycle=cycle).first(),
        'diagnostic_report': DiagnosticReport.objects.filter(student=student).order_by('-created_at').first(),
    }

    draft_data = extract_assessment_draft_ai(student, cycle, inputs)

    doc = GeneratedDocument.objects.create(
        student=student,
        report_cycle=cycle,
        document_type='ASSESSMENT',
        iep_data=draft_data,  # Store structured data in iep_data JSONField
    )

    # Generate PDF
    try:
        from api.document_generator import generate_pdf_from_draft
        filename = f"{student.last_name}_{student.first_name}_ASSESSMENT_{cycle.start_date}.pdf"
        file_name, file_content = generate_pdf_from_draft(student, cycle, draft_data, filename)
        doc.file.save(file_name, file_content, save=True)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Could not save assessment PDF: %s", e)

    return doc


def extract_assessment_draft_ai(student, cycle, inputs):
    """
    Build a structured assessment document draft using AI.
    Primary value-add: translation and consolidation of multilingual inputs.
    """
    from api.iep_generator import _flatten_form_data

    pa_obj = inputs.get('parent_assessment')
    ma_obj = inputs.get('multi_assessment')
    diag_obj = inputs.get('diagnostic_report')

    # Get form data, preferring translated versions
    pa_data = {}
    if pa_obj:
        pa_data = _flatten_form_data(
            getattr(pa_obj, 'translated_data', None) or pa_obj.form_data or {}
        )

    ma_data = {}
    if ma_obj:
        ma_data = _flatten_form_data(
            getattr(ma_obj, 'translated_data', None) or ma_obj.form_data or {}
        )

    diag_text = ""
    if diag_obj:
        diag_text = diag_obj.extracted_text or ""

    # Build AI prompt for assessment document generation
    import json
    lines = [
        "You are an expert special education coordinator generating a comprehensive SPED Assessment document.",
        "Use ONLY the data provided below. Do NOT invent diagnoses or conditions not mentioned.",
        "Write in clear, professional, empathetic language suitable for a clinical assessment report.",
        "If any input data is in a non-English language, translate all content to English.",
        "",
        "=== STUDENT INFO ===",
        f"Name: {student.first_name} {student.last_name}",
        f"Date of Birth: {student.date_of_birth}",
        f"Grade/Level: {student.grade}",
        "",
    ]

    if pa_data:
        lines.append("=== PARENT ASSESSMENT DATA ===")
        lines.append(json.dumps(pa_data, indent=2, default=str))
        lines.append("")

    if ma_data:
        lines.append("=== SPECIALIST (MULTIDISCIPLINARY) ASSESSMENT DATA ===")
        lines.append(json.dumps(ma_data, indent=2, default=str))
        lines.append("")

    if diag_text:
        lines.append("=== DIAGNOSTIC REPORT (EXTERNAL) ===")
        lines.append(diag_text[:6000])
        lines.append("")

    lines.extend([
        "=== INSTRUCTIONS ===",
        "Generate a comprehensive SPED Assessment document as a JSON object with these keys:",
        json.dumps({
            "background_info": {
                "child_name": "", "dob": "", "grade": "",
                "parent_info": "", "medical_alerts": "",
                "known_conditions": [], "developmental_history": "",
            },
            "parent_concerns": {
                "primary_concerns": [], "areas_of_concern": [],
                "goals": "", "strategies_at_home": [],
            },
            "specialist_findings": {
                "slp_summary": "", "ot_summary": "", "pt_summary": "",
                "aba_summary": "", "developmental_psych_summary": "",
                "unified_strengths": [], "unified_needs": [],
            },
            "diagnostic_summary": "Summary of external diagnostic report if provided",
            "assessment_summary": "Overall consolidated assessment narrative",
            "recommendations": {
                "recommended_services": [],
                "therapy_frequency": [],
                "priority_areas": [],
                "next_steps": [],
            },
        }, indent=2),
        "",
        "Return ONLY valid JSON. No markdown, no explanation, just the JSON object.",
    ])

    prompt = "\n".join(lines)

    try:
        from api.services.gemini_service import call_gemini_json
        ai_data = call_gemini_json(prompt, temperature=0.5)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error("Gemini assessment generation failed: %s", e)
        # Fallback: return basic structured data without AI
        ai_data = {
            "background_info": {
                "child_name": f"{student.first_name} {student.last_name}",
                "dob": str(student.date_of_birth),
                "grade": student.grade,
            },
            "assessment_summary": "AI generation unavailable. Please review raw form data.",
        }

    # Build final document structure
    sections = []
    bg = ai_data.get("background_info", {})
    sections.append({
        "id": "sec_background",
        "title": "Section A: Background Information",
        "type": "fields",
        "fields": [
            {"name": "full_name", "label": "Child's Name", "type": "text",
             "value": bg.get("child_name", f"{student.first_name} {student.last_name}")},
            {"name": "dob", "label": "Date of Birth", "type": "text",
             "value": bg.get("dob", str(student.date_of_birth))},
            {"name": "grade", "label": "Grade/Level", "type": "text",
             "value": bg.get("grade", student.grade)},
            {"name": "medical_alerts", "label": "Medical Alerts", "type": "text",
             "value": bg.get("medical_alerts", "")},
            {"name": "known_conditions", "label": "Known Conditions", "type": "text",
             "value": ", ".join(bg.get("known_conditions", []))},
            {"name": "dev_history", "label": "Developmental History", "type": "textarea",
             "value": bg.get("developmental_history", "")},
        ],
    })

    pc = ai_data.get("parent_concerns", {})
    sections.append({
        "id": "sec_parent",
        "title": "Section B: Parent Concerns & Goals",
        "type": "fields",
        "fields": [
            {"name": "primary_concerns", "label": "Primary Concerns", "type": "text",
             "value": ", ".join(pc.get("primary_concerns", []))},
            {"name": "areas", "label": "Areas of Concern", "type": "text",
             "value": ", ".join(pc.get("areas_of_concern", []))},
            {"name": "goals", "label": "Parent Goals", "type": "textarea",
             "value": pc.get("goals", "")},
        ],
    })

    sf = ai_data.get("specialist_findings", {})
    sections.append({
        "id": "sec_specialist",
        "title": "Section C: Specialist Findings",
        "type": "fields",
        "fields": [
            {"name": "slp", "label": "Speech-Language Pathology", "type": "textarea",
             "value": sf.get("slp_summary", "")},
            {"name": "ot", "label": "Occupational Therapy", "type": "textarea",
             "value": sf.get("ot_summary", "")},
            {"name": "pt", "label": "Physical Therapy", "type": "textarea",
             "value": sf.get("pt_summary", "")},
            {"name": "aba", "label": "Applied Behavior Analysis", "type": "textarea",
             "value": sf.get("aba_summary", "")},
            {"name": "dev_psych", "label": "Developmental Psychology", "type": "textarea",
             "value": sf.get("developmental_psych_summary", "")},
            {"name": "strengths", "label": "Unified Strengths", "type": "text",
             "value": ", ".join(sf.get("unified_strengths", []))},
            {"name": "needs", "label": "Unified Needs", "type": "text",
             "value": ", ".join(sf.get("unified_needs", []))},
        ],
    })

    if diag_text:
        sections.append({
            "id": "sec_diagnostic",
            "title": "Section D: Diagnostic Report Summary",
            "type": "fields",
            "fields": [
                {"name": "diag_summary", "label": "Diagnostic Summary", "type": "textarea",
                 "value": ai_data.get("diagnostic_summary", "")},
            ],
        })

    recs = ai_data.get("recommendations", {})
    sections.append({
        "id": "sec_recommendations",
        "title": "Section E: Recommendations",
        "type": "fields",
        "fields": [
            {"name": "services", "label": "Recommended Services", "type": "text",
             "value": ", ".join(recs.get("recommended_services", []))},
            {"name": "frequency", "label": "Therapy Frequency", "type": "text",
             "value": ", ".join(recs.get("therapy_frequency", []))},
            {"name": "priorities", "label": "Priority Areas", "type": "text",
             "value": ", ".join(recs.get("priority_areas", []))},
            {"name": "next_steps", "label": "Next Steps", "type": "textarea",
             "value": "\n".join(recs.get("next_steps", []))},
        ],
    })

    sections.append({
        "id": "sec_summary",
        "title": "Section F: Assessment Summary",
        "type": "fields",
        "fields": [
            {"name": "summary", "label": "Overall Assessment", "type": "textarea",
             "value": ai_data.get("assessment_summary", "")},
        ],
    })

    return {
        "title": "THERUNI SPED ASSESSMENT",
        "header_code": "LD-001",
        "sections": sections,
        "ai_data": ai_data,  # Preserve raw AI output for IEP generation
    }
