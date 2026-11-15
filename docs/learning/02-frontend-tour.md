# Lesson 02: The Frontend Tour

**You'll be able to:** read a Next.js page top to bottom, find which file draws any URL, and
spot the exact line where a page asks the backend for data.

**Time:** ~40 min · **Open:** [`frontend/src/app/students/[id]/page.tsx`](../../frontend/src/app/students/[id]/page.tsx),
[`frontend/src/lib/api.ts`](../../frontend/src/lib/api.ts),
[`frontend/src/context/AuthContext.tsx`](../../frontend/src/context/AuthContext.tsx)

We'll use one real page the whole way: the **student profile page**.

---

## 1. Folders are URLs (the App Router)

Next.js has a rule so simple it feels like a trick: **the folder path under `src/app/` *is*
the URL**, and the screen for that URL is the `page.tsx` inside it.

| Folder in `src/app/` | URL in the browser |
|---|---|
| `login/page.tsx` | `/login` |
| `dashboard/page.tsx` | `/dashboard` |
| `workspace/page.tsx` | `/workspace` |
| `students/[id]/page.tsx` | `/students/5`, `/students/42`, … |
| `students/[id]/reports/page.tsx` | `/students/5/reports` |
| `admin/iep/page.tsx` | `/admin/iep` |

Square brackets (`[id]`) mean **"anything can go here, and capture it."** One file handles
`/students/5` *and* `/students/999`, and the page can read which number was used (§4).

> **Debugging payoff:** you find a screen's code by reading its URL. Broken thing at
> `/students/5/reports`? The file is `frontend/src/app/students/[id]/reports/page.tsx`. No
> searching needed.

Special filenames that sit next to `page.tsx`:
- **`layout.tsx`** wraps pages. The root one, [`frontend/src/app/layout.tsx`](../../frontend/src/app/layout.tsx),
  wraps **every** page. `students/[id]/layout.tsx` wraps only the student pages.
- **`globals.css`** holds app-wide styles and the color tokens (`--accent-primary`, etc.).

> **Heads-up, URLs with query strings:** some screens switch content using `?` parameters
> instead of folders. `/workspace?workspace=reports&studentId=5` is still
> `workspace/page.tsx`. The page reads `workspace` and `studentId` and decides what to show.
> Folders pick the *file*; the `?…` part is read *inside* the file.

---

## 2. `"use client"`: the first line of almost every page

```tsx
"use client";
```

This tells Next.js **"run this component in the browser."** Browser things like clicking,
typing, `useState`, `useEffect`, and calling your API only work in client components.

The practical rule here: **the pages you'll debug are client components.** If you see a
file *without* it and `useState` throws an error, that's why.

---

## 3. Read a component as a recipe

A React component is **a function that returns what to show.** Strip away the noise and
every page looks like this:

```tsx
export default function SomePage() {
  // 1. STATE: boxes holding values that can change
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // 2. EFFECTS: code that runs at certain moments (like when the page first appears)
  useEffect(() => { /* go fetch data */ }, []);

  // 3. HANDLERS: functions that run when the user does something
  const handleClick = () => { /* ... */ };

  // 4. RETURN: the screen, written in JSX (HTML-ish)
  return <div>...</div>;
}
```

Lost on a page? Find those four parts and **read them in order: state, effects, handlers,
return.** Now map them onto the real student page.

> **Note on file layout:** `students/[id]/page.tsx` actually defines a component called
> `StudentProfileContent` (around line 90) and a small default export at the bottom that
> uses it. That's so the same profile can be shown inside the workspace too. When a page
> file feels split, look for `export default`. That's what the URL renders.

### State: `useState`

```tsx
const [data, setData] = useState<ProfileData | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
```

Read `const [data, setData] = useState(null)` as: *"make a box called `data`, starting
empty. To change it, call `setData(...)`. When it changes, redraw the screen."* That last
part is the core of React: **change the state and the screen updates by itself.**

The trio **`data / loading / error`** shows up on nearly every page in ARASE. Learn it once,
recognize it everywhere.

### Effect: `useEffect` (where data gets fetched)

