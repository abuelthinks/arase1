import json
import logging

import google.generativeai as genai
from django.conf import settings


logger = logging.getLogger(__name__)


def _strip_code_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3].strip()
    return text


def call_gemini_json(prompt: str, *, temperature: float = 0.3) -> dict:
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured in settings.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        settings.GEMINI_MODEL,
        system_instruction="Return only valid JSON. Do not include markdown, explanations, or code fences.",
    )

    response = model.generate_content(
        prompt,
        generation_config={
            "temperature": temperature,
            "response_mime_type": "application/json",
        },
    )

    raw = response.text or ""
    try:
        return json.loads(_strip_code_fence(raw))
    except json.JSONDecodeError:
        logger.error("Gemini returned invalid JSON: %s", raw[:1000])
        raise
