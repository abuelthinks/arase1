from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.utils import timezone

def default_expiration():
    return timezone.now() + timezone.timedelta(hours=72)

class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, password, **extra_fields)

class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    objects = CustomUserManager()

    ROLE_CHOICES = (
        ('ADMIN', 'Admin'),
        ('TEACHER', 'Teacher'),
        ('SPECIALIST', 'Specialist'),
        ('PARENT', 'Parent'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    specialty = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="Primary specialist discipline (mirrors specialties[0] for legacy reads).",
    )
    specialties = models.JSONField(
        default=list,
        blank=True,
        help_text="All specialist disciplines this user holds. Source of truth for section ownership.",
    )
    languages = models.JSONField(
        default=list,
        blank=True,
        help_text="Languages this user can comfortably use with families.",
    )
    phone_number = models.CharField(max_length=20, blank=True, null=True, help_text="Contact number for the user")
    is_phone_verified = models.BooleanField(default=False)

    def specialty_list(self) -> list[str]:
        """Always return a list — falls back to [specialty] if legacy data only."""
        if isinstance(self.specialties, list) and self.specialties:
            return list(self.specialties)
        return [self.specialty] if self.specialty else []

    def language_list(self) -> list[str]:
        if isinstance(self.languages, list):
            return [str(language).strip() for language in self.languages if str(language).strip()]
        return []

    def specialist_onboarding_missing(self) -> list[str]:
        if self.role != 'SPECIALIST':
            return []

        missing = []
        if not (self.first_name or '').strip():
            missing.append('first_name')
        if not (self.last_name or '').strip():
            missing.append('last_name')
        if not self.specialty_list():
            missing.append('specialty')
        if not self.language_list():
            missing.append('languages')
        return missing

    def is_specialist_onboarding_complete(self) -> bool:
        return len(self.specialist_onboarding_missing()) == 0

class PhoneVerification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='phone_verifications')
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    def is_valid(self):
        from django.utils import timezone
        return not self.is_used and timezone.now() <= self.expires_at

    def __str__(self):
        return f"Code for {self.user.email} (Used: {self.is_used})"
class Invitation(models.Model):
    import uuid
    email = models.EmailField()
    token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    role = models.CharField(max_length=20, choices=User.ROLE_CHOICES, default='PARENT')
    student = models.ForeignKey('Student', on_delete=models.SET_NULL, null=True, blank=True, related_name='invitations')
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=default_expiration)

    def __str__(self):
        return f"Invite for {self.email} ({self.role}) - Used: {self.is_used}"

class Student(models.Model):
    STATUS_CHOICES = (
        ('PENDING_ASSESSMENT', 'Pending Assessment'),
        ('ASSESSMENT_SCHEDULED', 'Assessment Scheduled'),
        ('ASSESSED', 'Assessed'),
        ('ENROLLED', 'Enrolled'),
        ('ARCHIVED', 'Archived'),
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    grade = models.CharField(max_length=50)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='PENDING_ASSESSMENT')

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

class StudentAccess(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='student_access')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='assigned_users')
    assigned_specialties = models.JSONField(
        default=list,
        blank=True,
        help_text="Specialist disciplines assigned for this student. Empty falls back to the user's specialties.",
    )
    
    class Meta:
        unique_together = ('user', 'student')

    def specialty_list(self) -> list[str]:
        if self.user.role == 'SPECIALIST' and isinstance(self.assigned_specialties, list) and self.assigned_specialties:
            return list(self.assigned_specialties)
        return self.user.specialty_list() if hasattr(self.user, 'specialty_list') else []

    def __str__(self):
        return f"{self.user.email} -> {self.student.first_name}"

class ReportCycle(models.Model):
    GRACE_PERIOD_DAYS = 3

    STATUS_CHOICES = (
        ('OPEN', 'Open'),
        ('GRACE', 'Grace Period'),
        ('GENERATING', 'Generating'),
        ('COMPLETED', 'Completed'),
    )
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='report_cycles')
    label = models.CharField(max_length=50, blank=True, default='')
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OPEN')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Cycle {self.label or ''} for {self.student} ({self.start_date} to {self.end_date})"

