# Lesson 09: Real Bugs Casebook

**You'll be able to:** recognize bug *patterns* that already happened in ARASE, and know the
first place to look when one shows up again.

**Time:** ~40 min · **Open:** a terminal for `git show <commit>`

Every case here is real. It happened in this app, and the commit that fixed it is in `git
log`. For each one: read the **symptom**, then *stop and guess* where you'd look before
reading on. Then check the fix yourself:

```bash
git show de268bf
```

The commit messages are written to explain *why*, so they're worth reading in full.

---

## Case 1: "Login works, but every dashboard is empty"

**Commit:** `de268bf` · **Where it showed up:** production only

**Symptom:** You could log in fine, but dashboards loaded with no data. No red error on
screen.

**Clues you'd have seen:** Network tab full of **301** redirects bouncing between the same
URLs, over and over, for every data request. Auth requests (`/api/auth/token/`, `/me/`) were
fine.

**What was wrong:** In production the browser calls the Vercel site, and
`next.config.ts` forwards `/api/*` to Railway (Lesson 10). The rewrite rule
`/api/:path*` → `.../api/:path*` **dropped the trailing slash**. Django has `APPEND_SLASH`
on: it answered `/api/students` with "301, go to `/api/students/`". The browser went there,
Vercel stripped the slash again, Django redirected again… forever.

Why did login still work? Look at `backend/urls.py`: the auth routes are listed **twice**,
with and without a slash (`api/auth/token` *and* `api/auth/token/`). The data routes in
`api/urls.py` only have the slash version.

**The fix:** one character in `frontend/next.config.ts`:
```ts
// :path* drops the trailing slash; Django needs it or it 301s back here in a loop.
destination: `${baseUrl}/api/:path*/`,
```

**The pattern:** *"Some requests work and others don't" → find what's different between
them.* Here it was the slash. Also: **a 301 loop in the Network tab = a URL rewriting
problem**, not a code bug.

---

## Case 2: "Login fails in incognito and on Safari"

**Commit:** `c1362d8` · **Where:** production only

**Symptom:** Login worked in normal Chrome. In incognito or Safari, you clicked Sign In and
just… stayed logged out. Sometimes it went to the dashboard and bounced back to `/login`.

**Clues:** `POST /api/auth/token/` returned **200** with `Set-Cookie` headers. But
DevTools → Application → Cookies showed **no `access_token`**. The next request
(`/api/auth/me/`) got **401**.

**What was wrong:** The frontend lived on `*.vercel.app`, the backend on
`*.railway.app`, which are **different sites**. Cookies set by Railway were **third-party
cookies** from the page's point of view. Incognito and Safari block those by default. The
server set the cookie; the browser threw it away.

**The fix:** make the browser talk only to its own site. In production, `api.ts` now uses an
empty `baseURL` (same site), and `next.config.ts` forwards `/api/*` to Railway behind the
scenes. Cookies are now **first-party**. (This is the rewrite that caused Case 1!)

But **WebSockets can't go through that forwarding**, so they still connect to Railway
directly, and that connection doesn't get the cookie anymore. So a new endpoint,
`/api/auth/ws-ticket/` (`WsTicketView` in `auth_views.py`), hands out a **60-second token**,
and `buildWsUrl()` in `api.ts` passes it as `?token=...`.

**The pattern:** *"Works in one browser, not another" → cookies, storage, or privacy
settings.* Check the **Application → Cookies** tab before reading any code. Also: **fixes
create new edge cases.** This fix directly led to Case 1.

---

## Case 3: "Parents got a red 'IEP generation failed' toast"

**Commit:** `8b4b792`

**Symptom:** When an AI generation failed (e.g. a bad API key), the *family* saw a red error
toast about it. An internal problem, shown to the wrong people.

**What was wrong:** In `api/tasks.py`, the failure path called `create_activity_event(...)`
with `student=student` and no `visibility`. Look at `create_activity_event` in
`realtime_service.py`:
```python
resolved_visibility = visibility or ("STUDENT_TEAM" if student else "ADMINS")
```
A student was attached, so it defaulted to **`STUDENT_TEAM`**, and `_broadcast` sends those
to every user with a `StudentAccess` row for that student. **Parents included.**

**The fix:** one helper, `_notify_generation_failed`, used by all three generation tasks. It
keeps the student (for context) but forces `visibility='ADMINS'`, and sends it directly to
the staff member who clicked, who might not be an admin.

**The pattern:** *Defaults are decisions.* A function that "picks a sensible default" can
pick the wrong one in a case nobody thought about. When something reaches the wrong
people, read how *who gets it* is decided, and look for a default.

---

## Case 4: "Every deploy fails its healthcheck"

**Commits:** `9865d5e` and `222326a` · **Where:** Railway deploys

**Symptom:** The app built fine, but Railway marked every deploy as **failed**. It never
went live.

**What was wrong, part 1 (`222326a`):** Railway checks `/api/health/` with the header
`Host: healthcheck.railway.app`. Django only answers hosts listed in `ALLOWED_HOSTS`;
anything else gets **400 DisallowedHost**. The healthcheck host wasn't listed.

**Part 2 (`9865d5e`):** Production redirects HTTP to HTTPS, except for paths in
`SECURE_REDIRECT_EXEMPT`. The patterns were `r'^/api/'` and `r'^/$'`. But Django matches
them against the path **without the leading slash** (`api/health/`), so `^/api/` never
matched. The healthcheck (plain HTTP, internal) got a **301** to HTTPS and counted it as a
failure.
```python
# SecurityMiddleware matches these against request.path with the leading slash
# stripped, so patterns must not start with one — '^/api/' silently never matches.
SECURE_REDIRECT_EXEMPT = [r'^api/', r'^$']
```

