from django.db import migrations


def backfill_specialties(apps, schema_editor):
    User = apps.get_model('api', 'User')
    for user in User.objects.filter(role='SPECIALIST'):
        if not user.specialties and user.specialty:
            user.specialties = [user.specialty]
            user.save(update_fields=['specialties'])


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0033_user_specialties_alter_user_specialty'),
    ]

    operations = [
        migrations.RunPython(backfill_specialties, reverse_noop),
    ]
