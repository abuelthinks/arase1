import os
import django

# Setup Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from api.models import User

def create_master_admin():
    username = os.getenv("ADMIN_USERNAME", "admin")
    email = os.getenv("ADMIN_EMAIL", "admin@example.com")
    password = os.getenv("ADMIN_PASSWORD", "admin123")

    if not User.objects.filter(username=username).exists():
        print(f"Creating master admin: {username}...")
        User.objects.create_superuser(username, email, password)
        print("Master admin created successfully!")
    else:
        print(f"Admin '{username}' already exists. Skipping.")

if __name__ == "__main__":
    create_master_admin()
