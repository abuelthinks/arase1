from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import (
    User, Student, StudentAccess, ReportCycle, GeneratedDocument,
    ParentAssessment, MultidisciplinaryAssessment, SpedAssessment,
    ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker,
    SpecialistAvailabilitySlot, AssessmentAppointment
)

# Register custom User model
class CustomUserAdmin(UserAdmin):
    ordering = ('email',)
    list_display = ('email', 'first_name', 'last_name', 'is_staff')
    search_fields = ('email', 'first_name', 'last_name')
    
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name', 'role', 'specialty')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )

admin.site.register(User, CustomUserAdmin)

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
