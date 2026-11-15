# Lesson 08: Making a Change Safely

**You'll be able to:** add a new piece of data all the way from the database to the screen,
know every file it touches, and check you didn't break anything before you commit.

**Time:** ~40 min · **Open:** [`api/models.py`](../../api/models.py), [`api/serializers.py`](../../api/serializers.py),
[`api/auth_views.py`](../../api/auth_views.py), [`frontend/src/types/index.ts`](../../frontend/src/types/index.ts)

Reading code is half the job. The other half is changing it without surprises. We'll study a
**real change from this repo's history**: adding a teacher's `grade_level` (commit `a35b4f0`,
August 2026).

---

## 1. The real example: "teachers have a grade level"

The goal: admins assign each teacher a grade level, so students can be matched to teachers.
Teachers can see theirs but not change it.

Here's every place it had to go. **This list is the lesson.**

```
 BACKEND                                                FRONTEND
 ───────                                                ────────
 1. api/models.py          add the column               6. src/types/index.ts     add it to the TS shapes
 2. api/migrations/0053_…  tell the DB about it         7. pages that show/edit it (users/[id], dashboard, …)
 3. api/serializers.py     expose it in JSON
 4. api/auth_views.py      add it to /api/auth/me/
 5. validation             api/grade_levels.py
```

### Step 1: The model
```python
class User(AbstractUser):
    ...
    grade_level = models.CharField(
        max_length=50,
        blank=True,
        default='',
        help_text="The grade level a teacher handles. Assigned by admin, used for student matching.",
    )
```
`blank=True, default=''` matters: **existing users don't have a value**, so the column must
allow empty. Add a required field with no default and the migration will stop and ask you
what to put in the existing rows.

### Step 2: The migration
```bash
python manage.py makemigrations
python manage.py migrate
```
`makemigrations` compares your models to the migration history and writes a new file,
here `api/migrations/0053_invitation_grade_level_user_grade_level.py`:
```python
operations = [
    migrations.AddField(model_name='invitation', name='grade_level', field=models.CharField(...)),
    migrations.AddField(model_name='user',       name='grade_level', field=models.CharField(...)),
]
```
`migrate` applies it to your local `db.sqlite3`. **Production applies it on deploy** (the
Railway start command runs `migrate`). Commit the migration file *with* the model change.

> **Migration rules:** never edit or delete a migration that's already been committed and
> deployed. Never hand-write one for a simple field. Let Django generate it. If two people
> both add migrations at once, you'll get two `0055_…` files. Django will tell you, and
> `makemigrations --merge` fixes it.

### Step 3: The serializers
A new column is **invisible to the frontend** until a serializer lists it (Lesson 03 §6).
It was added to two:
```python
class AdminUserSerializer(...):   # admins editing any user
    fields = [..., 'specialties', 'grade_level', 'languages', ...]

class SelfUserSerializer(...):    # a user editing themselves
    fields = [..., 'grade_level', ...]
    # Grade levels sit with specialty: admin-assigned, never self-editable.
    read_only_fields = [..., 'grade_level', ...]
```
That `read_only_fields` line is the **security** part: a teacher sending
`PATCH { grade_level: "Grade 6" }` for themselves gets it silently ignored. The
frontend hiding the input is *not* enough (Lesson 01 §2).

### Step 4: The hand-built `/me` endpoint (the easy one to miss)
`MeView` doesn't use a serializer. It builds its dict by hand:
```python
return Response({
    'user_id': user.id,
    ...
    'grade_level': getattr(user, 'grade_level', '') or '',
    ...
})
```
Miss this and everything *seems* fine on admin screens, but `useAuth().user.grade_level` is
always `undefined`. **When adding a user field, always search `auth_views.py` too.**

### Step 5: Validation
Admins type grade levels, and `Student.grade` is free text ("Grade 3", "3", "gr 3"). So a
shared normalizer was added, with one copy per language:
- `api/grade_levels.py` → `validate_grade_level(...)`, called from the serializers
- `frontend/src/lib/grade-levels.ts` → `normalizeGradeLevel(...)`, used by the UI

If you change the rules in one, **change the other**, or the screen and the server will
disagree.

### Step 6: TypeScript types
```ts
export interface UserPayload { ...; grade_level?: string; ... }   // what useAuth() holds
export interface UserProfile { ...; grade_level?: string; ... }   // a user from /api/users/
```
Types don't *do* anything at runtime. They make your editor warn you when you use a field
wrong. Add the field and you get autocomplete everywhere.

### Step 7: The screens
Finally, the UI: the admin edits it on `users/[id]/page.tsx`
(`api.patch(\`/api/users/${id}/\`, { grade_level: gradeLevel })`), and dashboards show it.

