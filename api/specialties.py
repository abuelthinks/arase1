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


def validate_specialties(role: str, values) -> list[str]:
    """Normalize and validate a list of specialties. Empty/non-specialist roles return []."""
    if role != "SPECIALIST":
        return []
    if values is None:
        return []
    if isinstance(values, str):
        values = [values]
    if not isinstance(values, (list, tuple)):
        raise ValueError("Specialties must be a list of strings.")
    out: list[str] = []
    for v in values:
        if not v:
            continue
        normalized = normalize_specialty(v)
        if not normalized:
            continue
        if normalized not in SPECIALIST_SPECIALTY_SET:
            valid = ", ".join(SPECIALIST_SPECIALTIES)
            raise ValueError(f"Specialty must be one of: {valid}.")
        if normalized not in out:
            out.append(normalized)
    return out


# ─── Section ownership for multi-specialist forms ────────────────────────────
# "shared" sections can be edited by any assigned specialist until locked.
SHARED_SECTION = "shared"

ASSESSMENT_SECTION_OWNERS = {
    "A": SHARED_SECTION,
    "B": SHARED_SECTION,
    "C": SPEECH_LANGUAGE_PATHOLOGY,
    "D": OCCUPATIONAL_THERAPY,
    "E": PHYSICAL_THERAPY,
    "F1": APPLIED_BEHAVIOR_ANALYSIS,
    "F2": DEVELOPMENTAL_PSYCHOLOGY,
    "G": SHARED_SECTION,
}

ASSESSMENT_DISCIPLINE_SECTIONS = {
    SPEECH_LANGUAGE_PATHOLOGY: "C",
    OCCUPATIONAL_THERAPY: "D",
    PHYSICAL_THERAPY: "E",
    APPLIED_BEHAVIOR_ANALYSIS: "F1",
    DEVELOPMENTAL_PSYCHOLOGY: "F2",
}

TRACKER_SECTION_OWNERS = {
    "section_a": SHARED_SECTION,
    "section_b": SHARED_SECTION,
    "section_c_slp": SPEECH_LANGUAGE_PATHOLOGY,
    "section_c_ot": OCCUPATIONAL_THERAPY,
    "section_c_pt": PHYSICAL_THERAPY,
    "section_c_aba": APPLIED_BEHAVIOR_ANALYSIS,
    "section_c_developmental_psychology": DEVELOPMENTAL_PSYCHOLOGY,
    "section_d": SHARED_SECTION,
    "section_e": SHARED_SECTION,
    "section_f": SHARED_SECTION,
}

TRACKER_DISCIPLINE_SECTIONS = {
    SPEECH_LANGUAGE_PATHOLOGY: "section_c_slp",
    OCCUPATIONAL_THERAPY: "section_c_ot",
    PHYSICAL_THERAPY: "section_c_pt",
    APPLIED_BEHAVIOR_ANALYSIS: "section_c_aba",
    DEVELOPMENTAL_PSYCHOLOGY: "section_c_developmental_psychology",
}


def get_section_owners(form_type: str) -> dict:
    if form_type == "assessment":
        return ASSESSMENT_SECTION_OWNERS
    if form_type == "tracker":
        return TRACKER_SECTION_OWNERS
    raise ValueError(f"Unknown form_type: {form_type}")


def can_edit_section(form_type: str, section_key: str, user_specialty) -> bool:
    """Return True if any of user's specialties may edit section_key.

    user_specialty accepts a single string or a list of strings for multi-discipline users.
    """
    owners = get_section_owners(form_type)
    owner = owners.get(section_key)
    if owner is None:
        return False
    if owner == SHARED_SECTION:
        return True
    if isinstance(user_specialty, (list, tuple)):
        return any(normalize_specialty(s) == owner for s in user_specialty if s)
    return normalize_specialty(user_specialty) == owner


def required_owner_sections(form_type: str, specialties: list[str] | None = None) -> list[str]:
    """Return the section keys that must be submitted for finalization."""
    owners = get_section_owners(form_type)
    default_required = [key for key, owner in owners.items() if owner != SHARED_SECTION]
    if not specialties:
        return default_required

    discipline_map = (
        ASSESSMENT_DISCIPLINE_SECTIONS
        if form_type == "assessment"
        else TRACKER_DISCIPLINE_SECTIONS
    )
    required: list[str] = []
    for specialty in specialties:
        normalized = normalize_specialty(specialty)
        section_key = discipline_map.get(normalized)
        if section_key and section_key not in required:
            required.append(section_key)

    return required or default_required
