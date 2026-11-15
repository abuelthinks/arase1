# Lesson 06: Reading Big Files Without Drowning

**You'll be able to:** find what you need in `api/views.py` (3,400 lines) or
`frontend/src/app/workspace/page.tsx` (4,400 lines) in seconds, by *jumping* instead of
scrolling.

**Time:** ~30 min · **Open:** VS Code with the project

---

## The mindset shift

A 3,400-line file is not a 3,400-line problem. `views.py` is **about 100 small, separate
classes** stored in one file. You only need the one that matters for your task. The skill is
finding it in seconds and ignoring the rest without guilt.

Nobody reads big files top to bottom. Not even whoever wrote them. They navigate.

---

## The six moves (learn these shortcuts)

> VS Code defaults on Windows. On Mac, use `Cmd` instead of `Ctrl`.

| Move | Shortcut | Use it to… |
|---|---|---|
| **Go to symbol in file** | `Ctrl+Shift+O` | Jump to any class/function in *this* file by name |
| **Go to symbol anywhere** | `Ctrl+T` | Jump to a class/function in *any* file (`StudentProfileView`) |
| **Open file by name** | `Ctrl+P` | Type `views` or `student_service` and press Enter |
| **Search the project** | `Ctrl+Shift+F` | Find a string everywhere: an error message, a URL, a function name |
| **Go to definition / find uses** | `F12` / `Shift+F12` | Follow a hop: cursor on `login` → F12 → you're in `AuthContext.tsx` |
| **Go back** | `Alt+←` | Return to where you were after jumping (like a browser Back button) |

Try it now: open `api/views.py`, press `Ctrl+Shift+O`, type `StudentProfile`, press Enter.
You just crossed a 3,400-line file in two seconds.

Also keep the **Outline** panel open (Explorer sidebar, bottom). For `views.py` it's
basically a menu of every endpoint in the app.

---

## Error messages are addresses

This is the single most useful trick in the lesson.

Every error the user sees was typed by someone, somewhere. Copy the exact words from the
screen or the Network tab's Response, then `Ctrl+Shift+F`:

