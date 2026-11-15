# Lesson 05: Background Jobs & Live Updates

**You'll be able to:** follow an IEP generation from the button, through the Celery worker
and Gemini, and back to the screen, and explain the two ways the screen finds out it's done.

**Time:** ~45 min · **Open:** [`frontend/src/app/admin/reports/page.tsx`](../../frontend/src/app/admin/reports/page.tsx),
[`api/tasks.py`](../../api/tasks.py), [`api/services/realtime_service.py`](../../api/services/realtime_service.py),
[`frontend/src/components/RealtimeProvider.tsx`](../../frontend/src/components/RealtimeProvider.tsx)

---

## 1. Why the simple round trip isn't enough

Lesson 04's round trips finish in under a second. Writing an IEP with AI can take **30
seconds or more**. If the backend did that inside the request:

- the browser would sit waiting, and might give up (time out),
- that server process couldn't answer anyone else meanwhile,
- if the AI call failed halfway, nobody would hear about it.

So ARASE splits slow work in two:

```
  1. "Please start"   browser ──► backend: queue the job, answer "202 Accepted, here's a task_id"   (fast)
  2. The work         Celery worker picks up the job, calls Gemini, saves the IEP                    (slow)
  3. "It's done"      the screen finds out, two ways at once:
                        a) POLLING:   the page asks "done yet?" every 3 seconds
                        b) PUSH:      the server sends a WebSocket message the moment it's saved
```

Three new pieces show up here:

| Piece | What it is | Where |
|---|---|---|
| **Celery** | A separate Python program (the "worker") that runs jobs from a queue | `api/tasks.py`, `backend/celery.py` |
| **Redis** | The queue between the backend and the worker. Also carries live messages between processes in production. | installed separately; `REDIS_URL` |
| **WebSocket** | A connection that stays open so the *server* can send to the browser without being asked | `api/consumers.py`, `RealtimeProvider.tsx` |

---

## 2. Trace C: Generate an IEP

**User action:** an admin clicks **Generate IEP** on a student's reports screen.

### Hop 1: The button
**File:** [`frontend/src/app/admin/reports/page.tsx`](../../frontend/src/app/admin/reports/page.tsx) → `handleGenerateIEP`
```tsx
const res = await api.post("/api/iep/generate/", {
  student_id: studentId,
  report_cycle_id: reportCycleId,
});
if (res.data.task_id) {
  pollTaskStatus(res.data.task_id,
    (result) => openGeneratedDocument("iep", result.doc_id),
    (err) => { setErrorMsg(err); setLoading(false); }
  );
} else {
  openGeneratedDocument("iep", res.data.iep_id);   // it already existed
}
```
Two possible answers: a `task_id` (job started) or an `iep_id` (an IEP for this cycle
already exists, so just open it).

### Hop 2: The view checks, then queues
**File:** [`api/views.py`](../../api/views.py) → `GenerateIEPView.post` (~line 2280)

Read it top to bottom. It's a stack of **guards**, each of which can stop the request early:

```python
if request.user.role != 'ADMIN':                       → 403 "Only admins can generate IEPs."
if not student_id or not report_cycle_id:              → 400
Student / ReportCycle not found:                       → 404
existing_iep found:                                    → 200 { iep_id }   (no new job)
no parent assessment, or specialist one not finalized: → 400 "...are required before generating an IEP."
```
Only if every guard passes:
```python
create_activity_event(event_type='REPORT_QUEUED', ...)          # tell live screens "queued"
try:
    task = generate_iep_task.delay(student_id, report_cycle_id, request.user.id)   # ← drop job in Redis
except Exception as exc:
    return Response({"error": "Background worker is unavailable. Start Redis and a Celery worker, then try again."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE)
return Response({"message": "IEP generation started.", "task_id": task.id}, status=status.HTTP_202_ACCEPTED)
```

**`.delay(...)` is the key.** It doesn't run the function. It writes "please run
`generate_iep_task` with these arguments" into Redis and returns at once with a task id.
**202 Accepted** means "got it, working on it," not "done."

> **Predict:** Redis is running, but nobody started the Celery worker. What does the admin
> see? (Answer at the bottom. This one really happens.)

### Hop 3: The worker picks it up
**File:** [`api/tasks.py`](../../api/tasks.py) → `generate_iep_task`

