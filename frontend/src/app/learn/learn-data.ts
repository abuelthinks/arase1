// Content for the interactive code course. Editing the text here updates the
// Map / Trace / Symptoms / Quiz tabs. The long-form lessons live as markdown in
// frontend/public/learn/ (served to LessonViewer) — keep those in sync with
// docs/learning/ if you edit one.

export type Side = 'FE' | 'BE' | 'BG' | 'DB';

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
  part: string;
  // Reference pages don't count toward progress.
  reference?: boolean;
}

export interface Symptom {
  symptom: string;
  side: Side;
  cause: string;
  check: string;
  where: string[];
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
  BG: 'Background',
  DB: 'Database',
};

export const MAP_ZONES: MapZone[] = [
  {
    side: 'FE',
    label: 'Browser · Frontend',
    files: [
      { name: 'page.tsx', path: 'frontend/src/app/.../page.tsx', desc: 'The screen for a URL. Folders under src/app/ ARE the URLs ([id] = any value). Holds data/loading/error state and fetches in a useEffect.' },
      { name: 'layout.tsx', path: 'frontend/src/app/layout.tsx', desc: 'Wraps every page: AuthProvider, toasts, NotificationProvider, RealtimeProvider, AppShell. If every page breaks the same way, look here.' },
      { name: 'AuthContext.tsx', path: 'frontend/src/context/AuthContext.tsx', desc: 'Holds "who is logged in" for the whole app. Any page reads it with useAuth(). Defines login / logout.' },
      { name: 'lib/api.ts', path: 'frontend/src/lib/api.ts', desc: 'THE single door to the backend. One Axios client: sends cookies, adds the CSRF header on writes, refreshes on 401 then sends you to /login. Also builds WebSocket URLs.' },
      { name: 'next.config.ts', path: 'frontend/next.config.ts', desc: 'In production, rewrites /api/* from the Vercel site to Railway so auth cookies stay first-party. Keeps the trailing slash Django needs.' },
    ],
  },
  {
    side: 'BE',
    label: 'Server · Backend',
    files: [
      { name: 'urls.py', path: 'backend/urls.py → api/urls.py', desc: 'The switchboard. backend/urls.py holds auth routes and sends /api/ to api/urls.py, which maps each URL to a view. When lost in views.py, start here.' },
      { name: 'authentication.py', path: 'api/authentication.py', desc: 'Reads the access_token cookie, verifies the JWT, sets request.user. Also enforces CSRF on writes.' },
      { name: 'views.py', path: 'api/views.py', desc: 'The endpoints (3,400 lines, grouped by # ─── banners). Thin on purpose: check who is allowed, then hand off to a service.' },
      { name: 'services/', path: 'api/services/', desc: 'The real business logic, one file per topic (student, iep, cycle, realtime…). This is where features actually live.' },
      { name: 'serializers.py', path: 'api/serializers.py', desc: 'Translators between database rows and JSON. fields = [...] is the exact contract of what the frontend can see.' },
      { name: 'models.py', path: 'api/models.py', desc: 'The shape of the data. Each class is a table (User, Student, StudentAccess, ReportCycle…). Each attribute is a column.' },
    ],
  },
  {
    side: 'BG',
    label: 'Background · Live',
    files: [
      { name: 'tasks.py', path: 'api/tasks.py', desc: 'Slow jobs run by the Celery worker (a separate program): IEP and monthly report generation, translation. Prints show in the Celery terminal.' },
      { name: 'Redis', path: 'REDIS_URL', desc: 'The queue between the backend and the worker. .delay() drops a job here. In production it also carries live messages between processes.' },
      { name: 'realtime_service.py', path: 'api/services/realtime_service.py', desc: 'create_activity_event() saves an event and pushes it to channel-layer groups (admins, assigned users) after the DB commit.' },
      { name: 'consumers.py', path: 'api/consumers.py', desc: 'WebSocket handlers. RealtimeConsumer forwards events to the browser; NotificationConsumer feeds the bell; CollaborationConsumer handles shared form editing.' },
      { name: 'RealtimeProvider.tsx', path: 'frontend/src/components/RealtimeProvider.tsx', desc: 'One socket per tab. On a message it fires a browser event; pages using useRealtimeRefresh() refetch if the event matches their targets.' },
    ],
  },
  {
    side: 'DB',
    label: 'Database',
    files: [
      { name: 'db.sqlite3', path: 'db.sqlite3 (dev) · PostgreSQL (live)', desc: 'The actual data. A single file locally, PostgreSQL on Railway. Same code talks to both through the ORM.' },
      { name: 'migrations/', path: 'api/migrations/', desc: 'The history of table changes. makemigrations writes one, migrate applies it. Production runs migrate on every deploy.' },
    ],
  },
];

