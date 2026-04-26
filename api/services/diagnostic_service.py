"""
Diagnostic Report Service
=========================
Handles extraction and parsing of external diagnostic reports (PDF/DOCX)
uploaded by parents, using Gemini for text extraction and summarization.
"""

import logging
from io import BytesIO

logger = logging.getLogger(__name__)


def extract_text_from_file(file_obj, filename: str) -> str:
    """
    Extract raw text from a PDF or DOCX file.
    Returns extracted text string.
    """
    lower = filename.lower()
    if lower.endswith('.pdf'):
        return _extract_pdf_text(file_obj)
    elif lower.endswith('.docx'):
        return _extract_docx_text(file_obj)
    else:
        # Try reading as plain text
        try:
            file_obj.seek(0)
            return file_obj.read().decode('utf-8', errors='replace')
        except Exception:
            return ""


def _extract_pdf_text(file_obj) -> str:
    """Extract text from a PDF file using PyPDF2."""
    try:
        import PyPDF2
        file_obj.seek(0)
        reader = PyPDF2.PdfReader(file_obj)
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n\n".join(pages)
    except ImportError:
        logger.warning("PyPDF2 not installed — cannot extract PDF text.")
        return "[PDF text extraction unavailable — PyPDF2 not installed]"
    except Exception as e:
        logger.error("Failed to extract PDF text: %s", e)
        return f"[PDF extraction error: {e}]"


def _extract_docx_text(file_obj) -> str:
    """Extract text from a DOCX file using python-docx."""
    try:
        import docx
        file_obj.seek(0)
        doc = docx.Document(file_obj)
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs)
    except ImportError:
        logger.warning("python-docx not installed — cannot extract DOCX text.")
        return "[DOCX text extraction unavailable — python-docx not installed]"
    except Exception as e:
        logger.error("Failed to extract DOCX text: %s", e)
        return f"[DOCX extraction error: {e}]"


def summarize_diagnostic_report(extracted_text: str) -> str:
    """
    Use Gemini to create a structured clinical summary of the diagnostic report.
    Falls back to the raw text if Gemini is unavailable.
    """
    if not extracted_text or extracted_text.startswith("["):
        return extracted_text

    try:
        from api.services.gemini_service import call_gemini_json
        prompt = (
            "You are a clinical document analyst. Summarize the following diagnostic report "
            "into a structured clinical summary. Preserve all diagnoses, test scores, "
            "clinical observations, and recommendations. "
            "Output a JSON object with these keys:\n"
            '  "diagnoses": [list of diagnosed conditions],\n'
            '  "test_results": [list of test names and scores],\n'
            '  "clinical_observations": "paragraph summary",\n'
            '  "recommendations": [list of clinical recommendations],\n'
            '  "raw_summary": "full text summary"\n\n'
            f"Diagnostic Report:\n{extracted_text[:8000]}"  # Cap at 8k chars for token limits
        )
        return call_gemini_json(prompt, temperature=0.3)
    except Exception as e:
        logger.warning("Gemini summarization failed, returning raw text: %s", e)
        return extracted_text


def process_diagnostic_upload(diagnostic_report_instance):
    """
    Main entry point: extract text from the uploaded file and save it.
    Called after a DiagnosticReport is created.
    """
    try:
        file_obj = diagnostic_report_instance.file
        filename = diagnostic_report_instance.original_filename or file_obj.name or ""

        extracted = extract_text_from_file(file_obj, filename)
        diagnostic_report_instance.extracted_text = extracted
        diagnostic_report_instance.save(update_fields=['extracted_text'])

        logger.info(
            "Diagnostic report processed for student=%s (report_id=%s, chars=%d)",
            diagnostic_report_instance.student_id,
            diagnostic_report_instance.id,
            len(extracted),
        )
    except Exception as e:
        logger.error("Failed to process diagnostic report %s: %s", diagnostic_report_instance.id, e)
