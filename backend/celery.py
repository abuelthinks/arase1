"""
Celery app configuration for the backend project.
"""

import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings.dev')

app = Celery('backend')

# Load task modules from all registered Django apps.
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Scheduled jobs. Run beat alongside the worker (`celery -A backend worker -B`).
# Times are UTC: 01:00 UTC is 9:00 AM in Manila.
from celery.schedules import crontab  # noqa: E402

app.conf.beat_schedule = {
    'daily-tracker-reminders': {
        'task': 'api.tasks.send_scheduled_tracker_reminders_task',
        'schedule': crontab(hour=1, minute=0),
    },
    'hourly-assessment-appointment-reminders': {
        'task': 'api.tasks.send_assessment_appointment_reminders_task',
        'schedule': crontab(minute=0),
    },
}


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """A simple debug task for testing Celery connectivity."""
    print(f'Request: {self.request!r}')
