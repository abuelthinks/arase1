"""
URL configuration for backend project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from api.models import User

# Cookie-based auth views (HttpOnly cookies)
from api.auth_views import (
    CsrfCookieView,
    CookieTokenObtainPairView,
    CookieTokenRefreshView,
    LogoutView,
    MeView,
)


class HealthView(APIView):
    permission_classes = [permissions.AllowAny]
    def get(self, request):
        admins = User.objects.filter(is_superuser=True).values('email', 'role', 'first_name', 'last_name')
        return Response({
            "status": "online",
            "superusers": list(admins),
            "total_users": User.objects.count()
        })


urlpatterns = [
    path('admin/', admin.site.urls),
    path('', HealthView.as_view(), name='root_health_check'),
    path('api/health/', HealthView.as_view(), name='health_check_alias'),
    path('api/health-check/', HealthView.as_view(), name='health_check'),
    path('api/', include('api.urls')),

    # ─── Cookie-based auth endpoints ─────────────────────────────────────
    path('api/auth/token', CookieTokenObtainPairView.as_view(), name='token_obtain_pair_no_slash'),
    path('api/auth/token/', CookieTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh', CookieTokenRefreshView.as_view(), name='token_refresh_no_slash'),
    path('api/auth/token/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/logout', LogoutView.as_view(), name='auth_logout_no_slash'),
    path('api/auth/logout/', LogoutView.as_view(), name='auth_logout'),
    path('api/auth/csrf', CsrfCookieView.as_view(), name='auth_csrf_no_slash'),
    path('api/auth/csrf/', CsrfCookieView.as_view(), name='auth_csrf'),
    path('api/auth/me', MeView.as_view(), name='auth_me_no_slash'),
    path('api/auth/me/', MeView.as_view(), name='auth_me'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
