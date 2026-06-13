# Lesson 01 — The Big Picture

**Goal:** By the end, you can explain in plain words what ARASE is, why it's split into two
halves, and where every kind of file lives. This is the map you'll use for the rest of the course.

---

## 1. What ARASE actually is

ARASE is a web app for managing **SPED (Special Education) students** — from the first
assessment, through enrollment, through monthly progress tracking, with AI helping generate
the IEP and report documents.

The people who use it ("roles") are:

- **ADMIN** — runs the show: registers students, assigns staff, manages everything.
- **TEACHER** — fills in classroom assessments and trackers.
- **SPECIALIST** — does professional assessments (speech, OT, etc.).
- **PARENT** — fills in parent forms about their child.

You'll see these four words *everywhere* in the code (`role === "ADMIN"`,
`if user.role == 'ADMIN'`). Whenever you see a "role," it's one of those four. A lot of the
app's behavior is just "show/allow this depending on who's logged in."

Hold onto the **roles** and the **round trip** from the intro. Almost every screen in ARASE is:
*"this role wants to see/do something about a student, so the browser asks the server, the
server checks the role, reads or writes the database, and answers."*

---

## 2. Why there are two halves (and why that's normal)

Your app is split into two programs that run separately and talk over the internet:

### The Frontend — what the user sees
- Lives in **`frontend/`**
- Built with **Next.js + React + TypeScript** (this is the "Web (Production)" stack from your preferences).
- Runs **in the user's browser** (mostly).
- Its job: draw the screen, react to clicks, and **ask the backend for data**. It does *not*
  touch the database directly. It can't — the database isn't even on the user's machine.

### The Backend — the brain and the data
- Lives in **`api/`** and **`backend/`** (Python).
- Built with **Django + Django REST Framework (DRF)**.
- Runs **on a server** (your laptop in dev, Railway in production).
- Its job: receive requests, check permissions, run the business logic, read/write the
  **database**, and send back **JSON** (plain structured data, not a webpage).

```
         frontend/  (Next.js, TypeScript)              api/ + backend/  (Django, Python)
        ┌───────────────────────────────┐             ┌───────────────────────────────┐
        │  Pages, buttons, forms          │  HTTP/JSON  │  URLs → Views → Services        │
        │  Runs in the BROWSER            │ ◄─────────► │  Runs on the SERVER             │
        │  Knows nothing about the DB     │             │  Owns the DB + all the rules    │
        └───────────────────────────────┘             └──────────────┬────────────────┘
                                                                       │
                                                                       ▼
                                                                 db.sqlite3 (dev)
                                                                 PostgreSQL (prod)
```

**Why split it?** Two reasons that matter for debugging:
1. **Security.** You can never trust the browser — a user can edit anything in it. So the
   *rules* (who can see which student, who can delete) live on the server, where users can't
   touch them. That's why you'll see permission checks repeated in the backend even when the
   frontend already hides a button.
2. **It tells you where bugs live.** When something's wrong, your *first* question is always:
   **"is this a frontend problem or a backend problem?"** Lesson 06 shows you how to tell in
   30 seconds. Almost every debugging session starts by picking a side.

---

## 3. The folder map (bookmark this)

Here's the whole project, with only the folders you'll actually care about. Open the project
in your editor and expand these as you read.

### Top level
```
030625/
├── frontend/        ← THE FRONTEND. Everything the user sees.
├── api/             ← THE BACKEND app. Your business logic, models, endpoints.
├── backend/         ← Django project config (settings, top-level URLs, startup).
├── db.sqlite3       ← The actual development database (a single file!).
├── manage.py        ← The Django command runner (runserver, migrate, etc.).
├── media/           ← Uploaded / generated files in dev (e.g. generated docs).
└── README.md        ← How to set up and run the app.
```

### Inside `backend/` — the project's control room
```
backend/
├── settings/
│   ├── base.py      ← Settings shared everywhere (apps, middleware, auth config).
│   ├── dev.py       ← Local-dev overrides (SQLite, console email, DEBUG=True).
│   └── prod.py      ← Production overrides (Postgres, S3, real email/SMS).
├── urls.py          ← The TOP-LEVEL URL map. First thing the server consults.
├── celery.py        ← Background-job setup (Celery).
├── asgi.py / wsgi.py← The server entry points (asgi = WebSockets/async, wsgi = plain HTTP).
```
You'll rarely edit this folder, but `backend/urls.py` and `backend/settings/base.py` are
worth knowing — they're the "where does everything start" files.

