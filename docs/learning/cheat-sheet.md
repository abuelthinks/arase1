# ARASE Cheat Sheet

One page. Print it or keep it open.

---

## Where things live

| I want… | Open |
|---|---|
| The screen at URL `/x/y` | `frontend/src/app/x/y/page.tsx` (`[id]` folders = any value) |
| Who's logged in (frontend) | `frontend/src/context/AuthContext.tsx` → `useAuth()` |
| How the frontend calls the backend | `frontend/src/lib/api.ts` |
| Data shapes (frontend) | `frontend/src/types/index.ts`, and interfaces at the top of page files |
| Which view handles `/api/...` | `api/urls.py` (auth endpoints: `backend/urls.py`) |
| The view itself | `api/views.py` (`Ctrl+Shift+O` by name) · auth: `api/auth_views.py` |
| How a feature actually works | `api/services/<topic>_service.py` |
| What JSON the frontend gets | `api/serializers.py` `fields = [...]`, or the dict a service returns |
| Database tables | `api/models.py` |
| Background jobs | `api/tasks.py` |
| Live updates | `api/services/realtime_service.py` → `api/consumers.py` → `RealtimeProvider.tsx` → `useRealtimeRefresh` |
| AI calls | `api/iep_generator.py`, `api/monthly_report_generator.py` → `api/services/llm_service.py` |
| Settings | `backend/settings/base.py`, `dev.py`, `prod.py` |
| How production starts | `railway.json`, `build.sh`, `frontend/next.config.ts` |

## The round trip

```
page.tsx → useEffect → api.get() → lib/api.ts → backend/urls.py → api/urls.py
  → auth (cookie → request.user) → view (role check) → service → model → DB
  → JSON back → setData() → screen redraws
```

## Which terminal?

| Program | Errors & prints show in | Restart when |
|---|---|---|
| Frontend (`npm run dev`) | **Browser Console** | rarely |
| Backend (daphne) | **daphne terminal** | any `.py` change |
| Celery worker | **Celery terminal** | `tasks.py` / `services/` change |
| Redis | its own terminal | it stops |

## Status codes

| | Means | Look at |
|---|---|---|
| 202 | job queued, not done | Celery terminal |
| 400 | bad/missing data, or "not ready" guard | Response body; view guards |
| 401 | not logged in / expired | cookies (Application tab) |
| 403 | not allowed (role) or CSRF | Response text; role check |
| 404 | no such URL, **or not on the team** | `urls.py`; `StudentAccess` |
| 429 | rate limited | throttle settings |
| 500 | crashed | daphne/Celery traceback (read bottom-up) |
| 503 | can't queue job | is Redis running? |

## The method

0. Is the new code running? (restart daphne/Celery) → 1. Reproduce → 2. Read the error →
3. Which program? (Network tab) → 4. Narrow to one hop (one print) → 5. Smallest fix, recheck

## Adding a field

model → `makemigrations` + `migrate` → serializer(s) `fields` → hand-built dicts (`MeView`,
services) → `read_only_fields`? → TS types → UI → restart daphne → click through as each role

## Before you commit

```bash
python manage.py check
```
```bash
python manage.py makemigrations --check --dry-run
```
```bash
python manage.py test api
```
```bash
npm --prefix frontend run lint
```
```bash
npm --prefix frontend run build
```

## Shortcuts (VS Code)

`Ctrl+P` file · `Ctrl+Shift+O` symbol in file · `Ctrl+T` symbol anywhere ·
`Ctrl+Shift+F` search all · `F12` definition · `Shift+F12` usages · `Alt+←` back ·
`Ctrl+K Ctrl+0` fold all

## Bug patterns from our history

301 loop → trailing slash/rewrite · one browser only → cookies · wrong people notified →
a default · setting ignored → wrong format · line "looks fine" → invisible chars ·
fix didn't work → stale server · fine then fails → a limit · prod only → `prod.py` / env vars

← [Course index](README.md)
