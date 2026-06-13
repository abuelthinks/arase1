from datetime import date

from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from api.models import (
    Invitation,
    ParentAssessment,
    ParentProgressTracker,
    GeneratedDocument,
    MultidisciplinaryAssessment,
    MultidisciplinaryProgressTracker,
    Notification,
    ReportCycle,
    SpedProgressTracker,
    Student,
    StudentAccess,
    User,
)


@override_settings(ROOT_URLCONF='backend.urls')
class SecurityHardeningTests(APITestCase):
    def setUp(self):
        self.admin_password = 'StrongerPass123!'
        self.parent_password = 'ParentPass123!'
        self.specialist_password = 'SpecPass123!'
        self.teacher_password = 'TeachPass123!'

        self.admin = User.objects.create_user(
            email='adminuser@example.com',
            password=self.admin_password,
            role='ADMIN',
            is_staff=True,
            is_superuser=True,
        )
        self.parent = User.objects.create_user(
            email='parentuser@example.com',
            password=self.parent_password,
            role='PARENT',
        )
        self.specialist = User.objects.create_user(
            email='specialistuser@example.com',
            password=self.specialist_password,
            role='SPECIALIST',
        )
        self.teacher = User.objects.create_user(
            email='teacheruser@example.com',
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

    def login_cookie_client(self, email, password):
        client = APIClient(enforce_csrf_checks=True)
        csrf_response = client.get('/api/auth/csrf/')
        self.assertEqual(csrf_response.status_code, status.HTTP_200_OK)
        response = client.post('/api/auth/token/', {
            'email': email,
            'password': password,
        })
        if response.status_code != 200: print(response.data); self.assertEqual(response.status_code, status.HTTP_200_OK)
        return client

    def test_login_accepts_slashless_token_url(self):
        client = APIClient(enforce_csrf_checks=True)
        csrf_response = client.get('/api/auth/csrf')
        self.assertEqual(csrf_response.status_code, status.HTTP_200_OK)

        response = client.post('/api/auth/token', {
            'email': 'adminuser@example.com',
            'password': self.admin_password,
        }, format='json')

        if response.status_code != 200: print(response.data); self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', response.cookies)
        self.assertIn('refresh_token', response.cookies)

    def test_refresh_accepts_slashless_refresh_url(self):
        client = self.login_cookie_client('adminuser@example.com', self.admin_password)

        response = client.post(
            '/api/auth/token/refresh',
            {},
            format='json',
            HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value,
        )

        if response.status_code != 200: print(response.data); self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', response.cookies)

    def test_non_admin_cannot_create_users(self):
        self.client.force_authenticate(user=self.parent)
        response = self.client.post('/api/users/', {
            'email': 'intruder@example.com',
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

    def test_specialist_can_update_own_profile_setup_fields(self):
        self.client.force_authenticate(user=self.specialist)
        response = self.client.patch(f'/api/users/{self.specialist.id}/', {
            'first_name': 'sam',
            'last_name': 'rivera',
            'languages': ['English', 'Tagalog'],
        }, format='json')
        if response.status_code != 200: print(response.data); self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.specialist.refresh_from_db()
        self.assertEqual(self.specialist.first_name, 'Sam')
        self.assertEqual(self.specialist.last_name, 'Rivera')
        self.assertEqual(self.specialist.language_list(), ['English', 'Tagalog'])

    def test_specialist_cannot_patch_another_user_profile_setup_fields(self):
        other_specialist = User.objects.create_user(
            email='otherspec@example.com',
            password='SpecPass123!',
            role='SPECIALIST',
        )
        self.client.force_authenticate(user=self.specialist)
        response = self.client.patch(f'/api/users/{other_specialist.id}/', {
            'languages': ['English'],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_auth_me_includes_specialist_onboarding_status(self):
        self.client.force_authenticate(user=self.specialist)
        response = self.client.get('/api/auth/me/')
        if response.status_code != 200: print(response.data); self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['specialist_onboarding_complete'])
        self.assertIn('first_name', response.data['specialist_onboarding_missing'])
        self.assertIn('last_name', response.data['specialist_onboarding_missing'])
        self.assertIn('specialty', response.data['specialist_onboarding_missing'])
        self.assertIn('languages', response.data['specialist_onboarding_missing'])

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
        if response.status_code != 200: print(response.data); self.assertEqual(response.status_code, status.HTTP_200_OK)
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

    def test_specialist_onboarding_blocks_availability_creation(self):
        self.client.force_authenticate(user=self.specialist)
        response = self.client.post('/api/assessment/availability/', {
            'start_at': '2026-04-30T01:00:00Z',
            'end_at': '2026-04-30T02:00:00Z',
            'mode': 'ONLINE',
            'is_active': True,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_specialist_onboarding_blocks_progress_tracker_submission(self):
        self.client.force_authenticate(user=self.specialist)
        response = self.client.post('/api/inputs/multidisciplinary-tracker/', {
            'student': self.student.id,
            'report_cycle': self.active_cycle.id,
            'form_data': {'progress': 'blocked'},
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_specialist_can_request_specialty_change(self):
        self.specialist.specialty = 'Speech-Language Pathology'
        self.specialist.specialties = ['Speech-Language Pathology']
        self.specialist.save(update_fields=['specialty', 'specialties'])
        self.client.force_authenticate(user=self.specialist)
        response = self.client.post('/api/users/request-specialty-change/', {
            'specialty': 'Occupational Therapy',
            'note': 'My caseload and credentials are OT-focused.',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Notification.objects.filter(
            notification_type='SYSTEM',
            title__icontains='Specialty change request',
            message__icontains='Occupational Therapy',
        ).exists())

    def test_student_cycle_mismatch_is_rejected(self):
        self.client.force_authenticate(user=self.parent)
        response = self.client.post('/api/inputs/parent-assessment/', {
            'student': self.student.id,
            'report_cycle': self.other_cycle.id,
            'form_data': {'notes': 'bad cycle'},
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_parent_assessment_unlock_flow_notifies_admin_and_parent(self):
        ParentAssessment.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.parent,
            form_data={'notes': 'submitted'},
        )

        self.client.force_authenticate(user=self.parent)
        request_response = self.client.post('/api/inputs/parent-assessment/request-unlock/', {
            'student_id': self.student.id,
            'report_cycle_id': self.active_cycle.id,
        }, format='json')

        self.assertEqual(request_response.status_code, status.HTTP_200_OK)
        self.assertTrue(Notification.objects.filter(
            recipient=self.admin,
            notification_type='UNLOCK_REQUESTED',
            title='Parent assessment unlock requested',
            message__icontains='requested to unlock the parent assessment',
        ).exists())

        self.client.force_authenticate(user=self.admin)
        unlock_response = self.client.post('/api/inputs/parent-assessment/unlock/', {
            'student_id': self.student.id,
            'report_cycle_id': self.active_cycle.id,
        }, format='json')

        self.assertEqual(unlock_response.status_code, status.HTTP_200_OK)
        self.assertTrue(Notification.objects.filter(
            recipient=self.parent,
            notification_type='SYSTEM',
            title='Parent assessment unlocked',
            message__icontains='has been unlocked',
        ).exists())

    def test_parent_assessment_resubmit_updates_in_place(self):
        ParentAssessment.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.parent,
            form_data={'notes': 'original'},
            unlock_requested=True,
            unlocked_at=timezone.now(),
            unlocked_by=self.admin,
        )

        self.client.force_authenticate(user=self.parent)
        response = self.client.post('/api/inputs/parent-assessment/', {
            'student': self.student.id,
            'report_cycle': self.active_cycle.id,
            'form_data': {'notes': 'corrected'},
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # No duplicate row, and the edit is the one IEP/report generation reads.
        rows = ParentAssessment.objects.filter(
            student=self.student, report_cycle=self.active_cycle,
        )
        self.assertEqual(rows.count(), 1)
        row = rows.first()
        self.assertEqual(row.form_data, {'notes': 'corrected'})
        self.assertFalse(row.unlock_requested)
        self.assertIsNone(row.unlocked_at)

    def test_specialist_assessment_unlock_flow_notifies_admin(self):
        MultidisciplinaryAssessment.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.specialist,
            form_data={'notes': 'submitted'},
            finalized_at=timezone.now(),
            finalized_by=self.specialist,
        )

        self.client.force_authenticate(user=self.specialist)
        request_response = self.client.post('/api/inputs/multidisciplinary-assessment/request-unlock/', {
            'student_id': self.student.id,
            'report_cycle_id': self.active_cycle.id,
        }, format='json')

        self.assertEqual(request_response.status_code, status.HTTP_200_OK)
        self.assertTrue(Notification.objects.filter(
            recipient=self.admin,
            notification_type='UNLOCK_REQUESTED',
            title='Unlock Request',
            message__icontains='requested to unlock the specialist assessment',
        ).exists())

    def test_specialist_assessment_unlock_reconciles_student_status(self):
        self.student.status = 'ASSESSED'
        self.student.save(update_fields=['status'])

        MultidisciplinaryAssessment.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.specialist,
            form_data={'notes': 'submitted'},
            finalized_at=timezone.now(),
            finalized_by=self.specialist,
        )

        self.client.force_authenticate(user=self.admin)
        unlock_response = self.client.post('/api/inputs/multidisciplinary-assessment/unlock/', {
            'student_id': self.student.id,
            'report_cycle_id': self.active_cycle.id,
        }, format='json')

        self.assertEqual(unlock_response.status_code, status.HTTP_200_OK)
        
        self.student.refresh_from_db()
        self.assertEqual(self.student.status, 'ASSESSMENT_SCHEDULED')

    def test_specialist_assessment_unlock_notifies_specialist(self):
        MultidisciplinaryAssessment.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.specialist,
            form_data={'notes': 'submitted'},
            finalized_at=timezone.now(),
            finalized_by=self.specialist,
        )

        self.client.force_authenticate(user=self.admin)
        unlock_response = self.client.post('/api/inputs/multidisciplinary-assessment/unlock/', {
            'student_id': self.student.id,
            'report_cycle_id': self.active_cycle.id,
        }, format='json')

        self.assertEqual(unlock_response.status_code, status.HTTP_200_OK)

        self.assertTrue(Notification.objects.filter(
            recipient=self.specialist,
            notification_type='SYSTEM',
            title__icontains='Specialist Assessment unlocked',
            message__icontains='has been unlocked'
        ).exists())

    def test_specialist_tracker_unlock_notifies_specialist(self):
        MultidisciplinaryProgressTracker.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.specialist,
            form_data={'notes': 'submitted'},
            finalized_at=timezone.now(),
            finalized_by=self.specialist,
        )

        self.client.force_authenticate(user=self.admin)
        unlock_response = self.client.post('/api/inputs/multidisciplinary-tracker/unlock/', {
            'student_id': self.student.id,
            'report_cycle_id': self.active_cycle.id,
        }, format='json')

        self.assertEqual(unlock_response.status_code, status.HTTP_200_OK)

        self.assertTrue(Notification.objects.filter(
            recipient=self.specialist,
            notification_type='SYSTEM',
            title__icontains='Specialist Progress Tracker unlocked',
            message__icontains='has been unlocked'
        ).exists())

    def test_specialist_tracker_unlock_flow_notifies_admin(self):
        MultidisciplinaryProgressTracker.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.specialist,
            form_data={'notes': 'submitted'},
            finalized_at=timezone.now(),
            finalized_by=self.specialist,
        )

        self.client.force_authenticate(user=self.specialist)
        request_response = self.client.post('/api/inputs/multidisciplinary-tracker/request-unlock/', {
            'student_id': self.student.id,
            'report_cycle_id': self.active_cycle.id,
        }, format='json')

        self.assertEqual(request_response.status_code, status.HTTP_200_OK)
        self.assertTrue(Notification.objects.filter(
            recipient=self.admin,
            notification_type='UNLOCK_REQUESTED',
            title='Unlock Request',
            message__icontains='requested to unlock the specialist progress tracker',
        ).exists())

    def test_parent_assessment_resubmit_notifies_admin(self):
        assessment = ParentAssessment.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.parent,
            form_data={'notes': 'original'},
            unlock_requested=False,
            unlocked_at=timezone.now(),
            unlocked_by=self.admin,
        )

        Notification.objects.create(
            recipient=self.admin,
            notification_type='FORM_SUBMITTED',
            title='Parent Assessment submitted for ' + f"{self.student.first_name} {self.student.last_name}",
            message=f"{self.parent.first_name} {self.parent.last_name} submitted the parent assessment.",
            dedupe_key=f"form-submitted:parent-assessment:{assessment.id}"
        )

        self.client.force_authenticate(user=self.parent)
        response = self.client.post('/api/inputs/parent-assessment/', {
            'student': self.student.id,
            'report_cycle': self.active_cycle.id,
            'form_data': {'notes': 'corrected'},
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.assertTrue(Notification.objects.filter(
            recipient=self.admin,
            notification_type='FORM_SUBMITTED',
            title__icontains='Parent Assessment resubmitted',
            message__icontains='resubmitted the parent assessment'
        ).exists())

    def test_specialist_assessment_refinalize_notifies_admin(self):
        from api.services.notification_service import notify_specialist_form_finalized
        notify_specialist_form_finalized(
            self.specialist,
            self.student,
            self.active_cycle,
            'Specialist Assessment'
        )

        self.assertTrue(Notification.objects.filter(
            recipient=self.admin,
            notification_type='FORM_SUBMITTED',
            title__icontains='Specialist Assessment finalized',
            message__icontains='finalized the specialist assessment',
            dedupe_key=f"specialist-form-finalized:Specialist Assessment:{self.student.id}:{self.active_cycle.id}"
        ).exists())

        notify_specialist_form_finalized(
            self.specialist,
            self.student,
            self.active_cycle,
            'Specialist Assessment'
        )

        self.assertTrue(Notification.objects.filter(
            recipient=self.admin,
            notification_type='FORM_SUBMITTED',
            title__icontains='Specialist Assessment refinalized',
            message__icontains='refinalized the specialist assessment'
        ).exists())

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

    def test_admin_actions_include_monthly_report_generation_when_trackers_complete(self):
        ParentProgressTracker.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.parent,
            form_data={'progress': 'parent submitted'},
        )
        MultidisciplinaryProgressTracker.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.specialist,
            form_data={'progress': 'specialist submitted'},
            finalized_at=timezone.now(),
            finalized_by=self.specialist,
        )
        SpedProgressTracker.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.teacher,
            form_data={'progress': 'teacher submitted'},
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/dashboard/actions/')

        if response.status_code != 200: print(response.data); self.assertEqual(response.status_code, status.HTTP_200_OK)
        actions = response.data['actions']
        monthly_action = next(
            action for action in actions
            if action['id'] == f'monthly_{self.student.id}'
        )
        self.assertEqual(
            monthly_action['title'],
            'Generate Monthly Progress Report: Jamie Doe',
        )
        self.assertEqual(monthly_action['link'], f'/workspace?studentId={self.student.id}&workspace=reports&view=generator')
        self.assertEqual(monthly_action['type'], 'positive')

    def test_admin_actions_include_finalize_iep_draft_before_enrollment_review(self):
        self.student.status = 'ASSESSED'
        self.student.save(update_fields=['status'])
        doc = GeneratedDocument.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            document_type='IEP',
            status='DRAFT',
            iep_data={'section1_student_info': {}},
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/dashboard/actions/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        actions = response.data['actions']
        finalize_action = next(
            action for action in actions
            if action['id'] == f'review_iep_{doc.id}'
        )
        self.assertEqual(finalize_action['title'], 'Finalize IEP Draft: Jamie Doe')
        self.assertEqual(finalize_action['action_text'], 'Finalize ->')
        self.assertFalse(any(action['id'] == f'review_{self.student.id}' for action in actions))

    def test_admin_actions_include_generate_iep_fallback_when_auto_generation_missing(self):
        self.student.status = 'ASSESSED'
        self.student.save(update_fields=['status'])
        ParentAssessment.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.parent,
            form_data={'notes': 'parent submitted'},
        )
        MultidisciplinaryAssessment.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.specialist,
            form_data={'notes': 'specialist submitted'},
            finalized_at=timezone.now(),
            finalized_by=self.specialist,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/dashboard/actions/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        actions = response.data['actions']
        generate_action = next(
            action for action in actions
            if action['id'] == f'generate_iep_{self.student.id}'
        )
        self.assertEqual(generate_action['title'], 'Generate IEP Draft: Jamie Doe')
        self.assertEqual(generate_action['link'], f'/workspace?studentId={self.student.id}&workspace=reports&view=generator')

    def test_enrollment_requires_finalized_iep(self):
        self.student.status = 'ASSESSED'
        self.student.save(update_fields=['status'])
        MultidisciplinaryAssessment.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            submitted_by=self.specialist,
            form_data={'notes': 'specialist submitted'},
            finalized_at=timezone.now(),
            finalized_by=self.specialist,
        )
        GeneratedDocument.objects.create(
            student=self.student,
            report_cycle=self.active_cycle,
            document_type='IEP',
            status='DRAFT',
            iep_data={'section1_student_info': {}},
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f'/api/students/{self.student.id}/enroll/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error'], 'A finalized IEP is required before enrollment.')

    def test_cookie_authenticated_mutation_requires_csrf(self):
        client = self.login_cookie_client('adminuser@example.com', self.admin_password)
        response = client.post('/api/users/', {
            'email': 'newstaff@example.com',
            'password': 'StrongPass123!',
            'email': 'newstaff@example.com',
            'role': 'TEACHER',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        response = client.post('/api/users/', {
            'email': 'newstaff@example.com',
            'password': 'StrongPass123!',
            'email': 'newstaff@example.com',
            'role': 'TEACHER',
        }, format='json', HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_refresh_rotation_replaces_refresh_cookie_and_invalidates_old_one(self):
        client = self.login_cookie_client('adminuser@example.com', self.admin_password)
        old_refresh = client.cookies['refresh_token'].value

        response = client.post(
            '/api/auth/token/refresh/',
            {},
            format='json',
            HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value,
        )
        if response.status_code != 200: print(response.data); self.assertEqual(response.status_code, status.HTTP_200_OK)
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


# ─── Auth ────────────────────────────────────────────────────────────────────

@override_settings(ROOT_URLCONF='backend.urls')
class AuthTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='user@example.com',
            password='ValidPass123!',
            role='ADMIN',
        )

    def test_login_wrong_password_returns_401(self):
        response = self.client.post('/api/auth/token/', {
            'email': 'user@example.com',
            'password': 'wrongpassword',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn('access_token', response.cookies)

    def test_unauthenticated_request_returns_401(self):
        response = self.client.get('/api/students/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_sets_httponly_cookies(self):
        self.client.get('/api/auth/csrf/')
        response = self.client.post('/api/auth/token/', {
            'email': 'user@example.com',
            'password': 'ValidPass123!',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', response.cookies)
        self.assertIn('refresh_token', response.cookies)
        self.assertTrue(response.cookies['access_token']['httponly'])
        self.assertTrue(response.cookies['refresh_token']['httponly'])


# ─── Role permissions ─────────────────────────────────────────────────────────

@override_settings(ROOT_URLCONF='backend.urls')
class RolePermissionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin@example.com', password='Pass123!', role='ADMIN',
        )
        self.parent = User.objects.create_user(
            email='parent@example.com', password='Pass123!', role='PARENT',
        )
        self.specialist = User.objects.create_user(
            email='spec@example.com', password='Pass123!', role='SPECIALIST',
        )
        self.teacher = User.objects.create_user(
            email='teacher@example.com', password='Pass123!', role='TEACHER',
        )
        self.student = Student.objects.create(
            first_name='Test', last_name='Student',
            date_of_birth=date(2018, 1, 1), grade='Kinder',
            status='PENDING_ASSESSMENT',
        )
        StudentAccess.objects.create(user=self.parent, student=self.student)

    def test_parent_cannot_schedule_assessment(self):
        self.client.force_authenticate(user=self.parent)
        response = self.client.post(f'/api/students/{self.student.id}/request-assessment/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.student.refresh_from_db()
        self.assertEqual(self.student.status, 'PENDING_ASSESSMENT')

    def test_parent_cannot_access_staff_list(self):
        self.client.force_authenticate(user=self.parent)
        response = self.client.get('/api/staff/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_cannot_delete_student(self):
        self.client.force_authenticate(user=self.specialist)
        response = self.client.delete(f'/api/students/{self.student.id}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Student.objects.filter(id=self.student.id).exists())

    def test_non_admin_cannot_list_all_users(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.get('/api/users/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_cannot_generate_iep(self):
        self.client.force_authenticate(user=self.specialist)
        response = self.client.post('/api/iep/generate/', {
            'student_id': self.student.id,
            'report_cycle_id': 999,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_specialist_cannot_schedule_assessment(self):
        self.client.force_authenticate(user=self.specialist)
        response = self.client.post(f'/api/students/{self.student.id}/request-assessment/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ─── Student data isolation ───────────────────────────────────────────────────

@override_settings(ROOT_URLCONF='backend.urls')
class StudentAccessTests(APITestCase):
    def setUp(self):
        self.specialist = User.objects.create_user(
            email='spec@example.com', password='Pass123!', role='SPECIALIST',
        )
        self.other_specialist = User.objects.create_user(
            email='otherspec@example.com', password='Pass123!', role='SPECIALIST',
        )
        self.parent = User.objects.create_user(
            email='parent@example.com', password='Pass123!', role='PARENT',
        )
        self.other_parent = User.objects.create_user(
            email='otherparent@example.com', password='Pass123!', role='PARENT',
        )
        self.unassigned_teacher = User.objects.create_user(
            email='newteacher@example.com', password='Pass123!', role='TEACHER',
        )
        self.assigned_student = Student.objects.create(
            first_name='Assigned', last_name='Kid',
            date_of_birth=date(2018, 1, 1), grade='Kinder',
            status='ENROLLED',
        )
        self.other_student = Student.objects.create(
            first_name='Other', last_name='Kid',
            date_of_birth=date(2017, 1, 1), grade='Grade 1',
            status='ENROLLED',
        )
        self.cycle = ReportCycle.objects.create(
            student=self.assigned_student,
            label='Test Cycle',
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
            is_active=True,
            status='OPEN',
        )
        StudentAccess.objects.create(user=self.specialist, student=self.assigned_student)
        StudentAccess.objects.create(user=self.parent, student=self.assigned_student)

    def test_specialist_only_sees_assigned_students(self):
        self.client.force_authenticate(user=self.specialist)
        response = self.client.get('/api/students/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [s['id'] for s in response.data]
        self.assertIn(self.assigned_student.id, ids)
        self.assertNotIn(self.other_student.id, ids)

    def test_unassigned_specialist_sees_no_students(self):
        self.client.force_authenticate(user=self.other_specialist)
        response = self.client.get('/api/students/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_parent_only_sees_own_submitted_forms(self):
        # other_parent submits a form for other_student
        other_cycle = ReportCycle.objects.create(
            student=self.other_student,
            label='Other Cycle',
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
            is_active=True,
            status='OPEN',
        )
        StudentAccess.objects.create(user=self.other_parent, student=self.other_student)
        ParentAssessment.objects.create(
            student=self.other_student,
            report_cycle=other_cycle,
            submitted_by=self.other_parent,
            form_data={},
        )

        self.client.force_authenticate(user=self.parent)
        response = self.client.get('/api/inputs/parent-assessment/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for form in response.data:
            self.assertEqual(form['submitted_by'], self.parent.id)

    def test_unassigned_user_gets_404_on_student_profile(self):
        self.client.force_authenticate(user=self.unassigned_teacher)
        response = self.client.get(f'/api/students/{self.assigned_student.id}/profile/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ─── Invitation flow ──────────────────────────────────────────────────────────

@override_settings(ROOT_URLCONF='backend.urls')
class InvitationFlowTests(APITestCase):
    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_revoke_invitation_sends_notice_email(self):
        admin = User.objects.create_user(
            email='admin_invites@example.com',
            password='Pass123!',
            role='ADMIN',
        )
        invitation = Invitation.objects.create(
            email='revoked@example.com',
            role='PARENT',
        )
        self.client.force_authenticate(user=admin)

        response = self.client.delete(f'/api/invitations/{invitation.id}/')

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Invitation.objects.filter(id=invitation.id).exists())
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['revoked@example.com'])
        self.assertIn('no longer active', mail.outbox[0].subject)
        self.assertIn('no longer active', mail.outbox[0].body)

    def test_expired_token_returns_410(self):
        invitation = Invitation.objects.create(
            email='late@example.com',
            role='PARENT',
            expires_at=timezone.now() - timezone.timedelta(hours=1),
        )
        response = self.client.get(
            '/api/invitations/accept/',
            {'token': str(invitation.token)},
        )
        self.assertEqual(response.status_code, status.HTTP_410_GONE)

    def test_used_token_returns_404(self):
        invitation = Invitation.objects.create(
            email='used@example.com',
            role='PARENT',
            is_used=True,
        )
        response = self.client.get(
            '/api/invitations/accept/',
            {'token': str(invitation.token)},
        )
        # is_used=True means get() raises DoesNotExist → 404
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_valid_token_creates_user_with_correct_role(self):
        invitation = Invitation.objects.create(
            email='newparent@example.com',
            role='PARENT',
        )
        response = self.client.post('/api/invitations/accept/', {
            'token': str(invitation.token),
            'password': 'NewPass123!',
            'first_name': 'New',
            'last_name': 'Parent',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email='newparent@example.com')
        self.assertEqual(user.role, 'PARENT')
        invitation.refresh_from_db()
        self.assertTrue(invitation.is_used)

    def test_parent_invite_accept_creates_welcome_register_child_notification(self):
        invitation = Invitation.objects.create(
            email='welcomeparent@example.com',
            role='PARENT',
        )

        response = self.client.post('/api/invitations/accept/', {
            'token': str(invitation.token),
            'password': 'NewPass123!',
            'first_name': 'Amelia',
            'last_name': 'Parent',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email='welcomeparent@example.com')
        notification = Notification.objects.get(recipient=user, dedupe_key=f'parent-welcome-register-child:{user.id}')
        self.assertEqual(notification.notification_type, 'SYSTEM')
        self.assertEqual(notification.title, 'Welcome to ARASE, Amelia')
        self.assertIn('registering your child', notification.message)
        self.assertEqual(notification.link, '/parent-onboarding')
        self.assertEqual(notification.actor_name, 'ARASE')

    def test_non_parent_invite_accept_does_not_create_parent_welcome_notification(self):
        invitation = Invitation.objects.create(
            email='welcomespecialist@example.com',
            role='SPECIALIST',
        )

        response = self.client.post('/api/invitations/accept/', {
            'token': str(invitation.token),
            'password': 'NewPass123!',
            'first_name': 'Grace',
            'last_name': 'Smith',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email='welcomespecialist@example.com')
        self.assertFalse(Notification.objects.filter(recipient=user, dedupe_key=f'parent-welcome-register-child:{user.id}').exists())

    def test_notification_list_backfills_missing_parent_welcome_notification(self):
        parent = User.objects.create_user(
            email='existingparent@example.com',
            password='Pass123!',
            first_name='Existing',
            role='PARENT',
        )
        self.client.force_authenticate(user=parent)

        response = self.client.get('/api/notifications/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        notification = Notification.objects.get(recipient=parent, dedupe_key=f'parent-welcome-register-child:{parent.id}')
        self.assertEqual(notification.title, 'Welcome to ARASE, Existing')
        self.assertEqual(notification.link, '/parent-onboarding')
        self.assertEqual(response.data['unread_count'], 1)

    def test_valid_token_cannot_be_reused(self):
        invitation = Invitation.objects.create(
            email='once@example.com',
            role='SPECIALIST',
        )
        payload = {
            'token': str(invitation.token),
            'password': 'NewPass123!',
            'first_name': 'Once',
            'last_name': 'Only',
        }
        self.client.post('/api/invitations/accept/', payload, format='json')
        response = self.client.post('/api/invitations/accept/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ─── Document Version Audit trail debouncing ──────────────────────────────────

@override_settings(ROOT_URLCONF='backend.urls')
class DocumentVersionDebouncingTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin_deb@example.com', password='Pass123!', role='ADMIN',
        )
        self.student = Student.objects.create(
            first_name='Debounce', last_name='Kid',
            date_of_birth=date(2018, 1, 1), grade='Kinder',
            status='ENROLLED',
        )
        self.cycle = ReportCycle.objects.create(
            student=self.student,
            label='Test Cycle',
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
            is_active=True,
            status='OPEN',
        )
        self.doc = GeneratedDocument.objects.create(
            student=self.student,
            report_cycle=self.cycle,
            document_type='IEP',
            status='DRAFT',
            iep_data={'goals': ['Initial Goal']},
        )

    def test_record_document_version_debounces_within_5_minutes(self):
        from api.services.document_service import record_document_version
        
        # 1. First save triggers a version creation
        v1 = record_document_version(self.doc, self.admin, 'EDITED_DRAFT')
        self.assertEqual(self.doc.versions.count(), 1)
        self.assertEqual(v1.iep_data, {'goals': ['Initial Goal']})
        
        # 2. Modify data and save again immediately (within 5 minutes)
        self.doc.iep_data = {'goals': ['Goal 2']}
        self.doc.save()
        v2 = record_document_version(self.doc, self.admin, 'EDITED_DRAFT')
        
        # Should not create a new row, but update the old one
        self.assertEqual(self.doc.versions.count(), 1)
        v1.refresh_from_db()
        self.assertEqual(v1.iep_data, {'goals': ['Goal 2']})
        self.assertEqual(v1.id, v2.id)

    def test_record_document_version_does_not_debounce_different_actions_or_users(self):
        from api.services.document_service import record_document_version
        
        # 1. Save as EDITED_DRAFT
        v1 = record_document_version(self.doc, self.admin, 'EDITED_DRAFT')
        
        # 2. Save as FINALIZED immediately
        v2 = record_document_version(self.doc, self.admin, 'FINALIZED')
        
        # Should create a new row since action is different
        self.assertEqual(self.doc.versions.count(), 2)
        
        # 3. Save by a different user
        other_admin = User.objects.create_user(
            email='other_admin_deb@example.com', password='Pass123!', role='ADMIN',
        )
        v3 = record_document_version(self.doc, other_admin, 'EDITED_DRAFT')

        # Should create a new row since user is different
        self.assertEqual(self.doc.versions.count(), 3)


@override_settings(
    ROOT_URLCONF='backend.urls',
    CACHES={'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'test-collab',
    }},
)
class FormCollaborationTests(APITestCase):
    """Real-time collaboration: section locks, finalization, and concurrent opens."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()

        self.student = Student.objects.create(
            first_name='Collab', last_name='Kid',
            date_of_birth=date(2018, 1, 1), grade='Kinder',
            status='PENDING_ASSESSMENT',
        )
        self.cycle = ReportCycle.objects.create(
            student=self.student, label='Apr 2026',
            start_date=date(2026, 4, 1), end_date=date(2026, 4, 30),
            is_active=True, status='OPEN',
        )
        # Two specialists, fully onboarded, on different disciplines.
        self.slp = User.objects.create_user(
            email='slp@example.com', password='Pass123!', role='SPECIALIST',
            first_name='Sam', last_name='Slp',
            specialties=['Speech-Language Pathology'], languages=['English'],
        )
        self.ot = User.objects.create_user(
            email='ot@example.com', password='Pass123!', role='SPECIALIST',
            first_name='Olive', last_name='Ot',
            specialties=['Occupational Therapy'], languages=['English'],
        )
        StudentAccess.objects.create(
            user=self.slp, student=self.student,
            assigned_specialties=['Speech-Language Pathology'],
        )
        StudentAccess.objects.create(
            user=self.ot, student=self.student,
            assigned_specialties=['Occupational Therapy'],
        )

    # ─── Section locks ──────────────────────────────────────────────────────

    def test_acquire_lock_is_atomic(self):
        from api.services import collaboration_service as cs
        first = cs.acquire_lock(
            form_type='assessment', instance_id=1, section_key='A', user=self.slp,
        )
        self.assertTrue(first['ok'])

        # A different user cannot take a lock someone else holds.
        second = cs.acquire_lock(
            form_type='assessment', instance_id=1, section_key='A', user=self.ot,
        )
        self.assertFalse(second['ok'])
        self.assertEqual(second['held_by']['user_id'], self.slp.id)

        # The holder can refresh their own lock.
        again = cs.acquire_lock(
            form_type='assessment', instance_id=1, section_key='A', user=self.slp,
        )
        self.assertTrue(again['ok'])
        self.assertTrue(again['refreshed'])

    def test_release_lock_only_by_holder(self):
        from api.services import collaboration_service as cs
        cs.acquire_lock(form_type='assessment', instance_id=1, section_key='A', user=self.slp)

        # Non-holder release is a no-op.
        self.assertFalse(cs.release_lock(
            form_type='assessment', instance_id=1, section_key='A', user=self.ot,
        ))
        # Peer can now still not acquire (lock intact).
        self.assertFalse(cs.acquire_lock(
            form_type='assessment', instance_id=1, section_key='A', user=self.ot,
        )['ok'])

        # Holder release frees it; peer can then take it.
        self.assertTrue(cs.release_lock(
            form_type='assessment', instance_id=1, section_key='A', user=self.slp,
        ))
        self.assertTrue(cs.acquire_lock(
            form_type='assessment', instance_id=1, section_key='A', user=self.ot,
        )['ok'])

    def test_user_can_edit_section_respects_ownership(self):
        from api.services.collaboration_service import user_can_edit_section
        # Shared section: any assigned specialist may edit.
        self.assertTrue(user_can_edit_section('assessment', 'A', self.slp, self.student.id))
        self.assertTrue(user_can_edit_section('assessment', 'A', self.ot, self.student.id))
        # Owned section C belongs to SLP only.
        self.assertTrue(user_can_edit_section('assessment', 'C', self.slp, self.student.id))
        self.assertFalse(user_can_edit_section('assessment', 'C', self.ot, self.student.id))

    def test_submit_releases_section_lock(self):
        from api.services import collaboration_service as cs
        from api.services import section_service as ss

        ss.save_section(
            form_type='assessment', user=self.slp, student_id=self.student.id,
            report_cycle_id=self.cycle.id, section_key='C',
            section_data={'slp_notes': 'done'},
        )
        instance = MultidisciplinaryAssessment.objects.get(student=self.student, report_cycle=self.cycle)
        cs.acquire_lock(form_type='assessment', instance_id=instance.id, section_key='C', user=self.slp)
        self.assertEqual(len(cs.get_active_locks(form_type='assessment', instance_id=instance.id)), 1)

        ss.submit_section(
            form_type='assessment', user=self.slp, student_id=self.student.id,
            report_cycle_id=self.cycle.id, section_key='C',
        )
        # Submitting drops the lock.
        self.assertEqual(cs.get_active_locks(form_type='assessment', instance_id=instance.id), [])

    # ─── Concurrent opens / dedupe ──────────────────────────────────────────

    def test_concurrent_ensure_creates_single_row(self):
        from api.services.section_service import ensure_form
        ids = set()
        for _ in range(4):
            instance, _created = ensure_form(
                form_type='assessment', user=self.slp,
                student_id=self.student.id, report_cycle_id=self.cycle.id,
            )
            ids.add(instance.id)
        self.assertEqual(len(ids), 1)
        self.assertEqual(
            MultidisciplinaryAssessment.objects.filter(
                student=self.student, report_cycle=self.cycle,
            ).count(),
            1,
        )

    # ─── Finalization reflects to admin (regression for the duplicate bug) ───

    def test_finalization_marks_profile_submitted_for_admin(self):
        from api.services import section_service as ss
        from api.services.student_service import get_student_profile_data

        # SLP fills + submits section C.
        ss.save_section(
            form_type='assessment', user=self.slp, student_id=self.student.id,
            report_cycle_id=self.cycle.id, section_key='C',
            section_data={'slp_notes': 'ok'},
        )
        ss.submit_section(
            form_type='assessment', user=self.slp, student_id=self.student.id,
            report_cycle_id=self.cycle.id, section_key='C',
        )
        # Not finalized yet — OT's section D is still required.
        profile = get_student_profile_data(self.student)
        self.assertFalse(profile['form_statuses']['multi_assessment']['submitted'])

        # OT fills + submits section D → all required sections done → finalized.
        ss.save_section(
            form_type='assessment', user=self.ot, student_id=self.student.id,
            report_cycle_id=self.cycle.id, section_key='D',
            section_data={'ot_notes': 'ok'},
        )
        ss.submit_section(
            form_type='assessment', user=self.ot, student_id=self.student.id,
            report_cycle_id=self.cycle.id, section_key='D',
        )

        instance = MultidisciplinaryAssessment.objects.get(student=self.student, report_cycle=self.cycle)
        self.assertIsNotNone(instance.finalized_at)

        # The admin's profile read now reflects the submission.
        profile = get_student_profile_data(self.student)
        self.assertTrue(profile['form_statuses']['multi_assessment']['submitted'])

    def test_profile_prefers_finalized_row_over_newer_empty_cycle(self):
        """A newer empty cycle's row must not mask an earlier finalized assessment."""
        from api.services.student_service import get_student_profile_data

        # Finalized assessment on the active cycle.
        MultidisciplinaryAssessment.objects.create(
            student=self.student, report_cycle=self.cycle,
            form_data={}, finalized_at=timezone.now(), submitted_by=self.slp,
        )
        # A newer, empty assessment on a later cycle (created after → newer pk/date).
        later_cycle = ReportCycle.objects.create(
            student=self.student, label='May 2026',
            start_date=date(2026, 5, 1), end_date=date(2026, 5, 31),
            is_active=False, status='OPEN',
        )
        MultidisciplinaryAssessment.objects.create(
            student=self.student, report_cycle=later_cycle, form_data={},
        )

        # The finalized row wins the read (nulls_last), so admin still sees it done.
        profile = get_student_profile_data(self.student)
        self.assertTrue(profile['form_statuses']['multi_assessment']['submitted'])

    # ─── Field-level save merge (defense-in-depth for shared sections) ───────

    def test_partial_saves_merge_on_shared_section(self):
        """Two specialists writing different fields of a shared section don't clobber."""
        from api.services import section_service as ss

        # SLP writes one field of shared Section A.
        ss.save_section(
            form_type='assessment', user=self.slp, student_id=self.student.id,
            report_cycle_id=self.cycle.id, section_key='A',
            section_data={'clinical_notes': 'from slp'},
        )
        # OT writes a different field of the same shared section.
        ss.save_section(
            form_type='assessment', user=self.ot, student_id=self.student.id,
            report_cycle_id=self.cycle.id, section_key='A',
            section_data={'correction_notes': 'from ot'},
        )

        instance = MultidisciplinaryAssessment.objects.get(student=self.student, report_cycle=self.cycle)
        v2 = instance.form_data.get('v2', {})
        # Both fields survive — the server merge keeps each specialist's value.
        self.assertEqual(v2.get('clinical_notes'), 'from slp')
        self.assertEqual(v2.get('correction_notes'), 'from ot')