### Inside `api/` — where the real work happens
```
api/
├── models.py        ← THE DATA SHAPE. Every "table" in the database (User, Student, ...).
├── urls.py          ← The API URL map (/api/students/, /api/iep/generate/, ...).
├── views.py         ← The endpoints. Receives a request, returns a response. (Big! 3,000+ lines.)
├── auth_views.py    ← Login / logout / "who am I" endpoints (kept separate from the rest).
├── serializers.py   ← Translators between database objects and JSON.
├── services/        ← THE BUSINESS LOGIC. Views call these. (One file per topic.)
├── authentication.py← How the server figures out who you are from your cookie.
├── consumers.py     ← WebSocket handlers (live/real-time updates).
├── tasks.py         ← Background jobs (slow work like AI generation, run by Celery).
└── migrations/      ← The database's change history (auto-generated; don't hand-edit).
```

The pattern to remember: **`views.py` is thin, `services/` is thick.** A view's job is to
receive the request, check who's allowed, then hand off to a service that does the actual work.
The very top of [`api/views.py`](../../api/views.py) literally says so:

> ```python
> """
> API Views — thin orchestrators.
> Most business logic lives in api/services/*.
> """
> ```

So when you're hunting for *how* something works (not just *which URL* triggers it), you'll
usually end up in `api/services/`.

### Inside `frontend/src/` — the user-facing code
```
frontend/src/
├── app/             ← THE PAGES. Folder structure here = the URLs in the browser.
│   ├── login/page.tsx          → the /login screen
│   ├── dashboard/page.tsx      → the /dashboard screen
│   ├── students/[id]/page.tsx  → the /students/123 screen ([id] = any student)
│   └── layout.tsx              → the wrapper around EVERY page (runs once, on top).
├── components/      ← Reusable UI pieces (Navbar, Sidebar, buttons in components/ui/).
├── context/         ← App-wide shared state. AuthContext.tsx = "who is logged in."
├── hooks/           ← Reusable bits of behavior (notifications, real-time refresh).
├── lib/             ← Helpers. api.ts = THE single door to the backend. (Memorize this one.)
├── config/          ← Static configuration (e.g. form definitions).
└── types/           ← TypeScript type definitions (shapes of data, no logic).
```

Two files in here you'll touch constantly:
- **`frontend/src/lib/api.ts`** — *every* call to the backend goes through here. If the app
  can't reach the server, or keeps logging you out, this file is involved.
- **`frontend/src/context/AuthContext.tsx`** — holds "who is logged in" for the whole app.
  Any "why am I seeing the wrong thing for my role" bug touches this.

---

## 4. The mental model, restated

When you want to understand or fix a feature, you locate it on **two axes**:

1. **Which half?** Frontend (`frontend/`) or backend (`api/`)?
2. **Which layer within that half?**
   - Frontend layers: *page* (`app/.../page.tsx`) → *components* → *`lib/api.ts`* → (network)
   - Backend layers: *url* (`urls.py`) → *view* (`views.py`) → *service* (`services/`) → *model* (`models.py`) → database

Every feature lives somewhere on that grid. The rest of this course teaches you to walk it.

---

## Exercises

Do these with the project open. They should take ~10 minutes total.

1. **Roles in the wild.** Open [`api/views.py`](../../api/views.py) and search (Ctrl/Cmd-F)
   for `role != 'ADMIN'`. How many places refuse to do something unless you're an admin? You
   don't need an exact count — just see how common role checks are.
2. **URL → file.** Without running anything: a user visits `http://localhost:3000/login`.
   Which file draws that screen? Now `http://localhost:3000/dashboard`? (Hint: §3, `app/`.)
3. **Find the data shapes.** Open [`api/models.py`](../../api/models.py). List five `class`
   names you see. Those are five of your database tables. Which one do you think stores the
   people who log in?

> **Answers:** (2) `frontend/src/app/login/page.tsx` and `frontend/src/app/dashboard/page.tsx`.
> (3) The login one is `User` — that's almost always the table for accounts.

Next → [02-frontend-tour.md](02-frontend-tour.md)
