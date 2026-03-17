#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
pip install -r backend/requirements.txt

# Run migrations
python manage.py migrate

# Provision master admin if env vars are present
python provision_admin.py

# Collect static files
python manage.py collectstatic --no-input
