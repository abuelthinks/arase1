"""
Django production settings.
Used on Render / Railway / etc. — DEBUG off, PostgreSQL, strict security.
"""

from .base import *  # noqa: F401,F403

DEBUG = False

# SECRET_KEY MUST be set via environment variable in production
SECRET_KEY = os.environ['SECRET_KEY']

ALLOWED_HOSTS = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', '').split(',') if h.strip()]

# ─── Database — PostgreSQL required in production ────────────────────────────
import dj_database_url

DATABASES = {
    'default': dj_database_url.config(
        default=os.environ.get('DATABASE_URL'),
        conn_max_age=600,
        conn_health_checks=True,
    )
}

# ─── CORS — loosened for testing to ensure errors are readable ─────────────────
_raw_cors = os.environ.get('CORS_ALLOWED_ORIGINS', '')
CORS_ALLOWED_ORIGINS = [o.strip() for o in _raw_cors.split(',') if o.strip()]

if not CORS_ALLOWED_ORIGINS:
    frontend_url = os.environ.get('FRONTEND_URL', '').strip()
    if frontend_url:
        CORS_ALLOWED_ORIGINS = [frontend_url]

CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True

# ─── CSRF trusted origins ───────────────────────────────────────────────────
_raw_csrf = os.environ.get('CSRF_TRUSTED_ORIGINS', '')
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _raw_csrf.split(',') if o.strip()]



# ─── Security hardening ─────────────────────────────────────────────────────
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'True') == 'True'
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = 'None'
CSRF_COOKIE_SAMESITE = 'None'
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# --- Secure Proxy & Redirects ---
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_REDIRECT_EXEMPT = [r'^api/', r'^$']
# CSRF and Allowed Hosts are handled via Render Environment Variables

# ─── SMS — Production Configuration ──────────────────────────────────────────
#
# To enable real SMS in production:
#
#   STEP 1 — Choose your provider and set SMS_BACKEND in your env:
#     SMS_BACKEND = 'twilio'    # Most popular, great global coverage
#     SMS_BACKEND = 'vonage'    # Good alternative, competitive pricing in SE Asia
#
#   STEP 2 — Add credentials to your Render / Railway environment variables:
#     For Twilio:
#       TWILIO_ACCOUNT_SID  = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#       TWILIO_AUTH_TOKEN   = your_auth_token
#       TWILIO_FROM_PHONE   = +1xxxxxxxxxx
#     For Vonage:
#       VONAGE_API_KEY      = xxxxxxxx
#       VONAGE_API_SECRET   = xxxxxxxxxxxxxxxx
#       VONAGE_FROM_NAME    = ARASE
#
#   STEP 3 — Add the SDK to requirements.txt:
#     twilio   (for Twilio)
#     vonage   (for Vonage)
#
#   STEP 4 — Redeploy. No code changes needed.
#
# Until you integrate a real provider, set SMS_BACKEND='console' to log codes
# to your server output (Render logs) instead of crashing.
#
SMS_BACKEND = os.environ.get('SMS_BACKEND', 'console')