# --- BASELINE ASSESSMENTS ---

class ParentAssessment(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    report_cycle = models.ForeignKey(ReportCycle, on_delete=models.CASCADE)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    form_data = models.JSONField(default=dict, blank=True)
    translated_data = models.JSONField(default=dict, blank=True)
    original_language = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

class MultidisciplinaryAssessment(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    report_cycle = models.ForeignKey(ReportCycle, on_delete=models.CASCADE)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    form_data = models.JSONField(default=dict, blank=True)
    translated_data = models.JSONField(default=dict, blank=True)
    original_language = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    finalized_at = models.DateTimeField(null=True, blank=True)
    finalized_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='finalized_multidisciplinary_assessments',
    )

class SpedAssessment(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    report_cycle = models.ForeignKey(ReportCycle, on_delete=models.CASCADE)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    form_data = models.JSONField(default=dict, blank=True)
    translated_data = models.JSONField(default=dict, blank=True)
    original_language = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

# --- PROGRESS TRACKERS ---

class ParentProgressTracker(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    report_cycle = models.ForeignKey(ReportCycle, on_delete=models.CASCADE)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    form_data = models.JSONField(default=dict, blank=True)
    translated_data = models.JSONField(default=dict, blank=True)
    original_language = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

class MultidisciplinaryProgressTracker(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    report_cycle = models.ForeignKey(ReportCycle, on_delete=models.CASCADE)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    form_data = models.JSONField(default=dict, blank=True)
    translated_data = models.JSONField(default=dict, blank=True)
    original_language = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    finalized_at = models.DateTimeField(null=True, blank=True)
    finalized_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='finalized_multidisciplinary_trackers',
    )

class SpedProgressTracker(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    report_cycle = models.ForeignKey(ReportCycle, on_delete=models.CASCADE)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    form_data = models.JSONField(default=dict, blank=True)
    translated_data = models.JSONField(default=dict, blank=True)
    original_language = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

class GeneratedDocument(models.Model):
    DOC_TYPES = (
        ('IEP', 'IEP'),
        ('ASSESSMENT', 'Assessment'),
        ('MONTHLY', 'Monthly Progress Report'),
    )
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('FINAL', 'Final'),
    )
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    report_cycle = models.ForeignKey(ReportCycle, on_delete=models.CASCADE)
    document_type = models.CharField(max_length=20, choices=DOC_TYPES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='DRAFT')
    file = models.FileField(upload_to='generated_reports/', blank=True, null=True)
    iep_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_document_type_display()} for {self.student} ({self.created_at.date()})"

class DocumentVersion(models.Model):
    document = models.ForeignKey(GeneratedDocument, on_delete=models.CASCADE, related_name='versions')
    action = models.CharField(max_length=50, help_text="e.g. GENERATED, EDITED_DRAFT, FINALIZED")
    edited_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    iep_data = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=10, choices=GeneratedDocument.STATUS_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.document.get_document_type_display()} v{self.id} ({self.action})"

from django.db.models.signals import post_save

def trigger_translation_task(sender, instance, created, **kwargs):
    update_fields = kwargs.get('update_fields')
    # Avoid recursive loops when the task itself updates the translated_data
    if update_fields and 'translated_data' in update_fields:
        return
    
    if instance.form_data:
        try:
            from api.tasks import translate_form_data_task
            translate_form_data_task.delay(instance._meta.model_name, instance.id)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to queue translation task for {instance._meta.model_name} {instance.id}: {e}")

for model in [
    ParentAssessment, MultidisciplinaryAssessment, SpedAssessment,
    ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker
]:
    post_save.connect(trigger_translation_task, sender=model)


# ─── In-App Notifications ────────────────────────────────────────────────────

class Notification(models.Model):
    NOTIFICATION_TYPES = (
        ('FORM_SUBMITTED', 'Form Submitted'),
        ('STUDENT_ENROLLED', 'Student Enrolled'),
        ('STUDENT_ASSESSED', 'Student Assessed'),
        ('IEP_GENERATED', 'IEP Generated'),
        ('REPORT_GENERATED', 'Report Generated'),
        ('REPORT_FINALIZED', 'Report Finalized'),
        ('SPECIALIST_ASSIGNED', 'Specialist Assigned'),
        ('TEACHER_ASSIGNED', 'Teacher Assigned'),
        ('CYCLE_CREATED', 'Cycle Created'),
        ('REMINDER', 'Reminder'),
        ('SYSTEM', 'System'),
    )

    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    notification_type = models.CharField(max_length=30, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True, default='')
    link = models.CharField(max_length=500, blank=True, default='')
    actor_name = models.CharField(max_length=200, blank=True, default='', help_text="Display name of the user who triggered this notification.")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.notification_type} -> {self.recipient.email}"

