from django.core.management.base import BaseCommand

from api.models import Student
from api.services.workflow_state_service import reconcile_student_assessment_state


class Command(BaseCommand):
    help = "Reconcile assessment workflow state after legacy scheduling/form submission bugs."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Persist changes instead of printing a dry run.")
        parser.add_argument("--student-id", type=int, help="Limit reconciliation to a single student.")
        parser.add_argument(
            "--delete-stale-iep-drafts",
            action="store_true",
            help="Delete draft IEPs that were generated before any finalized multidisciplinary assessment and have no downstream artifacts.",
        )

    def handle(self, *args, **options):
        students = Student.objects.all().order_by("id")
        if options.get("student_id"):
            students = students.filter(id=options["student_id"])

        if not students.exists():
            self.stdout.write(self.style.WARNING("No matching students found."))
            return

        apply_changes = options["apply"]
        delete_stale_iep_drafts = options["delete_stale_iep_drafts"]
        updated = 0
        warned = 0

        for student in students:
            result = reconcile_student_assessment_state(
                student,
                apply=apply_changes,
                delete_stale_iep_drafts=delete_stale_iep_drafts,
            )
            changed = result.target_status and result.target_status != result.original_status
            if changed:
                updated += 1
                verb = "Updated" if result.applied else "Would update"
                self.stdout.write(
                    self.style.SUCCESS(
                        f"{verb} student {result.student_id} ({result.student_name}) "
                        f"from {result.original_status} to {result.target_status}."
                    )
                )

            if result.deleted_iep_doc_ids:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Deleted stale draft IEPs for student {result.student_id}: {', '.join(str(doc_id) for doc_id in result.deleted_iep_doc_ids)}"
                    )
                )

            for warning in result.warnings:
                warned += 1
                self.stdout.write(self.style.WARNING(f"Student {result.student_id}: {warning}"))

            if result.stale_iep_doc_ids and not result.deleted_iep_doc_ids:
                self.stdout.write(
                    self.style.WARNING(
                        f"Student {result.student_id} stale IEP docs: {', '.join(str(doc_id) for doc_id in result.stale_iep_doc_ids)}"
                    )
                )

        mode = "Applied" if apply_changes else "Dry run"
        self.stdout.write(f"{mode} complete. Status changes: {updated}. Warnings: {warned}.")
