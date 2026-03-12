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
                    
                # For textareas, format with line breaks
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



