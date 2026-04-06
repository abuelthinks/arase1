"""
Cookie-based JWT authentication views.
Sets tokens as HttpOnly cookies instead of returning them in JSON body.
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from django.conf import settings
from .serializers import CustomTokenObtainPairSerializer


def _set_auth_cookies(response, access_token, refresh_token=None):
    """Helper to set HttpOnly auth cookies on a response."""
    is_secure = not getattr(settings, 'DEBUG', False)
    cookie_kwargs = {
        'httponly': True,
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
            'username': user.username,
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
        refresh_token = request.COOKIES.get(settings.JWT_AUTH_REFRESH_COOKIE)
        if not refresh_token:
            return Response(
                {'error': 'No refresh token cookie found.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            token = RefreshToken(refresh_token)
            access = str(token.access_token)

            response = Response({'message': 'Token refreshed.'}, status=status.HTTP_200_OK)
            _set_auth_cookies(response, access)

            # Rotate refresh token if configured: blacklist old, issue new
            if settings.SIMPLE_JWT.get('ROTATE_REFRESH_TOKENS', False):
                if settings.SIMPLE_JWT.get('BLACKLIST_AFTER_ROTATION', False):
                    try:
                        token.blacklist()
                    except Exception:
                        pass  # blacklist app may not be installed
                # Issue a fresh refresh token for the same user
                from rest_framework_simplejwt.tokens import RefreshToken as RT
                new_refresh_token = RT.for_user(
                    self.get_user_from_token(token)
                ) if hasattr(self, 'get_user_from_token') else token
                is_secure = not getattr(settings, 'DEBUG', False)
                response.set_cookie(
                    settings.JWT_AUTH_REFRESH_COOKIE,
                    str(new_refresh_token),
                    httponly=True,
                    samesite='None' if is_secure else 'Lax',
                    secure=is_secure,
                    path='/',
                    max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
                )

            return response
        except TokenError:
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
        user = request.user
        return Response({
            'user_id': user.id,
            'role': user.role,
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'phone_number': user.phone_number,
            'is_phone_verified': user.is_phone_verified,
        })
