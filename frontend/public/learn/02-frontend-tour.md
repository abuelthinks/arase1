# Lesson 02 — The Frontend Tour

**Goal:** Read a Next.js page from top to bottom and know what every part does. Understand
how a URL becomes a file, where data-fetching happens, and how "who's logged in" flows through
the app.

We'll use one real page as our specimen the whole way: the **student profile page**,
[`frontend/src/app/students/[id]/page.tsx`](../../frontend/src/app/students/[id]/page.tsx).
Open it now.

---

## 1. Folders are URLs (the App Router)

Next.js uses a rule so simple it feels like a trick: **the folder path under `src/app/`
*is* the URL**, and the screen for that URL is the `page.tsx` file inside it.

| Folder in `src/app/` | URL in the browser |
|---|---|
| `login/page.tsx` | `/login` |
| `dashboard/page.tsx` | `/dashboard` |
| `students/[id]/page.tsx` | `/students/5`, `/students/42`, … |
| `admin/iep/page.tsx` | `/admin/iep` |

The square brackets — `[id]` — mean **"anything goes here, and capture it."** So
`students/[id]/page.tsx` handles `/students/5` *and* `/students/999`, and the page can read
which number was used. You'll see how in §4.

> **Debugging payoff:** When a screen misbehaves, you find its code by reading the URL.
> Broken thing is at `/students/5/reports`? The file is
> `frontend/src/app/students/[id]/reports/page.tsx`. No searching required.

A few special filenames live alongside `page.tsx`:
- **`layout.tsx`** — a wrapper that renders *around* pages. The root one,
  [`frontend/src/app/layout.tsx`](../../frontend/src/app/layout.tsx), wraps **every** page in
  the app. (More in §5.)
- **`globals.css`** — app-wide styles.

---

## 2. `"use client"` — the most important line on the page

Look at the very first line of almost every `page.tsx`:

```tsx
"use client";
```

This tells Next.js: **"run this component in the browser."** That matters because browser-only
features — clicking, typing, `useState`, `useEffect`, talking to your API — only work in
client components.

For your app, the practical rule is: **the interactive pages you'll debug are client
components.** If you ever see a file *without* `"use client"` at the top and wonder why
`useState` throws an error — that's why. (You won't hit this often; just recognize the line.)

---

## 3. Reading a React component as a recipe

A React component is **a function that returns the HTML to show.** That's the whole concept.
Strip away the noise and every page looks like this:

```tsx
export default function SomePage() {
    // 1. STATE: little boxes that hold values which can change over time
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    // 2. EFFECTS: code that runs at certain moments (e.g. when the page first appears)
    useEffect(() => { /* go fetch data */ }, []);

    // 3. HANDLERS: functions that run when the user does something
    const handleClick = () => { /* ... */ };

    // 4. RETURN: the actual screen, described in JSX (HTML-ish syntax)
    return <div>...</div>;
}
```

Whenever you open a page and feel lost, find those four parts. **Read them in order: state,
effects, handlers, return.** That's it. Let's map them onto the real student page.

### State — `useState`
Near the top of `students/[id]/page.tsx`:

```tsx
const [data, setData] = useState<ProfileData | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
```

Read `const [data, setData] = useState(null)` as: *"make a box called `data`, starting empty
(`null`). To change it, call `setData(...)`. When I change it, redraw the screen."* That last
part is the magic of React — **change the state, and the matching part of the screen updates
automatically.** You never hand-update the DOM.

- `data` will hold the student's profile once it arrives from the backend.
- `loading` is `true` until the data arrives — used to show a spinner.
- `error` holds an error message if the request fails.

This trio — `data / loading / error` — is a pattern you'll see on nearly every page in ARASE.
Recognize it once and you recognize it everywhere.

### Effect — `useEffect` (where data-fetching happens)
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

This is the heart of the page, so read it slowly:

- `useEffect(() => { ... }, [deps])` means **"run this function after the page renders, and
  re-run it whenever anything in `[deps]` changes."** Here it runs once the user is known and
  an `id` exists.
- `fetchProfile` calls **`api.get('/api/students/${id}/profile/')`** — this is the round trip
  from the intro. `api` is your backend door (next section). `${id}` plugs in the student
  number from the URL.
- `await` means "wait for the server to answer before continuing."
- On success: `setData(res.data)` drops the server's answer into the `data` box → screen redraws.
- On failure: `setError(...)`.
- `finally: setLoading(false)` — either way, stop showing the spinner.

> **This block is your single most useful debugging anchor on any page.** It names the exact
> backend URL the page depends on (`/api/students/{id}/profile/`). If the page shows no data,
> you now know precisely which endpoint to check on the backend (Lesson 03 picks up that thread).

### Return — JSX
The `return (...)` at the bottom is the screen. It's HTML with two superpowers:
- `{ }` drops a JavaScript value in: `{data.student.first_name}` prints the name.
- `condition && <Thing/>` shows `<Thing/>` only if `condition` is true:
  `{loading && <Spinner/>}` shows a spinner only while loading.

You don't need to understand every styled `<div>`. When debugging the *look* of something,
read the JSX; when debugging the *data*, read the state + effect above it.

