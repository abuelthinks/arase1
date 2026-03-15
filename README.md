# Comprehensive AI IEP System

This repository contains the frontend (Next.js) and backend (Django) for the Comprehensive AI IEP system.

## Project Structure

- `frontend/`: Next.js frontend application.
- `backend/`: Django backend API.
- `extracted_forms/` & `Updated Theruni Forms/`: Various data forms and references.

## Pushing to GitHub

1. **Initialize Git** (if not already initialized):
   ```bash
   git init
   ```
2. **Add all files**:
   ```bash
   git add .
   ```
   *(Note: The `.gitignore` file will ensure `node_modules`, `venv`, `db.sqlite3` and `.env` files are not pushed)*.
3. **Commit your changes**:
   ```bash
   git commit -m "Initial commit prior to deployment"
   ```
4. **Push to your GitHub repository**:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```

## Deployment Overview

### Frontend (Next.js)

The easiest way to deploy the Next.js frontend is via **Vercel**:
1. Go to [Vercel](https://vercel.com/) and connect your GitHub account.
2. Import the repository.
3. Set the **Framework Preset** to Next.js.
4. Set the **Root Directory** to `frontend`.
5. Add any environment variables (e.g., `NEXT_PUBLIC_API_URL` pointing to your deployed backend URL).
6. Click **Deploy**.

### Backend (Django)

The backend can be easily deployed on **Render**, **Railway**, or **Heroku**:
1. Ensure your `.env` contains:
   - `SECRET_KEY` (generate a new secure one)
   - `DEBUG=False`
   - `ALLOWED_HOSTS=<your-production-url>`
   - `CORS_ALLOWED_ORIGINS=<your-frontend-url>`
2. Deploying on **Render** (example):
   - Connect your GitHub and create a new **Web Service**.
   - Set the Root Directory to `backend` (if Render supports it, otherwise use a custom start command).
   - Use Start Command: `gunicorn backend.wsgi:application` or start a dev server `python manage.py runserver 0.0.0.0:$PORT` for simple tests.
   - Set up the environment variables mentioned above.

*Note: For production, you may want to swap SQLite for PostgreSQL by updating the `DATABASE_URL` environment variable.*
