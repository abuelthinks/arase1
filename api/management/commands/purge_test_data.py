from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import (
    AssessmentAppointment,
    DiagnosticReport,
    GeneratedDocument,
    Invitation,
    SpecialistAvailabilitySlot,
    SpecialistPreference,
    Student,
    User,
)


class Command(BaseCommand):
    help = "Purge test data while preserving admin users."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually delete data. Without this flag, the command runs in dry-run mode.",
        )
        parser.add_argument(
            "--keep-email",
            action="append",
            default=[],
            help="Additional admin email(s) to preserve explicitly.",
        )

    def handle(self, *args, **options):
        keep_emails = {email.strip().lower() for email in options["keep_email"] if email.strip()}
        keep_users = User.objects.filter(role="ADMIN") | User.objects.filter(is_superuser=True)
        if keep_emails:
            keep_users = keep_users | User.objects.filter(email__in=keep_emails)
        keep_users = keep_users.distinct()

        keep_ids = list(keep_users.values_list("id", flat=True))
        if not keep_ids:
            self.stderr.write(self.style.ERROR("Aborting: no admin user found to preserve."))
            return

        counts = {
            "students": Student.objects.count(),
            "diagnostic_reports": DiagnosticReport.objects.count(),
            "generated_documents": GeneratedDocument.objects.count(),
            "appointments": AssessmentAppointment.objects.count(),
            "preferences": SpecialistPreference.objects.count(),
            "availability_slots": SpecialistAvailabilitySlot.objects.count(),
            "invitations": Invitation.objects.count(),
            "non_admin_users": User.objects.exclude(id__in=keep_ids).count(),
            "kept_admins": keep_users.count(),
        }

        self.stdout.write("Purge summary:")
        for key, value in counts.items():
            self.stdout.write(f"  {key}: {value}")

        kept_admin_list = list(keep_users.values_list("email", flat=True))
        self.stdout.write(f"  keep_admin_emails: {', '.join(kept_admin_list)}")

        if not options["apply"]:
            self.stdout.write(self.style.WARNING("Dry run only. Re-run with --apply to delete the data."))
            return

        # Remove stored files before DB deletion so S3/local media does not get orphaned.
        for report in DiagnosticReport.objects.exclude(file="").iterator():
            try:
                report.file.delete(save=False)
            except Exception as exc:
                self.stderr.write(f"Warning: failed to delete diagnostic file for report {report.id}: {exc}")

        for document in GeneratedDocument.objects.exclude(file="").iterator():
            try:
                document.file.delete(save=False)
            except Exception as exc:
                self.stderr.write(f"Warning: failed to delete generated file for document {document.id}: {exc}")

        with transaction.atomic():
            Invitation.objects.all().delete()
            Student.objects.all().delete()
            User.objects.exclude(id__in=keep_ids).delete()

        self.stdout.write(self.style.SUCCESS("Test data purged. Admin user(s) preserved."))
