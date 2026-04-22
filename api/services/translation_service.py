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

    prompt = f"""
    Below is a JSON object representing form input data from an educational assessment or progress tracker.
    1. Detect the primary language of the text values in this JSON (if it is mixed, identify the predominant non-English language if any).
    2. Translate all string text values in the JSON into standard English. Do NOT change the keys, only the string values.
    3. Return your response ONLY as a valid, raw JSON object matching the exact structure of the input, plus a top-level `__detected_language` key containing the ISO-639-1 language code of the original text (e.g. 'en', 'ja', 'ar', 'es').

    INPUT JSON:
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
