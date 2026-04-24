from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    StudentViewSet, ParentAssessmentViewSet, MultidisciplinaryAssessmentViewSet, SpedAssessmentViewSet,
    ParentProgressTrackerViewSet, MultidisciplinaryProgressTrackerViewSet, SpedProgressTrackerViewSet,
    AIGenerateGoalsView, GenerateReportDraftView, GenerateReportFinalView,
    ParentOnboardView, StudentProfileView,
    RequestAssessmentView, AssignSpecialistView, AssignTeacherView, AssignParentView, ParentAssessmentReminderView,
    AIRecommendSpecialtyView, EnrollStudentView, ArchiveStudentView,
    UserViewSet, CreateInvitationView, AcceptInvitationView, ManageInvitationView, ResendInvitationView,
    StaffListView,
    RequestSpecialtyChangeView,
    GenerateIEPView, IEPDetailView, IEPDownloadView,
    GenerateMonthlyReportView, MonthlyReportDetailView, MonthlyReportDownloadView,
    AdminDashboardActionsView,
    DocumentHistoryView,
    SendVerificationSMSView, VerifySMSView,
    CreateCycleView, SendRemindersView, TaskStatusView,
    NotificationListView, NotificationMarkReadView, NotificationMarkAllReadView,
    SpecialistPreferenceViewSet, SpecialistListView,
    AssessmentSectionWriteView, AssessmentSectionSubmitView,
    TrackerSectionWriteView, TrackerSectionSubmitView,
    AssessmentContributionsView, TrackerContributionsView,
    AssessmentAvailabilityView, AssessmentAvailabilityDetailView,
    AssessmentAppointmentView, AssessmentAppointmentDetailView,
)

router = DefaultRouter()
router.register(r'students', StudentViewSet, basename='student')
router.register(r'users', UserViewSet, basename='user')
router.register(r'inputs/parent-assessment', ParentAssessmentViewSet, basename='parent-assessment')
router.register(r'inputs/multidisciplinary-assessment', MultidisciplinaryAssessmentViewSet, basename='multidisciplinary-assessment')
router.register(r'inputs/sped-assessment', SpedAssessmentViewSet, basename='sped-assessment')
router.register(r'inputs/parent-tracker', ParentProgressTrackerViewSet, basename='parent-tracker')
router.register(r'inputs/multidisciplinary-tracker', MultidisciplinaryProgressTrackerViewSet, basename='multidisciplinary-tracker')
router.register(r'inputs/sped-tracker', SpedProgressTrackerViewSet, basename='sped-tracker')
router.register(r'specialist-preferences', SpecialistPreferenceViewSet, basename='specialist-preference')

