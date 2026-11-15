# Lesson 03: The Backend Tour

**You'll be able to:** answer *"the frontend called `/api/students/5/profile/`, so what code
runs, and where does the data come from?"* for any endpoint in the app.

**Time:** ~45 min · **Open:** [`backend/urls.py`](../../backend/urls.py), [`api/urls.py`](../../api/urls.py),
[`api/views.py`](../../api/views.py), [`api/models.py`](../../api/models.py), [`api/serializers.py`](../../api/serializers.py)

---

## 1. The backend's job in one sentence

> Get an HTTP request → figure out who's asking → check they're allowed → read or write the
> database → send back JSON.

Everything below is just *where* each step lives.

---

## 2. The order things run

When `GET /api/students/5/profile/` arrives at daphne, Django runs this pipeline:

```
1. backend/urls.py        "Which app handles /api/...?"   → hands off to api/urls.py
2. api/urls.py            "Which view handles students/5/profile/?" → StudentProfileView
3. authentication         "Who is this?" reads the access_token cookie → sets request.user
                          (api/authentication.py → CookieJWTAuthentication)
4. permission + throttle  "Logged in? Too many requests?" (permission_classes, throttle rates)
5. the view method        get() / post() / … runs
       │
       ├─► api/services/*        the business logic
       │        └─► models       (api/models.py) ──► the database
       │
       └─► serializer            (api/serializers.py) turns rows into JSON
6. Response               JSON goes back to the browser
```

Keep this list nearby. When the backend misbehaves, ask "which of these six steps went
wrong?" Each step is a specific file.

---

## 3. URLs: the switchboard

### Top level: `backend/urls.py`

```python
path('api/', include('api.urls')),
```

*"Anything starting with `/api/`, go ask `api/urls.py`."* This file also holds the **auth
endpoints** directly (`api/auth/token/`, `api/auth/me/`, `api/auth/logout/`,
`api/auth/ws-ticket/`, …), all pointing at `api/auth_views.py`. Notice many are listed
twice, with and without a trailing slash. That matters (Lesson 09, case 1).

### App level: `api/urls.py`

There are **two styles** here. Recognizing them saves a lot of confusion.

**Style A: explicit `path(...)` for one-off endpoints**
```python
path('students/<int:student_id>/profile/', StudentProfileView.as_view(), name='student-profile'),
```
URL `students/<a number>/profile/` → run `StudentProfileView`, and pass the number in as
`student_id`.

**Style B: a `router` for whole "resources" (ViewSets)**
```python
router = DefaultRouter()
router.register(r'students', StudentViewSet, basename='student')
```
That **one line** creates a whole family of URLs:

| Method + URL | What it does | ViewSet method that runs |
|---|---|---|
| `GET /api/students/` | list students | `get_queryset` → `list` |
| `POST /api/students/` | create a student | `create` |
| `GET /api/students/5/` | get one | `retrieve` |
| `PATCH /api/students/5/` | edit one | `partial_update` |
| `DELETE /api/students/5/` | delete one | `destroy` |

> **Debugging payoff:** if the frontend calls `api.get('/api/students/')`, don't search for
> that URL string. You won't find it. It comes from `router.register('students', StudentViewSet)`.
> Go straight to `StudentViewSet`. For a specific path like `/students/5/profile/`, search
> `api/urls.py` for `profile`.

> **Order matters:** in `api/urls.py`, the explicit `students/<id>/...` paths come *before*
> `path('', include(router.urls))`. Django uses the first match, top to bottom.

---

## 4. Views: the request handlers

ARASE uses two shapes.

### Shape A: `APIView` (one endpoint, you write the methods)

`StudentProfileView` (search for it in `views.py`, around line 1440) is the whole pattern
in a few lines:

```python
class StudentProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]          # (a)

    def get(self, request, student_id):                         # (b)
        try:
            if request.user.role == 'ADMIN':                     # (c)
                student = Student.objects.get(id=student_id)
            else:
                student = Student.objects.get(id=student_id, assigned_users__user=request.user)
        except Student.DoesNotExist:
            return Response({"error": "Student not found or access denied."}, status=status.HTTP_404_NOT_FOUND)  # (d)

        from .services.student_service import get_student_profile_data
        return Response(get_student_profile_data(student, request.user))   # (e)
```

This is *the* template for reading any view:
- **(a) `permission_classes`**: the gate. `IsAuthenticated` = "logged in, or get a 401."
- **(b) `def get(self, request, student_id)`**: the method name matches the HTTP verb.
  `GET` runs `get`, `POST` runs `post`. `student_id` came from the URL.
- **(c) the role check**: security lives here, not in the frontend. Non-admins are limited
  by `assigned_users__user=request.user` (decoded in §5).
- **(d) error response**: the `"error"` text here is *exactly* what the frontend's
  `err.response?.data?.error` shows on screen.
