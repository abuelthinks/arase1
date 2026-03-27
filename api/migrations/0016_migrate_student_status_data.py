from django.db import migrations

def migrate_student_status(apps, schema_editor):
    Student = apps.get_model('api', 'Student')
    # Use direct updates for performance and accuracy
    Student.objects.filter(status='PENDING_ASSESSMENT').update(status='INQUIRY')
    Student.objects.filter(status='ASSESSMENT_REQUESTED').update(status='EVALUATION')
    Student.objects.filter(status='ASSESSMENT_SCHEDULED').update(status='EVALUATION')
    Student.objects.filter(status='ASSESSED').update(status='REVIEW')
    Student.objects.filter(status='ENROLLED').update(status='ACTIVE')

def reverse_student_status(apps, schema_editor):
    Student = apps.get_model('api', 'Student')
    # Approximate reverse mapping
    Student.objects.filter(status='INQUIRY').update(status='PENDING_ASSESSMENT')
    Student.objects.filter(status='EVALUATION').update(status='ASSESSMENT_REQUESTED')
    Student.objects.filter(status='REVIEW').update(status='ASSESSED')
    Student.objects.filter(status='ACTIVE').update(status='ENROLLED')

class Migration(migrations.Migration):

    dependencies = [
        ('api', '0015_refactor_student_status_choices'),
    ]

    operations = [
        migrations.RunPython(migrate_student_status, reverse_student_status),
    ]
