from io import BytesIO
from django.core.files.base import ContentFile
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    ListFlowable, ListItem,
)

PAGE_W, PAGE_H = letter
BLUE        = colors.HexColor("#1e40af")
BLUE_LIGHT  = colors.HexColor("#eff6ff")
BLUE_MID    = colors.HexColor("#93c5fd")
SLATE       = colors.HexColor("#0f172a")
MUTED       = colors.HexColor("#64748b")
RULE        = colors.HexColor("#e2e8f0")
STRIPE      = colors.HexColor("#f8fafc")

ML, MR, MT, MB = 50, 50, 82, 52
CW = PAGE_W - ML - MR


def _page_frame(doc_type):
    """Return an onPage callback that stamps the ARASE header + footer on every page."""
    def _draw(canvas, doc):
        canvas.saveState()

        # Blue header banner
        canvas.setFillColor(BLUE)
        canvas.rect(0, PAGE_H - 54, PAGE_W, 54, fill=1, stroke=0)
        # Thin accent stripe below banner
        canvas.setFillColor(BLUE_MID)
        canvas.rect(0, PAGE_H - 57, PAGE_W, 3, fill=1, stroke=0)

        # Brand name
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 15)
        canvas.drawString(ML, PAGE_H - 32, "ARASE")
        canvas.setFont("Helvetica", 8.5)
        canvas.setFillColor(BLUE_MID)
        canvas.drawString(ML + 52, PAGE_H - 32, "Comprehensive Special Education Platform")

        # Doc type + page number (right side of header)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawRightString(PAGE_W - MR, PAGE_H - 22, doc_type.upper())
        canvas.setFont("Helvetica-Bold", 8)
        canvas.drawRightString(PAGE_W - MR, PAGE_H - 37, f"Page {doc.page}")

        # Footer rule
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        canvas.line(ML, 40, PAGE_W - MR, 40)

        # Footer text
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(ML, 27, "ARASE — Confidential document. Intended solely for the named student and their authorized care team.")
        canvas.drawRightString(PAGE_W - MR, 27, "arase.app")

        canvas.restoreState()
    return _draw


def _styles():
    base = getSampleStyleSheet()
    return {
        'title': ParagraphStyle(
            'DocTitle', fontSize=18, fontName='Helvetica-Bold',
            textColor=SLATE, alignment=TA_CENTER, spaceAfter=4, spaceBefore=6,
        ),
        'subtitle': ParagraphStyle(
            'DocSub', fontSize=10, fontName='Helvetica',
            textColor=MUTED, alignment=TA_CENTER, spaceAfter=18,
        ),
        'normal': ParagraphStyle(
            'Body', parent=base['Normal'], fontSize=9.5,
            leading=14, textColor=SLATE, spaceAfter=2,
        ),
        'muted_detail': ParagraphStyle(
            'MutedDetail', parent=base['Normal'], fontSize=8.5,
            leading=13, textColor=MUTED, spaceAfter=6,
        ),
        'h3': ParagraphStyle(
            'H3', fontSize=10, fontName='Helvetica-BoldOblique',
            textColor=BLUE, spaceBefore=8, spaceAfter=3,
        ),
    }


def _section_header(title):
    """Branded section header: light-blue bg + left blue accent bar."""
    st = ParagraphStyle('SH', fontSize=11, fontName='Helvetica-Bold', textColor=BLUE, leading=15)
    t = Table([[Paragraph(title, st)]], colWidths=[CW])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BLUE_LIGHT),
        ('LINEBEFORE', (0, 0), (0, -1), 4, BLUE),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t


def _bullets(items, normal_style):
    """Render a list of strings as bullet points."""
    if not items:
        return Paragraph("—", normal_style)
    li = [ListItem(Paragraph(str(i), normal_style), leftIndent=14, bulletColor=BLUE) for i in items]
    return ListFlowable(li, bulletType='bullet', bulletChar='•', leftIndent=10, bulletFontSize=8)


def _styled_table(rows, col_widths):
    """Shared table style: blue header row, alternating row stripes."""
    t = Table(rows, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BLUE),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.4, RULE),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, STRIPE]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t


# ---------------------------------------------------------------------------
# Public generators
# ---------------------------------------------------------------------------