- **(e) the hand-off**: the view doesn't build the profile. It calls a **service**.

### Shape B: `ViewSet` (a whole resource at once)

`StudentViewSet` (top of `views.py`, line ~52). You don't write `get`/`post`; you override
named methods:

```python
class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):                          # WHICH ROWS this user may see
        user = self.request.user
        ...
        if user.role == 'ADMIN':
            qs = Student.objects.all()
        else:
            # Non-admins only see students they've been explicitly assigned to via StudentAccess.
            qs = Student.objects.filter(assigned_users__user=user).distinct()
        return qs.alias(urgency=urgency_case).order_by('urgency', '-id')

    def create(self, request, *args, **kwargs):      # POST /api/students/
        if request.user.role != 'ADMIN':
            return Response({"error": "Only admins can register students."}, status=status.HTTP_403_FORBIDDEN)
        ...
        student, invitation = create_student_with_invitation(...)   # service does the work
        create_activity_event(event_type='STUDENT_CREATED', ...)     # tells live screens (Lesson 05)
        return Response(response_data, status=status.HTTP_201_CREATED, ...)
```

**`get_queryset` is the most important method on a ViewSet.** It decides which rows the
user can *even see*. It's also used by `retrieve`, `update`, and `destroy`, so a student
outside your queryset is a 404 for you no matter what. Most "why can't this user see that
student?" bugs end here.

---

## 5. Models: the shape of the data

Open [`api/models.py`](../../api/models.py). Each `class` is a **table**; each attribute is
a **column**.

```python
class Student(models.Model):
    # Lifecycle: PENDING_ASSESSMENT → ASSESSMENT_SCHEDULED → ASSESSED → ENROLLED ↔ INTEGRATED → ARCHIVED
    STATUS_CHOICES = ( ('PENDING_ASSESSMENT', 'Pending Assessment'), ... ('ARCHIVED', 'Archived') )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    grade = models.CharField(max_length=50)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='PENDING_ASSESSMENT')
```

### The tables you'll meet most

| Model | One row means… |
|---|---|
| `User` | One login. `email` is the username; `role` is one of the four roles. |
| `Student` | One child. |
| `StudentAccess` | "This user is on this student's team." **The permission table.** |
| `Invitation` | A pending invite link (parent or staff). |
| `ReportCycle` | One reporting period for a student (forms and reports hang off it). |
| `ParentAssessment`, `MultidisciplinaryAssessment`, `SpedAssessment` | Filled-in assessment forms. The answers live in a JSON column, `form_data`. |
| `ParentProgressTracker`, `MultidisciplinaryProgressTracker`, `SpedProgressTracker` | Monthly progress forms, same idea. |
| `SectionContribution` | One specialist's section of a shared form. |
| `GeneratedDocument` | An IEP or monthly report the AI produced (`iep_data` JSON + PDF). |
| `ActivityEvent` | "Something happened." Drives the live updates (Lesson 05). |
| `Notification` | One bell notification for one user. |

### Relationships: `ForeignKey` and `related_name`

```python
class StudentAccess(models.Model):
    user    = models.ForeignKey(User,    on_delete=models.CASCADE, related_name='student_access')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='assigned_users')
```

- A `ForeignKey` "points at one row in another table." Each `StudentAccess` links one
  `User` to one `Student`.
- `related_name='assigned_users'` is the name for going **backwards**: from a student to
  its access rows, as `student.assigned_users`.
- `on_delete=models.CASCADE`: delete the student, and its access rows go too.

**That decodes the permission query:**
`Student.objects.filter(assigned_users__user=request.user)` means *"students that have an
access row whose user is me."* The double underscore `__` means "follow this relationship."
That's the whole permission model for non-admins, and now you can read it.

### Querying with `.objects`

You don't write SQL; you chain methods:

