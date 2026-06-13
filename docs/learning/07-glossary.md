# Lesson 07 — Plain-English Glossary

Not a lesson to read front-to-back — a **dictionary to come back to** whenever a word in the
code makes your eyes glaze. Each entry: what it means in plain words, and where it shows up in
ARASE so you can see a real one.

Grouped: **Web basics → Frontend → Backend → Infrastructure.**

---

## Web basics

**Client / Server** — The *client* is the program asking for things (here: the browser running
your Next.js app). The *server* is the program answering (here: Django). "Client-side" = happens
in the browser; "server-side" = happens on the backend.

**Frontend / Backend** — Frontend = the client-side UI code (`frontend/`). Backend = the
server-side logic + data (`api/`, `backend/`).

**HTTP request / response** — One round trip. The browser sends a *request* ("GET me student 5's
profile"); the server sends back a *response* (the data, plus a status code). Your whole app is
thousands of these.

**Method / verb** — The *kind* of request: **GET** (read), **POST** (create), **PATCH/PUT**
(update), **DELETE** (remove). In Django views, the method name matches: `def get(...)`,
`def post(...)`.

**Endpoint / route / URL** — An address the backend answers at, e.g. `/api/students/5/profile/`.
Defined in `api/urls.py`. "Hit an endpoint" = send a request to that URL.

**API** — The set of endpoints the backend offers. ARASE's API is everything under `/api/`.

**JSON** — The text format data travels in: `{"first_name": "Sam", "grade": "3"}`. The frontend
sends and receives JSON; serializers produce it on the backend.

**Status code** — The 3-digit verdict on a response: 200 OK, 201 Created, 400 Bad Request, 401
Unauthorized, 403 Forbidden, 404 Not Found, 500 Server Error. (Full meanings: Lesson 06.)

**Header** — Metadata attached to a request/response (content type, cookies, the CSRF token).
You'll see `config.headers['X-CSRFToken'] = ...` in `lib/api.ts`.

**Payload / body** — The actual data sent with a request, e.g. `{ email, password }` on login.

**Cookie** — A small piece of data the browser stores and sends back automatically. ARASE keeps
your login token in cookies (see *HttpOnly*, *JWT*).

**CRUD** — Create, Read, Update, Delete — the four basic data operations. A DRF `ModelViewSet`
gives you all four for one model in a few lines.

---

## Frontend

**Next.js** — The React framework your frontend is built on. Its biggest feature here: the **App
Router**.

**App Router** — Next.js's rule that **folders under `src/app/` map to URLs**, and `page.tsx` is
the screen for that URL. `[id]` in a folder name captures a dynamic part of the URL. (Lesson 02.)

**React** — The library for building UIs out of components. Core idea: *describe what the screen
should look like for the current data; React updates the DOM when the data changes.*

**Component** — A function that returns a piece of UI (JSX). Your pages and the things in
`components/` are all components. Always functional (no class components — your team rule).

**JSX** — The HTML-looking syntax inside a component's `return (...)`. `{value}` injects a JS
value; `cond && <Thing/>` shows `<Thing/>` only when `cond` is true.

**Props** — The inputs you pass to a component, like function arguments:
`<Badge color="red" />`. The component reads them to decide what to render.

**State** — A component's internal, changeable data, created with `useState`. Changing it
re-renders the component. The `data / loading / error` trio on most pages is state. (Lesson 02.)

**Hook** — A special function starting with `use…` that adds a capability to a component:
`useState` (memory), `useEffect` (run code at moments), `useParams` (read the URL),
`useAuth` (current user). Custom ones live in `hooks/`.

**`useEffect`** — "Run this code after render, and again when these dependencies change." Where
pages fetch data (`useEffect(() => fetch(), [deps])`).

**`useCallback`** — Wraps a function so it isn't recreated on every render (a performance/stability
detail). You can mostly read past it — focus on the function inside.

**Context** — React's way to share one value (like the logged-in user) with the whole app without
passing it down by hand. `AuthContext.tsx` is one. (Lesson 02 §6.)

**Provider** — The component that *supplies* a context's value to everything inside it.
`<AuthProvider>` in `layout.tsx` wraps the app so any page can call `useAuth()`.