def generate_pdf_from_draft(student, cycle, draft_data, filename):
    buffer = BytesIO()
    S = _styles()
    doc_type = draft_data.get('title', 'Generated Document')
    cb = _page_frame(doc_type)
    doc = SimpleDocTemplate(buffer, pagesize=letter,
                            rightMargin=MR, leftMargin=ML, topMargin=MT, bottomMargin=MB)
    els = []

    if draft_data.get('header_code'):
        els.append(Paragraph(draft_data['header_code'], S['normal']))

    els.append(Paragraph(doc_type, S['title']))
    els.append(Spacer(1, 12))

    for section in draft_data.get('sections', []):
        els.append(_section_header(section.get('title', '')))
        els.append(Spacer(1, 4))

        if section.get('description'):
            els.append(Paragraph(section['description'], S['normal']))
            els.append(Spacer(1, 4))

        if section.get('type') == 'fields':
            for field in section.get('fields', []):
                label = field.get('label', '')
                value = field.get('value', '') or 'N/A'
                if field.get('type') == 'textarea':
                    els.append(Paragraph(f"<b>{label}:</b>", S['normal']))
                    for line in str(value).split('\n'):
                        if line.strip():
                            els.append(Paragraph(line, S['normal']))
                else:
                    els.append(Paragraph(f"<b>{label}:</b> {value}", S['normal']))
            els.append(Spacer(1, 10))

        elif section.get('type') == 'tables':
            els.append(Paragraph(section.get('content', ''), S['normal']))
            for table_info in section.get('tables', []):
                els.append(Paragraph(f"<b>{table_info.get('title', '')}</b>", S['normal']))
                table_data = table_info.get('rows', [])
                if len(table_data) > 1:
                    els.append(_styled_table(table_data, [150, 60, 60, 60, 60]))
                    els.append(Spacer(1, 8))
                else:
                    els.append(Paragraph("No data reported.", S['normal']))

    doc.build(els, onFirstPage=cb, onLaterPages=cb)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return filename, ContentFile(pdf_bytes)