export const TRACES: TraceScenario[] = [
  {
    key: 'login',
    label: 'Log in',
    steps: [
      { side: 'FE', file: 'app/login/page.tsx', title: 'You click "Sign In"', dir: 'req', desc: 'The form\'s onSubmit runs handleLogin, which calls login() from useAuth().', code: 'const { login } = useAuth();\nconst authenticatedUser = await login(email, password);' },
      { side: 'FE', file: 'context/AuthContext.tsx', title: 'AuthContext.login()', dir: 'req', desc: 'Makes sure a CSRF cookie exists, then POSTs the credentials.', code: 'await fetchCsrfCookie();\nconst res = await api.post("/api/auth/token/",\n  { email, password });' },
      { side: 'FE', file: 'lib/api.ts', title: 'The single door (Axios)', dir: 'req', desc: 'Adds the X-CSRFToken header and cookies. Locally it goes straight to Django; live, it goes to the Vercel site, which forwards /api/* to Railway.', code: 'Local: POST http://localhost:8000/api/auth/token/\nLive:  POST /api/auth/token/  → rewritten to Railway' },
      { side: 'BE', file: 'backend/urls.py', title: 'Server switchboard', dir: 'req', desc: 'Auth routes live in the top-level URL file.', code: "path('api/auth/token/',\n  CookieTokenObtainPairView.as_view())" },
      { side: 'BE', file: 'api/auth_views.py', title: 'CookieTokenObtainPairView.post', dir: 'req', desc: 'CustomTokenObtainPairSerializer finds the user by email (ignoring capitals) and checks the password. Wrong password → 401.', code: "serializer.is_valid(raise_exception=True)\naccess = serializer.validated_data['access']" },
      { side: 'DB', file: 'db.sqlite3', title: 'Check the User table', dir: 'req', desc: 'The password is compared against the stored hash.', code: 'User.objects.filter(email__iexact=…)\n# password hash checked' },
      { side: 'BE', file: 'api/auth_views.py', title: 'Set HttpOnly cookies', dir: 'res', desc: 'access_token and refresh_token go into HttpOnly cookies. The JSON body only has user_id, role, email.', code: 'return _set_auth_cookies(\n  response, access, refresh)' },
      { side: 'FE', file: 'context/AuthContext.tsx', title: 'Remember the user', dir: 'res', desc: 'setUser() stores the basics, then checkAuth() calls /api/auth/me/ (MeView) for the full profile.', code: 'setUser(basicUser);\nconst fullUser = await checkAuth();' },
      { side: 'FE', file: 'app/login/page.tsx', title: 'Redirect by role', dir: 'res', desc: 'Specialists with unfinished onboarding → /specialist-onboarding. Admins → /dashboard. Teachers and specialists → /workspace. Parents → /dashboard.', code: 'router.push(landingRoute);' },
    ],
  },
  {
    key: 'profile',
    label: 'Open a student',
    steps: [
      { side: 'FE', file: 'app/students/[id]/page.tsx', title: 'URL → page', dir: 'req', desc: 'Folders = URLs. [id] captures the student number from the address.', code: '// visiting /students/5\nconst id = propStudentId || (params?.id as string);  // "5"' },
      { side: 'FE', file: 'app/students/[id]/page.tsx', title: 'useEffect fetches data', dir: 'req', desc: 'Once the user is known and there is an id, the effect calls the profile endpoint.', code: 'useEffect(() => {\n  if (user && id) fetchProfile();\n}, [fetchProfile, id, user]);' },
      { side: 'FE', file: 'lib/api.ts', title: 'The single door (Axios)', dir: 'req', desc: 'Sends the GET with the auth cookie attached automatically.', code: 'GET /api/students/5/profile/' },
      { side: 'BE', file: 'api/urls.py', title: 'Match the route', dir: 'req', desc: 'The URL maps to StudentProfileView and captures student_id = 5.', code: "path('students/<int:student_id>/profile/',\n  StudentProfileView.as_view())" },
      { side: 'BE', file: 'api/authentication.py', title: 'Who is asking?', dir: 'req', desc: 'CookieJWTAuthentication reads the access_token cookie and sets request.user. Missing or expired → 401.', code: "raw_token = request.COOKIES.get('access_token')" },
      { side: 'BE', file: 'api/views.py', title: 'StudentProfileView.get', dir: 'req', desc: 'Admins can open any student. Everyone else only students they are assigned to through StudentAccess. No match → 404.', code: "if request.user.role == 'ADMIN':\n  student = Student.objects.get(id=student_id)\nelse:\n  student = Student.objects.get(id=student_id,\n    assigned_users__user=request.user)" },
      { side: 'DB', file: 'db.sqlite3', title: 'Read the student', dir: 'req', desc: 'Returns the row, or nothing if you are not on the team (→ "Student not found or access denied.").', code: 'Student.objects.get(\n  id=5, assigned_users__user=me)' },
      { side: 'BE', file: 'api/services/student_service.py', title: 'Build the profile JSON', dir: 'res', desc: 'get_student_profile_data() assembles student, active_cycle, form_statuses, generated_documents, assigned_staff.', code: 'return Response(\n  get_student_profile_data(student, request.user))' },
      { side: 'FE', file: 'app/students/[id]/page.tsx', title: 'Show it', dir: 'res', desc: 'setData(res.data) → React redraws → the profile appears and the spinner goes away.', code: 'setData(res.data);\n// screen updates automatically' },
    ],
  },
  {
    key: 'iep',
    label: 'Generate an IEP',
    steps: [
      { side: 'FE', file: 'app/admin/reports/page.tsx', title: 'Admin clicks Generate IEP', dir: 'req', desc: 'handleGenerateIEP POSTs the student and report cycle.', code: 'const res = await api.post("/api/iep/generate/", {\n  student_id: studentId,\n  report_cycle_id: reportCycleId,\n});' },
      { side: 'BE', file: 'api/views.py', title: 'GenerateIEPView guards', dir: 'req', desc: 'Admin only (403). Both ids required (400). An IEP for this cycle already? Return it (200). Parent + finalized specialist assessment required (400).', code: "if request.user.role != 'ADMIN': → 403\nif existing_iep: → 200 { iep_id }\nif not (has_parent and has_finalized_multi): → 400" },
      { side: 'BE', file: 'api/views.py', title: 'Queue the job → 202', dir: 'res', desc: '.delay() does not run the task. It writes it to Redis and returns a task_id at once. If Redis is down → 503.', code: 'task = generate_iep_task.delay(\n  student_id, report_cycle_id, request.user.id)\nreturn Response({"task_id": task.id}, status=202)' },
      { side: 'FE', file: 'app/admin/reports/page.tsx', title: 'Start polling', dir: 'req', desc: 'Every 3 seconds the page asks TaskStatusView if the job is done. PENDING forever = the Celery worker is not running.', code: 'api.get(`/api/tasks/${taskId}/status/`)\n// PENDING… PENDING… SUCCESS' },
      { side: 'BG', file: 'api/tasks.py', title: 'The worker picks it up', dir: 'req', desc: 'A separate program. Its prints and tracebacks appear in the Celery terminal. Retries up to 2 times on failure.', code: '@shared_task(bind=True, max_retries=2)\ndef generate_iep_task(self, student_id, cycle_id, user_id=None):\n  doc, iep_data = run_iep_generation(student_id, cycle_id)' },
      { side: 'BG', file: 'api/services/llm_service.py', title: 'Ask the AI', dir: 'req', desc: 'iep_generator builds the prompt. AI_PROVIDER picks Gemini, Ollama, or auto (Gemini first). The answer must be valid JSON.', code: 'call_json(prompt, temperature=0.7)\n# AI_PROVIDER = gemini | ollama | auto' },
      { side: 'DB', file: 'GeneratedDocument', title: 'Save the IEP', dir: 'res', desc: 'The PDF is rendered first, then the row is created, so nobody ever sees a half-built IEP. The task returns { doc_id }.', code: "GeneratedDocument.objects.create(\n  document_type='IEP', iep_data=…)\nreturn {'doc_id': doc.id}" },
      { side: 'BG', file: 'api/services/realtime_service.py', title: 'Push REPORT_READY', dir: 'res', desc: 'create_activity_event() sends to channel-layer groups. Locally without REDIS_URL this push from the worker is lost, so polling is the safety net.', code: "create_activity_event(event_type='REPORT_READY', …)\n→ group_send('realtime_admins', …)" },
      { side: 'FE', file: 'components/RealtimeProvider.tsx', title: 'Other screens refetch', dir: 'res', desc: 'The socket message fires a browser event. Pages with useRealtimeRefresh({ targets: ["reports", …] }) refetch with a normal api.get.', code: "useRealtimeRefresh({\n  targets: ['reports', 'workspace', 'student'],\n  onRefresh: fetchReportProfile,\n});" },
      { side: 'FE', file: 'app/admin/reports/page.tsx', title: 'Open the IEP', dir: 'res', desc: 'Polling sees SUCCESS with result.doc_id and opens the document.', code: 'onSuccess(res.data.result)\n→ openGeneratedDocument("iep", result.doc_id)' },
    ],
  },
];