---

## 4. Reading the URL inside the page

Remember `[id]` captures part of the URL. The page grabs it like this (top of the component):

```tsx
const params = useParams();
const id = propStudentId || (params?.id as string);
```

`useParams()` hands you the captured pieces. For `/students/5`, `params.id` is `"5"`. That's
how the same file serves every student — it reads the number and asks the backend for *that*
student. (The `propStudentId ||` part lets the same component be reused embedded inside another
page — ignore it for now.)

---

## 5. The pieces that wrap every page

Open [`frontend/src/app/layout.tsx`](../../frontend/src/app/layout.tsx). This renders once,
around everything. Notice it nests a stack of "providers":

```tsx
<AuthProvider>
  <AppToaster />
  <NotificationProvider>
    <RealtimeProvider>
      ...
      <AppShell>{children}</AppShell>
    </RealtimeProvider>
  </NotificationProvider>
</AuthProvider>
```

`{children}` is "whatever page you're on." Everything wrapped around it is **always present**:

- **`AuthProvider`** (from `context/AuthContext.tsx`) — tracks who's logged in. Because it
  wraps everything, *any* page can ask "who's the user?" via `useAuth()`.
- **`AppToaster`** — renders the little Sonner pop-up notifications ("Saved!", "Error").
- **`NotificationProvider` / `RealtimeProvider`** — the bell icon + live updates over WebSocket.
- **`AppShell`** — the visual frame (sidebar/layout) around page content.

> **Mental model:** a page is the filling; the layout is the sandwich. When *every* page has a
> problem (e.g. nobody can stay logged in), suspect the layout/providers. When *one* page has a
> problem, suspect that page.

---

## 6. `useAuth()` and Context — "who's logged in," available anywhere

Open [`frontend/src/context/AuthContext.tsx`](../../frontend/src/context/AuthContext.tsx).
"Context" is React's way to share one value with the whole app without passing it down by hand.

The student page uses it in one line:

```tsx
const { user } = useAuth();
```

Now `user` is the logged-in person (or `null`). `user.role` tells the page whether to show
admin-only buttons; `user.user_id` is their id. The whole object's shape is defined right at the
top of `AuthContext.tsx` as `UserPayload` — go read those field names; that's exactly what
every page can know about the current user.

`AuthContext.tsx` also defines the actions `login`, `logout`, and `refreshUser`. We'll trace
`login` end-to-end in Lesson 04 — it's the cleanest example of a full round trip.

---

## 7. `lib/api.ts` — the single door to the backend

This is the most important non-page file in the frontend. Open
[`frontend/src/lib/api.ts`](../../frontend/src/lib/api.ts). You do **not** need to understand
all of it today — just these facts:

1. It creates one configured Axios client and **exports it as the default**. That's why pages
   write `import api from "@/lib/api"` and then `api.get(...)`, `api.post(...)`. (Your team
   preference is "never use `fetch` directly — use Axios." This file is how that's enforced:
   one client, configured once.)

2. `baseURL` is set near the top — in dev it's `http://localhost:8000` (your Django server).
   So `api.get('/api/students/5/profile/')` actually hits
   `http://localhost:8000/api/students/5/profile/`.

3. **`withCredentials: true`** — it automatically sends your login cookies with every request.
   That's how the backend knows who you are without the page ever handling a password or token.

4. There are two **interceptors** — code that runs automatically on every request/response:
   - *Request interceptor:* attaches a CSRF token to writes (POST/PATCH/DELETE) for security.
   - *Response interceptor:* if the server says **401 (not authenticated)**, it quietly tries
     to refresh your session once; if that fails, it sends you to `/login`.

> **Debugging payoff:** "The app randomly kicks me to the login page" → that redirect is
> physically written in this file's response interceptor (`window.location.href = '/login'`).
> "All my saves fail with a CSRF error" → the request interceptor. You now know where to look
> instead of guessing.

---

## How the frontend pieces fit (one diagram)

```
  layout.tsx  (wraps everything, sets up AuthProvider + others)
      │
      └── page.tsx  (the screen for this URL)
              │  reads URL via useParams()
              │  reads current user via useAuth()
              │  holds data/loading/error via useState
              │
              └── useEffect → api.get('/api/.../')  ──► lib/api.ts ──► (network) ──► Django
                                                            ▲
                                                            └ adds cookies + CSRF, handles 401
```

---

## Exercises

1. **Find the fetch.** Open `frontend/src/app/dashboard/page.tsx`. Find its `useEffect` and the
   `api.get(...)` (or `api.post`) inside. **Write down the backend URL string it calls.** That's
   the endpoint the dashboard depends on — you'll learn to find its backend side next lesson.
2. **State spotting.** On that same dashboard page, list every `useState(...)`. For each, guess
   in a few words what it holds. (You're training the "state / effect / return" reading habit.)
3. **Door check.** Search the whole `frontend/src` folder for `from "@/lib/api"`. Roughly how
   many files import it? That number is "how many places talk to the backend" — and it confirms
   `api.ts` really is the single door.

Next → [03-backend-tour.md](03-backend-tour.md)