**`"use client"`** — The line at the top of a file that says "run this component in the browser."
Needed for interactivity (state, effects, clicks). (Lesson 02 §2.)

**Server component vs client component** — Next.js can render some components on the server before
sending HTML. The interactive ones you'll debug are *client* components (`"use client"`). Don't
overthink this distinction early on.

**TypeScript** — JavaScript plus *type annotations* (`email: string`, `user: UserPayload | null`).
The types describe the shape of data and catch typos before you run. `.ts`/`.tsx` files.

**Type / Interface** — A named description of a data shape, e.g. the `ProfileData` interface at
the top of the student page lists exactly what the backend returns. Great free documentation —
read these to know a data shape without running anything.

**Axios** — The HTTP library your frontend uses to call the backend (your team rule: Axios, never
raw `fetch`). Configured once in `lib/api.ts` and reused as `api`.

**Interceptor** — Axios code that runs automatically on every request or response. Yours add the
CSRF token and handle 401s (the auto-logout). (Lesson 02 §7.)

**Sonner / toast** — The little pop-up messages ("Saved!", "Error"). `toast.success(...)` /
`toast.error(...)`. Rendered by `<AppToaster/>`.

**Tailwind** — The CSS framework where you style with class names like `flex flex-col h-screen`.
No separate CSS file per component; the classes *are* the styles.

**Environment variable** — A setting read from outside the code, like `NEXT_PUBLIC_API_URL`. On
the frontend, only ones prefixed `NEXT_PUBLIC_` are visible in the browser. Set in `.env`.

---

## Backend

**Django** — The Python web framework that is your backend.

**Django REST Framework (DRF)** — An add-on to Django for building JSON APIs. Gives you
`APIView`, `ViewSet`, serializers, permissions. Almost everything in `views.py` is DRF.

**View** — The code that handles a request to an endpoint. Two shapes here: `APIView` (you write
`get`/`post`) and `ViewSet` (handles a whole resource). (Lesson 03 §4.)

**APIView** — A view for one endpoint; you define the HTTP-method methods yourself.
`StudentProfileView` is one.

**ViewSet / ModelViewSet** — A view for a whole resource (list/create/retrieve/update/delete at
once). `StudentViewSet` is one. Wired up via a *router*.

**Router** — A DRF helper that auto-generates the family of URLs for a ViewSet from one line:
`router.register(r'students', StudentViewSet)`. (Lesson 03 §3.)

**Serializer** — The translator between database objects and JSON. Decides exactly which fields
the frontend sees (`fields = [...]`). (Lesson 03 §6.)

**ModelSerializer** — A serializer that reads its fields from a model automatically.
`StudentSerializer` is one.

**SerializerMethodField** — A serialized field that's *computed* (not stored in the DB). Its value
comes from a matching `get_<fieldname>` method. E.g. `has_parent_assessment`.

**Model** — A Python class that defines one database table; each attribute is a column.
`Student`, `User`, etc., in `models.py`. (Lesson 03 §5.)

**Field** — One column on a model: `CharField` (text), `DateField`, `IntegerField`,
`BooleanField`, `JSONField`, `ForeignKey`, etc.

**ForeignKey** — A field that points to one row in another table (a relationship). `StudentAccess.user`
points to a `User`.

**related_name** — The reverse handle for a ForeignKey, letting you go from the pointed-to side
back. `related_name='assigned_users'` lets you write `student.assigned_users`. (Lesson 03 §5 — it
decodes the permission queries.)

**QuerySet** — A (lazy) collection of database rows you can filter and order:
`Student.objects.filter(status='ENROLLED')`. Doesn't hit the DB until you use the results.

**ORM (`.objects`)** — "Object-Relational Mapper": lets you read/write the DB with Python instead
of SQL. `Model.objects.all() / .get() / .filter() / .create()`. Any `.objects` line touches the
database.

**Migration** — A recorded change to the database structure (add a table/column). You create them
with `python manage.py makemigrations` and apply with `migrate`. Files in `api/migrations/` are
auto-generated — don't hand-edit. (If you add a field to a model, the DB doesn't change until you
make + run a migration — a common "why isn't my new field there?" gotcha.)

**Middleware** — Code that runs on *every* request before/after the view (auth, security, CORS).
Configured in `settings/base.py`. You rarely edit it, but it's why `request.user` is already set
by the time your view runs.