| Code | Meaning |
|---|---|
| `Student.objects.all()` | every student |
| `Student.objects.get(id=5)` | exactly one (raises `DoesNotExist` if 0, `MultipleObjectsReturned` if 2+) |
| `Student.objects.filter(status='ENROLLED')` | zero or more |
| `.exists()` | True/False: does anything match? |
| `.first()` | the first match, or `None` (doesn't raise) |
| `.order_by('-created_at')` | sort, newest first (`-` = descending) |
| `status__in=[...]` | "status is one of these" |

When you see `SomeModel.objects.<something>`, that line **touches the database**. Data
bugs live there.

---

## 6. Serializers: rows ⇄ JSON

A database row isn't JSON. **Serializers translate.** Find `StudentSerializer` in
[`api/serializers.py`](../../api/serializers.py):

```python
class StudentSerializer(serializers.ModelSerializer):
    has_parent_assessment = serializers.SerializerMethodField()   # COMPUTED, not a column
    next_action = serializers.SerializerMethodField()
    ...
    class Meta:
        model = Student
        fields = [
            'id', 'first_name', 'last_name', 'date_of_birth', 'grade', 'status',
            'has_parent_assessment', ..., 'next_action',
        ]

    def get_has_parent_assessment(self, obj):
        return ParentAssessment.objects.filter(student=obj).exists()
```

Three takeaways:
- **`fields = [...]` is the contract.** *Exactly these keys* reach the frontend. If
  `student.grade` is `undefined` on screen, check that `grade` is in this list.
- **`SerializerMethodField`** = computed on the fly by the matching `get_<name>` method.
  If a computed value looks wrong, read that method.
- **`read_only_fields`** (see `SelfUserSerializer`, the one users edit their own profile
  through) = sent to the frontend, but the frontend can't change it. That's how `role` and
  `grade_level` stay admin-only. Admins edit users through a different one,
  `AdminUserSerializer`. **One model can have several serializers**, one per audience.

> **Worth noticing:** each `get_...` method runs its own query, *per student*. A list of
> 100 students with 10 computed fields can be 1,000+ queries. If a list endpoint is slow,
> start here.

> **Not everything uses a serializer.** `MeView` in `auth_views.py` builds its JSON by hand
> as a plain dict. A new user field has to be added there separately. Lesson 08 shows why
> that matters.

---

## 7. How the server knows who you are

You never send a password on each request, yet `request.user` is always set. How?

1. At login, the server put your identity into a **JWT** (a signed token) and stored it in
   an **HttpOnly cookie** called `access_token` (JavaScript can't read it, so scripts can't
   steal it). There's also a longer-lived `refresh_token` cookie.
2. The browser sends those cookies on every request (`withCredentials: true` in `api.ts`).
3. `settings.REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES']` points at
   `CookieJWTAuthentication` in [`api/authentication.py`](../../api/authentication.py). It
   reads the cookie, checks the signature, and sets `request.user`.
4. On writes (POST/PATCH/DELETE) it also runs `enforce_csrf(request)`. That's the
   server-side half of the CSRF header `api.ts` adds.

This explains a whole class of bugs: "I'm logged in but get a 401" almost always means the
cookie didn't arrive or the token expired. "403 CSRF Failed" means the header and cookie
don't match.

---

## 8. `services/`: where the logic lives

Open [`api/services/`](../../api/services/). One file per topic. Their names are basically a
table of contents for what the app can do:

| File | Handles |
|---|---|
| `student_service.py` | creating students, the profile payload, assigning/unassigning staff |
| `user_service.py` | user and invitation logic |
| `cycle_service.py` | report cycles and reminders |
| `section_service.py`, `collaboration_service.py` | shared multi-specialist forms, section locks |
| `workflow_state_service.py` | "what's the next step for this student?" |
| `iep_service.py`, `report_service.py`, `document_service.py` | IEP / monthly report generation and versions |
| `llm_service.py`, `gemini_service.py` | talking to Gemini or Ollama |
| `translation_service.py` | translating form answers to English |
| `notification_service.py`, `realtime_service.py` | bell notifications and live events |
| `sms_service.py` | phone verification codes |

**Views decide *if* something should happen and who's allowed. Services decide *how*.**

---

## Exercises

1. **Follow the hand-off.** Open `api/services/student_service.py` and find
   `get_student_profile_data` (~line 138). Skip to its `return {` (~line 335). List five
   top-level keys it returns.
2. **Router math.** In `api/urls.py`, find `router.register(r'users', UserViewSet, ...)`.
   Write the five URLs + methods that one line creates. Then confirm `UserViewSet` has a
   `get_queryset`.
3. **Read a model.** Find `User` in `api/models.py`. Which field is the login name? Which
   field decides permissions? What does `username = None` tell you?
4. **Find the gate.** A parent tries `DELETE /api/students/5/`. Walk the six steps from §2.
   Which step stops them, and with what status code?

---

## Answers

1. `student`, `active_cycle`, `cycle_status`, `previous_recommendations`, `form_statuses`,
   `generated_documents`, `assigned_staff`. Match them against the `ProfileData` type at the
   top of `students/[id]/page.tsx`. They line up key for key. Bonus gotcha: inside
   `student`, `status` is the *human label* ("Pending Assessment") and `status_code` is the
   raw value (`PENDING_ASSESSMENT`). Compare against the wrong one and your `if` never matches.
2. `GET /api/users/` (list), `POST /api/users/` (create), `GET /api/users/<id>/`,
   `PATCH /api/users/<id>/`, `DELETE /api/users/<id>/`.
3. `email` (`USERNAME_FIELD = 'email'`). `role`. `username = None` means Django's default
   username column was removed: email is the only login identifier.
4. Step 5. `destroy` checks `request.user.role != 'ADMIN'` and returns **403** "Only admins
   can delete students." (If the parent weren't assigned to student 5, `get_object()` would
   never find it, but the role check runs first.)

Next → [04-trace-a-feature.md](04-trace-a-feature.md): we put the two halves together.
