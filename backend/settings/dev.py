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

# ─── CORS — allow localhost frontends ────────────────────────────────────────
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]

# ─── Disable throttling in dev for easier testing ────────────────────────────
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {},
}
