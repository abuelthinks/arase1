# Lesson 10: How It Runs Live

**You'll be able to:** draw how the live app is wired, name what's different from your
laptop, and know where to look when something works locally but breaks for real users.

**Time:** ~30 min · **Open:** [`railway.json`](../../railway.json), [`backend/settings/prod.py`](../../backend/settings/prod.py),
[`frontend/next.config.ts`](../../frontend/next.config.ts)

---

## 1. The live setup

```
   User's browser
        │  https://<the vercel site>/...        (pages AND /api/* requests: same site)
        ▼
 ┌───────────────────────────┐
 │ VERCEL                     │   Next.js, built with `npm run build`
 │  frontend                  │   next.config.ts rewrites /api/* ──────────────┐
 └───────────────────────────┘                                                 │
        │                                                                       ▼
        │  wss://<railway backend>/ws/realtime/?token=…        ┌───────────────────────────────┐
        └─────────────── (WebSockets go DIRECT) ─────────────► │ RAILWAY · web service          │
                                                                │  gunicorn + uvicorn workers    │
                                                                │  running backend.asgi         │
                                                                └──────┬────────────┬──────────┘
                                                                       │            │ queue jobs / live events
                                                                       ▼            ▼
                                                           ┌──────────────┐  ┌────────────┐
                                                           │ PostgreSQL    │  │ Redis      │
                                                           └──────▲───────┘  └─────┬──────┘
                                                                  │                │
                                                                  │       ┌────────▼──────────────┐
                                                                  └────── │ RAILWAY · worker       │
                                                                          │  celery -A backend …   │
                                                                          └────────┬──────────────┘
                                                                                   ▼
                                                             Gemini (AI) · AWS S3 (files) · email / SMS
```

Compare with Lesson 01's local picture. Same five programs, but:
- The frontend and backend are on **different domains**, joined by the Vercel rewrite.
- The backend runs under **gunicorn with uvicorn workers**, not daphne. Same ASGI app
  (`backend.asgi:application`), different server.
- The worker is **its own Railway service** (`theruni-worker` in `railway.json`).
- **Redis is shared**, so live events from the worker *do* reach browsers (unlike
  Lesson 05 §4 locally).

---

## 2. How a deploy happens

### Backend (Railway)
`railway.json` defines two services built from the same code:

| Service | Build | Start |
|---|---|---|
| `web` (`theruni-api`) | `bash build.sh` (pip install, migrate, create admin, collectstatic) | `migrate` → `provision_admin.py` → `collectstatic` → `gunicorn backend.asgi:application -k uvicorn.workers.UvicornWorker …` |
| `worker` (`theruni-worker`) | `bash build.sh` | `celery -A backend worker -l INFO --pool=solo` |

After starting, Railway hits **`/api/health/`** (`HealthView` in `backend/urls.py`). Until it
answers 200, the deploy isn't live. That's what Lesson 09 Case 4 broke.

**Migrations run on deploy.** Your committed migration files are applied to the live
database automatically. A migration that deletes a column deletes real data.

### Frontend (Vercel)
Vercel runs `npm run build`. **A TypeScript error fails the build**, so the old version stays
live. Run `npm run build` locally before pushing anything big.

> Check each dashboard's settings to see which branch deploys automatically. Don't assume.

---

## 3. Which settings file runs?

Look at the top of `manage.py`, `backend/asgi.py`, and `backend/celery.py`:
```python
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings.dev')
```
They all **default to dev**. `setdefault` means "use this only if nothing else is set." So
production *must* set the environment variable `DJANGO_SETTINGS_MODULE=backend.settings.prod`
on **both** Railway services. If the worker were missing it, it would quietly run with dev
settings (wrong database, wrong channel layer).

---

## 4. Dev vs. production, side by side

| Thing | Local dev (`dev.py`) | Production (`prod.py` + env vars) |
|---|---|---|
| `DEBUG` | `True`: detailed error pages | `False`: generic errors, details only in logs |
| Database | `db.sqlite3` file | PostgreSQL via `DATABASE_URL`, `conn_max_age=0` by default |
| Uploaded files | `media/` folder | AWS S3 (`USE_S3=True`) |
| Email | Mailpit at `localhost:1025` | a real email service |
| SMS | smstrap at `localhost:1290` | `SMS_BACKEND` env var (`console` until a provider is set up) |
| Cookies | `SameSite=Lax`, not `Secure` | `SameSite=None`, `Secure`, HTTPS only |
| API address (browser) | `http://localhost:8000` | same site, rewritten by Vercel |
| WebSocket auth | 60-second ticket via `?token=` | same |
| Channel layer | in-memory unless `REDIS_URL` is set | Redis |
| Throttling | off | 600 requests/min per user, 30/min anonymous |
| Allowed hosts | `localhost`, `127.0.0.1` | the Railway and Vercel domains, `healthcheck.railway.app`, plus `ALLOWED_HOSTS` env |
| HTTP → HTTPS redirect | no | yes, except `SECURE_REDIRECT_EXEMPT` paths |

