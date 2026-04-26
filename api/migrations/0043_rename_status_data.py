from django.db import migrations


def rename_statuses_forward(apps, schema_editor):
    Student = apps.get_model('api', 'Student')
    # ASSESSMENT_SCHEDULED -> PENDING_ASSESSMENT (stage 2: specialist assessing child)
    Student.objects.filter(status='ASSESSMENT_SCHEDULED').update(status='PENDING_ASSESSMENT')
    # PENDING_ASSESSMENT -> AWAITING_PARENT_INPUT (stage 1: waiting for parent form)
    # Must run after the above to avoid collision
    Student.objects.filter(status='PENDING_ASSESSMENT').exclude(
        # Don't re-rename the ones we just moved to PENDING_ASSESSMENT
        id__in=Student.objects.filter(status='PENDING_ASSESSMENT').values_list('id', flat=True)
    ).update(status='AWAITING_PARENT_INPUT')


def rename_statuses_forward_v2(apps, schema_editor):
    """
    Two-phase rename to avoid collision:
    1. First move ASSESSMENT_SCHEDULED to a temporary value
    2. Then rename PENDING_ASSESSMENT to AWAITING_PARENT_INPUT
    3. Finally move temp to PENDING_ASSESSMENT
    """
    Student = apps.get_model('api', 'Student')
    # Phase 1: ASSESSMENT_SCHEDULED -> temp
    Student.objects.filter(status='ASSESSMENT_SCHEDULED').update(status='__TEMP_PENDING_ASSESSMENT')
    # Phase 2: old PENDING_ASSESSMENT -> AWAITING_PARENT_INPUT
    Student.objects.filter(status='PENDING_ASSESSMENT').update(status='AWAITING_PARENT_INPUT')
    # Phase 3: temp -> PENDING_ASSESSMENT
    Student.objects.filter(status='__TEMP_PENDING_ASSESSMENT').update(status='PENDING_ASSESSMENT')


def rename_statuses_reverse(apps, schema_editor):
    Student = apps.get_model('api', 'Student')
    Student.objects.filter(status='PENDING_ASSESSMENT').update(status='ASSESSMENT_SCHEDULED')
    Student.objects.filter(status='AWAITING_PARENT_INPUT').update(status='PENDING_ASSESSMENT')


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0042_add_diagnostic_report_and_status_rename'),
    ]

    operations = [
        migrations.RunPython(rename_statuses_forward_v2, rename_statuses_reverse),
    ]
