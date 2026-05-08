"""Stored activity events and real-time fan-out helpers."""

from __future__ import annotations

import logging
from typing import Iterable

from django.db import transaction
from django.utils import timezone

from api.models import ActivityEvent, StudentAccess

logger = logging.getLogger(__name__)


def user_display_name(user) -> str:
    if not user:
        return "System"
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return name or user.email


def serialize_activity_event(event: ActivityEvent) -> dict:
    student = event.student
    return {
        "id": event.id,
        "type": event.event_type,
        "event_type": event.event_type,
        "visibility": event.visibility,
        "student_id": event.student_id,
        "student_name": f"{student.first_name} {student.last_name}".strip() if student else "",
        "actor_id": event.actor_id,
        "actor_name": event.actor_name,
        "title": event.title,
        "message": event.message,
        "metadata": event.metadata or {},
        "created_at": event.created_at.isoformat() if event.created_at else timezone.now().isoformat(),
    }


def refresh_targets_for_event(event_type: str, metadata: dict | None = None) -> list[str]:
    metadata = metadata or {}
    targets = {"activity"}
    if event_type.startswith("STUDENT") or event_type in {"TEAM_UPDATED", "USER_REGISTERED", "ONBOARDING_COMPLETED"}:
        targets.update({"dashboard", "workspace", "student", "staff"})
    if event_type in {"FORM_SUBMITTED", "FORM_FINALIZED"}:
        targets.update({"dashboard", "workspace", "student", "forms", "reports"})
    if event_type.startswith("REPORT"):
        targets.update({"dashboard", "workspace", "student", "reports"})
    if event_type in {"SCHEDULE_UPDATED"}:
        targets.update({"dashboard", "workspace", "student", "schedule"})
    if event_type in {"DIAGNOSTIC_UPLOADED"}:
        targets.update({"dashboard", "workspace", "student", "forms", "reports"})
    targets.update(metadata.get("refresh", []))
    return sorted(targets)


def toast_for_event(event: ActivityEvent) -> dict | None:
    metadata = event.metadata or {}
    level = metadata.get("toast")
    if not level:
        return None
    return {
        "level": level,
        "title": metadata.get("toast_title") or event.title,
        "message": metadata.get("toast_message") or event.message,
    }


def _assigned_user_ids(student_id: int | None) -> list[int]:
    if not student_id:
        return []
    return list(
        StudentAccess.objects
        .filter(student_id=student_id)
        .values_list("user_id", flat=True)
        .distinct()
    )


def _broadcast(event: ActivityEvent, direct_user_ids: Iterable[int] | None = None) -> None:
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        payload = {
            "type": "activity.event",
            "event": serialize_activity_event(event),
            "refresh": refresh_targets_for_event(event.event_type, event.metadata),
            "toast": toast_for_event(event),
        }
        message = {"type": "realtime.event", "payload": payload}

        async_to_sync(channel_layer.group_send)("realtime_admins", message)

        if event.visibility == "STUDENT_TEAM" and event.student_id:
            async_to_sync(channel_layer.group_send)(f"realtime_student_{event.student_id}", message)
            for user_id in _assigned_user_ids(event.student_id):
                async_to_sync(channel_layer.group_send)(f"realtime_user_{user_id}", message)

        for user_id in direct_user_ids or []:
            async_to_sync(channel_layer.group_send)(f"realtime_user_{user_id}", message)
    except Exception as exc:
        logger.debug("Real-time activity broadcast skipped: %s", exc)


def create_activity_event(
    *,
    event_type: str,
    title: str,
    message: str = "",
    actor=None,
    student=None,
    visibility: str | None = None,
    metadata: dict | None = None,
    direct_user_ids: Iterable[int] | None = None,
) -> ActivityEvent:
    resolved_visibility = visibility or ("STUDENT_TEAM" if student else "ADMINS")
    event = ActivityEvent.objects.create(
        event_type=event_type,
        visibility=resolved_visibility,
        student=student,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        actor_name=user_display_name(actor),
        title=title,
        message=message,
        metadata=metadata or {},
    )
    transaction.on_commit(lambda: _broadcast(event, direct_user_ids=direct_user_ids))
    return event