export const LESSONS: Lesson[] = [
  { num: '00', slug: 'README', title: 'Start Here', blurb: 'How the course works, how to run the app, and the one mental model.', part: 'Intro', reference: true },
  { num: '01', slug: '01-the-big-picture', title: 'The Big Picture', blurb: 'The five programs that make up ARASE and where every file lives.', part: 'Find your way' },
  { num: '02', slug: '02-frontend-tour', title: 'Frontend Tour', blurb: 'Read a Next.js page; folders = URLs; where API calls happen.', part: 'Find your way' },
  { num: '03', slug: '03-backend-tour', title: 'Backend Tour', blurb: 'Follow a request: URL → view → service → model → database.', part: 'Find your way' },
  { num: '04', slug: '04-trace-a-feature', title: 'Trace a Feature', blurb: 'The key skill. Follow login and a profile load end to end.', part: 'Follow the thread' },
  { num: '05', slug: '05-background-jobs-and-live-updates', title: 'Background Jobs & Live Updates', blurb: 'An IEP through Celery, Gemini, and the WebSocket back to the screen.', part: 'Follow the thread' },
  { num: '06', slug: '06-reading-big-files', title: 'Reading Big Files', blurb: 'Find anything in the 3,400-line views.py and the 4,400-line workspace.', part: 'Follow the thread' },
  { num: '07', slug: '07-debugging-playbook', title: 'Debugging Playbook', blurb: 'Step 0 + the 5-step method, the Network tab, tracebacks, the shell.', part: 'Fix things' },
  { num: '08', slug: '08-making-a-change', title: 'Making a Change Safely', blurb: 'Add a field from the database to the screen, then check before committing.', part: 'Fix things' },
  { num: '09', slug: '09-real-bugs-casebook', title: 'Real Bugs Casebook', blurb: 'Eight bugs that really happened here, and the pattern behind each.', part: 'Fix things' },
  { num: '10', slug: '10-production', title: 'How It Runs Live', blurb: 'Vercel + Railway, dev vs. prod settings, env vars, debugging live.', part: 'Fix things' },
  { num: '11', slug: '11-glossary', title: 'Glossary', blurb: 'Every scary word (JWT, CSRF, channel layer…) in plain English.', part: 'Reference', reference: true },
  { num: '—', slug: 'cheat-sheet', title: 'Cheat Sheet', blurb: 'One page: where things live, status codes, terminals, checklists.', part: 'Reference', reference: true },
];

