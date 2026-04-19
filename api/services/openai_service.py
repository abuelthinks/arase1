import json
import logging

from django.conf import settings
from openai import OpenAI


logger = logging.getLogger(__name__)


def _strip_code_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3].strip()
    return text


def call_openai_json(prompt: str, *, temperature: float = 0.3) -> dict:
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured in settings.")

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {
                "role": "system",
                "content": "Return only valid JSON. Do not include markdown, explanations, or code fences.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=temperature,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content or ""
    try:
        return json.loads(_strip_code_fence(raw))
    except json.JSONDecodeError:
        logger.error("OpenAI returned invalid JSON: %s", raw[:1000])
        raise
