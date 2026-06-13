# Lesson 06 — The Debugging Playbook

**Goal:** A repeatable method for when something breaks — plus the four tools that answer "what
actually happened." This is what you'll reach for at 2am with no AI around.

The big secret: **debugging is not guessing, and it's not staring at code hoping.** It's
*narrowing down* — cutting the problem in half until only one suspect remains. You already have
the map (Lesson 04's hops). This lesson is the method for walking it backwards from a symptom.

---

## The 5-step method (follow it in order, every time)

### Step 1 — Reproduce it, exactly
Find the precise clicks that trigger the bug, every time. A bug you can reproduce on demand is
half-solved. If it's intermittent, note what's different when it happens (which user/role? which
student? right after login?). **Don't start fixing until you can make it happen at will.**

### Step 2 — Read the error. Actually read it.
Beginners' #1 mistake is skimming past the error message. The error usually *tells you the file
and line*. Slow down and read it word by word. Three places errors show up — check all three:
- **Browser Console** (frontend errors / `console.log`)
- **Browser Network tab** (failed requests + status codes) ← usually the most useful
- **The Django terminal** (the one running `python manage.py runserver` — backend errors print here)

### Step 3 — Which half? Frontend or backend?
This single question cuts the problem in half. Open the **Network tab** (next section) and look
at the failing request:
- **No request was even sent** when you clicked → it's a **frontend** bug (the click handler,
  state, or a JS error stopped before calling the API). Check the Console.
- **Request was sent and came back red (4xx/5xx)** → it's a **backend** bug (or the frontend sent
  bad data). The status code says which — see the cheat sheet below.
- **Request succeeded (200) but the screen is wrong** → it's a **frontend** rendering bug, *or*
  the backend returned the wrong data. Click the request, read its Response, and compare to what
  the page expected.

### Step 4 — Narrow to one hop
You know the half; now find the exact hop using Lesson 04's chain. Work from the symptom toward
the cause. Don't read all the code — put **one `console.log` / `print`** at a hop and check the
value. Is it what you expected? Yes → move one hop later. No → you found the broken hop (or one
before it). This is *binary search on your own code.*

### Step 5 — Fix the smallest thing, then re-verify
Change one thing. Re-run your Step 1 reproduction. Did it fix it *and* not break anything else?
Resist "fixing" five things at once — you won't know which worked, and you might add new bugs.

---

## Tool 1 — Browser DevTools (press **F12** in the browser)

This is your most-used instrument for the frontend half. Two tabs matter:

### The Console tab
- Shows JavaScript errors (red) and anything your `console.log(...)` prints.
- A red error here usually means a page crashed. Read the **top line** (what went wrong) and the
  **file:line** next to it — click it to jump to the source.
- Classic one: `Cannot read properties of undefined (reading 'first_name')`. Translation: you
  did `data.student.first_name` but `data.student` was `undefined` — the data wasn't there yet,
  or the field name is wrong. (See "Common failures" below.)

### The Network tab (your single best debugging tool)
1. Open Network, then reproduce the bug. Each row is one request to the backend.
2. Find the relevant request (filter by `Fetch/XHR`; the name matches the URL, e.g. `profile`).
3. Read its **Status** column. That number is the backend's verdict (cheat sheet next).
4. Click the request to inspect:
   - **Headers** — the URL, the method, whether the auth cookie was sent.
   - **Payload / Request** — exactly what the frontend sent (great for "did I send the right data?").
   - **Response / Preview** — exactly what the backend sent back (the real data or the error message).

> If the page looks wrong, the Network tab settles the frontend-vs-backend question instantly:
> compare what came back in **Response** to what's on screen.

### HTTP status code cheat sheet (what they mean *in ARASE*)
| Code | Name | In your app it usually means |
|---|---|---|
| **200** | OK | Success (a GET worked). |
| **201** | Created | Success (a POST created something — new student, etc.). |
| **204** | No Content | Success with nothing to return (often a DELETE). |
| **400** | Bad Request | The frontend sent invalid/missing data. The Response says which field. (Serializer validation failed.) |
| **401** | Unauthorized | Not logged in / session expired. `api.ts` will try to refresh once, then bounce you to `/login`. |
| **403** | Forbidden | Logged in but **not allowed** — almost always a *role* check (`"Only admins can..."`). |
| **404** | Not Found | URL doesn't exist, OR (very common here) the object exists but you're not assigned to it — see `StudentProfileView`. |
| **500** | Server Error | The backend **crashed**. There's a Python traceback waiting in the Django terminal. Go read it (Tool 2). |

Memorize 400/401/403/404/500 — they tell you *exactly* which kind of problem and which half to
look in.

---

## Tool 2 — The Django terminal traceback (for 500s)

When you see a **500**, the real story is in the terminal running `runserver`. Django prints a
**traceback** — a stack of files showing how the code got to the crash.

**Read a Python traceback from the BOTTOM up.** The structure is:
```
Traceback (most recent call last):
  File ".../views.py", line 1331, in get
    student = Student.objects.get(id=student_id, ...)
  File ".../django/db/models/query.py", line ...,    ← framework code (usually not your bug)
    ...
api.models.Student.DoesNotExist: Student matching query does not exist.   ← THE ACTUAL ERROR
```
- The **last line** is *what* went wrong (the exception type + message).
- The **highest line that points at YOUR file** (`api/...`, not `django/...`) is *where* in your
  code it happened. Ignore the framework frames; zero in on your files.

So the recipe for any 500: go to the Django terminal → find the bottom error line → find the
top-most `api/...` frame → open that file:line. You're now standing on the bug.

---