export const SYMPTOMS: Symptom[] = [
  { symptom: 'I fixed it, but it\'s still broken', side: 'BE', cause: 'daphne or the Celery worker is still running the old code. Neither reloads by itself.', check: 'Add print("NEW CODE") at the top of the function. Not printed? Restart.', where: ['daphne terminal', 'Celery terminal'] },
  { symptom: 'Spinner forever, and no request in the Network tab', side: 'FE', cause: 'The page\'s useEffect never fired, usually because user is null or the id is missing.', check: 'Find the useEffect and read its if (...) condition. console.log the values it checks.', where: ['the page\'s useEffect', 'context/AuthContext.tsx'] },
  { symptom: 'Spinner forever after a 202', side: 'BG', cause: 'The job was queued but nobody ran it. The Celery worker is not running, or it is stuck retrying.', check: 'Look at the Celery terminal. No "Task … received" line = start the worker.', where: ['Celery terminal', 'api/tasks.py'] },
  { symptom: 'Keeps sending me back to /login', side: 'FE', cause: 'A request got 401, the refresh failed, and api.ts redirected.', check: 'DevTools → Application → Cookies: are access_token and refresh_token there?', where: ['lib/api.ts (response interceptor)', 'api/authentication.py'] },
  { symptom: '403 "CSRF Failed" on save', side: 'BE', cause: 'The X-CSRFToken header did not match the csrftoken cookie.', check: 'Network → the request → Headers. Is X-CSRFToken present?', where: ['lib/api.ts (request interceptor)', 'api/authentication.py → enforce_csrf'] },
  { symptom: '403 "Only admins can…"', side: 'BE', cause: 'A role check in the view refused the action. Usually correct behavior.', check: 'Search the exact message to find the view. Is this user really supposed to do this?', where: ['api/views.py'] },
  { symptom: '404 "Student not found or access denied"', side: 'DB', cause: 'The user is not on the student\'s team (no StudentAccess row). A data problem, not a code bug.', check: 'manage.py shell: StudentAccess.objects.filter(student_id=…).values("user__email")', where: ['StudentProfileView in api/views.py', 'StudentAccess in api/models.py'] },
  { symptom: '500 Server Error', side: 'BE', cause: 'The backend crashed.', check: 'Read the traceback bottom-up. The lowest line in api\\… is where; the last line is what.', where: ['daphne terminal (or Celery terminal for jobs)'] },
  { symptom: '503 "Background worker is unavailable"', side: 'BG', cause: 'The view could not put the job on the queue. Redis is down.', check: 'Start redis-server, then try again.', where: ['GenerateIEPView in api/views.py'] },
  { symptom: '"IEP generation failed"', side: 'BG', cause: 'The AI call failed: bad API key, quota, or the AI returned broken JSON.', check: 'Celery terminal traceback. Check GEMINI_API_KEY and AI_PROVIDER.', where: ['api/services/llm_service.py', 'api/iep_generator.py'] },
  { symptom: 'A field is always blank on screen', side: 'BE', cause: 'The backend never sends it.', check: 'Network → Response: is the key there? If not, add it to the serializer fields or the hand-built dict.', where: ['api/serializers.py', 'MeView in api/auth_views.py', 'the service that returns the dict'] },
  { symptom: 'Data is right in Network, wrong on screen', side: 'FE', cause: 'The JSX reads the wrong key or the wrong state, e.g. status (label) vs status_code (raw value).', check: 'console.log the data where it is rendered and compare key names.', where: ['the page\'s JSX'] },
  { symptom: 'Other tabs don\'t update after an AI job (local only)', side: 'BG', cause: 'Without REDIS_URL the channel layer is in-memory, so pushes from the worker never reach daphne.', check: 'Set REDIS_URL=redis://localhost:6379/0 in .env and restart daphne and the worker.', where: ['backend/settings/dev.py'] },
  { symptom: '500 "no such column"', side: 'DB', cause: 'A model changed but the migration was not made or not applied.', check: 'Run makemigrations, then migrate, then restart daphne.', where: ['api/models.py', 'api/migrations/'] },
  { symptom: 'Works locally, broken live', side: 'BE', cause: 'Something in production settings differs: cookies, the /api rewrite, allowed hosts, env vars.', check: 'Walk the dev vs. prod table in Lesson 10. Check Railway logs.', where: ['backend/settings/prod.py', 'frontend/next.config.ts', 'Railway / Vercel env vars'] },
];

