import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import User, Student, StudentAccess

# Create users
admin, _ = User.objects.get_or_create(username='admin_test', email='admin@test.com', role='ADMIN')
admin.set_password('pass123')
admin.save()

parent, _ = User.objects.get_or_create(username='parent_test', email='parent@test.com', role='PARENT')
parent.set_password('pass123')
parent.save()

specialist, _ = User.objects.get_or_create(username='specialist_test', email='specialist@test.com', role='SPECIALIST')
specialist.set_password('pass123')
specialist.save()

teacher, _ = User.objects.get_or_create(username='teacher_test', email='teacher@test.com', role='TEACHER')
teacher.set_password('pass123')
teacher.save()

# Create student
student, _ = Student.objects.get_or_create(
    first_name='Test', 
    last_name='Student', 
    date_of_birth='2015-01-01', 
    grade='1st Grade', 
    status='Pending Assessment'
)

# Assign access
StudentAccess.objects.get_or_create(user=parent, student=student)
StudentAccess.objects.get_or_create(user=specialist, student=student)
StudentAccess.objects.get_or_create(user=teacher, student=student)

print("Test data created successfully.")
