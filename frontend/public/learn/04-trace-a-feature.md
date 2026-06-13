# Lesson 04 — Trace a Feature End-to-End

**This is the most important lesson in the course.** Everything before it was vocabulary. Here
we put it together: we follow two real features across both halves of the app, hop by hop, with
exact files. Once you can do this yourself, you can debug anything in ARASE.

We'll trace:
- **A → Logging in** (a write: send credentials, get a session) — the cleanest full round trip.
- **B → Loading a student's profile** (a read: fetch data and show it) — the everyday pattern.

Have these files open. Better yet, do the **Live version** at the bottom with the app running.

---

## The skill we're practicing

> Start at the thing the user did. Find the *next* file it calls. Repeat until you hit the
> database. Then follow the answer back. **Each hop is one `import` or one URL.**

That's the entire technique. There's no magic — just patiently asking "okay, what runs *next*?"

---

## Trace A — Logging in

**User action:** types email + password on `/login`, clicks "Sign In."

### Hop 1 — The page handler
**File:** [`frontend/src/app/login/page.tsx`](../../frontend/src/app/login/page.tsx)

The form's `onSubmit` runs `handleLogin`:
```tsx
const { login } = useAuth();              // grabbed from AuthContext
...
const authenticatedUser = await login(email, password);
```
The page doesn't talk to the network itself. It calls `login(...)`, which it got from
`useAuth()`. So the next hop is **AuthContext**. (How did we know? `login` comes from
`useAuth()`, and `useAuth` is defined in `AuthContext.tsx`. Follow the import.)

### Hop 2 — The auth logic
**File:** [`frontend/src/context/AuthContext.tsx`](../../frontend/src/context/AuthContext.tsx) → the `login` function
```tsx
const login = async (email, password) => {
    await fetchCsrfCookie();                                   // (i) get a security token first
    const res = await api.post("/api/auth/token/", { email, password });  // (ii) THE round trip
    const basicUser = { user_id: res.data.user_id, role: res.data.role, email: res.data.email };
    setUser(basicUser);                                        // (iii) remember who's logged in
    const fullUser = await checkAuth();                        // (iv) fetch the full profile
    return fullUser || basicUser;
};
```
The key line is **(ii)**: `api.post("/api/auth/token/", { email, password })`. That's the
request leaving the browser. Next hop: `api`, i.e. `lib/api.ts`.

### Hop 3 — The door
**File:** [`frontend/src/lib/api.ts`](../../frontend/src/lib/api.ts)

`api.post` runs through this file. For a login it: attaches the CSRF token (request
interceptor), sets `baseURL` to `http://localhost:8000`, and includes cookies
(`withCredentials`). The actual address hit is:
```
POST http://localhost:8000/api/auth/token/     body: { email, password }
```
The request now leaves the frontend entirely and crosses to Django. **We've crossed the wire.**

### Hop 4 — The server's switchboard
**File:** [`backend/urls.py`](../../backend/urls.py)
```python
path('api/auth/token/', CookieTokenObtainPairView.as_view(), name='token_obtain_pair'),
```
`/api/auth/token/` maps to `CookieTokenObtainPairView`. Next hop: that view.

### Hop 5 — The login view
**File:** [`api/auth_views.py`](../../api/auth_views.py) → `CookieTokenObtainPairView.post`
```python
def post(self, request, *args, **kwargs):
    serializer = self.get_serializer(data=request.data)   # (a) validate email+password
    serializer.is_valid(raise_exception=True)             #     (raises if wrong → 401 to frontend)
    access  = serializer.validated_data['access']         # (b) make signed tokens
    refresh = serializer.validated_data['refresh']
    user    = serializer.user
    response = Response({ 'user_id': user.id, 'role': user.role, 'email': user.email, ... })
    return _set_auth_cookies(response, access, refresh)   # (c) put tokens in HttpOnly cookies
```
- **(a)** Validation happens in `CustomTokenObtainPairSerializer` (in `serializers.py`) — that's
  where the email/password is actually checked against the `User` table in the database. Wrong
  password → it raises → the frontend's `catch` shows "Invalid credentials."