export const QUIZ: QuizItem[] = [
  { q: 'In the frontend, what decides a page\'s URL?', options: ['A central routes file', 'Its folder path under src/app/', 'The component\'s function name'], answer: 1, explain: 'Folders under src/app/ ARE the URLs. students/[id]/page.tsx serves /students/5.' },
  { q: 'A request comes back 403. What does it usually mean here?', options: ['The server crashed', 'The page doesn\'t exist', 'You\'re logged in but not allowed (a role check or CSRF)'], answer: 2, explain: '403 = authorization. Usually "Only admins can…", or "CSRF Failed" on a write. 500 = crash, 404 = not found.' },
  { q: 'Which file is the single door all backend calls go through?', options: ['frontend/src/lib/api.ts', 'AuthContext.tsx', 'api/views.py'], answer: 0, explain: 'Every api.get / api.post runs through lib/api.ts, the one configured Axios client.' },
  { q: 'You changed a check in api/views.py, but the API still behaves the old way. First thing to do?', options: ['Rewrite the check', 'Restart daphne', 'Clear the browser cache'], answer: 1, explain: 'daphne does not reload on file changes. Prove the new code is running before debugging anything else.' },
  { q: 'A teacher gets "Student not found or access denied" for a student that exists. Most likely cause?', options: ['They have no StudentAccess row for that student', 'The database is down', 'A typo in api/urls.py'], answer: 0, explain: 'Non-admins only see students they are assigned to. It is a data problem: add them to the team, don\'t loosen the check.' },
  { q: 'Generate IEP returns 202 and then polls PENDING forever. Where do you look?', options: ['The browser Console', 'api/urls.py', 'The Celery terminal: is the worker running?'], answer: 2, explain: '202 means "queued". Endless PENDING usually means no worker ever picked up the job.' },
  { q: 'What does generate_iep_task.delay(...) do?', options: ['Waits a few seconds, then runs the task', 'Puts the job on the Redis queue and returns immediately', 'Runs the task in the same request'], answer: 1, explain: '.delay() only queues the job. A separate Celery worker runs it later.' },
  { q: 'Where does real business logic usually live on the backend?', options: ['api/urls.py', 'api/models.py', 'api/services/'], answer: 2, explain: 'Views are thin: they check who is allowed and hand off to a service.' },
  { q: 'You added a new column to the User model. Which step makes it appear in useAuth().user?', options: ['Adding it to the dict MeView builds in api/auth_views.py', 'Only running migrate', 'Adding it to api/urls.py'], answer: 0, explain: '/api/auth/me/ is hand-built, not a serializer. New user fields have to be added there too.' },
  { q: 'Login works but every dashboard is empty in production, with 301s looping in Network. Likely cause?', options: ['Wrong password', 'The trailing slash is lost in the /api rewrite', 'Celery is down'], answer: 1, explain: 'That was a real bug (de268bf). Django redirected to add the slash, the rewrite stripped it again, forever.' },
  { q: 'Why do REST calls go through the Vercel site in production instead of straight to Railway?', options: ['It is faster', 'So auth cookies are first-party and survive incognito/Safari', 'Railway blocks direct calls'], answer: 1, explain: 'Cross-site cookies were being blocked as third-party (c1362d8). The rewrite makes them first-party.' },
  { q: 'You hit a 500. How do you read the traceback?', options: ['Top to bottom; the first line is the bug', 'Bottom-up: last line says what, lowest api\\… line says where', 'Only the Django framework lines matter'], answer: 1, explain: 'Skip framework frames. The last line is the exception; your own file closest to it is where to look.' },
];
