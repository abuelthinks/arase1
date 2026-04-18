"""Canonical specialist specialties and normalization helpers."""

from __future__ import annotations

import re

SPEECH_LANGUAGE_PATHOLOGY = "Speech-Language Pathology"
OCCUPATIONAL_THERAPY = "Occupational Therapy"
PHYSICAL_THERAPY = "Physical Therapy"
APPLIED_BEHAVIOR_ANALYSIS = "Applied Behavior Analysis (ABA)"
DEVELOPMENTAL_PSYCHOLOGY = "Developmental Psychology"

SPECIALIST_SPECIALTIES = [
    SPEECH_LANGUAGE_PATHOLOGY,
    OCCUPATIONAL_THERAPY,
    PHYSICAL_THERAPY,
    APPLIED_BEHAVIOR_ANALYSIS,
    DEVELOPMENTAL_PSYCHOLOGY,
]

SPECIALIST_SPECIALTY_CHOICES = [(value, value) for value in SPECIALIST_SPECIALTIES]
SPECIALIST_SPECIALTY_SET = set(SPECIALIST_SPECIALTIES)

_LEGACY_ALIASES = {
    "speech language pathology": SPEECH_LANGUAGE_PATHOLOGY,
    "speech and language pathology": SPEECH_LANGUAGE_PATHOLOGY,
    "speech & language pathology": SPEECH_LANGUAGE_PATHOLOGY,
    "speech pathology": SPEECH_LANGUAGE_PATHOLOGY,
    "speech therapy": SPEECH_LANGUAGE_PATHOLOGY,
    "slp": SPEECH_LANGUAGE_PATHOLOGY,
    "occupational therapy": OCCUPATIONAL_THERAPY,
    "occupational therapist": OCCUPATIONAL_THERAPY,
    "ot": OCCUPATIONAL_THERAPY,
    "physical therapy": PHYSICAL_THERAPY,
    "physical therapist": PHYSICAL_THERAPY,
    "pt": PHYSICAL_THERAPY,
    "applied behavior analysis": APPLIED_BEHAVIOR_ANALYSIS,
    "behavior analysis": APPLIED_BEHAVIOR_ANALYSIS,
    "behavior analyst": APPLIED_BEHAVIOR_ANALYSIS,
    "board certified behavior analyst": APPLIED_BEHAVIOR_ANALYSIS,
    "bcba": APPLIED_BEHAVIOR_ANALYSIS,
    "aba": APPLIED_BEHAVIOR_ANALYSIS,
    "behavioral therapy": APPLIED_BEHAVIOR_ANALYSIS,
    "behavioral intervention": APPLIED_BEHAVIOR_ANALYSIS,
    "psychology behavioral": APPLIED_BEHAVIOR_ANALYSIS,
    "psychology behavioral assessment": APPLIED_BEHAVIOR_ANALYSIS,
    "psychology behavioral therapy": APPLIED_BEHAVIOR_ANALYSIS,
    "psychology / behavioral": APPLIED_BEHAVIOR_ANALYSIS,
    "developmental psychology": DEVELOPMENTAL_PSYCHOLOGY,
    "developmental psychologist": DEVELOPMENTAL_PSYCHOLOGY,
    "developmental psych": DEVELOPMENTAL_PSYCHOLOGY,
}


def _clean(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
    return re.sub(r"\s+", " ", cleaned)


def normalize_specialty(value: str | None) -> str:
    """Map legacy/free-text specialties to the canonical five-discipline model."""
    if not value:
        return ""

    cleaned = _clean(value)
    if not cleaned:
        return ""
    if cleaned in _LEGACY_ALIASES:
        return _LEGACY_ALIASES[cleaned]

    if any(token in cleaned for token in ["speech", "language", "slp"]):
        return SPEECH_LANGUAGE_PATHOLOGY
    if "occupational" in cleaned or re.search(r"\bot\b", cleaned):
        return OCCUPATIONAL_THERAPY
    if "physical" in cleaned or re.search(r"\bpt\b", cleaned):
        return PHYSICAL_THERAPY
    if any(token in cleaned for token in ["aba", "behavior", "analyst", "bcba", "applied"]):
        return APPLIED_BEHAVIOR_ANALYSIS
    if "development" in cleaned:
        return DEVELOPMENTAL_PSYCHOLOGY

    return value.strip()


def validate_specialty(role: str, value: str | None) -> str:
    """Return a normalized specialty value or raise ValueError for invalid input."""
    if role != "SPECIALIST":
        return ""

    normalized = normalize_specialty(value)
    if not normalized:
        return ""
    if normalized not in SPECIALIST_SPECIALTY_SET:
        valid = ", ".join(SPECIALIST_SPECIALTIES)
        raise ValueError(f"Specialty must be one of: {valid}.")
    return normalized
