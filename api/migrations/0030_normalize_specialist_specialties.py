from django.db import migrations, models


def normalize_specialty(value):
    if not value:
        return ""

    raw = value.strip()
    lowered = raw.lower()

    if any(token in lowered for token in ["speech-language pathology", "speech & language pathology", "speech and language pathology", "speech therapy", "slp"]):
        return "Speech-Language Pathology"
    if "occupational" in lowered or lowered == "ot":
        return "Occupational Therapy"
    if "physical" in lowered or lowered == "pt":
        return "Physical Therapy"
    if any(token in lowered for token in ["aba", "applied behavior", "behavior analyst", "bcba", "behavioral"]):
        return "Applied Behavior Analysis (ABA)"
    if "development" in lowered:
        return "Developmental Psychology"

    return raw


def forwards(apps, schema_editor):
    User = apps.get_model("api", "User")
    for user in User.objects.all():
        if user.role == "SPECIALIST":
            normalized = normalize_specialty(user.specialty)
        else:
            normalized = ""
        if normalized != (user.specialty or ""):
            user.specialty = normalized
            user.save(update_fields=["specialty"])


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0029_alter_notification_link_alter_notification_message_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="specialty",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Specialist discipline, e.g. Speech-Language Pathology or Occupational Therapy",
                max_length=100,
            ),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
