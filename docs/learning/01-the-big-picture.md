# Lesson 01: The Big Picture

**You'll be able to:** say in plain words what ARASE is, name the programs that make it up,
and know which folder to open for any kind of problem. This is the map for the rest of the
course.

**Time:** ~30 min · **Open:** the project root in your editor

---

## 1. What ARASE is

ARASE manages **SPED (Special Education) students**: from the first assessment, through
enrollment, through monthly progress tracking. AI (Google Gemini) helps write the **IEP**
(Individualized Education Program) and the monthly reports.

Four kinds of people use it. In the code these are called **roles**:

| Role | What they do | Where they land after login |
|---|---|---|
| `ADMIN` | Registers students, builds each student's team, generates IEPs and reports | `/dashboard` |
| `TEACHER` | Fills in classroom assessments and progress trackers | `/workspace` |
| `SPECIALIST` | Does professional assessments (speech, OT, …) | `/workspace` (or `/specialist-onboarding` if their profile isn't finished) |
| `PARENT` | Fills in parent forms about their child, picks specialists, books appointments | `/dashboard` |

You'll see these four words **everywhere**: `user.role === "ADMIN"` in TypeScript,
`request.user.role == 'ADMIN'` in Python. A huge part of the app is just "allow or show this
depending on who's logged in."

### A student's life in the app

Every student has a `status`, and most screens behave differently depending on it. It's
defined on the `Student` model in [`api/models.py`](../../api/models.py):

```
PENDING_ASSESSMENT → ASSESSMENT_SCHEDULED → ASSESSED → ENROLLED ↔ INTEGRATED → ARCHIVED
```

Roughly: the admin registers a student and invites a parent → parent fills in forms and
picks specialists → specialists assess → admin enrolls the student → monthly **report
cycles** start, where everyone fills in **trackers** → AI turns those into an IEP and monthly
reports.

> **Predict:** A teacher says "I can't see the student I was told to work with." Before
> reading further, guess: is that more likely a problem with the *screen*, or with *who's
> allowed to see what*? (Answer in §3.)

---

## 2. The five programs that make up ARASE

ARASE isn't one program. In development, **four or five separate programs** run at the same
time and talk to each other. Knowing this explains a lot of "it works on my machine" weirdness.

```
  ┌────────────────────┐   HTTP (JSON)    ┌──────────────────────────┐
  │  1. FRONTEND        │ ───────────────► │  2. BACKEND               │
  │  Next.js            │ ◄─────────────── │  Django, served by daphne │
  │  localhost:3000     │                  │  localhost:8000           │
  │  frontend/          │ ◄── WebSocket ── │  api/ + backend/          │
  └────────────────────┘   (live pushes)  └─────────────┬────────────┘
                                                        │ reads/writes      queues slow jobs
                                                        ▼                         │
                                           ┌──────────────────────┐              ▼
                                           │  5. DATABASE          │   ┌──────────────────┐
                                           │  db.sqlite3 (dev)     │   │  4. REDIS         │
                                           │  PostgreSQL (live)    │   │  the job queue    │
                                           └──────────▲───────────┘   └────────┬─────────┘
                                                      │                         │ picks up jobs
                                                      │ writes results          ▼
                                                      │              ┌──────────────────────┐
                                                      └───────────── │  3. CELERY WORKER     │
                                                                     │  api/tasks.py         │
                                                                     │  calls Gemini / Ollama│
                                                                     └──────────────────────┘
```

| # | Program | Lives in | Its job |
|---|---|---|---|
| 1 | **Frontend** (Next.js + React + TypeScript) | `frontend/` | Draws the screen, reacts to clicks, **asks the backend for data**. It never touches the database. |
| 2 | **Backend** (Django + Django REST Framework) | `api/`, `backend/` | Checks who you are and what you're allowed to do, reads/writes the database, sends back JSON. |
| 3 | **Celery worker** | `api/tasks.py` | Runs slow jobs in the background, mainly AI generation and translation, so the backend can answer the browser right away. |
| 4 | **Redis** | (installed separately) | A fast message queue. The backend drops a job in, Celery picks it up. |
| 5 | **Database** | `db.sqlite3` in dev | Where all the data actually lives. One file locally, PostgreSQL in production. |

Plus one outside service: **the AI model.** `AI_PROVIDER` in `.env` chooses it. `auto` tries
Gemini first and falls back to a local Ollama model.

**Why split it up?** Two reasons that matter for debugging:

1. **Security.** You can't trust the browser, since a user can change anything in it. So the
   *rules* (who can see which student, who can delete) live on the backend. That's why you'll
   see permission checks in Python even when the frontend already hides the button.
2. **It tells you where bugs live.** Your first question when something breaks is always
   **"which program?"** Lesson 07 shows how to answer that in 30 seconds.

---

## 3. The folder map (bookmark this)

Only the folders you'll actually care about:

### Top level
```
030625/
├── frontend/        ← PROGRAM 1. Everything the user sees.
├── api/             ← PROGRAM 2's real work: models, endpoints, business logic, tasks.
├── backend/         ← Django's config: settings, the top-level URL map, startup files.
├── docs/learning/   ← This course.
├── db.sqlite3       ← The development database (a single file).
├── manage.py        ← Django's command runner (migrate, makemigrations, shell…).
├── media/           ← Uploaded and generated files in dev (PDFs, diagnostic reports).
├── railway.json     ← How production starts (Lesson 10).
└── README.md        ← Setup instructions.
```

### `backend/`: the control room
```
backend/
├── settings/
│   ├── base.py      ← Settings shared everywhere (installed apps, auth, Celery, Redis).
│   ├── dev.py       ← Local overrides: DEBUG on, SQLite, in-memory WebSockets if no Redis.
│   └── prod.py      ← Production: Postgres, S3 file storage, strict security.
├── urls.py          ← The TOP-LEVEL URL map. Auth endpoints live here.
├── asgi.py          ← Entry point daphne runs. Sends HTTP to Django and WebSockets to consumers.
└── celery.py        ← Sets up the background worker.
```
You'll rarely edit this folder. But `backend/urls.py` and `backend/settings/base.py` are the
"where does everything start" files.

### `api/`: where the real work happens
```
api/
├── models.py         ← THE DATA SHAPE. Every database table (User, Student, ReportCycle…).
├── urls.py           ← The API URL map (/api/students/, /api/iep/generate/, …).
├── views.py          ← The endpoints. Gets a request, returns a response. (3,400 lines!)
├── auth_views.py     ← Login, logout, refresh, "who am I" (/api/auth/me/).
├── serializers.py    ← Translators between database rows and JSON.
├── authentication.py ← How the server reads your login cookie and knows who you are.
├── services/         ← THE BUSINESS LOGIC, one file per topic. Views call these.
├── tasks.py          ← Background jobs Celery runs (IEP, monthly report, translation).
├── consumers.py      ← WebSocket handlers (live updates, form collaboration).
├── routing.py        ← The WebSocket URL map (/ws/realtime/, /ws/notifications/, …).
├── iep_generator.py, monthly_report_generator.py, document_generator.py
│                     ← AI prompt building and PDF rendering.
├── tests.py          ← Backend tests.
└── migrations/       ← The database's change history. Generated by Django. Don't hand-edit.
```

The pattern to remember: **`views.py` is thin, `services/` is thick.** A view checks *who's
allowed*, then hands off to a service that does the work. The top of
[`api/views.py`](../../api/views.py) says so itself:

```python
"""
API Views — thin orchestrators.
Most business logic lives in api/services/*.
"""
```

When you want to know *how* something works (not just *which URL* triggers it), you'll
usually end up in `api/services/`.

### `frontend/src/`: what the user sees
```
frontend/src/
├── app/              ← THE PAGES. The folder path here IS the URL in the browser.
│   ├── login/page.tsx            → /login
│   ├── dashboard/page.tsx        → /dashboard  (admin + parent)
│   ├── workspace/page.tsx        → /workspace  (teacher + specialist, 4,400 lines)
│   ├── students/[id]/page.tsx    → /students/5  ([id] = any student)
│   ├── forms/[type]/page.tsx     → one page that draws every assessment/tracker form
│   ├── admin/reports/page.tsx    → where IEP generation is triggered
│   ├── learn/                    → the interactive version of this course
│   └── layout.tsx                → the wrapper around EVERY page
├── components/       ← Reusable UI: sidebars, NotificationBell, CustomSelect, ui/Button…
├── context/          ← App-wide shared state. AuthContext.tsx = "who is logged in."
├── hooks/            ← Reusable behavior: useRealtimeRefresh, useNotifications, useFormCollaboration.
├── lib/              ← Helpers. api.ts = THE single door to the backend. Memorize this one.
├── config/           ← Static config, like the form definitions (JSON schemas).
└── types/            ← TypeScript shapes of data (no logic). index.ts has UserPayload.
```

Two frontend files you'll touch constantly:
- **`frontend/src/lib/api.ts`**: *every* call to the backend goes through here. If the app
  can't reach the server, or keeps logging you out, this file is involved.
- **`frontend/src/context/AuthContext.tsx`**: holds "who is logged in" for the whole app.
  Any "I'm seeing the wrong thing for my role" bug touches this.

> **Answer to the Predict box:** almost always *who's allowed*. Non-admins only see students
> they're assigned to through a `StudentAccess` row. That's a backend rule (Lesson 03 §5),
> not a screen problem.

---

## 4. The two-axis mental model

To understand or fix any feature, place it on **two axes**:

1. **Which program?** Frontend, backend, Celery worker, or database?
2. **Which layer inside it?**
   - Frontend: *page* (`app/.../page.tsx`) → *components* → *`lib/api.ts`* → network
   - Backend: *URL* (`urls.py`) → *view* (`views.py`) → *service* (`services/`) → *model* (`models.py`) → database
   - Background: *task* (`tasks.py`) → *service* → *AI* → database → *live event* back to the browser

Every feature sits somewhere on that grid. The rest of the course teaches you to walk it.

---

## Exercises

1. **Roles in the wild.** Open `api/views.py` and search (Ctrl+F) for `role != 'ADMIN'`.
   Skim the matches. How common are "admins only" checks? (No exact count needed.)
2. **URL → file.** A user visits `http://localhost:3000/workspace`. Which file draws it? What
   about `http://localhost:3000/students/12/reports`?
3. **Find the tables.** Open `api/models.py` and list five `class` names. Which one stores
   the people who log in? Which one connects a teacher to a student?
4. **Which program?** For each, say which of the five programs does the work:
   (a) checking that a parent can't see another family's child, (b) writing the IEP text,
   (c) showing a red error banner, (d) remembering a student's date of birth.

---

## Answers

1. Very common. Dozens of views refuse to act unless you're an admin. Permission checks are
   one of the main things the backend does.
2. `frontend/src/app/workspace/page.tsx`, and `frontend/src/app/students/[id]/reports/page.tsx`.
3. `User` stores accounts. `StudentAccess` links a user to a student (it has a `user` and a
   `student` foreign key). Others include `Student`, `ReportCycle`, `GeneratedDocument`,
   `Notification`, `ActivityEvent`.
4. (a) Backend (the view's role check). (b) Celery worker, which calls Gemini. (c) Frontend.
   (d) Database (the `Student.date_of_birth` column).

Next → [02-frontend-tour.md](02-frontend-tour.md)