- *"Only admins can register students."* → `api/views.py`, `StudentViewSet.create`
- *"Background worker is unavailable…"* → `GenerateIEPView.post`
- *"Failed to load profile."* → `frontend/src/app/students/[id]/page.tsx` (a frontend
  fallback, which tells you the backend *didn't* send its own message)

Search for a **distinctive chunk** (4–6 words), not the whole sentence, in case part of it
is built from variables.

---

## Use the structure the file already has

### `views.py` has section banners
```python
# ─── Students ────────────────────────────────────────
class StudentViewSet(viewsets.ModelViewSet): ...

# ─── Student Profile ─────────────────────────────────
class StudentProfileView(APIView): ...

# ─── IEP Generation & Management ─────────────────────
class GenerateIEPView(APIView): ...
```
`Ctrl+F` for `# ───` and press Enter repeatedly. You'll skim the whole file's table of
contents in ten seconds: Students, Users, Form Input ViewSets, Section-scoped writes, Parent
Onboarding, Student Profile, Dashboard Actions, Student Actions, Staff, Report Generation,
Invitations, SMS Verification, IEP, Monthly Report, Audit Logs, Cycle Management,
Notifications…

### `api/urls.py` is the index
It's short and lists every endpoint next to its view. **When lost in `views.py`, start in
`urls.py`.** Find the URL, read the view name, then `Ctrl+Shift+O` to it. `urls.py` is the
index; `views.py` is the book.

### Watch for base classes
Some views are tiny because they *inherit* from a bigger one:
```python
class AssessmentSectionWriteView(SectionWriteView):
    ...  # just a few lines
```
If a view looks empty, the logic is in its parent (`SectionWriteView`). `F12` on the parent
name. `BaseInputViewSet` does the same for all the form ViewSets.

---

## The giant frontend file: `workspace/page.tsx`

This one's harder. Almost all of it is **one function**, `UnifiedWorkspaceContent`, from
line ~258 to ~4,380, with ~40 `useState` calls. Strategies:

1. **Find what it fetches.** `Ctrl+F` for `api.` and step through the matches (~16). Each
   is a backend endpoint the workspace depends on. That's your list of "where the data comes
   from."
2. **Find how it picks what to show.** It's driven by the URL's query string. `Ctrl+F` for
   `searchParams.get(`: `studentId`, `workspace`, `view`, `tab`, `docId`, `teamRole`. When a
   bug only happens on one view, find where that param is read and follow the variable.
3. **Fold everything.** `Ctrl+K Ctrl+0` folds all blocks. Then unfold only the part you
   need. `Ctrl+K Ctrl+J` unfolds everything again.
4. **Search for the visible text.** See a heading "Teacher Progress" on screen? Search for
   it. You land in the JSX that draws it. (Here it's in the `TABS` list near the top.)
5. **Check the imports at the top.** The workspace embeds whole other pages:
   `StudentProfileContent` (from `students/[id]/page`), `FormEntryContent` (from
   `forms/[type]/page`), `AdminReportsContent`, `IEPViewerContent`, `MonthlyReportContent`,
   `ParentFormContent`. If a bug is inside one of those sections, **the code lives in that
   other file**, not in the workspace. This trips people up constantly.

---

## How to read ONE function once you've found it

Don't read every line yet. Answer three questions, in order:

1. **What goes in?** The signature: `def get(self, request, student_id):`. Inputs:
   `request` (who's asking, what they sent) and `student_id` (from the URL).
2. **What comes out?** Find every `return`. In a view, each `return Response(...)` is a
   possible outcome. **Early returns are the guards**: read those first; they list the ways
   it can say no.
3. **What does it call?** Scan for `something_service.func(...)`, `Model.objects...`,
   `.delay(...)`. Those are the next hops. Decide if you need to follow them, or if "it
   calls the student service" is enough for now.

Most of the time you don't need to understand the middle. Inputs, outputs, and hand-offs
are 90% of debugging.

---

## Worked example: "where does the admin dashboard's action list come from?"

1. Admins render `dashboard/AdminDashboard.tsx` (Lesson 02). `Ctrl+F` for `api.get` →
   `api.get("/api/dashboard/actions/")`.
2. `Ctrl+Shift+F` for `dashboard/actions` → `api/urls.py`:
   `path('dashboard/actions/', AdminDashboardActionsView.as_view(), ...)`.
3. `Ctrl+T` → `AdminDashboardActionsView`. Read its guards, then what it queries and returns.
4. Done. You answered a question about a 3,400-line file by reading maybe 30 lines of it.

You're not reading the file. You're *querying* it.

---

## When a function really is too tangled

`AdminDashboardActionsView` and the workspace are genuinely meaty. Tactics:
- **Comments and early returns first.** They summarize intent and edge cases.
- **Print the value instead of reasoning about it.** One `print(...)` or `console.log(...)`
  beats ten minutes of guessing (Lesson 07). Remove it after.
- **Understand locally, not globally.** If you've found *where* the bug is, you can often
  fix it without understanding every other branch.
- **Ask AI about one function, not the file.** Paste the 40 lines you've narrowed down, plus
  the error. You'll get a far better answer than "explain views.py."

---

## Exercises

1. **Symbol speed run.** Using only `Ctrl+Shift+O` in `views.py`, jump to `GenerateIEPView`,
   `NotificationListView`, and `AssignSpecialistView`. Aim for under 10 seconds each.
2. **Message → line.** Find where *"Student not found or access denied."* is written. How
   many places use it? (Use `Ctrl+Shift+F`.)
3. **Inheritance hunt.** Open `AssessmentSubmitAllView`. Where does its actual `post` logic
   live?
4. **Workspace data map.** In `workspace/page.tsx`, list four different backend URLs it
   calls.

---

## Answers

1. No answer, just speed. If one took long, try `Ctrl+T` instead, which searches all files.
2. Once, in `StudentProfileView` in `views.py`. Many other messages *do* appear in several
   places. When that happens, the Network tab's request URL tells you which view actually
   sent it.
3. In its parent, `SectionSubmitAllView` (~line 971). `AssessmentSubmitAllView` only sets
   which form type it works on.
4. Any four of: `/api/students/`, `/api/students/<id>/profile/`,
   `/api/activity/?student_id=...`, `/api/staff/?student_id=...`,
   `/api/inputs/multidisciplinary-assessment/contributions/`,
   `/api/students/<id>/confirm-team/`, `/api/students/<id>/enroll/`,
   `/api/students/<id>/integrate/`. Notice the profile is fetched in several places. Each
   one is a different moment that refreshes it.

Next → [07-debugging-playbook.md](07-debugging-playbook.md)
