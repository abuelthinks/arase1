from django.db import models
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    ROLE_CHOICES = (
        ('ADMIN', 'Admin'),
        ('TEACHER', 'Teacher'),
        ('SPECIALIST', 'Specialist'),
        ('PARENT', 'Parent'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    specialty = models.CharField(max_length=100, blank=True, default='', help_text="e.g. Speech Therapy, Occupational Therapy, Behavioral Therapy")

class Invitation(models.Model):
    import uuid
    email = models.EmailField()
    token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    role = models.CharField(max_length=20, choices=User.ROLE_CHOICES, default='PARENT')
    student = models.ForeignKey('Student', on_delete=models.SET_NULL, null=True, blank=True, related_name='invitations')
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Invite for {self.email} ({self.role}) - Used: {self.is_used}"

class Student(models.Model):
    STATUS_CHOICES = (
        ('INQUIRY',    'Inquiry'),        # New referral; waiting for parent onboarding form
        ('EVALUATION', 'Evaluation'),     # Specialist assessment underway
        ('REVIEW',     'Review'),         # All assessments done; Admin reviews for enrollment
        ('ACTIVE',     'Active'),         # Enrolled and actively receiving services
        ('ARCHIVED',   'Archived'),       # Discharged, graduated, or withdrawn
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    grade = models.CharField(max_length=50)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='INQUIRY')

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
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='report_cycles')
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"Cycle for {self.student} ({self.start_date} to {self.end_date})"

# --- BASELINE ASSESSMENTS ---

class ParentAssessment(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    report_cycle = models.ForeignKey(ReportCycle, on_delete=models.CASCADE)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    form_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class MultidisciplinaryAssessment(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    report_cycle = models.ForeignKey(ReportCycle, on_delete=models.CASCADE)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    form_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class SpedAssessment(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    report_cycle = models.ForeignKey(ReportCycle, on_delete=models.CASCADE)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    form_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

# --- PROGRESS TRACKERS ---

class ParentProgressTracker(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    report_cycle = models.ForeignKey(ReportCycle, on_delete=models.CASCADE)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    form_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class MultidisciplinaryProgressTracker(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    report_cycle = models.ForeignKey(ReportCycle, on_delete=models.CASCADE)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    form_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class SpedProgressTracker(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    report_cycle = models.ForeignKey(ReportCycle, on_delete=models.CASCADE)
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    form_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class GeneratedDocument(models.Model):
    DOC_TYPES = (
        ('IEP', 'IEP'),
        ('ASSESSMENT', 'Assessment'),
        ('WEEKLY', 'Weekly Progress Report'),
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
