from django.db import migrations, models


def backfill_assigned_specialties(apps, schema_editor):
    StudentAccess = apps.get_model("api", "StudentAccess")
    for access in StudentAccess.objects.select_related("user").filter(user__role="SPECIALIST"):
        specialties = access.user.specialties if isinstance(access.user.specialties, list) else []
        if not specialties and access.user.specialty:
            specialties = [access.user.specialty]
        access.assigned_specialties = specialties
        access.save(update_fields=["assigned_specialties"])


def clear_assigned_specialties(apps, schema_editor):
    StudentAccess = apps.get_model("api", "StudentAccess")
    StudentAccess.objects.update(assigned_specialties=[])


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0034_backfill_user_specialties"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentaccess",
            name="assigned_specialties",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Specialist disciplines assigned for this student. Empty falls back to the user's specialties.",
            ),
        ),
        migrations.RunPython(backfill_assigned_specialties, clear_assigned_specialties),
    ]
