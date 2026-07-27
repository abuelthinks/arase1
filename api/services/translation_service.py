import json
import logging

logger = logging.getLogger(__name__)

def translate_form_data(form_data: dict) -> tuple[dict, str]:
    """
    Takes a form_data dict and returns (translated_data, detected_language)
    using Gemini. If no translation is needed or on error, returns the original
    form data and 'en'.
    """
    if not form_data:
        return {}, 'en'

    prompt = f"""Translate a JSON object's string VALUES into English.
Rules:
- Every string value MUST end up in English. If a value is already English, keep it. If it is in another language (e.g. Tagalog/Filipino, Spanish, Japanese, Arabic), REPLACE it with its English translation.
- Never output non-English words in the result values.
- Do not change any keys or the nested structure.
- Add ONE top-level key "__detected_language" set to the ISO-639-1 code of the ORIGINAL text (e.g. en, tl, es, ja, ar). Tagalog markers: ang, ng, masipag, kailangan, tulong, bata, mabait.
- To pick "__detected_language", look ONLY at the longer free-text sentences. IGNORE names, emails, dates, numbers, and short fixed-choice values like "Male", "Female", "None", "Primary", "Typical", "English". If ANY free-text sentence is in a non-English language, set "__detected_language" to that language's code, EVEN IF most other fields are English. Use "en" only when every free-text sentence is already English.
- CRITICAL: Never translate English text into another language. English values must be copied UNCHANGED.

EXAMPLE 1 INPUT: {{"a": "Masipag ang bata", "b": "Kailangan ng tulong"}}
EXAMPLE 1 OUTPUT: {{"a": "The child is hardworking", "b": "Needs help", "__detected_language": "tl"}}

EXAMPLE 2 INPUT: {{"a": "The student reads very well", "b": "Enjoys group work"}}
EXAMPLE 2 OUTPUT: {{"a": "The student reads very well", "b": "Enjoys group work", "__detected_language": "en"}}

EXAMPLE 3 INPUT: {{"name": "Rowan", "gender": "Male", "notes": "Mahiyain siya sa simula ngunit masipag"}}
EXAMPLE 3 OUTPUT: {{"name": "Rowan", "gender": "Male", "notes": "He is shy at first but hardworking", "__detected_language": "tl"}}

INPUT:
{json.dumps(form_data, ensure_ascii=False)}
"""

    try:
        from api.services.gemini_service import call_gemini_json

        translated_obj = call_gemini_json(prompt, temperature=0.1)
        detected_language = translated_obj.pop('__detected_language', 'en')

        return translated_obj, detected_language
    except Exception as e:
        logger.error(f"Error translating form data: {e}")
        return form_data, 'en'
