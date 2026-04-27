from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0035_studentaccess_assigned_specialties"),
    ]

    operations = [
        migrations.CreateModel(
            name="SpecialistAvailabilitySlot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("start_at", models.DateTimeField()),
                ("end_at", models.DateTimeField()),
                ("mode", models.CharField(choices=[("ONLINE", "Online"), ("ONSITE", "On site")], default="ONLINE", max_length=20)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("specialist", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="availability_slots", to="api.user")),
            ],
            options={
                "ordering": ["start_at"],
            },
        ),
        migrations.CreateModel(
            name="AssessmentAppointment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("start_at", models.DateTimeField()),
                ("end_at", models.DateTimeField()),
                ("mode", models.CharField(choices=[("ONLINE", "Online"), ("ONSITE", "On site")], default="ONLINE", max_length=20)),
                ("status", models.CharField(choices=[("SCHEDULED", "Scheduled"), ("CANCELLED", "Cancelled"), ("COMPLETED", "Completed"), ("NO_SHOW", "No show")], default="SCHEDULED", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("reminder_24h_sent_at", models.DateTimeField(blank=True, null=True)),
                ("availability_slot", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="appointment", to="api.specialistavailabilityslot")),
                ("booked_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="booked_assessment_appointments", to="api.user")),
                ("parent", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="parent_assessment_appointments", to="api.user")),
                ("specialist", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="specialist_assessment_appointments", to="api.user")),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="assessment_appointments", to="api.student")),
            ],
            options={
                "ordering": ["start_at"],
            },
        ),
        migrations.AddIndex(
            model_name="specialistavailabilityslot",
            index=models.Index(fields=["specialist", "start_at"], name="api_special_special_9cdc03_idx"),
        ),
        migrations.AddIndex(
            model_name="specialistavailabilityslot",
            index=models.Index(fields=["is_active", "start_at"], name="api_special_is_acti_6bab7f_idx"),
        ),
        migrations.AddIndex(
            model_name="assessmentappointment",
            index=models.Index(fields=["student", "status", "start_at"], name="api_assessm_student_a19029_idx"),
        ),
        migrations.AddIndex(
            model_name="assessmentappointment",
            index=models.Index(fields=["specialist", "status", "start_at"], name="api_assessm_special_27fd42_idx"),
        ),
    ]
