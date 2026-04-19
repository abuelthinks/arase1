import re

# Fix serializers.py
with open('api/serializers.py', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'class NotificationSerializer.*?created_at\']\s*', '', text, flags=re.DOTALL)
text += '''
class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'notification_type', 'title', 'message', 'link', 'is_read', 'created_at']
        read_only_fields = ['id', 'notification_type', 'title', 'message', 'link', 'created_at']
'''

with open('api/serializers.py', 'w', encoding='utf-8') as f:
    f.write(text)

# Fix models.py
with open('api/models.py', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'# ─── In-App Notifications ────────────────────────────────────────────────────.*', '', text, flags=re.DOTALL)
text += '''
# ─── In-App Notifications ────────────────────────────────────────────────────

class Notification(models.Model):
    NOTIFICATION_TYPES = (
        ('FORM_SUBMITTED', 'Form Submitted'),
        ('STUDENT_ENROLLED', 'Student Enrolled'),
        ('STUDENT_ASSESSED', 'Student Assessed'),
        ('IEP_GENERATED', 'IEP Generated'),
        ('REPORT_GENERATED', 'Report Generated'),
        ('REPORT_FINALIZED', 'Report Finalized'),
        ('SPECIALIST_ASSIGNED', 'Specialist Assigned'),
        ('TEACHER_ASSIGNED', 'Teacher Assigned'),
        ('CYCLE_CREATED', 'Cycle Created'),
        ('REMINDER', 'Reminder'),
        ('SYSTEM', 'System'),
    )

    recipient = models.ForeignKey('User', on_delete=models.CASCADE, related_name='notifications')
    notification_type = models.CharField(max_length=30, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True, default='')
    link = models.CharField(max_length=500, blank=True, default='')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.notification_type} -> {self.recipient.username}"
'''

with open('api/models.py', 'w', encoding='utf-8') as f:
    f.write(text)

# Fix views.py
with open('api/views.py', 'r', encoding='utf-8') as f:
    text = f.read()

if 'NotificationListView' not in text:
    text = text.replace('from .models import (\\n', 'from .models import (\\n    Notification,\\n')
    text = text.replace('from .serializers import (\\n', 'from .serializers import (\\n    NotificationSerializer,\\n')
    text += '''
# ─── Notifications ───────────────────────────────────────────────────────────

from rest_framework.views import APIView
from rest_framework import permissions, status
from rest_framework.response import Response

class NotificationListView(APIView):
    """GET: List notifications for the authenticated user."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Notification.objects.filter(recipient=request.user)[:50]
        unread_count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        serializer = NotificationSerializer(qs, many=True)
        return Response({
            'notifications': serializer.data,
            'unread_count': unread_count
        })

class NotificationMarkReadView(APIView):
    """POST: Mark a single notification as read."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            notif = Notification.objects.get(pk=pk, recipient=request.user)
        except Notification.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        notif.is_read = True
        notif.save(update_fields=['is_read'])
        return Response({'status': 'ok'})

class NotificationMarkAllReadView(APIView):
    """POST: Mark all notifications as read for the authenticated user."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({'status': 'ok'})
'''
with open('api/views.py', 'w', encoding='utf-8') as f:
    f.write(text)

print("Backend restored fully.")
