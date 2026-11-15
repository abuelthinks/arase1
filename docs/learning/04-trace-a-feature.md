# Lesson 04: Trace a Feature End to End

**This is the most important lesson in the course.** Everything before it was vocabulary.
Here we follow two real features across both halves of the app, hop by hop, with exact files.
Once you can do this yourself, you can debug almost anything in ARASE.

**Time:** ~45 min · **Best done:** with the app running and DevTools → Network open

We'll trace:
- **A. Logging in** (a *write*: send a password, get a session). The cleanest full round trip.
- **B. Opening a student's profile** (a *read*: fetch data and show it). The everyday pattern.

---

## The skill we're practicing

> Start at what the user did. Find the *next* file it calls. Repeat until you reach the
> database. Then follow the answer back. **Each hop is one `import` or one URL.**

That's it. No magic, just patiently asking "okay, what runs *next*?" In your editor, the
move is: cursor on a name → **F12** (Go to Definition). Lesson 06 has more shortcuts.

---

## Trace A: Logging in

**User action:** types email and password on `/login`, clicks **Sign In**.

### Hop 1: The page handler
**File:** [`frontend/src/app/login/page.tsx`](../../frontend/src/app/login/page.tsx)

The form's `onSubmit` runs `handleLogin`:
```tsx
const { login } = useAuth();
...
const authenticatedUser = await login(email, password);
```
The page doesn't touch the network itself. It calls `login(...)`, which came from
`useAuth()`. So the next hop is **AuthContext**. (How do we know? `useAuth` is imported from
`@/context/AuthContext`. Follow the import.)

### Hop 2: The auth logic
**File:** [`frontend/src/context/AuthContext.tsx`](../../frontend/src/context/AuthContext.tsx) → `login`
```tsx
const login = async (email: string, password: string) => {
  await fetchCsrfCookie();                                          // (i) get a CSRF token first
  const res = await api.post("/api/auth/token/", { email, password }); // (ii) THE round trip
  const basicUser = { user_id: res.data.user_id, role: res.data.role, email: res.data.email };
  setUser(basicUser);                                               // (iii) remember who's logged in
  const fullUser = await checkAuth();                               // (iv) fetch the full profile
  return fullUser || basicUser;
};
```
Line **(ii)** is the request leaving the browser. Next hop: `api`, i.e. `lib/api.ts`.

### Hop 3: The door
**File:** [`frontend/src/lib/api.ts`](../../frontend/src/lib/api.ts)

`api.post` goes through the request interceptor, which adds the `X-CSRFToken` header
because it's a POST. Then it's sent with cookies (`withCredentials`):
```
Local:       POST http://localhost:8000/api/auth/token/      body: { email, password }
Production:  POST https://<vercel site>/api/auth/token/      → next.config.ts forwards it to Railway
```
**We've crossed the wire.** The request has left the frontend.

### Hop 4: The server's switchboard
**File:** [`backend/urls.py`](../../backend/urls.py)
```python
path('api/auth/token/', CookieTokenObtainPairView.as_view(), name='token_obtain_pair'),
```

### Hop 5: The login view
**File:** [`api/auth_views.py`](../../api/auth_views.py) → `CookieTokenObtainPairView.post`
```python
def post(self, request, *args, **kwargs):
    serializer = self.get_serializer(data=request.data)
    try:
        serializer.is_valid(raise_exception=True)          # (a) check email + password
    except TokenError as e:
        raise InvalidToken(e.args[0])

    access = serializer.validated_data['access']           # (b) signed tokens
    refresh = serializer.validated_data['refresh']
    user = serializer.user

    response = Response({'user_id': user.id, 'role': user.role, 'email': user.email,
                         'message': 'Login successful.'}, status=status.HTTP_200_OK)
    return _set_auth_cookies(response, access, refresh)    # (c) tokens go into HttpOnly cookies
```
- **(a)** The check happens in `CustomTokenObtainPairSerializer` in `serializers.py`. It
  finds the user by email *ignoring capitals* (`email__iexact`), then SimpleJWT compares the
  password against the hashed one in the `User` table. Wrong password → **401** → the page's
  `catch` shows "Invalid credentials" (or the backend's `detail` message).
- **(b)** On success, two tokens: short-lived **access**, longer-lived **refresh**. The
  serializer's `get_token` also puts `role` inside the token.
- **(c)** `_set_auth_cookies` sets them as **HttpOnly** cookies. The JSON body never
  contains the raw tokens. In production the cookies are `Secure` and `SameSite=None`; in
  dev they're `SameSite=Lax`.

### Hop 6: The answer comes back
Back in Hop 2: `res.data` is `{ user_id, role, email, message }`. `setUser(basicUser)` stores
it. Because `AuthProvider` wraps the whole app, **every page now knows who's logged in.**

### Hop 7: Fetch the full profile (a mini round trip)
`checkAuth()` calls `api.get("/api/auth/me/")`. Same journey: `api.ts` → `backend/urls.py`
→ `MeView.get` in `auth_views.py`. It reads `request.user` (identified from the cookie that
was *just* set) and returns a hand-built dict: names, phone, specialties, `grade_level`,
languages, onboarding/profile completeness. `setUser` runs again with the richer data.

### Hop 8: Redirect by role
Back in `login/page.tsx`:
```tsx
const landingRoute = authenticatedUser.role === "SPECIALIST" && authenticatedUser.specialist_onboarding_complete === false
  ? "/specialist-onboarding"
  : authenticatedUser.role === "ADMIN"
    ? "/dashboard"
    : ["TEACHER", "SPECIALIST"].includes(authenticatedUser.role)
      ? "/workspace"
      : "/dashboard";
router.push(landingRoute);
```
Notice this needs `specialist_onboarding_complete`, which only `/api/auth/me/` returns. That's
why Hop 7 exists.

### Trace A as a picture
```
login/page.tsx  handleLogin()
   └─ AuthContext.login()
        ├─ fetchCsrfCookie()   → GET /api/auth/csrf/   (sets the csrftoken cookie)
        ├─ api.post('/api/auth/token/') ──► lib/api.ts ──(POST + cookies + X-CSRFToken)──► Django
        │        backend/urls.py → CookieTokenObtainPairView.post   (api/auth_views.py)
        │           └─ CustomTokenObtainPairSerializer: find user by email, check password   (DB)
        │           └─ mint access + refresh → _set_auth_cookies() → Set-Cookie: HttpOnly
        │  ◄──────────── JSON { user_id, role, email } + Set-Cookie ─────────────
        ├─ setUser(basicUser)                        whole app now knows the user
        └─ checkAuth() → GET /api/auth/me/ → MeView → full user JSON → setUser(...)
   router.push('/specialist-onboarding' | '/dashboard' | '/workspace')
```

> **See it live:** log out, open DevTools → Network, log in. You'll see `csrf/`, `token/`,
> then `me/`, in that order. Click `token/` → **Response** shows the JSON; **Headers** shows
> two `Set-Cookie` lines. You just watched Hops 3–7 happen.

---

## Trace B: Opening a student's profile

**User action:** goes to `/students/5`.

### Hop 1: The URL picks the file
`/students/5` → `frontend/src/app/students/[id]/page.tsx`. `[id]` captures `"5"`.

### Hop 2: The page reads the id and fires an effect
**File:** [`frontend/src/app/students/[id]/page.tsx`](../../frontend/src/app/students/[id]/page.tsx) → `StudentProfileContent`
```tsx
const id = propStudentId || (params?.id as string);       // "5"

const fetchProfile = useCallback(async () => {
  const res = await api.get(`/api/students/${id}/profile/`);
  setData(res.data);
  ...
}, [id]);

useEffect(() => { if (user && id) fetchProfile(); }, [fetchProfile, id, user]);
```
After the page draws, the effect runs `fetchProfile`.

### Hop 3: Across to Django
`GET /api/students/5/profile/` with the `access_token` cookie attached automatically.

### Hop 4: Two-level URL match
- `backend/urls.py`: `api/` → `include('api.urls')`
- [`api/urls.py`](../../api/urls.py): `path('students/<int:student_id>/profile/', StudentProfileView.as_view())`
  → `student_id = 5`.

### Hop 5: Who are you? (runs before the view)
`CookieJWTAuthentication` in `api/authentication.py` reads the cookie and sets
`request.user`. No cookie or an expired one → **401** → `api.ts` tries a refresh.

### Hop 6: The view and its permission gate
**File:** [`api/views.py`](../../api/views.py) → `StudentProfileView.get` (~line 1440)
```python
if request.user.role == 'ADMIN':
    student = Student.objects.get(id=student_id)                                   # any student
else:
    student = Student.objects.get(id=student_id, assigned_users__user=request.user) # only if on the team
...
return Response(get_student_profile_data(student, request.user))
```
No match → `DoesNotExist` → **404** `"Student not found or access denied."`

### Hop 7: The service builds the payload
**File:** `api/services/student_service.py` → `get_student_profile_data(student, user)` (~line 138)

This assembles the big object the page needs: the student, the active cycle, which forms
are submitted (`form_statuses`), generated documents, and the assigned staff. It runs many
more DB queries. **This function is where the feature actually lives.**

### Hop 8: JSON back, screen updates
The returned dict becomes JSON, comes back to Hop 2's `api.get`. `setData(res.data)` →
React redraws → the profile appears. `setLoading(false)` hides the spinner.

### Trace B as a picture
```
URL /students/5  →  app/students/[id]/page.tsx   (id = "5")
   useEffect → fetchProfile() → api.get('/api/students/5/profile/') ──► lib/api.ts ──(GET + cookie)──► Django
                                                                              │
   backend/urls.py → api/urls.py → CookieJWTAuthentication (request.user) → StudentProfileView.get
        ├─ role check + Student.objects.get(...)                    ──► database
        └─ get_student_profile_data(...)  (services/student_service.py) ──► more queries
   ◄──────────────── JSON { student, active_cycle, form_statuses, ... } ────────────────
   setData(res.data) → React redraws → profile shows
```

---

## Why tracing *is* debugging

Every hop has a clear way to fail, and a clear symptom:

| Hop | If it breaks, you see… | Look at |
|---|---|---|
| 2 (effect) | blank page or endless spinner, **no request** in Network | the `useEffect` condition; is `user` null? |
| 3 (api.ts) | request goes to the wrong address, or never leaves | `baseURL`, the URL string, the browser Console |
| 4 (urls) | **404** with an HTML "Page not found" body | `api/urls.py`; typo or missing trailing slash |
| 5 (auth) | **401** then a bounce to `/login` | cookies in DevTools → Application → Cookies |
| 6 (view) | **403** or **404** with a JSON `error` | the view's role check and its query |
| 6–7 (code crash) | **500** | the **daphne terminal** traceback |
| 7 (service) | 200 OK, but a field is wrong or missing | the service function, or the serializer `fields` |
| 8 (render) | correct data in Network → Response, wrong on screen | the JSX and how state is used |

So "trace the feature" and "find the bug" are the *same activity*. Lesson 07 turns this
into a checklist.

---

## Exercises

1. **Trace logout yourself.** Start at the logout button (search `logout()` in
   `frontend/src/components`). Write every hop until you reach the Django code that clears
   the cookies. What happens to the refresh token on the server?
2. **Trace a write.** Admin registers a new student. Find the `api.post("/api/students/", ...)`
   on the frontend (hint: `AdminDashboard.tsx`), follow it to `StudentViewSet.create`, then
   to the service. Which function creates the parent invitation?
3. **Map a symptom.** A teammate says: "I open a student and it says *Student not found or
   access denied*, but the student definitely exists." Which hop? Which exact line? Is it a
   code bug or a data problem?
4. **Watch it.** With Network open, load `/students/<some id>`. Find the `profile/` request.
   What's its status? Open **Response** and find `form_statuses`.

---

## Answers

1. `Navbar.tsx` (and the sidebars) call `logout()` from `useAuth()` → `AuthContext.logout`
   → `fetchCsrfCookie()` then `api.post("/api/auth/logout/")` → `backend/urls.py` →
   `LogoutView.post` in `auth_views.py`. It runs `enforce_csrf`, deletes both cookies, and
   **blacklists** the refresh token so it can't be reused. Back on the frontend,
   `setUser(null)` and a hard redirect to `/login`, even if the request failed.
2. `AdminDashboard.tsx` → `api.post("/api/students/", { parent_email: ... })` →
   `StudentViewSet.create` → `create_student_with_invitation` in
   `api/services/student_service.py` (~line 16). It creates the `Student` and the
   `Invitation` together. Then the view calls `create_activity_event('STUDENT_CREATED', …)`.
3. Hop 6, `StudentProfileView.get`, the `else` branch:
   `Student.objects.get(id=student_id, assigned_users__user=request.user)`. The user has no
   `StudentAccess` row for that student. **Data problem, not a code bug.** The fix is to
   assign them to the team, not to loosen the check.
4. Usually **200**. `form_statuses` lists each form (parent assessment, trackers, …) with
   whether it's submitted.

Next → [05-background-jobs-and-live-updates.md](05-background-jobs-and-live-updates.md)
