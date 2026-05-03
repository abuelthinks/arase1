"""
Quick database health check: lists all users with their role and admin flags.
Usage: python verify_db.py
"""
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings.dev")
django.setup()

from api.models import User


def check_admin():
    print("--- Database Users Check ---")
    users = User.objects.all()
    print(f"Total users in DB: {users.count()}")
    for u in users:
        print(
            f"Email: '{u.email}' | Role: '{u.role}' | "
            f"is_superuser: {u.is_superuser} | is_staff: {u.is_staff}"
        )
        print(f"Password hash starts with: {u.password[:10]}...")
        print("----------------------------")


if __name__ == "__main__":
    check_admin()
