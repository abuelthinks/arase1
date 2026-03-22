import os
import sys

# Add the project root to the python path
sys.path.append('c:\\Users\\abuel\\OneDrive\\Documents\\26code\\030625\\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

import django
django.setup()

from api.models import MultidisciplinaryProgressTracker, MultidisciplinaryAssessment

print("--- MULTIDISCIPLINARY PROGRESS TRACKERS ---")
for t in MultidisciplinaryProgressTracker.objects.all().order_by('-id')[:3]:
    print(f"ID: {t.id}")
    print(f"FORM_DATA: {t.form_data}")

print("\n--- MULTIDISCIPLINARY ASSESSMENTS ---")
for a in MultidisciplinaryAssessment.objects.all().order_by('-id')[:3]:
    print(f"ID: {a.id}")
    print(f"FORM_DATA: {a.form_data}")