```tsx
const fetchProfile = useCallback(async () => {
  try {
    const res = await api.get(`/api/students/${id}/profile/`);
    setData(res.data);
  } catch (err: any) {
    setError(err.response?.data?.error || "Failed to load profile.");
  } finally {
    setLoading(false);
  }
}, [id]);

useEffect(() => {
  if (user && id) {
    fetchProfile();
  }
}, [fetchProfile, id, user]);
```

Read slowly. This is the heart of the page:

- `useEffect(() => {...}, [deps])` means **"run this after the page draws, and again
  whenever anything in `[deps]` changes."** Here it waits until the user is known *and*
  there's an `id`.
- `api.get('/api/students/${id}/profile/')` is **the round trip**. `${id}` drops in the
  student number from the URL.
- `await` means "wait for the server's answer before going on."
- Success: `setData(res.data)` puts the answer in the box and the screen redraws.
- Failure: `setError(...)`. Note `err.response?.data?.error`. That's the `"error"` message
  the backend sent, shown as-is.
- `finally { setLoading(false) }` stops the spinner either way.

> **This block is your best debugging anchor on any page.** It names the exact backend URL
> the page depends on. If the page shows no data, you now know which endpoint to check.

> **Predict:** what happens if `user` is `null` forever (say, the login cookie is broken)?
> (Answer at the bottom.)

### Return: JSX

The `return (...)` at the bottom is the screen. It's HTML with two extras:
- `{ }` drops in a JavaScript value: `{data.student.first_name}`.
- `condition && <Thing/>` shows `<Thing/>` only when the condition is true.

Debugging the *look*? Read the JSX. Debugging the *data*? Read the state and effect above it.

---

## 4. Reading the URL inside the page

```tsx
const params = useParams();
const id = propStudentId || (params?.id as string);
```

`useParams()` gives you the captured pieces. For `/students/5`, `params.id` is `"5"` (a
string, not a number). `propStudentId ||` lets the workspace pass a student in directly
instead of through the URL.

For `?query` values, pages use `useSearchParams()` instead. Search the workspace page for it.

---

## 5. What wraps every page

Open [`frontend/src/app/layout.tsx`](../../frontend/src/app/layout.tsx):

```tsx
<AuthProvider>
  <AppToaster />
  <AccessibilityLoader />
  <NotificationProvider>
    <RealtimeProvider>
      <SkipToContent />
      ...
      <AppShell>{children}</AppShell>
    </RealtimeProvider>
  </NotificationProvider>
</AuthProvider>
```

`{children}` is whatever page you're on. Everything around it is **always there**:

| Wrapper | File | What it does |
|---|---|---|
| `AuthProvider` | `context/AuthContext.tsx` | Tracks who's logged in. Any page can ask via `useAuth()`. |
| `AppToaster` | `components/AppToaster.tsx` | Draws the Sonner pop-ups ("Saved!", errors). |
| `AccessibilityLoader` | `components/AccessibilityLoader.tsx` | Applies saved accessibility settings (font size, contrast). |
| `NotificationProvider` | `hooks/useNotifications.tsx` | The bell icon and its live notification socket. |
| `RealtimeProvider` | `components/RealtimeProvider.tsx` | One WebSocket that tells pages "data changed, refetch." (Lesson 05) |
| `AppShell` | `components/AppShell.tsx` | The frame: picks the admin or user sidebar, the floating tools. |

> **Mental model:** the page is the filling, the layout is the sandwich. When *every* page
> breaks the same way (nobody stays logged in, no toasts anywhere), suspect a wrapper. When
> *one* page breaks, suspect that page.

### Who's allowed on this page? `ProtectedRoute`

Many pages wrap themselves in [`components/ProtectedRoute.tsx`](../../frontend/src/components/ProtectedRoute.tsx):

```tsx
<ProtectedRoute allowedRoles={['ADMIN']}> ... </ProtectedRoute>
```

It sends logged-out users to `/login` and wrong-role users to `/dashboard`. **This is for
convenience, not security.** Someone could bypass it in their browser. The real check is on
the backend (Lesson 03). Both should agree.

---

## 6. `useAuth()`: "who's logged in," anywhere

[`AuthContext.tsx`](../../frontend/src/context/AuthContext.tsx) uses React **Context**: a way
to share one value with the whole app without passing it down by hand. Pages use it in one
line:

```tsx
const { user } = useAuth();
```

