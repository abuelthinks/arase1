# Reading & Understanding the ARASE Codebase

A self-paced course for the ARASE team. You built this app fast (often with AI help).
This course teaches you to **read it, understand it, and fix it on your own** — so when
something breaks at 2am and there's no AI handy, you know exactly where to look.

It is written for people who can *write* code with help but get lost trying to *read* it.
No prior CS background assumed. Every example is from **your actual codebase**, not a
generic tutorial.

---

## The one idea everything hangs on

> **Almost everything in this app is a round trip: the browser asks the server a question,
> the server answers, the screen updates.**

```
  YOU click something
        │
        ▼
  BROWSER (Next.js / React)  ──── HTTP request ────►  SERVER (Django)
   frontend/src/...                                    api/ + backend/
        ▲                                                   │
        │                                                   ▼
        └──────────── JSON response ◄──────────────  DATABASE (SQLite/Postgres)
                                                       db.sqlite3
```

If you can follow **one** of those round trips all the way through — which exact files run,
in what order — you can debug *anything* in this app. That skill is the whole goal of this
course. Lesson 04 walks two real round trips end to end. Everything before it is
preparation; everything after it is technique.

---

## The learning path

Read these in order. Each builds on the last. Budget ~30–45 min per lesson, and **keep the
codebase open in your editor** so you can look at every file as it's mentioned.

| # | Lesson | What you'll be able to do after |
|---|--------|----------------------------------|
| — | [README.md](README.md) (this file) | Understand the shape of the course |
| 01 | [01-the-big-picture.md](01-the-big-picture.md) | Explain what ARASE is, the frontend/backend split, and where every kind of file lives |
| 02 | [02-frontend-tour.md](02-frontend-tour.md) | Read a Next.js page top-to-bottom; know how URLs map to files and where API calls happen |
| 03 | [03-backend-tour.md](03-backend-tour.md) | Follow a request through Django: URL → view → serializer → model → database |
| 04 | [04-trace-a-feature.md](04-trace-a-feature.md) | **Trace any feature end-to-end** (we do "log in" and "view a student" together) |
| 05 | [05-reading-big-files.md](05-reading-big-files.md) | Navigate a 3,000-line file without reading the whole thing |
| 06 | [06-debugging-playbook.md](06-debugging-playbook.md) | Diagnose a bug systematically using the error message and the right tools |
| 07 | [07-glossary.md](07-glossary.md) | Translate every scary word in the stack into plain English |

If you only have one hour: read **01**, then **04**. Those two carry most of the value.

---

## How to study this (for all three of you)

1. **Don't just read — point.** As each file is named, open it. Put your finger (or cursor)
   on the line being discussed. Reading *about* code without looking at the code doesn't stick.
2. **Do the exercises.** Each lesson ends with 2–3 small tasks like "find the function that
   does X." They take 5 minutes and they're where the learning actually happens.
3. **It's fine to not understand everything.** Your goal isn't to memorize the code — it's to
   know *how to find* the part you need. Nobody holds 3,000 lines in their head.
4. **Teach each other.** After a lesson, one person explains the trace out loud to the other
   two. If you can explain it, you understand it.

---

## Before you start: get the app running locally

You can't debug what you can't run. Make sure each of you can start ARASE on your own machine
following the root [README.md](../../README.md) ("Local Development" section). The short version:

- **Backend:** activate the Python virtualenv, then `python manage.py runserver` (serves the API at `http://localhost:8000`).
- **Frontend:** `cd frontend`, then `npm run dev` (serves the UI at `http://localhost:3000`).

When both are running, open `http://localhost:3000`, log in, and click around. Keep that
browser tab open while you study — you'll be inspecting it constantly.

---

## A note on what "good at reading code" actually means

It is **not** understanding every line at a glance. Even the person who wrote this app can't
do that. Being good at reading code means:

- Knowing **where** a given behavior is likely to live, so you can jump straight to it.
- Being able to **follow a thread** from a button click to the database and back.
- Reading an **error message** and translating it into "go look at *this* file."
- Knowing which **tool** (browser console, Network tab, Django traceback) answers which question.

That's a learnable skill, not a talent. This course teaches it. Let's go → [01-the-big-picture.md](01-the-big-picture.md)
