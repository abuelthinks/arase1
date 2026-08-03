"""Canonical teacher grade level and normalization helpers.

A teacher handles exactly one grade level, the way a specialist holds a
discipline: assigned by an admin (on the invitation, or later on the user
record) and used to match teachers to students during assignment.

The levels mirror the "Grade / Level" question on the parent onboarding form,
which is what populates `Student.grade`. `Not yet in school` is a valid answer
there but never a teaching assignment, so it is not offered to teachers.
Student.grade is free text in the database, so every comparison goes through
`normalize_grade_level` first — that is also what absorbs older records that
were saved as "3rd Grade" or similar.
"""

from __future__ import annotations

import re

NURSERY_EARLY_YEARS = "Nursery/Early Years"
PRE_K_KINDER = "Pre-K/Kinder"
PRIMARY = "Primary"
NOT_YET_IN_SCHOOL = "Not yet in school"

GRADE_LEVELS = [NURSERY_EARLY_YEARS, PRE_K_KINDER, PRIMARY]

GRADE_LEVEL_CHOICES = [(value, value) for value in GRADE_LEVELS]
GRADE_LEVEL_SET = set(GRADE_LEVELS)

_NOT_YET_TOKENS = ("not yet in school", "not yet", "not in school", "none")
_NURSERY_TOKENS = ("nursery", "early years", "early year", "toddler", "playgroup", "daycare")
_PRE_K_TOKENS = ("pre k", "prek", "pre kinder", "prekinder", "kinder", "kg", "preschool", "pre school", "reception")

_WORD_NUMBERS = (
    "one", "first", "two", "second", "three", "third", "four", "fourth",
    "five", "fifth", "six", "sixth",
)


def _clean(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
    return re.sub(r"\s+", " ", cleaned)


def normalize_grade_level(value: str | None) -> str:
    """Map free-text grades to one of the three teachable levels.

    Returns "" for anything unrecognized, and for "Not yet in school" — neither
    participates in teacher matching.
    """
    if not value:
        return ""

    cleaned = _clean(value)
    if not cleaned:
        return ""

    if any(token in cleaned for token in _NOT_YET_TOKENS):
        return ""
    if any(token in cleaned for token in _NURSERY_TOKENS):
        return NURSERY_EARLY_YEARS
    # Checked after nursery so "pre-nursery" is not read as Pre-K.
    if any(token in cleaned for token in _PRE_K_TOKENS) or cleaned == "k":
        return PRE_K_KINDER
    if "primary" in cleaned or "elementary" in cleaned:
        return PRIMARY

    # Legacy records saved as "3rd Grade" / "grade 4" — primary school years.
    digits = re.search(r"\d{1,2}", cleaned)
    if digits:
        number = int(digits.group())
        return PRIMARY if 1 <= number <= 6 else ""

    if any(re.search(rf"\b{word}\b", cleaned) for word in _WORD_NUMBERS):
        return PRIMARY

    return ""


def validate_grade_level(role: str, value) -> str:
    """Normalize and validate a teacher's single grade level.

    Non-teacher roles always resolve to "" — grade level only means something
    for a classroom teacher.
    """
    if role != "TEACHER":
        return ""
    if value is None:
        return ""
    # Tolerate a single-item list so an older client payload does not 400.
    if isinstance(value, (list, tuple)):
        value = value[0] if value else ""
    if not isinstance(value, str):
        raise ValueError("Grade level must be a string.")
    if not value.strip():
        return ""

    normalized = normalize_grade_level(value)
    if normalized not in GRADE_LEVEL_SET:
        valid = ", ".join(GRADE_LEVELS)
        raise ValueError(f"Grade level must be one of: {valid}.")
    return normalized


def grade_level_matches(teacher_grade_level: str | None, student_grade: str | None) -> bool:
    """True when a teacher's level covers the student's grade."""
    target = normalize_grade_level(student_grade)
    if not target:
        return False
    return normalize_grade_level(teacher_grade_level) == target
