"""Language normalization helpers for user language preferences."""

LANGUAGE_OPTIONS = ["English", "Arabic", "Tagalog", "Urdu", "Hindi"]

_LANGUAGE_LOOKUP = {language.lower(): language for language in LANGUAGE_OPTIONS}


def normalize_languages(values) -> list[str]:
    if not isinstance(values, list):
        raise ValueError("Languages must be a list.")

    normalized: list[str] = []
    seen: set[str] = set()
    for raw in values:
        if raw is None:
            continue
        value = str(raw).strip()
        if not value:
            continue
        canonical = _LANGUAGE_LOOKUP.get(value.lower(), value.title())
        key = canonical.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(canonical)
    return normalized
