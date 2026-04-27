"""Real-time collaboration primitives for the multidisciplinary forms.

Phase 1: section-level soft locks + presence broadcasts.

Each lock is a Redis key:
    collab:{form_type}:{instance_id}:section:{section_key}
    -> JSON {"user_id", "user_name", "specialty", "acquired_at"}

The key has a short TTL (LOCK_TTL_SECONDS). The frontend refreshes the lock
on activity; on save / submit / unmount / disconnect the lock is released.
Locks are advisory — actual write authorization still goes through
section_service._check_section_edit. The lock just prevents two specialists
from typing in the same shared section at the same time and powers the
"Anna is editing Section A" UI.

Channel groups:
    collab_{form_type}_{instance_id}
        events: presence.update, section.locked, section.unlocked,
                section.saved, section.submitted
"""

from __future__ import annotations

import json
import logging
import time
from typing import Optional

from django.core.cache import cache
from django.utils import timezone

from ..specialties import (
    ASSESSMENT_SECTION_OWNERS,
    SHARED_SECTION,
    TRACKER_SECTION_OWNERS,
    can_edit_section,
)


logger = logging.getLogger(__name__)

LOCK_TTL_SECONDS = 45  # short — clients refresh every ~20s
PRESENCE_TTL_SECONDS = 60


def _lock_key(form_type: str, instance_id: int, section_key: str) -> str:
    return f"collab:{form_type}:{instance_id}:section:{section_key}"


def _instance_lock_prefix(form_type: str, instance_id: int) -> str:
    return f"collab:{form_type}:{instance_id}:section:"


def group_name(form_type: str, instance_id: int) -> str:
    return f"collab_{form_type}_{instance_id}"


def _section_owners(form_type: str) -> dict:
    if form_type == "assessment":
        return ASSESSMENT_SECTION_OWNERS
    if form_type == "tracker":
        return TRACKER_SECTION_OWNERS
    raise ValueError(f"Unknown form_type: {form_type}")


def _user_display_name(user) -> str:
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return name or user.email


def _user_specialty_for(user, form_type: str) -> str:
    """Pick the specialty most relevant to the form (first one is fine for display)."""
    if hasattr(user, "specialty_list"):
        specs = user.specialty_list()
        if specs:
            return specs[0]
    return ""


# ─── Lock operations ────────────────────────────────────────────────────────

def acquire_lock(*, form_type: str, instance_id: int, section_key: str, user) -> dict:
    """Try to take the lock for (form_type, instance_id, section_key).

    Returns a dict:
        {"ok": bool, "lock": {...}, "held_by": {...} | None}

    - If no current holder: creates the lock and returns ok=True.
    - If the same user already holds it: refreshes the TTL.
    - If someone else holds it: returns ok=False with held_by populated.

    Authorization (can this user edit this section?) is *not* enforced here —
    the WS consumer should call this only for sections the user can edit.
    """
    owners = _section_owners(form_type)
    if section_key not in owners:
        return {"ok": False, "error": "unknown_section"}

    key = _lock_key(form_type, instance_id, section_key)
    now = time.time()
    payload = {
        "user_id": user.id,
        "user_name": _user_display_name(user),
        "specialty": _user_specialty_for(user, form_type),
        "section_key": section_key,
        "acquired_at": now,
        "expires_at": now + LOCK_TTL_SECONDS,
    }

    # Attempt set-if-not-exists
    raw = cache.get(key)
    if raw:
        try:
            current = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, ValueError):
            current = None
        if current and current.get("user_id") == user.id:
            cache.set(key, json.dumps(payload), timeout=LOCK_TTL_SECONDS)
            return {"ok": True, "lock": payload, "refreshed": True}
        return {"ok": False, "held_by": current, "lock": None}

    cache.set(key, json.dumps(payload), timeout=LOCK_TTL_SECONDS)
    return {"ok": True, "lock": payload, "refreshed": False}


def release_lock(*, form_type: str, instance_id: int, section_key: str, user) -> bool:
    """Release a lock if held by this user. No-op otherwise."""
    key = _lock_key(form_type, instance_id, section_key)
    raw = cache.get(key)
    if not raw:
        return False
    try:
        current = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        return False
    if current.get("user_id") != user.id:
        return False
    cache.delete(key)
    return True


def release_user_locks(*, form_type: str, instance_id: int, user) -> list[str]:
    """Release every lock this user holds on the given form. Used on disconnect."""
    released: list[str] = []
    for section_key in _section_owners(form_type).keys():
        if release_lock(
            form_type=form_type, instance_id=instance_id,
            section_key=section_key, user=user,
        ):
            released.append(section_key)
    return released


def get_active_locks(*, form_type: str, instance_id: int) -> list[dict]:
    """Return every active lock for this form (skips expired)."""
    out: list[dict] = []
    now = time.time()
    for section_key in _section_owners(form_type).keys():
        raw = cache.get(_lock_key(form_type, instance_id, section_key))
        if not raw:
            continue
        try:
            entry = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, ValueError):
            continue
        if entry.get("expires_at", 0) < now:
            continue
        out.append(entry)
    return out


# ─── Group broadcasts ───────────────────────────────────────────────────────

def _broadcast(form_type: str, instance_id: int, payload: dict) -> None:
    """Fire-and-forget broadcast to the form's collab group."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            group_name(form_type, instance_id),
            {"type": "collab.event", "payload": payload},
        )
    except Exception as exc:  # pragma: no cover — Channels optional
        logger.debug("collab broadcast failed: %s", exc)


def broadcast_lock_changed(form_type: str, instance_id: int) -> None:
    _broadcast(form_type, instance_id, {
        "event": "presence.update",
        "locks": get_active_locks(form_type=form_type, instance_id=instance_id),
        "ts": timezone.now().isoformat(),
    })


def broadcast_section_saved(
    *, form_type: str, instance, section_key: str, user, form_data_v2: Optional[dict] = None,
) -> None:
    _broadcast(form_type, instance.id, {
        "event": "section.saved",
        "section_key": section_key,
        "by": {"user_id": user.id, "user_name": _user_display_name(user)},
        "form_data": form_data_v2,
        "ts": timezone.now().isoformat(),
    })


def broadcast_section_submitted(
    *, form_type: str, instance, section_key: str, user, finalized: bool,
) -> None:
    _broadcast(form_type, instance.id, {
        "event": "section.submitted",
        "section_key": section_key,
        "by": {"user_id": user.id, "user_name": _user_display_name(user)},
        "finalized": finalized,
        "ts": timezone.now().isoformat(),
    })


# ─── Authorization helper for WS consumer ──────────────────────────────────

def user_can_edit_section(form_type: str, section_key: str, user, student_id: int) -> bool:
    """Mirror of section_service permission gate, simplified for WS use."""
    if user.role == "ADMIN":
        return True
    if user.role != "SPECIALIST":
        return False
    if not user.is_specialist_onboarding_complete():
        return False
    from ..models import StudentAccess
    access = StudentAccess.objects.filter(user=user, student_id=student_id).first()
    if not access:
        return False
    specialties = access.specialty_list() or user.specialty_list()
    return can_edit_section(form_type, section_key, specialties)