- **(b)** On success it mints two tokens (a short-lived **access** token and a longer **refresh**
  token).
- **(c)** `_set_auth_cookies` attaches them as **HttpOnly cookies** on the response. The JSON
  body only contains `user_id`, `role`, `email` — never the raw tokens.

### Hop 6 — The answer comes back
The response travels back to `api.post(...)` in Hop 2. `res.data` is `{ user_id, role, email }`.
`setUser(basicUser)` stores it → because `AuthProvider` wraps the whole app, **every page now
knows who's logged in.**

### Hop 7 — Fetch the full profile (a mini round trip)
Still in `login`, `checkAuth()` runs `api.get("/api/auth/me/")`. Same journey: `api.ts` →
`backend/urls.py` (`/api/auth/me/` → `MeView`) → `MeView.get` reads `request.user` (identified
from the cookie that was *just* set) and returns the full user object (names, phone, specialties,
onboarding status). `setUser` updates again with the richer data.

### Hop 8 — Redirect
Back in `login/page.tsx`, with the user object in hand, it decides where to send them:
```tsx
const landingRoute = authenticatedUser.role === "ADMIN" ? "/dashboard"
    : ["TEACHER","SPECIALIST"].includes(authenticatedUser.role) ? "/workspace" : "/dashboard";
router.push(landingRoute);
```
Done. The user lands on a role-appropriate page.

### Trace A as a picture
```
login/page.tsx  handleLogin()
   └─ AuthContext.login()
        ├─ api.post('/api/auth/token/')  ──► lib/api.ts ──(POST, +cookies +csrf)──► Django
        │                                                       │
        │   backend/urls.py → CookieTokenObtainPairView.post (api/auth_views.py)
        │        └─ CustomTokenObtainPairSerializer checks email+password vs User table (DB)
        │        └─ mints access+refresh tokens → _set_auth_cookies() → sets HttpOnly cookies
        │   ◄──────────────── JSON { user_id, role, email } + Set-Cookie ─────────────────
        ├─ setUser(...)                          (whole app now knows the user)
        └─ checkAuth() → api.get('/api/auth/me/') → MeView → full user JSON → setUser(...)
   router.push('/dashboard' or '/workspace')
```

---

## Trace B — Loading a student's profile

**User action:** navigates to `/students/5`.

### Hop 1 — URL picks the file
`/students/5` → `frontend/src/app/students/[id]/page.tsx` (folders = URLs, Lesson 02). `[id]`
captures `5`.

### Hop 2 — The page reads the id and fires an effect
**File:** [`frontend/src/app/students/[id]/page.tsx`](../../frontend/src/app/students/[id]/page.tsx)
```tsx
const id = propStudentId || (params?.id as string);   // id = "5"
...
const fetchProfile = useCallback(async () => {
    const res = await api.get(`/api/students/${id}/profile/`);   // ← the round trip
    setData(res.data);
}, [id]);

useEffect(() => { if (user && id) fetchProfile(); }, [fetchProfile, id, user]);
```
After the page renders, `useEffect` runs `fetchProfile`, which calls
`api.get('/api/students/5/profile/')`. Next hop: `api.ts` → the wire.

### Hop 3 — Across to Django
`GET http://localhost:8000/api/students/5/profile/` (with the auth cookie attached automatically).

### Hop 4 — Two-level URL match
- `backend/urls.py`: `/api/...` → `include('api.urls')`.
- [`api/urls.py`](../../api/urls.py): `path('students/<int:student_id>/profile/', StudentProfileView.as_view())`.
  Captures `student_id = 5`. Next hop: the view.

