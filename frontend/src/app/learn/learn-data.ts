// Content for the interactive code course. Editing the text here updates the
// Map / Trace / Quiz tabs. The long-form lessons live as markdown in
// frontend/public/learn/ (served to LessonViewer) — keep those in sync with
// docs/learning/ if you edit one.

export type Side = 'FE' | 'BE' | 'DB';

export interface MapFile {
  name: string;
  path: string;
  desc: string;
}

export interface MapZone {
  side: Side;
  label: string;
  files: MapFile[];
}

export interface TraceStep {
  side: Side;
  file: string;
  title: string;
  dir: 'req' | 'res';
  desc: string;
  code: string;
}

export interface TraceScenario {
  key: string;
  label: string;
  steps: TraceStep[];
}

export interface Lesson {
  num: string;
  slug: string;
  title: string;
  blurb: string;
}

export interface QuizItem {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

export const SIDE_LABEL: Record<Side, string> = {
  FE: 'Frontend',
  BE: 'Backend',
  DB: 'Database',
};

export const MAP_ZONES: MapZone[] = [
  {
    side: 'FE',
    label: 'Browser · Frontend',
    files: [
      { name: 'page.tsx', path: 'frontend/src/app/.../page.tsx', desc: 'The screen for a URL. Folders under src/app/ ARE the URLs. Holds state (data/loading/error) and fetches data in a useEffect.' },
      { name: 'components/', path: 'frontend/src/components/', desc: 'Reusable UI pieces — Navbar, sidebars, buttons. Pages stitch these together.' },
      { name: 'AuthContext.tsx', path: 'frontend/src/context/AuthContext.tsx', desc: 'Holds "who is logged in" for the whole app. Any page reads it with useAuth(). Defines login / logout.' },
      { name: 'lib/api.ts', path: 'frontend/src/lib/api.ts', desc: 'THE single door to the backend. One configured Axios client. Attaches cookies + CSRF, auto-handles 401 → /login.' },
    ],
  },
  {
    side: 'BE',
    label: 'Server · Backend',
    files: [
      { name: 'urls.py', path: 'api/urls.py', desc: 'The switchboard: maps each URL to the view that handles it. When lost in views.py, start here.' },
      { name: 'views.py', path: 'api/views.py', desc: 'The endpoints (3,200+ lines). Thin on purpose: check who/if allowed, then hand off to a service.' },
      { name: 'services/', path: 'api/services/', desc: 'The real business logic — one file per topic (student, iep, report…). This is where features actually live.' },
      { name: 'serializers.py', path: 'api/serializers.py', desc: 'Translators between database objects and JSON. fields = [...] is the exact contract of what the frontend can see.' },
      { name: 'models.py', path: 'api/models.py', desc: 'The shape of your data. Each class is a database table (User, Student…). Each attribute is a column.' },
    ],
  },
  {
    side: 'DB',
    label: 'Database',
    files: [
      { name: 'db.sqlite3', path: 'db.sqlite3 (dev)', desc: 'The actual data — a single file in dev, PostgreSQL on Railway in production. Same code talks to both via the ORM.' },
    ],
  },
];

export const TRACES: TraceScenario[] = [
  {
    key: 'login',
    label: 'Log in',
    steps: [
      { side: 'FE', file: 'app/login/page.tsx', title: 'You click "Sign In"', dir: 'req', desc: 'The form\'s onSubmit runs handleLogin, which calls login() from useAuth().', code: 'const { login } = useAuth();\nawait login(email, password);' },
      { side: 'FE', file: 'context/AuthContext.tsx', title: 'AuthContext.login()', dir: 'req', desc: 'Gets a CSRF token, then POSTs your credentials to the backend.', code: 'await api.post("/api/auth/token/",\n  { email, password });' },
      { side: 'FE', file: 'lib/api.ts', title: 'The single door (Axios)', dir: 'req', desc: 'Adds the CSRF header + cookies and sends the request to the Django server.', code: 'POST http://localhost:8000/api/auth/token/\nbody: { email, password }' },
      { side: 'BE', file: 'backend/urls.py', title: 'Server switchboard', dir: 'req', desc: 'Matches the URL to the login view.', code: "path('api/auth/token/',\n  CookieTokenObtainPairView.as_view())" },
      { side: 'BE', file: 'api/auth_views.py', title: 'CookieTokenObtainPairView.post', dir: 'req', desc: 'Validates email + password, then mints signed JWT tokens.', code: "serializer.is_valid(raise_exception=True)\naccess = serializer.validated_data['access']" },
      { side: 'DB', file: 'db.sqlite3', title: 'Check the User table', dir: 'req', desc: 'Credentials are verified against the stored (hashed) password.', code: 'User.objects.get(email=…)\n# password checked' },
      { side: 'BE', file: 'api/auth_views.py', title: 'Set HttpOnly cookies', dir: 'res', desc: 'Tokens are attached as secure cookies. The JSON body returns just user_id, role, email — never the raw token.', code: 'return _set_auth_cookies(\n  response, access, refresh)' },
      { side: 'FE', file: 'context/AuthContext.tsx', title: 'Remember the user', dir: 'res', desc: 'setUser() stores who is logged in, then checkAuth() fetches the full profile via /api/auth/me/.', code: 'setUser(basicUser);\nconst fullUser = await checkAuth();' },
      { side: 'FE', file: 'app/login/page.tsx', title: 'Redirect by role', dir: 'res', desc: 'Admins → /dashboard. Teachers & specialists → /workspace.', code: 'router.push(landingRoute);' },
    ],
  },
  {
    key: 'profile',
    label: 'View a student profile',
    steps: [
      { side: 'FE', file: 'app/students/[id]/page.tsx', title: 'URL → page', dir: 'req', desc: 'Folders = URLs. [id] captures the student number from the address.', code: '// visiting /students/5\nconst id = params?.id;  // "5"' },
      { side: 'FE', file: 'app/students/[id]/page.tsx', title: 'useEffect fetches data', dir: 'req', desc: 'After the page renders, the effect calls the profile endpoint.', code: 'const res = await api.get(\n  `/api/students/${id}/profile/`);' },
      { side: 'FE', file: 'lib/api.ts', title: 'The single door (Axios)', dir: 'req', desc: 'Attaches your auth cookie automatically and sends the GET.', code: 'GET http://localhost:8000\n  /api/students/5/profile/' },
      { side: 'BE', file: 'api/urls.py', title: 'Match the route', dir: 'req', desc: 'The dynamic URL maps to StudentProfileView, capturing student_id = 5.', code: "path('students/<int:student_id>/profile/',\n  StudentProfileView.as_view())" },
      { side: 'BE', file: 'api/views.py', title: 'StudentProfileView.get', dir: 'req', desc: 'Checks permission, then queries the student. Non-admins only see students they are assigned to.', code: "if request.user.role == 'ADMIN':\n  student = Student.objects.get(id=student_id)" },
      { side: 'DB', file: 'db.sqlite3', title: 'Read the student', dir: 'req', desc: 'Returns the row — or nothing if you are not allowed to see it (→ 404).', code: 'Student.objects.get(\n  id=5, assigned_users__user=me)' },
      { side: 'BE', file: 'api/services/student_service.py', title: 'Build the profile JSON', dir: 'res', desc: 'A service assembles the full object: student, active cycle, form statuses, documents.', code: 'return get_student_profile_data(\n  student, user)' },
      { side: 'FE', file: 'app/students/[id]/page.tsx', title: 'Show it', dir: 'res', desc: 'setData(res.data) → React re-renders → the profile appears, spinner gone.', code: 'setData(res.data);\n// screen updates automatically' },
    ],
  },
];

export const LESSONS: Lesson[] = [
  { num: '00', slug: 'README', title: 'Start Here', blurb: 'How the course works, the one mental model, and how to study it together.' },
  { num: '01', slug: '01-the-big-picture', title: 'The Big Picture', blurb: 'What ARASE is, the frontend/backend split, and where every file lives.' },
  { num: '02', slug: '02-frontend-tour', title: 'Frontend Tour', blurb: 'Read a Next.js page; folders = URLs; where API calls happen.' },
  { num: '03', slug: '03-backend-tour', title: 'Backend Tour', blurb: 'Follow a request: URL → view → service → model → database.' },
  { num: '04', slug: '04-trace-a-feature', title: 'Trace a Feature', blurb: 'The key skill — follow login & a profile load end-to-end.' },
  { num: '05', slug: '05-reading-big-files', title: 'Reading Big Files', blurb: 'Navigate the 3,200-line views.py without scrolling.' },
  { num: '06', slug: '06-debugging-playbook', title: 'Debugging Playbook', blurb: 'The 5-step method + Network tab, tracebacks, prints.' },
  { num: '07', slug: '07-glossary', title: 'Glossary', blurb: 'Every scary word (JWT, CSRF, serializer…) in plain English.' },
];

export const QUIZ: QuizItem[] = [
  { q: 'In Next.js (your frontend), what decides a page\'s URL?', options: ['Its folder path under src/app/', 'A central routes.json file', 'The component\'s function name'], answer: 0, explain: 'Folders under src/app/ ARE the URLs. students/[id]/page.tsx serves /students/5.' },
  { q: 'A request comes back 403 Forbidden. What does it mean here?', options: ['You\'re logged in but not allowed (a role check)', 'The server crashed', 'The page doesn\'t exist'], answer: 0, explain: '403 = authorization. Usually an "Only admins can…" role check. (500 = crash, 404 = not found.)' },
  { q: 'Which file is the single door all backend calls go through?', options: ['frontend/src/lib/api.ts', 'AuthContext.tsx', 'api/views.py'], answer: 0, explain: 'Every api.get / api.post runs through lib/api.ts — your one configured Axios client.' },
  { q: 'Where does the real business logic live on the backend?', options: ['api/services/', 'api/urls.py', 'api/models.py'], answer: 0, explain: 'Views are thin orchestrators; the heavy lifting is in api/services/*.' },
  { q: 'You hit a 500 error. Where is the detailed traceback?', options: ['The terminal running manage.py runserver', 'The browser\'s Console tab', 'The Network tab\'s Status column'], answer: 0, explain: 'A 500 means Django crashed — the Python traceback prints in the runserver terminal. Read it bottom-up.' },
];
