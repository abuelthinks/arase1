#!/usr/bin/env bash
set -o errexit

echo "Starting Celery worker in the background..."
celery -A backend worker -l INFO &

echo "Starting Gunicorn web server..."
# Bind Gunicorn to the $PORT environment variable provided by Render
gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT
