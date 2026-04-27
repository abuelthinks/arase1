"""
WebSocket consumers.

NotificationConsumer    -- per-user notification stream (existing).
CollaborationConsumer   -- per-form collaboration channel for
                           multidisciplinary assessment / tracker:
                           presence, section locks, save/submit broadcasts.
"""

import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from urllib.parse import parse_qs

logger = logging.getLogger(__name__)


def _extract_jwt(scope) -> str | None:
    """Pull the access_token from the WS scope (cookie first, then ?token=…)."""
    headers = dict(scope.get("headers", []))
    cookie_header = headers.get(b"cookie", b"").decode("utf-8", errors="ignore")
    if cookie_header:
        for part in cookie_header.split(";"):
            part = part.strip()
            if part.startswith("access_token="):
                return part.split("=", 1)[1]
    query_string = scope.get("query_string", b"").decode("utf-8")
    params = parse_qs(query_string)
    token_list = params.get("token", [])
    if token_list:
        return token_list[0]
    return None


@database_sync_to_async
def _user_from_jwt(token: str):
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        from api.models import User

        validated = AccessToken(token)
        return User.objects.get(id=validated["user_id"])
    except Exception as exc:
        logger.debug("WS JWT validation failed: %s", exc)
        return None


class NotificationConsumer(AsyncWebsocketConsumer):
    """
    WebSocket endpoint: ws://<host>/ws/notifications/

    Authentication:
    - Reads the access_token from cookies (same HttpOnly cookie used by the REST API).
    - Falls back to ?token=<jwt> query parameter for debugging.
    - If authentication fails, the connection is rejected.

    Once connected, the user is added to the group "notifications_{user_id}".
    The notification service pushes events to this group whenever a notification is created.
    """

    async def connect(self):
        self.user = await self._authenticate()
        if self.user is None:
            await self.close()
            return

        self.group_name = f"notifications_{self.user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.debug("WS connected: user=%s group=%s", self.user.id, self.group_name)

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        """Client-to-server messages are ignored (read-only channel)."""
        pass

    # ─── Group handler ────────────────────────────────────────────────────

    async def notification_push(self, event):
        """
        Called by the channel layer when a notification is broadcast
        to this user's group.
        """
        await self.send(text_data=json.dumps({
            "type": "notification",
            "notification": event["notification"],
        }))

    # ─── Authentication ───────────────────────────────────────────────────

    async def _authenticate(self):
        """Validate JWT from cookie or query param and return the User, or None."""
        token = _extract_jwt(self.scope)
        if not token:
            return None
        return await _user_from_jwt(token)


# ─── Multidisciplinary Form Collaboration ────────────────────────────────────

