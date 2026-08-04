"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
    Search, ChevronLeft, ChevronRight, ChevronDown,
    UserPlus, FileText, Mail, ClipboardList, Calendar, GraduationCap,
    Users, FolderOpen, FileCheck2, Plus, ArrowRight, Clock,
    Sparkles, AlertCircle, CheckCircle2, Lock, Check, X, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { extractApiError, toastPromise } from "@/lib/toast-utils";
import { SPECIALIST_SPECIALTIES } from "@/lib/specialties";
import { normalizeGradeLevel, gradeLevelMatches } from "@/lib/grade-levels";
import { normalizeLanguages } from "@/lib/languages";
import { specialtyShortLabel, userSpecialtyList, SLP, OT, PT, ABA, DEV_PSY, type SectionOwner } from "@/lib/sectionOwners";
import { isSpecialistOnboardingIncomplete, specialistOnboardingMessage } from "@/lib/specialist-onboarding";
import { semanticToneClass, semanticToneStrongClass, statusColorClass, statusColorHex, statusLabel, studentRowActionPillClass, type SemanticTone } from "@/lib/role-colors";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import CustomSelect from "@/components/CustomSelect";

// Inputs
import { ParentFormContent } from "@/app/parent-onboarding/page";
import { FormEntryContent } from "@/app/forms/[type]/page";

// Outputs
import { IEPViewerContent } from "@/app/admin/iep/page";
import { MonthlyReportContent } from "@/app/admin/monthly-report/page";
import { StudentProfileContent } from "@/app/students/[id]/page";
import { AdminReportsContent } from "@/app/admin/reports/page";

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    "PENDING_ASSESSMENT":    { ...statusColorHex("PENDING_ASSESSMENT"), label: statusLabel("PENDING_ASSESSMENT") },
    "PENDING ASSESSMENT":    { ...statusColorHex("PENDING_ASSESSMENT"), label: statusLabel("PENDING_ASSESSMENT") },
    "ASSESSMENT_SCHEDULED": { ...statusColorHex("ASSESSMENT_SCHEDULED"), label: statusLabel("ASSESSMENT_SCHEDULED") },
    "ASSESSMENT SCHEDULED": { ...statusColorHex("ASSESSMENT_SCHEDULED"), label: statusLabel("ASSESSMENT_SCHEDULED") },
    "ASSESSED":     { ...statusColorHex("ASSESSED"), label: statusLabel("ASSESSED") },
    "ASSESSED (AWAITING ENROLLMENT)": { ...statusColorHex("ASSESSED"), label: statusLabel("ASSESSED") },
    "ENROLLED":     { ...statusColorHex("ENROLLED"), label: statusLabel("ENROLLED") },
    "INTEGRATED":   { ...statusColorHex("INTEGRATED"), label: statusLabel("INTEGRATED") },
    "ARCHIVED":   { ...statusColorHex("ARCHIVED"), label: statusLabel("ARCHIVED") },
};

const TABS = [
    { id: "parent_assessment", label: "Parent Assessment", formType: null },
    { id: "multi_assessment", label: "Specialist Assessment", formType: "multidisciplinary-assessment" },
    { id: "parent_tracker", label: "Parent Progress", formType: "parent-tracker" },
    { id: "multi_tracker", label: "Specialist Progress", formType: "multidisciplinary-tracker" },
    { id: "sped_tracker", label: "Teacher Progress", formType: "sped-tracker" }
];

type StudentSidebarSort = "recent" | "az";

const workspaceMainTabClass = (active: boolean) =>
    `workspace-tab flex h-8 items-center px-3 text-sm border-b-2 transition-colors ${
        active
            ? "border-indigo-600 bg-indigo-50/40 text-indigo-700 font-bold"
            : "border-transparent text-muted font-medium hover:border-line hover:bg-app hover:text-fg"
    }`;

const workspaceSecondaryTabClass = ({
    active,
    disabled,
    tone = "primary",
    attention,
}: {
    active?: boolean;
    disabled?: boolean;
    tone?: "primary" | "success" | "warning" | "neutral";
    attention?: boolean;
}) => {
    const base = "inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors";
    if (disabled) return `${base} cursor-not-allowed border-transparent text-faint opacity-70`;
    if (attention) {
        // Something is queued up waiting on the user, so this tab has to read as
        // a call to action rather than one more tab. The pulse stops once they
        // are on it — at that point the nudge has done its job and the tab just
        // needs to look selected.
        const nudge = active
            ? "border-warning-solid shadow-sm"
            : "animate-cta-glow motion-reduce:animate-none hover:border-warning-solid hover:bg-warning-soft";
        return `${base} ${semanticToneClass("warning")} cursor-pointer ${nudge}`;
    }
    if (active) return `${base} ${semanticToneClass(tone)} bg-card shadow-sm`;
    return `${base} border-transparent text-muted hover:border-line hover:bg-card hover:text-fg`;
};

const workspaceSegmentButtonClass = (active: boolean) =>
    `inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs transition-colors ${
        active
            ? "bg-card text-indigo-700 font-bold shadow-sm"
            : "text-muted font-medium hover:bg-white/60 hover:text-fg"
    }`;

const workspacePrimaryButtonClass =
    "inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-muted disabled:shadow-none";

const workspaceSecondaryButtonClass =
    "h-8 rounded-md border border-line bg-card px-3 text-xs font-medium text-muted transition-colors hover:border-line hover:bg-app hover:text-fg disabled:opacity-60";

const toneDotClass: Record<SemanticTone, string> = {
    primary: "bg-indigo-500",
    info: "bg-blue-500",
    success: "bg-success-solid",
    warning: "bg-warning-solid",
    danger: "bg-danger-solid",
    attention: "bg-pink-500",
    neutral: "bg-slate-400",
};

const workspaceBadgeClass = (tone: SemanticTone, extra = "") =>
    `inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${semanticToneClass(tone)} ${extra}`.trim();

const workspaceAlertClass = (tone: SemanticTone, extra = "") =>
    `rounded-xl border p-4 ${semanticToneClass(tone)} ${extra}`.trim();

type WorkspaceMemory = {
    studentId?: string;
    workspace?: string;
    tab?: string;
    view?: string;
    docId?: string;
    teamRole?: string;
};

const formatDocumentDateTime = (value?: string | null) => {
    if (!value) return "";
    return new Date(value).toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
};

const getStaffName = (staff: any) =>
    (staff?.first_name || staff?.last_name)
        ? `${staff.first_name || ""} ${staff.last_name || ""}`.trim()
        : staff?.email || "Unknown Staff";

const getStaffSpecialties = (staff: any): string[] => userSpecialtyList(staff?.specialties, staff?.specialty);

const nextActionClass = (status?: string, tone?: string) => {
    return studentRowActionPillClass(status || "ARCHIVED", tone);
};

const buildWorkspaceStudentHref = (student: any, fallbackWorkspace: string, role?: string) => {
    const params = new URLSearchParams();
    params.set("studentId", student.id.toString());
    // next_action is an admin triage hint and can deep-link to draft documents, which
    // the API refuses to serve to non-admins. Only admins follow it.
    const action = role === "ADMIN" ? student.next_action : null;
    params.set("workspace", action?.workspace || fallbackWorkspace);
    if (action?.tab) params.set("tab", action.tab);
    if (action?.view) params.set("view", action.view);
    if (action?.docId) params.set("docId", action.docId);
    if (action?.teamRole) params.set("teamRole", action.teamRole);
    return `/workspace?${params.toString()}`;
};

/**
 * Shown when the workspace has no students to open. Every role lands here, so the
 * copy branches — a teacher waiting on a class list needs different words than an
 * admin whose roster is genuinely empty.
 */
function EmptyCaseload({ user }: { user: { user_id?: number; role?: string; first_name?: string; specialties?: string[]; specialty?: string } | null }) {
    const role = user?.role;
    const firstName = (user?.first_name || "").trim();
    const isAdmin = role === "ADMIN";
    const isSpecialist = role === "SPECIALIST";
    const specialties = isSpecialist ? userSpecialtyList(user?.specialties, user?.specialty) : [];

    const heading = isAdmin
        ? "No students yet"
        : firstName
            ? `You're all set, ${firstName}`
            : "You're all set";

    const body = isAdmin
        ? "Once a student is registered they'll show up here, ready to assign and assess."
        : isSpecialist
            ? "Admin assigns students to your caseload. You'll get a notification the moment your first one arrives."
            : "Admin assigns students to your class list. You'll get a notification the moment your first one arrives.";

    return (
        <div className="flex w-full h-full items-center justify-center bg-[var(--bg-lighter)] p-4">
            <div className="flex w-full max-w-md flex-col items-center rounded-xl border border-line bg-card p-8 shadow-sm md:p-10">
                <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border ${semanticToneClass(isAdmin ? "neutral" : "success")}`}>
                    {isAdmin ? <Users className="h-7 w-7" aria-hidden="true" /> : <CheckCircle2 className="h-7 w-7" aria-hidden="true" />}
                </div>

                <h2 className="m-0 text-xl font-bold text-fg">{heading}</h2>
                <p className="mt-2 text-center text-muted">{body}</p>

                {specialties.length > 0 && (
                    <div className="mt-5 w-full rounded-xl border border-line bg-app/60 p-4">
                        <p className="m-0 text-center text-xs font-bold uppercase tracking-wide text-muted">
                            Your profile
                        </p>
                        <div className="mt-2 flex flex-wrap justify-center gap-2">
                            {specialties.map(specialty => (
                                <span
                                    key={specialty}
                                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${semanticToneClass("primary")}`}
                                >
                                    {specialty}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {!isAdmin && user?.user_id && (
                    <Link
                        href={`/users/${user.user_id}`}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-fg no-underline transition-colors hover:bg-app"
                    >
                        Review my profile
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                )}
            </div>
        </div>
    );
}

// The workspace used to collapse every load failure into one generic line, which
// hid the actual cause (rate limiting, an expired session, a server error) from
// both the user and whoever they reported it to.
const describeLoadError = (err: any, fallback: string) => {
    const status = err?.response?.status;
    if (!err?.response) {
        return "Can't reach the server right now. Check your connection, then retry.";
    }
    if (status === 429) {
        return "Too many requests in a short time. Wait about a minute, then retry — your work is saved.";
    }
    if (status === 401) {
        return "Your session expired. Sign in again to continue.";
    }
    if (status === 403) {
        return "You don't have access to this student's workspace.";
    }
    if (status === 404) {
        return "This student isn't in your caseload anymore.";
    }
    if (status >= 500) {
        return "The server hit an error loading this workspace. Retry in a moment — if it keeps failing, tell an admin.";
    }
    return extractApiError(err, fallback);
};

function UnifiedWorkspaceContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const specialistOnboardingIncomplete = isSpecialistOnboardingIncomplete(user);
    
    // -- Global State --
    const studentId = searchParams.get("studentId");
    const [allStudents, setAllStudents] = useState<any[]>([]);
    const [studentSearch, setStudentSearch] = useState("");
    const [studentSort, setStudentSort] = useState<StudentSidebarSort>("recent");
    const [studentStatusFilter, setStudentStatusFilter] = useState("ALL");
    const [studentGradeFilter, setStudentGradeFilter] = useState("ALL");
    const [studentName, setStudentName] = useState("");
    const [studentStatus, setStudentStatus] = useState("");
    const [studentDetails, setStudentDetails] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [studentsLoaded, setStudentsLoaded] = useState(false);
    const [profileRefreshKey, setProfileRefreshKey] = useState(0);
    const [retryKey, setRetryKey] = useState(0);
    // True once this student's profile has loaded at least once. A later refetch
    // that fails must not replace a workspace the user is actively working in —
    // background events (an admin generating an IEP, say) trigger those refetches.
    const profileEverLoaded = useRef(false);
    const [activeCycle, setActiveCycle] = useState<any>(null);
    const [sectionContributions, setSectionContributions] = useState<any[]>([]);
    const [activityEvents, setActivityEvents] = useState<any[]>([]);
    const [isActivityDrawerOpen, setIsActivityDrawerOpen] = useState(false);

    // -- Forms State --
    const [formStatuses, setFormStatuses] = useState<any>(null);
    const requestedFormTab = searchParams.get("tab");
    const getFilteredTabsByStatus = (tabs: typeof TABS) => {
        const status = studentStatus?.toUpperCase() || "";
        if (status === "ENROLLED") {
            return tabs.filter(tab => ["parent_tracker", "multi_tracker"].includes(tab.id));
        } else if (status === "INTEGRATED") {
            return tabs.filter(tab => ["parent_tracker", "multi_tracker", "sped_tracker"].includes(tab.id));
        } else {
            return tabs.filter(tab => ["parent_assessment", "multi_assessment"].includes(tab.id));
        }
    };

    const statusFilteredTabs = getFilteredTabsByStatus(TABS);

    // Assessments are phase-gated inputs, so they drop out of the tab set once the
    // student is enrolled or integrated. Admin still needs to read back what was
    // submitted during assessment, so keep any submitted assessment reachable in
    // Reports even after the phase that produced it has passed.
    const adminReportTabs = TABS.filter(tab =>
        statusFilteredTabs.some(t => t.id === tab.id)
        || (["parent_assessment", "multi_assessment"].includes(tab.id) && formStatuses?.[tab.id]?.submitted)
    );

    const visibleFormTabs = user?.role === "PARENT"
        ? statusFilteredTabs.filter(tab => tab.id === "parent_tracker" || tab.id === "parent_assessment")
        : user?.role === "TEACHER"
            // Teacher's own form (sped_tracker) plus read-only access to the parent's and
            // specialist's submissions. These are reference material, not phase-gated
            // inputs, so derive them from TABS directly.
            ? TABS.filter(tab => ["parent_tracker", "multi_assessment", "multi_tracker", "sped_tracker"].includes(tab.id))
            : user?.role === "SPECIALIST"
                // Specialists have their own two forms plus read-only access to the parent's
                // assessment/progress and the teacher's progress. These are reference
                // material, not phase-gated inputs, so derive them from TABS directly rather
                // than the status-filtered set (which hides parent_assessment once enrolled).
                ? TABS.filter(tab => ["parent_assessment", "parent_tracker", "multi_assessment", "multi_tracker", "sped_tracker"].includes(tab.id))
                : statusFilteredTabs;
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [hasSeenWorkspaceExplainer, setHasSeenWorkspaceExplainer] = useState(false);
    const [parentPanelMenuOpen, setParentPanelMenuOpen] = useState(false);

    // -- Delete Student State --
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deleteError, setDeleteError] = useState("");
    
    useEffect(() => {
        if (typeof window !== "undefined") {
            const seen = window.localStorage.getItem("arase:seen-workspace-explainer");
            if (seen) setHasSeenWorkspaceExplainer(true);
        }
    }, []);
    // Parents never get the student-list rail — switching children lives in the
    // workspace sidebar header instead, so they only ever see two sidebars.
    const showStudentSidebar = user?.role !== "PARENT";
    
    // -- Reports State --
    const [docs, setDocs] = useState<any[]>([]);
    const activeReportView = searchParams.get("view") || searchParams.get("tab") || (docs.some(d => d.type === "IEP") ? "iep" : "generator");
    const activeDocId = searchParams.get("docId");
    const workspaceParam = searchParams.get("workspace");
    const activeViewParam = searchParams.get("view");
    const activeTeamRoleParam = searchParams.get("teamRole");
    const normalizedStudentStatus = studentStatus?.toUpperCase().replace(/\s+/g, "_");

    // -- Team State --
    const [assignedStaff, setAssignedStaff] = useState<any[]>([]);
    const [stagedAssignedStaff, setStagedAssignedStaff] = useState<any[]>([]);
    const [staffList, setStaffList] = useState<any[]>([]);
    const [assigning, setAssigning] = useState<number | null>(null);
    const [unassigningStaff, setUnassigningStaff] = useState<{ id: number, specialty?: string, name?: string, role: string } | null>(null);
    const [isUnassigning, setIsUnassigning] = useState(false);
    const [confirmingTeam, setConfirmingTeam] = useState(false);
    const [pendingTeamNavigation, setPendingTeamNavigation] = useState<string | null>(null);
    const [sendingParentReminder, setSendingParentReminder] = useState(false);
    const [showEnrollConfirm, setShowEnrollConfirm] = useState(false);
    const [enrollingStudent, setEnrollingStudent] = useState(false);
    const [showIntegrateConfirm, setShowIntegrateConfirm] = useState(false);
    const [integratingStudent, setIntegratingStudent] = useState(false);
    const [specialistSearch, setSpecialistSearch] = useState("");
    // Teachers are scoped to the student's grade; this is the opt-out.
    const [showAllTeachers, setShowAllTeachers] = useState(false);
    const activeTeamRole = searchParams.get("teamRole") || "SPECIALIST";
    const isAuthorized = Boolean(user);
    const workspaceMemoryKey = user ? `arase:workspace:last:${user.user_id}` : "";
    const hasExplicitWorkspaceState = Boolean(
        studentId ||
        workspaceParam ||
        requestedFormTab ||
        activeViewParam ||
        activeDocId ||
        activeTeamRoleParam
    );

    // -- Master Tab Switcher --
    const isStaffViewer = user?.role === "SPECIALIST" || user?.role === "TEACHER";
    const rawWorkspace = workspaceParam || (user?.role === "ADMIN" ? "overview" : "forms");
    const workspace = user?.role === "PARENT"
        ? "forms"
        : (user?.role === "ADMIN" && rawWorkspace === "forms")
            ? "reports"
            // Editing the team stays admin-only. Overview is read-only, so
            // specialists and teachers get it too.
            : (user?.role !== "ADMIN" && rawWorkspace === "team")
                ? "forms"
                : rawWorkspace;
    const isStudentCurrentlyEnrolled = ["ENROLLED", "INTEGRATED"].includes(studentStatus?.toUpperCase() || "");
    const defaultFormTab = user?.role === "PARENT"
        ? (formStatuses?.parent_assessment?.submitted && !(formStatuses?.parent_assessment?.unlocked && formStatuses?.parent_assessment?.unlock_available !== false)
            ? "parent_tracker"
            : "parent_assessment")
        : user?.role === "TEACHER"
            ? "sped_tracker"
            : user?.role === "SPECIALIST"
                ? formStatuses?.multi_assessment?.submitted && isStudentCurrentlyEnrolled
                    ? "multi_tracker"
                    : "multi_assessment"
                : "parent_assessment";
    const isSubmittedAssessmentTab = ["parent_assessment", "multi_assessment", "sped_assessment"].includes(requestedFormTab || "") &&
        formStatuses?.[requestedFormTab || ""]?.submitted;

    const canUseRequestedFormTab = requestedFormTab && (
        visibleFormTabs.some(tab => tab.id === requestedFormTab) || isSubmittedAssessmentTab
    ) &&
        !(user?.role === "SPECIALIST" && requestedFormTab === "multi_tracker" && !isStudentCurrentlyEnrolled) &&
        !(user?.role === "TEACHER" && requestedFormTab === "sped_tracker" && !isStudentCurrentlyEnrolled);
    const activeFormTab = (() => {
        if (canUseRequestedFormTab) return requestedFormTab;
        if (visibleFormTabs.some(t => t.id === defaultFormTab)) return defaultFormTab;
        
        const roleSpecificTab = user?.role === "PARENT"
            ? visibleFormTabs.find(t => t.id === "parent_tracker")
            : user?.role === "SPECIALIST"
                ? visibleFormTabs.find(t => t.id === "multi_tracker")
                : user?.role === "TEACHER"
                    ? visibleFormTabs.find(t => t.id === "sped_tracker")
                    : null;
                    
        return roleSpecificTab?.id || visibleFormTabs[0]?.id || defaultFormTab;
    })();

    useEffect(() => {
        if (user?.role !== "PARENT" || !studentId || typeof window === "undefined") return;
        if (!allStudents.some((student: any) => student.id.toString() === studentId)) return;
        window.localStorage.setItem("arase:last-parent-student-id", studentId);
    }, [allStudents, studentId, user?.role]);

    useEffect(() => {
        if (!isAuthorized) {
            setLoading(false);
            return;
        }

        let isActive = true;
        setLoadError(null);
        setStudentsLoaded(false);
        api.get("/api/students/").then(res => {
            if (!isActive) return;
            const students = res.data;
            setAllStudents(students);
            setStudentsLoaded(true);

            if (studentId && !students.some((student: any) => student.id.toString() === studentId)) {
                if (user?.role === "PARENT" && typeof window !== "undefined") {
                    window.localStorage.removeItem("arase:last-parent-student-id");
                    window.localStorage.removeItem(workspaceMemoryKey);
                }
                if (students.length > 0) {
                    const url = new URL(window.location.href);
                    url.searchParams.set("studentId", students[0].id.toString());
                    router.replace(url.pathname + url.search);
                } else {
                    const url = new URL(window.location.href);
                    url.searchParams.delete("studentId");
                    router.replace(url.pathname + url.search);
                }
                return;
            }

            if (!hasExplicitWorkspaceState && typeof window !== "undefined") {
                const stored = window.localStorage.getItem(workspaceMemoryKey);
                let remembered: WorkspaceMemory | null = null;
                try {
                    remembered = stored ? JSON.parse(stored) as WorkspaceMemory : null;
                } catch {
                    window.localStorage.removeItem(workspaceMemoryKey);
                }
                const rememberedStudentId = remembered?.studentId;
                if (rememberedStudentId && students.some((s: any) => s.id.toString() === rememberedStudentId)) {
                    const url = new URL(window.location.href);
                    url.searchParams.set("studentId", rememberedStudentId);
                    if (user?.role === "ADMIN") {
                        url.searchParams.set("workspace", "overview");
                        url.searchParams.delete("tab");
                        url.searchParams.delete("view");
                        url.searchParams.delete("docId");
                        url.searchParams.delete("teamRole");
                    } else {
                        if (remembered?.workspace) url.searchParams.set("workspace", remembered.workspace);
                        if (remembered?.tab) url.searchParams.set("tab", remembered.tab);
                        if (remembered?.view) url.searchParams.set("view", remembered.view);
                        if (remembered?.docId) url.searchParams.set("docId", remembered.docId);
                        if (remembered?.teamRole) url.searchParams.set("teamRole", remembered.teamRole);
                    }
                    router.replace(url.pathname + url.search);
                    return;
                }
            }
            
            // If no student is explicitly active but we have students, automatically redirect to first
            if (!studentId && students.length > 0) {
                const url = new URL(window.location.href);
                url.searchParams.set("studentId", students[0].id.toString());
                router.replace(url.pathname + url.search);
            } else if (!studentId && students.length === 0) {
                setLoading(false); // Finished loading but no students exist
            }
        }).catch((err) => {
            if (!isActive) return;
            setStudentsLoaded(true);
            setLoadError(describeLoadError(err, "Unable to load your students."));
            setLoading(false);
        });
        return () => {
            isActive = false;
        };
    }, [studentId, router, isAuthorized, hasExplicitWorkspaceState, workspaceMemoryKey, user?.role, retryKey]);

    // Realtime refreshes replace `allStudents` with a new array on every event.
    // Depending on the array itself made the profile effect re-run — and refetch
    // profile + activity — each time, so collapse it to the one boolean the
    // effect actually cares about.
    const parentStudentInCaseload = user?.role !== "PARENT"
        || allStudents.some((student: any) => student.id.toString() === studentId);

    // Switching students starts a fresh load — a failure there is a real
    // "can't open this workspace", not a background refresh blip.
    useEffect(() => {
        profileEverLoaded.current = false;
    }, [studentId]);

    useEffect(() => {
        if (!isAuthorized || !studentId) return; // Prevent fetch if no student is active
        if (user?.role === "PARENT") {
            if (!studentsLoaded) return;
            if (!parentStudentInCaseload) return;
        }
        let isActive = true;
        setLoadError(null);
        
        api.get(`/api/students/${studentId}/profile/`)
            .then(res => {
                if (!isActive) return;
                const data = res.data;
                setStudentName(`${data.student.first_name} ${data.student.last_name}`);
                setStudentStatus(data.student.status);
                setStudentDetails(data.student);
                setActiveCycle(data.active_cycle);
                setFormStatuses(data.form_statuses);
                setAssignedStaff(data.assigned_staff || []);
                setStagedAssignedStaff(data.assigned_staff || []);
                
                const generatedDocs = data.generated_documents || [];
                generatedDocs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                setDocs(generatedDocs);
                api.get(`/api/activity/?student_id=${studentId}&limit=8`)
                    .then(activityRes => setActivityEvents(activityRes.data?.events || []))
                    .catch(() => setActivityEvents([]));

                profileEverLoaded.current = true;
                setLoading(false);
            })
            .catch((err) => {
                if (!isActive) return;
                const message = describeLoadError(err, "Unable to load this student's workspace.");
                if (profileEverLoaded.current) {
                    // Keep what's on screen — an open form must survive a failed refresh.
                    toast.error(message, { id: "workspace-refresh-error", duration: 6000 });
                } else {
                    setLoadError(message);
                }
                setLoading(false);
            });
        return () => {
            isActive = false;
        };
    }, [parentStudentInCaseload, studentId, isAuthorized, profileRefreshKey, studentsLoaded, user?.role, retryKey]);

    const fetchSectionContributions = useCallback(async (currentStudentId: string, currentCycleId: number) => {
        try {
            const res = await api.get('/api/inputs/multidisciplinary-assessment/contributions/', {
                params: {
                    student: currentStudentId,
                    report_cycle: currentCycleId
                }
            });
            setSectionContributions(res.data || []);
        } catch (err) {
            console.error("Failed to fetch section contributions:", err);
            setSectionContributions([]);
        }
    }, []);

    useEffect(() => {
        if (studentId && activeCycle?.id && normalizedStudentStatus === "ASSESSMENT_SCHEDULED") {
            fetchSectionContributions(studentId, activeCycle.id);
        } else {
            setSectionContributions([]);
        }
    }, [studentId, activeCycle?.id, normalizedStudentStatus, fetchSectionContributions]);

    useEffect(() => {
        // Parents navigate their unified workspace with `view`/`docId`, not `tab`.
        // Canonicalizing to a form tab here would wipe the `view` they just picked.
        if (!isAuthorized || !studentId || !formStatuses || workspace !== "forms" || requestedFormTab || user?.role === "PARENT" || typeof window === "undefined") {
            return;
        }

        const url = new URL(window.location.href);
        url.searchParams.set("workspace", "forms");
        url.searchParams.set("tab", activeFormTab);
        url.searchParams.delete("view");
        url.searchParams.delete("docId");
        url.searchParams.delete("teamRole");
        router.replace(url.pathname + url.search);
    }, [isAuthorized, studentId, formStatuses, workspace, requestedFormTab, activeFormTab, user?.role, router]);

    useEffect(() => {
        if (!isAuthorized || !studentId || !formStatuses || !workspaceMemoryKey || typeof window === "undefined") {
            return;
        }

        const memory: WorkspaceMemory = {
            studentId,
            workspace,
        };

        if (workspace === "forms") {
            if (user?.role === "PARENT") {
                if (activeViewParam) memory.view = activeViewParam;
                if (activeDocId) memory.docId = activeDocId;
            } else {
                memory.tab = activeFormTab;
            }
        }
        if (workspace === "reports") {
            memory.view = activeReportView;
            if (activeDocId) memory.docId = activeDocId;
        }
        if (workspace === "team") {
            memory.teamRole = activeTeamRole;
        }

        window.localStorage.setItem(workspaceMemoryKey, JSON.stringify(memory));
    }, [
        isAuthorized,
        studentId,
        formStatuses,
        workspace,
        activeFormTab,
        activeReportView,
        activeDocId,
        activeViewParam,
        activeTeamRole,
        workspaceMemoryKey,
        user?.role,
    ]);

    useEffect(() => {
        if (!studentId || user?.role !== "ADMIN") return;
        api.get(`/api/staff/?student_id=${studentId}`).then(res => setStaffList(res.data)).catch(() => {
            setStaffList([]);
        });
    }, [studentId, user?.role]);

    // -- Handlers --
    const normalizeTeam = (staff: any[]) => staff
        .filter((member) => member.role === "SPECIALIST" || member.role === "TEACHER")
        .map((member) => ({
            id: member.id,
            role: member.role,
            specialties: getStaffSpecialties(member).slice().sort(),
        }))
        .sort((a, b) => `${a.role}-${a.id}`.localeCompare(`${b.role}-${b.id}`));

    const teamHasChanges = JSON.stringify(normalizeTeam(assignedStaff)) !== JSON.stringify(normalizeTeam(stagedAssignedStaff));
    const refreshWorkspaceData = useCallback(async () => {
        if (!isAuthorized) return;
        const studentsRes = await api.get("/api/students/");
        setAllStudents(studentsRes.data);

        if (studentId) {
            const profileRes = await api.get(`/api/students/${studentId}/profile/`);
            const data = profileRes.data;
            setStudentName(`${data.student.first_name} ${data.student.last_name}`);
            setStudentStatus(data.student.status);
            setStudentDetails(data.student);
            setActiveCycle(data.active_cycle);
            setFormStatuses(data.form_statuses);
            setAssignedStaff(data.assigned_staff || []);
            if (!teamHasChanges) {
                setStagedAssignedStaff(data.assigned_staff || []);
            }
            const generatedDocs = data.generated_documents || [];
            generatedDocs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setDocs(generatedDocs);
            const activityRes = await api.get(`/api/activity/?student_id=${studentId}&limit=8`);
            setActivityEvents(activityRes.data?.events || []);
            
            if (data.active_cycle?.id && data.student.status?.toUpperCase().replace(/\s+/g, "_") === "ASSESSMENT_SCHEDULED") {
                fetchSectionContributions(studentId, data.active_cycle.id);
            }
        }

        if (studentId && user?.role === "ADMIN") {
            const staffRes = await api.get(`/api/staff/?student_id=${studentId}`);
            setStaffList(staffRes.data);
        }
    }, [isAuthorized, studentId, teamHasChanges, user?.role, fetchSectionContributions]);

    useRealtimeRefresh({
        targets: ['workspace', 'student', 'staff', 'reports', 'schedule'],
        studentId,
        isEditing: teamHasChanges || Boolean(unassigningStaff) || confirmingTeam || showEnrollConfirm || enrollingStudent || showIntegrateConfirm || integratingStudent,
        // A background refresh that fails is a blip, not a broken workspace —
        // log it and leave the user's current view (and any open form) intact.
        onRefresh: async () => {
            try {
                await refreshWorkspaceData();
            } catch (err) {
                console.error("Workspace realtime refresh failed:", err);
            }
        },
    });

    useRealtimeRefresh({
        targets: ['workspace', 'student'],
        onRefresh: async () => {
            if (!isAuthorized) return;
            try {
                const res = await api.get("/api/students/");
                setAllStudents(res.data);
            } catch (err) {
                console.error("Failed to refresh student list:", err);
            }
        },
    });

    const getTeamUnits = (staff: any[]) => staff.flatMap((member) => {
        if (member.role === "SPECIALIST") {
            return getStaffSpecialties(member).map((specialty) => ({
                key: `SPECIALIST:${member.id}:${specialty}`,
                name: getStaffName(member),
                detail: specialty,
            }));
        }
        if (member.role === "TEACHER") {
            return [{
                key: `TEACHER:${member.id}`,
                name: getStaffName(member),
                detail: "Teacher",
            }];
        }
        return [];
    });
    const originalTeamUnits = getTeamUnits(assignedStaff);
    const stagedTeamUnits = getTeamUnits(stagedAssignedStaff);
    const addedTeamUnits = stagedTeamUnits.filter((unit) => !originalTeamUnits.some((original) => original.key === unit.key));
    const removedTeamUnits = originalTeamUnits.filter((unit) => !stagedTeamUnits.some((staged) => staged.key === unit.key));

    useEffect(() => {
        if (!teamHasChanges || typeof window === "undefined") return;
        const currentUrl = window.location.pathname + window.location.search;
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        const handlePopState = () => {
            const targetUrl = window.location.pathname + window.location.search;
            window.history.pushState({ teamGuard: true }, "", currentUrl);
            setPendingTeamNavigation(targetUrl);
        };
        window.history.pushState({ teamGuard: true }, "", currentUrl);
        window.addEventListener("beforeunload", handleBeforeUnload);
        window.addEventListener("popstate", handlePopState);
        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            window.removeEventListener("popstate", handlePopState);
        };
    }, [teamHasChanges]);

    const getTeamPayload = () => ({
        specialists: stagedAssignedStaff
            .filter((member) => member.role === "SPECIALIST")
            .map((member) => ({
                staff_id: member.id,
                specialties: getStaffSpecialties(member),
            })),
        teachers: stagedAssignedStaff
            .filter((member) => member.role === "TEACHER")
            .map((member) => member.id),
    });

    const confirmTeamChanges = async () => {
        if (!studentId || !teamHasChanges || confirmingTeam) return true;
        setConfirmingTeam(true);
        try {
            const res = await api.post(`/api/students/${studentId}/confirm-team/`, getTeamPayload());
            const nextAssigned = res.data.assigned_staff || [];
            setAssignedStaff(nextAssigned);
            setStagedAssignedStaff(nextAssigned);
            toast.success("Team confirmed.");
            return true;
        } catch (err: any) {
            toast.error(extractApiError(err, "Failed to confirm team."));
            return false;
        } finally {
            setConfirmingTeam(false);
        }
    };

    const discardTeamChanges = () => {
        setStagedAssignedStaff(assignedStaff);
        setPendingTeamNavigation(null);
    };

    const navigateWithTeamGuard = (url: string) => {
        if (workspace === "team" && teamHasChanges) {
            setPendingTeamNavigation(url);
            return;
        }
        router.push(url);
    };

    const proceedWithPendingNavigation = async () => {
        if (!pendingTeamNavigation) return;
        const target = pendingTeamNavigation;
        const confirmed = await confirmTeamChanges();
        if (confirmed) {
            setPendingTeamNavigation(null);
            router.push(target);
        }
    };

    const stageSpecialist = (staff: any, specialties: string[]) => {
        setStagedAssignedStaff((prev) => {
            const withoutStaff = prev.filter((member) => member.id !== staff.id);
            if (specialties.length === 0) {
                return withoutStaff;
            }
            return [
                ...withoutStaff,
                {
                    ...staff,
                    role: "SPECIALIST",
                    specialty: specialties[0],
                    specialties,
                },
            ];
        });
    };

    // One teacher per student. The UI disables the other cards while the slot is
    // filled, so in practice this toggles the current teacher off; the replace
    // path stays as a safeguard against ever staging two.
    const stageTeacher = (staff: any) => {
        setStagedAssignedStaff((prev) => {
            const alreadyAssigned = prev.some((member) => member.id === staff.id && member.role === "TEACHER");
            const withoutTeachers = prev.filter((member) => member.role !== "TEACHER");
            if (alreadyAssigned) {
                return withoutTeachers;
            }
            return [...withoutTeachers, { ...staff, role: "TEACHER" }];
        });
    };

    const confirmUnassign = async () => {
        if (!unassigningStaff || !studentDetails) return;
        setIsUnassigning(true);
        try {
            if (unassigningStaff.role === "Specialist" && unassigningStaff.specialty) {
                const current = stagedAssignedStaff.find((member) => member.id === unassigningStaff.id);
                const nextSpecialties = getStaffSpecialties(current).filter((specialty) => specialty !== unassigningStaff.specialty);
                const staff = staffList.find((member) => member.id === unassigningStaff.id) || current;
                stageSpecialist(staff, nextSpecialties);
            } else {
                setStagedAssignedStaff((prev) => prev.filter((member) => member.id !== unassigningStaff.id));
            }
        } catch {
            toast.error("Team update failed.");
        } finally {
            setIsUnassigning(false);
            setUnassigningStaff(null);
        }
    };

    const handleAssign = (type: "specialist" | "teacher", staffId: number, specialties: string[] = []) => {
        setAssigning(staffId);
        try {
            const staff = staffList.find((member) => member.id === staffId);
            if (!staff) return;
            if (type === "specialist") {
                stageSpecialist(staff, specialties);
            } else {
                stageTeacher(staff);
            }
        } catch {
            toast.error("Team change failed.");
        } finally {
            setAssigning(null);
        }
    };

    const setWorkspace = (newWorkspace: string) => {
        if (newWorkspace === "team" && user?.role !== "ADMIN") {
            newWorkspace = "forms";
        }
        const url = new URL(window.location.href);
        url.searchParams.set("workspace", newWorkspace);
        if (newWorkspace !== "team") {
            url.searchParams.delete("teamRole");
        }
        if (newWorkspace === "reports" && user?.role !== "ADMIN") {
            const latestDoc = docs[0];
            if (latestDoc) {
                url.searchParams.set("view", latestDoc.type === "MONTHLY" ? "monthly" : "iep");
                url.searchParams.set("docId", latestDoc.id.toString());
            } else {
                url.searchParams.set("view", "empty");
                url.searchParams.delete("docId");
            }
        }
        navigateWithTeamGuard(url.pathname + url.search);
    };

    const handleFormTabChange = (tabId: string) => {
        const url = new URL(window.location.href);
        url.searchParams.set("workspace", "forms");
        url.searchParams.set("tab", tabId);
        navigateWithTeamGuard(url.pathname + url.search);
    };

    const handleReportMenuChange = (view: string, docId?: string) => {
        const url = new URL(window.location.href);
        url.searchParams.set("workspace", "reports");
        url.searchParams.set("view", view);
        if (docId) {
            url.searchParams.set("docId", docId);
        } else {
            url.searchParams.delete("docId");
        }
        navigateWithTeamGuard(url.pathname + url.search);
    };

    const handleTeamMenuChange = (role: string) => {
        if (user?.role !== "ADMIN") return;
        const url = new URL(window.location.href);
        url.searchParams.set("workspace", "team");
        url.searchParams.set("teamRole", role);
        navigateWithTeamGuard(url.pathname + url.search);
    };

    const handleParentAssessmentReminder = async () => {
        if (!studentId || sendingParentReminder) return;
        setSendingParentReminder(true);
        try {
            await toastPromise(api.post(`/api/students/${studentId}/parent-assessment-reminder/`), {
                id: `parent-reminder-${studentId}`,
                loading: 'Sending reminder…',
                success: (res: any) => res.data.message || 'Reminder sent.',
                error: (err: any) => extractApiError(err, 'Reminder failed.'),
            });
        } catch {
            // Error already handled by toastPromise
        } finally {
            setSendingParentReminder(false);
        }
    };

    const handleEmbeddedFormSubmitted = async (message: string) => {
        toast.success(message);
        setProfileRefreshKey(key => key + 1);
    };

    const handleEnrollStudent = async () => {
        if (!studentId || enrollingStudent) return;
        setEnrollingStudent(true);
        try {
            await toastPromise(api.post(`/api/students/${studentId}/enroll/`), {
                id: `enroll-${studentId}`,
                loading: 'Enrolling student…',
                success: (res: any) => res.data.message || 'Student enrolled.',
                error: (err: any) => extractApiError(err, 'Enrollment failed.'),
            });
            const profileRes = await api.get(`/api/students/${studentId}/profile/`);
            const data = profileRes.data;
            setStudentStatus(data.student.status);
            setStudentDetails(data.student);
            setFormStatuses(data.form_statuses);
            setAssignedStaff(data.assigned_staff || []);
            const generatedDocs = data.generated_documents || [];
            generatedDocs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setDocs(generatedDocs);
            setShowEnrollConfirm(false);
        } catch {
            // Error already handled by toastPromise
        } finally {
            setEnrollingStudent(false);
        }
    };

    const handleIntegrateStudent = async () => {
        if (!studentId || integratingStudent) return;
        setIntegratingStudent(true);
        try {
            await toastPromise(api.post(`/api/students/${studentId}/integrate/`), {
                id: `integrate-${studentId}`,
                loading: 'Processing integration…',
                success: (res: any) => res.data.message || 'Student integrated into mainstream school.',
                error: (err: any) => extractApiError(err, 'Failed to integrate student.'),
            });
            const profileRes = await api.get(`/api/students/${studentId}/profile/`);
            const data = profileRes.data;
            setStudentStatus(data.student.status);
            setStudentDetails(data.student);
            setFormStatuses(data.form_statuses);
            setAssignedStaff(data.assigned_staff || []);
            const generatedDocs = data.generated_documents || [];
            generatedDocs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setDocs(generatedDocs);
            setShowIntegrateConfirm(false);
            setWorkspace("team");
        } catch {
            // Error already handled by toastPromise
        } finally {
            setIntegratingStudent(false);
        }
    };

    const handleDeleteStudent = async () => {
        if (!studentDetails || !studentId) return;
        const expectedName = `${studentDetails.first_name} ${studentDetails.last_name}`;
        if (deleteConfirmText !== expectedName) {
            setDeleteError("Name does not match.");
            return;
        }
        try {
            setDeleteError("");
            await api.delete(`/api/students/${studentId}/`);
            toast.success("Student deleted.");
            router.push("/dashboard");
        } catch (err: any) {
            setDeleteError(err.response?.data?.error || err.response?.data?.detail || "Failed to delete student.");
        }
    };

    if (!isAuthorized) {
        return null;
    }

    if (loading) {
        return <div className="p-8 h-full flex items-center justify-center text-muted">Loading workspace...</div>;
    }

    if (loadError) {
        return (
            <div className="flex w-full h-full items-center justify-center bg-[var(--bg-lighter)]">
                <div className="flex max-w-md flex-col items-center bg-card p-12 rounded-xl shadow-sm border border-line">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft text-danger">
                        <AlertCircle className="h-7 w-7" aria-hidden="true" />
                    </div>
                    <h2 className="text-xl font-bold text-fg mb-2">Workspace Unavailable</h2>
                    <p className="text-muted text-center">{loadError}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setLoadError(null);
                            setLoading(true);
                            setRetryKey(key => key + 1);
                        }}
                        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
                    >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        Retry
                    </button>
                </div>
            </div>
        );
    }
    
    // Empty State Check
    if (!studentId && allStudents.length === 0) {
        return <EmptyCaseload user={user} />;
    }

    if (!formStatuses) {
        return <div className="p-8 text-center text-danger">Failed to load student data.</div>;
    }

    // -- Sub-renderers for clean structure --

    const formatDate = (value?: string) => {
        if (!value) return "TBD";
        return new Date(value + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    const calculateAge = (value?: string) => {
        if (!value) return "TBD";
        const today = new Date();
        const birthDate = new Date(value + "T00:00:00");
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age -= 1;
        }
        return `${age} years old`;
    };

    const staffNames = (staff: any[]) => {
        if (staff.length === 0) return "None";
        return staff.map(s => `${s.first_name || ""} ${s.last_name || ""}`.trim() || s.email).join(", ");
    };

    const compactStudentName = () => {
        const firstName = studentDetails?.first_name || studentName.split(" ")[0] || "student";
        const lastName = studentDetails?.last_name || studentName.split(" ").slice(1).join(" ");
        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName.length <= 18 || !lastName) return fullName;
        return `${firstName} ${lastName.charAt(0)}.`;
    };

    const formatActivityTime = (value?: string) => {
        if (!value) return "";
        return new Date(value).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    };

    const formatRelativeTime = (value?: string) => {
        if (!value) return "";
        const then = new Date(value).getTime();
        const diffSec = Math.floor((Date.now() - then) / 1000);
        if (diffSec < 60) return "just now";
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h ago`;
        if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} d ago`;
        return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    const submitterLabel = (submittedBy?: { name?: string; role?: string } | null) => {
        if (!submittedBy) return "Submitted";
        const role = submittedBy.role ? submittedBy.role.toLowerCase() : "user";
        return `${submittedBy.name || "User"} • ${role}`;
    };

    const formatActivityEventTitle = (event: any) => {
        const staffName = event.message;
        if (event.event_type !== "TEAM_UPDATED" || !staffName || event.title?.includes(staffName)) {
            return event.title;
        }
        const rawRole = event.metadata?.role || "Team member";
        const roleLabel = rawRole.charAt(0).toUpperCase() + rawRole.slice(1).toLowerCase();
        const action = event.title?.toLowerCase().includes("removed") ? "removed from" : "assigned to";
        const studentLabel = event.student_name || studentName;
        return `${roleLabel} ${staffName} ${action} ${studentLabel}`;
    };

    const buildRecentActivity = () => {
        const formActivities = TABS
            .map(tab => {
                const status = formStatuses?.[tab.id];
                if (!status?.submitted || !status.submitted_at) return null;
                return {
                    id: `form-${tab.id}-${status.id}`,
                    title: `${tab.label} submitted`,
                    meta: submitterLabel(status.submitted_by),
                    timestamp: status.submitted_at,
                    tone: "form",
                };
            })
            .filter(Boolean);

        const documentActivities = docs
            .filter(doc => doc.created_at)
            .map(doc => ({
                id: `doc-${doc.id}`,
                title: doc.type === "IEP" ? "IEP generated" : "Monthly report generated",
                meta: doc.status ? `${doc.status.toLowerCase()} document` : "Generated document",
                timestamp: doc.created_at,
                tone: "document",
            }));

        if (activityEvents.length > 0) {
            return activityEvents.map(event => ({
                id: `activity-${event.id}`,
                title: formatActivityEventTitle(event),
                meta: event.actor_name || event.message || "Activity",
                timestamp: event.created_at,
                tone: event.event_type?.startsWith("REPORT") ? "document" : event.event_type?.startsWith("FORM") ? "form" : "team",
            }));
        }

        return [...formActivities, ...documentActivities]
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 8);
    };

    const SPECIALIST_SECTIONS = [
        { key: "C", specialty: SLP, label: "Speech-Language Pathology (SLP)" },
        { key: "D", specialty: OT, label: "Occupational Therapy (OT)" },
        { key: "E", specialty: PT, label: "Physical Therapy (PT)" },
        { key: "F1", specialty: ABA, label: "Applied Behavior Analysis (ABA)" },
        { key: "F2", specialty: DEV_PSY, label: "Developmental Psychology (Psych)" },
    ];

    const isSectionReopened = (sectionKey: string) => {
        return activityEvents.some(e => {
            const titleText = e.title || "";
            const isReopen = titleText.toLowerCase().includes("reopened");
            const keyMatch = e.metadata?.section_key === sectionKey || titleText.includes(`Section ${sectionKey} `) || titleText.includes(`Section ${sectionKey} reopened`);
            return isReopen && keyMatch;
        });
    };

    const getSpecialtyStatus = (sectionKey: string) => {
        const contrib = sectionContributions.find(c => c.section_key === sectionKey);
        if (!contrib) {
            return { status: "not_started", label: "Not Started", bg: semanticToneClass("neutral"), dot: toneDotClass.neutral };
        }
        if (contrib.status === "submitted") {
            return { status: "submitted", label: "Submitted", bg: semanticToneClass("success"), dot: toneDotClass.success };
        }
        if (isSectionReopened(sectionKey)) {
            return { status: "reopened", label: "Reopened", bg: `${semanticToneClass("danger")} animate-pulse`, dot: toneDotClass.danger };
        }
        return { status: "draft", label: "Draft", bg: semanticToneClass("warning"), dot: toneDotClass.warning };
    };

    const getAssignedSpecialist = (specialtyLabel: string) => {
        return assignedStaff.find(s => 
            s.role === "SPECIALIST" && 
            getStaffSpecialties(s).includes(specialtyLabel)
        );
    };

    const buildAdminActions = () => {
        const specialists = assignedStaff.filter(s => s.role === "SPECIALIST");
        const teachers = assignedStaff.filter(s => s.role === "TEACHER");
        const currentStudent = allStudents.find(s => s.id?.toString() === studentId);
        const isReadyForPlacement = currentStudent?.next_action?.label === "Ready for placement";
        const latestIep = docs.find(d => d.type === "IEP");
        const latestIepFinalized = latestIep?.status === "FINAL";
        const latestMonthlyReport = docs.find(d => d.type === "MONTHLY");
        const trackerTabs = normalizedStudentStatus === "INTEGRATED" ? TABS.slice(2) : TABS.slice(2, 4);
        const pendingTrackers = trackerTabs.filter(tab => !formStatuses?.[tab.id]?.submitted);
        const allTrackersSubmitted = trackerTabs.length > 0 && trackerTabs.every(tab => formStatuses?.[tab.id]?.submitted);
        const assessmentFinalized = !!formStatuses?.multi_assessment?.submitted;
        const canGenerateMonthlyReport = ["ENROLLED", "INTEGRATED"].includes(normalizedStudentStatus || "") && allTrackersSubmitted && !latestMonthlyReport;
        const actions: { id?: string; title: string; label: string; onClick: () => void; tone?: "warning" | "positive"; Icon?: React.ComponentType<{ size?: number; className?: string }> }[] = [];

        if (!formStatuses?.parent_assessment?.submitted) {
            actions.push({ title: "Parent assessment missing", label: sendingParentReminder ? "Sending..." : "Remind", onClick: handleParentAssessmentReminder, tone: "warning", Icon: Mail });
        }
        if (formStatuses?.parent_assessment?.submitted && specialists.length === 0) {
            actions.push({ title: "Assign specialist", label: "Open Team", onClick: () => handleTeamMenuChange("SPECIALIST"), Icon: UserPlus });
        }
        if (normalizedStudentStatus === "ASSESSMENT_SCHEDULED" && !formStatuses?.multi_assessment?.submitted) {
            actions.push({ id: "specialist_assessment", title: "Specialist Assessment in progress", label: "Open Team", onClick: () => handleTeamMenuChange("SPECIALIST"), Icon: Users });
        }
        if (normalizedStudentStatus === "ASSESSED" && (isReadyForPlacement || (assessmentFinalized && latestIepFinalized))) {
            actions.push({ title: `Enroll ${compactStudentName()} (Therapy)?`, label: "Enroll", onClick: () => setShowEnrollConfirm(true), tone: "positive", Icon: CheckCircle2 });
            actions.push({ title: `Integrate ${compactStudentName()} (Mainstream)?`, label: "Integrate", onClick: () => setShowIntegrateConfirm(true), tone: "positive", Icon: GraduationCap });
        }
        if (normalizedStudentStatus === "ENROLLED" && assessmentFinalized && latestIepFinalized) {
            actions.push({ title: `Integrate ${compactStudentName()} (Mainstream)?`, label: "Integrate", onClick: () => setShowIntegrateConfirm(true), tone: "positive", Icon: GraduationCap });
        }
        if (["ASSESSED", "ENROLLED"].includes(normalizedStudentStatus || "") && assessmentFinalized && !latestIep) {
            actions.push({ title: "Generate IEP", label: "Open Reports", onClick: () => handleReportMenuChange("generator"), Icon: FileText });
        }
        if (canGenerateMonthlyReport) {
            actions.push({ title: "Generate Monthly Progress Report", label: "Open Reports", onClick: () => handleReportMenuChange("generator"), tone: "positive", Icon: Sparkles });
        }
        if (normalizedStudentStatus === "INTEGRATED" && teachers.length === 0) {
            actions.push({ title: "Assign teacher", label: "Open Team", onClick: () => handleTeamMenuChange("TEACHER"), tone: "warning", Icon: UserPlus });
        }
        if (["ENROLLED", "INTEGRATED"].includes(normalizedStudentStatus || "") && pendingTrackers.length > 0) {
            actions.push({ title: `${pendingTrackers.length} tracker${pendingTrackers.length === 1 ? "" : "s"} pending`, label: "Open Forms", onClick: () => handleFormTabChange("parent_tracker"), Icon: ClipboardList });
        }

        return actions;
    };

    const renderAdminWorkspaceSidebarActions = (containerType: "reports" | "forms" | "team" | "overview") => {
        if (user?.role !== "ADMIN") return null;

        const actions = buildAdminActions();
        if (actions.length === 0) return null;

        const wrapperClass = containerType === "overview"
            ? "w-full mb-4 shrink-0 flex flex-col gap-2"
            : containerType === "team"
                ? "px-3 mb-6 shrink-0 flex flex-col gap-2"
                : "px-4 mb-6 shrink-0 flex flex-col gap-2";

        return (
            <div className={wrapperClass}>
                <p className="text-[0.65rem] font-bold text-faint uppercase tracking-widest mb-1 px-1">Actions</p>
                {actions.map((action, idx) => {
                    const Icon = action.Icon || ClipboardList;
                    const isPositive = action.tone === "positive";
                    const isWarning = action.tone === "warning";
                    
                    const btnClass = isPositive
                        ? "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm border bg-success-soft text-success border-success-line hover:bg-success-soft hover:border-success-line"
                        : isWarning
                            ? "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm border bg-warning-soft text-warning border-warning-line hover:bg-warning-soft hover:border-warning-line"
                            : "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm border bg-indigo-50/50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300";



                    return (
                        <button key={idx} onClick={action.onClick} className={btnClass}>
                            <Icon size={14} className={`shrink-0 ${isPositive ? 'animate-pulse text-success' : ''}`} />
                            <span className="flex-1 text-left truncate" title={action.title}>{action.title}</span>
                            <span className="text-[0.55rem] font-bold uppercase tracking-wider opacity-85 shrink-0 bg-white/60 px-1 rounded border border-current/10">{action.label}</span>
                        </button>
                    );
                })}
            </div>
        );
    };

    // Read-only overview for specialists and teachers: who else is on this
    // student's team, what this viewer still owes, and the clinical context they
    // would otherwise have to dig three tabs deep for.
    const renderStaffOverviewWorkspace = () => {
        const specialists = assignedStaff.filter(staff => staff.role === "SPECIALIST");
        const teachers = assignedStaff.filter(staff => staff.role === "TEACHER");
        const team = [...specialists, ...teachers];
        const latestIep = docs.find(doc => doc.type === "IEP");
        const latestMonthly = docs.find(doc => doc.type === "MONTHLY");

        // Only the forms this viewer is actually responsible for.
        const ownedTabIds = user?.role === "TEACHER"
            ? ["sped_tracker"]
            : ["multi_assessment", "multi_tracker"];
        const myForms = TABS
            .filter(tab => ownedTabIds.includes(tab.id))
            .filter(tab => statusFilteredTabs.some(t => t.id === tab.id) || formStatuses?.[tab.id]?.submitted)
            .map(tab => ({
                id: tab.id,
                label: tab.label,
                submitted: Boolean(formStatuses?.[tab.id]?.submitted),
                submittedAt: formStatuses?.[tab.id]?.submitted_at,
            }));

        const knownConditions: string[] = Array.isArray(studentDetails?.known_conditions) ? studentDetails.known_conditions : [];
        // The assessment stores a "None"/"No" answer as the alert value itself, so
        // treat those as nothing to flag rather than printing them as an alert.
        const rawAlert = String(studentDetails?.medical_alerts_detail || studentDetails?.medical_alerts || "").trim();
        const medicalAlert = ["", "none", "no"].includes(rawAlert.toLowerCase()) ? "" : rawAlert;
        const languages = normalizeLanguages([
            ...(Array.isArray(studentDetails?.primary_language) ? studentDetails.primary_language : studentDetails?.primary_language ? [studentDetails.primary_language] : []),
            ...(studentDetails?.primary_language_other ? [studentDetails.primary_language_other] : []),
        ].filter(language => language && language !== "Other"));

        const cardClass = "rounded-xl border border-line bg-card p-4 shadow-sm";
        const sectionTitleClass = "m-0 mb-3 text-xs font-bold uppercase tracking-widest text-faint";

        return (
            <div className="flex-1 bg-card relative flex flex-col overflow-hidden">
                {tabBar}
                <div className="flex-1 overflow-y-auto p-5 md:p-6">
                    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
                        {/* Your work */}
                        <section className={cardClass}>
                            <h2 className={sectionTitleClass}>Your forms for {studentName.split(" ")[0] || "this student"}</h2>
                            {myForms.length > 0 ? (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {myForms.map(form => (
                                        <button
                                            key={form.id}
                                            type="button"
                                            onClick={() => handleFormTabChange(form.id)}
                                            className="flex items-center gap-3 rounded-xl border border-line bg-app px-3 py-2.5 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                                        >
                                            <ClipboardList className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                                            <div className="min-w-0 flex-1">
                                                <p className="m-0 truncate text-sm font-bold text-fg">{form.label}</p>
                                                <p className="m-0 text-xs text-muted">
                                                    {form.submitted
                                                        ? form.submittedAt ? `Submitted ${formatDocumentDateTime(form.submittedAt)}` : "Submitted"
                                                        : "Not submitted yet"}
                                                </p>
                                            </div>
                                            {form.submitted
                                                ? <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={3} aria-hidden="true" />
                                                : <span className={workspaceBadgeClass("warning", "shrink-0 px-1.5 py-0")}>To do</span>}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="m-0 text-sm text-muted">
                                    Nothing is due from you at this stage of {studentName.split(" ")[0] || "this student"}&apos;s journey.
                                </p>
                            )}
                        </section>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {/* Who else is on the team */}
                            <section className={cardClass}>
                                <h2 className={sectionTitleClass}>Care team</h2>
                                {team.length > 0 ? (
                                    <div className="flex flex-col gap-2">
                                        {team.map(staff => {
                                            const isMe = staff.id === user?.user_id;
                                            const staffSpecialties = getStaffSpecialties(staff);
                                            return (
                                                <div
                                                    key={`${staff.role}-${staff.id}`}
                                                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${isMe ? semanticToneClass("primary") : "border-line bg-app"}`}
                                                >
                                                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold ${semanticToneClass("primary")}`}>
                                                        {(staff.first_name?.[0] || "") + (staff.last_name?.[0] || "")}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="m-0 flex items-center gap-1.5 truncate text-sm font-bold text-fg">
                                                            {getStaffName(staff)}
                                                            {isMe && <span className={workspaceBadgeClass("primary", "px-1.5 py-0")}>You</span>}
                                                        </p>
                                                        <p className="m-0 truncate text-xs font-semibold text-muted">
                                                            {staff.role === "TEACHER"
                                                                ? "Classroom Teacher"
                                                                : staffSpecialties.map(specialty => specialtyShortLabel(specialty as SectionOwner)).join(" · ") || "Specialist"}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="m-0 text-sm text-muted">No other staff are assigned to this student yet.</p>
                                )}
                            </section>

                            {/* Clinical context */}
                            <section className={cardClass}>
                                <h2 className={sectionTitleClass}>At a glance</h2>
                                <div className="flex flex-col divide-y divide-line">
                                    <div className="flex items-start justify-between gap-3 py-2 first:pt-0">
                                        <span className="text-sm font-semibold text-muted">Cycle</span>
                                        <span className="text-right text-sm font-bold text-fg">{activeCycle?.label || "No active cycle"}</span>
                                    </div>
                                    <div className="flex items-start justify-between gap-3 py-2">
                                        <span className="text-sm font-semibold text-muted">Languages at home</span>
                                        <span className="text-right text-sm font-bold text-fg">{languages.length > 0 ? languages.join(", ") : "Not provided"}</span>
                                    </div>
                                    <div className="flex items-start justify-between gap-3 py-2">
                                        <span className="text-sm font-semibold text-muted">Medical alerts</span>
                                        <span className={`text-right text-sm font-bold ${medicalAlert ? "text-warning" : "text-fg"}`}>
                                            {medicalAlert || "None noted"}
                                        </span>
                                    </div>
                                    <div className="flex items-start justify-between gap-3 py-2 last:pb-0">
                                        <span className="text-sm font-semibold text-muted">Known conditions</span>
                                        <span className="text-right text-sm font-bold text-fg">
                                            {knownConditions.length > 0 ? knownConditions.join(", ") : "None noted"}
                                        </span>
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Team documents */}
                        <section className={cardClass}>
                            <h2 className={sectionTitleClass}>Plans &amp; reports</h2>
                            {latestIep || latestMonthly ? (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {latestIep && (
                                        <button
                                            type="button"
                                            onClick={() => handleReportMenuChange("iep", latestIep.id.toString())}
                                            className="flex items-center gap-3 rounded-xl border border-line bg-app px-3 py-2.5 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                                        >
                                            <FileText className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
                                            <div className="min-w-0 flex-1">
                                                <p className="m-0 text-sm font-bold text-fg">Current IEP</p>
                                                <p className="m-0 text-xs text-muted">{formatDocumentDateTime(latestIep.created_at)}</p>
                                            </div>
                                            <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                                        </button>
                                    )}
                                    {latestMonthly && (
                                        <button
                                            type="button"
                                            onClick={() => handleReportMenuChange("monthly", latestMonthly.id.toString())}
                                            className="flex items-center gap-3 rounded-xl border border-line bg-app px-3 py-2.5 text-left transition-colors hover:border-success-line hover:bg-success-soft/40"
                                        >
                                            <FileCheck2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                                            <div className="min-w-0 flex-1">
                                                <p className="m-0 text-sm font-bold text-fg">Latest monthly report</p>
                                                <p className="m-0 text-xs text-muted">{formatDocumentDateTime(latestMonthly.created_at)}</p>
                                            </div>
                                            <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <p className="m-0 text-sm text-muted">No learning plan or progress report has been generated yet.</p>
                            )}
                        </section>
                    </div>
                </div>
            </div>
        );
    };

    const renderOverviewWorkspace = () => {
        const actions = buildAdminActions();
        const submittedForms = TABS.filter(tab => formStatuses?.[tab.id]?.submitted).length;
        const latestDoc = docs[0];
        const specialists = assignedStaff.filter(s => s.role === "SPECIALIST");
        const teachers = assignedStaff.filter(s => s.role === "TEACHER");
        const recentActivity = buildRecentActivity();
        const parentRows = [
            { label: "Name", value: studentDetails?.parent_guardian_name || "Not provided" },
            { label: "Email", value: studentDetails?.parent_email || "Not provided", href: studentDetails?.parent_email ? `mailto:${studentDetails.parent_email}` : undefined },
            { label: "Phone", value: studentDetails?.parent_phone || "Not provided", href: studentDetails?.parent_phone ? `tel:${studentDetails.parent_phone}` : undefined },
        ];

        const parentInitials = (studentDetails?.parent_guardian_name || "")
            .split(" ").map((p: string) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
        const formsPct = Math.round((submittedForms / 5) * 100);

        return (
            <>
                <div className="hidden">
                    <div className="px-5 py-4 border-b border-line">
                        <h1 className="text-xl font-extrabold text-fg m-0 leading-tight tracking-tight" title={studentName}>{studentName}</h1>
                        {studentStatus && (
                            <span style={{
                                display: "inline-block", marginTop: 8,
                                fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px",
                                padding: "3px 9px", borderRadius: "999px",
                                background: STATUS_COLORS[studentStatus?.toUpperCase()]?.bg || "var(--bg-neutral-light)",
                                color: STATUS_COLORS[studentStatus?.toUpperCase()]?.color || "var(--text-secondary)",
                            }}>
                                {STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto py-4 px-3 custom-scrollbar flex flex-col gap-3">
                        {renderAdminWorkspaceSidebarActions("overview")}


                    </div>
                </div>

                <div className="flex-1 bg-card relative flex flex-col overflow-hidden">
                    {tabBar}
                    <div className="flex-1 overflow-y-auto p-5 md:p-6">


                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Action Queue */}
                        <section className="rounded-xl border border-line shadow-sm p-4 lg:col-span-2 bg-card">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-base font-bold text-fg m-0 flex items-center gap-2">
                                    Action Queue
                                </h2>
                                {actions.length > 0 && (
                                    <span className={workspaceBadgeClass("warning")}>
                                        {actions.length} active
                                    </span>
                                )}
                            </div>
                            {actions.length === 0 ? (
                                <div className="flex items-center gap-2 text-sm text-muted py-4 px-3 rounded-lg bg-success-soft border border-success-line">
                                    <CheckCircle2 size={16} className="text-success" />
                                    All caught up — no urgent admin follow-ups.
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {actions.map(action => {
                                        const Icon = action.Icon || ClipboardList;
                                        const accent =
                                            action.tone === "warning" ? { border: "border-warning-line", bg: "bg-warning-soft", stripe: "bg-warning-solid", iconBg: "bg-warning-soft", iconColor: "text-warning", btn: "bg-warning-solid hover:bg-warning-solid text-white" } :
                                            action.tone === "positive" ? { border: "border-success-line", bg: "bg-success-soft", stripe: "bg-success-solid", iconBg: "bg-success-soft", iconColor: "text-success", btn: "bg-success-solid hover:bg-success-solid text-white" } :
                                                                          { border: "border-indigo-200", bg: "bg-indigo-50/40", stripe: "bg-indigo-500", iconBg: "bg-indigo-100", iconColor: "text-indigo-700", btn: "bg-indigo-600 hover:bg-indigo-700 text-white" };
                                        if (action.id === "specialist_assessment") {
                                            return (
                                                <div key={action.title} className="relative flex flex-col gap-4 rounded-xl border border-indigo-200 bg-indigo-50/20 p-4 overflow-hidden shadow-sm">
                                                    <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500" />
                                                    <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 shadow-sm">
                                                                <Icon size={16} />
                                                            </span>
                                                            <div>
                                                                <p className="text-sm font-extrabold text-slate-950 m-0">{action.title}</p>
                                                                <p className="text-[0.7rem] font-medium text-muted m-0">Specialist tracking is updated in real-time</p>
                                                            </div>
                                                        </div>
                                                        <button onClick={action.onClick} className="shrink-0 text-xs font-extrabold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow transition-colors flex items-center gap-1.5">
                                                            <Users size={12} />
                                                            {action.label}
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-1">
                                                        {SPECIALIST_SECTIONS.map(sec => {
                                                            const statusInfo = getSpecialtyStatus(sec.key);
                                                            const specialist = getAssignedSpecialist(sec.specialty);
                                                            const specialistName = specialist ? getStaffName(specialist) : "Unassigned";

                                                            return (
                                                                <div key={sec.key} className="flex flex-col justify-between p-3 rounded-xl border border-line bg-card hover:border-slate-350 transition-all shadow-xs relative">
                                                                    <div className="mb-2">
                                                                        <span className="text-[0.6rem] font-bold text-faint uppercase tracking-wider block mb-0.5">Section {sec.key}</span>
                                                                        <h4 className="text-xs font-bold text-fg line-clamp-1 leading-snug" title={sec.label}>
                                                                            {sec.key === "C" ? "SLP" : sec.key === "D" ? "OT" : sec.key === "E" ? "PT" : sec.key === "F1" ? "ABA" : "Psych"}
                                                                        </h4>
                                                                        <p className="text-[0.7rem] font-semibold text-muted mt-1 truncate" title={specialistName}>
                                                                            👤 {specialistName}
                                                                        </p>
                                                                    </div>
                                                                    <div className={`mt-1 flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[0.65rem] font-bold w-fit ${statusInfo.bg}`}>
                                                                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                                                                        {statusInfo.label}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={action.title} className={`relative flex items-center justify-between gap-3 rounded-lg border ${accent.border} ${accent.bg} pl-4 pr-3 py-2.5 overflow-hidden`}>
                                                <span className={`absolute left-0 top-0 bottom-0 w-1 ${accent.stripe}`} />
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <span className={`w-7 h-7 rounded-md ${accent.iconBg} ${accent.iconColor} flex items-center justify-center shrink-0`}>
                                                        <Icon size={15} />
                                                    </span>
                                                    <p className="text-sm font-bold text-fg m-0 truncate">{action.title}</p>
                                                </div>
                                                <button onClick={action.onClick} className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-md transition-colors ${accent.btn}`}>
                                                    {action.label}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>


                        {/* Student Snapshot */}
                        <section className="rounded-xl border border-line shadow-sm p-4 bg-card">
                            <h2 className="text-base font-bold text-fg mb-3 m-0">Student Snapshot</h2>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-faint m-0">Grade</p>
                                    <p className="text-sm font-bold text-fg m-0">{studentDetails?.grade || "TBD"}</p>
                                </div>
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-faint m-0">Age</p>
                                    <p className="text-sm font-bold text-fg m-0">{calculateAge(studentDetails?.date_of_birth)}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-faint m-0 flex items-center gap-1.5">
                                        <Calendar size={11} /> Date of Birth
                                    </p>
                                    <p className="text-sm font-bold text-fg m-0">{formatDate(studentDetails?.date_of_birth)}</p>
                                </div>
                            </div>
                            <div className="border-t border-line pt-3">
                                <button onClick={() => setWorkspace("reports")} className="w-full text-left rounded-lg p-1 -m-1">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-xs font-bold text-muted m-0">Form completion</p>
                                        <span className="text-xs font-bold text-indigo-600">{submittedForms}/5</span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-subtle-soft overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all" style={{ width: `${formsPct}%` }} />
                                    </div>
                                </button>
                            </div>
                        </section>

                        {/* Recent Activity (timeline) */}
                        <section className="rounded-xl border border-line shadow-sm p-4 lg:col-span-2 bg-card">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-base font-bold text-fg m-0">Recent Activity</h2>
                                <button onClick={() => setIsActivityDrawerOpen(true)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 rounded-lg p-1 -m-1">
                                    View all →
                                </button>
                            </div>
                            {recentActivity.length === 0 ? (
                                <p className="text-sm text-muted">No recorded form or document activity yet.</p>
                            ) : (
                                <div className="relative max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                                    <span className="absolute left-[7px] top-2 bottom-2 w-px bg-subtle-soft" aria-hidden />
                                    <div className="flex flex-col">
                                        {recentActivity.map((item: any) => (
                                            <div key={item.id} className="relative flex items-start gap-3 pl-1 py-2.5 group">
                                                <span className={`relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full ring-2 ring-white ${item.tone === "document" ? "bg-indigo-500" : "bg-success-solid"}`} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="m-0 truncate text-sm font-bold text-fg">{item.title}</p>
                                                    <p className="m-0 truncate text-xs font-semibold text-muted">{item.meta}</p>
                                                </div>
                                                <span className="shrink-0 text-xs font-mono font-semibold text-faint mt-0.5" title={formatActivityTime(item.timestamp)}>
                                                    {formatRelativeTime(item.timestamp)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* Parent */}
                        <section className="rounded-xl border border-line shadow-sm p-4 bg-card">
                            <h2 className="text-base font-bold text-fg mb-3 m-0">Parent</h2>
                            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-line">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                                    {parentInitials}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-fg m-0 truncate">{studentDetails?.parent_guardian_name || "Not provided"}</p>
                                    <p className="text-[0.7rem] font-semibold text-faint m-0">Primary contact</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                {parentRows.slice(1).map(row => (
                                    <div key={row.label} className="flex items-center justify-between gap-3">
                                        <span className="text-xs font-semibold text-muted">{row.label}</span>
                                        {row.href ? (
                                            <a href={row.href} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 truncate">{row.value}</a>
                                        ) : (
                                            <span className="text-xs font-bold text-fg truncate">{row.value}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Team & Documents */}
                        <section className="rounded-xl border border-line shadow-sm p-4 lg:col-span-2 bg-card">
                            <h2 className="text-base font-bold text-fg mb-3 m-0">Team & Documents</h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-faint mb-1.5 flex items-center gap-1.5">
                                        <Users size={11} /> Specialists
                                    </p>
                                    {specialists.length === 0 ? (
                                        <button onClick={() => handleTeamMenuChange("SPECIALIST")} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 rounded-lg p-1 -m-1">
                                            <Plus size={12} /> Assign specialist
                                        </button>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {specialists.map(sp => {
                                                const specs = (sp.specialties && sp.specialties.length > 0) ? sp.specialties : (sp.specialty ? [sp.specialty] : []);
                                                const initials = `${sp.first_name?.[0] || ""}${sp.last_name?.[0] || ""}`.toUpperCase() || (sp.email?.[0] || "?").toUpperCase();
                                                const fullName = `${sp.first_name || ""} ${sp.last_name || ""}`.trim() || sp.email;
                                                const shortLabel = (s: string) => {
                                                    const v = s.toLowerCase();
                                                    if (v.includes("speech")) return "SLP";
                                                    if (v.includes("occupational")) return "OT";
                                                    if (v.includes("physical")) return "PT";
                                                    if (v.includes("behavior")) return "ABA";
                                                    if (v.includes("developmental")) return "Dev. Psych";
                                                    return s;
                                                };
                                                return (
                                                    <span key={sp.id} className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 pl-1 pr-2.5 py-0.5" title={fullName}>
                                                        <span className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-800 text-[0.6rem] font-bold flex items-center justify-center">{initials}</span>
                                                        <span className="text-[0.7rem] font-bold text-indigo-800 truncate max-w-[8rem]">{fullName}</span>
                                                        {specs.length > 0 && (
                                                            <span className="text-[0.6rem] font-bold text-indigo-600 bg-card px-1 rounded">{shortLabel(specs[0])}</span>
                                                        )}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-faint mb-1.5 flex items-center gap-1.5">
                                        <GraduationCap size={11} /> Teachers
                                    </p>
                                    {teachers.length === 0 ? (
                                        <button onClick={() => handleTeamMenuChange("TEACHER")} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 rounded-lg p-1 -m-1">
                                            <Plus size={12} /> Assign teacher
                                        </button>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {teachers.map(t => {
                                                const initials = `${t.first_name?.[0] || ""}${t.last_name?.[0] || ""}`.toUpperCase() || (t.email?.[0] || "?").toUpperCase();
                                                const fullName = `${t.first_name || ""} ${t.last_name || ""}`.trim() || t.email;
                                                return (
                                                    <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full border border-success-line bg-success-soft pl-1 pr-2.5 py-0.5">
                                                        <span className="w-5 h-5 rounded-full bg-success-soft text-success text-[0.6rem] font-bold flex items-center justify-center">{initials}</span>
                                                        <span className="text-[0.7rem] font-bold text-success truncate max-w-[8rem]">{fullName}</span>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-faint mb-1.5 flex items-center gap-1.5">
                                        <FileCheck2 size={11} /> Latest document
                                    </p>
                                    {!latestDoc ? (
                                        <button onClick={() => handleReportMenuChange("generator")} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 rounded-lg p-1 -m-1">
                                            <Plus size={12} /> Generate document
                                        </button>
                                    ) : (
                                        <button onClick={() => handleReportMenuChange("history")} className="text-left rounded-lg p-1 -m-1">
                                            <p className="text-sm font-bold text-fg m-0">{latestDoc.type}</p>
                                            <p className="text-[0.7rem] font-semibold text-muted m-0">{formatDocumentDateTime(latestDoc.created_at)}</p>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {(formStatuses?.parent_assessment?.submitted || formStatuses?.multi_assessment?.submitted) && (
                                <div className="border-t border-line mt-4 pt-3">
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-faint mb-2 flex items-center gap-1.5">
                                        <ClipboardList size={11} /> Initial Assessments
                                    </p>
                                    <div className="flex flex-wrap gap-3">
                                        {formStatuses?.parent_assessment?.submitted && (
                                            <button 
                                                onClick={() => {
                                                    const url = new URL(window.location.href);
                                                    url.searchParams.set("workspace", "forms");
                                                    url.searchParams.set("tab", "parent_assessment");
                                                    navigateWithTeamGuard(url.pathname + url.search);
                                                }}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-app hover:bg-subtle-soft hover:border-line px-3 py-1.5 text-xs font-bold text-fg shadow-sm transition-colors cursor-pointer"
                                            >
                                                <FileText size={12} className="text-indigo-500" />
                                                Parent Assessment
                                            </button>
                                        )}
                                        {formStatuses?.multi_assessment?.submitted && (
                                            <button 
                                                onClick={() => {
                                                    const url = new URL(window.location.href);
                                                    url.searchParams.set("workspace", "forms");
                                                    url.searchParams.set("tab", "multi_assessment");
                                                    navigateWithTeamGuard(url.pathname + url.search);
                                                }}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-app hover:bg-subtle-soft hover:border-line px-3 py-1.5 text-xs font-bold text-fg shadow-sm transition-colors cursor-pointer"
                                            >
                                                <FileText size={12} className="text-indigo-500" />
                                                Specialist Assessment
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* Danger Zone Section */}
                        {user?.role === "ADMIN" && (
                            <section className="rounded-xl border border-danger-line shadow-sm p-4 bg-danger-soft">
                                <h2 className="text-base font-bold text-danger mb-3 m-0 flex items-center gap-1.5">
                                    <AlertCircle size={15} /> Danger Zone
                                </h2>
                                <p className="text-xs text-danger mb-4 leading-relaxed font-semibold">
                                    Permanently delete this student and all of their associated forms, assessments, and reports. This action cannot be undone.
                                </p>
                                <button
                                    onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(""); setDeleteError(""); }}
                                    className="w-full text-center py-2 px-4 rounded-lg bg-danger-solid hover:bg-danger-strong border border-danger-solid hover:border-danger-strong text-white text-sm font-bold shadow transition-colors duration-200"
                                >
                                    Delete Student
                                </button>
                            </section>
                        )}
                    </div>
                    </div>
                </div>

                {/* Sliding Activity History Drawer */}
                {isActivityDrawerOpen && (
                  <>
                    <div 
                      className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity" 
                      style={{ zIndex: 99998 }}
                      onClick={() => setIsActivityDrawerOpen(false)} 
                    />
                    <div 
                      className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card shadow-2xl flex flex-col border-l border-line"
                      style={{ 
                        zIndex: 99999, 
                        backgroundColor: "var(--bg-secondary, #ffffff)",
                        color: "var(--text-primary, var(--text-primary))",
                        borderLeftColor: "var(--border-light, var(--border-light))"
                      }}
                    >
                      <div 
                        className="flex items-center justify-between border-b px-6 py-4"
                        style={{ borderBottomColor: "var(--border-light, var(--border-light))" }}
                      >
                        <div>
                          <h3 className="text-base font-extrabold m-0" style={{ color: "var(--text-primary, var(--text-primary))" }}>
                            Activity History
                          </h3>
                          <p className="text-[0.7rem] font-semibold text-faint m-0">
                            {studentName}'s complete operational logs
                          </p>
                        </div>
                        <button 
                          onClick={() => setIsActivityDrawerOpen(false)} 
                          className="p-1.5 rounded-lg border-none cursor-pointer flex items-center justify-center transition-colors"
                          style={{
                            backgroundColor: "var(--bg-primary, var(--bg-primary))",
                            color: "var(--text-secondary, var(--text-secondary))"
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        {activityEvents.length === 0 ? (
                          <p className="text-sm text-faint text-center py-12">
                            No recorded timeline events for this student.
                          </p>
                        ) : (
                          <div className="relative pl-3">
                            <span 
                              className="absolute left-[7px] top-2 bottom-2 w-px" 
                              style={{ backgroundColor: "var(--border-light, var(--border-light))" }}
                              aria-hidden 
                            />
                            <div className="flex flex-col gap-6">
                              {activityEvents.map((event) => {
                                const isDoc = event.event_type?.toLowerCase().includes("document") || 
                                              event.message?.toLowerCase().includes("report") || 
                                              event.message?.toLowerCase().includes("iep");
                                return (
                                  <div key={event.id} className="relative flex flex-col gap-1 pl-4 group">
                                    <span 
                                      className={`absolute left-[-13px] top-1.5 h-3 w-3 rounded-full ring-4`}
                                      style={{
                                        backgroundColor: isDoc ? "var(--accent-primary, #3b82f6)" : "var(--success, #10b981)",
                                        // Uses the background secondary variable for the ring color to blend with the drawer background
                                        boxShadow: "0 0 0 4px var(--bg-secondary, #ffffff)"
                                      }}
                                    />
                                    <div className="flex items-start justify-between gap-3">
                                      <p className="text-xs font-bold m-0 leading-snug" style={{ color: "var(--text-primary, var(--text-primary))" }}>
                                        {event.message}
                                      </p>
                                      <span className="text-[0.6rem] font-mono font-semibold text-faint whitespace-nowrap">
                                        {formatRelativeTime(event.created_at || event.timestamp)}
                                      </span>
                                    </div>
                                    {event.actor_email && (
                                      <p className="text-[0.65rem] text-faint m-0 font-medium">
                                        👤 Performed by: {event.actor_email}
                                      </p>
                                    )}
                                    <span className="text-[0.65rem] text-faint font-mono" title={formatActivityTime(event.created_at || event.timestamp)}>
                                      {formatActivityTime(event.created_at || event.timestamp)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
            </>
        );
    };

    // 1. FORMS WORKSPACE RENDERER
    const renderFormsWorkspace = () => {
        const currentTabConf = TABS.find(t => t.id === activeFormTab);
        const currentStatus = formStatuses[activeFormTab];
        const isStudentEnrolled = ["ENROLLED", "INTEGRATED"].includes(studentStatus?.toUpperCase() || "");
        const assessmentTabs = user?.role === "PARENT"
            ? visibleFormTabs.filter(tab => tab.id === "parent_assessment")
            : user?.role === "TEACHER"
                ? visibleFormTabs.filter(tab => tab.id === "sped_assessment")
                : visibleFormTabs.filter(tab => ["parent_assessment", "multi_assessment", "sped_assessment"].includes(tab.id));
        const progressTabs = user?.role === "PARENT"
            ? visibleFormTabs.filter(tab => tab.id === "parent_tracker")
            : user?.role === "SPECIALIST"
                ? visibleFormTabs.filter(tab => tab.id === "multi_tracker")
                : user?.role === "TEACHER"
                    ? visibleFormTabs.filter(tab => tab.id === "sped_tracker")
                    : visibleFormTabs.filter(tab => ["parent_tracker", "multi_tracker", "sped_tracker"].includes(tab.id));
        const isAdminAssessmentLocked = user?.role === "ADMIN" && ["parent_assessment", "multi_assessment", "sped_assessment"].includes(activeFormTab) && !currentStatus?.submitted;
        const isAdminProgressLocked = user?.role === "ADMIN" && (
            (["parent_tracker", "multi_tracker"].includes(activeFormTab) && !isStudentEnrolled) ||
            (activeFormTab === "sped_tracker" && studentStatus?.toUpperCase() !== "INTEGRATED")
        );
        const isSpecialistProgressLocked = user?.role === "SPECIALIST" && activeFormTab === "multi_tracker" && !isStudentEnrolled;
        const isTeacherProgressLocked = user?.role === "TEACHER" && activeFormTab === "sped_tracker" && studentStatus?.toUpperCase() !== "INTEGRATED";
        const isParentProgressLocked = user?.role === "PARENT" && activeFormTab === "parent_tracker" && !isStudentEnrolled;
        const isSpecialistOnboardingLocked = user?.role === "SPECIALIST" && specialistOnboardingIncomplete && ["multi_assessment", "multi_tracker"].includes(activeFormTab);
        const canEditUnlockedParentAssessment = user?.role === "PARENT"
            && activeFormTab === "parent_assessment"
            && !!currentStatus?.submitted
            && !!currentStatus?.unlocked
            && currentStatus?.unlock_available !== false;
        const canCreateCurrentForm =
            !isAdminAssessmentLocked && !isAdminProgressLocked && !isSpecialistProgressLocked && !isTeacherProgressLocked && !isParentProgressLocked && !isSpecialistOnboardingLocked && (
                canEditUnlockedParentAssessment ||
                (!currentStatus?.submitted && (
                (user?.role === "SPECIALIST" && ["multi_assessment", "multi_tracker"].includes(activeFormTab)) ||
                (user?.role === "TEACHER" && activeFormTab === "sped_tracker") ||
                (user?.role === "PARENT" && ["parent_assessment", "parent_tracker"].includes(activeFormTab))
                ))
            );

        // Specialists and teachers have their own input form(s) and, separately, read-only
        // access to the rest of the team's submissions (parent + the other discipline).
        // These are kept in two groups so the secondary bar can visually distinguish
        // "what I fill in" from "reference I can only view". Cross-discipline forms only
        // appear once submitted, so the group never shows empty placeholders.
        const staffOwnTabs = user?.role === "SPECIALIST"
            ? [
                { id: "multi_assessment", label: "Specialist Assessment" },
                ...(isStudentEnrolled ? [{ id: "multi_tracker", label: "Specialist Progress" }] : []),
            ]
            : user?.role === "TEACHER"
                ? [{ id: "sped_tracker", label: "Teacher Progress" }]
                : [];
        const staffReferenceTabs = user?.role === "SPECIALIST"
            ? [
                ...(formStatuses?.parent_assessment?.submitted ? [{ id: "parent_assessment", label: "Parent Assessment" }] : []),
                ...(isStudentEnrolled ? [{ id: "parent_tracker", label: "Parent Progress" }] : []),
                ...(formStatuses?.sped_tracker?.submitted ? [{ id: "sped_tracker", label: "Teacher Progress" }] : []),
            ]
            : user?.role === "TEACHER"
                ? [
                    ...(isStudentEnrolled ? [{ id: "parent_tracker", label: "Parent Progress" }] : []),
                    ...(formStatuses?.multi_assessment?.submitted ? [{ id: "multi_assessment", label: "Specialist Assessment" }] : []),
                    ...(formStatuses?.multi_tracker?.submitted ? [{ id: "multi_tracker", label: "Specialist Progress" }] : []),
                ]
                : [];

        return (
            <>
                <div className="hidden">
                    <div className="px-5 py-4 border-b border-line">
                        <h1 className="text-xl font-extrabold text-fg m-0 leading-tight tracking-tight" title={studentName}>{studentName}</h1>
                        {studentStatus && (
                            <span style={{
                                display: "inline-block", marginTop: 8,
                                fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px",
                                padding: "3px 9px", borderRadius: "999px",
                                background: STATUS_COLORS[studentStatus?.toUpperCase()]?.bg || "var(--bg-neutral-light)",
                                color: STATUS_COLORS[studentStatus?.toUpperCase()]?.color || "var(--text-secondary)",
                            }}>
                                {STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                        {renderAdminWorkspaceSidebarActions("forms")}
                        {assessmentTabs.length > 0 && (
                            <div className="px-3 mb-4">
                                <p className="text-[0.65rem] font-bold text-faint uppercase tracking-widest mb-3 px-2">{user?.role === "PARENT" ? "Your Input" : "Assessments"}</p>
                                <div className="flex flex-col gap-1">
                                    {assessmentTabs.map((tab) => {
                                        const isSub = formStatuses[tab.id]?.submitted;
                                        const isActive = activeFormTab === tab.id;
                                        const isLocked = user?.role === "ADMIN" && !isSub;
                                        return (
                                            <button key={tab.id} onClick={() => !isLocked && handleFormTabChange(tab.id)} disabled={isLocked} title={isLocked ? "Available after submission" : undefined} className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg transition-all border ${isLocked ? 'border-transparent text-faint cursor-not-allowed opacity-70' : isActive ? 'bg-indigo-50 border-indigo-200 shadow-sm relative' : 'border-transparent hover:bg-subtle-soft'}`}>
                                                {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                                <span className={`text-sm font-bold truncate ${isLocked ? 'text-faint' : isActive ? 'text-indigo-800' : 'text-fg'}`}>{user?.role === "PARENT" && tab.id === "parent_assessment" ? "About Your Child" : tab.label}</span>
                                                {isLocked ? (
                                                    <Lock className="w-4 h-4 text-faint shrink-0 ml-2" aria-hidden="true" />
                                                ) : isSub && <Check className="w-4 h-4 text-success shrink-0 ml-2" strokeWidth={3} aria-hidden="true" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="px-3 pb-4">
                            <p className="text-[0.65rem] font-bold text-faint uppercase tracking-widest mb-3 px-2">{user?.role === "PARENT" ? "Monthly Updates" : "Progress Trackers"}</p>
                            <div className="flex flex-col gap-1">
                                {progressTabs.map((tab) => {
                                    const isSub = formStatuses[tab.id]?.submitted;
                                    const isActive = activeFormTab === tab.id;
                                    const isLocked = !isStudentEnrolled || (tab.id === "sped_tracker" && studentStatus?.toUpperCase() !== "INTEGRATED");
                                    return (
                                        <button key={tab.id} onClick={() => !isLocked && handleFormTabChange(tab.id)} disabled={isLocked} title={isLocked ? "Available after enrollment/integration" : undefined} className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg transition-all border ${isLocked ? 'border-transparent text-faint cursor-not-allowed opacity-70' : isActive ? 'bg-success-soft border-success-line shadow-sm relative' : 'border-transparent hover:bg-subtle-soft'}`}>
                                            {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-success-solid rounded-r"></div>}
                                            <span className={`text-sm font-bold truncate ${isLocked ? 'text-faint' : isActive ? 'text-success' : 'text-fg'}`}>{user?.role === "PARENT" && tab.id === "parent_tracker" ? "Home Update" : tab.label}</span>
                                            {isLocked ? (
                                                <Lock className="w-4 h-4 text-faint shrink-0 ml-2" aria-hidden="true" />
                                            ) : isSub && <Check className="w-4 h-4 text-success shrink-0 ml-2" strokeWidth={3} aria-hidden="true" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-card relative overflow-y-auto flex flex-col">
                    {tabBar}
                    {(staffOwnTabs.length + staffReferenceTabs.length) > 1 && (
                        <div className="shrink-0 border-b border-line bg-app/70 px-4 py-1 md:px-6">
                            <div className="flex items-center gap-2 overflow-x-auto secondary-header-scrollbar">
                                {staffOwnTabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => handleFormTabChange(tab.id)}
                                        className={workspaceSecondaryTabClass({ active: activeFormTab === tab.id })}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                                {staffReferenceTabs.length > 0 && (
                                    <>
                                        <div className="mx-1 h-6 w-px shrink-0 bg-subtle-soft" aria-hidden="true" />
                                        <span className="shrink-0 pl-1 pr-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-faint">
                                            Team input
                                        </span>
                                        {staffReferenceTabs.map(tab => (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                onClick={() => handleFormTabChange(tab.id)}
                                                title="Read-only — submitted by another team member"
                                                className={workspaceSecondaryTabClass({ active: activeFormTab === tab.id, tone: "neutral" })}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                    <div className="flex-1 overflow-y-auto">
                    {specialistOnboardingIncomplete && (
                        <div className="px-5 pt-5 md:px-6 md:pt-6">
                            <div className={workspaceAlertClass("warning", "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between")}>
                                <div>
                                    <p className="m-0 text-sm font-bold">Complete your profile setup</p>
                                    <p className="m-0 text-sm">{specialistOnboardingMessage(user?.specialist_onboarding_missing)}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => router.push("/specialist-onboarding")}
                                    className="rounded-lg border border-warning-line bg-warning-solid px-4 py-2 text-sm font-bold text-white transition-colors hover:border-warning-line hover:bg-warning-solid"
                                >
                                    Finish setup
                                </button>
                            </div>
                        </div>
                    )}
                    {isAdminAssessmentLocked ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-app border border-line rounded-full flex items-center justify-center mb-4 text-faint">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-fg mb-1">Assessment Locked</h3>
                            <p className="text-sm text-muted max-w-sm">This assessment will be available for admin review after it is submitted.</p>
                        </div>
                    ) : isSpecialistOnboardingLocked ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-warning-soft border border-warning-line rounded-full flex items-center justify-center mb-4 text-warning">
                                <Calendar className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-fg mb-1">Finish profile setup first</h3>
                            <p className="text-sm text-muted max-w-md">{specialistOnboardingMessage(user?.specialist_onboarding_missing)}</p>
                            <button
                                type="button"
                                onClick={() => router.push("/specialist-onboarding")}
                                className="mt-4 rounded-lg bg-warning-solid px-4 py-2 text-sm font-bold text-white hover:bg-warning-solid"
                            >
                                Open setup
                            </button>
                        </div>
                    ) : isAdminProgressLocked ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-app border border-line rounded-full flex items-center justify-center mb-4 text-faint">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-fg mb-1">Progress Locked</h3>
                            <p className="text-sm text-muted max-w-sm">Progress trackers are available after the student is enrolled.</p>
                        </div>
                    ) : isSpecialistProgressLocked || isTeacherProgressLocked ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-app border border-line rounded-full flex items-center justify-center mb-4 text-faint">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-fg mb-1">Progress Locked</h3>
                            <p className="text-sm text-muted max-w-sm">{user?.role === "TEACHER" ? "Teacher progress can be submitted after the student is integrated." : "Specialist progress can be submitted after the student is enrolled."}</p>
                        </div>
                    ) : isParentProgressLocked ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-app border border-line rounded-full flex items-center justify-center mb-4 text-faint">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-fg mb-1">Nothing to do here yet</h3>
                            <p className="text-sm text-muted max-w-sm">Any progress tracking items will appear here once your child is fully enrolled. If you haven't yet, please fill out the parent assessment from the dashboard.</p>
                        </div>
                    ) : canCreateCurrentForm ? (
                        <div className="w-full">
                            {activeFormTab === "parent_assessment" ? (
                                <ParentFormContent
                                    key={`${studentId}-${activeFormTab}-edit`}
                                    propHideNavigation={true}
                                    propStudentId={studentId as string}
                                    propSubmissionId={canEditUnlockedParentAssessment ? currentStatus.id?.toString() : undefined}
                                    propOnSubmitted={handleEmbeddedFormSubmitted}
                                />
                            ) : (
                                <FormEntryContent key={`${studentId}-${activeFormTab}-edit`} propType={currentTabConf?.formType as string} propHideNavigation={true} propStudentId={studentId as string} propOnSubmitted={handleEmbeddedFormSubmitted} />
                            )}
                        </div>
                    ) : !currentStatus?.submitted ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-app border border-line rounded-full flex items-center justify-center mb-4 text-faint">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-fg mb-1">Form Not Submitted</h3>
                            <p className="text-sm text-muted max-w-sm">No completed submission exists yet for {currentTabConf?.label}.</p>
                        </div>
                    ) : (
                        <div className="w-full">
                            {activeFormTab === "parent_assessment" ? (
                                <ParentFormContent
                                    key={`${studentId}-${activeFormTab}-view`}
                                    propMode="view"
                                    propHideNavigation={true}
                                    propStudentId={studentId as string}
                                    propSubmissionId={currentStatus.id?.toString()}
                                    propReportCycleId={activeCycle?.id}
                                    propSpecialistSubmitted={!!formStatuses?.multi_assessment?.submitted}
                                    propUnlockAvailable={currentStatus?.unlock_available}
                                    propOnUnlocked={() => setProfileRefreshKey(key => key + 1)}
                                />
                            ) : (
                                <FormEntryContent key={`${studentId}-${activeFormTab}-view`} propType={currentTabConf?.formType as string} propMode="view" propHideNavigation={true} propStudentId={studentId as string} propSubmissionId={currentStatus.id?.toString()} />
                            )}
                        </div>
                    )}
                    </div>
                </div>
            </>
        );
    };

    // 2. REPORTS WORKSPACE RENDERER
    const renderReportsWorkspace = () => {
        const hasDocs = docs.length > 0;
        const iepDocs = docs.filter(d => d.type === "IEP");
        const monthlyDocs = docs.filter(d => d.type === "MONTHLY");
        const reportView = user?.role === "ADMIN"
            ? activeReportView
            : activeReportView === "generator"
                ? (hasDocs ? (docs[0].type === "MONTHLY" ? "monthly" : "iep") : "empty")
                : activeReportView;
        // A docId from the URL can belong to another student or to a draft this user
        // cannot open, so only honour it when it is in this student's visible docs.
        const pickDocId = (list: any[]) =>
            (list.some(d => d.id.toString() === activeDocId) ? activeDocId : list[0]?.id?.toString());
        const selectedDocId = reportView === "iep"
            ? pickDocId(iepDocs)
            : reportView === "monthly"
                ? pickDocId(monthlyDocs)
                : undefined;
        const isGenerator = reportView === "generator";
        const isEmptyState = reportView === "empty";
        const isIepReadyToGenerate = user?.role === "ADMIN"
            && ["ASSESSED", "ENROLLED"].includes(normalizedStudentStatus || "")
            && !!formStatuses?.multi_assessment?.submitted
            && iepDocs.length === 0;
        const reportSecondaryTabs = (
            <div className="shrink-0 border-b border-line bg-app/70 px-4 py-2 md:px-6">
                <div className="flex items-center gap-2 overflow-x-auto secondary-header-scrollbar">
                    {user?.role === "ADMIN" && (
                        <button
                            type="button"
                            onClick={() => handleReportMenuChange("generator")}
                            title={isIepReadyToGenerate ? "IEP is ready to generate for this student." : undefined}
                            className={workspaceSecondaryTabClass({ active: isGenerator, attention: isIepReadyToGenerate })}
                        >
                            Generate Reports
                            {isIepReadyToGenerate && (
                                <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[0.6rem] font-bold uppercase tracking-wider ${semanticToneStrongClass("warning")}`}>
                                    IEP ready
                                </span>
                            )}
                            {isIepReadyToGenerate && !isGenerator && (
                                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                        </button>
                    )}

                    {user?.role === "ADMIN" && (
                        <>
                            <div className="mx-1 h-6 w-px shrink-0 bg-subtle-soft" />
                            {adminReportTabs.map((tab) => {
                                const isSub = formStatuses?.[tab.id]?.submitted;
                                const isActive = reportView === tab.id;
                                const isLocked = (tab.id === "parent_tracker" || tab.id === "multi_tracker")
                                    ? !isStudentCurrentlyEnrolled
                                    : (tab.id === "sped_tracker")
                                        ? studentStatus?.toUpperCase() !== "INTEGRATED"
                                        : false;

                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        disabled={isLocked}
                                        onClick={() => handleReportMenuChange(tab.id)}
                                        className={workspaceSecondaryTabClass({ active: isActive, disabled: isLocked })}
                                        title={isLocked ? "Available after enrollment/integration" : undefined}
                                    >
                                        {isLocked ? (
                                            <Lock className="h-3.5 w-3.5 shrink-0" />
                                        ) : isSub ? (
                                            <Check className="h-3.5 w-3.5 shrink-0 text-success" strokeWidth={3} />
                                        ) : (
                                            <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                                        )}
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </>
                    )}

                    <div className="mx-1 h-6 w-px shrink-0 bg-subtle-soft" />
                    <button
                        type="button"
                        disabled={iepDocs.length === 0}
                        onClick={() => iepDocs[0] && handleReportMenuChange("iep", iepDocs[0].id.toString())}
                        className={workspaceSecondaryTabClass({ active: reportView === "iep", disabled: iepDocs.length === 0 })}
                    >
                        <FileText className="h-3.5 w-3.5" />
                        {user?.role === "PARENT" ? "Current IEP" : "IEP Documents"}
                        {iepDocs.length > 1 && (
                            <span className={workspaceBadgeClass("primary", "px-1.5 py-0")}>{iepDocs.length}</span>
                        )}
                    </button>
                    <button
                        type="button"
                        disabled={monthlyDocs.length === 0}
                        onClick={() => monthlyDocs[0] && handleReportMenuChange("monthly", monthlyDocs[0].id.toString())}
                        className={workspaceSecondaryTabClass({ active: reportView === "monthly", disabled: monthlyDocs.length === 0, tone: "success" })}
                    >
                        <ClipboardList className="h-3.5 w-3.5" />
                        {user?.role === "PARENT" ? "Monthly Reports" : "Monthly Progress"}
                        {monthlyDocs.length > 1 && (
                            <span className={workspaceBadgeClass("success", "px-1.5 py-0")}>{monthlyDocs.length}</span>
                        )}
                    </button>
                </div>
            </div>
        );

        return (
            <>
                <div className="hidden">
                    <div className="px-5 py-4 border-b border-line">
                        <h1 className="text-xl font-extrabold text-fg m-0 leading-tight tracking-tight" title={studentName}>{studentName}</h1>
                        {studentStatus && (
                            <span style={{
                                display: "inline-block", marginTop: 8,
                                fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px",
                                padding: "3px 9px", borderRadius: "999px",
                                background: STATUS_COLORS[studentStatus?.toUpperCase()]?.bg || "var(--bg-neutral-light)",
                                color: STATUS_COLORS[studentStatus?.toUpperCase()]?.color || "var(--text-secondary)",
                            }}>
                                {STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                        {renderAdminWorkspaceSidebarActions("reports")}

                        {user?.role === "ADMIN" && (
                            <div className="px-4 mb-6">
                                <p className="text-[0.65rem] font-bold text-faint uppercase tracking-widest mb-3 px-1">Tools</p>
                                <button onClick={() => handleReportMenuChange("generator")} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm border ${isGenerator ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-card text-fg border-line hover:bg-subtle-soft hover:border-line'}`}>
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                    Generate Reports
                                </button>
                            </div>
                        )}

                        {user?.role === "ADMIN" && (
                            <div className="px-3 mb-6">
                                <p className="text-[0.65rem] font-bold text-faint uppercase tracking-widest mb-3 px-2">Input Forms</p>
                                <div className="flex flex-col gap-1">
                                    {statusFilteredTabs.map((tab) => {
                                        const isSub = formStatuses?.[tab.id]?.submitted;
                                        const isActive = reportView === tab.id;
                                        const isLocked = (tab.id === "parent_tracker" || tab.id === "multi_tracker") 
                                            ? !isStudentCurrentlyEnrolled 
                                            : (tab.id === "sped_tracker")
                                                ? studentStatus?.toUpperCase() !== "INTEGRATED"
                                                : false;

                                        return (
                                            <button
                                                key={tab.id}
                                                disabled={isLocked}
                                                onClick={() => handleReportMenuChange(tab.id)}
                                                className={`w-full flex items-center justify-between text-left px-4 py-2.5 rounded-lg transition-all border ${isLocked ? 'border-transparent text-faint cursor-not-allowed opacity-60' : isActive ? 'bg-indigo-50 border-indigo-200 shadow-sm relative' : 'border-transparent hover:bg-subtle-soft'}`}
                                                title={isLocked ? "Available after enrollment/integration" : undefined}
                                            >
                                                {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                                <span className={`text-sm font-bold truncate ${isLocked ? 'text-faint' : isActive ? 'text-indigo-800' : 'text-fg'}`}>
                                                    {tab.label}
                                                </span>
                                                {isLocked ? (
                                                    <Lock className="w-3.5 h-3.5 text-faint shrink-0 ml-2" />
                                                ) : isSub ? (
                                                    <Check className="w-4 h-4 text-success shrink-0 ml-2" strokeWidth={3} />
                                                ) : (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 ml-2 animate-pulse" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="px-3 mb-6">
                            <p className="text-[0.65rem] font-bold text-faint uppercase tracking-widest mb-3 px-2">{user?.role === "PARENT" ? "Learning Plans" : "IEP Documents"}</p>
                            {iepDocs.length === 0 ? (
                                <p className="text-xs text-faint italic px-2">No IEPs generated yet.</p>
                            ) : (() => {
                                const doc = iepDocs[0];
                                const isActive = reportView === "iep";
                                return (
                                    <div className="flex flex-col gap-1">
                                        <button onClick={() => handleReportMenuChange("iep", doc.id.toString())} className={`w-full flex flex-col text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-indigo-50 border-indigo-200 shadow-sm relative' : 'border-transparent hover:bg-subtle-soft'}`}>
                                            {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                            <div className="flex justify-between items-center w-full">
                                                <span className={`text-sm font-bold truncate ${isActive ? 'text-indigo-800' : 'text-fg'}`}>{user?.role === "PARENT" ? "Current IEP" : "IEP Master"}</span>
                                                {iepDocs.length > 1 && (
                                                    <span className="text-[0.6rem] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded ml-2 shrink-0">{iepDocs.length} versions</span>
                                                )}
                                            </div>
                                            <span className="text-xs text-muted truncate mt-0.5">Updated {formatDocumentDateTime(doc.created_at)}</span>
                                        </button>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="px-3 pb-4">
                            <p className="text-[0.65rem] font-bold text-faint uppercase tracking-widest mb-3 px-2">{user?.role === "PARENT" ? "Monthly Reports" : "Monthly Progress"}</p>
                            {monthlyDocs.length === 0 ? (
                                <p className="text-xs text-faint italic px-2">No monthly reports yet.</p>
                            ) : (() => {
                                const doc = monthlyDocs[0];
                                const isActive = reportView === "monthly";
                                return (
                                    <div className="flex flex-col gap-1">
                                        <button onClick={() => handleReportMenuChange("monthly", doc.id.toString())} className={`w-full flex flex-col text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-success-soft border-success-line shadow-sm relative' : 'border-transparent hover:bg-subtle-soft'}`}>
                                            {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-success-solid rounded-r"></div>}
                                            <div className="flex justify-between items-center w-full">
                                                <span className={`text-sm font-bold truncate ${isActive ? 'text-success' : 'text-fg'}`}>{user?.role === "PARENT" ? "Monthly Report" : "Progress Reports"}</span>
                                                {monthlyDocs.length > 1 && (
                                                    <span className="text-[0.6rem] font-bold uppercase tracking-wider bg-success-soft text-success px-1.5 py-0.5 rounded ml-2 shrink-0">{monthlyDocs.length} versions</span>
                                                )}
                                            </div>
                                            <span className="text-xs text-muted truncate mt-0.5">Updated {formatDocumentDateTime(doc.created_at)}</span>
                                        </button>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-card relative overflow-y-auto flex flex-col">
                    {tabBar}
                    {reportSecondaryTabs}
                    <div className="flex-1 overflow-y-auto">
                        {isGenerator && (
                            <AdminReportsContent propStudentId={studentId as string} propHideNavigation={true} propWorkspacePath="/workspace" />
                        )}
                        {TABS.some(t => t.id === reportView) && (() => {
                            const tab = TABS.find(t => t.id === reportView)!;
                            const isSub = formStatuses?.[tab.id]?.submitted;
                            const isLocked = (tab.id === "parent_tracker" || tab.id === "multi_tracker") 
                                ? !isStudentCurrentlyEnrolled 
                                : (tab.id === "sped_tracker")
                                    ? studentStatus?.toUpperCase() !== "INTEGRATED"
                                    : false;
                            const currentStatus = formStatuses?.[tab.id];

                            if (isLocked) {
                                return (
                                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                                        <div className="w-16 h-16 bg-app border border-slate-105 rounded-full flex items-center justify-center mb-4 text-faint">
                                            <Lock className="w-8 h-8" />
                                        </div>
                                        <h3 className="text-lg font-bold text-fg mb-1">Form Locked</h3>
                                        <p className="text-sm text-muted max-w-sm">
                                            This form is locked for Admin review until the student is {tab.id === "sped_tracker" ? "integrated" : "enrolled"}.
                                        </p>
                                    </div>
                                );
                            }

                            if (!isSub) {
                                return (
                                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                                        <div className="w-16 h-16 bg-app border border-slate-105 rounded-full flex items-center justify-center mb-4 text-faint">
                                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        </div>
                                        <h3 className="text-lg font-bold text-fg mb-1">Awaiting Submission</h3>
                                        <p className="text-sm text-muted max-w-sm">
                                            This form has not been submitted by the clinical team or parent yet.
                                        </p>
                                    </div>
                                );
                            }

                            return (
                                <div className="w-full">
                                    {tab.id === "parent_assessment" ? (
                                        <ParentFormContent propMode="view" propHideNavigation={true} propStudentId={studentId as string} propSubmissionId={currentStatus?.id?.toString()} />
                                    ) : (
                                        <FormEntryContent propType={tab.formType as string} propMode="view" propHideNavigation={true} propStudentId={studentId as string} propSubmissionId={currentStatus?.id?.toString()} />
                                    )}
                                </div>
                            );
                        })()}
                        {reportView === "iep" && selectedDocId && (
                            <div className="flex-1 overflow-y-auto">
                                {iepDocs.length > 1 && (
                                    <div className="bg-app border-b border-line px-4 py-1.5 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 text-muted">
                                            <svg className="w-3.5 h-3.5 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-muted">Version History</span>
                                        </div>
                                        <CustomSelect
                                            size="sm"
                                            className="w-64 max-w-[60%]"
                                            ariaLabel="IEP version"
                                            value={selectedDocId}
                                            onChange={(v) => handleReportMenuChange("iep", v)}
                                            options={iepDocs.map((doc, idx) => ({
                                                value: doc.id.toString(),
                                                label: `${idx === 0 ? "Latest Version" : "Previous Version"} — ${formatDocumentDateTime(doc.created_at)}`,
                                            }))}
                                        />
                                    </div>
                                )}
                                <IEPViewerContent propId={selectedDocId} propHideNavigation={true} />
                            </div>
                        )}
                        {reportView === "monthly" && selectedDocId && (
                            <div className="flex-1 overflow-y-auto">
                                {monthlyDocs.length > 1 && (
                                    <div className="bg-app border-b border-line px-4 py-1.5 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 text-muted">
                                            <svg className="w-3.5 h-3.5 text-success shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-muted">Version History</span>
                                        </div>
                                        <CustomSelect
                                            size="sm"
                                            className="w-64 max-w-[60%]"
                                            ariaLabel="Monthly report version"
                                            value={selectedDocId}
                                            onChange={(v) => handleReportMenuChange("monthly", v)}
                                            options={monthlyDocs.map((doc, idx) => ({
                                                value: doc.id.toString(),
                                                label: `${idx === 0 ? "Latest Version" : "Previous Version"} — ${formatDocumentDateTime(doc.created_at)}`,
                                            }))}
                                        />
                                    </div>
                                )}
                                <MonthlyReportContent propId={selectedDocId} propHideNavigation={true} />
                            </div>
                        )}
                        {isEmptyState && (
                            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                                <div className="w-16 h-16 bg-app border border-line rounded-full flex items-center justify-center mb-4 text-faint">
                                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                                </div>
                                <h3 className="text-lg font-bold text-fg mb-1">No Reports Yet</h3>
                                <p className="text-sm text-muted max-w-sm">There are no reports or documents associated with this student yet.</p>
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    };

    // 3. PARENT UNIFIED WORKSPACE RENDERER
    const renderParentUnifiedWorkspace = () => {
        const isStudentEnrolled = ["ENROLLED", "INTEGRATED"].includes(studentStatus?.toUpperCase() || "");
        const trackerStatus = formStatuses?.parent_tracker;
        const assessmentStatus = formStatuses?.parent_assessment;
        const iepDocs = docs.filter(d => d.type === "IEP");
        const monthlyDocs = docs.filter(d => d.type === "MONTHLY");
        
        // Determine which panel is active from URL params
        const viewParam = searchParams.get("view");
        const docIdParam = searchParams.get("docId");
        let parentActivePanel = viewParam === "overview" ? "overview" : viewParam === "iep" ? "iep" : viewParam === "monthly" ? "monthly" : viewParam === "tracker" ? "tracker" : viewParam === "assessment" ? "assessment" : null;

        if (!parentActivePanel) {
            parentActivePanel = requestedFormTab === "parent_assessment" ? "assessment" : requestedFormTab === "parent_tracker" ? "tracker" : null;
        }

        // Landing on the overview keeps "where do things stand" the first thing a
        // parent sees; deep links from the dashboard still open their panel directly.
        if (!parentActivePanel) {
            parentActivePanel = "overview";
        }

        const handleParentPanelChange = (panel: string, docId?: string) => {
            const url = new URL(window.location.href);
            url.searchParams.delete("workspace");
            url.searchParams.delete("tab");
            url.searchParams.set("view", panel);
            if (docId) {
                url.searchParams.set("docId", docId);
            } else {
                url.searchParams.delete("docId");
            }
            navigateWithTeamGuard(url.pathname + url.search);
        };

        // Tracker form rendering logic
        const trackerTabConf = TABS.find(t => t.id === "parent_tracker");
        const isParentTrackerLocked = !isStudentEnrolled;
        const canCreateTracker = isStudentEnrolled && !trackerStatus?.submitted;

        const renderTrackerContent = () => {
            if (isParentTrackerLocked) {
                return (
                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                        <div className="w-16 h-16 bg-app border border-line rounded-full flex items-center justify-center mb-4 text-faint">
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                        </div>
                        <h3 className="text-lg font-bold text-fg mb-1">Nothing to do here yet</h3>
                        <p className="text-sm text-muted max-w-sm">Monthly updates will appear here once your child is fully enrolled. If you haven&apos;t yet, please fill out the parent assessment from the dashboard.</p>
                    </div>
                );
            }
            if (canCreateTracker) {
                return (
                    <div className="w-full">
                        <FormEntryContent propType={trackerTabConf?.formType as string} propHideNavigation={true} propStudentId={studentId as string} propOnSubmitted={handleEmbeddedFormSubmitted} />
                    </div>
                );
            }
            if (trackerStatus?.submitted) {
                return (
                    <div className="w-full">
                        <FormEntryContent propType={trackerTabConf?.formType as string} propMode="view" propHideNavigation={true} propStudentId={studentId as string} propSubmissionId={trackerStatus.id?.toString()} />
                    </div>
                );
            }
            return (
                <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                    <div className="w-16 h-16 bg-app border border-line rounded-full flex items-center justify-center mb-4 text-faint">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <h3 className="text-lg font-bold text-fg mb-1">No Update Submitted</h3>
                    <p className="text-sm text-muted max-w-sm">No monthly home update has been submitted for this cycle yet.</p>
                </div>
            );
        };

        // Assessment form rendering logic
        const renderAssessmentContent = () => {
            const canEditUnlockedAssessment = !!assessmentStatus?.submitted
                && !!assessmentStatus?.unlocked
                && assessmentStatus?.unlock_available !== false;

            if (assessmentStatus?.submitted) {
                return (
                    <div className="w-full">
                        <ParentFormContent
                            propMode={canEditUnlockedAssessment ? undefined : "view"}
                            propHideNavigation={true}
                            propStudentId={studentId as string}
                            propSubmissionId={assessmentStatus.id?.toString()}
                            propOnSubmitted={canEditUnlockedAssessment ? handleEmbeddedFormSubmitted : undefined}
                            propReportCycleId={activeCycle?.id}
                            propSpecialistSubmitted={!!formStatuses?.multi_assessment?.submitted}
                            propUnlockAvailable={assessmentStatus?.unlock_available}
                            propOnUnlocked={() => setProfileRefreshKey(key => key + 1)}
                        />
                    </div>
                );
            }
            return (
                <div className="w-full">
                    <ParentFormContent propHideNavigation={true} propStudentId={studentId as string} propOnSubmitted={handleEmbeddedFormSubmitted} />
                </div>
            );
        };

        // Overview: the parent's "where do things stand" landing panel. Everything
        // here is already loaded for the other panels — no extra fetches.
        const renderOverviewContent = () => {
            const childFirstName = studentName.split(" ")[0] || "your child";
            const specialists = assignedStaff.filter(staff => staff.role === "SPECIALIST");
            const teacher = assignedStaff.find(staff => staff.role === "TEACHER");
            const latestIep = iepDocs[0];
            const latestMonthly = monthlyDocs[0];
            const evaluationDone = ["ASSESSED", "ENROLLED", "INTEGRATED"].includes(normalizedStudentStatus || "");

            const journey = [
                { label: "Your assessment", done: !!assessmentStatus?.submitted },
                { label: "Specialist evaluation", done: evaluationDone },
                { label: "Team assigned", done: specialists.length > 0 },
                { label: "Monthly progress", done: isStudentEnrolled },
            ];
            const currentStepIndex = journey.findIndex(step => !step.done);

            const nextStep = !assessmentStatus?.submitted
                ? {
                    title: `Tell us about ${childFirstName}`,
                    body: "Share their strengths, routines and any concerns so the team knows how to support them.",
                    cta: "Start the form",
                    onClick: () => handleParentPanelChange("assessment"),
                }
                : isStudentEnrolled && !trackerStatus?.submitted
                    ? {
                        title: `How is ${childFirstName} doing at home?`,
                        body: `Share your observations for ${activeCycle?.label || "this month"} — the team uses these to prepare the progress report.`,
                        cta: "Share update",
                        onClick: () => handleParentPanelChange("tracker"),
                    }
                    : null;

            const submissions = [
                {
                    label: "About Your Child",
                    submitted: !!assessmentStatus?.submitted,
                    at: assessmentStatus?.submitted_at,
                    pending: "Not submitted yet",
                    onClick: () => handleParentPanelChange("assessment"),
                },
                ...(isStudentEnrolled
                    ? [{
                        label: `Home Update${activeCycle?.label ? ` · ${activeCycle.label}` : ""}`,
                        submitted: !!trackerStatus?.submitted,
                        at: trackerStatus?.submitted_at,
                        pending: "Due this cycle",
                        onClick: () => handleParentPanelChange("tracker"),
                    }]
                    : []),
            ];

            const cardClass = "rounded-2xl border border-line bg-card p-5 shadow-sm";
            const sectionTitleClass = "m-0 mb-3 text-xs font-bold uppercase tracking-widest text-faint";

            return (
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 md:p-8">
                    {/* Where things stand */}
                    <div className={cardClass}>
                        <h2 className={sectionTitleClass}>Where things stand</h2>
                        <ol className="m-0 flex list-none flex-col gap-0 p-0 sm:flex-row sm:items-start sm:gap-2">
                            {journey.map((step, index) => {
                                const isCurrent = index === currentStepIndex;
                                return (
                                    <li key={step.label} className="flex flex-1 items-center gap-3 py-2 sm:flex-col sm:items-start sm:py-0">
                                        <div className="flex w-full items-center gap-2">
                                            <span
                                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-extrabold ${
                                                    step.done
                                                        ? "border-success-line bg-success-soft text-success"
                                                        : isCurrent
                                                            ? semanticToneClass("primary")
                                                            : "border-line bg-app text-faint"
                                                }`}
                                            >
                                                {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : index + 1}
                                            </span>
                                            <span className={`text-sm ${step.done || isCurrent ? "font-bold text-fg" : "font-medium text-muted"}`}>
                                                {step.label}
                                            </span>
                                            <span className={`hidden h-px flex-1 sm:block ${step.done ? "bg-success-line" : "bg-subtle-soft"}`} aria-hidden="true" />
                                        </div>
                                        {isCurrent && (
                                            <span className="ml-8 text-xs font-semibold text-indigo-600 sm:ml-8">In progress</span>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    </div>

                    {/* What's next */}
                    {nextStep ? (
                        <div className={`${cardClass} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
                            <div className="min-w-0">
                                <h2 className="m-0 text-base font-extrabold text-fg">{nextStep.title}</h2>
                                <p className="m-0 mt-1 text-sm leading-relaxed text-muted">{nextStep.body}</p>
                            </div>
                            <button type="button" onClick={nextStep.onClick} className={`${workspacePrimaryButtonClass} shrink-0`}>
                                {nextStep.cta}
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        </div>
                    ) : (
                        <div className={`${cardClass} flex items-center gap-3`}>
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                            <p className="m-0 text-sm font-semibold text-fg">
                                You&apos;re all caught up — nothing needed from you right now.
                            </p>
                        </div>
                    )}

                    {/* Care team */}
                    <div className={cardClass}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h2 className={`${sectionTitleClass} mb-0`}>{childFirstName}&apos;s team</h2>
                            <Link
                                href={`/specialists?studentId=${studentId}`}
                                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 no-underline hover:text-indigo-700"
                            >
                                {specialists.length > 0 ? "View team" : "Set preferences"}
                                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </Link>
                        </div>
                        {specialists.length > 0 || teacher ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {[...specialists, ...(teacher ? [teacher] : [])].map(staff => (
                                    <div key={`${staff.role}-${staff.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-app px-3 py-2.5">
                                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold ${semanticToneClass("primary")}`}>
                                            {(staff.first_name?.[0] || "") + (staff.last_name?.[0] || "")}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="m-0 truncate text-sm font-bold text-fg">{getStaffName(staff)}</p>
                                            <p className="m-0 truncate text-xs font-semibold text-muted">
                                                {staff.role === "TEACHER"
                                                    ? "Teacher"
                                                    : getStaffSpecialties(staff).map(specialty => specialtyShortLabel(specialty as SectionOwner)).join(" · ") || "Specialist"}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-start gap-3 rounded-xl border border-line bg-app px-3 py-3">
                                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                                <p className="m-0 text-sm text-muted">
                                    {assessmentStatus?.submitted
                                        ? `Our clinical directors are matching ${childFirstName} with the right specialists.`
                                        : `${childFirstName}'s team is assigned after you complete the assessment.`}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* From the team */}
                    <div className={cardClass}>
                        <h2 className={sectionTitleClass}>From the team</h2>
                        {latestIep || latestMonthly ? (
                            <div className="flex flex-col gap-2">
                                {latestIep && (
                                    <button
                                        type="button"
                                        onClick={() => handleParentPanelChange("iep", latestIep.id.toString())}
                                        className="flex items-center gap-3 rounded-xl border border-line bg-app px-3 py-2.5 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                                    >
                                        <FileText className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
                                        <div className="min-w-0 flex-1">
                                            <p className="m-0 text-sm font-bold text-fg">Current learning plan</p>
                                            <p className="m-0 text-xs text-muted">{formatDocumentDateTime(latestIep.created_at)}</p>
                                        </div>
                                        <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                                    </button>
                                )}
                                {latestMonthly && (
                                    <button
                                        type="button"
                                        onClick={() => handleParentPanelChange("monthly", latestMonthly.id.toString())}
                                        className="flex items-center gap-3 rounded-xl border border-line bg-app px-3 py-2.5 text-left transition-colors hover:border-success-line hover:bg-success-soft/40"
                                    >
                                        <FileCheck2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                                        <div className="min-w-0 flex-1">
                                            <p className="m-0 text-sm font-bold text-fg">Latest monthly report</p>
                                            <p className="m-0 text-xs text-muted">{formatDocumentDateTime(latestMonthly.created_at)}</p>
                                        </div>
                                        <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <p className="m-0 text-sm text-muted">
                                Learning plans and monthly reports will show up here once the team prepares them.
                            </p>
                        )}
                    </div>

                    {/* Your submissions */}
                    <div className={cardClass}>
                        <h2 className={sectionTitleClass}>Your submissions</h2>
                        <div className="flex flex-col gap-2">
                            {submissions.map(item => (
                                <button
                                    key={item.label}
                                    type="button"
                                    onClick={item.onClick}
                                    className="flex items-center gap-3 rounded-xl border border-line bg-app px-3 py-2.5 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                                >
                                    <ClipboardList className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                                    <div className="min-w-0 flex-1">
                                        <p className="m-0 truncate text-sm font-bold text-fg">{item.label}</p>
                                        <p className="m-0 text-xs text-muted">
                                            {item.submitted
                                                ? item.at
                                                    ? `Submitted ${formatDocumentDateTime(item.at)}`
                                                    : "Submitted"
                                                : item.pending}
                                        </p>
                                    </div>
                                    {item.submitted
                                        ? <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={3} aria-hidden="true" />
                                        : <span className={workspaceBadgeClass("warning", "shrink-0 px-1.5 py-0")}>To do</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            );
        };

        // Get parent-friendly status label
        const getParentStatusLabel = () => {
            const normalized = studentStatus?.toUpperCase().replace(/ /g, "_");
            if (normalized === "PENDING_ASSESSMENT") return formStatuses?.parent_assessment?.submitted ? "Awaiting Review" : "Action Needed";
            if (normalized === "ASSESSMENT_SCHEDULED") return "Pending Assessment";
            if (normalized === "ASSESSED") return "Evaluation Complete";
            return STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus;
        };

        const parentGroupLabelClass = "shrink-0 pl-1 pr-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-faint";
        // Older documents need their date in the label to stay distinguishable
        // once they're side by side instead of stacked with a caption.
        const parentDocTabLabel = (doc: any, isLatest: boolean, base: string) =>
            isLatest
                ? base
                : `${base} · ${new Date(doc.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}`;

        // One list drives the desktop tab row and the mobile dropdown, so the two
        // can't drift as documents accumulate month over month.
        type ParentPanelOption = {
            key: string;
            view: string;
            docId?: string;
            label: string;
            tone: "primary" | "success";
            group: "overview" | "yours" | "team";
            submitted?: boolean;
            badge?: string;
            title?: string;
        };
        const parentPanelOptions: ParentPanelOption[] = [
            { key: "overview", view: "overview", label: "Overview", tone: "primary", group: "overview" },
            ...(!isStudentEnrolled
                ? [{ key: "assessment", view: "assessment", label: "About Your Child", tone: "primary", group: "yours", submitted: !!assessmentStatus?.submitted } as ParentPanelOption]
                : []),
            ...(isStudentEnrolled
                ? [{ key: "tracker", view: "tracker", label: "Home Update", tone: "success", group: "yours", submitted: !!trackerStatus?.submitted } as ParentPanelOption]
                : []),
            ...(isStudentEnrolled && assessmentStatus?.submitted
                ? [{ key: "assessment", view: "assessment", label: "About Your Child", tone: "primary", group: "yours", submitted: true } as ParentPanelOption]
                : []),
            ...iepDocs.map((doc, idx) => ({
                key: `iep-${doc.id}`,
                view: "iep",
                docId: doc.id.toString(),
                label: parentDocTabLabel(doc, idx === 0, "Current IEP"),
                tone: "primary" as const,
                group: "team" as const,
                badge: idx === 0 ? "Current" : undefined,
                title: formatDocumentDateTime(doc.created_at),
            })),
            ...monthlyDocs.map((doc, idx) => ({
                key: `monthly-${doc.id}`,
                view: "monthly",
                docId: doc.id.toString(),
                label: parentDocTabLabel(doc, idx === 0, "Monthly Report"),
                tone: "success" as const,
                group: "team" as const,
                badge: idx === 0 ? "Latest" : undefined,
                title: formatDocumentDateTime(doc.created_at),
            })),
        ];
        const isParentPanelActive = (option: ParentPanelOption) =>
            parentActivePanel === option.view && (!option.docId || docIdParam === option.docId);
        const activeParentPanelOption = parentPanelOptions.find(isParentPanelActive);
        const teamPanelOptions = parentPanelOptions.filter(option => option.group === "team");
        const yourPanelOptions = parentPanelOptions.filter(option => option.group === "yours");
        const overviewPanelOption = parentPanelOptions.find(option => option.group === "overview");

        return (
            <div className="flex flex-1 flex-col min-w-0 bg-card overflow-hidden">
                {/* Mobile: name on its own line, panels behind a dropdown so nothing
                    is hidden off-screen as documents pile up month over month. */}
                <div className="relative shrink-0 border-b border-line bg-card px-4 py-2 md:hidden">
                    <div className="flex items-center gap-2">
                        <h1 className="m-0 min-w-0 flex-1 truncate text-base font-extrabold leading-tight tracking-tight text-fg" title={studentName}>{studentName}</h1>
                        {studentStatus && (
                            <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${statusColorClass(studentStatus)}`}>
                                {getParentStatusLabel()}
                            </span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => setParentPanelMenuOpen(open => !open)}
                        aria-expanded={parentPanelMenuOpen}
                        aria-haspopup="menu"
                        className="mt-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-app px-3 text-sm font-bold text-fg"
                    >
                        <span className="truncate">{activeParentPanelOption?.label || "Select a section"}</span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${parentPanelMenuOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>

                    {parentPanelMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setParentPanelMenuOpen(false)} aria-hidden="true" />
                            <div role="menu" className="absolute inset-x-4 top-full z-40 mt-1 max-h-[60vh] overflow-y-auto rounded-lg border border-line bg-card p-1 shadow-lg">
                                {overviewPanelOption && (
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            setParentPanelMenuOpen(false);
                                            handleParentPanelChange(overviewPanelOption.view);
                                        }}
                                        className={`flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-bold ${isParentPanelActive(overviewPanelOption) ? "bg-indigo-50 text-indigo-800" : "text-fg"}`}
                                    >
                                        <span className="min-w-0 flex-1 truncate">{overviewPanelOption.label}</span>
                                    </button>
                                )}
                                {yourPanelOptions.length > 0 && (
                                    <p className="px-2 pb-1 pt-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-faint">Your input</p>
                                )}
                                {yourPanelOptions.map(option => (
                                    <button
                                        key={option.key}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            setParentPanelMenuOpen(false);
                                            handleParentPanelChange(option.view, option.docId);
                                        }}
                                        className={`flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-bold ${isParentPanelActive(option) ? "bg-indigo-50 text-indigo-800" : "text-fg"}`}
                                    >
                                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                        {option.submitted && <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={3} aria-hidden="true" />}
                                    </button>
                                ))}

                                {teamPanelOptions.length > 0 && (
                                    <p className="mt-1 border-t border-line px-2 pb-1 pt-2 text-[0.6rem] font-bold uppercase tracking-widest text-faint">From the team</p>
                                )}
                                {teamPanelOptions.map(option => (
                                    <button
                                        key={option.key}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            setParentPanelMenuOpen(false);
                                            handleParentPanelChange(option.view, option.docId);
                                        }}
                                        className={`flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-bold ${isParentPanelActive(option) ? (option.tone === "success" ? "bg-success-soft text-success" : "bg-indigo-50 text-indigo-800") : "text-fg"}`}
                                    >
                                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                        {option.badge && <span className={workspaceBadgeClass(option.tone, "shrink-0 px-1.5 py-0")}>{option.badge}</span>}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Desktop: name, status and every panel inline in one band */}
                <div className="hidden shrink-0 border-b border-line bg-card px-4 py-1.5 md:block md:px-6">
                    <div className="flex items-center gap-2 overflow-x-auto secondary-header-scrollbar">
                        <div className="flex shrink-0 items-center gap-2">
                            <h1 className="m-0 truncate text-base font-extrabold leading-tight tracking-tight text-fg" title={studentName}>{studentName}</h1>
                            {studentStatus && (
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${statusColorClass(studentStatus)}`}>
                                    {getParentStatusLabel()}
                                </span>
                            )}
                        </div>
                        <div className="mx-1 h-6 w-px shrink-0 bg-subtle-soft" aria-hidden="true" />

                        {overviewPanelOption && (
                            <button
                                type="button"
                                onClick={() => handleParentPanelChange(overviewPanelOption.view)}
                                className={workspaceSecondaryTabClass({ active: isParentPanelActive(overviewPanelOption), tone: overviewPanelOption.tone })}
                            >
                                {overviewPanelOption.label}
                            </button>
                        )}

                        {yourPanelOptions.length > 0 && (
                            <>
                                <div className="mx-1 h-6 w-px shrink-0 bg-subtle-soft" aria-hidden="true" />
                                <span className={parentGroupLabelClass}>Your input</span>
                            </>
                        )}

                        {yourPanelOptions.map(option => (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => handleParentPanelChange(option.view, option.docId)}
                                className={workspaceSecondaryTabClass({ active: isParentPanelActive(option), tone: option.tone })}
                            >
                                {option.label}
                                {option.submitted && <Check className="h-3.5 w-3.5 text-success" strokeWidth={3} aria-hidden="true" />}
                            </button>
                        ))}

                        {teamPanelOptions.length > 0 && (
                            <>
                                <div className="mx-1 h-6 w-px shrink-0 bg-subtle-soft" aria-hidden="true" />
                                <span className={parentGroupLabelClass}>From the team</span>
                                {teamPanelOptions.map(option => (
                                    <button
                                        key={option.key}
                                        type="button"
                                        onClick={() => handleParentPanelChange(option.view, option.docId)}
                                        title={option.title}
                                        className={workspaceSecondaryTabClass({ active: isParentPanelActive(option), tone: option.tone })}
                                    >
                                        {option.label}
                                        {option.badge && <span className={workspaceBadgeClass(option.tone, "shrink-0 px-1.5 py-0")}>{option.badge}</span>}
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 bg-card relative overflow-y-auto">
                    {parentActivePanel === "overview" && renderOverviewContent()}
                    {parentActivePanel === "assessment" && renderAssessmentContent()}
                    {parentActivePanel === "tracker" && renderTrackerContent()}
                    {parentActivePanel === "iep" && docIdParam && (
                        <IEPViewerContent propId={docIdParam} propHideNavigation={true} />
                    )}
                    {parentActivePanel === "monthly" && docIdParam && (
                        <MonthlyReportContent propId={docIdParam} propHideNavigation={true} />
                    )}
                    {parentActivePanel === "iep" && !docIdParam && iepDocs.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-app border border-line rounded-full flex items-center justify-center mb-4 text-faint">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-fg mb-1">No Learning Plans Yet</h3>
                            <p className="text-sm text-muted max-w-sm">Your child&apos;s individualized learning plan will appear here once it&apos;s been created by the team.</p>
                        </div>
                    )}
                    {parentActivePanel === "monthly" && !docIdParam && monthlyDocs.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-app border border-line rounded-full flex items-center justify-center mb-4 text-faint">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-fg mb-1">No Monthly Reports Yet</h3>
                            <p className="text-sm text-muted max-w-sm">Monthly progress reports will appear here as they are generated by the team.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // 3. TEAM WORKSPACE RENDERER
    const renderTeamWorkspace = () => {
        const isSpecialist = activeTeamRole === "SPECIALIST";
        const isTeacher = activeTeamRole === "TEACHER";
        const list = staffList.filter(s => s.role === activeTeamRole);
        const assignedRoleStaff = stagedAssignedStaff.filter(s => s.role === activeTeamRole);
        const assignedIds = assignedRoleStaff.map(s => s.id);
        const searchTerm = specialistSearch.trim().toLowerCase();
        const assignedSpecialistBySpecialty: Record<string, any> = {};

        const studentLangs = Array.isArray(studentDetails?.primary_language) 
            ? studentDetails.primary_language.map((l: string) => l.toUpperCase()) 
            : (studentDetails?.primary_language ? [studentDetails.primary_language.toUpperCase()] : []);

        const renderStaffLanguages = (langs: string[]) => {
            if (!langs || langs.length === 0) return null;
            const visibleLangs = langs.slice(0, 2);
            const hiddenCount = langs.length - 2;

            return (
                <>
                    <span className="text-[0.5rem] text-faint">●</span>
                    <p className="m-0 text-[0.7rem] font-medium uppercase tracking-widest text-muted flex flex-wrap items-center gap-1" title={langs.join(", ")}>
                        {visibleLangs.map((lang, idx) => {
                            const isMatch = studentLangs.includes(lang.toUpperCase());
                            return (
                                <span key={idx} className="flex items-center">
                                    <span className={isMatch ? "bg-success-soft text-success px-1.5 py-0.5 rounded font-bold" : ""}>
                                        {lang}
                                    </span>
                                    {idx < visibleLangs.length - 1 && <span>,</span>}
                                </span>
                            );
                        })}
                        {hiddenCount > 0 && <span>+{hiddenCount}</span>}
                    </p>
                </>
            );
        };

        if (isSpecialist) {
            assignedRoleStaff.forEach((staff) => {
                getStaffSpecialties(staff).forEach((specialty) => {
                    if (!specialty || assignedSpecialistBySpecialty[specialty]) return;
                    assignedSpecialistBySpecialty[specialty] = staff;
                });
            });
        }

        const assignedSpecialtyCount = SPECIALIST_SPECIALTIES.filter(
            (specialty) => assignedSpecialistBySpecialty[specialty]
        ).length;

        const isLocked = activeTeamRole === "SPECIALIST"
            ? !formStatuses?.parent_assessment?.submitted
            : studentStatus?.toUpperCase() !== "INTEGRATED";

        const lockReason = activeTeamRole === "SPECIALIST"
            ? "Waiting on Parent Input"
            : "Waiting for integration. A teacher can be assigned once the student is integrated into a mainstream classroom.";

        const specialtyGroups = isSpecialist
            ? SPECIALIST_SPECIALTIES.map((specialty) => {
                const assignedForSpecialty = assignedSpecialistBySpecialty[specialty];
                const candidates = list
                    .filter((staff) => getStaffSpecialties(staff).includes(specialty))
                    .filter((staff) => !searchTerm || getStaffName(staff).toLowerCase().includes(searchTerm))
                    .sort((a, b) => {
                        const aAssigned = assignedForSpecialty?.id === a.id ? 0 : 1;
                        const bAssigned = assignedForSpecialty?.id === b.id ? 0 : 1;
                        if (aAssigned !== bAssigned) return aAssigned - bAssigned;

                        const aRecommended = a.recommended_for?.includes(specialty) ? 0 : 1;
                        const bRecommended = b.recommended_for?.includes(specialty) ? 0 : 1;
                        if (aRecommended !== bRecommended) return aRecommended - bRecommended;

                        const aCaseload = typeof a.caseload === "number" ? a.caseload : Number.MAX_SAFE_INTEGER;
                        const bCaseload = typeof b.caseload === "number" ? b.caseload : Number.MAX_SAFE_INTEGER;
                        if (aCaseload !== bCaseload) return aCaseload - bCaseload;

                        return getStaffName(a).localeCompare(getStaffName(b));
                    });

                return { specialty, assignedForSpecialty, candidates };
            })
            : [];

        // Teacher matching. The list is scoped to the student's grade by default —
        // no filter control, just the teachers who could actually take this student.
        // A student sits in one classroom, so there is at most one staged teacher.
        const assignedTeacher = isTeacher ? assignedRoleStaff[0] || null : null;
        const studentGradeLevel = normalizeGradeLevel(studentDetails?.grade);
        const isTeacherMatch = (staff: any) =>
            Boolean(staff?.grade_match) || gradeLevelMatches(staff?.grade_level, studentDetails?.grade);

        const sortTeachers = (staff: any[]) =>
            staff.slice().sort((a, b) => {
                const aAssigned = assignedIds.includes(a.id) ? 0 : 1;
                const bAssigned = assignedIds.includes(b.id) ? 0 : 1;
                if (aAssigned !== bAssigned) return aAssigned - bAssigned;

                const aMatch = isTeacherMatch(a) ? 0 : 1;
                const bMatch = isTeacherMatch(b) ? 0 : 1;
                if (aMatch !== bMatch) return aMatch - bMatch;

                const aCaseload = typeof a.caseload === "number" ? a.caseload : Number.MAX_SAFE_INTEGER;
                const bCaseload = typeof b.caseload === "number" ? b.caseload : Number.MAX_SAFE_INTEGER;
                if (aCaseload !== bCaseload) return aCaseload - bCaseload;

                return getStaffName(a).localeCompare(getStaffName(b));
            });

        // Scope is decided on the full roster, before the search box narrows it, so
        // searching for one teacher by name never flips the list into fallback mode.
        // A teacher whose grade admin has not set yet always stays in scope —
        // otherwise a newly invited teacher is invisible on every student.
        const gradeScopedTeachers = !isTeacher
            ? []
            : studentGradeLevel
                ? list.filter((staff) => isTeacherMatch(staff) || !normalizeGradeLevel(staff.grade_level))
                : list;

        // Nobody covers this grade: fall back to everyone rather than a dead end.
        const noGradeCoverage = Boolean(studentGradeLevel) && gradeScopedTeachers.length === 0 && list.length > 0;
        const showingAllTeachers = showAllTeachers || !studentGradeLevel || noGradeCoverage;
        const hiddenTeacherCount = list.length - gradeScopedTeachers.length;
        const teacherCandidates = !isTeacher
            ? []
            : sortTeachers(
                (showingAllTeachers ? list : gradeScopedTeachers)
                    .filter((staff) => !searchTerm || getStaffName(staff).toLowerCase().includes(searchTerm)),
            );


        return (
            <>
                <div className="hidden">
                    <div className="px-5 py-4 border-b border-line">
                        <h1 className="text-xl font-extrabold text-fg m-0 leading-tight tracking-tight" title={studentName}>{studentName}</h1>
                        {studentStatus && (
                            <span style={{
                                display: "inline-block", marginTop: 8,
                                fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px",
                                padding: "3px 9px", borderRadius: "999px",
                                background: STATUS_COLORS[studentStatus?.toUpperCase()]?.bg || "var(--bg-neutral-light)",
                                color: STATUS_COLORS[studentStatus?.toUpperCase()]?.color || "var(--text-secondary)",
                            }}>
                                {STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                        {renderAdminWorkspaceSidebarActions("team")}
                        <div className="px-3">
                            <p className="text-[0.65rem] font-bold text-faint uppercase tracking-widest mb-3 px-2">Clinical Team</p>
                            <div className="flex flex-col gap-1">
                                <button onClick={() => handleTeamMenuChange("SPECIALIST")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all border ${isSpecialist ? 'bg-indigo-50 text-indigo-800 border-indigo-200 shadow-sm relative' : 'border-transparent text-fg hover:bg-subtle-soft'}`}>
                                    {isSpecialist && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                    <svg className="w-5 h-5 shrink-0 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                    Specialists
                                </button>
                                <button onClick={() => handleTeamMenuChange("TEACHER")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all border ${isTeacher ? 'bg-indigo-50 text-indigo-800 border-indigo-200 shadow-sm relative' : 'border-transparent text-fg hover:bg-subtle-soft'}`}>
                                    {isTeacher && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                    <svg className="w-5 h-5 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                    Teachers
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-card relative overflow-y-auto flex flex-col">
                    {tabBar}
                    <div className="flex-1 overflow-y-auto px-5 md:px-6 pb-5 md:pb-6 relative">
                        <div className="sticky top-0 z-20 -mx-5 mb-4 border-b border-line bg-card px-5 py-3 md:-mx-6 md:px-6">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                                <div className="min-w-0">
                                    <h2 className="m-0 text-lg font-bold leading-tight text-fg">
                                        {isSpecialist ? "Assign Specialists by Discipline" : "Available Teachers"}
                                    </h2>
                                    <p className="mt-0.5 text-xs text-muted">
                                        {isSpecialist
                                            ? `${assignedSpecialtyCount} of ${SPECIALIST_SPECIALTIES.length} disciplines assigned`
                                            : assignedRoleStaff.length === 0
                                                ? "No teacher assigned yet"
                                                : `${assignedRoleStaff.length} teacher${assignedRoleStaff.length === 1 ? "" : "s"} assigned`}
                                    </p>
                                </div>

                                <div className="ml-auto flex flex-wrap items-center gap-2">
                                    <div className="inline-flex rounded-md border border-line bg-app p-0.5">
                                        <button
                                            type="button"
                                            onClick={() => handleTeamMenuChange("SPECIALIST")}
                                            className={workspaceSegmentButtonClass(isSpecialist)}
                                        >
                                            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                            Specialists
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleTeamMenuChange("TEACHER")}
                                            className={workspaceSegmentButtonClass(isTeacher)}
                                        >
                                            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                            Teachers
                                        </button>
                                    </div>

                                    <div className="flex min-w-[16rem] items-center justify-end gap-2">
                                        {teamHasChanges && (
                                            <>
                                                <span className="text-xs font-semibold text-warning">Changes not saved yet</span>
                                                <button
                                                    type="button"
                                                    onClick={discardTeamChanges}
                                                    disabled={confirmingTeam}
                                                    className={workspaceSecondaryButtonClass}
                                                >
                                                    Cancel
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            onClick={confirmTeamChanges}
                                            disabled={!teamHasChanges || confirmingTeam}
                                            className={workspacePrimaryButtonClass}
                                        >
                                            <Check size={14} />
                                            {confirmingTeam ? "Confirming..." : "Confirm Team"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {isLocked && (
                            <div className={workspaceAlertClass("danger", "mb-5 flex items-start gap-3 shadow-sm")}>
                                <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                <div>
                                    <p className="text-sm font-bold">Assignment Locked</p>
                                    <p className="text-xs mt-0.5">
                                        {isSpecialist
                                            ? `${lockReason}. Specialty assignments unlock after the Parent Assessment is submitted.`
                                            : `${lockReason}. Staff cannot be assigned until prerequisite conditions are met.`}
                                    </p>
                                </div>
                            </div>
                        )}

                        {isSpecialist ? (
                            !isLocked && (
                                <div className="space-y-6">
                                    <div className="max-w-md relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
                                        <input
                                            type="text"
                                            value={specialistSearch}
                                            onChange={(e) => setSpecialistSearch(e.target.value)}
                                            placeholder="Search specialists by name..."
                                            className="w-full pl-10 pr-3 py-2.5 text-sm border border-line rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                                        {SPECIALIST_SPECIALTIES.map((specialty) => {
                                            const assignedForSpecialty = assignedSpecialistBySpecialty[specialty];
                                            const isCovered = Boolean(assignedForSpecialty);
                                            return (
                                                <div
                                                    key={specialty}
                                                    className={`rounded-xl border px-4 py-3 ${isCovered ? semanticToneClass("success") : semanticToneClass("neutral")}`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-xs font-extrabold uppercase tracking-wider">
                                                            {specialtyShortLabel(specialty as any)}
                                                        </span>
                                                        <span className={workspaceBadgeClass(isCovered ? "success" : "neutral", "bg-card")}>
                                                            {isCovered ? "Assigned" : "Open"}
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-sm font-bold text-fg leading-tight">{specialty}</p>
                                                    <p className="mt-1 text-xs">
                                                        {isCovered ? getStaffName(assignedForSpecialty) : "No specialist assigned yet"}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                        {specialtyGroups.map(({ specialty, assignedForSpecialty, candidates }) => (
                                            <section key={specialty} className="rounded-2xl border border-line bg-card overflow-hidden">
                                                <div className="border-b border-line px-4 py-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <h3 className="m-0 text-base font-semibold text-fg">{specialty}</h3>
                                                                <span className={workspaceBadgeClass(assignedForSpecialty ? "success" : "neutral")}>
                                                                    {assignedForSpecialty ? "Assigned" : "Unassigned"}
                                                                </span>
                                                            </div>
                                                            <p className="mt-1 text-sm text-muted">
                                                                {assignedForSpecialty
                                                                    ? `${getStaffName(assignedForSpecialty)} currently covers this discipline.`
                                                                    : "Choose the specialist for this discipline."}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="p-4 space-y-3">
                                                    {candidates.length === 0 ? (
                                                        <div className="rounded-xl border border-dashed border-line bg-app px-4 py-6 text-center">
                                                            <p className="text-sm font-medium text-muted">No matching specialists for this specialty.</p>
                                                        </div>
                                                    ) : candidates.map((staff) => {
                                                        const staffName = getStaffName(staff);
                                                        const staffSpecialties = getStaffSpecialties(staff);
                                                        const assignedRecord = assignedRoleStaff.find((assigned) => assigned.id === staff.id);
                                                        const assignedSpecialtiesForStaff = assignedRecord ? getStaffSpecialties(assignedRecord) : [];
                                                        const isAssignedForThisSpecialty = assignedForSpecialty?.id === staff.id;
                                                        const alreadyAssigned = assignedIds.includes(staff.id);
                                                        const isLoading = assigning === staff.id;
                                                        const nextSpecialties = alreadyAssigned
                                                            ? Array.from(new Set([...assignedSpecialtiesForStaff, specialty]))
                                                            : [specialty];
                                                        const isDisabled = isLoading || (!!assignedForSpecialty && !isAssignedForThisSpecialty);

                                                        return (
                                                            <div
                                                                key={`${specialty}-${staff.id}`}
                                                                className={`rounded-xl border p-4 transition-all ${
                                                                    isAssignedForThisSpecialty
                                                                        ? "border-indigo-300 bg-indigo-50"
                                                                        : assignedForSpecialty
                                                                            ? "border-line bg-app opacity-75"
                                                                            : "border-line bg-card hover:border-indigo-200 hover:shadow-sm"
                                                                }`}
                                                            >
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                            <p className={`m-0 truncate text-sm font-bold ${isAssignedForThisSpecialty ? "text-indigo-800" : "text-fg"}`}>
                                                                                {staffName}
                                                                            </p>
                                                                            {staff.recommended_for?.includes(specialty) && (
                                                                                <span className={workspaceBadgeClass("warning")}>
                                                                                    Match
                                                                                </span>
                                                                            )}
                                                                            {staff.preferred_for?.includes(specialty) && (
                                                                                <span className={workspaceBadgeClass("attention")}>
                                                                                    Parent Pick
                                                                                </span>
                                                                            )}
                                                                            {alreadyAssigned && !isAssignedForThisSpecialty && (
                                                                                <span className={workspaceBadgeClass("success")}>
                                                                                    On Team
                                                                                </span>
                                                                            )}
                                                                        </div>

                                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                                            <span title={specialty} className="rounded-full border border-indigo-200 bg-indigo-600 px-2.5 py-1 text-[0.65rem] font-bold text-white">
                                                                                {specialtyShortLabel(specialty as any)}
                                                                            </span>
                                                                            {staffSpecialties
                                                                                .filter((staffSpecialty) => staffSpecialty !== specialty)
                                                                                .map((staffSpecialty) => (
                                                                                    <span
                                                                                        key={staffSpecialty}
                                                                                        title={staffSpecialty}
                                                                                        className="rounded-full border border-line bg-app px-2.5 py-1 text-[0.65rem] font-bold text-muted"
                                                                                    >
                                                                                        {specialtyShortLabel(staffSpecialty as any)}
                                                                                    </span>
                                                                                ))}
                                                                        </div>

                                                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                                                            <p className="m-0 text-[0.7rem] font-medium uppercase tracking-widest text-muted">
                                                                                {staff.caseload} student{staff.caseload !== 1 ? "s" : ""}
                                                                            </p>
                                                                            {renderStaffLanguages(staff.languages)}
                                                                        </div>
                                                                    </div>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (isAssignedForThisSpecialty) {
                                                                                setUnassigningStaff({ id: staff.id, specialty, name: getStaffName(staff), role: "Specialist" });
                                                                            } else if (!isDisabled && !alreadyAssigned) {
                                                                                handleAssign("specialist", staff.id, nextSpecialties);
                                                                            } else if (alreadyAssigned && !isAssignedForThisSpecialty) {
                                                                                handleAssign("specialist", staff.id, nextSpecialties);
                                                                            }
                                                                        }}
                                                                        disabled={isDisabled && !isAssignedForThisSpecialty}
                                                                        title={
                                                                            isAssignedForThisSpecialty
                                                                                ? `Remove ${staffName} from ${specialty}`
                                                                                : assignedForSpecialty
                                                                                    ? `${specialty} is already covered`
                                                                                    : `Assign ${staffName} to ${specialty}`
                                                                        }
                                                                        className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                                                                            isAssignedForThisSpecialty
                                                                                ? "bg-indigo-600 text-white shadow-sm hover:bg-danger-solid hover:text-white"
                                                                                : isDisabled
                                                                                    ? "bg-subtle-soft text-faint cursor-not-allowed"
                                                                                    : "bg-subtle-soft text-muted hover:bg-indigo-600 hover:text-white"
                                                                        }`}
                                                                    >
                                                                        {isLoading ? (
                                                                            <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                                        ) : isAssignedForThisSpecialty ? (
                                                                            <X className="w-5 h-5" />
                                                                        ) : (
                                                                            <Plus className="w-5 h-5" />
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </section>
                                        ))}
                                    </div>
                                </div>
                            )
                        ) : (
                            <>
                            {/* While assignment is locked the whole matching toolbar is inert —
                                filtering a list you cannot assign from is just noise. */}
                            <div className="mb-4 flex flex-wrap items-center gap-2">
                                <div className={`relative min-w-[220px] flex-1 max-w-md ${isLocked ? "opacity-60" : ""}`}>
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
                                    <input
                                        type="text"
                                        value={specialistSearch}
                                        onChange={(e) => setSpecialistSearch(e.target.value)}
                                        disabled={isLocked}
                                        title={isLocked ? lockReason : undefined}
                                        placeholder="Search teachers by name..."
                                        className="w-full pl-10 pr-3 py-2.5 text-sm border border-line rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-subtle-soft"
                                    />
                                </div>

                                {studentGradeLevel && (
                                    <span className="text-xs font-semibold text-muted">
                                        Student grade: <span className="text-fg">{studentGradeLevel}</span>
                                    </span>
                                )}

                                <span className="text-xs font-semibold text-muted">
                                    {assignedTeacher ? (
                                        <>Teacher: <span className="text-fg">{getStaffName(assignedTeacher)}</span></>
                                    ) : (
                                        "No teacher assigned"
                                    )}
                                </span>
                            </div>

                            {/* Scope note + the escape hatch, only when there is something to escape. */}
                            {studentGradeLevel && (
                                <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                                    {noGradeCoverage ? (
                                        <span className="font-semibold text-warning">
                                            No teacher is assigned to {studentGradeLevel} — showing all teachers.
                                        </span>
                                    ) : showingAllTeachers ? (
                                        <>
                                            <span>Showing all teachers.</span>
                                            <button
                                                type="button"
                                                onClick={() => setShowAllTeachers(false)}
                                                disabled={isLocked}
                                                title={isLocked ? lockReason : undefined}
                                                className="font-bold text-indigo-600 underline underline-offset-2 hover:text-indigo-700 disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
                                            >
                                                Show only {studentGradeLevel} teachers
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span>Showing teachers for {studentGradeLevel}.</span>
                                            {hiddenTeacherCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAllTeachers(true)}
                                                    disabled={isLocked}
                                                    title={isLocked ? lockReason : undefined}
                                                    className="font-bold text-indigo-600 underline underline-offset-2 hover:text-indigo-700 disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
                                                >
                                                    Show all teachers ({hiddenTeacherCount} more)
                                                </button>
                                            )}
                                        </>
                                    )}
                                </p>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {teacherCandidates.length === 0 ? (
                                    <p className="text-sm text-muted italic col-span-full">
                                        {list.length === 0
                                            ? "No teachers have been added yet."
                                            : "No teachers match your search."}
                                    </p>
                                ) : teacherCandidates.map((staff) => {
                                    const alreadyAssigned = assignedIds.includes(staff.id);
                                    const isLoading = assigning === staff.id;
                                    // The one teacher slot is taken by someone else — same as a
                                    // specialty already covered on the specialist side.
                                    const slotTakenByOther = Boolean(assignedTeacher) && !alreadyAssigned;
                                    const isButtonDisabled = isLoading || slotTakenByOther || (!alreadyAssigned && isLocked);
                                    const gradeMatch = isTeacherMatch(staff);

                                    return (
                                        <div key={staff.id} className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                                            alreadyAssigned
                                                ? semanticToneClass("success")
                                                : slotTakenByOther
                                                    ? "border-line bg-app opacity-75"
                                                    : "border-line bg-card"
                                        }`}>
                                            <div className="min-w-0 pr-4">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="text-md font-bold truncate text-fg">
                                                        {getStaffName(staff)}
                                                    </p>
                                                    {alreadyAssigned && (
                                                        <span className={workspaceBadgeClass("success", "whitespace-nowrap bg-card")}>
                                                            Assigned
                                                        </span>
                                                    )}
                                                    {gradeMatch && (
                                                        <span className={workspaceBadgeClass("success", "whitespace-nowrap")}>
                                                            Grade match
                                                        </span>
                                                    )}
                                                    {!gradeMatch && staff.recommended && (
                                                        <span className={workspaceBadgeClass("warning", "whitespace-nowrap")}>
                                                            Match
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs font-bold mb-1 truncate">
                                                    {staff.grade_level ? (
                                                        <span className={gradeMatch ? "bg-success-soft text-success px-1.5 py-0.5 rounded" : "text-indigo-600"}>
                                                            {staff.grade_level}
                                                        </span>
                                                    ) : (
                                                        <span className="text-faint italic font-medium">No grade level set</span>
                                                    )}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="m-0 text-[0.7rem] font-medium text-muted uppercase tracking-widest">
                                                        {staff.caseload} student{staff.caseload !== 1 ? "s" : ""}
                                                    </p>
                                                    {renderStaffLanguages(staff.languages)}
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    if (alreadyAssigned) {
                                                        setUnassigningStaff({ id: staff.id, name: getStaffName(staff), role: "Teacher" });
                                                    } else if (!isButtonDisabled) {
                                                        handleAssign("teacher", staff.id);
                                                    }
                                                }}
                                                disabled={isButtonDisabled && !alreadyAssigned}
                                                title={
                                                    alreadyAssigned
                                                        ? `Remove ${getStaffName(staff)}`
                                                        : slotTakenByOther
                                                            ? `${getStaffName(assignedTeacher)} is already this student's teacher — remove them first`
                                                            : isLocked
                                                                ? lockReason
                                                                : `Assign ${getStaffName(staff)}`
                                                }
                                                className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-full transition-all ${
                                                    alreadyAssigned
                                                        ? "bg-indigo-600 text-white shadow-sm hover:bg-danger-solid hover:text-white"
                                                        : isButtonDisabled
                                                            ? "bg-subtle-soft text-faint cursor-not-allowed opacity-60"
                                                            : "bg-subtle-soft text-muted hover:bg-indigo-600 hover:text-white"
                                                }`}
                                            >
                                                {isLoading ? (
                                                    <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                ) : alreadyAssigned ? (
                                                    <X className="w-5 h-5" />
                                                ) : (
                                                    <Plus className="w-5 h-5" />
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            </>
                        )}
                    </div>
                </div>
            </>
        );
    };

    // 4. PROFILE WORKSPACE RENDERER
    const renderProfileWorkspace = () => {
        return (
            <div className="w-full flex-1 overflow-y-auto">
                <StudentProfileContent propStudentId={studentId as string} propHideNavigation={true} propEmbedded={true} />
            </div>
        );
    }

    const formatStatusLabel = (status?: string) => {
        if (!status) return "Unknown";
        return STATUS_COLORS[status.toUpperCase()]?.label || status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    };
    const getSidebarStatusFilterKey = (status?: string) =>
        status === "ASSESSMENT_SCHEDULED" ? "PENDING_ASSESSMENT" : status;

    const sidebarStatuses = Array.from(
        new Set(allStudents.map(s => getSidebarStatusFilterKey(s.status)).filter((s): s is string => Boolean(s)))
    ).sort((a, b) => formatStatusLabel(a).localeCompare(formatStatusLabel(b)));

    const sidebarGrades = Array.from(
        new Set(allStudents.map(s => s.grade).filter(Boolean))
    ).sort();

    const filteredStudents = [...allStudents].filter(s => {
        const query = studentSearch.trim().toLowerCase();
        const fullName = `${s.first_name || ""} ${s.last_name || ""}`.trim().toLowerCase();
        const matchesSearch = !query || fullName.includes(query) || formatStatusLabel(s.status).toLowerCase().includes(query);
        const matchesStatus = studentStatusFilter === "ALL" || getSidebarStatusFilterKey(s.status) === studentStatusFilter;
        const matchesGrade = studentGradeFilter === "ALL" || s.grade === studentGradeFilter;
        return matchesSearch && matchesStatus && matchesGrade;
    }).sort((a, b) => {
        const aName = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase();
        const bName = `${b.first_name || ""} ${b.last_name || ""}`.trim().toLowerCase();

        if (studentSort === "az") {
            return aName.localeCompare(bName);
        }

        const aRecent = a.recent_activity_at ? new Date(a.recent_activity_at).getTime() : 0;
        const bRecent = b.recent_activity_at ? new Date(b.recent_activity_at).getTime() : 0;
        if (aRecent !== bRecent) return bRecent - aRecent;
        return aName.localeCompare(bName);
    });

    const workspaceStatusInfo = STATUS_COLORS[studentStatus?.toUpperCase()] || { bg: "var(--bg-neutral-light)", color: "var(--text-secondary)", label: studentStatus };
    const currentStudentDetails = studentDetails || allStudents.find(s => s.id?.toString() === studentId);
    const studentGrade = currentStudentDetails?.grade;
    const tabBar = user?.role !== "PARENT" ? (
        <div className="border-b border-line shrink-0 bg-card relative z-10">
            <div className="flex flex-col gap-2 px-4 py-2 md:px-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-4">
                    <div className="flex min-w-0 flex-col justify-center md:border-r md:border-line md:pr-4">
                        <h1 className="m-0 truncate text-lg font-extrabold leading-tight tracking-tight text-fg" title={studentName}>
                            {studentName}
                        </h1>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {studentStatus && (
                                <span
                                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0"
                                    style={{
                                        background: workspaceStatusInfo.bg,
                                        color: workspaceStatusInfo.color,
                                    }}
                                >
                                    {workspaceStatusInfo.label || studentStatus}
                                </span>
                            )}
                            {studentGrade && (
                                <span
                                    className="rounded-full bg-subtle-soft border border-line px-2 py-0.5 text-[11px] font-medium text-muted shrink-0"
                                >
                                    {studentGrade}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1 overflow-x-auto secondary-header-scrollbar">
                        {user?.role === "ADMIN" && (
                            <button onClick={() => setWorkspace("overview")} className={workspaceMainTabClass(workspace === "overview")}>
                                Overview
                            </button>
                        )}
                        {isStaffViewer && (
                            <button onClick={() => setWorkspace("overview")} className={workspaceMainTabClass(workspace === "overview")}>
                                <Users className="w-4 h-4 inline-block mr-1.5 -mt-0.5" aria-hidden="true" />
                                Overview
                            </button>
                        )}
                        {user?.role !== "ADMIN" && (
                            <button onClick={() => setWorkspace("forms")} className={workspaceMainTabClass(workspace === "forms")}>
                                <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Forms
                            </button>
                        )}
                        <button onClick={() => setWorkspace("reports")} className={workspaceMainTabClass(workspace === "reports")}>
                            <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                            Reports
                        </button>
                        {user?.role === "ADMIN" && (
                            <button onClick={() => setWorkspace("team")} className={workspaceMainTabClass(workspace === "team")}>
                                <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                Team
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    ) : null;

    return (
        <div className="flex h-full w-full overflow-hidden relative">
                {user?.role === "PARENT" && !hasSeenWorkspaceExplainer && (
                    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                        <div className="bg-card rounded-[24px] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300 border border-white/20">
                            <div className="p-8 text-center relative">
                                <div className="absolute top-4 right-4 text-faint hover:text-muted cursor-pointer transition-colors p-1" onClick={() => { setHasSeenWorkspaceExplainer(true); if (typeof window !== "undefined") window.localStorage.setItem("arase:seen-workspace-explainer", "true"); }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </div>
                                
                                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-indigo-100">
                                    <Sparkles className="w-6 h-6 text-indigo-600" strokeWidth={2} />
                                </div>
                                <h2 className="text-xl font-extrabold text-fg mb-4 tracking-tight">Your Child's Progress Hub</h2>
                                
                                <p className="text-muted text-[15px] leading-relaxed mb-8">
                                    This space is your central hub for tracking your child's development. Here you can review specialist assessments, provide your own monthly updates, access active learning plans, and read comprehensive monthly progress reports.
                                    <br/><br/>
                                    <strong className="text-fg font-bold">We rely on your active participation to ensure your child gets the best support possible.</strong>
                                </p>
                                
                                <button
                                    onClick={() => {
                                        setHasSeenWorkspaceExplainer(true);
                                        if (typeof window !== "undefined") {
                                            window.localStorage.setItem("arase:seen-workspace-explainer", "true");
                                        }
                                    }}
                                    className="w-full py-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl transition-colors shadow-sm text-[15px]"
                                >
                                    Get Started
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {showStudentSidebar && (
                    <>
                        {/* Student List Sidebar — fixed secondary sidebar */}
                        <div className={`hidden md:flex flex-col bg-card border-r border-line shrink-0 h-full overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 border-r-0' : 'w-56'}`}>
                            <div className="p-3.5 border-b border-line shrink-0 w-56 bg-card">
                                <p className="text-[0.65rem] font-bold text-faint uppercase tracking-wider mb-2">Students</p>
                                <div className="relative mb-2">
                                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                                    <input
                                        type="text"
                                        placeholder="Search students..."
                                        value={studentSearch}
                                        onChange={(e) => setStudentSearch(e.target.value)}
                                        className="w-full bg-app border border-line rounded-lg py-1.5 pl-8 pr-3 text-xs text-fg placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                                    />
                                </div>
                                <div className="flex gap-1 rounded-lg border border-line bg-app p-0.5 mb-2">
                                    <button
                                        type="button"
                                        title="Sort by latest activity"
                                        onClick={() => setStudentSort("recent")}
                                        className={`h-6 flex-1 rounded-md px-2 text-[0.65rem] font-bold transition-all ${studentSort === "recent" ? "bg-card text-indigo-700 shadow-xs" : "text-muted hover:text-fg"}`}
                                    >
                                        Recent
                                    </button>
                                    <button
                                        type="button"
                                        title="Sort alphabetically"
                                        onClick={() => setStudentSort("az")}
                                        className={`h-6 flex-1 rounded-md px-2 text-[0.65rem] font-bold transition-all ${studentSort === "az" ? "bg-card text-indigo-700 shadow-xs" : "text-muted hover:text-fg"}`}
                                    >
                                        A-Z
                                    </button>
                                </div>
                                <div className="flex gap-1.5">
                                    <CustomSelect
                                        size="sm"
                                        className="flex-1 min-w-0"
                                        ariaLabel="Filter students by status"
                                        value={studentStatusFilter}
                                        onChange={setStudentStatusFilter}
                                        triggerClassName={studentStatusFilter !== "ALL" ? "border-indigo-300 bg-indigo-50/60 text-indigo-700" : "text-muted"}
                                        options={[
                                            { value: "ALL", label: "All statuses" },
                                            ...sidebarStatuses.map(status => ({ value: status, label: formatStatusLabel(status) })),
                                        ]}
                                    />
                                    <CustomSelect
                                        size="sm"
                                        className="flex-1 min-w-0"
                                        ariaLabel="Filter students by grade"
                                        value={studentGradeFilter}
                                        onChange={setStudentGradeFilter}
                                        triggerClassName={studentGradeFilter !== "ALL" ? "border-indigo-300 bg-indigo-50/60 text-indigo-700" : "text-muted"}
                                        options={[
                                            { value: "ALL", label: "All grades" },
                                            ...sidebarGrades.map(grade => ({ value: grade, label: grade })),
                                        ]}
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5">
                                {filteredStudents.length === 0 ? (
                                    <p className="text-xs text-faint text-center py-6">No students found.</p>
                                ) : (
                                    filteredStudents.map(s => {
                                        const isCurrent = s.id.toString() === studentId;
                                        const sidebarStatusLabel = statusLabel(s.status);
                                        const statusDot = statusColorHex(s.status);
                                        return (
                                            <div
                                                key={s.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => !isCurrent && navigateWithTeamGuard(buildWorkspaceStudentHref(s, workspace, user?.role))}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        if (!isCurrent) navigateWithTeamGuard(buildWorkspaceStudentHref(s, workspace, user?.role));
                                                    }
                                                }}
                                                className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                                                    isCurrent
                                                        ? 'bg-indigo-50/90'
                                                        : 'hover:bg-subtle-soft/70'
                                                }`}
                                                style={{ cursor: isCurrent ? 'default' : 'pointer' }}
                                                title={`${s.first_name} ${s.last_name} — ${sidebarStatusLabel}`}
                                            >
                                                <span
                                                    className="h-1.5 w-1.5 rounded-full shrink-0"
                                                    style={{ background: statusDot.color }}
                                                    aria-hidden="true"
                                                />
                                                <span className="min-w-0 flex-1">
                                                    <span className={`block truncate text-[0.78rem] leading-snug ${isCurrent ? 'font-bold text-indigo-900' : 'font-medium text-fg group-hover:text-indigo-900'}`}>
                                                        {s.first_name} {s.last_name}
                                                    </span>
                                                    <span className={`block truncate text-[0.62rem] leading-snug ${isCurrent ? 'text-indigo-600/80' : 'text-faint'}`}>
                                                        {sidebarStatusLabel}{s.grade ? ` · ${s.grade}` : ''}
                                                    </span>
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            <div className="px-3 py-2.5 border-t border-line bg-app">
                                <p className="text-[0.63rem] font-medium text-faint text-center uppercase tracking-wider">{filteredStudents.length} of {allStudents.length} students</p>
                            </div>
                        </div>
                    </>
                )}

                {/* Floating Toggle Button (Outside hidden overflow containers) */}
                {showStudentSidebar && (
                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className={`hidden md:flex absolute top-[1.35rem] z-[50] items-center justify-center bg-card border border-line shadow-sm rounded-full w-6 h-6 text-faint hover:text-indigo-600 hover:border-indigo-400 transition-all duration-300 ${isSidebarCollapsed ? 'left-2' : 'left-[calc(14rem-12px)]'}`}
                        aria-label="Toggle Student List"
                    >
                        {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </button>
                )}

                {/* Main Workspace Area */}
                <div className="flex-1 flex flex-col min-w-0 h-full relative z-10 bg-app md:bg-card overflow-hidden">
                    <div className={`flex-1 flex flex-col min-h-0 transition-all duration-300 ${isSidebarCollapsed ? 'pl-10 md:pl-14' : ''}`}>
                        <div className="bg-card flex-1 flex flex-col overflow-hidden min-h-0">
                            
                            {/* Main Body */}
                            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 relative z-0">
                                {user?.role === "PARENT" ? renderParentUnifiedWorkspace() : workspace === "overview" && user?.role === "ADMIN" ? renderOverviewWorkspace() : workspace === "overview" && isStaffViewer ? renderStaffOverviewWorkspace() : workspace === "forms" ? renderFormsWorkspace() : workspace === "reports" ? renderReportsWorkspace() : workspace === "team" ? renderTeamWorkspace() : renderProfileWorkspace()}
                            </div>
                        </div>
                    </div>
                </div>

                {pendingTeamNavigation && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                        <div className="w-full max-w-lg rounded-2xl bg-card shadow-xl overflow-hidden">
                            <div className="p-6">
                                <div className="flex items-start gap-4">
                                    <div className="h-11 w-11 shrink-0 rounded-full bg-warning-soft flex items-center justify-center">
                                        <AlertCircle className="h-5 w-5 text-warning" />
                                    </div>
                                    <div>
                                        <h3 className="m-0 text-lg font-bold text-fg">Save team changes?</h3>
                                        <p className="mt-1 text-sm text-muted">
                                            These changes are not saved yet. Review them before leaving this page.
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-5 max-h-[55vh] overflow-y-auto space-y-4 pr-1">
                                    <div className="rounded-xl border border-success-line bg-success-soft p-4">
                                        <p className="m-0 text-xs font-bold uppercase tracking-widest text-success">Added</p>
                                        <div className="mt-3 space-y-2">
                                            {addedTeamUnits.length === 0 ? (
                                                <p className="m-0 text-sm text-success/70">No additions.</p>
                                            ) : addedTeamUnits.map((unit) => (
                                                <div key={unit.key} className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2">
                                                    <span className="text-sm font-bold text-fg">{unit.name}</span>
                                                    <span className="text-xs font-semibold text-success">{unit.detail}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-danger-line bg-danger-soft p-4">
                                        <p className="m-0 text-xs font-bold uppercase tracking-widest text-danger">Removed</p>
                                        <div className="mt-3 space-y-2">
                                            {removedTeamUnits.length === 0 ? (
                                                <p className="m-0 text-sm text-danger/70">No removals.</p>
                                            ) : removedTeamUnits.map((unit) => (
                                                <div key={unit.key} className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2">
                                                    <span className="text-sm font-bold text-fg">{unit.name}</span>
                                                    <span className="text-xs font-semibold text-danger">{unit.detail}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-line bg-app p-4">
                                        <p className="m-0 text-xs font-bold uppercase tracking-widest text-muted">Current Selection</p>
                                        <div className="mt-3 space-y-2">
                                            {stagedTeamUnits.length === 0 ? (
                                                <p className="m-0 text-sm text-muted">No team members selected.</p>
                                            ) : stagedTeamUnits.map((unit) => (
                                                <div key={unit.key} className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2">
                                                    <span className="text-sm font-bold text-fg">{unit.name}</span>
                                                    <span className="text-xs font-semibold text-muted">{unit.detail}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-6 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPendingTeamNavigation(null)}
                                        disabled={confirmingTeam}
                                        className="rounded-lg bg-subtle-soft px-4 py-2 text-sm font-bold text-muted transition-colors hover:bg-subtle-soft disabled:opacity-60"
                                    >
                                        Stay
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const target = pendingTeamNavigation;
                                            discardTeamChanges();
                                            if (target) router.push(target);
                                        }}
                                        disabled={confirmingTeam}
                                        className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-bold text-muted transition-colors hover:bg-app disabled:opacity-60"
                                    >
                                        Cancel Changes
                                    </button>
                                    <button
                                        type="button"
                                        onClick={proceedWithPendingNavigation}
                                        disabled={confirmingTeam}
                                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                                    >
                                        <Check size={16} />
                                        {confirmingTeam ? "Confirming..." : "Confirm Team"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Unassign Confirmation Modal */}
                {unassigningStaff && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                        <div className="w-full max-w-md bg-card rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-6">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="h-12 w-12 rounded-full bg-danger-soft flex items-center justify-center shrink-0">
                                        <AlertCircle className="h-6 w-6 text-danger" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-fg">Remove from selection?</h3>
                                        <p className="text-sm text-muted mt-1">
                                            Remove <strong>{unassigningStaff.name}</strong> from the team selection. This will be saved when you confirm the team.
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="flex gap-3 justify-end mt-8">
                                    <button
                                        onClick={() => setUnassigningStaff(null)}
                                        disabled={isUnassigning}
                                        className="px-4 py-2 text-sm font-bold text-muted bg-subtle-soft hover:bg-subtle-soft rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmUnassign}
                                        disabled={isUnassigning}
                                        className="px-4 py-2 text-sm font-bold text-white bg-danger-solid hover:bg-danger-solid rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isUnassigning ? (
                                            <>
                                                <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                Removing...
                                            </>
                                        ) : (
                                            "Remove from Selection"
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {showEnrollConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 px-4">
                        <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-2xl">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <h2 className="mb-2 text-xl font-bold text-fg">Enroll {studentName}?</h2>
                            <p className="mb-6 text-sm leading-6 text-muted">
                                This will mark the student as enrolled and unlock specialist progress trackers and monthly reports. Since this is the therapy phase, no classroom teacher is involved yet. A finalized IEP is required.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => !enrollingStudent && setShowEnrollConfirm(false)}
                                    disabled={enrollingStudent}
                                    className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-bold text-muted hover:bg-app disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleEnrollStudent}
                                    disabled={enrollingStudent}
                                    className="rounded-lg border border-success-line bg-success-solid px-4 py-2 text-sm font-bold text-white hover:bg-success-solid disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {enrollingStudent ? "Enrolling..." : "Confirm Enrollment"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showIntegrateConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 px-4">
                        <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-2xl">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                                <GraduationCap size={24} />
                            </div>
                            <h2 className="mb-2 text-xl font-bold text-fg">Integrate {studentName}?</h2>
                            <p className="mb-6 text-sm leading-6 text-muted">
                                This will transition the student into the mainstream school program, officially involving the classroom teacher. This unlocks SPED teacher assignment and classroom progress trackers.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => !integratingStudent && setShowIntegrateConfirm(false)}
                                    disabled={integratingStudent}
                                    className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-bold text-muted hover:bg-app disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleIntegrateStudent}
                                    disabled={integratingStudent}
                                    className="rounded-lg border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {integratingStudent ? "Integrating..." : "Confirm Integration"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Student Confirmation Modal */}
                {showDeleteModal && studentDetails && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                        <div className="w-full max-w-md bg-card rounded-2xl border border-line p-6 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="h-12 w-12 rounded-full bg-danger-soft flex items-center justify-center shrink-0">
                                    <AlertCircle className="h-6 w-6 text-danger" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-fg">Delete Student</h3>
                                    <p className="text-sm text-muted mt-1 leading-relaxed">
                                        You are about to permanently delete <strong>{studentDetails.first_name} {studentDetails.last_name}</strong> and all associated records. This cannot be undone.
                                    </p>
                                </div>
                            </div>
                            
                            <div className="mb-4 bg-danger-soft border border-danger-line rounded-xl p-3 text-xs font-semibold text-danger leading-relaxed">
                                <span className="font-bold block mb-1">To confirm, type the student's full name exactly:</span>
                                <span className="italic select-none font-bold text-sm bg-card/50 px-2 py-0.5 rounded border border-danger-line/25 block w-fit mt-1">
                                    {studentDetails.first_name} {studentDetails.last_name}
                                </span>
                            </div>

                            {deleteError && (
                                <div className="mb-4 rounded-lg bg-danger-soft border border-danger-line p-3 text-xs font-bold text-danger">
                                    {deleteError}
                                </div>
                            )}

                            <div className="flex flex-col gap-4">
                                <input
                                    type="text"
                                    placeholder="Type full name to confirm"
                                    value={deleteConfirmText}
                                    onChange={e => setDeleteConfirmText(e.target.value)}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-app text-fg focus:outline-none focus:border-danger-line transition-colors"
                                />
                                <div className="flex gap-3 justify-end">
                                    <button
                                        type="button"
                                        onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); setDeleteError(""); }}
                                        className="px-4 py-2 text-sm font-bold text-muted bg-subtle-soft hover:bg-subtle-soft/80 border border-subtle-line rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeleteStudent}
                                        disabled={deleteConfirmText !== `${studentDetails.first_name} ${studentDetails.last_name}`}
                                        className="px-4 py-2 text-sm font-bold text-white bg-danger-solid hover:bg-danger-strong border border-danger-solid hover:border-danger-strong rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        Permanently Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Custom scrollbar style for this layout */}
                <style dangerouslySetInnerHTML={{__html: `
                    .custom-scrollbar::-webkit-scrollbar {
                        width: 6px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                        background-color: var(--text-muted);
                        border-radius: 20px;
                    }
                    .secondary-header-scrollbar {
                        scrollbar-width: thin;
                        scrollbar-color: var(--text-muted) transparent;
                    }
                    .secondary-header-scrollbar::-webkit-scrollbar {
                        height: 3px;
                    }
                    .secondary-header-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    .secondary-header-scrollbar::-webkit-scrollbar-thumb {
                        background-color: var(--text-muted);
                        border-radius: 999px;
                    }
                `}} />
        </div>
    );
}

export default function UnifiedWorkspacePage() {
    return (
        <Suspense fallback={<div className="p-8 h-full flex items-center justify-center font-medium text-muted">Loading master workspace...</div>}>
            <ProtectedRoute allowedRoles={["ADMIN", "SPECIALIST", "TEACHER", "PARENT"]}>
                <UnifiedWorkspaceContent />
            </ProtectedRoute>
        </Suspense>
    );
}