**`permission_classes`** — The list on a view that gates access: `[IsAuthenticated]` = must be
logged in. Role checks (`if user.role != 'ADMIN'`) add finer rules inside the method.

**`request` / `request.user`** — `request` is everything about the incoming call (data, headers,
who). `request.user` is the logged-in user, identified from the auth cookie. `request.data` is the
JSON body they sent.

**Authentication vs Authorization** — *Authentication* = "who are you?" (the login/cookie/JWT
machinery). *Authorization* = "are you allowed to do this?" (the role/permission checks). A 401 is
an authentication problem; a 403 is an authorization problem.

**JWT (JSON Web Token)** — A signed string that proves who you are without re-sending your
password. ARASE stores it in a cookie. Comes in two flavors: a short-lived **access** token (used
for normal requests) and a longer **refresh** token (used to get a new access token when it
expires).

**SimpleJWT** — The library that creates/validates those tokens. Your `auth_views.py` builds on it.

**HttpOnly cookie** — A cookie JavaScript *can't* read, so a malicious script can't steal your
token. ARASE's auth cookies are HttpOnly — that's why the frontend never sees the raw token.

**CSRF (token)** — A security check against forged requests. The frontend fetches a CSRF token and
sends it back on writes (`X-CSRFToken` header in `lib/api.ts`); the backend verifies it
(`enforce_csrf` in `authentication.py`). If writes suddenly 403, suspect CSRF.

**Service** — A plain Python module in `api/services/` holding business logic, called by views.
Where the real work lives (your views are "thin orchestrators"). (Lesson 03 §8.)

**Management command** — A custom `python manage.py <something>` command. Yours live in
`api/management/`. Used for one-off/admin tasks.

**Signal** — Django's "when X happens, also do Y" mechanism (e.g. after a model is saved). You may
or may not use these; if you see `@receiver` or `post_save`, that's a signal.

---

## Infrastructure / the rest of the stack

**SQLite / PostgreSQL** — The database. In dev it's SQLite (the single `db.sqlite3` file); in prod
it's PostgreSQL on Railway. Same Django code talks to both via the ORM.

**Settings (`base/dev/prod`)** — `backend/settings/base.py` holds shared config; `dev.py` and
`prod.py` override per environment (SQLite vs Postgres, console vs real email, etc.). Which one
loads is set by an environment variable.

**Virtualenv (`venv/`)** — An isolated Python environment with this project's exact packages, so
it doesn't clash with other projects. You "activate" it before running backend commands.

**Celery** — Runs slow jobs in the background so the web request can return fast (e.g. AI
generating a document). Tasks are defined in `api/tasks.py`. Optional in dev.

**Redis** — An in-memory data store Celery and the WebSocket layer use as a message broker.
Optional in dev unless you're running those features.

**Background task / job** — Work done outside the request (via Celery) because it's too slow to
make the user wait. The frontend often polls a "task status" endpoint to know when it's done
(`/api/tasks/<id>/status/`).

**WebSocket** — A *persistent, two-way* connection (unlike one-shot HTTP requests) used for live
updates — your notification bell and real-time refresh. The browser side is in `RealtimeProvider`/
`realtime.ts`; the server side is `consumers.py`.

**Django Channels** — The library that adds WebSocket support to Django.

**Consumer** — The WebSocket equivalent of a view: handles a live connection. In `api/consumers.py`.

**ASGI / WSGI** — How the web server runs your Django app. **WSGI** (`wsgi.py`) handles plain
HTTP; **ASGI** (`asgi.py`) also handles async/WebSockets. ARASE uses ASGI (Daphne) because of the
real-time features.

**AWS S3 / django-storages** — Cloud file storage for prod (generated docs, uploads). In dev,
files just go to the local `media/` folder instead.

**Gemini / Ollama** — The AI that generates IEPs and reports. Gemini is Google's cloud model;
Ollama runs a model locally (offline). Selected by an environment variable; logic in
`api/services/gemini_service.py` / `llm_service.py`.

---

That's the whole vocabulary. When a term here finally "clicks" by seeing it in your own code,
you've turned a scary word into a tool. ← back to the [course index](README.md).
