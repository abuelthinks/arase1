"""
Diagnostic Report Processing Service
=====================================
Handles text extraction from uploaded diagnostic reports (PDF/DOCX)
using Google Gemini AI.
"""

import logging
import os

from django.conf import settings

logger = logging.getLogger(__name__)


def _read_file_bytes(instance):
    """Read the uploaded file content as bytes."""
    try:
        instance.file.seek(0)
        return instance.file.read()
    except Exception as e:
        logger.warning("Could not read diagnostic file: %s", e)
        return None


def _extract_text_with_gemini(file_bytes, filename):
    """
    Use Google Gemini to extract and summarise text from a diagnostic report.
    Supports PDF and DOCX files.
    """
    import google.generativeai as genai

    api_key = getattr(settings, 'GEMINI_API_KEY', None) or os.environ.get('GEMINI_API_KEY')
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    genai.configure(api_key=api_key)

    ext = os.path.splitext(filename)[1].lower()
    mime_map = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc': 'application/msword',
    }
    mime_type = mime_map.get(ext, 'application/pdf')

    model = genai.GenerativeModel("gemini-2.0-flash")

    prompt = (
        "You are a clinical document specialist. Extract ALL text from this diagnostic report. "
        "Preserve the structure including headers, sections, dates, and clinical findings. "
        "Output the full text content in plain text format. Do not summarise — extract everything verbatim. "
        "If the document is in a language other than English, also provide an English translation after the original text, "
        "clearly separated with a '--- ENGLISH TRANSLATION ---' header."
    )

    response = model.generate_content([
        prompt,
        {"mime_type": mime_type, "data": file_bytes},
    ])

    return response.text


def process_diagnostic_upload(instance):
    """
    Main entry point: read file, extract text via Gemini, save to model.
    Called synchronously after upload.
    """
    file_bytes = _read_file_bytes(instance)
    if not file_bytes:
        logger.warning("Empty file for diagnostic report id=%s", instance.id)
        return

    try:
        extracted = _extract_text_with_gemini(file_bytes, instance.original_filename)
        instance.extracted_text = extracted
        instance.save(update_fields=['extracted_text'])
        logger.info(
            "Diagnostic text extracted for report id=%s (%d chars)",
            instance.id, len(extracted),
        )
    except Exception as e:
        logger.error("Gemini text extraction failed for report id=%s: %s", instance.id, e)
        # Don't re-raise — the upload itself succeeded, extraction can be retried later
