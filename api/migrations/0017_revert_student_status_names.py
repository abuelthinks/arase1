from django.db import migrations

def revert_student_status_names(apps, schema_editor):
    Student = apps.get_model('api', 'Student')
    
    # Update existing data
    Student.objects.filter(status='INQUIRY').update(status='PENDING_ASSESSMENT')
    Student.objects.filter(status='EVALUATION').update(status='ASSESSMENT_SCHEDULED')
    Student.objects.filter(status='REVIEW').update(status='ASSESSED')
    Student.objects.filter(status='ACTIVE').update(status='ENROLLED')

def reverse_revert(apps, schema_editor):
    Student = apps.get_model('api', 'Student')
    
    Student.objects.filter(status='PENDING_ASSESSMENT').update(status='INQUIRY')
    Student.objects.filter(status='ASSESSMENT_SCHEDULED').update(status='EVALUATION')
    Student.objects.filter(status='ASSESSED').update(status='REVIEW')
    Student.objects.filter(status='ENROLLED').update(status='ACTIVE')

class Migration(migrations.Migration):

    dependencies = [
        ('api', '0016_migrate_student_status_data'),
    ]

    operations = [
        migrations.RunPython(revert_student_status_names, reverse_revert),
    ]
