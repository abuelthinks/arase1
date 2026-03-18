# Import celery app so it's always loaded when Django starts.
from .celery import app as celery_app

__all__ = ['celery_app']