def _generate_iep_pdf(student, iep_data):
    buffer = BytesIO()
    S = _styles()
    cb = _page_frame("Individualized Education Program")
    doc = SimpleDocTemplate(buffer, pagesize=letter,
                            rightMargin=MR, leftMargin=ML, topMargin=MT, bottomMargin=MB)
    els = []
    iep = iep_data

    els.append(Paragraph("Individualized Education Program (IEP)", S['title']))
    els.append(Paragraph("Comprehensive AI-Assisted Document — ARASE", S['subtitle']))
    els.append(Spacer(1, 8))

    # Section 1 — Student Info
    s1 = iep.get('section1_student_info', {})
    els.append(_section_header("Section 1 — Student Information"))
    els.append(Spacer(1, 6))
    for label, key in [
        ("Student Name", "student_name"),
        ("Date of Birth", "date_of_birth"),
        ("Gender", "gender"),
        ("Grade / Level", "grade_level"),
    ]:
        els.append(Paragraph(f"<b>{label}:</b> {s1.get(key, 'N/A')}", S['normal']))
    els.append(Paragraph(
        f"<b>IEP Dates:</b> {s1.get('iep_start_date', '')} to {s1.get('iep_end_date', '')}",
        S['normal'],
    ))
    els.append(Spacer(1, 14))

    # Section 2 — Background
    s2 = iep.get('section2_background', {})
    els.append(_section_header("Section 2 — Background & Developmental Summary"))
    els.append(Spacer(1, 6))
    for sub_label, sub_key in [
        ("Developmental History", "developmental_history"),
        ("Classroom Functioning", "classroom_functioning"),
        ("Family Input Summary", "family_input_summary"),
    ]:
        els.append(Paragraph(f"<b>{sub_label}</b>", S['h3']))
        els.append(Paragraph(str(s2.get(sub_key, 'N/A')), S['normal']))
    els.append(Spacer(1, 14))

    # Section 3 — Strengths & Interests
    s3 = iep.get('section3_strengths', {})
    els.append(_section_header("Section 3 — Strengths & Interests"))
    els.append(Spacer(1, 6))
    strengths = s3.get('strengths', [])
    interests = s3.get('interests', [])
    els.append(Paragraph(f"<b>Strengths:</b> {', '.join(strengths) if strengths else 'N/A'}", S['normal']))
    els.append(Paragraph(f"<b>Interests:</b> {', '.join(interests) if interests else 'N/A'}", S['normal']))
    els.append(Spacer(1, 14))

    # Section 4 — PLOP
    s4 = iep.get('section4_plop', {})
    els.append(_section_header("Section 4 — Present Levels of Performance (PLOP)"))
    els.append(Spacer(1, 6))
    domain_labels = {
        "communication_slp": "Communication (SLP)",
        "fine_motor_ot": "Fine Motor, Sensory & ADLs (OT)",
        "gross_motor_pt": "Gross Motor (PT)",
        "behavioral_psych": "Behavioral & Emotional (ABA / Developmental Psychology)",
        "academic_sped": "Academic / Learning (SPED)",
        "adaptive_life_skills": "Adaptive & Life Skills",
    }
    for domain_key, domain_label in domain_labels.items():
        domain_data = s4.get(domain_key, {})
        if domain_data:
            els.append(Paragraph(domain_label, S['h3']))
            for field_key, field_val in domain_data.items():
                els.append(Paragraph(
                    f"<b>{field_key.replace('_', ' ').title()}:</b> {field_val}", S['normal']
                ))
    els.append(Spacer(1, 14))

    # Section 5 — Long-Term Goals
    els.append(_section_header("Section 5 — Long-Term IEP Goals (1 Year)"))
    els.append(Spacer(1, 6))
    for ltg in iep.get('section5_ltg', []):
        els.append(Paragraph(
            f"<b>{ltg.get('id', '')} – {ltg.get('domain', '')}:</b> {ltg.get('goal', '')}",
            S['normal'],
        ))
        els.append(Paragraph(f"<i>Aligned disciplines: {ltg.get('disciplines', '')}</i>", S['normal']))
        els.append(Spacer(1, 4))
    els.append(Spacer(1, 14))

    # Section 6 — Short-Term Objectives
    els.append(_section_header("Section 6 — Short-Term Objectives (3–4 months)"))
    els.append(Spacer(1, 6))
    for sto in iep.get('section6_sto', []):
        els.append(Paragraph(
            f"<b>Objective {sto.get('id', '')} ({sto.get('ltg_ref', '')}):</b> {sto.get('objective', '')}",
            S['normal'],
        ))
        detail = (
            f"Target: {sto.get('target_skill', '')} | "
            f"Method: {sto.get('teaching_method', '')} | "
            f"Criteria: {sto.get('success_criteria', '')} | "
            f"Freq: {sto.get('frequency', '')} | "
            f"By: {sto.get('responsible', '')}"
        )
        els.append(Paragraph(detail, S['muted_detail']))
    els.append(Spacer(1, 14))

    # Section 7 — Accommodations
    s7 = iep.get('section7_accommodations', {})
    els.append(_section_header("Section 7 — Accommodations & Modifications"))
    els.append(Spacer(1, 6))
    for label, key in [
        ("Classroom", "classroom"),
        ("Learning Modifications", "learning_modifications"),
        ("Communication Supports", "communication_supports"),
    ]:
        els.append(Paragraph(f"<b>{label}</b>", S['h3']))
        els.append(_bullets(s7.get(key, []), S['normal']))
        els.append(Spacer(1, 4))
    els.append(Spacer(1, 14))

    # Section 8 — Therapies (table)
    s8 = iep.get('section8_therapies', {})
    els.append(_section_header("Section 8 — Therapies & Intervention Plan"))
    els.append(Spacer(1, 6))
    therapy_rows = [["Discipline", "Frequency / Schedule", "Focus Areas"]]
    for therapy_key, therapy_label in [
        ("speech_therapy", "Speech-Language Pathology"),
        ("occupational_therapy", "Occupational Therapy"),
        ("physical_therapy", "Physical Therapy"),
        ("applied_behavior_analysis", "Applied Behavior Analysis (ABA)"),
        ("developmental_psychology", "Developmental Psychology"),
        ("sped_sessions", "SPED"),
    ]:
        t = s8.get(therapy_key, {})
        if t:
            therapy_rows.append([therapy_label, t.get('frequency', 'N/A'), t.get('focus_areas', 'N/A')])
    shadow = s8.get('shadow_teacher', {})
    if shadow:
        therapy_rows.append(["Shadow Teacher", shadow.get('hours', 'N/A'), "—"])
    if len(therapy_rows) > 1:
        els.append(_styled_table(therapy_rows, [CW * 0.32, CW * 0.22, CW * 0.46]))
    els.append(Spacer(1, 14))

    # Section 9 — Home Program
    s9 = iep.get('section9_home_program', {})
    els.append(_section_header("Section 9 — Home Program"))
    els.append(Spacer(1, 6))
    for hp_key, hp_label in [
        ("speech_tasks", "Speech Tasks"),
        ("sensory_ot_tasks", "Sensory / OT Tasks"),
        ("behavioral_tasks", "Behavioral Tasks"),
        ("academic_tasks", "Academic Tasks"),
    ]:
        items = s9.get(hp_key, [])
        if items:
            els.append(Paragraph(f"<b>{hp_label}</b>", S['h3']))
            els.append(_bullets(items, S['normal']))
            els.append(Spacer(1, 4))

    doc.build(els, onFirstPage=cb, onLaterPages=cb)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return ContentFile(pdf_bytes)


