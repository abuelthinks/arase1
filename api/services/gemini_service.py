from api.services.llm_service import call_json


def call_gemini_json(prompt: str, *, temperature: float = 0.3) -> dict:
    return call_json(prompt, temperature=temperature)
