import os
from io import BytesIO
from django.conf import settings
from django.core.files.base import ContentFile
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

def _get_check(val):
    return "[X]" if val else "[ ]"

def _format_cell(val):
    if val is None: return ""
    return str(val)

def generate_pdf_from_draft(student, cycle, draft_data, filename):
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter,
                            rightMargin=50, leftMargin=50,
                            topMargin=50, bottomMargin=50)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(name='TitleStyle', parent=styles['Heading1'], alignment=1, spaceAfter=20)
    h2_style = ParagraphStyle(name='H2', parent=styles['Heading2'], textColor=colors.HexColor("#0f172a"), spaceBefore=15, spaceAfter=5)
    normal = styles['Normal']
    
    elements = []
    
    if draft_data.get('header_code'):
        elements.append(Paragraph(draft_data['header_code'], normal))
        
    elements.append(Paragraph(draft_data.get('title', 'Generated Document'), title_style))
    
    for section in draft_data.get('sections', []):
        elements.append(Paragraph(section.get('title', ''), h2_style))
        if section.get('description'):
            elements.append(Paragraph(section.get('description', ''), normal))
            elements.append(Spacer(1, 5))
            
        if section.get('type') == 'fields':
            for field in section.get('fields', []):
                label = field.get('label', '')
                value = field.get('value', '')
                if not value: 
                    value = "N/A"
                    
                if field.get('type') == 'textarea':
                    elements.append(Paragraph(f"<b>{label}:</b>", normal))
                    for line in str(value).split('\n'):
                        if line.strip():
                            elements.append(Paragraph(line, normal))
                else:
                    elements.append(Paragraph(f"<b>{label}:</b> {value}", normal))
            elements.append(Spacer(1, 10))
            
        elif section.get('type') == 'tables':
            elements.append(Paragraph(section.get('content', ''), normal))
            for table_info in section.get('tables', []):
                elements.append(Paragraph(f"<b>{table_info.get('title', '')}</b>", normal))
                table_data = table_info.get('rows', [])
                if len(table_data) > 1:
                    t = Table(table_data, colWidths=[150, 60, 60, 60, 60])
                    t.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
                        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
                        ('PADDING', (0,0), (-1,-1), 4),
                    ]))
                    elements.append(t)
                    elements.append(Spacer(1, 10))
                else:
                    elements.append(Paragraph("No data reported.", normal))
                    
    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return filename, ContentFile(pdf_bytes)