### Hop 5 — The view (with the permission gate)
**File:** [`api/views.py`](../../api/views.py) → `StudentProfileView.get` (~line 1323)
```python
def get(self, request, student_id):                  # student_id = 5
    if request.user.role == 'ADMIN':
        student = Student.objects.get(id=student_id)                          # admin: any student
    else:
        student = Student.objects.get(id=student_id, assigned_users__user=request.user)  # else: only if assigned
    ...
    return Response(get_student_profile_data(student, request.user))          # hand off to service
```
- `request.user` was set from the cookie (Lesson 03 §7).
- The DB read happens at `Student.objects.get(...)`. If no matching/allowed student → it raises
  `DoesNotExist` → returns **404** → the frontend's `catch` sets `error` to "Failed to load profile."
- On success, it delegates to the service.

### Hop 6 — The service builds the data
**File:** `api/services/student_service.py` → `get_student_profile_data(student, user)`

This assembles the big object the page needs — student fields, the active cycle, which forms are
submitted (`form_statuses`), generated documents, assigned staff, etc. (Match it against the
`ProfileData` shape declared at the top of the page file — they line up key for key.) This
function is *where the feature actually lives.*

### Hop 7 — JSON back, screen updates
The service's dictionary becomes JSON, travels back to `api.get(...)` in Hop 2. `setData(res.data)`
fills the `data` box → **React re-renders** → the `return (...)` JSX now has real values and the
profile appears. `setLoading(false)` hides the spinner.

### Trace B as a picture
```
URL /students/5  →  app/students/[id]/page.tsx   (id = "5")
   useEffect → fetchProfile() → api.get('/api/students/5/profile/')  ──► lib/api.ts ──(GET +cookie)──► Django
                                                                                  │
   backend/urls.py → api/urls.py (students/<id>/profile/) → StudentProfileView.get(student_id=5)
        ├─ permission/role check
        ├─ Student.objects.get(...)                       ──► db.sqlite3
        └─ get_student_profile_data(...)  (api/services/student_service.py)  ──► more DB reads
   ◄────────────────────── JSON { student, form_statuses, ... } ──────────────────────
   setData(res.data) → React re-renders → profile shows
```

---

## Why this skill *is* debugging

Notice that at every hop there was a clearly marked failure point:

| Hop | If it breaks, the symptom is… | Where you'd look |
|---|---|---|
| 2 (effect) | page stays blank, no network call | the `useEffect` deps / `user` is null |
| 3 (api.ts) | request never sent, or wrong URL | `baseURL`, the URL string |
| 4–5 (url/view) | 404 / 403 / 500 in the Network tab | `urls.py`, the view's permission + query |
| 5 (DB query) | "not found" though it exists | the role filter `assigned_users__user` |
| 6 (service) | data loads but a field is wrong/missing | the service function + serializer `fields` |
| 7 (render) | data arrives but screen is wrong | the JSX / state usage |

So "trace the feature" and "find the bug" are the *same activity*. Lesson 06 turns this into a
repeatable checklist.

---

## Exercises

1. **Trace it yourself, on paper.** Pick **logout**. Start at the logout button (search
   `logout` in `frontend/src`), and write the hops until you reach the Django view that clears
   the cookies. (Spoiler trail: a component calls `useAuth().logout` → `AuthContext.logout` →
   `api.post('/api/auth/logout/')` → `backend/urls.py` → `LogoutView` in `auth_views.py`.)
2. **Trace a write.** Pick "register a student" (admin fills the new-student form). Find the
   `api.post('/api/students/...')` call on the frontend, then follow it to `StudentViewSet.create`
   in `views.py`, then to the service it calls. Where does the parent invitation get created?
3. **Map a symptom.** Using the table above: a teammate says "I open a student and it says
   *Student not found or access denied*, but the student definitely exists." Which hop is it,
   and which exact line of which file produces that message?

> **Answer (3):** Hop 5 — `StudentProfileView.get` in `api/views.py`. The `else` branch's
> `Student.objects.get(id=student_id, assigned_users__user=request.user)` found nothing because
> that user isn't assigned to the student (no `StudentAccess` row). It's a *permissions* issue,
> not a missing student.

Next → [05-reading-big-files.md](05-reading-big-files.md)