Now `user` is the logged-in person (or `null`). `user.role` decides which buttons to show;
`user.user_id` is their id. The full shape is `UserPayload` in
[`frontend/src/types/index.ts`](../../frontend/src/types/index.ts). Go read the field names.
That's everything any page can know about the current user.

`AuthContext` also defines `login`, `logout`, and `refreshUser`. Lesson 04 traces `login`.

---

## 7. `lib/api.ts`: the single door to the backend

The most important non-page file in the frontend. You don't need all of it today, just
these facts:

1. **One configured Axios client**, exported as the default. Pages write
   `import api from "@/lib/api"`, then `api.get(...)` / `api.post(...)`. (Team rule: never
   use `fetch` for the backend. This file is why.)

2. **Where requests actually go depends on the environment:**

   | Where you are | `baseURL` | So `api.get('/api/students/')` hits… |
   |---|---|---|
   | Local dev | `http://localhost:8000` | Django directly |
   | Production | `''` (empty = same site) | `https://<the vercel site>/api/students/`, which Next.js forwards to Railway |

   That production forwarding is set up in [`frontend/next.config.ts`](../../frontend/next.config.ts)
   (`rewrites`). Lesson 10 explains why it exists. It fixed a real login bug.

3. **`withCredentials: true`** sends your login cookies with every request. That's how the
   backend knows who you are without the page ever touching a password or token.

4. Two **interceptors** run on every request/response automatically:
   - *Request:* on writes (POST/PATCH/PUT/DELETE) it attaches the CSRF token header
     (`X-CSRFToken`), fetching one first if needed.
   - *Response:* on a **401** it quietly tries `/api/auth/token/refresh/` once and retries
     the request. If that fails, it sends you to `/login`.

5. At the bottom, `buildWsUrl()` builds the WebSocket address for live updates (Lesson 05).

> **Debugging payoff:** "The app randomly kicks me to login" → that redirect is literally
> `window.location.href = '/login'` in the response interceptor. "Every save fails with a
> CSRF error" → the request interceptor. You know where to look instead of guessing.

---

## The frontend in one picture

```
layout.tsx  (wraps everything: AuthProvider, RealtimeProvider, AppShell…)
    │
    └── page.tsx  (the screen for this URL)
            │  reads the URL with useParams() / useSearchParams()
            │  reads the current user with useAuth()
            │  holds data / loading / error with useState
            │
            └── useEffect → api.get('/api/.../')  ──► lib/api.ts ──► network ──► Django
                                                          ▲
                                                          └ adds cookies + CSRF, handles 401
```

---

## Exercises

1. **Find the fetch.** Open `frontend/src/app/dashboard/page.tsx`. Find the `api.get(...)`.
   Write down the backend URL it calls. Then notice: for admins this page returns a
   different component entirely. Find the line that does that.
2. **State spotting.** In that same file, list five `useState(...)` calls and guess in a few
   words what each holds.
3. **Door check.** Search `frontend/src` for `from "@/lib/api"`. Roughly how many files
   import it? That's "how many places talk to the backend."
4. **Guard check.** Open `frontend/src/app/learn/page.tsx`. Which roles can see it? Is that
   enforced anywhere on the backend? (Think about it: does `/learn` call any API?)

---

## Answers

- **Predict (§3):** the effect never calls `fetchProfile`, so no request is sent and
  `loading` stays `true`. The page looks stuck. The Network tab would show *no* profile
  request at all, which is your clue it's a frontend/auth issue, not the profile endpoint.
1. `api.get("/api/students/")` (around line 125). Near line 303:
   `if (user?.role === "ADMIN") return <AdminDashboard />;`. Admins get
   `dashboard/AdminDashboard.tsx`, which calls `/api/students/`, `/api/users/`,
   `/api/invitations/`, and `/api/dashboard/actions/`.
2. For example: `students` (the list), `loading`, `searchQuery` (search box text),
   `gradeFilter`, `currentPage`, `viewMode` (grid or list).
3. Around 28 files. Every one of them goes through the same door.
4. Only `ADMIN`. The lessons are static files and the page calls no API, so there's
   nothing to protect on the backend. That's fine here, but it means the lesson `.md` files
   in `frontend/public/learn/` are public to anyone with the URL. Never put secrets in them.

Next → [03-backend-tour.md](03-backend-tour.md)
