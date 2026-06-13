"""
Django production settings.
Used on Render / Railway / etc. — DEBUG off, PostgreSQL, strict security.
"""

from .base import *  # noqa: F401,F403

DEBUG = False

# SECRET_KEY MUST be set via environment variable in production
SECRET_KEY = os.environ['SECRET_KEY']

ALLOWED_HOSTS = [
    'arase1-production.up.railway.app',
    'arase1.vercel.app',
    # Allow overriding via env var for future domain changes
    *parse_csv_env('ALLOWED_HOSTS'),
    # Render injects this automatically — covers *.onrender.com deployments
    *([os.environ['RENDER_EXTERNAL_HOSTNAME']] if os.environ.get('RENDER_EXTERNAL_HOSTNAME') else []),
]

# ─── Database — PostgreSQL required in production ────────────────────────────
import dj_database_url

# NOTE: When DATABASE_URL points at Supabase's transaction pooler (port 6543),
# connections must be short-lived — persistent connections tie up the pooler's
# client slots and exhaust the 200-connection limit. Default conn_max_age to 0;
# override via DB_CONN_MAX_AGE only when using a direct/session connection (5432).
DATABASES = {
    'default': dj_database_url.config(
        default=os.environ.get('DATABASE_URL'),
        conn_max_age=int(os.environ.get('DB_CONN_MAX_AGE', '0')),
        conn_health_checks=True,
    )
}

# Transaction-mode poolers don't support server-side cursors — disable them so
# querysets using .iterator() don't fail with "cursor does not exist".
DATABASES['default']['DISABLE_SERVER_SIDE_CURSORS'] = True

# ─── CORS — configured from production frontend origins ───────────────────────
CORS_ALLOWED_ORIGINS = parse_csv_env('CORS_ALLOWED_ORIGINS')
configured_frontend_url = os.environ.get('FRONTEND_URL', '').rstrip('/')
if configured_frontend_url and configured_frontend_url not in CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS.append(configured_frontend_url)
CORS_ALLOW_CREDENTIALS = True

# ─── CSRF trusted origins ───────────────────────────────────────────────────
CSRF_TRUSTED_ORIGINS = parse_csv_env('CSRF_TRUSTED_ORIGINS')
for origin in CORS_ALLOWED_ORIGINS:
    if origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(origin)

# Add railway domain patterns if they appear in ALLOWED_HOSTS
for host in ALLOWED_HOSTS:
    if 'railway.app' in host:
        if not host.startswith('http'):
            CSRF_TRUSTED_ORIGINS.append(f"https://{host}")



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
SECURE_REDIRECT_EXEMPT = [r'^/api/', r'^/$']
# CSRF and allowed hosts are handled by deployment environment variables.

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