class SpecialistPreference(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='specialist_preferences')
    specialty = models.CharField(max_length=100)
    specialist = models.ForeignKey(User, on_delete=models.CASCADE)
    preferred_slot = models.ForeignKey(
        'SpecialistAvailabilitySlot',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='specialist_preferences',
    )
    preferred_start_at = models.DateTimeField(null=True, blank=True)
    preferred_end_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('student', 'specialty')


class SpecialistAvailabilitySlot(models.Model):
    MODE_CHOICES = (
        ('ONLINE', 'Online'),
        ('ONSITE', 'On site'),
    )

    specialist = models.ForeignKey(User, on_delete=models.CASCADE, related_name='availability_slots')
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='ONLINE')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['start_at']
        indexes = [
            models.Index(fields=['specialist', 'start_at']),
            models.Index(fields=['is_active', 'start_at']),
        ]

    def __str__(self):
        return f"{self.specialist.email}: {self.start_at} - {self.end_at}"


class AssessmentAppointment(models.Model):
    STATUS_CHOICES = (
        ('SCHEDULED', 'Scheduled'),
        ('CANCELLED', 'Cancelled'),
        ('COMPLETED', 'Completed'),
        ('NO_SHOW', 'No show'),
    )
    MODE_CHOICES = SpecialistAvailabilitySlot.MODE_CHOICES

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='assessment_appointments')
    parent = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='parent_assessment_appointments')
    specialist = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='specialist_assessment_appointments')
    availability_slot = models.OneToOneField(
        SpecialistAvailabilitySlot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='appointment',
    )
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='ONLINE')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='SCHEDULED')
    booked_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='booked_assessment_appointments')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    reminder_24h_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['start_at']
        indexes = [
            models.Index(fields=['student', 'status', 'start_at']),
            models.Index(fields=['specialist', 'status', 'start_at']),
        ]

    def __str__(self):
        specialist = self.specialist.email if self.specialist else "unassigned"
        return f"{self.student} with {specialist} at {self.start_at}"


class SectionContribution(models.Model):
    """Tracks per-section authorship and submission state for multi-specialist forms."""
    FORM_TYPES = (
        ('assessment', 'Multidisciplinary Assessment'),
        ('tracker', 'Multidisciplinary Progress Tracker'),
    )
    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
    )
    form_type = models.CharField(max_length=20, choices=FORM_TYPES)
    assessment = models.ForeignKey(
        MultidisciplinaryAssessment, on_delete=models.CASCADE,
        null=True, blank=True, related_name='section_contributions',
    )
    tracker = models.ForeignKey(
        MultidisciplinaryProgressTracker, on_delete=models.CASCADE,
        null=True, blank=True, related_name='section_contributions',
    )
    section_key = models.CharField(max_length=50)
    specialist = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    specialty = models.CharField(max_length=100, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    updated_at = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = (
            ('assessment', 'section_key'),
            ('tracker', 'section_key'),
        )

    def __str__(self):
        target = self.assessment or self.tracker
        return f"{self.form_type} §{self.section_key} by {self.specialist} ({self.status}) → {target}"
