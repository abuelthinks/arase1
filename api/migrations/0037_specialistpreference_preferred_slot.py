from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0036_assessment_scheduling"),
    ]

    operations = [
        migrations.AddField(
            model_name="specialistpreference",
            name="preferred_end_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="specialistpreference",
            name="preferred_start_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="specialistpreference",
            name="preferred_slot",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="specialist_preferences",
                to="api.specialistavailabilityslot",
            ),
        ),
    ]
