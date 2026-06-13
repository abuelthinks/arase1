"""Heal duplicate multidisciplinary form rows and prevent new ones.

Concurrent form opens (each specialist's real-time-collab `ensure` call) used to
race through a non-atomic get-or-create and create several
MultidisciplinaryAssessment / MultidisciplinaryProgressTracker rows for the same
(student, report_cycle). Section contributions then scattered across the
duplicates, so no single row ever held a complete set — finalization never fired
and the admin (reading the newest row) saw the form as unsubmitted.

This migration merges any existing duplicates into one canonical row, then adds a
unique constraint so the now-atomic get_or_create can never duplicate again.
"""

from django.db import migrations, models


def _merge_form_data(winner_data, loser_data):
    """Recursively merge loser_data into winner_data; winner wins on conflicts."""
    if not isinstance(winner_data, dict) or not isinstance(loser_data, dict):
        return winner_data or loser_data
    for key, loser_val in loser_data.items():
        if key not in winner_data:
            winner_data[key] = loser_val
        elif isinstance(winner_data[key], dict) and isinstance(loser_val, dict):
            _merge_form_data(winner_data[key], loser_val)
    return winner_data


def _contrib_rank(contrib):
    """Higher is better: submitted beats draft; newer timestamp breaks ties."""
    submitted = 1 if contrib.status == "submitted" else 0
    ts = contrib.submitted_at or contrib.updated_at
    return (submitted, ts.timestamp() if ts else 0)


def _dedupe(apps, model_name, fk_field):
    Model = apps.get_model("api", model_name)
    Contribution = apps.get_model("api", "SectionContribution")

    seen = {}
    for row in Model.objects.all().order_by("id"):
        seen.setdefault((row.student_id, row.report_cycle_id), []).append(row)

    for rows in seen.values():
        if len(rows) < 2:
            continue

        # Winner: prefer finalized, then most contributions, then oldest.
        def sort_key(r):
            n_contrib = Contribution.objects.filter(**{fk_field: r}).count()
            return (1 if r.finalized_at else 0, n_contrib, -r.id)

        rows.sort(key=sort_key, reverse=True)
        winner, losers = rows[0], rows[1:]

        for loser in losers:
            _merge_form_data(winner.form_data, loser.form_data or {})

            for lc in Contribution.objects.filter(**{fk_field: loser}):
                existing = Contribution.objects.filter(
                    **{fk_field: winner}, section_key=lc.section_key
                ).first()
                if existing is None:
                    setattr(lc, fk_field, winner)
                    lc.save(update_fields=[fk_field])
                elif _contrib_rank(lc) > _contrib_rank(existing):
                    existing.delete()
                    setattr(lc, fk_field, winner)
                    lc.save(update_fields=[fk_field])
                else:
                    lc.delete()

            if not winner.finalized_at and loser.finalized_at:
                winner.finalized_at = loser.finalized_at
                winner.finalized_by_id = loser.finalized_by_id
            if not winner.submitted_by_id and loser.submitted_by_id:
                winner.submitted_by_id = loser.submitted_by_id

        winner.save()
        for loser in losers:
            loser.delete()


def dedupe_forward(apps, schema_editor):
    _dedupe(apps, "MultidisciplinaryAssessment", "assessment")
    _dedupe(apps, "MultidisciplinaryProgressTracker", "tracker")


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0048_multidisciplinaryprogresstracker_unlock_requested"),
    ]

    operations = [
        migrations.RunPython(dedupe_forward, noop_reverse),
        migrations.AddConstraint(
            model_name="multidisciplinaryassessment",
            constraint=models.UniqueConstraint(
                fields=["student", "report_cycle"],
                name="unique_assessment_per_student_cycle",
            ),
        ),
        migrations.AddConstraint(
            model_name="multidisciplinaryprogresstracker",
            constraint=models.UniqueConstraint(
                fields=["student", "report_cycle"],
                name="unique_tracker_per_student_cycle",
            ),
        ),
    ]
