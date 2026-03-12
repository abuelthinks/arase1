import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from api.models import User, Student, StudentAccess, ReportCycle

def seed_db():
    print("Clearing old data...")
    User.objects.all().delete()
    Student.objects.all().delete()

    print("Creating admin...")
    admin = User.objects.create_superuser('admin', 'admin@example.com', 'password123')
    admin.role = 'ADMIN'
    admin.save()

    print("Creating teacher...")
    teacher = User.objects.create_user('teacher1', 'teacher@example.com', 'password123')
    teacher.role = 'TEACHER'
    teacher.first_name = "Jane"
    teacher.last_name = "Smith"
    teacher.save()

    print("Creating specialist...")
    specialist = User.objects.create_user('specialist1', 'specialist@example.com', 'password123')
    specialist.role = 'SPECIALIST'
    specialist.first_name = "Dr. Robert"
    specialist.last_name = "Brown"
    specialist.save()

    print("Creating parent...")
    parent = User.objects.create_user('parent1', 'parent@example.com', 'password123')
    parent.role = 'PARENT'
    parent.first_name = "Mary"
    parent.last_name = "Johnson"
    parent.save()

    print("Creating student...")
    student = Student.objects.create(
        first_name="Tommy",
        last_name="Johnson",
        date_of_birth="2015-05-12",
        grade="3rd Grade"
    )

    print("Creating Report Cycle...")
    ReportCycle.objects.create(
        id=1,
        student=student,
        start_date="2026-01-01",
        end_date="2026-06-01",
        is_active=True
    )

    print("Giving access to users...")
    StudentAccess.objects.create(user=teacher, student=student)
    StudentAccess.objects.create(user=specialist, student=student)
    StudentAccess.objects.create(user=parent, student=student)

    print("Database seeding complete!")
    print("------------------------------------------")
    print("Test Credentials (password is 'password123' for all):")
    print("Admin: admin")
    print("Teacher: teacher1")
    print("Specialist: specialist1")
    print("Parent: parent1")
    print("------------------------------------------")

if __name__ == "__main__":
    seed_db()