**Every row is a way "works locally" can still break live.** When a bug is production-only,
walk this table.

---

## 5. Environment variables

Settings that differ per environment (and secrets) come from **environment variables**, not
code. Locally they're in `.env` (never commit it). In production they're set in the
Railway and Vercel dashboards.

Ones worth knowing:

| Variable | Used by | What it does |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | backend + worker | which settings file (§3) |
| `SECRET_KEY` | backend | signs tokens. **Production crashes on start without it**. `prod.py` reads `os.environ['SECRET_KEY']` |
| `DATABASE_URL` | backend + worker | where Postgres is |
| `REDIS_URL` | backend + worker | Celery queue + channel layer |
| `GEMINI_API_KEY`, `AI_PROVIDER` | worker mainly | the AI |
| `USE_S3` + AWS keys | backend + worker | file storage |
| `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | backend | which sites may call the API with cookies |
| `NEXT_PUBLIC_API_URL` | frontend | the Railway URL, for the rewrite and WebSockets |

> **`NEXT_PUBLIC_` variables are baked in at build time.** Next.js copies their values into
> the JavaScript when `npm run build` runs. Change `NEXT_PUBLIC_API_URL` on Vercel and
> nothing happens until you **redeploy**.

> **Adding a new env var is a deploy step.** If your code reads a new variable, someone has
> to add it on Railway/Vercel *before* the code goes live, or it'll use the default or crash.
> Say so in your PR description.

---

## 6. Debugging production

You can't add `print()` and restart. What you *can* do:

1. **Browser DevTools still work.** Network tab, status codes, Response bodies. Same as
   local. Start here, always.
2. **Railway logs.** Each service (web, worker) has its own log stream. 500s print their
   traceback there (because `DEBUG=False` hides it from the browser). AI failures show up in
   the **worker** logs.
3. **Vercel logs.** Build failures (TypeScript errors) and rewrite problems.
4. **Reproduce locally with prod-like settings** when you can: same data shape, same role,
   same steps.
5. **Be careful.** Production is real families' data. Don't experiment on it. Never run
   `manage.py shell` writes against the live database casually.

---

## Exercises

1. **Trace a live request.** A parent opens `/dashboard` on the live site. List each system
   the `GET /api/students/` request passes through, in order, until it reaches the database.
2. **Why both?** Why do WebSockets connect to Railway directly while REST calls go through
   Vercel? What would break if REST calls went direct too? (Hint: Lesson 09 Case 2.)
3. **Spot the risk.** You add `REPORTS_BUCKET = os.environ['REPORTS_BUCKET']` to `base.py`.
   It works on your laptop because your `.env` has it. What happens on the next Railway
   deploy?
4. **Read the table.** A feature sends an email. It works locally (you see it in Mailpit) but
   nobody receives it live. Which row of §4 do you check first?

---

## Answers

1. Browser → Vercel (`next.config.ts` rewrite) → Railway web service (gunicorn/uvicorn →
   Django: `backend/urls.py` → `api/urls.py` → `StudentViewSet.get_queryset`) → PostgreSQL.
   Then the same path back.
2. Vercel's rewrite only proxies normal HTTP, not WebSockets. If REST went direct, the
   cookies would be third-party again, and incognito/Safari logins would break. That's the
   exact bug Case 2 fixed.
3. If Railway doesn't have `REPORTS_BUCKET` set, `os.environ['...']` raises `KeyError` at
   startup, the healthcheck never passes, and the deploy fails. Use
   `os.environ.get('REPORTS_BUCKET', '')` with a sensible default, *and* add the variable on
   Railway.
4. The **Email** row. Dev sends to Mailpit. Production needs real email settings in its env
   vars. Then check Railway logs for email errors.

Next → [11-glossary.md](11-glossary.md)
