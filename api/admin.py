from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import (
    User, Student, StudentAccess, ReportCycle, GeneratedDocument,
    ParentAssessment, MultidisciplinaryAssessment, SpedAssessment,
    ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker,
    SpecialistAvailabilitySlot, AssessmentAppointment
)

# Register custom User model
admin.site.register(User, UserAdmin)

# Register all other models
admin.site.register(Student)
admin.site.register(StudentAccess)
admin.site.register(ReportCycle)
admin.site.register(ParentAssessment)
admin.site.register(MultidisciplinaryAssessment)
admin.site.register(SpedAssessment)
admin.site.register(ParentProgressTracker)
admin.site.register(MultidisciplinaryProgressTracker)
admin.site.register(SpedProgressTracker)
admin.site.register(GeneratedDocument)
admin.site.register(SpecialistAvailabilitySlot)
admin.site.register(AssessmentAppointment)