urlpatterns = [
    path('specialists/', SpecialistListView.as_view(), name='specialists-list'),
    path('students/onboard/', ParentOnboardView.as_view(), name='parent-onboard'),
    path('students/<int:student_id>/profile/', StudentProfileView.as_view(), name='student-profile'),
    path('students/<int:student_id>/request-assessment/', RequestAssessmentView.as_view(), name='request-assessment'),
    path('students/<int:student_id>/assign-specialist/', AssignSpecialistView.as_view(), name='assign-specialist'),
    path('students/<int:student_id>/assign-teacher/', AssignTeacherView.as_view(), name='assign-teacher'),
    path('students/<int:student_id>/assign-parent/', AssignParentView.as_view(), name='assign-parent'),
    path('students/<int:student_id>/parent-assessment-reminder/', ParentAssessmentReminderView.as_view(), name='parent-assessment-reminder'),
    path('students/<int:student_id>/recommend-specialty/', AIRecommendSpecialtyView.as_view(), name='recommend-specialty'),
    path('students/<int:student_id>/enroll/', EnrollStudentView.as_view(), name='enroll-student'),
    path('users/send-verification-sms/', SendVerificationSMSView.as_view(), name='send-verification-sms'),
    path('users/verify-sms/', VerifySMSView.as_view(), name='verify-sms'),
    path('users/request-specialty-change/', RequestSpecialtyChangeView.as_view(), name='request-specialty-change'),
    path('', include(router.urls)),
    path('staff/', StaffListView.as_view(), name='staff-list'),
    path('ai/generate-goals/', AIGenerateGoalsView.as_view(), name='ai-generate-goals'),
    path('generate-report-draft/', GenerateReportDraftView.as_view(), name='generate-report-draft'),
    path('generate-report-final/', GenerateReportFinalView.as_view(), name='generate-report-final'),
    path('invitations/', CreateInvitationView.as_view(), name='create-invitation'),
    path('invitations/<int:pk>/', ManageInvitationView.as_view(), name='manage-invitation'),
    path('invitations/<int:pk>/resend/', ResendInvitationView.as_view(), name='resend-invitation'),
    path('invitations/accept/', AcceptInvitationView.as_view(), name='accept-invitation'),
    
    
    path('dashboard/actions/', AdminDashboardActionsView.as_view(), name='dashboard-actions'),
    path('tasks/<str:task_id>/status/', TaskStatusView.as_view(), name='task-status'),
    
    # IEP endpoints
    path('iep/generate/', GenerateIEPView.as_view(), name='generate-iep'),
    path('iep/<int:pk>/', IEPDetailView.as_view(), name='iep-detail'),
    path('iep/<int:pk>/download/', IEPDownloadView.as_view(), name='iep-download'),
    # Monthly Report endpoints
    path('monthly-report/generate/', GenerateMonthlyReportView.as_view(), name='generate-monthly-report'),
    path('monthly-report/<int:pk>/', MonthlyReportDetailView.as_view(), name='monthly-report-detail'),
    path('monthly-report/<int:pk>/download/', MonthlyReportDownloadView.as_view(), name='monthly-report-download'),
    
    # Audit Logs
    path('documents/<int:pk>/history/', DocumentHistoryView.as_view(), name='document-history'),
    
    # Cycle Management
    path('cycles/create/', CreateCycleView.as_view(), name='create-cycle'),
    path('cycles/send-reminders/', SendRemindersView.as_view(), name='send-reminders'),

    # Notifications
    path('notifications/', NotificationListView.as_view(), name='notification-list'),
    path('notifications/<int:pk>/read/', NotificationMarkReadView.as_view(), name='notification-mark-read'),
    path('notifications/read-all/', NotificationMarkAllReadView.as_view(), name='notification-mark-all-read'),

    # Assessment scheduling
    path('assessment/availability/', AssessmentAvailabilityView.as_view(), name='assessment-availability'),
    path('assessment/availability/<int:pk>/', AssessmentAvailabilityDetailView.as_view(), name='assessment-availability-detail'),
    path('assessment/appointments/', AssessmentAppointmentView.as_view(), name='assessment-appointments'),
    path('assessment/appointments/<int:pk>/', AssessmentAppointmentDetailView.as_view(), name='assessment-appointment-detail'),

    # Section-scoped multi-specialist forms
    path('inputs/multidisciplinary-assessment/sections/<str:section_key>/',
         AssessmentSectionWriteView.as_view(), name='assessment-section-write'),
    path('inputs/multidisciplinary-assessment/sections/<str:section_key>/submit/',
         AssessmentSectionSubmitView.as_view(), name='assessment-section-submit'),
    path('inputs/multidisciplinary-assessment/contributions/',
         AssessmentContributionsView.as_view(), name='assessment-contributions'),
    path('inputs/multidisciplinary-tracker/sections/<str:section_key>/',
         TrackerSectionWriteView.as_view(), name='tracker-section-write'),
    path('inputs/multidisciplinary-tracker/sections/<str:section_key>/submit/',
         TrackerSectionSubmitView.as_view(), name='tracker-section-submit'),
    path('inputs/multidisciplinary-tracker/contributions/',
         TrackerContributionsView.as_view(), name='tracker-contributions'),
]
