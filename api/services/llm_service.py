import json
import logging

import requests
from django.conf import settings


logger = logging.getLogger(__name__)


JSON_SYSTEM_INSTRUCTION = "Return only valid JSON. Do not include markdown, explanations, or code fences."


def _strip_code_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3].strip()
    return text


def _parse_json_response(raw: str, provider: str) -> dict:
    text = _strip_code_fence(raw)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Models sometimes emit a valid object followed by trailing junk
        # (a duplicated key, a second object, or a prose note). Recover the
        # first complete JSON object instead of failing the whole call.
        start = text.find("{")
        if start == -1:
            logger.error("%s returned invalid JSON: %s", provider, raw[:1000])
            raise
        try:
            parsed, _ = json.JSONDecoder().raw_decode(text[start:])
        except json.JSONDecodeError:
            logger.error("%s returned invalid JSON: %s", provider, raw[:1000])
            raise

    if not isinstance(parsed, dict):
        raise ValueError(f"{provider} returned JSON, but not a JSON object.")

    return parsed


def _call_gemini_text(prompt: str, *, temperature: float, model_name: str | None = None) -> str:
    import google.generativeai as genai

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured in settings.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name or settings.GEMINI_MODEL)
    response = model.generate_content(
        prompt,
        generation_config={"temperature": temperature},
    )
    return response.text or ""


def _call_gemini_json(prompt: str, *, temperature: float) -> dict:
    import google.generativeai as genai

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured in settings.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        settings.GEMINI_MODEL,
        system_instruction=JSON_SYSTEM_INSTRUCTION,
    )
    response = model.generate_content(
        prompt,
        generation_config={
            "temperature": temperature,
            "response_mime_type": "application/json",
        },
    )
    return _parse_json_response(response.text or "", "Gemini")


def _call_ollama(
    prompt: str,
    *,
    temperature: float,
    system_instruction: str = "",
    json_mode: bool = False,
) -> str:
    base_url = settings.OLLAMA_BASE_URL.rstrip("/")
    payload = {
        "model": settings.OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": temperature},
    }

    if system_instruction:
        payload["system"] = system_instruction
    if json_mode:
        payload["format"] = "json"

    try:
        response = requests.post(
            f"{base_url}/api/generate",
            json=payload,
            timeout=settings.OLLAMA_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError(
            f"Ollama request failed. Is Ollama running at {base_url} with model "
            f"{settings.OLLAMA_MODEL}?"
        ) from e

    return response.json().get("response", "")


def _provider() -> str:
    return getattr(settings, "AI_PROVIDER", "gemini").strip().lower()


def _call_auto_json(prompt: str, *, temperature: float) -> dict:
    if settings.GEMINI_API_KEY:
        try:
            return _call_gemini_json(prompt, temperature=temperature)
        except Exception as e:
            logger.warning("Gemini JSON call failed; falling back to Ollama: %s", e)

    raw = _call_ollama(
        prompt,
        temperature=temperature,
        system_instruction=JSON_SYSTEM_INSTRUCTION,
        json_mode=True,
    )
    return _parse_json_response(raw, "Ollama")


def _call_auto_text(prompt: str, *, temperature: float) -> str:
    if settings.GEMINI_API_KEY:
        try:
            return _call_gemini_text(prompt, temperature=temperature)
        except Exception as e:
            logger.warning("Gemini text call failed; falling back to Ollama: %s", e)

    return _call_ollama(prompt, temperature=temperature)


def call_json(prompt: str, *, temperature: float = 0.3) -> dict:
    provider = _provider()
    if provider == "gemini":
        return _call_gemini_json(prompt, temperature=temperature)
    if provider == "ollama":
        raw = _call_ollama(
            prompt,
            temperature=temperature,
            system_instruction=JSON_SYSTEM_INSTRUCTION,
            json_mode=True,
        )
        return _parse_json_response(raw, "Ollama")
    if provider == "auto":
        return _call_auto_json(prompt, temperature=temperature)

    raise ValueError("AI_PROVIDER must be one of: gemini, ollama, auto.")


def call_text(prompt: str, *, temperature: float = 0.3) -> str:
    provider = _provider()
    if provider == "gemini":
        return _call_gemini_text(prompt, temperature=temperature)
    if provider == "ollama":
        return _call_ollama(prompt, temperature=temperature)
    if provider == "auto":
        return _call_auto_text(prompt, temperature=temperature)

    raise ValueError("AI_PROVIDER must be one of: gemini, ollama, auto.")
