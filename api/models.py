from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone

def default_expiration():
    return timezone.now() + timezone.timedelta(hours=72)

class User(AbstractUser):
    ROLE_CHOICES = (
        ('ADMIN', 'Admin'),
        ('TEACHER', 'Teacher'),
        ('SPECIALIST', 'Specialist'),
        ('PARENT', 'Parent'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    specialty = models.CharField(max_length=100, blank=True, default='', help_text="e.g. Speech Therapy, Occupational Therapy, Behavioral Therapy")
    phone_number = models.CharField(max_length=20, blank=True, null=True, help_text="Contact number for the user")
    is_phone_verified = models.BooleanField(default=False)

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
    
    class Meta:
        unique_together = ('user', 'student')

    def __str__(self):
        return f"{self.user.username} -> {self.student.first_name}"

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

