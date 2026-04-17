from datetime import date

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from api.models import ReportCycle, Student, StudentAccess, User


@override_settings(ROOT_URLCONF='backend.urls')
class SecurityHardeningTests(APITestCase):
    def setUp(self):
        self.admin_password = 'StrongerPass123!'
        self.parent_password = 'ParentPass123!'
        self.specialist_password = 'SpecPass123!'
        self.teacher_password = 'TeachPass123!'

        self.admin = User.objects.create_user(
            username='adminuser',
            email='admin@example.com',
            password=self.admin_password,
            role='ADMIN',
            is_staff=True,
            is_superuser=True,
        )
        self.parent = User.objects.create_user(
            username='parentuser',
            email='parent@example.com',
            password=self.parent_password,
            role='PARENT',
        )
        self.specialist = User.objects.create_user(
            username='specialistuser',
            email='specialist@example.com',
            password=self.specialist_password,
            role='SPECIALIST',
        )
        self.teacher = User.objects.create_user(
            username='teacheruser',
            email='teacher@example.com',
            password=self.teacher_password,
            role='TEACHER',
        )

        self.student = Student.objects.create(
            first_name='Jamie',
            last_name='Doe',
            date_of_birth=date(2018, 1, 1),
            grade='Kinder',
            status='ENROLLED',
        )
        self.active_cycle = ReportCycle.objects.create(
            student=self.student,
            label='April 2026',
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
            is_active=True,
            status='OPEN',
        )
        self.other_student = Student.objects.create(
            first_name='Alex',
            last_name='Smith',
            date_of_birth=date(2017, 5, 5),
            grade='Grade 1',
            status='PENDING_ASSESSMENT',
        )
        self.other_cycle = ReportCycle.objects.create(
            student=self.other_student,
            label='Other',
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
            is_active=True,
            status='OPEN',
        )

        StudentAccess.objects.create(user=self.parent, student=self.student)
        StudentAccess.objects.create(user=self.specialist, student=self.student)
        StudentAccess.objects.create(user=self.teacher, student=self.student)

    def login_cookie_client(self, username, password):
        client = APIClient(enforce_csrf_checks=True)
        csrf_response = client.get('/api/auth/csrf/')
        self.assertEqual(csrf_response.status_code, status.HTTP_200_OK)
        response = client.post('/api/auth/token/', {
            'username': username,
            'password': password,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return client

    def test_non_admin_cannot_create_users(self):
        self.client.force_authenticate(user=self.parent)
        response = self.client.post('/api/users/', {
            'username': 'intruder',
            'password': 'Password123!',
            'email': 'intruder@example.com',
            'role': 'ADMIN',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_cannot_update_own_role(self):
        self.client.force_authenticate(user=self.parent)
        response = self.client.patch(f'/api/users/{self.parent.id}/', {
            'role': 'ADMIN',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.parent.refresh_from_db()
        self.assertEqual(self.parent.role, 'PARENT')

    def test_parent_onboarding_rejects_unassigned_student_update(self):
        self.client.force_authenticate(user=self.parent)
        response = self.client.post('/api/students/onboard/', {
            'student_id': self.other_student.id,
            'student': {
                'first_name': 'Changed',
                'last_name': 'Student',
                'date_of_birth': '2017-05-05',
                'grade': 'Grade 1',
            },
            'form_data': {'notes': 'hello'},
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            StudentAccess.objects.filter(user=self.parent, student=self.other_student).exists()
        )

    def test_parent_onboarding_allows_assigned_student_update(self):
        self.client.force_authenticate(user=self.parent)
        response = self.client.post('/api/students/onboard/', {
            'student_id': self.student.id,
            'student': {
                'first_name': 'jamie',
                'last_name': 'doe',
                'date_of_birth': '2018-01-01',
                'grade': 'Kinder 2',
            },
            'form_data': {'notes': 'updated'},
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.assertEqual(self.student.grade, 'Kinder 2')
        self.assertEqual(self.student.first_name, 'Jamie')

    def test_role_mismatch_blocks_form_submission(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.post('/api/inputs/multidisciplinary-assessment/', {
            'student': self.student.id,
            'report_cycle': self.active_cycle.id,
            'form_data': {'notes': 'not allowed'},
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_student_access_blocks_form_submission(self):
        other_specialist = User.objects.create_user(
            username='outsider',
            email='outsider@example.com',
            password='SpecPass123!',
            role='SPECIALIST',
        )
        self.client.force_authenticate(user=other_specialist)
        response = self.client.post('/api/inputs/multidisciplinary-assessment/', {
            'student': self.student.id,
            'report_cycle': self.active_cycle.id,
            'form_data': {'notes': 'not assigned'},
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cycle_mismatch_is_rejected(self):
        self.client.force_authenticate(user=self.parent)
        response = self.client.post('/api/inputs/parent-assessment/', {
            'student': self.student.id,
            'report_cycle': self.other_cycle.id,
            'form_data': {'notes': 'bad cycle'},
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_progress_tracker_requires_enrolled_student(self):
        self.student.status = 'ASSESSED'
        self.student.save(update_fields=['status'])
        self.client.force_authenticate(user=self.parent)
        response = self.client.post('/api/inputs/parent-tracker/', {
            'student': self.student.id,
            'report_cycle': self.active_cycle.id,
            'form_data': {'progress': 'blocked'},
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cookie_authenticated_mutation_requires_csrf(self):
        client = self.login_cookie_client('adminuser', self.admin_password)
        response = client.post('/api/users/', {
            'username': 'newstaff',
            'password': 'StrongPass123!',
            'email': 'newstaff@example.com',
            'role': 'TEACHER',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        response = client.post('/api/users/', {
            'username': 'newstaff',
            'password': 'StrongPass123!',
            'email': 'newstaff@example.com',
            'role': 'TEACHER',
        }, format='json', HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_refresh_rotation_replaces_refresh_cookie_and_invalidates_old_one(self):
        client = self.login_cookie_client('adminuser', self.admin_password)
        old_refresh = client.cookies['refresh_token'].value

        response = client.post(
            '/api/auth/token/refresh/',
            {},
            format='json',
            HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        new_refresh = response.cookies['refresh_token'].value
        self.assertNotEqual(old_refresh, new_refresh)

        stale_client = APIClient(enforce_csrf_checks=True)
        stale_client.get('/api/auth/csrf/')
        stale_client.cookies['refresh_token'] = old_refresh
        stale_response = stale_client.post(
            '/api/auth/token/refresh/',
            {},
            format='json',
            HTTP_X_CSRFTOKEN=stale_client.cookies['csrftoken'].value,
        )
        self.assertEqual(stale_response.status_code, status.HTTP_401_UNAUTHORIZED)
