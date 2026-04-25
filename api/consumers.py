"""
WebSocket consumer for real-time notifications.
Authenticates via JWT cookie, then subscribes the user to their personal
notification channel group.
"""

import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from urllib.parse import parse_qs

logger = logging.getLogger(__name__)


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
        token = None

        # 1. Try cookie
        headers = dict(self.scope.get("headers", []))
        cookie_header = headers.get(b"cookie", b"").decode("utf-8", errors="ignore")
        if cookie_header:
            for part in cookie_header.split(";"):
                part = part.strip()
                if part.startswith("access_token="):
                    token = part.split("=", 1)[1]
                    break

        # 2. Fallback to query param
        if not token:
            query_string = self.scope.get("query_string", b"").decode("utf-8")
            params = parse_qs(query_string)
            token_list = params.get("token", [])
            if token_list:
                token = token_list[0]

        if not token:
            return None

        return await self._get_user_from_jwt(token)

    @database_sync_to_async
    def _get_user_from_jwt(self, token):
        try:
            from rest_framework_simplejwt.tokens import AccessToken
            from api.models import User

            validated = AccessToken(token)
            user_id = validated["user_id"]
            return User.objects.get(id=user_id)
        except Exception as e:
            logger.debug("WS JWT validation failed: %s", e)
            return None