**The pattern:** *Settings that "silently never match" are the worst bugs*: no error, just
nothing happening. When a setting seems ignored, **check the exact format the framework
expects** in the docs. Also: `prod.py` code only runs in production. Locally you'd never see
this.

---

## Case 5: "pip can't install the requirements"

**Commit:** `e7855a9` · **Where:** deploy build

**Symptom:** The build failed with `InvalidRequirement` on the **first line** of
`requirements.txt`. The line looked perfectly normal.

**What was wrong:** The file had been saved with a **UTF-8 BOM**: an invisible marker some
Windows editors put at the very start of a file. pip read it as part of the first package
name.

**The fix:** re-save the file as plain UTF-8 (no BOM).

**The pattern:** *"The line looks fine but the error says it's wrong" → invisible
characters.* BOMs, tabs vs. spaces, Windows line endings (`\r\n`). In VS Code, the status bar
(bottom right) shows the file's encoding. Click it to change. On Windows, PowerShell's
`Set-Content` can add a BOM, so watch out when writing files from scripts.

---

## Case 6: "I fixed the validation but still get the old 400"

**Where:** local development, more than once

**Symptom:** Changed a check in `views.py`, `python manage.py check` passed, but the API
still returned the *old* error.

**What was wrong:** Nothing in the code. **daphne was still running the old version.** It
doesn't reload on file changes. Same for the Celery worker with tasks and services.

**The pattern:** *"My fix didn't work" → first prove the new code is running.* Add a
`print("NEW CODE")` at the top of the function. Not printed? Restart. This is why Lesson 07
starts with Step 0.

---

## Case 7: "Two specialists editing a form together get 429s"

**Commit:** part of `a35b4f0`

**Symptom:** During collaborative form editing, after a few minutes, every page load failed
with **429 Too Many Requests**.

**What was wrong:** DRF's `UserRateThrottle` limits requests per user per minute. It was 200.
Collaborative editing is chatty: section autosaves, peer syncs, live refreshes all count.
Two active specialists blew through it.

**The fix:** raise it to 600/min, overridable with `USER_THROTTLE_RATE` (see the comment in
`backend/settings/base.py`). Dev has throttling turned off entirely, which is why it only
showed up live.

**The pattern:** *"Works for a while, then everything fails" → a limit*: rate limits,
connection limits, memory, quotas (Gemini has them too). Note **dev ≠ production**: dev
disables throttling.

---

## Case 8: "Too many database connections"

**Commit:** `dec5726` · **Where:** production, when it was on Supabase

**Symptom:** Errors like `EMAXCONN`: the database refusing new connections.

**What was wrong:** The database sat behind a **connection pooler** with a limit. Django was
keeping connections open (`conn_max_age`) and each deploy started extra processes. Together
they used up every slot.

**The fix:** in `prod.py`, `conn_max_age` defaults to `0` (close after each request),
overridable with `DB_CONN_MAX_AGE`. Also stopped running `migrate`/`collectstatic` on every
process start.

**The pattern:** another *limit*. Also: the comments in `prod.py` explain *why* each odd
setting is there. **Read the comments before "cleaning up" a strange setting.** It's
probably there because of a bug like this.

---

## The patterns, collected

| If you see… | Think… | First look at |
|---|---|---|
| Some requests work, similar ones don't | What's *different* between them? | the two URLs/payloads side by side |
| 301s looping in Network | URL rewriting / trailing slash | `next.config.ts`, `APPEND_SLASH`, `urls.py` |
| Works in one browser, not another | cookies / privacy settings | DevTools → Application → Cookies |
| Reaches the wrong people | a default deciding *who* | visibility / permission defaults |
| Setting seems ignored, no error | wrong format, silently not matching | the framework docs for that exact setting |
| "Line looks fine" but errors | invisible characters | file encoding in the VS Code status bar |
| Fix didn't take effect | old code still running | restart daphne / Celery |
| Fine for a while, then fails | a limit | throttles, connections, API quotas |
| Only broken in production | prod-only settings | `backend/settings/prod.py`, env vars (Lesson 10) |

---

## Exercises

1. **Read a real fix.** Run `git show 8b4b792`. Find the line that sets `visibility='ADMINS'`.
   Then open `realtime_service.py` and point to the line that *would have* chosen
   `STUDENT_TEAM`.
2. **Predict the failure.** Someone adds a new data route to `api/urls.py` *without* a
   trailing slash, like `path('reports-summary', ...)`. Locally it works. What could go wrong
   in production, and why?
3. **Find more history.** Run `git log --oneline --grep=fix | head -20`. Pick one fix you
   don't recognize, read its message, and write one sentence: symptom, cause, pattern.

---

## Answers

1. In `_notify_generation_failed` in `api/tasks.py`: `visibility='ADMINS'`. In
   `create_activity_event`: `resolved_visibility = visibility or ("STUDENT_TEAM" if student else "ADMINS")`.
   Passing `visibility` explicitly skips the default.
2. The production rewrite always adds a trailing slash (`/api/:path*/`), so the request
   arrives as `/api/reports-summary/`, which doesn't match `reports-summary` → **404**. The
   same thing would work locally because there's no rewrite in dev. Keep the trailing-slash
   convention.
3. Any answer works. The habit is the point.

Next → [10-production.md](10-production.md)