def _generate_iep_pdf(student, iep_data):
    """Build an IEP PDF in memory and return a ContentFile for storage (S3 or local)."""
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('TitleStyle', parent=styles['Heading1'], alignment=1, spaceAfter=20, fontSize=16)
    h2 = ParagraphStyle('H2', parent=styles['Heading2'], textColor=colors.HexColor("#1e40af"), spaceBefore=14, spaceAfter=6)
    h3 = ParagraphStyle('H3', parent=styles['Heading3'], spaceBefore=8, spaceAfter=4)
    normal = styles['Normal']

    pdf = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=50, leftMargin=50, topMargin=50, bottomMargin=50)
    elements = []
    iep = iep_data

    elements.append(Paragraph("THERUNI - Comprehensive AI-Generated IEP", title_style))
    elements.append(Spacer(1, 10))

    s1 = iep.get('section1_student_info', {})
    elements.append(Paragraph("Section 1 - Student Information", h2))
    for label, key in [("Student Name", "student_name"), ("Date of Birth", "date_of_birth"), ("Gender", "gender"), ("Grade/Level", "grade_level"), ("IEP Dates", None)]:
        if key:
            elements.append(Paragraph(f"<b>{label}:</b> {s1.get(key, 'N/A')}", normal))
        else:
            elements.append(Paragraph(f"<b>{label}:</b> {s1.get('iep_start_date', '')} to {s1.get('iep_end_date', '')}", normal))
    elements.append(Spacer(1, 8))

    s2 = iep.get('section2_background', {})
    elements.append(Paragraph("Section 2 - Background and Developmental Summary", h2))
    for sub_label, sub_key in [("Developmental History", "developmental_history"), ("Classroom Functioning", "classroom_functioning"), ("Family Input Summary", "family_input_summary")]:
        elements.append(Paragraph(f"<b>{sub_label}</b>", h3))
        elements.append(Paragraph(str(s2.get(sub_key, 'N/A')), normal))
    elements.append(Spacer(1, 8))

    s3 = iep.get('section3_strengths', {})
    elements.append(Paragraph("Section 3 - Strengths and Interests", h2))
    elements.append(Paragraph("<b>Strengths:</b> " + ", ".join(s3.get("strengths", [])), normal))
    elements.append(Paragraph("<b>Interests:</b> " + ", ".join(s3.get("interests", [])), normal))
    elements.append(Spacer(1, 8))

    s4 = iep.get('section4_plop', {})
    elements.append(Paragraph("Section 4 - Present Levels of Performance (PLOP)", h2))
    domain_labels = {
        "communication_slp": "Communication (SLP)",
        "fine_motor_ot": "Fine Motor, Sensory and ADLs (OT)",
        "gross_motor_pt": "Gross Motor (PT)",
        "behavioral_psych": "Behavioral and Emotional (ABA / Developmental Psychology)",
        "academic_sped": "Academic/Learning (SPED)",
        "adaptive_life_skills": "Adaptive and Life Skills",
    }
    for domain_key, domain_label in domain_labels.items():
        domain_data = s4.get(domain_key, {})
        if domain_data:
            elements.append(Paragraph(domain_label, h3))
            for field_key, field_val in domain_data.items():
                elements.append(Paragraph(f"<b>{field_key.replace('_', ' ').title()}:</b> {field_val}", normal))
    elements.append(Spacer(1, 8))

    elements.append(Paragraph("Section 5 - Long-Term IEP Goals (1 Year)", h2))
    for ltg in iep.get('section5_ltg', []):
        elements.append(Paragraph(f"<b>{ltg.get('id', '')} - {ltg.get('domain', '')}:</b> {ltg.get('goal', '')}", normal))
        elements.append(Paragraph(f"<i>Aligned disciplines: {ltg.get('disciplines', '')}</i>", normal))
    elements.append(Spacer(1, 8))

    elements.append(Paragraph("Section 6 - Short-Term Objectives (3-4 months)", h2))
    for sto in iep.get('section6_sto', []):
        elements.append(Paragraph(f"<b>Objective {sto.get('id', '')} ({sto.get('ltg_ref', '')}):</b> {sto.get('objective', '')}", normal))
        elements.append(Paragraph(f"Target: {sto.get('target_skill', '')} | Method: {sto.get('teaching_method', '')} | Criteria: {sto.get('success_criteria', '')} | Freq: {sto.get('frequency', '')} | By: {sto.get('responsible', '')}", normal))
        elements.append(Spacer(1, 4))
    elements.append(Spacer(1, 8))

    s7 = iep.get('section7_accommodations', {})
    elements.append(Paragraph("Section 7 - Accommodations and Modifications", h2))
    elements.append(Paragraph("<b>Classroom:</b> " + ", ".join(s7.get("classroom", [])), normal))
    elements.append(Paragraph("<b>Learning Modifications:</b> " + ", ".join(s7.get("learning_modifications", [])), normal))
    elements.append(Paragraph("<b>Communication Supports:</b> " + ", ".join(s7.get("communication_supports", [])), normal))
    elements.append(Spacer(1, 8))

    s8 = iep.get('section8_therapies', {})
    elements.append(Paragraph("Section 8 - Therapies and Intervention Plan", h2))
    for therapy_key, therapy_label in [
        ("speech_therapy", "Speech-Language Pathology"),
        ("occupational_therapy", "Occupational Therapy"),
        ("physical_therapy", "Physical Therapy"),
        ("applied_behavior_analysis", "Applied Behavior Analysis (ABA)"),
        ("developmental_psychology", "Developmental Psychology"),
        ("psychology", "Applied Behavior Analysis (ABA) / Developmental Psychology"),
        ("sped_sessions", "SPED"),
        ("shadow_teacher", "Shadow Teacher"),
    ]:
        t = s8.get(therapy_key, {})
        if therapy_key == "shadow_teacher":
            elements.append(Paragraph(f"<b>{therapy_label}:</b> Hours: {t.get('hours', 'N/A')}", normal))
        else:
            elements.append(Paragraph(f"<b>{therapy_label}:</b> {t.get('frequency', 'N/A')} - {t.get('focus_areas', 'N/A')}", normal))
    elements.append(Spacer(1, 8))

    s9 = iep.get('section9_home_program', {})
    elements.append(Paragraph("Section 9 - Home Program", h2))
    for hp_key, hp_label in [("speech_tasks", "Speech Tasks"), ("sensory_ot_tasks", "Sensory/OT Tasks"), ("behavioral_tasks", "Behavioral Tasks"), ("academic_tasks", "Academic Tasks")]:
        items = s9.get(hp_key, [])
        elements.append(Paragraph(f"<b>{hp_label}:</b>", normal))
        for item in items:
            elements.append(Paragraph(f"  - {item}", normal))

    pdf.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return ContentFile(pdf_bytes)