## Tool 3 — `print()` / `console.log()` (the workhorse)

You don't need fancy tools to inspect a value — just print it.
- **Backend (Python):** drop `print("HERE student=", student, "user=", request.user.role)` inside
  a view or service. It appears in the **Django terminal** when that code runs. (Your code also
  has a real `logger` — `logger.info(...)` — used the same way.)
- **Frontend (TypeScript):** drop `console.log("data is", data)` in a component. It appears in the
  **browser Console**.

Use it to confirm reality at each hop (Step 4): *Is `student_id` actually `5` here? Is `data`
actually `null`? Did this line even run?* Half of all bugs are "the value isn't what I assumed."
Printing replaces assumption with fact. **Remove your prints when you're done** (your team
preference is minimal noise, and a recent commit literally cleaned up debug logging).

---

## Tool 4 — Breakpoints (when prints aren't enough)

A breakpoint **pauses** the program so you can inspect *everything* at that moment.
- **Frontend:** in DevTools → Sources, click a line number to set a breakpoint, or write
  `debugger;` in the code. When execution hits it, it freezes and you can hover any variable.
- **Backend:** VS Code can debug Django (Run & Debug panel). Simpler stop-gap: add
  `breakpoint()` on a line and run the server in a terminal — it drops into an interactive prompt
  there. Type a variable name to see its value; type `c` to continue.

Prints are faster for "what is this value"; breakpoints win for "let me poke around the whole
state at this exact moment."

---

## Common ARASE failures and where they come from

A field guide to bugs this specific app tends to produce, mapped to the file that owns them:

| Symptom | Most likely cause | Where to look |
|---|---|---|
| App keeps bouncing me to `/login` | 401 → refresh failed → forced redirect | `lib/api.ts` response interceptor; is the auth cookie present? (DevTools → Application → Cookies) |
| "All my saves fail" / 403 on POST/PATCH | Missing/stale **CSRF** token | `lib/api.ts` request interceptor; `api/authentication.py` `enforce_csrf` |
| 403 "Only admins can…" | Role check refused the action | the view's `if request.user.role != 'ADMIN'` (e.g. `StudentViewSet.create`) |
| 404 "Student not found or access denied" though it exists | User isn't assigned (no `StudentAccess` row) | `StudentProfileView.get` else-branch; `get_queryset` |
| Page blank, spinner forever | The `api.get` failed and `loading` never reset, or `user` is null so the effect never fired | the page's `useEffect`/`fetch` function; Network tab |
| `Cannot read properties of undefined` | Reading a field before data arrived, or wrong field name | the JSX; compare to serializer `fields` / the service's returned dict |
| A field on screen is always blank | Backend doesn't expose it | serializer `fields = [...]` — is the field listed? |
| Nothing happens when I click | JS error before the API call, or handler not wired | browser Console; is `onClick`/`onSubmit` actually set? |
| 500 on a specific action | Backend crashed | Django terminal traceback (Tool 2) |
| Real-time/notifications not updating | WebSocket/Redis not running in dev | `consumers.py`, `RealtimeProvider`; is Redis up? (it's optional in dev) |

---

## Worked debugging session (start to finish)

**Report:** "When I open a student, it spins forever and never loads."

1. **Reproduce:** open `/students/5`. Confirmed — endless spinner.
2. **Read errors / pick the tool:** open DevTools → Network. There's a request to
   `students/5/profile/` showing **status 403**.
3. **Which half:** request was sent and the backend rejected it (403) → **backend / permissions**,
   not a frontend rendering bug.
4. **Narrow to one hop:** 403 = forbidden = a role/permission check. From the cheat sheet and
   Lesson 04, that's `StudentProfileView`. Click the request → **Response** says
   `"Student not found or access denied."` (Actually a 404 path here — but say it were a 403 from
   another endpoint.) Open `StudentProfileView.get`. The else-branch requires the user be in
   `assigned_users`. `print("role", request.user.role)` confirms the user is a `TEACHER` not
   assigned to student 5.
5. **Fix the smallest thing:** the *code* is correct — this is a *data* problem: the teacher was
   never assigned. The real fix is to assign them (admin → assign-teacher), not to change the
   permission check. Re-test: assign, reload, profile loads. Also worth a frontend tweak: the
   spinner should stop and show the error on failure — check the `finally { setLoading(false) }`
   actually runs (it does here) and that `error` is rendered.

Notice you never "read the whole codebase." You read **one request's status**, **one Response
body**, and **one view method.** That's the job.

---

## When to still use AI (and how to stay the one in control)

You're learning to be self-sufficient — but AI is a fine *tool* when you drive. The healthy
pattern: **you** do Steps 1–3 (reproduce, read the error, pick the half) yourself, *then* if
stuck, paste the **exact error + the one file you suspect** and ask "why would this produce a
403?" You learn nothing from "my app is broken, fix it"; you learn a lot from "I've narrowed it
to this view and this 403 — what am I missing?" Same AI, opposite outcome.

---

## Exercises

1. **Tool familiarity.** With the app running, open DevTools → Network, reload the dashboard, and
   find one request. Read its Status, Request payload, and Response. Write down the URL and what
   came back. (Just get comfortable looking.)
2. **Cause a 500 on purpose.** In a view you understand (e.g. add a line `1/0` at the top of
   `StudentProfileView.get`), reload the page, and practice reading the traceback in the Django
   terminal: name the exception and the file:line. Then remove the line.
3. **Trace a symptom backward.** Pick any row in the "Common failures" table, and *without
   fixing anything*, find the exact file and line in your codebase that the symptom points to.
   You're rehearsing Step 4.

Next → [07-glossary.md](07-glossary.md)
