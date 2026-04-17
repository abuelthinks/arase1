"""
Custom JWT authentication that reads tokens from HttpOnly cookies
instead of the Authorization header.
"""

from rest_framework import exceptions
from rest_framework.authentication import CSRFCheck
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.conf import settings


def enforce_csrf(request):
    """Run Django's CSRF validation for cookie-authenticated unsafe requests."""
    check = CSRFCheck(lambda _request: None)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        raise exceptions.PermissionDenied(f"CSRF Failed: {reason}")


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
                if request.method not in ('GET', 'HEAD', 'OPTIONS', 'TRACE'):
                    enforce_csrf(request)
                return self.get_user(validated_token), validated_token
            except exceptions.PermissionDenied:
                raise
            except Exception:
                # Invalid/expired cookie — fall through to header auth
                pass

        # 2. Fall back to standard Authorization header
        return super().authenticate(request)