A *different program* now: the Celery worker you started in terminal 3. It's been watching
Redis, sees the job, and runs:
```python
@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def generate_iep_task(self, student_id, cycle_id, user_id=None):
    try:
        doc, iep_data = run_iep_generation(student_id, cycle_id)      # the real work
        record_document_version(doc, user, 'GENERATED')               # audit trail
        create_activity_event(event_type='REPORT_READY', ...)          # tell live screens "ready"
        notify_iep_finalized(doc.student, doc.id)                     # bell notifications
        return {'doc_id': doc.id, 'status': 'completed'}               # ← what polling will read
    except Exception as exc:
        _notify_generation_failed(student_id, "IEP generation failed", exc, 'IEP', user_id)
        raise self.retry(exc=exc)                                      # try again in 30s, up to 2 more times
```
Two things worth noticing:
- **Its `print`s and errors show up in the Celery terminal, not daphne's.** Different
  program, different terminal.
- **It retries.** A Gemini hiccup doesn't fail the whole thing right away.

### Hop 4: The service does the work
**File:** `api/services/iep_service.py` → `run_iep_generation`
1. Load the student and cycle. If an IEP already exists, return it (no duplicates).
2. `collect_iep_inputs(...)`: gather the parent assessment, specialist assessment, and
   diagnostic report text.
3. `generate_iep(...)` in `api/iep_generator.py`: build a long prompt, send it to the AI.
4. Render the PDF **first**, then create the `GeneratedDocument` row. (The comment explains
   why: anyone refreshing mid-generation sees either no IEP or a complete one, never half.)

### Hop 5: The AI call
`iep_generator._call_gemini` → `gemini_service.call_gemini_json` → `llm_service.call_json`.
`llm_service.py` reads `AI_PROVIDER`:

| `AI_PROVIDER` | What happens |
|---|---|
| `gemini` | Google Gemini only. Needs `GEMINI_API_KEY`. |
| `ollama` | A local model at `OLLAMA_BASE_URL`. Free and offline, but much weaker. |
| `auto` | Try Gemini; if it fails, fall back to Ollama. (The team's dev setting.) |

The AI must answer in JSON. `_parse_json_response` cleans it up (strips ``` fences). A
garbled answer fails here, and that's a common source of "generation failed."

### Hop 6a: The page finds out by POLLING
Back in `admin/reports/page.tsx`, `pollTaskStatus` has been asking every 3 seconds:
```tsx
const res = await api.get(`/api/tasks/${taskId}/status/`);
if (res.data.status === "SUCCESS")  { clearInterval(interval); onSuccess(res.data.result); }
else if (res.data.status === "FAILURE") { clearInterval(interval); onError(res.data.error || "Background task failed."); }
```
That hits `TaskStatusView` (`api/views.py`, ~line 2987), which asks Celery about the task
(`AsyncResult(task_id)`). Results are stored in the **database**
(`CELERY_RESULT_BACKEND = 'django-db'`), so the backend can read what the worker wrote. On
`SUCCESS`, `result` is the dict the task returned: `{'doc_id': ...}`. The page opens it.

### Hop 6b: The page finds out by PUSH (WebSocket)
At the same time, the `REPORT_READY` event from Hop 3 travels a completely different road:

```
tasks.py   create_activity_event('REPORT_READY', student=...)
              │  saves an ActivityEvent row, then after the DB commit:
              ▼
realtime_service._broadcast()
              │  picks "refresh targets" for this event type: dashboard, workspace, student, reports
              │  sends to channel-layer GROUPS:
              │     realtime_admins                  every admin's socket
              │     realtime_user_<id>               each user assigned to the student (if visibility = STUDENT_TEAM)
              ▼
consumers.RealtimeConsumer.realtime_event()   (running inside daphne, one per open browser tab)
              │  ws.send(JSON)
              ▼
RealtimeProvider.tsx   ws.onmessage
              │  dispatchRealtimeMessage(message)  → fires a browser event 'arase:realtime-event'
              │  showRealtimeToast(message)        → "IEP ready for ..." pop-up
              ▼
useRealtimeRefresh({ targets: ['reports', 'workspace', 'student'], onRefresh: fetchReportProfile })
              │  "is this event for a target I care about, and for my student?" → yes
              ▼
fetchReportProfile()   a normal api.get → the page refetches and shows the new IEP
```

The key design idea, written right in `RealtimeConsumer`'s docstring: **the WebSocket only
says "something changed." The REST API is still the source of truth.** Pages always refetch
with a normal `api.get`. They never trust data inside the push.

> **Why both?** Polling only helps the one tab that clicked the button. Push updates
> *everyone*: the other admin looking at the dashboard, the teacher's workspace. And polling
> is the safety net when push doesn't arrive (see §4).

---

## 3. How the WebSocket connects

[`RealtimeProvider.tsx`](../../frontend/src/components/RealtimeProvider.tsx) wraps every page
(Lesson 02 §5), so it opens **one** socket per tab:

1. `buildWsUrl('/ws/realtime/')` in `api.ts` first calls `GET /api/auth/ws-ticket/` for a
   **60-second token**, then builds `ws://localhost:8000/ws/realtime/?token=...`.
   (Why not the cookie? In production the page and the backend are on different domains and
   WebSockets can't go through the Vercel proxy. Lesson 09, case 2.)
2. daphne gets the connection. `backend/asgi.py` sends WebSocket traffic to
   `api/routing.py` → `RealtimeConsumer`.
3. `connect()` checks the token, then joins groups: `realtime_user_<my id>`, plus
   `realtime_admins` for admins.
4. If the socket drops, `onclose` reconnects after a delay.

Other sockets work the same way: `/ws/notifications/` (the bell, `NotificationConsumer`)
and the collaboration socket for shared form editing (`CollaborationConsumer`, used by
`hooks/useFormCollaboration.ts`).

---

## 4. The dev gotcha: two processes can't hear each other without Redis

Messages between groups go through the **channel layer**. Look at
[`backend/settings/dev.py`](../../backend/settings/dev.py):

```python
if not os.environ.get('REDIS_URL'):
    CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
```

"In memory" means **inside one program's memory**. daphne and the Celery worker are two
separate programs. So locally, without `REDIS_URL` in your `.env`:

| Event created in… | Reaches the browser? |
|---|---|
| a **view** (inside daphne), e.g. `STUDENT_CREATED`, `REPORT_QUEUED` | Yes. Same program as the sockets. |
| a **Celery task**, e.g. `REPORT_READY`, `REPORT_FAILED` | **No.** It's sent into the worker's own memory and nobody's listening. |

That's exactly why polling matters locally: the IEP still opens because Hop 6a works. But
*other* tabs won't live-update. In production, both processes use Redis, so pushes from the
worker arrive.

> **If you're debugging live updates from a task locally,** set `REDIS_URL=redis://localhost:6379/0`
> in `.env` and restart daphne *and* the worker.

---

## 5. The other background job: translation

Not everything starts from a button. At the bottom of [`api/models.py`](../../api/models.py):

```python
for model in [ParentAssessment, MultidisciplinaryAssessment, SpedAssessment,
              ParentProgressTracker, MultidisciplinaryProgressTracker, SpedProgressTracker]:
    post_save.connect(trigger_translation_task, sender=model)
```

A **signal**: "every time one of these is saved, call `trigger_translation_task`." That
queues `translate_form_data_task` in Celery, which translates the answers (parents may write
in Tagalog or other languages) into `translated_data`.

Two traps it guards against:
- **Infinite loop:** the task *saves* the form again, which would fire the signal again. The
  `if update_fields and 'translated_data' in update_fields: return` check stops that.
- **Invisible code:** nothing in `views.py` mentions translation. If you're wondering "what
  else happens when a form is saved?", search for `post_save`.

---

## Exercises

1. **Find the guard.** An admin clicks Generate IEP and gets *"Parent Assessment and
   finalized Specialist Assessment are required before generating an IEP."* Which file and
   line? What status code? Does a job get queued?
2. **Which terminal?** You add `print("calling AI", student.id)` inside `run_iep_generation`.
   Where does it appear: browser Console, daphne terminal, or Celery terminal? What must you
   do before it appears at all?
3. **Refresh targets.** Open `refresh_targets_for_event` in `realtime_service.py`. A
   `FORM_SUBMITTED` event fires. List the targets. Would a page using
   `useRealtimeRefresh({ targets: ['schedule'] })` refetch?
4. **Who gets the toast?** Read `_notify_generation_failed` in `tasks.py` and its docstring.
   Why is `visibility='ADMINS'` forced? (Hint: read the commit message of `8b4b792`, or
   Lesson 09.)

---

## Answers

- **Predict (§2):** `.delay()` succeeds (Redis took the job), the view returns 202, and the
  page polls… forever. `TaskStatusView` reports `PENDING`, because Celery says `PENDING` for
  any task it hasn't started (or has never heard of). Spinner never stops. No error anywhere.
  **Fix: start the worker.** Remember this one.
1. `GenerateIEPView.post` in `api/views.py`, the `if not (has_parent and has_finalized_multi)`
   guard. **400**. No job is queued; it returns before `.delay()`.
2. The **Celery terminal**: the service runs inside the worker. And you must **restart the
   worker** first. It doesn't reload code by itself.
3. `activity`, `dashboard`, `forms`, `reports`, `student`, `workspace` (plus any in
   `metadata['refresh']`). `schedule` isn't among them, so no refetch.
4. Without it, an event with a student attached defaults to `STUDENT_TEAM`, which reaches
   *everyone* on the team, parents included. Families were getting red "IEP generation
   failed" toasts for an internal problem. Now only admins and the staff member who clicked
   see it.

Next → [06-reading-big-files.md](06-reading-big-files.md)
