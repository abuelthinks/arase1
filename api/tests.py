from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


User = get_user_model()


class AuthAndHealthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            username="admin1",
            email="admin@example.com",
            password=self.password,
            role="ADMIN",
            first_name="Ada",
            last_name="Admin",
        )

    def _login(self):
        response = self.client.post(
            "/api/auth/token/",
            {"username": self.user.username, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.client.cookies.update(response.cookies)
        return response

    def test_login_sets_cookies_and_me_returns_user(self):
        response = self._login()

        self.assertIn(settings.JWT_AUTH_COOKIE, response.cookies)
        self.assertIn(settings.JWT_AUTH_REFRESH_COOKIE, response.cookies)
        self.assertEqual(response.data["role"], "ADMIN")

        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["user_id"], self.user.id)
        self.assertEqual(me.data["username"], self.user.username)
        self.assertEqual(me.data["role"], "ADMIN")

    def test_non_json_form_posts_are_rejected(self):
        response = self.client.post(
            "/api/auth/token/",
            {"username": self.user.username, "password": self.password},
        )
        self.assertEqual(response.status_code, 415)

    def test_refresh_rotation_issues_a_new_refresh_cookie(self):
        self._login()

        first_refresh = self.client.post("/api/auth/token/refresh/")
        self.assertEqual(first_refresh.status_code, 200)
        self.assertIn(settings.JWT_AUTH_REFRESH_COOKIE, first_refresh.cookies)

        first_cookie = first_refresh.cookies[settings.JWT_AUTH_REFRESH_COOKIE].value
        self.client.cookies.update(first_refresh.cookies)

        second_refresh = self.client.post("/api/auth/token/refresh/")
        self.assertEqual(second_refresh.status_code, 200)
        self.assertIn(settings.JWT_AUTH_REFRESH_COOKIE, second_refresh.cookies)

        second_cookie = second_refresh.cookies[settings.JWT_AUTH_REFRESH_COOKIE].value
        self.assertNotEqual(first_cookie, second_cookie)

    def test_health_endpoint_is_minimal(self):
        response = self.client.get("/api/health-check/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "online"})

    @override_settings(
        CORS_ALLOW_ALL_ORIGINS=False,
        CORS_ALLOW_CREDENTIALS=True,
        CORS_ALLOWED_ORIGINS=["https://app.example.com"],
    )
    def test_cors_allows_only_trusted_origins(self):
        allowed = self.client.get(
            "/api/health-check/",
            HTTP_ORIGIN="https://app.example.com",
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(
            allowed.get("Access-Control-Allow-Origin"),
            "https://app.example.com",
        )
        self.assertEqual(
            allowed.get("Access-Control-Allow-Credentials"),
            "true",
        )

        blocked = self.client.get(
            "/api/health-check/",
            HTTP_ORIGIN="https://evil.example.com",
        )
        self.assertEqual(blocked.status_code, 200)
        self.assertIsNone(blocked.get("Access-Control-Allow-Origin"))
