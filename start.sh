#!/usr/bin/env bash
# Render start command — run phase only.
# Migrations, admin provisioning, and collectstatic run in build.sh (build phase),
# so this script only starts the long-running processes.
set -o errexit

# Background task worker, forked into the web service to stay on the free tier.
# For production scale, move this to a dedicated Render Background Worker service.
(celery -A backend worker -l INFO --pool=solo &)

# ASGI web server (uvicorn worker is required for Channels / WebSocket support).
exec gunicorn backend.asgi:application \
  -k uvicorn.workers.UvicornWorker \
  --bind "0.0.0.0:$PORT" \
  --workers 2 \
  --timeout 120
