from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0046_multidisciplinaryassessment_unlock_requested_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='parentassessment',
            name='unlock_requested',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='parentassessment',
            name='unlocked_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='parentassessment',
            name='unlocked_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='unlocked_parent_assessments', to=settings.AUTH_USER_MODEL),
        ),
    ]
