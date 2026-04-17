import argparse
import os
import sys

import django


DEFAULT_SENTINELS = {"admin", "admin@example.com", "admin123"}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Provision or repair the master admin account."
    )
    parser.add_argument(
        "--force-reset",
        action="store_true",
        help="Reset the existing admin password if the account already exists.",
    )
    parser.add_argument(
        "--settings",
        help="Optional Django settings module override. Defaults to DJANGO_SETTINGS_MODULE if set.",
    )
    return parser.parse_args()


def configure_django(settings_override=None):
    if settings_override:
        os.environ["DJANGO_SETTINGS_MODULE"] = settings_override
    elif not os.environ.get("DJANGO_SETTINGS_MODULE"):
        raise ValueError(
            "DJANGO_SETTINGS_MODULE is required. Set it in the environment or pass --settings."
        )
    django.setup()


def get_required_env(name):
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"{name} is required.")
    if value in DEFAULT_SENTINELS:
        raise ValueError(f"{name} must not use the insecure default value.")
    return value


def create_master_admin(force_reset=False):
    from api.models import User

    username = get_required_env("ADMIN_USERNAME")
    email = get_required_env("ADMIN_EMAIL")
    password = get_required_env("ADMIN_PASSWORD")

    admin_user = User.objects.filter(username=username).first()
    if not admin_user:
        print(f"Creating master admin: {username}...")
        admin_user = User.objects.create_superuser(username, email, password)
        admin_user.role = "ADMIN"
        admin_user.save(update_fields=["role"])
        print("Master admin created successfully.")
        return

    print(f"Admin '{username}' already exists. Ensuring admin permissions are intact.")
    fields_to_update = []

    if admin_user.email != email:
        admin_user.email = email
        fields_to_update.append("email")
    if not admin_user.is_superuser:
        admin_user.is_superuser = True
        fields_to_update.append("is_superuser")
    if not admin_user.is_staff:
        admin_user.is_staff = True
        fields_to_update.append("is_staff")
    if admin_user.role != "ADMIN":
        admin_user.role = "ADMIN"
        fields_to_update.append("role")

    if force_reset:
        admin_user.set_password(password)
        fields_to_update.append("password")
        print("Password reset requested; updating admin password.")
    else:
        print("Password left unchanged. Pass --force-reset to rotate it.")

    if fields_to_update:
        admin_user.save(update_fields=fields_to_update)
    print("Admin account verified successfully.")


if __name__ == "__main__":
    args = parse_args()
    try:
        configure_django(args.settings)
        create_master_admin(force_reset=args.force_reset)
    except Exception as exc:
        print(f"Admin provisioning failed: {exc}", file=sys.stderr)
        sys.exit(1)
