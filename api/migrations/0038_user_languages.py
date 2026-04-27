from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0037_specialistpreference_preferred_slot"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="languages",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Languages this user can comfortably use with families.",
            ),
        ),
    ]
