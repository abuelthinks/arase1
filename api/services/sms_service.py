"""
SMS Service — Abstraction Layer
================================
Single entry point: send_sms(phone_number, message)

Switching providers requires only ONE change: the SMS_BACKEND setting.

┌─────────────────┬──────────────────────────────────────────────────────────┐
│ SMS_BACKEND     │ Used for                                                 │
├─────────────────┼──────────────────────────────────────────────────────────┤
│ 'smstrap'       │ Local development (routes to sms-trap on localhost:1290) │
│ 'twilio'        │ Production — requires TWILIO_* env vars                  │
│ 'vonage'        │ Production — requires VONAGE_* env vars (alternative)    │
└─────────────────┴──────────────────────────────────────────────────────────┘

To go live:
  1. In backend/settings/prod.py, set SMS_BACKEND = 'twilio'  (already done)
  2. Add the following to your Render / Railway environment variables:
       TWILIO_ACCOUNT_SID  = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       TWILIO_AUTH_TOKEN   = your_auth_token
       TWILIO_FROM_PHONE   = +1xxxxxxxxxx   (your Twilio number)
  3. pip install twilio  (add to requirements.txt)
  4. Done — no code changes needed.
"""

import logging
from django.conf import settings

logger = logging.getLogger(__name__)


# ─── Public API ───────────────────────────────────────────────────────────────

def send_sms(phone_number: str, message: str) -> bool:
    """
    Send an SMS to `phone_number` with the given `message`.

    Returns True on success, False on failure.
    The caller should handle the False case (e.g. return HTTP 500).
    """
    backend = getattr(settings, 'SMS_BACKEND', 'smstrap')

    if backend == 'smstrap':
        return _send_via_smstrap(phone_number, message)

    if backend == 'console':
        return _send_via_console(phone_number, message)

    if backend == 'twilio':
        return _send_via_twilio(phone_number, message)

    if backend == 'vonage':
        return _send_via_vonage(phone_number, message)

    logger.error(f"[SMS] Unknown SMS_BACKEND='{backend}'. Check your settings.")
    return False


# ─── Backends ─────────────────────────────────────────────────────────────────

def _send_via_smstrap(phone_number: str, message: str) -> bool:
    """
    DEV ONLY: Send via sms-trap (https://github.com/OmarFaruk-0x01/sms-trap).

    sms-trap API: GET /api/v1/trap
    Query params:
      phones[]  — recipient number
      message   — SMS body
      label     — 'transactional' | 'promotional'

    View intercepted messages at: http://localhost:1290
    No credentials needed — it's a local testing tool.
    """
    import requests

    trap_url = getattr(settings, 'SMS_TRAP_URL', 'http://localhost:1290')
    params = {
        'phones[]': phone_number,
        'message': message,
        'label': 'transactional',
    }
    try:
        r = requests.get(f"{trap_url}/api/v1/trap", params=params, timeout=3)
        if r.status_code == 200:
            logger.info(f"[SMS-TRAP] ✅ Sent to {phone_number} | {message}")
            return True
        logger.warning(f"[SMS-TRAP] ❌ {r.status_code}: {r.text}")
        return False
    except Exception as e:
        logger.warning(
            f"[SMS-TRAP] ❌ Could not connect to sms-trap at {trap_url}. "
            f"Is it running? Error: {e}"
        )
        return False
def _send_via_console(phone_number: str, message: str) -> bool:
    """
    FALLBACK: Logs the SMS to stdout / Django server console instead of sending it.

    Use this in production when no real SMS provider is integrated yet.
    The OTP code will appear in your server logs (Render, Railway, etc.).

    In dev.py or prod.py, set:  SMS_BACKEND = 'console'
    No credentials needed.
    """
    logger.warning(
        f"\n"
        f"{'='*55}\n"
        f"  📱 [SMS CONSOLE] — No provider configured  \n"
        f"  To : {phone_number}                         \n"
        f"  Msg: {message}                              \n"
        f"{'='*55}"
    )
    return True


def _send_via_twilio(phone_number: str, message: str) -> bool:
    """
    PRODUCTION: Send via Twilio (https://www.twilio.com).

    Required environment variables:
      TWILIO_ACCOUNT_SID  — found on your Twilio Console dashboard
      TWILIO_AUTH_TOKEN   — found on your Twilio Console dashboard
      TWILIO_FROM_PHONE   — your purchased Twilio phone number (e.g. +12345678900)

    Install: pip install twilio  (add to requirements.txt)
    """
    import os

    account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    auth_token  = os.environ.get('TWILIO_AUTH_TOKEN')
    from_phone  = os.environ.get('TWILIO_FROM_PHONE')

    if not all([account_sid, auth_token, from_phone]):
        logger.error(
            "[Twilio] ❌ Missing credentials. Ensure TWILIO_ACCOUNT_SID, "
            "TWILIO_AUTH_TOKEN, and TWILIO_FROM_PHONE are set in environment."
        )
        return False

    try:
        from twilio.rest import Client
        client = Client(account_sid, auth_token)
        msg = client.messages.create(body=message, from_=from_phone, to=phone_number)
        logger.info(f"[Twilio] ✅ Sent to {phone_number}. SID: {msg.sid}")
        return True
    except ImportError:
        logger.error("[Twilio] ❌ 'twilio' package is not installed. Run: pip install twilio")
        return False
    except Exception as e:
        logger.error(f"[Twilio] ❌ Failed to send SMS: {e}")
        return False


def _send_via_vonage(phone_number: str, message: str) -> bool:
    """
    PRODUCTION: Send via Vonage / Nexmo (https://www.vonage.com/communications-apis/sms/).
    An alternative to Twilio with competitive pricing in Southeast Asia.

    Required environment variables:
      VONAGE_API_KEY     — found on your Vonage Dashboard
      VONAGE_API_SECRET  — found on your Vonage Dashboard
      VONAGE_FROM_NAME   — sender name shown on the SMS (e.g. 'ARASE')

    Install: pip install vonage  (add to requirements.txt)
    """
    import os
    api_key    = os.environ.get('VONAGE_API_KEY')
    api_secret = os.environ.get('VONAGE_API_SECRET')
    from_name  = os.environ.get('VONAGE_FROM_NAME', 'ARASE')

    if not all([api_key, api_secret]):
        logger.error(
            "[Vonage] ❌ Missing credentials. Ensure VONAGE_API_KEY and "
            "VONAGE_API_SECRET are set in environment."
        )
        return False

    try:
        import vonage
        client = vonage.Client(key=api_key, secret=api_secret)
        sms = vonage.Sms(client)
        response = sms.send_message({
            "from": from_name,
            "to": phone_number.replace("+", ""),  # Vonage expects no leading +
            "text": message,
        })
        if response["messages"][0]["status"] == "0":
            logger.info(f"[Vonage] ✅ Sent to {phone_number}")
            return True
        logger.error(f"[Vonage] ❌ Error: {response['messages'][0]['error-text']}")
        return False
    except ImportError:
        logger.error("[Vonage] ❌ 'vonage' package is not installed. Run: pip install vonage")
        return False
    except Exception as e:
        logger.error(f"[Vonage] ❌ Failed to send SMS: {e}")
        return False
