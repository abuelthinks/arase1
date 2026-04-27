"""
WebSocket URL routing for the api app.
"""

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/notifications/$', consumers.NotificationConsumer.as_asgi()),
    re_path(
        r'ws/collab/(?P<form_type>assessment|tracker)/(?P<instance_id>\d+)/$',
        consumers.CollaborationConsumer.as_asgi(),
    ),
]
