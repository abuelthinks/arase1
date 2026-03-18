import os
import django

# Setup Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings.dev")
django.setup()

from api.models import User

def create_master_admin():
    username = os.getenv("ADMIN_USERNAME", "admin")
    email = os.getenv("ADMIN_EMAIL", "admin@example.com")
    password = os.getenv("ADMIN_PASSWORD", "admin123")

    admin_user = User.objects.filter(username=username).first()
    if not admin_user:
        print(f"Creating master admin: {username}...")
        admin_user = User.objects.create_superuser(username, email, password)
        print("Master admin created successfully!")
    else:
        print(f"Admin '{username}' already exists. Updating password and ensuring superuser status.")
        admin_user.email = email
        admin_user.set_password(password)
        admin_user.is_superuser = True
        admin_user.is_staff = True
        print("Admin user updated.")

    # Ensure the 'role' is set to ADMIN
    if admin_user.role != 'ADMIN':
        admin_user.role = 'ADMIN'
        print("Role set to ADMIN.")
    
    admin_user.save()

if __name__ == "__main__":
    create_master_admin()