def _generate_monthly_pdf(student, report_data):
    buffer = BytesIO()
    S = _styles()
    cb = _page_frame("Monthly Progress Report")
    doc = SimpleDocTemplate(buffer, pagesize=letter,
                            rightMargin=MR, leftMargin=ML, topMargin=MT, bottomMargin=MB)
    els = []
    report = report_data

    els.append(Paragraph("Monthly Progress Report", S['title']))
    els.append(Paragraph("AI-Assisted Document — ARASE", S['subtitle']))
    els.append(Spacer(1, 8))

    # Student Info
    si = report.get('student_info', {})
    els.append(_section_header("Student Information"))
    els.append(Spacer(1, 6))
    els.append(Paragraph(f"<b>Student Name:</b> {si.get('student_name', 'N/A')}", S['normal']))
    els.append(Paragraph(f"<b>Date of Birth:</b> {si.get('date_of_birth', 'N/A')}", S['normal']))
    els.append(Paragraph(f"<b>Grade / Level:</b> {si.get('grade_level', 'N/A')}", S['normal']))
    els.append(Paragraph(f"<b>Report Period:</b> {report.get('report_period', 'N/A')}", S['normal']))
    els.append(Spacer(1, 14))

    # Executive Summary
    els.append(_section_header("Executive Summary"))
    els.append(Spacer(1, 6))
    els.append(Paragraph(str(report.get('executive_summary', 'N/A')), S['normal']))
    els.append(Spacer(1, 14))

    # Progress sections
    for section_title, section_key in [
        ("Communication Progress", "communication_progress"),
        ("Behavioral & Social Progress", "behavioral_social_progress"),
        ("Academic Progress", "academic_progress"),
        ("Motor & Sensory Progress", "motor_sensory_progress"),
        ("Daily Living & Independence", "daily_living_independence"),
    ]:
        section_data = report.get(section_key, {})
        if section_data:
            els.append(_section_header(section_title))
            els.append(Spacer(1, 6))
            els.append(Paragraph(str(section_data.get('summary', 'No data submitted this month.')), S['normal']))
            if section_data.get('highlights'):
                els.append(Paragraph("<b>Highlights</b>", S['h3']))
                els.append(_bullets(section_data['highlights'], S['normal']))
            if section_data.get('concerns'):
                els.append(Paragraph("<b>Concerns</b>", S['h3']))
                els.append(_bullets(section_data['concerns'], S['normal']))
            els.append(Spacer(1, 14))

    # Goal Achievement Scores
    gas = report.get('goal_achievement_scores', [])
    if gas:
        els.append(_section_header("Goal Achievement Scores (GAS)"))
        els.append(Spacer(1, 6))
        score_map = {5: "5 — Achieved", 4: "4 — Exceeds", 3: "3 — Expected", 2: "2 — Minimal", 1: "1 — No Progress"}
        table_data = [["Goal ID", "Domain", "Score", "Notes"]]
        for g in gas:
            try:
                score_label = score_map.get(int(g.get('score', 0)), str(g.get('score', '')))
            except (ValueError, TypeError):
                score_label = str(g.get('score', ''))
            table_data.append([
                str(g.get('goal_id', '')),
                str(g.get('domain', '')),
                score_label,
                str(g.get('note', '')),
            ])
        els.append(_styled_table(table_data, [CW * 0.1, CW * 0.25, CW * 0.2, CW * 0.45]))
        els.append(Spacer(1, 14))

    # Therapy Session Summary
    tss = report.get('therapy_session_summary', {})
    if tss:
        els.append(_section_header("Therapy Session Summary"))
        els.append(Spacer(1, 6))
        els.append(Paragraph(f"<b>Discipline:</b> {tss.get('discipline', 'N/A')}", S['normal']))
        els.append(Paragraph(f"<b>Sessions Completed:</b> {tss.get('sessions_completed', 'N/A')}", S['normal']))
        els.append(Paragraph(f"<b>Attendance:</b> {tss.get('attendance', 'N/A')}", S['normal']))
        if tss.get('key_progress'):
            els.append(Paragraph(f"<b>Key Progress:</b> {tss.get('key_progress')}", S['normal']))
        els.append(Spacer(1, 14))

    # Recommendations
    recs = report.get('recommendations', {})
    if recs:
        els.append(_section_header("Recommendations"))
        els.append(Spacer(1, 6))
        all_recs = (
            [f"[Classroom] {r}" for r in recs.get('classroom', [])] +
            [f"[Home] {r}" for r in recs.get('home_program', [])] +
            [f"[Therapy] {r}" for r in recs.get('therapy_adjustments', [])]
        )
        if all_recs:
            els.append(_bullets(all_recs, S['normal']))
        els.append(Spacer(1, 14))

    # Next Month Focus Areas
    focus = report.get('next_month_focus_areas', [])
    if focus:
        els.append(_section_header("Next Month Focus Areas"))
        els.append(Spacer(1, 6))
        els.append(_bullets(focus, S['normal']))

    doc.build(els, onFirstPage=cb, onLaterPages=cb)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return ContentFile(pdf_bytes)
