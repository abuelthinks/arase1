# Lesson 07: The Debugging Playbook

**You'll be able to:** take any "it's broken" report and narrow it to one file, using a
fixed method and the right tool for each question.

**Time:** ~45 min · **Best done:** with the app running and DevTools open (F12 in the browser)

The big secret: **debugging isn't guessing, and it isn't staring at code hoping.** It's
*narrowing down*: cutting the problem in half until one suspect is left. You already have
the map (Lesson 04's hops). This lesson is the method for walking it backwards from a
symptom.

---

## Step 0: Is the code you're testing actually running?

Before anything else, especially if "I already fixed this":

- Changed a **`.py` file**? **Restart daphne.** It doesn't reload by itself.
- Changed **`api/tasks.py` or `api/services/*`**? **Restart the Celery worker** too.
- Changed a **model**? Run `python manage.py makemigrations` and `migrate`, then restart.
- Changed **frontend** code? It hot-reloads. If it looks stuck, hard refresh (`Ctrl+Shift+R`).

This one step solves a surprising share of "it still doesn't work."

---

## The 5-step method (in order, every time)

### Step 1: Reproduce it exactly
Find the exact clicks that cause it, every time. Note **who** (which role, which account),
**which student**, and **what you expected vs. what happened.** If it's intermittent, note
what's different when it happens. Don't start fixing until you can make it happen on demand.

### Step 2: Read the error. Actually read it.
The #1 beginner mistake is skimming past the error. It usually tells you the file and line.
Errors show up in **four** places. Check the right one:

| Where | What shows up there |
|---|---|
| **Browser Console** | Frontend crashes, your `console.log`s |
| **Browser Network tab** | Every request, its status code, what was sent, what came back |
| **daphne terminal** | Backend crashes (tracebacks), your `print`s from views and services |
| **Celery terminal** | Background-job crashes, `print`s from tasks and anything they call |

### Step 3: Which program?
Open the **Network tab**, reproduce, and look at the request:
- **No request sent** when you clicked → **frontend** bug (handler not wired, JS error before
  the call, or an effect that never fired). Check the Console.
- **Request sent, came back red (4xx/5xx)** → **backend** refused or crashed. The status code
  says which (cheat sheet below).
- **Request OK (2xx) but the screen is wrong** → compare **Response** to the screen. Data
  wrong in Response → backend (service/serializer). Data right in Response → frontend
  rendering.
- **202, then nothing ever happens** → **background job**. Check the Celery terminal. Is the
  worker even running?

### Step 4: Narrow to one hop
You know the program. Now find the hop using Lesson 04's chain. Put **one**
`console.log` / `print` at a hop and check the value. As expected? Move one hop later. Not as
expected? The bug is at this hop or the one before. This is *binary search on your own code.*

### Step 5: Fix the smallest thing, then check again
Change one thing. Re-run Step 1 exactly. Fixed, *and* nothing else broke? Resist fixing five
things at once. You won't know which one worked.

---

## Tool 1: Browser DevTools (F12)

### Console tab
- Red errors = frontend crashes. Read the **top line** (what) and the **file:line** link
  (where). Click the link.
- Classic: `Cannot read properties of undefined (reading 'first_name')`. You wrote
  `data.student.first_name` but `data.student` was `undefined`: the data hadn't arrived, or
  the key name is wrong.

### Network tab (your best tool)
1. Open it, then reproduce. Each row is one request.
2. Filter by **Fetch/XHR**. Type part of the URL (e.g. `profile`) in the filter box.
3. Read the **Status** column.
4. Click the row:
   - **Headers**: the full URL, the method, and whether cookies were sent (`Cookie:` line).
   - **Payload**: exactly what the frontend sent. ("Did I send the right data?")
   - **Response**: exactly what came back. (The real data, or the error message.)
5. For live updates, filter by **WS**, click the `realtime/` row, open **Messages**. You'll
   see each pushed event arrive.

### Application tab → Cookies
Look for `access_token`, `refresh_token`, and `csrftoken`. Missing auth cookies explain
almost every "keeps logging me out" bug.

### Status codes: what they mean *in ARASE*

| Code | Name | Here it usually means | Where to look |
|---|---|---|---|
| **200** | OK | Worked | (Response tab, if the data's wrong) |
| **201** | Created | A POST created something | |
| **202** | Accepted | A background job was **queued**, not finished | Celery terminal |
| **204** | No Content | Worked, nothing to return (often DELETE) | |
| **400** | Bad Request | Frontend sent missing/invalid data, or a guard said "not ready yet" | Response says which field; the view's guards; serializer validation |
| **401** | Unauthorized | Not logged in / token expired | `api.ts` will try one refresh, then send you to `/login`. Check cookies. |
| **403** | Forbidden | Logged in but **not allowed**: a role check, *or* "CSRF Failed" | Response text; the view's `role != ...` check; `api/authentication.py` |
| **404** | Not Found | URL doesn't exist, **or** the object exists but you're not on its team | `api/urls.py`; the view's query (`assigned_users__user=...`) |
| **429** | Too Many Requests | Throttled. Production limits users to 600/min (dev has no limit). | `REST_FRAMEWORK` in `backend/settings/base.py` |
| **500** | Server Error | The backend **crashed** | **daphne terminal** traceback (Tool 2) |
| **503** | Service Unavailable | Here: couldn't queue a background job | Is Redis running? |

Learn 400 / 401 / 403 / 404 / 500 by heart. Each one points at a different kind of problem.

---

## Tool 2: Reading a Python traceback (for 500s)

On a 500, the real story is in the **daphne terminal** (or the **Celery terminal** for a
background job). Django prints a **traceback**: the chain of calls that led to the crash.

**Read it from the bottom up:**
```
Traceback (most recent call last):
  File ".../django/core/handlers/exception.py", line 55, in inner     ← framework, skip
  ...
  File "C:\...\030625\api\views.py", line 1447, in get                 ← YOUR CODE: where
    student = Student.objects.get(id=student_id, ...)
  File ".../django/db/models/query.py", line 649, in get              ← framework, skip
    raise self.model.DoesNotExist(
api.models.Student.DoesNotExist: Student matching query does not exist.   ← WHAT went wrong
```
- The **last line** is *what* broke (exception type + message).
- The **lowest line that points at your files** (`api\...`, not `django\...` or `site-packages`)
  is *where* in your code. Open that file at that line.

> **Common exception names, translated:**
> `DoesNotExist` = `.get()` found nothing · `KeyError: 'x'` = a dict had no key `'x'` ·
> `AttributeError: 'NoneType' object has no attribute 'y'` = something was `None` that you
> expected to be an object · `IntegrityError` = the database refused (duplicate, or a
> required field missing) · `OperationalError: no such column` = you forgot to `migrate`.

---

## Tool 3: `print()` / `console.log()`

You don't need fancy tools to see a value. Print it.
- **Python:** `print("HERE", student_id, request.user.role)`. Shows in the daphne terminal
  (or Celery's, if it runs in a task). The code also uses `logger.info(...)` / `logger.error(...)`,
  which work the same way.
- **TypeScript:** `console.log("data is", data)`. Shows in the browser Console.

Use it to replace an assumption with a fact at each hop: *Is `student_id` really 5 here? Is
`data` actually `null`? Did this line even run?* Half of all bugs are "the value isn't what I
thought." **Remove your prints when done.**

---

## Tool 4: Breakpoints (when prints aren't enough)

A breakpoint **pauses** the program so you can look at everything at that moment.
- **Frontend:** DevTools → Sources, click a line number. Or write `debugger;` in the code.
- **Backend:** add `breakpoint()` on a line. When that line runs, the daphne terminal becomes
  an interactive prompt. Type a variable name to see it, `n` for next line, `c` to continue.
  (This freezes the server for everyone until you continue. Fine locally, never in production.)

Prints are faster for "what is this one value." Breakpoints win for "let me look at
everything right here."

---

## Tool 5: The Django shell (look at the data directly)

Sometimes the code is fine and the **data** is the surprise. Ask the database directly:

```bash
python manage.py shell
```
```python
from api.models import Student, StudentAccess, User
s = Student.objects.get(id=5)
s.status
StudentAccess.objects.filter(student=s).values('user__email', 'user__role')
User.objects.get(email='someone@email.com').role
```

"Is this teacher actually assigned to this student?" takes ten seconds this way. **Read
freely; be very careful about changing data here.** There's no undo.

---

## Common ARASE failures and where they come from

| Symptom | Most likely cause | Look at |
|---|---|---|
| Fixed it, but it's still broken | **daphne/Celery running old code** | Step 0: restart |
| Keeps bouncing me to `/login` | 401 → refresh failed → redirect | `api.ts` response interceptor; cookies in Application tab |
| Saves fail with 403 "CSRF Failed" | CSRF header/cookie mismatch | `api.ts` request interceptor; `enforce_csrf` in `api/authentication.py` |
| 403 "Only admins can…" | Role check refused | the view's `if request.user.role != 'ADMIN'` |
| 404 "Student not found or access denied" | User isn't on the team (no `StudentAccess`) | `StudentProfileView.get`; check data in the shell |
| Spinner forever, **no request** in Network | Effect never fired (`user` null, missing `id`) | the page's `useEffect` condition |
| Spinner forever **after a 202** | Celery worker not running, or stuck retrying | Celery terminal |
| "Background worker is unavailable" (503) | Redis is down | start `redis-server` |
| "IEP generation failed" | AI error: bad API key, quota, garbled JSON | Celery terminal traceback; `llm_service.py` |
| Other tabs don't live-update after AI jobs (local only) | No `REDIS_URL` → in-memory channel layer | Lesson 05 §4 |
| Field always blank on screen | Backend never sends it | serializer `fields`, or the hand-built dict (`MeView`) |
| `Cannot read properties of undefined` | Reading data before it arrived, or wrong key | the JSX; compare to Network → Response |
| `no such column` / `no such table` (500) | Model changed, migration not applied | `makemigrations` + `migrate` |
| Works locally, broken live | Different settings: cookies, proxy, hosts | Lesson 10 |

---

## Worked session 1: "The student page won't load"

**Report:** "When I (a teacher) open a student, I get *Student not found or access denied*."

1. **Reproduce:** log in as that teacher, open `/students/12`. Same message.
2. **Read the error / pick a tool:** Network → `profile/` request → **404**, Response:
   `{"error": "Student not found or access denied."}`.
3. **Which program:** request went out, backend refused → **backend**.
4. **Narrow:** `Ctrl+Shift+F` the message → `StudentProfileView.get`. A 404 here comes from
   the `else` branch: no row matched `id=12, assigned_users__user=<teacher>`. Check the data:
   ```python
   StudentAccess.objects.filter(student_id=12).values('user__email')
   ```
   The teacher isn't listed.
5. **Fix the smallest thing:** the *code* is right. It's a *data* problem: the teacher was
   never added to the team. An admin assigns them (team settings on the student). Reload →
   works. **Don't** "fix" it by loosening the permission check.

You never read the whole codebase. You read one status, one Response body, and one view.

---

## Worked session 2: "Generate IEP spins forever"

1. **Reproduce:** admin clicks Generate IEP. Spinner, no error, for minutes.
2. **Network:** `generate/` → **202** with a `task_id`. Then `tasks/<id>/status/` every 3
   seconds, each `{"status": "PENDING"}`.
3. **Which program:** 202 + endless PENDING → **background job**. The backend did its part.
4. **Narrow:** look at terminal 3. **There's no Celery worker running.** (If one *were*
   running, you'd see `Task api.tasks.generate_iep_task[...] received` and then either
   success or a traceback.)
5. **Fix:** start the worker. The queued job is still in Redis, so it gets picked up and
   finishes. The open page's polling catches the `SUCCESS`.

---

## When to still use AI (and how to stay in control)

AI is a fine tool when **you** drive. Do Steps 0–3 yourself (restart, reproduce, read the
error, pick the program). *Then*, if stuck, paste **the exact error + the one function you
suspect** and ask a specific question: "This view returns 404 for a teacher who should see
this student. Here's the view and the StudentAccess rows. What am I missing?"

You learn nothing from "my app is broken, fix it." You learn a lot from "I've narrowed it to
this view and this 404."

---

## Exercises

1. **Get comfortable.** Network open, reload the dashboard. Pick one request and write down
   its URL, status, and one thing from its Response.
2. **Cause a 500 on purpose.** Add `1/0` as the first line of `StudentProfileView.get`.
   **Restart daphne**, reload a student page. In the daphne terminal: name the exception and
   the file:line. Remove the line and restart again.
3. **Find the socket.** Network → WS filter → click `realtime/` → Messages. In another tab,
   do something that creates an event (e.g., as admin, register a student). Watch the
   message arrive.
4. **Trace a symptom backwards.** Pick any row in the failures table and, without fixing
   anything, find the exact file and line it points to.

---

## Answers

2. `ZeroDivisionError: division by zero`, at `api\views.py`, the line inside
   `StudentProfileView.get`. If you didn't restart daphne, you saw nothing. That's Step 0
   in action.
3. You should see a JSON message with `"type": "activity.event"`, an `event` object, and a
   `refresh` list. (This works locally because `STUDENT_CREATED` is created inside daphne,
   not Celery.)

Next → [08-making-a-change.md](08-making-a-change.md)
