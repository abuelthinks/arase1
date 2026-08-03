from django.db import migrations


def finalize_draft_documents(apps, schema_editor):
    """Promote leftover DRAFT documents to FINAL.

    The draft/review stage is gone — IEPs and monthly reports are generated on
    demand by an admin and are complete on arrival. Any DRAFT rows predating
    that change would otherwise stay invisible to parents and specialists with
    no remaining UI to finalize them.
    """
    GeneratedDocument = apps.get_model('api', 'GeneratedDocument')
    GeneratedDocument.objects.filter(status='DRAFT').update(status='FINAL')


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0053_invitation_grade_level_user_grade_level'),
    ]

    operations = [
        migrations.RunPython(finalize_draft_documents, migrations.RunPython.noop),
    ]
