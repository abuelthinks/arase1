"""
Cookie-based JWT authentication views.
Sets tokens as HttpOnly cookies instead of returning them in JSON body.
"""

from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from datetime import timedelta
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from .authentication import enforce_csrf
from .serializers import CustomTokenObtainPairSerializer


def _set_auth_cookies(response, access_token, refresh_token=None):
    """Helper to set HttpOnly auth cookies on a response."""
    is_secure = not getattr(settings, 'DEBUG', False)
    cookie_kwargs = {
        'httponly': True,
        # SameSite=None is required in production because the frontend (Vercel) and
        # backend (Railway) are on different domains. SameSite=Lax is safe for local
        # dev because both run on localhost and cross-site cookies aren't needed.
        'samesite': 'None' if is_secure else 'Lax',
        'secure': is_secure,
        'path': '/',
    }
    response.set_cookie(
        settings.JWT_AUTH_COOKIE,
        str(access_token),
        max_age=int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
        **cookie_kwargs,
    )
    if refresh_token is not None:
        response.set_cookie(
            settings.JWT_AUTH_REFRESH_COOKIE,
            str(refresh_token),
            max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
            **cookie_kwargs,
        )
    return response


from django.middleware.csrf import get_token

@method_decorator(ensure_csrf_cookie, name='dispatch')
class CsrfCookieView(APIView):
    """Ensure the browser receives a CSRF cookie for cookie-authenticated writes."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        csrf_token = get_token(request)
        return Response({'detail': 'CSRF cookie set.', 'csrfToken': csrf_token}, status=status.HTTP_200_OK)


class CookieTokenObtainPairView(TokenObtainPairView):
    """
    POST: Authenticate user, set access + refresh as HttpOnly cookies.
    Returns user_id and role in JSON body (no raw tokens).
    """
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0])

        access = serializer.validated_data['access']
        refresh = serializer.validated_data['refresh']
        user = serializer.user

        response = Response({
            'user_id': user.id,
            'role': user.role,
            'email': user.email,
            'message': 'Login successful.',
        }, status=status.HTTP_200_OK)

        return _set_auth_cookies(response, access, refresh)


class CookieTokenRefreshView(APIView):
    """
    POST: Refresh the access token using the refresh cookie.
    No request body needed — the refresh token is read from the cookie.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        enforce_csrf(request)
        refresh_token = request.COOKIES.get(settings.JWT_AUTH_REFRESH_COOKIE)
        if not refresh_token:
            return Response(
                {'error': 'No refresh token cookie found.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            serializer = TokenRefreshSerializer(data={'refresh': refresh_token})
            serializer.is_valid(raise_exception=True)
            response = Response({'message': 'Token refreshed.'}, status=status.HTTP_200_OK)
            return _set_auth_cookies(
                response,
                serializer.validated_data['access'],
                serializer.validated_data.get('refresh'),
            )
        except (TokenError, InvalidToken):
            response = Response(
                {'error': 'Invalid or expired refresh token.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            response.delete_cookie(settings.JWT_AUTH_COOKIE, path='/')
            response.delete_cookie(settings.JWT_AUTH_REFRESH_COOKIE, path='/')
            return response


class LogoutView(APIView):
    """
    POST: Clear auth cookies and blacklist the refresh token.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        enforce_csrf(request)
        refresh_token = request.COOKIES.get(settings.JWT_AUTH_REFRESH_COOKIE)

        response = Response({'message': 'Logged out.'}, status=status.HTTP_200_OK)
        response.delete_cookie(settings.JWT_AUTH_COOKIE, path='/')
        response.delete_cookie(settings.JWT_AUTH_REFRESH_COOKIE, path='/')

        # Blacklist the refresh token if present
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except TokenError:
                pass  # Token already invalid — that's fine

        return response


class MeView(APIView):
    """
    GET: Return the current authenticated user's basic info.
    Used by the frontend to check auth state on page load.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .serializers import _pending_specialty_request

        user = request.user
        return Response({
            'user_id': user.id,
            'role': user.role,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'phone_number': user.phone_number,
            'is_phone_verified': user.is_phone_verified,
            'specialty': getattr(user, 'specialty', '') or '',
            'specialties': user.specialty_list() if hasattr(user, 'specialty_list') else (
                [user.specialty] if getattr(user, 'specialty', '') else []
            ),
            'grade_level': getattr(user, 'grade_level', '') or '',
            'languages': user.language_list() if hasattr(user, 'language_list') else [],
            'specialist_onboarding_complete': user.is_specialist_onboarding_complete() if hasattr(user, 'is_specialist_onboarding_complete') else True,
            'specialist_onboarding_missing': user.specialist_onboarding_missing() if hasattr(user, 'specialist_onboarding_missing') else [],
            'teacher_profile_complete': user.is_teacher_profile_complete() if hasattr(user, 'is_teacher_profile_complete') else True,
            'teacher_profile_missing': user.teacher_profile_missing() if hasattr(user, 'teacher_profile_missing') else [],
            'pending_specialty_request': _pending_specialty_request(user),
        })


class WsTicketView(APIView):
    """
    GET: Return a short-lived access token for opening a WebSocket.
    The frontend proxies REST calls through its own domain, so the auth cookie
    never reaches the backend's WebSocket host; the socket passes this as ?token=.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        token = AccessToken.for_user(request.user)
        token.set_exp(lifetime=timedelta(seconds=60))
        return Response({'token': str(token)})


class PasswordResetRequestView(APIView):
    """
    POST {email}: email a reset link if an active account matches.
    Always responds the same way so the form can't be used to discover accounts.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset'

    def post(self, request):
        import logging
        from django.contrib.auth import get_user_model
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode
        from .services.user_service import send_password_reset_email

        email = (request.data.get('email') or '').strip()
        user = get_user_model().objects.filter(email__iexact=email, is_active=True).first() if email else None
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_link = f"{settings.FRONTEND_URL}/reset-password/?uid={uid}&token={token}"
            try:
                send_password_reset_email(user, reset_link)
            except Exception as e:
                logging.getLogger(__name__).warning(f"Password reset email failed for user {user.pk}: {e}")

        return Response(
            {'message': 'If an account exists for that email, a reset link has been sent.'},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """
    POST {uid, token, password}: set a new password. The token stops working
    once the password changes, so each link can only be used once.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset'

    def post(self, request):
        from django.contrib.auth import get_user_model
        from django.contrib.auth.password_validation import validate_password
        from django.contrib.auth.tokens import default_token_generator
        from django.core.exceptions import ValidationError
        from django.utils.encoding import force_str
        from django.utils.http import urlsafe_base64_decode

        uid = request.data.get('uid') or ''
        token = request.data.get('token') or ''
        password = request.data.get('password') or ''

        try:
            user = get_user_model().objects.get(pk=force_str(urlsafe_base64_decode(uid)), is_active=True)
        except (ValueError, TypeError, OverflowError, get_user_model().DoesNotExist):
            user = None

        if user is None or not default_token_generator.check_token(user, token):
            return Response(
                {'error': 'This reset link is invalid or has expired. Please request a new one.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(password, user)
        except ValidationError as e:
            return Response({'password': list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(password)
        user.save(update_fields=['password'])
        return Response({'message': 'Password updated. You can now sign in.'}, status=status.HTTP_200_OK)