class CollaborationConsumer(AsyncWebsocketConsumer):
    """
    WebSocket endpoint:
        ws://<host>/ws/collab/<form_type>/<instance_id>/

    form_type ∈ {"assessment", "tracker"}.

    Inbound client messages (JSON):
        {"type": "lock.acquire", "section_key": "C"}
        {"type": "lock.release", "section_key": "C"}
        {"type": "lock.refresh", "section_key": "C"}
        {"type": "presence.ping"}                  # request a presence snapshot

    Outbound server messages:
        {"type": "presence.snapshot", "locks": [...]}
        {"type": "presence.update",   "locks": [...]}
        {"type": "section.saved",     "section_key", "by", "form_data", "ts"}
        {"type": "section.submitted", "section_key", "by", "finalized", "ts"}
        {"type": "lock.denied",       "section_key", "reason", "held_by"}
    """

    async def connect(self):
        self.user = None
        self.form_type = self.scope["url_route"]["kwargs"].get("form_type")
        try:
            self.instance_id = int(self.scope["url_route"]["kwargs"].get("instance_id"))
        except (TypeError, ValueError):
            await self.close()
            return

        if self.form_type not in ("assessment", "tracker"):
            await self.close()
            return

        token = _extract_jwt(self.scope)
        if not token:
            await self.close()
            return
        self.user = await _user_from_jwt(token)
        if self.user is None:
            await self.close()
            return

        if not await self._user_has_access():
            await self.close()
            return

        from api.services.collaboration_service import group_name, get_active_locks
        self.group_name = group_name(self.form_type, self.instance_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Send the current presence snapshot to the new client.
        locks = await database_sync_to_async(get_active_locks)(
            form_type=self.form_type, instance_id=self.instance_id,
        )
        await self.send(text_data=json.dumps({
            "type": "presence.snapshot",
            "locks": locks,
        }))

    async def disconnect(self, close_code):
        if not self.user:
            return
        if hasattr(self, "group_name"):
            # Release any locks this user held, then notify peers.
            from api.services.collaboration_service import (
                release_user_locks, broadcast_lock_changed,
            )
            released = await database_sync_to_async(release_user_locks)(
                form_type=self.form_type, instance_id=self.instance_id, user=self.user,
            )
            if released:
                await database_sync_to_async(broadcast_lock_changed)(
                    self.form_type, self.instance_id,
                )
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            msg = json.loads(text_data)
        except json.JSONDecodeError:
            return

        msg_type = msg.get("type")
        section_key = msg.get("section_key")

        if msg_type in ("lock.acquire", "lock.refresh"):
            await self._handle_acquire(section_key)
        elif msg_type == "lock.release":
            await self._handle_release(section_key)
        elif msg_type == "presence.ping":
            await self._send_snapshot()

    # ─── Handlers ─────────────────────────────────────────────────────────

    async def _handle_acquire(self, section_key):
        if not section_key:
            return
        from api.services.collaboration_service import (
            acquire_lock, broadcast_lock_changed, user_can_edit_section,
        )

        instance = await self._get_instance()
        if instance is None:
            return

        can_edit = await database_sync_to_async(user_can_edit_section)(
            self.form_type, section_key, self.user, instance.student_id,
        )
        if not can_edit:
            await self.send(text_data=json.dumps({
                "type": "lock.denied",
                "section_key": section_key,
                "reason": "not_authorized",
            }))
            return

        result = await database_sync_to_async(acquire_lock)(
            form_type=self.form_type, instance_id=self.instance_id,
            section_key=section_key, user=self.user,
        )
        if not result.get("ok"):
            await self.send(text_data=json.dumps({
                "type": "lock.denied",
                "section_key": section_key,
                "reason": "held",
                "held_by": result.get("held_by"),
            }))
            return

        await database_sync_to_async(broadcast_lock_changed)(
            self.form_type, self.instance_id,
        )

    async def _handle_release(self, section_key):
        if not section_key:
            return
        from api.services.collaboration_service import (
            release_lock, broadcast_lock_changed,
        )
        released = await database_sync_to_async(release_lock)(
            form_type=self.form_type, instance_id=self.instance_id,
            section_key=section_key, user=self.user,
        )
        if released:
            await database_sync_to_async(broadcast_lock_changed)(
                self.form_type, self.instance_id,
            )

    async def _send_snapshot(self):
        from api.services.collaboration_service import get_active_locks
        locks = await database_sync_to_async(get_active_locks)(
            form_type=self.form_type, instance_id=self.instance_id,
        )
        await self.send(text_data=json.dumps({
            "type": "presence.snapshot",
            "locks": locks,
        }))

    # ─── Group handler ────────────────────────────────────────────────────

    async def collab_event(self, event):
        """Receive any broadcast made through collaboration_service._broadcast."""
        payload = event.get("payload") or {}
        # Re-shape: top-level "type" must match the websocket protocol
        # used by the frontend client.
        out = dict(payload)
        out["type"] = payload.get("event", "collab.event")
        out.pop("event", None)
        await self.send(text_data=json.dumps(out))

    # ─── Helpers ──────────────────────────────────────────────────────────

    @database_sync_to_async
    def _user_has_access(self) -> bool:
        from api.models import (
            MultidisciplinaryAssessment, MultidisciplinaryProgressTracker,
            StudentAccess,
        )
        Model = (
            MultidisciplinaryAssessment if self.form_type == "assessment"
            else MultidisciplinaryProgressTracker
        )
        instance = Model.objects.filter(id=self.instance_id).first()
        if instance is None:
            return False
        if self.user.role == "ADMIN":
            return True
        return StudentAccess.objects.filter(
            user=self.user, student_id=instance.student_id,
        ).exists()

    @database_sync_to_async
    def _get_instance(self):
        from api.models import (
            MultidisciplinaryAssessment, MultidisciplinaryProgressTracker,
        )
        Model = (
            MultidisciplinaryAssessment if self.form_type == "assessment"
            else MultidisciplinaryProgressTracker
        )
        return Model.objects.filter(id=self.instance_id).first()
