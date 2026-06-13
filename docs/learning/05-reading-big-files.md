# Lesson 05 — Reading Big Files Without Drowning

**Goal:** Navigate `api/views.py` (3,200+ lines) or any large file by *jumping* to what you
need instead of reading top to bottom. Nobody reads big files start-to-finish — not even the
person who wrote them. They navigate.

Your editor (you have VS Code — there's a `.vscode/` folder) has tools built for exactly this.
Learn five keyboard moves and the big files stop being scary.

---

## The mindset shift

A 3,000-line file is not a 3,000-line problem. It's ~80 small, independent pieces (functions and
classes) stored in one file. **You only ever need the one piece relevant to your task.** The
skill is finding that piece in seconds and ignoring the other 2,950 lines guilt-free.

---

## The five moves (memorize these shortcuts)

> Shortcuts below are VS Code defaults on Windows/Linux. On Mac, swap `Ctrl` for `Cmd`.

### 1. Jump to any symbol in the file — `Ctrl + Shift + O`
Type `@` (or press `Ctrl+Shift+O`) and you get a searchable list of **every function and class**
in the current file — a live table of contents. Type a few letters to filter.

Try it: open `api/views.py`, press `Ctrl+Shift+O`, type `StudentProfile`. It jumps straight to
`StudentProfileView`. You just navigated a 3,200-line file in two seconds without scrolling.

> Tip: press `Ctrl+Shift+O` then type `:` to group symbols by kind — all classes together.

### 2. Open the Outline panel — your permanent map
In the Explorer sidebar, expand **Outline** (bottom-left). It shows the same symbol tree, always
visible. Click any entry to jump there. For `views.py`, the Outline is basically a menu of every
endpoint in your app. Keep it open while you work.

### 3. Search inside the file — `Ctrl + F`
For finding a specific string: an error message, a variable, a URL fragment. Saw the error
*"Only admins can register students."* in the app? `Ctrl+F` that exact text in `views.py` and
you land on the exact line that produced it. **Error messages are searchable addresses.**

### 4. Search the whole project — `Ctrl + Shift + F`
The most powerful one. Finds a string across *every* file. Use it constantly:
- Where is this endpoint defined? Search `students/<int:student_id>/profile`.
- Who calls this function? Search its name, e.g. `get_student_profile_data`.
- Where does this text on screen come from? Search the literal words.

### 5. Go to Definition / Find References — `F12` and `Shift + F12`
Put your cursor on a name and press **`F12`** to jump to where it's *defined* (even in another
file). Press **`Shift+F12`** to list everywhere it's *used*. This is how you follow the hops
from Lesson 04 automatically: cursor on `login` → `F12` → you're in `AuthContext.tsx`.

Bonus: `Ctrl+P` opens any file by name (type `views`); `Alt+←` jumps *back* to where you were
after a definition-jump (like a browser back button — essential when you've followed 4 hops deep).

---

## Use the structure the file already gives you

Your `views.py` is organized with **banner comments** that act as section headers:
```python
# ─── Students ────────────────────────────────────────────
class StudentViewSet(viewsets.ModelViewSet): ...

# ─── Users ───────────────────────────────────────────────
class UserViewSet(viewsets.ModelViewSet): ...

# ─── Dashboard Actions ───────────────────────────────────
class AdminDashboardActionsView(APIView): ...
```
`Ctrl+F` for `# ───` and step through with Enter to skim the whole file's table of contents in
ten seconds. When you need "the notifications stuff," jump to the Notifications banner.

`api/urls.py` is an even better map: it's short, and it lists *every* endpoint next to the view
that handles it. **When lost in `views.py`, start in `urls.py`** — find the URL, read the view
name, then `Ctrl+Shift+O` to that view. `urls.py` is the index; `views.py` is the book.

---

## How to read ONE function once you've found it

You've jumped to a function. Don't read every line yet. Answer three questions in order:

1. **What goes in?** Read the signature: `def get(self, request, student_id):`. Inputs are
   `request` (who's asking + what they sent) and `student_id` (from the URL).
2. **What comes out?** Find the `return`. A view returns a `Response(...)`; a service returns a
   dict/object/value. Knowing the output tells you the function's *purpose* faster than the body.
3. **What does it call?** Scan for `SomeService.something(...)` or `Model.objects...`. Those
   calls are the *next hops* — the real work is often delegated. You can decide whether you need
   to follow them or whether knowing "it calls the student service" is enough for now.

Most of the time you do **not** need to understand the middle of the function — only its inputs,
output, and who it hands off to. That's reading for *navigation*, which is 90% of debugging.

---

## A worked example: "where does the dashboard's data come from?"

1. The dashboard page calls some `api.get('/api/...')` — find it with `Ctrl+Shift+F` for `api.get`
   in `frontend/src/app/dashboard/page.tsx`. Say it's `/api/dashboard/actions/`.
2. `Ctrl+Shift+F` for `dashboard/actions` across the project → lands in `api/urls.py`:
   `path('dashboard/actions/', AdminDashboardActionsView.as_view(), ...)`.
3. In `views.py`, `Ctrl+Shift+O` → `AdminDashboardActionsView`. Read its `get`: it checks admin,
   then queries `Student.objects.filter(status__in=['ENROLLED','INTEGRATED'])` and builds a list
   of actions.
4. Done. You answered a question about a 3,200-line file by *touching maybe 30 lines of it.*

That's the whole game. You're not reading the file — you're querying it.

---

## When a file genuinely is too tangled

Sometimes a single function really is long and confusing (you have a few — `AdminDashboardActionsView`
is meaty). Tactics:
- **Read the comments and the early-return guards first.** They summarize intent and edge cases.
- **Fold the code.** VS Code's fold arrows (or `Ctrl+K Ctrl+0` to fold all) collapse blocks so
  you see the skeleton, then expand only the branch you care about.
- **Add a temporary `print(...)`/`console.log(...)`** to confirm what a value actually is at a
  point, rather than reasoning about it. (Lesson 06.) Remove it after.
- **It's allowed to not fully understand it.** If you've found *where* the bug is, you can often
  fix it without grasping every other branch. Understand locally, not globally.

---

## Exercises

1. **Symbol speed-run.** Open `api/views.py`. Using only `Ctrl+Shift+O`, jump to:
   `GenerateIEPView`, `NotificationListView`, and `AssignSpecialistView`. Time yourself — aim for
   under 10 seconds each. No scrolling allowed.
2. **Message → line.** Run the app, do something that fails (e.g. try an admin-only action as a
   non-admin, if you can), note the exact error text, then `Ctrl+Shift+F` it across the project
   to find the line that emits it.
3. **Index-first navigation.** Pick any endpoint from `api/urls.py` you've never looked at.
   Read its name, jump to it in `views.py` with `Ctrl+Shift+O`, and answer the three questions
   from "How to read ONE function" — in/out/calls — in under two minutes.

Next → [06-debugging-playbook.md](06-debugging-playbook.md)
