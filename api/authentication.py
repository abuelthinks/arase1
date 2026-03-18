"""
Custom JWT authentication that reads tokens from HttpOnly cookies
instead of the Authorization header.
"""

from rest_framework_simplejwt.authentication import JWTAuthentication
from django.conf import settings


class CookieJWTAuthentication(JWTAuthentication):
    """
    Extends SimpleJWT to read the access token from an HttpOnly cookie.
    Falls back to the standard Authorization header for backwards compatibility
    (e.g., PDF download endpoints that pass token as query param).
    """

    def authenticate(self, request):
        # 1. Try cookie first
        raw_token = request.COOKIES.get(
            getattr(settings, 'JWT_AUTH_COOKIE', 'access_token')
        )
        if raw_token is not None:
            try:
                validated_token = self.get_validated_token(raw_token)
                return self.get_user(validated_token), validated_token
            except Exception:
                # Invalid/expired cookie — fall through to header auth
                pass

        # 2. Fall back to standard Authorization header
        return super().authenticate(request)