def _generate_monthly_pdf(student, report_data):
    """Build a Monthly Progress Report PDF in memory and return a ContentFile for storage."""
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('TitleStyle', parent=styles['Heading1'], alignment=1, spaceAfter=20, fontSize=16)
    h2 = ParagraphStyle('H2', parent=styles['Heading2'], textColor=colors.HexColor("#1e40af"), spaceBefore=14, spaceAfter=6)
    h3 = ParagraphStyle('H3', parent=styles['Heading3'], spaceBefore=8, spaceAfter=4)
    normal = styles['Normal']

    pdf = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=50, leftMargin=50, topMargin=50, bottomMargin=50)
    elements = []
    report = report_data

    elements.append(Paragraph("THERUNI - Monthly Progress Report", title_style))
    elements.append(Spacer(1, 10))

    si = report.get('student_info', {})
    elements.append(Paragraph("Student Information", h2))
    elements.append(Paragraph(f"<b>Student Name:</b> {si.get('student_name', 'N/A')}", normal))
    elements.append(Paragraph(f"<b>Date of Birth:</b> {si.get('date_of_birth', 'N/A')}", normal))
    elements.append(Paragraph(f"<b>Grade/Level:</b> {si.get('grade_level', 'N/A')}", normal))
    elements.append(Paragraph(f"<b>Report Period:</b> {report.get('report_period', 'N/A')}", normal))
    elements.append(Spacer(1, 8))

    elements.append(Paragraph("Executive Summary", h2))
    elements.append(Paragraph(str(report.get('executive_summary', 'N/A')), normal))
    elements.append(Spacer(1, 8))

    for section_title, section_key in [
        ("Communication Progress", "communication_progress"),
        ("Behavioral and Social Progress", "behavioral_social_progress"),
        ("Academic Progress", "academic_progress"),
        ("Motor and Sensory Progress", "motor_sensory_progress"),
        ("Daily Living and Independence", "daily_living_independence"),
    ]:
        section_data = report.get(section_key, {})
        if section_data:
            elements.append(Paragraph(section_title, h2))
            elements.append(Paragraph(str(section_data.get('summary', 'No data submitted this month.')), normal))
            if section_data.get('highlights'):
                elements.append(Paragraph("<b>Highlights:</b>", h3))
                for h_item in section_data['highlights']:
                    elements.append(Paragraph(f"  - {h_item}", normal))
            if section_data.get('concerns'):
                elements.append(Paragraph("<b>Concerns:</b>", h3))
                for c in section_data['concerns']:
                    elements.append(Paragraph(f"  - {c}", normal))
            elements.append(Spacer(1, 6))

    gas = report.get('goal_achievement_scores', [])
    if gas:
        elements.append(Paragraph("Goal Achievement Scores (GAS)", h2))
        table_data = [["Goal", "Domain", "Score (1-5)", "Notes"]]
        for g in gas:
            score = g.get('score', 0)
            try:
                score_int = int(score)
            except (ValueError, TypeError):
                score_int = 0
            score_label = {5: "5 - Achieved", 4: "4 - Exceeds", 3: "3 - Expected", 2: "2 - Minimal", 1: "1 - No progress"}.get(score_int, str(score))
            table_data.append([str(g.get('goal_id', '')), str(g.get('domain', '')), score_label, str(g.get('note', ''))])
        t = Table(table_data, colWidths=[52, 130, 90, 208])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e40af")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 8))

    tss = report.get('therapy_session_summary', {})
    if tss:
        elements.append(Paragraph("Therapy Session Summary", h2))
        elements.append(Paragraph(f"<b>Discipline:</b> {tss.get('discipline', 'N/A')}", normal))
        elements.append(Paragraph(f"<b>Sessions Completed:</b> {tss.get('sessions_completed', 'N/A')}", normal))
        elements.append(Paragraph(f"<b>Attendance:</b> {tss.get('attendance', 'N/A')}", normal))
        if tss.get('key_progress'):
            elements.append(Paragraph(f"<b>Key Progress:</b> {tss.get('key_progress')}", normal))
        elements.append(Spacer(1, 8))

    recs = report.get('recommendations', {})
    if recs:
        elements.append(Paragraph("Recommendations", h2))
        for rec in recs.get('classroom', []):
            elements.append(Paragraph(f"  - [Classroom] {rec}", normal))
        for rec in recs.get('home_program', []):
            elements.append(Paragraph(f"  - [Home] {rec}", normal))
        for rec in recs.get('therapy_adjustments', []):
            elements.append(Paragraph(f"  - [Therapy] {rec}", normal))
        elements.append(Spacer(1, 8))

    focus = report.get('next_month_focus_areas', [])
    if focus:
        elements.append(Paragraph("Next Month Focus Areas", h2))
        for item in focus:
            elements.append(Paragraph(f"  - {item}", normal))

    pdf.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return ContentFile(pdf_bytes)