---

## 2. The general recipes

### Adding a field
1. Model (`api/models.py`), with `blank=True` / `null=True` / `default=` for existing rows
2. `makemigrations` → read the generated file → `migrate`
3. Every serializer that should expose it (`Ctrl+Shift+F` for `model = YourModel`)
4. Any hand-built dicts: `MeView`, `get_student_profile_data`, other services returning dicts
5. `read_only_fields` if users mustn't change it
6. TypeScript types in `frontend/src/types/`
7. The UI
8. **Restart daphne** (and Celery if tasks use it)

### Adding an endpoint
1. A view in `api/views.py`, under the right `# ───` banner. Start with
   `permission_classes` and the role check, *then* the logic.
2. Put real logic in a service in `api/services/`, not the view.
3. Add the URL in `api/urls.py`. **End it with `/`.** All ARASE URLs have a trailing slash.
4. Import the view at the top of `api/urls.py` (the big import list).
5. Call it from the frontend with `api.get/post(...)`, never `fetch`.
6. If other screens should update live, call `create_activity_event(...)` (Lesson 05).
7. Restart daphne.

### Changing something that already exists
Before you change a function, **find everyone who uses it**: cursor on its name →
`Shift+F12`, or `Ctrl+Shift+F`. The bigger that list, the more careful you need to be.

---

## 3. Check before you commit

| Check | Command | Catches |
|---|---|---|
| Django sanity check | `python manage.py check` | broken imports, bad model definitions |
| Missing migrations | `python manage.py makemigrations --check --dry-run` | you changed a model but forgot the migration |
| Backend tests | `python manage.py test api` | broke existing behavior (`api/tests.py`, ~1,400 lines) |
| Frontend lint | `cd frontend` then `npm run lint` | unused variables, React hook mistakes |
| Frontend build | `cd frontend` then `npm run build` | **TypeScript errors.** Vercel runs this; if it fails, the deploy fails |
| Click through it | the app, as **each role it affects** | everything else |

Clicking through as **each role** matters most. A change that works for admins can break the
teacher view. You have dev accounts for all four roles; use them.

### Commit messages
The team convention (see `agents.md` in the project root): **say what changed and why**, not just "fix bug."
Look at `git log` for the style:
```
fix(proxy): keep trailing slash when rewriting /api/* to the backend

The :path* rewrite dropped the trailing slash, so Django's APPEND_SLASH
301'd every data request back to the frontend...
```
A good message is a gift to whoever debugs this in six months. It might be you.

---

## 4. Breaking changes: what to warn the team about

Some changes break things *other people* depend on. Flag these before merging:
- **Renaming or removing** a field in a serializer or a hand-built dict. The frontend reads
  it by name.
- **Changing a URL.** Every `api.get('...')` using it breaks.
- **Changing a status code or error message.** The frontend may check for it.
- **Migrations that delete or rename columns.** The data is gone after deploy.
- **New environment variables.** Production won't have them until someone adds them on
  Railway/Vercel (Lesson 10).

---

## Exercises

1. **Plan a field.** You want a `nickname` on `Student`, shown on the profile page. Without
   writing code, list every file you'd touch, in order. (Hint: the profile page doesn't use
   `StudentSerializer`. What does it use?)
2. **Find the serializers.** `Ctrl+Shift+F` for `model = User`. How many serializers
   represent users? Which one is for the logged-in user editing themselves?
3. **Dry run.** Run `python manage.py makemigrations --check --dry-run`. What does it say?
   What would it mean if it listed changes?
4. **Find the readers.** Before renaming `form_statuses` in `get_student_profile_data`, who
   would break? Search the frontend for it.

---

## Answers

1. `api/models.py` (add `nickname = models.CharField(max_length=50, blank=True, default='')`)
   → `makemigrations` + `migrate` → `StudentSerializer.fields` (for lists/dashboards) →
   **`get_student_profile_data`** in `api/services/student_service.py`, because the profile
   page reads that hand-built dict, not the serializer → the `ProfileData` type at the top of
   `students/[id]/page.tsx` → the JSX → restart daphne → click through as admin and a teacher.
2. Two: `AdminUserSerializer` and `SelfUserSerializer` (the self-edit one,
   with `read_only_fields`). Each serves a different audience. (`MeView` is a third shape,
   built by hand.)
3. "No changes detected" means your models and migrations agree. A list of changes means
   someone edited a model without generating a migration. Production would be missing a
   column.
4. Search `form_statuses` in `frontend/src`: the profile page, the reports page, the
   workspace, and more. All would need updating at the same time. That's a breaking change.

Next → [09-real-bugs-casebook.md](09-real-bugs-casebook.md)
