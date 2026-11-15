# Reading & Understanding the ARASE Codebase

A self-paced course for the ARASE team. You built this app fast, often with AI help. This
course teaches you to **read it, understand it, and fix it yourself**, so when something
breaks and there's no AI around, you know where to look.

It's written for people who can *write* code with help but get lost *reading* it. No CS
background needed. Every example comes from **this codebase**, with real file paths.

> **Last checked against the code:** October 2026 (commit `de268bf`). If a line number is a
> little off, search for the function name instead. Names move less than line numbers.

---

## The one idea everything hangs on

> **Almost everything in this app is a round trip: the browser asks the server a question,
> the server answers, the screen updates.**

```
  YOU click something
        │
        ▼
  BROWSER (Next.js / React)  ──── HTTP request ────►  SERVER (Django, run by daphne)
   frontend/src/...                                    api/ + backend/
        ▲                                                   │
        │                                                   ▼
        └──────────── JSON response ◄──────────────  DATABASE (SQLite in dev, Postgres live)
```

If you can follow **one** round trip all the way through (which files run, in what order),
you can debug almost anything here. Lesson 04 walks two of them. Lesson 05 covers the cases
that *aren't* a simple round trip: slow AI jobs that run in the background, and live
updates pushed to the screen.

---

## The learning path

Budget 30–45 minutes per lesson. **Keep the code open in your editor** and look at every
file as it comes up.

### Part 1: Find your way around

| # | Lesson | After it you can… |
|---|--------|-------------------|
| 01 | [The Big Picture](01-the-big-picture.md) | Name the five programs that make up ARASE and where each kind of file lives |
| 02 | [Frontend Tour](02-frontend-tour.md) | Read a Next.js page top to bottom and find where it calls the backend |
| 03 | [Backend Tour](03-backend-tour.md) | Follow a request through Django: URL → view → service → model → database |

### Part 2: Follow the thread

| # | Lesson | After it you can… |
|---|--------|-------------------|
| 04 | [Trace a Feature](04-trace-a-feature.md) | **Trace any feature end to end** (we do "log in" and "open a student") |
| 05 | [Background Jobs & Live Updates](05-background-jobs-and-live-updates.md) | Follow an IEP generation through Celery, Gemini, and the WebSocket back to the screen |
| 06 | [Reading Big Files](06-reading-big-files.md) | Find what you need in the 3,400-line `views.py` or the 4,400-line workspace page in seconds |

### Part 3: Fix things

| # | Lesson | After it you can… |
|---|--------|-------------------|
| 07 | [Debugging Playbook](07-debugging-playbook.md) | Narrow any bug to one file using the error, the Network tab, and the right terminal |
| 08 | [Making a Change Safely](08-making-a-change.md) | Add a field from the database to the screen without breaking anything |
| 09 | [Real Bugs Casebook](09-real-bugs-casebook.md) | Recognize bug patterns that already happened in this app, and how they were found |
| 10 | [How It Runs Live](10-production.md) | Explain what's different on Vercel + Railway and why "works locally" isn't enough |

### Reference (keep open while you work)

| | Page | Use it for |
|---|------|-----------|
| 11 | [Glossary](11-glossary.md) | Any word that makes your eyes glaze over (JWT, CSRF, serializer, channel layer…) |
| — | [Cheat Sheet](cheat-sheet.md) | One page: where things live, status codes, which terminal to check, restart rules |

**Only have one hour?** Read **01**, then **04**, then skim the **Cheat Sheet**.

---

## How to study this together

1. **Point, don't just read.** When a file is named, open it and put your cursor on the line.
   Reading *about* code without looking at it doesn't stick.
2. **Guess before you look.** Many lessons have a **Predict** box. Write your guess down
   first, then check. Being wrong and then seeing why is how this sticks.
3. **Do the exercises.** Each lesson ends with 2–4 short tasks. Answers are at the very
   bottom of each lesson, so you can check yourself without peeking by accident.
4. **You don't need to understand every line.** The goal is knowing *how to find* the part
   you need. Nobody holds 3,000 lines in their head.
5. **Teach it back.** After a lesson, one person explains the trace out loud to the other two.
   If you can explain it, you understand it.

There's also an interactive version inside the app at **`/learn`** (admin accounts) with a
clickable map, animated request traces, a symptom finder, and a quiz.

---

## Before you start: get the app running

You can't debug what you can't run. Each of you should be able to start ARASE on your own
machine. The full setup is in the root [README.md](../../README.md) ("Local Development").
Here's what's actually running when you develop:

| Terminal | Command | What it is | Restart it when… |
|---|---|---|---|
| 1 | `venv\Scripts\python.exe -m daphne -b 127.0.0.1 -p 8000 backend.asgi:application` | The Django backend at `http://localhost:8000` | **You change any `.py` file.** daphne doesn't reload by itself. |
| 2 | `cd frontend` then `npm run dev` | The Next.js frontend at `http://localhost:3000` | Almost never. It reloads on save. |
| 3 | `venv\Scripts\python.exe -m celery -A backend worker -l INFO --pool=solo` | The background worker (AI generation, translation) | **You change `api/tasks.py` or anything in `api/services/`.** |
| 4 | `redis-server` | The message queue Celery needs | It crashes or you reboot. |

> **The #1 local gotcha:** you fix a bug in Python, refresh the browser, and it's still
> broken. Nine times out of ten the code is fine and **daphne or Celery is still running the
> old version.** Restart them. (`python manage.py runserver --settings=backend.settings.dev`
> also works and *does* reload on save, because `daphne` is in `INSTALLED_APPS`. Running
> daphne directly is just what the team usually does. Know which one you started.)

When it's all running, open `http://localhost:3000`, log in with a dev account (ask a
teammate if you don't have one), and click around. Keep that tab open. You'll be inspecting
it constantly.

---

## What "good at reading code" actually means

It is **not** understanding every line at a glance. Even whoever wrote it can't do that. It
means:

- Knowing **where** a behavior probably lives, so you can jump straight there.
- Being able to **follow a thread** from a button click to the database and back.
- Turning an **error message** into "go look at *this* file."
- Knowing which **tool** (browser Network tab, daphne terminal, Celery terminal) answers
  which question.

That's a skill you can learn, not a talent. Let's go → [01-the-big-picture.md](01-the-big-picture.md)
