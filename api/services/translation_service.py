import json
import logging
import google.generativeai as genai
from django.conf import settings

logger = logging.getLogger(__name__)

def translate_form_data(form_data: dict) -> tuple[dict, str]:
    """
    Takes a form_data dict and returns (translated_data, detected_language)
    using Gemini AI. If no translation is needed or on error, returns the original 
    form data and 'en'.
    """
    if not form_data:
        return {}, 'en'

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        logger.warning("GEMINI_API_KEY not configured. Skipping translation.")
        return form_data, 'en'

    genai.configure(api_key=api_key)
    
    model = genai.GenerativeModel(
        model_name='gemini-2.5-flash-lite',
        generation_config={
            "temperature": 0.1,
            "response_mime_type": "application/json",
        }
    )
    
    prompt = f"""
    Below is a JSON object representing form input data from an educational assessment or progress tracker. 
    1. Detect the primary language of the text values in this JSON (if it is mixed, identify the predominant non-English language if any).
    2. Translate all string text values in the JSON into standard English. Do NOT change the keys, only the string values.
    3. Return your response ONLY as a valid, raw JSON object matching the exact structure of the input, plus a top-level `__detected_language` key containing the ISO-639-1 language code of the original text (e.g. 'en', 'ja', 'ar', 'es').
    
    INPUT JSON:
    {json.dumps(form_data, ensure_ascii=False)}
    """
    
    try:
        response = model.generate_content(prompt)
        raw = response.text.strip()

        # Strip markdown code fences if present
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[1] if '\n' in raw else raw[3:]
            if raw.endswith('```'):
                raw = raw[:-3].strip()

        translated_obj = json.loads(raw)
        detected_language = translated_obj.pop('__detected_language', 'en')
        
        return translated_obj, detected_language
    except Exception as e:
        logger.error(f"Error translating form data: {e}")
        return form_data, 'en'
