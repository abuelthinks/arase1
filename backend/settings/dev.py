"""
Django development settings.
Used for local development — DEBUG on, SQLite, relaxed CORS.
"""

from .base import *  # noqa: F401,F403

DEBUG = True

SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'django-insecure-dev-only-key-do-not-use-in-production-12345'
)

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0']

# ─── Database ────────────────────────────────────────────────────────────────
import dj_database_url

DATABASES = {
    'default': dj_database_url.config(
        default=os.environ.get('DATABASE_URL', f"sqlite:///{BASE_DIR / 'db.sqlite3'}"),
        conn_max_age=600,
        conn_health_checks=True,
    )
}
if DATABASES['default']['ENGINE'] == 'django.db.backends.sqlite3':
    DATABASES['default'].setdefault('OPTIONS', {})
    DATABASES['default']['OPTIONS'].setdefault('timeout', 30)

# ─── CORS — allow localhost frontends ────────────────────────────────────────
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS.copy()

if not os.environ.get('REDIS_URL'):
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }

# ─── Email — routed to Mailpit for local testing ─────────────────────────────
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'localhost')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '1025'))
EMAIL_USE_TLS = False
EMAIL_USE_SSL = False
DEFAULT_FROM_EMAIL = 'ARASE <noreply@arase.local>'
FRONTEND_URL = 'http://localhost:3000'

# ─── Disable throttling in dev for easier testing ────────────────────────────
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {},
}

# ─── SMS — routed to sms-trap on port 1290 for local testing ──────────────────
# In production, change SMS_BACKEND to 'twilio' and set TWILIO_* env vars.
SMS_BACKEND = 'smstrap'
SMS_TRAP_URL = os.environ.get('SMS_TRAP_URL', 'http://localhost:1290')
