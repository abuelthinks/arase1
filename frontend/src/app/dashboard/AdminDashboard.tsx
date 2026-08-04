"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ArrowRight, BarChart3, ClipboardList, Clock, FileCheck2, Mail, Search, Sparkles, UserPlus, Users as UsersIcon, Zap, CheckCircle2, FileUp, Loader2, Play, Trash2, XCircle } from "lucide-react";
import { SPECIALIST_SPECIALTIES, type SpecialistSpecialty } from "@/lib/specialties";
import { GRADE_LEVELS, type GradeLevel } from "@/lib/grade-levels";
import { roleColorHex, semanticToneClass, statusColorHex, statusLabel, studentRowActionPillClass } from "@/lib/role-colors";
import type { SpecialtyChangeRequest } from "@/types";
import Badge from "@/components/ui/Badge";
import { toast } from "sonner";
import { extractApiError } from "@/lib/toast-utils";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import CustomSelect, { PAGE_SIZE_OPTIONS } from "@/components/CustomSelect";

/* ─── Utility: Title Case ────────────────────────────────────────────────── */

function toTitleCase(str: string): string {
    return str
        .toLowerCase()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface UserData {
    id: number;
    
    email: string;
    role: string;
    first_name: string;
    last_name: string;
    specialty?: SpecialistSpecialty | "";
    specialties?: SpecialistSpecialty[];
    grade_level?: string;
    assigned_students_count: number;
    assigned_student_names: string[];
    pending_specialty_request?: SpecialtyChangeRequest | null;
}

function SpecialtyRequestBadge({ request }: { request: SpecialtyChangeRequest }) {
    const summary = [
        ...request.added.map(s => `Add ${s}`),
        ...request.removed.map(s => `Remove ${s}`),
    ].join(', ');

    return (
        <span
            title={`Specialty change requested: ${summary}${request.note ? ` — "${request.note}"` : ''}`}
            className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-bold ${semanticToneClass('warning')}`}
        >
            <Clock size={11} className="shrink-0" aria-hidden="true" />
            Specialty request
        </span>
    );
}

interface BulkEmailEntry {
    email: string;
    status: 'pending' | 'sending' | 'success' | 'error';
    errorMessage?: string;
}

interface InvitationData {
    id: number;
    email: string;
    role: string;
    token: string;
    is_used: boolean;
    created_at: string;
    expires_at: string;
}

const ALLOWED_ACTION_PREFIXES = ["/dashboard", "/workspace", "/students", "/users", "/admin", "/specialists"];

function isSafeActionLink(link?: string): boolean {
    if (!link || typeof link !== "string") return false;
    if (!link.startsWith("/")) return false;
    return ALLOWED_ACTION_PREFIXES.some(p => link === p || link.startsWith(`${p}?`) || link.startsWith(`${p}/`));
}

function getExpiryDisplay(expiresAt: string): { label: string; color: string; bg: string; isExpired: boolean } {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();
    if (diffMs <= 0) return { label: 'Expired', color: '#be123c', bg: '#fff1f2', isExpired: true };
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHrs < 6) return { label: `${diffHrs}h ${diffMins}m left`, color: 'var(--text-warning)', bg: 'var(--bg-warning-light)', isExpired: false };
    if (diffHrs < 24) return { label: `${diffHrs}h left`, color: 'var(--text-warning)', bg: 'var(--bg-warning-light)', isExpired: false };
    return { label: `${diffHrs}h left`, color: 'var(--text-success)', bg: 'var(--bg-success-light)', isExpired: false };
}

interface StudentData {
    id: number;
    first_name: string;
    last_name: string;
    grade: string;
    status: string;
    has_parent_assessment?: boolean;
    has_specialist_assessment?: boolean;
    parent_assessment_unlocked?: boolean;
    parent_current_tracker_submitted?: boolean;
    specialist_current_tracker_submitted?: boolean;
    teacher_current_tracker_submitted?: boolean;
    next_action?: {
        label: string;
        tone: string;
        workspace?: string;
        tab?: string | null;
        view?: string | null;
        docId?: string | null;
        teamRole?: string | null;
    };
}

interface DashboardAction {
    id: string;
    title: string;
    description: string;
    action_text: string;
    link: string;
    type: "positive" | "info" | "warning";
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const getStatusStyle = statusColorHex;

const getActionTypeStyle = (type: DashboardAction["type"]) => {
    if (type === 'positive') return { bg: '#f0fdf4', border: '#bbf7d0', title: 'var(--text-success)', body: 'var(--success)' };
    if (type === 'warning') return { bg: 'var(--bg-warning-light)', border: '#fde68a', title: 'var(--text-warning)', body: 'var(--text-warning)' };
    return { bg: '#eff6ff', border: '#bfdbfe', title: 'var(--text-info)', body: 'var(--text-info)' };
};

const getFormPillClass = (isSubmitted?: boolean, isUnlocked?: boolean) => {
    return `cursor-pointer text-xs font-bold px-2.5 py-1.5 rounded-xl border transition-colors duration-200 ${
        isUnlocked
            ? "border-warning-line bg-warning-soft text-warning hover:bg-warning-soft hover:text-warning hover:border-warning-line"
            : isSubmitted 
                ? "border-success-line bg-success-soft text-success hover:bg-success-soft hover:text-success hover:border-success-line" 
                : "border-line bg-app text-muted hover:bg-subtle-soft hover:text-fg hover:border-line"
    }`;
};

const getActionButtonClass = (studentStatus?: string, actionTone?: string) => {
    return `no-underline border transition-colors duration-200 ${studentRowActionPillClass(studentStatus || "ARCHIVED", actionTone)}`;
};

const getWaitingActionMessage = (label?: string) =>
    label === 'Awaiting Parent'
        ? 'Parent assessment is still missing.'
        : 'Specialist assessment is not finalized yet.';

const getWaitingActionTitle = (label?: string) =>
    label === 'Awaiting Parent' ? 'Waiting on parent' : 'Waiting on specialists';

const buildStudentActionHref = (student: StudentData) => {
    const params = new URLSearchParams({ studentId: student.id.toString() });
    const action = student.next_action;
    if (action?.workspace) params.set("workspace", action.workspace);
    if (action?.tab) params.set("tab", action.tab);
    if (action?.view) params.set("view", action.view);
    if (action?.docId) params.set("docId", action.docId);
    if (action?.teamRole) params.set("teamRole", action.teamRole);
    return `/workspace?${params.toString()}`;
};

const getCardButtonClass = (tone: string) => {
    const base = "shrink-0 text-center text-xs font-bold px-4 py-2 rounded-lg bg-card shadow-sm transition-colors duration-200 border no-underline ";
    switch (tone) {
        case "warning":
            return base + "text-warning border-warning-line hover:bg-warning-solid hover:text-warning hover:border-warning-line";
        case "info":
            return base + "text-info border-info-line hover:bg-info-strong hover:text-white hover:border-info-line";
        case "success":
            return base + "text-success border-success-line hover:bg-success-solid hover:text-white hover:border-success-line";
        case "attention":
            return base + "text-pink-700 border-pink-200 hover:bg-pink-600 hover:text-white hover:border-pink-700";
        default:
            return base + "text-fg border-line hover:bg-slate-800 hover:text-white hover:border-slate-900";
    }
};

/* ─── Main Component ─────────────────────────────────────────────────────── */

export default function AdminDashboard() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user: authUser } = useAuth();
    const getTimeGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    };

    // Check URL for explicit tab, default to students
    const initialTab = (searchParams.get('tab') as "analytics" | "students" | "users" | "invitations") || "analytics";
    const [activeTab, setActiveTab] = useState<"analytics" | "students" | "users" | "invitations">(initialTab);
    const [students, setStudents] = useState<StudentData[]>([]);
    const [users, setUsers] = useState<UserData[]>([]);
    const [invitations, setInvitations] = useState<InvitationData[]>([]);
    const [dashboardActions, setDashboardActions] = useState<DashboardAction[]>([]);
    const [loading, setLoading] = useState(true);

    // Student search & filter
    const [studentSearch, setStudentSearch] = useState("");
    const [studentGradeFilter, setStudentGradeFilter] = useState("ALL");
    const [activeStatusTab, setActiveStatusTab] = useState<string>("");
    
    // Student Sorting
    const [studentSortConfig, setStudentSortConfig] = useState<{ key: 'id' | 'name' | 'grade' | 'status' | null; direction: 'asc' | 'desc' | null }>({ key: 'status', direction: 'asc' });

    // Student Pagination
    const [studentPage, setStudentPage] = useState(1);
    const [studentItemsPerPage, setStudentItemsPerPage] = useState(25);

    // User search & filter
    const [userSearch, setUserSearch] = useState("");
    const [userRoleFilter, setUserRoleFilter] = useState("");
    
    // User Sorting
    const [userSortConfig, setUserSortConfig] = useState<{ key: 'name' | 'role' | 'kids' | null, direction: 'asc' | 'desc' | null }>({ key: null, direction: null });

    // User Pagination
    const [userPage, setUserPage] = useState(1);
    const [userItemsPerPage, setUserItemsPerPage] = useState(25);

    // Invitation search & filter
    const [invitationSearch, setInvitationSearch] = useState("");
    const [invitationRoleFilters, setInvitationRoleFilters] = useState<string[]>([]);
    
    // Invitation Sorting
    const [invitationSortConfig, setInvitationSortConfig] = useState<{ key: 'email' | 'role' | 'date' | null, direction: 'asc' | 'desc' | null }>({ key: null, direction: null });

    // Invitation Pagination
    const [invitationPage, setInvitationPage] = useState(1);
    const [invitationItemsPerPage, setInvitationItemsPerPage] = useState(25);



    // Modal state for Inviting User
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('PARENT');
    const [inviteSpecialties, setInviteSpecialties] = useState<SpecialistSpecialty[]>([]);
    const [inviteGradeLevel, setInviteGradeLevel] = useState<GradeLevel | ''>('');

    // Bulk Registration State
    const [bulkRole, setBulkRole] = useState("PARENT");
    const [bulkSpecialties, setBulkSpecialties] = useState<SpecialistSpecialty[]>([]);
    const [bulkGradeLevel, setBulkGradeLevel] = useState<GradeLevel | ''>('');
    const [bulkInputText, setBulkInputText] = useState("");
    const [bulkEmails, setBulkEmails] = useState<BulkEmailEntry[]>([]);
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    const sendAssessmentReminder = async (student: StudentData, target: 'parent' | 'specialist') => {
        const path = target === 'parent' ? 'parent-assessment-reminder' : 'specialist-assessment-reminder';
        const label = target === 'parent' ? 'parent' : 'specialist';
        try {
            const res = await api.post(`/api/students/${student.id}/${path}/`);
            toast.success(res.data?.message || `Reminder sent to ${label}.`);
        } catch (err: any) {
            toast.error(extractApiError(err, `Reminder failed.`));
        }
    };

    const handleWaitingAction = (student: StudentData, nextAction: NonNullable<StudentData['next_action']>) => {
        const isParentReminder = nextAction.label === 'Awaiting Parent';
        const isSpecialistReminder = nextAction.label === 'Awaiting Specialists';
        toast.info(getWaitingActionTitle(nextAction.label), {
            description: getWaitingActionMessage(nextAction.label),
            action: isParentReminder || isSpecialistReminder
                ? {
                    label: isParentReminder ? 'Remind' : 'Remind team',
                    onClick: () => sendAssessmentReminder(student, isParentReminder ? 'parent' : 'specialist'),
                }
                : undefined,
        });
    };

    // Bulk Registration Handlers
    const extractBulkEmails = (text: string) => {
        const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
        const found = text.match(emailRegex) || [];
        
        const currentEmails = new Set(bulkEmails.map(e => e.email.toLowerCase()));
        const newEntries: BulkEmailEntry[] = [];
        
        found.forEach(e => {
            const lower = e.toLowerCase();
            if (!currentEmails.has(lower)) {
                currentEmails.add(lower);
                newEntries.push({ email: lower, status: 'pending' });
            }
        });

        if (newEntries.length > 0) {
            setBulkEmails(prev => [...prev, ...newEntries]);
            toast.success(`Extracted ${newEntries.length} new email(s)`);
        } else if (text.trim().length > 0) {
            toast.info("No new emails found.");
        }
        setBulkInputText("");
    };

    const handleBulkFileUpload = (file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            extractBulkEmails(text);
        };
        reader.readAsText(file);
    };

    const handleBulkDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleBulkFileUpload(file);
    };

    const removeBulkEmail = (index: number) => {
        setBulkEmails(prev => prev.filter((_, i) => i !== index));
    };

    const clearAllBulkEmails = () => {
        if (confirm("Are you sure you want to clear the entire list?")) {
            setBulkEmails([]);
        }
    };

    const handleBulkSendInvites = async () => {
        const pendingCount = bulkEmails.filter(e => e.status === 'pending' || e.status === 'error').length;
        if (pendingCount === 0) {
            toast.error("No pending emails.");
            return;
        }

        if (!confirm(`Are you ready to send invitations to ${pendingCount} users?`)) {
            return;
        }

        setIsBulkProcessing(true);
        const updatedList = [...bulkEmails];
        let successCount = 0;

        for (let i = 0; i < updatedList.length; i++) {
            if (updatedList[i].status === 'success') continue;
            
            updatedList[i].status = 'sending';
            setBulkEmails([...updatedList]);

            try {
                await api.post("/api/invitations/", {
                    email: updatedList[i].email,
                    role: bulkRole,
                    specialties: bulkRole === 'SPECIALIST' ? bulkSpecialties : [],
                    grade_level: bulkRole === 'TEACHER' ? bulkGradeLevel : '',
                });
                updatedList[i].status = 'success';
                successCount++;
            } catch (err: any) {
                updatedList[i].status = 'error';
                updatedList[i].errorMessage = extractApiError(err, "Failed to send");
            }
            setBulkEmails([...updatedList]);
        }

        setIsBulkProcessing(false);
        if (successCount > 0) {
            toast.success(`Sent ${successCount} invite${successCount === 1 ? "" : "s"}.`);
            fetchData(); // Refresh the pending invites table
        }
        
        // Remove successful emails from list to clear it up
        setTimeout(() => {
            setBulkEmails(prev => prev.filter(e => e.status !== 'success'));
        }, 3000);
    };



    // Modal state for Delete User Confirmation
    const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deleteError, setDeleteError] = useState("");

    // Modal state for Invite Confirmations
    const [inviteToRevoke, setInviteToRevoke] = useState<InvitationData | null>(null);
    const [inviteToResend, setInviteToResend] = useState<InvitationData | null>(null);
    const [inviteActionLoading, setInviteActionLoading] = useState(false);

    // Modal state for showing newly issued invite token
    const [createdInvite, setCreatedInvite] = useState<{ email: string; token: string } | null>(null);


    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [studentRes, userRes, inviteRes, actionsRes] = await Promise.all([
                api.get("/api/students/"),
                api.get("/api/users/"),
                api.get("/api/invitations/"),
                api.get("/api/dashboard/actions/").catch(() => ({ data: { actions: [] } }))
            ]);
            setStudents(studentRes.data);
            setUsers(userRes.data.sort((a: any, b: any) => b.id - a.id));
            setInvitations(inviteRes.data.sort((a: any, b: any) => b.id - a.id));
            setDashboardActions(actionsRes.data?.actions || []);
        } catch (err) {
            console.error("Failed to fetch admin data", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const dashboardEditing =
        showInviteModal ||
        !!userToDelete || !!inviteToRevoke || !!inviteToResend || !!createdInvite;
    useRealtimeRefresh({
        targets: ['dashboard', 'users', 'staff', 'invitations'],
        isEditing: dashboardEditing,
        onRefresh: fetchData,
    });

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && (tab === 'analytics' || tab === 'students' || tab === 'users' || tab === 'invitations')) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    /* ─── Filtered, Sorted, and Paginated Students ───────────────────────── */

    const statusPriority: Record<string, number> = {
        "PENDING_ASSESSMENT": 1,
        "ASSESSMENT_SCHEDULED": 2,
        "ASSESSED": 3,
        "ENROLLED": 4,
        "INTEGRATED": 5,
        "ARCHIVED": 6
    };
    const getStudentStatusFilterKey = (status: string) =>
        status === "ASSESSMENT_SCHEDULED" ? "PENDING_ASSESSMENT" : status;
    const uniqueStatuses = Array.from(new Set(students.map(s => getStudentStatusFilterKey(s.status)))).sort((a, b) => (statusPriority[a] || 99) - (statusPriority[b] || 99));
    const statusCounts = students.reduce<Record<string, number>>((acc, student) => {
        const statusKey = getStudentStatusFilterKey(student.status);
        acc[statusKey] = (acc[statusKey] || 0) + 1;
        return acc;
    }, {});
    const effectiveStatusTab = activeStatusTab || "ALL";
    const statusFilterOptions = [
        {
            status: "ALL",
            label: "All statuses",
            count: students.length,
            style: { bg: "var(--bg-primary)", color: "var(--text-secondary)" },
        },
        ...uniqueStatuses.map(status => ({
            status,
            label: statusLabel(status),
            count: statusCounts[status] || 0,
            style: getStatusStyle(status),
        })),
    ];
    const isAllStatusView = effectiveStatusTab === "ALL";
    const activeStatusLabel = isAllStatusView ? "" : statusLabel(effectiveStatusTab);

    const uniqueGrades = Array.from(new Set(students.map(s => s.grade).filter(Boolean))).sort();

    const processedStudents = students.filter(s => {
        const searchTerms = studentSearch.toLowerCase().trim().split(/\s+/);
        const searchableString = `${s.first_name} ${s.last_name} ${s.id}`.toLowerCase();
        const matchesSearch = searchTerms.every(term => searchableString.includes(term));
        const matchesStatus = isAllStatusView || getStudentStatusFilterKey(s.status) === effectiveStatusTab;
        const matchesGrade = studentGradeFilter === "ALL" || s.grade === studentGradeFilter;
        return matchesSearch && matchesStatus && matchesGrade;
    });

    if (studentSortConfig.key && studentSortConfig.direction) {
        processedStudents.sort((a, b) => {
            let aVal: any = '';
            let bVal: any = '';
            if (studentSortConfig.key === 'id') {
                aVal = a.id;
                bVal = b.id;
            } else if (studentSortConfig.key === 'name') {
                aVal = `${a.first_name} ${a.last_name}`.trim();
                bVal = `${b.first_name} ${b.last_name}`.trim();
            } else if (studentSortConfig.key === 'grade') {
                aVal = a.grade;
                bVal = b.grade;
            } else if (studentSortConfig.key === 'status') {
                const statusPriority: Record<string, number> = {
                    "PENDING_ASSESSMENT": 1,
                    "ASSESSMENT_SCHEDULED": 2,
                    "ASSESSED": 3,
                    "ENROLLED": 4,
                    "INTEGRATED": 5,
                    "ARCHIVED": 6
                };
                aVal = statusPriority[a.status] || 99;
                bVal = statusPriority[b.status] || 99;
            }
            if (aVal < bVal) return studentSortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return studentSortConfig.direction === 'asc' ? 1 : -1;
            if (studentSortConfig.key === 'status') {
                return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
            }
            return 0;
        });
    }

    // Aggregate view: one column per pipeline stage, always in pipeline order.
    const aggregateStatusOrder = ["PENDING_ASSESSMENT", "ASSESSED", "ENROLLED", "INTEGRATED"];
    const studentGroups = Array.from(new Set([...aggregateStatusOrder, ...uniqueStatuses]))
        .sort((a, b) => (statusPriority[a] || 99) - (statusPriority[b] || 99))
        .map(status => ({
            status,
            label: statusLabel(status),
            style: getStatusStyle(status),
            total: statusCounts[status] || 0,
            students: processedStudents.filter(s => getStudentStatusFilterKey(s.status) === status),
        }));
    const aggregateRowCount = Math.max(0, ...studentGroups.map(g => g.students.length));

    const totalStudentPages = (isAllStatusView
        ? Math.ceil(aggregateRowCount / studentItemsPerPage)
        : Math.ceil(processedStudents.length / studentItemsPerPage)) || 1;
    const safeStudentPage = Math.min(Math.max(1, studentPage), totalStudentPages);
    const studentRowStart = (safeStudentPage - 1) * studentItemsPerPage;
    const paginatedStudents = processedStudents.slice(studentRowStart, studentRowStart + studentItemsPerPage);
    const aggregateRowsOnPage = Math.max(0, Math.min(studentItemsPerPage, aggregateRowCount - studentRowStart));

    const renderStudentFormPills = (s: StudentData) => (
        s.status.toUpperCase() !== "ENROLLED" && s.status.toUpperCase() !== "INTEGRATED" ? (
            <>
                <div
                    className={getFormPillClass(s.has_parent_assessment, s.parent_assessment_unlocked)}
                    onClick={() => s.has_parent_assessment ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=parent_assessment`) : toast.error("Not submitted yet.", { id: "not-submitted" })}
                >Parent</div>
                <div
                    className={getFormPillClass(s.has_specialist_assessment)}
                    onClick={() => s.has_specialist_assessment ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=multi_assessment`) : toast.error("Not submitted yet.", { id: "not-submitted" })}
                >Specialist</div>
            </>
        ) : (
            <>
                <div
                    className={getFormPillClass(s.parent_current_tracker_submitted)}
                    onClick={() => s.parent_current_tracker_submitted ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=parent_tracker`) : toast.error("Not submitted yet.", { id: "not-submitted" })}
                >Parent</div>
                <div
                    className={getFormPillClass(s.specialist_current_tracker_submitted)}
                    onClick={() => s.specialist_current_tracker_submitted ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=multi_tracker`) : toast.error("Not submitted yet.", { id: "not-submitted" })}
                >Specialist</div>
                {s.status.toUpperCase() === "INTEGRATED" && (
                    <div
                        className={getFormPillClass(s.teacher_current_tracker_submitted)}
                        onClick={() => s.teacher_current_tracker_submitted ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=sped_tracker`) : toast.error("Not submitted yet.", { id: "not-submitted" })}
                    >Teacher</div>
                )}
            </>
        )
    );

    const renderStudentRow = (s: StudentData) => {
        const nextAction = s.next_action;
        return (
            <tr key={s.id} style={{ borderBottom: "1px solid var(--border-light)", verticalAlign: "middle" }}>
                <td style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.85rem" }}>#{s.id}</td>
                <td style={{ padding: "12px" }}>
                    <Link href={`/workspace?studentId=${s.id}`} className="hover:text-indigo-600 hover:underline transition-colors duration-200" style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: "bold", fontSize: "0.95rem" }}>
                        {s.first_name} {s.last_name}
                    </Link>
                </td>
                <td style={{ padding: "12px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{s.grade}</td>
                <td style={{ padding: "12px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxWidth: "250px" }}>
                        {renderStudentFormPills(s)}
                    </div>
                </td>
                <td style={{ padding: "12px", textAlign: "right" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", alignItems: "center" }}>
                        {nextAction ? (
                            nextAction.tone === "waiting" ? (
                                <button
                                    onClick={() => handleWaitingAction(s, nextAction)}
                                    style={{ fontSize: "0.75rem", padding: "6px 12px", borderRadius: "6px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px", cursor: "help" }}
                                    className={`${getActionButtonClass(s.status, nextAction.tone)} hover:opacity-90`}
                                >
                                    {nextAction.label}
                                </button>
                            ) : (
                                <Link
                                    href={buildStudentActionHref(s)}
                                    style={{ fontSize: "0.75rem", padding: "6px 12px", borderRadius: "6px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}
                                    className={getActionButtonClass(s.status, nextAction.tone)}
                                >
                                    {nextAction.tone === "positive" ? <Sparkles size={12} /> : null}
                                    {nextAction.label}
                                </Link>
                            )
                        ) : (
                            <Link
                                href={`/workspace?studentId=${s.id}`}
                                style={{ fontSize: "0.75rem", padding: "6px 12px", background: "var(--bg-primary)", border: "1px solid var(--border-light)", borderRadius: "6px", color: "var(--text-secondary)", textDecoration: "none", fontWeight: 600 }}
                                className="transition-colors hover:bg-subtle-soft"
                            >
                                Open Workspace
                            </Link>
                        )}
                    </div>
                </td>
            </tr>
        );
    };

    const renderStudentCard = (s: StudentData) => {
        const ss = getStatusStyle(s.status);
        const nextAction = s.next_action;
        return (
            <div key={s.id} className="bg-card rounded-xl border border-line p-4 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col min-w-0">
                        <span className="text-xs font-mono text-faint mb-1">#{s.id}</span>
                        <Link href={`/workspace?studentId=${s.id}`} className="font-bold text-[var(--text-primary)] no-underline text-[1.1rem] hover:text-indigo-600 transition-colors truncate">
                            {s.first_name} {s.last_name}
                        </Link>
                        <span className="text-sm text-muted mt-1">{s.grade || "Grade TBD"}</span>
                    </div>
                    <span style={{ fontSize: "0.65rem", fontWeight: "bold", padding: "4px 8px", borderRadius: "12px", textTransform: "uppercase", background: ss.bg, color: ss.color, textAlign: "center", whiteSpace: "nowrap" }}>
                        {statusLabel(s.status)}
                    </span>
                </div>

                <div className="flex flex-col gap-2 border-t border-line pt-3">
                    <div className="flex flex-col gap-2">
                        <span className="text-faint font-semibold text-xs">
                            {["ENROLLED", "INTEGRATED"].includes(s.status.toUpperCase()) ? "Progress Trackers" : "Assessments"}
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {renderStudentFormPills(s)}
                        </div>
                    </div>
                </div>

                <div className="border-t border-line pt-3 flex flex-wrap gap-2 justify-end w-full">
                    {nextAction ? (
                        nextAction.tone === "waiting" ? (
                            <button
                                onClick={() => handleWaitingAction(s, nextAction)}
                                style={{ cursor: "help" }}
                                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-bold flex-1 justify-center hover:opacity-90 ${getActionButtonClass(s.status, nextAction.tone)}`}
                                title={nextAction.label}
                            >
                                {nextAction.label}
                            </button>
                        ) : (
                            <Link
                                href={buildStudentActionHref(s)}
                                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-bold flex-1 justify-center ${getActionButtonClass(s.status, nextAction.tone)}`}
                                title={nextAction.label}
                            >
                                {nextAction.tone === "positive" ? <Sparkles size={12} /> : null}
                                {nextAction.label}
                            </Link>
                        )
                    ) : (
                        <Link
                            href={`/workspace?studentId=${s.id}`}
                            className="text-xs px-3 py-1.5 rounded bg-app border border-line text-fg font-bold no-underline hover:bg-subtle-soft transition-colors flex-1 text-center"
                            title="Open Workspace"
                        >
                            Open Workspace
                        </Link>
                    )}
                </div>
            </div>
        );
    };

    /* ─── Filtered, Sorted, and Paginated Users ──────────────────────────── */

    const uniqueUserRoles = Array.from(new Set(users.map(u => u.role)));

    const processedUsers = users.filter(u => {
        // Fuzzy search logic (matches all words)
        const searchTerms = userSearch.toLowerCase().trim().split(/\s+/);
        const searchableString = `${u.first_name} ${u.last_name} ${u.email} `.toLowerCase();
        const matchesSearch = searchTerms.every(term => searchableString.includes(term));
        
        const matchesRole = !userRoleFilter || u.role === userRoleFilter;
        
        return matchesSearch && matchesRole;
    });

    // Sorting Logic
    if (userSortConfig.key && userSortConfig.direction) {
        processedUsers.sort((a, b) => {
            let aVal: any = '';
            let bVal: any = '';
            
            if (userSortConfig.key === 'name') {
                aVal = `${a.first_name} ${a.last_name}`.trim() || a.email;
                bVal = `${b.first_name} ${b.last_name}`.trim() || b.email;
            } else if (userSortConfig.key === 'role') {
                aVal = a.role;
                bVal = b.role;
            } else if (userSortConfig.key === 'kids') {
                aVal = a.assigned_students_count || 0;
                bVal = b.assigned_students_count || 0;
            }
            
            if (aVal < bVal) return userSortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return userSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // Aggregate view: one column per role when no single role is selected.
    const isAllRolesView = !userRoleFilter;
    const aggregateRoleOrder = ["TEACHER", "SPECIALIST", "PARENT", "ADMIN"];
    const userGroups = Array.from(new Set([...aggregateRoleOrder, ...uniqueUserRoles]))
        .map(role => ({
            role,
            label: role.charAt(0) + role.slice(1).toLowerCase(),
            style: roleColorHex(role),
            users: processedUsers.filter(u => u.role === role),
        }));
    const aggregateUserRowCount = Math.max(0, ...userGroups.map(g => g.users.length));

    // Pagination Logic
    const totalUserPages = (isAllRolesView
        ? Math.ceil(aggregateUserRowCount / userItemsPerPage)
        : Math.ceil(processedUsers.length / userItemsPerPage)) || 1;
    // ensure current page is within bounds
    const safeUserPage = Math.min(Math.max(1, userPage), totalUserPages);
    const userRowStart = (safeUserPage - 1) * userItemsPerPage;
    const paginatedUsers = processedUsers.slice(userRowStart, userRowStart + userItemsPerPage);
    const aggregateUserRowsOnPage = Math.max(0, Math.min(userItemsPerPage, aggregateUserRowCount - userRowStart));
    const visibleAggregateUserCount = userGroups.reduce(
        (n, g) => n + g.users.slice(userRowStart, userRowStart + userItemsPerPage).length, 0);

    /* ─── Filtered, Sorted, and Paginated Invitations ────────────────────── */

    const uniqueInvitationRoles = Array.from(new Set(invitations.map(i => i.role)));

    const processedInvitations = invitations.filter(i => {
        if (i.is_used) return false;
        const searchTerms = invitationSearch.toLowerCase().trim().split(/\s+/);
        const searchableString = `${i.email}`.toLowerCase();
        const matchesSearch = searchTerms.every(term => searchableString.includes(term));
        const matchesRole = invitationRoleFilters.length === 0 || invitationRoleFilters.includes(i.role);
        return matchesSearch && matchesRole;
    });

    if (invitationSortConfig.key && invitationSortConfig.direction) {
        processedInvitations.sort((a, b) => {
            let aVal: any = '';
            let bVal: any = '';
            if (invitationSortConfig.key === 'email') {
                aVal = a.email;
                bVal = b.email;
            } else if (invitationSortConfig.key === 'role') {
                aVal = a.role;
                bVal = b.role;
            } else if (invitationSortConfig.key === 'date') {
                aVal = new Date(a.created_at).getTime();
                bVal = new Date(b.created_at).getTime();
            }
            if (aVal < bVal) return invitationSortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return invitationSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    const totalInvitationPages = Math.ceil(processedInvitations.length / invitationItemsPerPage) || 1;
    const safeInvitationPage = Math.min(Math.max(1, invitationPage), totalInvitationPages);
    const paginatedInvitations = processedInvitations.slice((safeInvitationPage - 1) * invitationItemsPerPage, safeInvitationPage * invitationItemsPerPage);

    /* ─── Handlers ───────────────────────────────────────────────────────── */

    const handleStudentSort = (key: 'id' | 'name' | 'grade' | 'status') => {
        setStudentSortConfig(current => {
            if (current.key !== key) return { key, direction: 'asc' };
            if (current.direction === 'asc') return { key, direction: 'desc' };
            if (current.direction === 'desc') return { key: null, direction: null };
            return { key, direction: 'asc' };
        });
    };



    const handleInvitationSort = (key: 'email' | 'role' | 'date') => {
        setInvitationSortConfig(current => {
            if (current.key !== key) return { key, direction: 'asc' };
            if (current.direction === 'asc') return { key, direction: 'desc' };
            if (current.direction === 'desc') return { key: null, direction: null };
            return { key, direction: 'asc' };
        });
    };

    const toggleInvitationRoleFilter = (role: string) => {
        setInvitationRoleFilters(prev => 
            prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
        );
        setInvitationPage(1);
    };

    const handleUserSort = (key: 'name' | 'role' | 'kids') => {
        setUserSortConfig(current => {
            if (current.key !== key) return { key, direction: 'asc' };
            if (current.direction === 'asc') return { key, direction: 'desc' };
            if (current.direction === 'desc') return { key: null, direction: null };
            return { key, direction: 'asc' };
        });
    };

    const toggleUserRoleFilter = (role: string) => {
        setUserRoleFilter(prev => prev === role ? "" : role);
        setUserPage(1); // Reset pagination on re-filter
    };
    
    useEffect(() => {
        setUserPage(1);
    }, [userSearch, userItemsPerPage]);
    
    useEffect(() => {
        setStudentPage(1);
    }, [studentSearch, studentGradeFilter, studentItemsPerPage]);
    
    useEffect(() => {
        setInvitationPage(1);
    }, [invitationSearch, invitationItemsPerPage]);



    const [invitingUser, setInvitingUser] = useState(false);
    const handleInviteUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setInvitingUser(true);
        try {
            const issuedEmail = inviteEmail;
            if (inviteRole === 'PARENT') {
                await api.post("/api/students/", { parent_email: inviteEmail });
                toast.success("Student registered, parent invited.");
            } else {
                const response = await api.post("/api/invitations/", {
                    email: inviteEmail,
                    role: inviteRole,
                    specialties: inviteRole === 'SPECIALIST' ? inviteSpecialties : [],
                    grade_level: inviteRole === 'TEACHER' ? inviteGradeLevel : '',
                });
                toast.success(`Invite sent to ${issuedEmail}.`);
                if (response.data?.token) {
                    setCreatedInvite({ email: issuedEmail, token: response.data.token });
                }
            }
            setShowInviteModal(false);
            setInviteEmail('');
            setInviteRole('PARENT');
            setInviteSpecialties([]);
            setInviteGradeLevel('');
            fetchData();
        } catch (err: any) {
            toast.error(extractApiError(err, "Action failed."));
        } finally {
            setInvitingUser(false);
        }
    };

    const handleConfirmDeleteUser = async () => {
        if (!userToDelete) return;
        if (deleteConfirmText !== userToDelete.email) {
            setDeleteError("Email does not match.");
            return;
        }

        try {
            setDeleteError("");
            await api.delete(`/api/users/${userToDelete.id}/`);
            setUserToDelete(null);
            setDeleteConfirmText("");
            fetchData();
        } catch (err: any) {
            setDeleteError(err.response?.data?.error || err.response?.data?.detail || err.message || "Failed to delete user.");
        }
    };

    const handleConfirmRevokeInvite = async () => {
        if (!inviteToRevoke) return;
        setInviteActionLoading(true);
        try {
            const revokedInvite = inviteToRevoke;
            await api.delete(`/api/invitations/${inviteToRevoke.id}/`);
            setInvitations(prev => prev.filter(inv => inv.id !== revokedInvite.id));
            setInviteToRevoke(null);
            toast.success(`Invite revoked.`);
        } catch (err: any) {
            toast.error(extractApiError(err, "Couldn't revoke invite."));
        } finally {
            setInviteActionLoading(false);
        }
    };

    const handleConfirmResendInvite = async () => {
        if (!inviteToResend) return;
        setInviteActionLoading(true);
        try {
            const res = await api.post(`/api/invitations/${inviteToResend.id}/resend/`);
            toast.success(`Invite resent.`);
            const refreshedToken = res.data?.token;
            const email = inviteToResend.email;
            setInviteToResend(null);
            if (refreshedToken) {
                setCreatedInvite({ email, token: refreshedToken });
            }
            fetchData();
        } catch (err: any) {
            toast.error(extractApiError(err, "Couldn't resend invite."));
        } finally {
            setInviteActionLoading(false);
        }
    };

    /* ─── Analytics Metrics ──────────────────────────────────────────────── */
    const totalStudents = students.filter(s => s.status !== 'ARCHIVED').length;
    const activeStudents = students.filter(s => s.status === 'ENROLLED').length;
    const scheduledStudents = students.filter(s => s.status === 'ASSESSMENT_SCHEDULED').length;
    const reviewStudents = students.filter(s => s.status === 'ASSESSED').length;
    const pendingStudents = students.filter(s => s.status === 'PENDING_ASSESSMENT').length;
    const archivedStudents = students.filter(s => s.status === 'ARCHIVED').length;
    const inProgressStudents = scheduledStudents + reviewStudents;

    const pendingInvitations = invitations.filter(i => !i.is_used);
    const expiredInvitations = pendingInvitations.filter(i => getExpiryDisplay(i.expires_at).isExpired);
    const validPendingInvitations = pendingInvitations.filter(i => !getExpiryDisplay(i.expires_at).isExpired);
    const expiringSoonInvitations = pendingInvitations.filter(i => {
        const expiryTime = new Date(i.expires_at).getTime();
        const nowTime = Date.now();
        return expiryTime > nowTime && expiryTime - nowTime <= 24 * 60 * 60 * 1000;
    });

    const adminUsers = users.filter(u => u.role === 'ADMIN');
    const teacherUsers = users.filter(u => u.role === 'TEACHER');
    const specialistUsers = users.filter(u => u.role === 'SPECIALIST');
    const parentUsers = users.filter(u => u.role === 'PARENT');
    const instructionalStaff = users.filter(u => u.role === 'TEACHER' || u.role === 'SPECIALIST');
    const staffSortedByCaseload = [...instructionalStaff].sort((a, b) => (b.assigned_students_count || 0) - (a.assigned_students_count || 0));
    const unassignedStaff = instructionalStaff.filter(u => (u.assigned_students_count || 0) === 0);
    const specialistsWithoutSpecialty = specialistUsers.filter(u => !((u.specialties && u.specialties.length > 0) || u.specialty));
    const teachersWithoutGradeLevel = teacherUsers.filter(u => !u.grade_level);
    const averageCaseload = instructionalStaff.length
        ? instructionalStaff.reduce((sum, user) => sum + (user.assigned_students_count || 0), 0) / instructionalStaff.length
        : 0;

    const actionCounts = dashboardActions.reduce((acc, action) => {
        acc[action.type] += 1;
        return acc;
    }, { positive: 0, info: 0, warning: 0 });

    const watchlistItems = [
        ...expiringSoonInvitations.slice(0, 2).map(invite => {
            const expiry = getExpiryDisplay(invite.expires_at);
            return {
                id: `invite-${invite.id}`,
                title: `Invitation expiring soon: ${invite.email}`,
                description: `${toTitleCase(invite.role)} access expires ${expiry.label.toLowerCase()}.`,
                link: "/dashboard?tab=invitations",
                cta: "Review invites",
                tone: 'info' as const,
            };
        }),
        ...(specialistsWithoutSpecialty.length > 0 ? [{
            id: 'missing-specialty',
            title: `${specialistsWithoutSpecialty.length} specialist account${specialistsWithoutSpecialty.length === 1 ? '' : 's'} missing discipline`,
            description: "Add specialties to keep assignments accurate.",
            link: "/dashboard?tab=users",
            cta: "Review users",
            tone: 'info' as const,
        }] : []),
        ...(teachersWithoutGradeLevel.length > 0 ? [{
            id: 'missing-grade-level',
            title: `${teachersWithoutGradeLevel.length} teacher account${teachersWithoutGradeLevel.length === 1 ? '' : 's'} missing grade level`,
            description: "Assign grade levels so students get matched to the right teacher.",
            link: "/dashboard?tab=users",
            cta: "Review users",
            tone: 'info' as const,
        }] : []),
    ].slice(0, 5);

    const adminActionSummary = (() => {
        const parts: string[] = [];
        if (expiringSoonInvitations.length > 0) parts.push(`${expiringSoonInvitations.length} invite${expiringSoonInvitations.length === 1 ? "" : "s"} expiring soon`);
        if (reviewStudents > 0) parts.push(`${reviewStudents} awaiting enrollment review`);
        if (actionCounts.warning > 0) parts.push(`${actionCounts.warning} urgent action${actionCounts.warning === 1 ? "" : "s"}`);
        if (parts.length === 0) return "Everything is on track.";
        return `You have ${parts.slice(0, 2).join(" and ")}.`;
    })();

    return (
        <>
            {/* Desktop heading */}
            <div className="hidden md:block mb-6">
                <h2 className="m-0 text-3xl font-bold text-fg">
                    {getTimeGreeting()}, {authUser?.first_name || "Admin"}
                </h2>
                <p className="mt-2 text-base text-muted">
                    {activeTab === "analytics" && adminActionSummary}
                    {activeTab === "students" && `Manage all registered students. ${students.length} total records.`}
                    {activeTab === "users" && `Manage active system users. Showing ${processedUsers.length} of ${users.length}.`}
                    {activeTab === "invitations" && `Manage user registrations and track pending invitations. Showing ${processedInvitations.length} of ${pendingInvitations.length}.`}
                </p>
            </div>
                {/* Desktop only: card wrapper. Mobile: px-4 content padding */}
                <div className={`p-4 sm:p-6 md:p-8 md:glass-panel md:bg-card md:rounded-xl md:border md:border-line ${activeTab === "students" ? "" : "md:min-h-[60vh]"}`}>
                    {/* Mobile-only title */}
                    <div className="md:hidden mb-5">
                        <h2 className="m-0 text-xl font-bold text-fg">
                            {activeTab === "analytics" && "Analytics Dashboard"}
                            {activeTab === "students" && <>Student Roster <span className="text-base font-normal text-faint">({processedStudents.length})</span></>}
                            {activeTab === "users" && <>System Users <span className="text-base font-normal text-faint">({processedUsers.length})</span></>}
                            {activeTab === "invitations" && <>Registration <span className="text-base font-normal text-faint">({processedInvitations.length})</span></>}
                        </h2>
                        <p className="m-0 mt-1 text-sm text-faint">
                            {activeTab === "analytics" && "Live pipeline health, actions, staffing coverage, and invitation risk."}
                            {activeTab === "students" && "Manage all registered students in the system."}
                            {activeTab === "users" && "Manage active system users and clinical roles."}
                            {activeTab === "invitations" && "Manage user registrations and track pending invitations."}
                        </p>
                    </div>
                    {loading ? (
                        <p>Loading database...</p>
                    
) : activeTab === "analytics" ? (
                        <div key="analytics-tab" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                            
                            {/* Sleek Action Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-card text-fg rounded-2xl shadow-sm border border-line">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                                        <Zap className="h-5 w-5" aria-hidden="true" />
                                    </div>
                                    <div>
                                        <h3 className="m-0 text-base font-extrabold text-fg">Quick Actions</h3>
                                        <p className="m-0 text-xs text-muted">Most-used admin tasks</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowInviteModal(true)}
                                        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-500 border border-indigo-500"
                                    >
                                        <UserPlus className="h-4 w-4" aria-hidden="true" />
                                        Registration
                                    </button>
                                </div>
                            </div>

                            {/* Top Row: Urgent & Pending Tasks + KPIs */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                
                                {/* Urgent & Pending Tasks (Action Center + Watchlist combined) */}
                                <div className="lg:col-span-2 flex flex-col bg-card rounded-2xl border border-danger-line shadow-sm overflow-hidden">
                                    <div className="bg-danger-soft border-b border-danger-line p-4 sm:p-5 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger shadow-inner">
                                                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                            </div>
                                            <div>
                                                <h3 className="m-0 text-lg font-extrabold text-fg">Needs Attention</h3>
                                                <p className="m-0 text-sm text-muted">Urgent actions, pending tasks, and watchlist items.</p>
                                            </div>
                                        </div>
                                        <div className="hidden sm:flex gap-2">
                                            <span className="text-xs font-bold text-danger bg-danger-soft px-3 py-1 rounded-full border border-danger-line">{actionCounts.warning} urgent</span>
                                            <span className="text-xs font-bold text-info bg-info-soft px-3 py-1 rounded-full border border-info-line">{actionCounts.info} queued</span>
                                        </div>
                                    </div>
                                    <div className="p-4 sm:p-5 flex-1 max-h-[400px] overflow-y-auto bg-app/50">
                                        {dashboardActions.length === 0 && watchlistItems.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-full text-center py-8">
                                                <div className="w-16 h-16 bg-success-soft text-success rounded-full flex items-center justify-center mb-3 shadow-sm">
                                                    <Sparkles className="w-8 h-8" />
                                                </div>
                                                <p className="font-bold text-fg m-0 text-lg">You're all caught up!</p>
                                                <p className="text-sm text-muted mt-1 mb-0">No pending actions required right now.</p>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-3">
                                                {/* Actions */}
                                                {dashboardActions.map(action => {
                                                    const actionStyle = getActionTypeStyle(action.type);
                                                    const toneKey = action.type === "positive" ? "success" : action.type === "warning" ? "warning" : "info";
                                                    return (
                                                        <div key={action.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl shadow-sm" style={{ backgroundColor: actionStyle.bg, border: `1px solid ${actionStyle.border}` }}>
                                                            <div>
                                                                <p className="m-0 text-sm font-bold" style={{ color: actionStyle.title }}>{action.title}</p>
                                                                <p className="mt-1 mb-0 text-xs" style={{ color: actionStyle.body }}>{action.description}</p>
                                                            </div>
                                                            {isSafeActionLink(action.link) ? (
                                                                <Link href={action.link} className={getCardButtonClass(toneKey)}>
                                                                    {action.action_text}
                                                                </Link>
                                                            ) : (
                                                                <span className="shrink-0 text-center text-xs italic text-faint px-4 py-2" title="Action link unavailable">Unavailable</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                
                                                {/* Watchlist Items */}
                                                {watchlistItems.map(item => {
                                                    const toneKey = (item.tone as string) === 'warning' ? "warning" : "info";
                                                    const tone = toneKey === 'warning' ? { bg: 'var(--bg-warning-light)', border: '#fde68a', title: 'var(--text-warning)', body: 'var(--text-warning)' } : { bg: '#eff6ff', border: '#bfdbfe', title: 'var(--text-info)', body: 'var(--text-info)' };
                                                    return (
                                                        <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl shadow-sm" style={{ backgroundColor: tone.bg, border: `1px solid ${tone.border}` }}>
                                                            <div>
                                                                <p className="m-0 text-sm font-bold" style={{ color: tone.title }}>{item.title}</p>
                                                                <p className="mt-1 mb-0 text-xs" style={{ color: tone.body }}>{item.description}</p>
                                                            </div>
                                                            {isSafeActionLink(item.link) ? (
                                                                <Link href={item.link} className={getCardButtonClass(toneKey)}>
                                                                    {item.cta} &rarr;
                                                                </Link>
                                                            ) : (
                                                                <span className="shrink-0 text-center text-xs italic text-faint px-4 py-2">Unavailable</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Condense KPIs */}
                                <div className="flex flex-col gap-3">
                                    <div className="rounded-2xl border border-indigo-100 bg-card p-4 shadow-sm flex items-center justify-between transition-[border-color,box-shadow] duration-200 hover:border-indigo-300 hover:shadow-md group">
                                        <div>
                                            <p className="m-0 text-[10px] font-bold uppercase tracking-widest text-indigo-500">Active Students</p>
                                            <p className="mt-1 mb-0 text-2xl font-extrabold text-fg group-hover:text-indigo-600 transition-colors">{totalStudents}</p>
                                            <p className="mt-1 text-xs font-medium text-muted mb-0">{activeStudents} enrolled &middot; {archivedStudents} archived</p>
                                        </div>
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-200">
                                            <UsersIcon className="h-5 w-5" />
                                        </div>
                                    </div>
                                    
                                    <div className="rounded-2xl border border-warning-line bg-card p-4 shadow-sm flex items-center justify-between transition-[border-color,box-shadow] duration-200 hover:border-warning-line hover:shadow-md group">
                                        <div>
                                            <p className="m-0 text-[10px] font-bold uppercase tracking-widest text-warning">Awaiting Assess</p>
                                            <p className="mt-1 mb-0 text-2xl font-extrabold text-fg group-hover:text-warning transition-colors">{pendingStudents}</p>
                                            <p className="mt-1 text-xs font-medium text-muted mb-0">Intake / Scheduling</p>
                                        </div>
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-md shadow-amber-200">
                                            <Clock className="h-5 w-5" />
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-sky-100 bg-card p-4 shadow-sm flex items-center justify-between transition-[border-color,box-shadow] duration-200 hover:border-sky-300 hover:shadow-md group">
                                        <div>
                                            <p className="m-0 text-[10px] font-bold uppercase tracking-widest text-sky-600">Awaiting Enroll</p>
                                            <p className="mt-1 mb-0 text-2xl font-extrabold text-fg group-hover:text-sky-600 transition-colors">{reviewStudents}</p>
                                            <p className="mt-1 text-xs font-medium text-muted mb-0">Ready for decision</p>
                                        </div>
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-500 text-white shadow-md shadow-sky-200">
                                            <ClipboardList className="h-5 w-5" />
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-pink-100 bg-card p-4 shadow-sm flex items-center justify-between transition-[border-color,box-shadow] duration-200 hover:border-pink-300 hover:shadow-md group">
                                        <div>
                                            <p className="m-0 text-[10px] font-bold uppercase tracking-widest text-pink-600">Pending Invites</p>
                                            <p className="mt-1 mb-0 text-2xl font-extrabold text-fg group-hover:text-pink-600 transition-colors">{validPendingInvitations.length}</p>
                                            <p className="mt-1 text-xs font-medium text-muted mb-0">{expiringSoonInvitations.length} expiring in 24h</p>
                                        </div>
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-pink-400 to-pink-500 text-white shadow-md shadow-pink-200">
                                            <Mail className="h-5 w-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Middle Row: Funnel and Team Capacity */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                
                                {/* Student Workflow Snapshot (Horizontal Funnel) */}
                                <div className="bg-card rounded-2xl border border-line shadow-sm p-6 flex flex-col hover:shadow-md transition-shadow">
                                    <div className="mb-6">
                                        <h3 className="m-0 text-lg font-extrabold text-fg">Student Pipeline</h3>
                                        <p className="m-0 mt-1 text-sm text-muted">Live view of where students sit in the enrollment flow.</p>
                                    </div>
                                    
                                    <div className="flex flex-col gap-4 mt-auto mb-auto">
                                        {/* Horizontal bar representation */}
                                        <div className="relative pt-6">
                                            <div className="flex justify-between text-[10px] font-bold text-faint uppercase tracking-wider mb-2 px-2">
                                                <span>Assess</span>
                                                <span>Schedule</span>
                                                <span>Review</span>
                                                <span>Enrolled</span>
                                            </div>
                                            <div className="flex h-12 w-full rounded-full overflow-hidden border border-line bg-subtle-soft shadow-inner">
                                                <div style={{ width: `${totalStudents ? (pendingStudents / totalStudents) * 100 : 0}%`, transition: "width 1s ease-out" }} className="bg-warning-solid h-full flex items-center justify-center text-xs font-bold text-white" title="Pending Assessment">
                                                    {pendingStudents > 0 ? pendingStudents : ""}
                                                </div>
                                                <div style={{ width: `${totalStudents ? (scheduledStudents / totalStudents) * 100 : 0}%`, transition: "width 1s ease-out" }} className="bg-sky-400 h-full flex items-center justify-center text-xs font-bold text-white" title="Pending Assessment">
                                                    {scheduledStudents > 0 ? scheduledStudents : ""}
                                                </div>
                                                <div style={{ width: `${totalStudents ? (reviewStudents / totalStudents) * 100 : 0}%`, transition: "width 1s ease-out" }} className="bg-indigo-400 h-full flex items-center justify-center text-xs font-bold text-white" title="Awaiting Review">
                                                    {reviewStudents > 0 ? reviewStudents : ""}
                                                </div>
                                                <div style={{ width: `${totalStudents ? (activeStudents / totalStudents) * 100 : 0}%`, transition: "width 1s ease-out" }} className="bg-success-solid h-full flex items-center justify-center text-xs font-bold text-white" title="Enrolled">
                                                    {activeStudents > 0 ? activeStudents : ""}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                                            <div className="flex items-center gap-2 bg-app px-3 py-2 rounded-lg border border-line">
                                                <div className="w-3 h-3 rounded-full bg-warning-solid shrink-0"></div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-faint uppercase">Pending</span>
                                                    <span className="text-sm font-extrabold text-fg">{pendingStudents}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 bg-app px-3 py-2 rounded-lg border border-line">
                                                <div className="w-3 h-3 rounded-full bg-sky-400 shrink-0"></div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-faint uppercase">Scheduled</span>
                                                    <span className="text-sm font-extrabold text-fg">{scheduledStudents}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 bg-app px-3 py-2 rounded-lg border border-line">
                                                <div className="w-3 h-3 rounded-full bg-indigo-400 shrink-0"></div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-faint uppercase">Review</span>
                                                    <span className="text-sm font-extrabold text-fg">{reviewStudents}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 bg-app px-3 py-2 rounded-lg border border-line">
                                                <div className="w-3 h-3 rounded-full bg-success-solid shrink-0"></div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-faint uppercase">Enrolled</span>
                                                    <span className="text-sm font-extrabold text-fg">{activeStudents}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-6 pt-4 border-t border-line flex justify-between items-center bg-app p-4 rounded-xl">
                                        <span className="text-sm font-medium text-fg">{inProgressStudents} students actively moving through evaluation.</span>
                                        <Link href="/dashboard?tab=students" className="text-sm font-bold text-indigo-600 hover:text-indigo-700 no-underline whitespace-nowrap">
                                            Open roster &rarr;
                                        </Link>
                                    </div>
                                </div>

                                {/* Team Capacity Chart */}
                                <div className="bg-card rounded-2xl border border-line shadow-sm p-6 flex flex-col hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h3 className="m-0 text-lg font-extrabold text-fg">Team Capacity</h3>
                                            <p className="m-0 mt-1 text-sm text-muted">Average caseload: <span className="font-bold text-fg">{averageCaseload.toFixed(1)} students</span></p>
                                        </div>
                                        {unassignedStaff.length > 0 && (
                                            <div className="px-3 py-1 rounded-full bg-success-soft text-success text-xs font-bold border border-success-line">
                                                {unassignedStaff.length} staff available
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="flex-1 flex flex-col justify-end">
                                        {/* Visual Bar Chart for Caseloads */}
                                        <div className="space-y-4">
                                            <p className="text-[10px] font-bold text-faint uppercase tracking-wider m-0">Top Caseloads</p>
                                            {staffSortedByCaseload.slice(0, 4).map(staff => {
                                                const maxCaseload = Math.max(1, staffSortedByCaseload[0]?.assigned_students_count || 1);
                                                const pct = (staff.assigned_students_count / maxCaseload) * 100;
                                                // Color changes depending on load
                                                const barColor = pct > 80 ? "bg-danger-solid" : pct > 50 ? "bg-warning-solid" : "bg-success-solid";
                                                
                                                return (
                                                    <div key={staff.id} className="flex flex-col gap-1.5">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="font-bold text-fg truncate w-40">{staff.first_name} {staff.last_name}</span>
                                                            <span className="font-extrabold text-fg">{staff.assigned_students_count}</span>
                                                        </div>
                                                        <div className="h-2.5 w-full bg-subtle-soft rounded-full overflow-hidden shadow-inner">
                                                            <div className={`${barColor} h-full rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {staffSortedByCaseload.length === 0 && (
                                                <p className="text-sm text-muted italic">No instructional staff assigned yet.</p>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {specialistsWithoutSpecialty.length > 0 && (
                                        <div className="mt-6 p-3 bg-info-soft border border-info-line rounded-xl flex items-start gap-3">
                                            <div className="mt-0.5 text-info">
                                                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-info m-0">{specialistsWithoutSpecialty.length} specialist(s) missing specialty</p>
                                                <p className="text-xs text-info mt-0.5 mb-0">Update their profiles for better assignment tracking.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>
                        </div>
                    ) : activeTab === "students" ? (

                        <div>
                            <div className="flex flex-col lg:flex-row justify-between gap-4 mb-4 items-start">
                                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center w-full lg:flex-1 min-w-0">
                                    <div className="relative w-full md:flex-1 md:max-w-[420px]">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                                        <input
                                            type="text"
                                            placeholder="Search by name or ID..."
                                            value={studentSearch}
                                            onChange={e => setStudentSearch(e.target.value)}
                                            style={{
                                                width: "100%",
                                                padding: "8px 12px 8px 36px",
                                                borderRadius: "6px",
                                                border: "1px solid var(--border-light)",
                                                fontSize: "0.9rem",
                                                height: "38px",
                                                outline: "none",
                                                boxSizing: "border-box",
                                                background: "var(--bg-secondary)",
                                            }}
                                        />
                                    </div>
                                    <CustomSelect
                                        size="sm"
                                        className="w-44 shrink-0"
                                        triggerClassName="h-[38px] rounded-md px-3 text-[0.85rem] font-medium"
                                        ariaLabel="Filter students by grade"
                                        value={studentGradeFilter}
                                        onChange={setStudentGradeFilter}
                                        options={[
                                            { value: "ALL", label: "All grades" },
                                            ...uniqueGrades.map(grade => ({ value: grade, label: grade })),
                                        ]}
                                    />
                                    {studentSearch && (
                                        <button
                                            onClick={() => setStudentSearch('')}
                                            className="h-[38px] whitespace-nowrap rounded-md border border-line bg-card px-3 text-xs font-bold text-muted transition-colors duration-200 hover:border-line hover:bg-app hover:text-fg"
                                            style={{ cursor: 'pointer' }}
                                        >
                                            Clear Search
                                        </button>
                                    )}
                                </div>
                                <div className="w-full md:w-auto flex items-center shrink-0">
                                    <button onClick={() => setShowInviteModal(true)} className="btn-primary w-full md:w-auto" style={{ padding: "8px 16px", height: "38px", whiteSpace: "nowrap" }}>
                                        + Registration
                                    </button>
                                </div>
                            </div>

                            <div className="w-full bg-card rounded-xl border border-line shadow-sm overflow-hidden">
                                <div className="border-b border-line bg-app/70 px-4 py-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        {statusFilterOptions.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {statusFilterOptions.map(option => {
                                                    const isActive = effectiveStatusTab === option.status;
                                                    return (
                                                        <button
                                                            key={option.status}
                                                            onClick={() => { setActiveStatusTab(option.status); setStudentPage(1); }}
                                                            aria-pressed={isActive}
                                                            className={`flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 text-xs font-bold transition-colors duration-200 ${isActive ? 'shadow-sm' : 'border-line bg-card text-muted hover:border-line hover:bg-app hover:text-fg'}`}
                                                            style={isActive ? { background: option.style.bg, borderColor: option.style.color, color: option.style.color, cursor: 'pointer' } : { cursor: 'pointer' }}
                                                        >
                                                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: option.style.color }} />
                                                            <span className="uppercase">{option.label}</span>
                                                            <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${isActive ? 'bg-card/75' : 'bg-subtle-soft text-muted'}`}>
                                                                {option.count}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {students.length > 10 && (
                                            <div className="flex items-center gap-2 text-xs font-medium text-muted shrink-0">
                                                <span>Show</span>
                                                <CustomSelect
                                                    size="sm"
                                                    className="w-20"
                                                    triggerClassName="h-8 rounded-md px-2 text-sm font-medium"
                                                    ariaLabel="Students per page"
                                                    value={String(studentItemsPerPage)}
                                                    onChange={(v) => setStudentItemsPerPage(Number(v))}
                                                    options={PAGE_SIZE_OPTIONS}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="p-0">
                                    {processedStudents.length === 0 ? (
                                        <div className="p-8">
                                            <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 1rem", background: "var(--bg-primary)", borderRadius: "8px", border: "1px dashed var(--text-muted)", margin: 0 }}>
                                                {students.length === 0
                                                    ? "No students in the system yet."
                                                    : studentSearch
                                                        ? `No ${activeStatusLabel.toLowerCase()} students match "${studentSearch}". Try a different search term.`.replace(/\s+/g, " ")
                                                        : `No ${activeStatusLabel.toLowerCase()} students to show.`.replace(/\s+/g, " ")}
                                            </p>
                                        </div>
                                    ) : isAllStatusView ? (
                                        <div style={{ overflowX: "auto", width: "100%" }}>
                                            <table style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse", tableLayout: "fixed", textAlign: "left" }}>
                                                <thead>
                                                    <tr>
                                                        {studentGroups.map((group, i) => (
                                                            <th key={group.status} style={{ padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)", borderRight: i < studentGroups.length - 1 ? "1px solid var(--border-light)" : undefined }}>
                                                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: group.style.color, flexShrink: 0 }} />
                                                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</span>
                                                                    <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>{group.students.length}</span>
                                                                </div>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {aggregateRowCount === 0 ? (
                                                        <tr>
                                                            <td colSpan={studentGroups.length} style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                                                                No students match the current filters.
                                                            </td>
                                                        </tr>
                                                    ) : Array.from({ length: aggregateRowsOnPage }).map((_, offset) => {
                                                        const rowIndex = studentRowStart + offset;
                                                        return (
                                                        <tr key={rowIndex} style={{ borderBottom: "1px solid var(--border-light)", verticalAlign: "middle" }}>
                                                            {studentGroups.map((group, i) => {
                                                                const s = group.students[rowIndex];
                                                                return (
                                                                    <td key={group.status} style={{ padding: "12px", borderRight: i < studentGroups.length - 1 ? "1px solid var(--border-light)" : undefined, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                                        {s ? (
                                                                            <Link href={`/workspace?studentId=${s.id}`} className="hover:text-indigo-600 hover:underline transition-colors duration-200" style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: "bold", fontSize: "0.95rem" }}>
                                                                                {s.first_name} {s.last_name}
                                                                            </Link>
                                                                        ) : null}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="hidden md:block" style={{ overflowX: "auto", width: "100%" }}>
                                                <table style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse", textAlign: "left" }}>
                                            <thead>
                                                <tr>
                                                    <th onClick={() => handleStudentSort('id')} style={{ cursor: "pointer", padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            ID
                                                            <span style={{ opacity: studentSortConfig.key === 'id' ? 1 : 0.3 }}>
                                                                {studentSortConfig.key === 'id' ? (studentSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleStudentSort('name')} style={{ cursor: "pointer", padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            STUDENT
                                                            <span style={{ opacity: studentSortConfig.key === 'name' ? 1 : 0.3 }}>
                                                                {studentSortConfig.key === 'name' ? (studentSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleStudentSort('grade')} style={{ cursor: "pointer", padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            GRADE
                                                            <span style={{ opacity: studentSortConfig.key === 'grade' ? 1 : 0.3 }}>
                                                                {studentSortConfig.key === 'grade' ? (studentSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th style={{ padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)" }}>
                                                        {["ENROLLED", "INTEGRATED"].includes(effectiveStatusTab.toUpperCase()) ? "FORMS STATUS (PROGRESS)" : "FORMS STATUS (ASSESSMENT)"}
                                                    </th>
                                                    <th style={{ padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)" }}>ACTION</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedStudents.map(s => renderStudentRow(s))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="md:hidden flex flex-col gap-3 p-3 bg-app/50">
                                        {paginatedStudents.map(s => renderStudentCard(s))}
                                    </div>
                                </>
                            )}
                                </div>
                            </div>
                            
                            {/* Pagination Controls */}
                            {processedStudents.length > 0 && totalStudentPages > 1 && (
                                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "1rem" }}>
                                    <button 
                                        onClick={() => setStudentPage(p => Math.max(1, p - 1))} 
                                        disabled={safeStudentPage === 1}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-light)", background: safeStudentPage === 1 ? "var(--bg-primary)" : "var(--bg-card)", color: safeStudentPage === 1 ? "var(--text-muted)" : "inherit", cursor: safeStudentPage === 1 ? "not-allowed" : "pointer" }}
                                    >Previous</button>
                                    <span style={{ padding: "6px 12px", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                                        Page {safeStudentPage} of {totalStudentPages}
                                    </span>
                                    <button 
                                        onClick={() => setStudentPage(p => Math.min(totalStudentPages, p + 1))} 
                                        disabled={safeStudentPage === totalStudentPages}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-light)", background: safeStudentPage === totalStudentPages ? "var(--bg-primary)" : "var(--bg-card)", color: safeStudentPage === totalStudentPages ? "var(--text-muted)" : "inherit", cursor: safeStudentPage === totalStudentPages ? "not-allowed" : "pointer" }}
                                    >Next</button>
                                </div>
                            )}
                        </div>
                    ) : activeTab === "users" ? (
                        <div>
                            {/* Action Bar (Search, Filters, Button) */}
                            <div className="flex flex-col lg:flex-row justify-between gap-4 mb-5 items-start">
                                <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center w-full lg:flex-1 min-w-0">
                                    <div className="relative w-full md:flex-1 md:max-w-[400px]">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                                        <input
                                            type="text"
                                            placeholder="Search by name or email..."
                                            value={userSearch}
                                            onChange={e => setUserSearch(e.target.value)}
                                            style={{
                                                width: "100%",
                                                padding: "8px 12px 8px 36px",
                                                borderRadius: "6px",
                                                border: "1px solid var(--border-light)",
                                                fontSize: "0.9rem",
                                                height: "38px",
                                                outline: "none",
                                                boxSizing: "border-box",
                                                background: "var(--bg-primary)",
                                            }}
                                        />
                                    </div>
                                    <div className="flex gap-2 items-center overflow-x-auto w-full md:w-auto pb-1 md:pb-0" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                                        <button
                                            onClick={() => { setUserRoleFilter(""); setUserPage(1); }}
                                            style={{
                                                padding: "6px 14px",
                                                borderRadius: "20px",
                                                border: `1px solid ${isAllRolesView ? 'var(--accent-primary)' : 'var(--border-light)'}`,
                                                fontSize: "0.8rem",
                                                fontWeight: isAllRolesView ? 600 : 400,
                                                background: isAllRolesView ? '#eff6ff' : 'var(--bg-primary)',
                                                color: isAllRolesView ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                                cursor: "pointer",
                                                transition: "all 0.2s",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            ALL USERS
                                        </button>
                                        {uniqueUserRoles.map(r => {
                                            const isActive = userRoleFilter === r;
                                            return (
                                                <button
                                                    key={r}
                                                    onClick={() => toggleUserRoleFilter(r)}
                                                    style={{
                                                        padding: "6px 14px",
                                                        borderRadius: "20px",
                                                        border: `1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-light)'}`,
                                                        fontSize: "0.8rem",
                                                        fontWeight: isActive ? 600 : 400,
                                                        background: isActive ? '#eff6ff' : 'var(--bg-primary)',
                                                        color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                                        cursor: "pointer",
                                                        transition: "all 0.2s"
                                                    }}
                                                >
                                                    {r}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                            
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                                <span>Showing {isAllRolesView ? visibleAggregateUserCount : Math.min(processedUsers.length, paginatedUsers.length)} of {processedUsers.length} users</span>
                                {users.length > 10 && (
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                        <span>Show:</span>
                                        <CustomSelect
                                            size="sm"
                                            className="w-20"
                                            triggerClassName="h-8 rounded-md px-2 text-sm font-medium"
                                            ariaLabel="Users per page"
                                            value={String(userItemsPerPage)}
                                            onChange={(v) => setUserItemsPerPage(Number(v))}
                                            options={PAGE_SIZE_OPTIONS}
                                        />
                                    </div>
                                )}
                            </div>

                            {processedUsers.length === 0 ? (
                                <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 1rem", background: "var(--bg-primary)", borderRadius: "8px", border: "1px dashed var(--text-muted)" }}>
                                    {users.length === 0
                                        ? "No users in the system yet."
                                        : userSearch && userRoleFilter
                                            ? `No users match "${userSearch}" with the selected role filters. Try clearing one.`
                                            : userSearch
                                                ? `No users match "${userSearch}". Try a different search term.`
                                                : userRoleFilter
                                                    ? `No users match the selected role filters.`
                                                    : "No users to show."}
                                </p>
                            ) : isAllRolesView ? (
                                <div style={{ overflowX: "auto", width: "100%", borderRadius: "12px", border: "2px solid var(--border-light)" }}>
                                    <table style={{ width: "100%", minWidth: "800px", borderCollapse: "collapse", tableLayout: "fixed", textAlign: "left" }}>
                                        <thead>
                                            <tr>
                                                {userGroups.map((group, i) => (
                                                    <th key={group.role} style={{ padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)", borderRight: i < userGroups.length - 1 ? "1px solid var(--border-light)" : undefined }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: group.style.color, flexShrink: 0 }} />
                                                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.label}</span>
                                                            <span style={{ marginLeft: "auto" }}>{group.users.length}</span>
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {aggregateUserRowCount === 0 ? (
                                                <tr>
                                                    <td colSpan={userGroups.length} style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                                                        No users match the current filters.
                                                    </td>
                                                </tr>
                                            ) : Array.from({ length: aggregateUserRowsOnPage }).map((_, offset) => {
                                                const rowIndex = userRowStart + offset;
                                                return (
                                                <tr key={rowIndex} style={{ borderBottom: "1px solid var(--border-light)", verticalAlign: "middle" }} className="hover:bg-subtle-soft transition-colors duration-150">
                                                    {userGroups.map((group, i) => {
                                                        const u = group.users[rowIndex];
                                                        const displayName = u ? ((u.first_name || u.last_name) ? `${u.first_name} ${u.last_name}`.trim() : u.email) : "";
                                                        return (
                                                            <td key={group.role} style={{ padding: "12px", borderRight: i < userGroups.length - 1 ? "1px solid var(--border-light)" : undefined, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                                {u ? (
                                                                    <Link href={`/users/${u.id}`} className="hover:text-indigo-600 hover:underline transition-colors duration-200" style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: "bold", fontSize: "0.95rem" }}>
                                                                        {displayName}
                                                                    </Link>
                                                                ) : null}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <>
                                    <div className="hidden md:block" style={{ overflowX: "auto", width: "100%", borderRadius: "12px", border: "2px solid var(--border-light)" }}>
                                        <table style={{ width: "100%", minWidth: "800px", borderCollapse: "collapse", textAlign: "left" }}>
                                            <thead>
                                                <tr>
                                                    <th onClick={() => handleUserSort('name')} aria-sort={userSortConfig.key === 'name' ? (userSortConfig.direction === 'desc' ? 'descending' : 'ascending') : undefined} style={{ cursor: "pointer", padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            NAME
                                                            <span style={{ opacity: userSortConfig.key === 'name' ? 1 : 0.3 }}>
                                                                {userSortConfig.key === 'name' ? (userSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleUserSort('role')} aria-sort={userSortConfig.key === 'role' ? (userSortConfig.direction === 'desc' ? 'descending' : 'ascending') : undefined} style={{ cursor: "pointer", padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            ROLE
                                                            <span style={{ opacity: userSortConfig.key === 'role' ? 1 : 0.3 }}>
                                                                {userSortConfig.key === 'role' ? (userSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleUserSort('kids')} aria-sort={userSortConfig.key === 'kids' ? (userSortConfig.direction === 'desc' ? 'descending' : 'ascending') : undefined} style={{ cursor: "pointer", padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            ASSIGNED KIDS
                                                            <span style={{ opacity: userSortConfig.key === 'kids' ? 1 : 0.3 }}>
                                                                {userSortConfig.key === 'kids' ? (userSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th style={{ padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)" }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedUsers.map(u => {
                                                    const hasName = u.first_name || u.last_name;
                                                    const displayName = hasName ? `${u.first_name} ${u.last_name}`.trim() : u.email;
                                                    return (
                                                        <tr key={u.id} style={{ borderBottom: "1px solid var(--border-light)", verticalAlign: "middle" }} className="hover:bg-subtle-soft transition-colors duration-150">
                                                            <td style={{ padding: "12px" }}>
                                                                <div style={{ display: "flex", flexDirection: "column" }}>
                                                                    <Link href={`/users/${u.id}`} className="hover:text-indigo-600 hover:underline transition-colors duration-200" style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: "bold", fontSize: "0.95rem" }}>
                                                                        {displayName}
                                                                    </Link>
                                                                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>{u.email}</span>
                                                                    {u.pending_specialty_request && (
                                                                        <div style={{ marginTop: "6px" }}>
                                                                            <SpecialtyRequestBadge request={u.pending_specialty_request} />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: "12px" }}>
                                                                <Badge role={u.role} icon />
                                                            </td>
                                                            <td style={{ padding: "12px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                                                {(u.role === 'TEACHER' || u.role === 'SPECIALIST') ? (
                                                                    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "24px", height: "24px", borderRadius: "12px", background: "var(--bg-neutral-light)", color: "var(--text-secondary)", fontWeight: "bold", fontSize: "0.8rem", padding: "0 6px" }}>
                                                                        {u.assigned_students_count}
                                                                    </div>
                                                                ) : u.role === 'PARENT' && u.assigned_student_names && u.assigned_student_names.length > 0 ? (
                                                                    <div
                                                                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "24px", height: "24px", borderRadius: "12px", background: "var(--bg-warning-light)", color: "var(--text-warning)", fontWeight: "bold", fontSize: "0.8rem", padding: "0 8px" }}
                                                                        title={u.assigned_student_names.join(', ')}
                                                                    >
                                                                        {u.assigned_student_names.length} {u.assigned_student_names.length === 1 ? "child" : "children"}
                                                                    </div>
                                                                ) : (
                                                                    <span style={{ color: "var(--text-muted)" }}>-</span>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: "12px", textAlign: "right" }}>
                                                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", alignItems: "center" }}>
                                                                    <Link href={`/users/${u.id}`} aria-label={`View profile of ${displayName}`} className="hover:bg-indigo-50 transition-colors duration-200" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "6px", color: "var(--text-info)" }} title="View Profile">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                                                                    </Link>
                                                                    <button onClick={() => {
                                                                        setUserToDelete(u);
                                                                        setDeleteConfirmText("");
                                                                        setDeleteError("");
                                                                    }} aria-label={`Delete user ${displayName}`} className="hover:bg-danger-soft transition-colors duration-200" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", background: "none", border: "none", cursor: "pointer", color: "var(--danger)", borderRadius: "6px", padding: 0 }} title="Delete User">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="md:hidden flex flex-col gap-3">
                                        {paginatedUsers.map(u => {
                                            const hasName = u.first_name || u.last_name;
                                            const displayName = hasName ? `${u.first_name} ${u.last_name}`.trim() : u.email;
                                            return (
                                                <div key={u.id} className="bg-card rounded-xl border border-line p-4 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-3">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="flex flex-col min-w-0">
                                                            <Link href={`/users/${u.id}`} className="font-bold text-[var(--text-primary)] no-underline text-[1.1rem] hover:text-indigo-600 transition-colors truncate">
                                                                {displayName}
                                                            </Link>
                                                            <span className="text-sm text-muted mt-1 truncate">{u.email}</span>
                                                            {u.pending_specialty_request && (
                                                                <div className="mt-1.5">
                                                                    <SpecialtyRequestBadge request={u.pending_specialty_request} />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <Badge role={u.role} icon className="shrink-0" />
                                                    </div>
                                                    <div className="text-sm text-muted">
                                                        <span className="font-semibold mr-1">Assigned Kids:</span>
                                                        {(u.role === 'TEACHER' || u.role === 'SPECIALIST') ? (
                                                            <span>{u.assigned_students_count}</span>
                                                        ) : u.role === 'PARENT' && u.assigned_student_names && u.assigned_student_names.length > 0 ? (
                                                            <span title={u.assigned_student_names.join(', ')}>
                                                                {u.assigned_student_names.length} {u.assigned_student_names.length === 1 ? "child" : "children"}
                                                            </span>
                                                        ) : (
                                                            <span className="text-faint">None</span>
                                                        )}
                                                    </div>
                                                    <div className="border-t border-line pt-3 flex justify-end gap-2">
                                                        <Link href={`/users/${u.id}`} className="btn-slate text-sm flex-1 text-center py-2" title="View Profile">
                                                            Profile
                                                        </Link>
                                                        <button onClick={() => {
                                                            setUserToDelete(u);
                                                            setDeleteConfirmText("");
                                                            setDeleteError("");
                                                        }} className="btn-red text-sm flex-1 py-2" title="Delete User">
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                            
                            {/* Pagination Controls */}
                            {processedUsers.length > 0 && totalUserPages > 1 && (
                                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "1rem" }}>
                                    <button 
                                        onClick={() => setUserPage(p => Math.max(1, p - 1))} 
                                        disabled={safeUserPage === 1}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-light)", background: safeUserPage === 1 ? "var(--bg-primary)" : "var(--bg-card)", color: safeUserPage === 1 ? "var(--text-muted)" : "inherit", cursor: safeUserPage === 1 ? "not-allowed" : "pointer" }}
                                    >Previous</button>
                                    <span style={{ padding: "6px 12px", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                                        Page {safeUserPage} of {totalUserPages}
                                    </span>
                                    <button 
                                        onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))} 
                                        disabled={safeUserPage === totalUserPages}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-light)", background: safeUserPage === totalUserPages ? "var(--bg-primary)" : "var(--bg-card)", color: safeUserPage === totalUserPages ? "var(--text-muted)" : "inherit", cursor: safeUserPage === totalUserPages ? "not-allowed" : "pointer" }}
                                    >Next</button>
                                </div>
                            )}
                        </div>
                    ) : activeTab === "invitations" ? (
                        <div>
                            {/* Bulk Registration Panel */}
                            <div className="bg-card p-5 lg:p-6 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-line mb-8">
                                <div className="mb-5">
                                    <h2 className="text-lg font-bold text-fg flex items-center gap-2 m-0">
                                        <Mail className="text-indigo-600" size={20} />
                                        Send Invites
                                    </h2>
                                    <p className="text-sm text-muted m-0 mt-1">
                                        Send individual or bulk invitations. Paste emails or drop a CSV file.
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                                    {/* Left Column: Role & Input */}
                                    <div className="lg:col-span-1 flex flex-col gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-muted mb-1.5 uppercase tracking-wide">
                                                Account Role
                                            </label>
                                            <CustomSelect
                                                value={bulkRole}
                                                onChange={setBulkRole}
                                                disabled={isBulkProcessing}
                                                options={[
                                                    { value: 'PARENT', label: 'Parent' },
                                                    { value: 'TEACHER', label: 'Teacher' },
                                                    { value: 'SPECIALIST', label: 'Specialist' }
                                                ]}
                                            />
                                        </div>

                                        {bulkRole === 'SPECIALIST' && (
                                            <div>
                                                <label className="block text-xs font-bold text-muted mb-1.5 uppercase tracking-wide">
                                                    Specialty
                                                </label>
                                                <p className="text-xs text-muted m-0 mb-2">
                                                    Applied to everyone in this batch. They can request a change during onboarding.
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {SPECIALIST_SPECIALTIES.map(option => {
                                                        const checked = bulkSpecialties.includes(option);
                                                        return (
                                                            <button
                                                                key={option}
                                                                type="button"
                                                                disabled={isBulkProcessing}
                                                                aria-pressed={checked}
                                                                onClick={() => setBulkSpecialties(prev => checked ? prev.filter(s => s !== option) : [...prev, option])}
                                                                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${checked ? 'border-indigo-400 bg-indigo-50 text-indigo-800 font-bold' : 'border-line bg-card text-muted font-medium hover:border-line hover:bg-app'}`}
                                                            >
                                                                {checked && <CheckCircle2 size={14} />}
                                                                {option}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {bulkRole === 'TEACHER' && (
                                            <div>
                                                <label className="block text-xs font-bold text-muted mb-1.5 uppercase tracking-wide">
                                                    Grade Level
                                                </label>
                                                <p className="text-xs text-muted m-0 mb-2">
                                                    Applied to everyone in this batch. Used to match students to the right teacher.
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {GRADE_LEVELS.map(option => {
                                                        const checked = bulkGradeLevel === option;
                                                        return (
                                                            <button
                                                                key={option}
                                                                type="button"
                                                                disabled={isBulkProcessing}
                                                                aria-pressed={checked}
                                                                onClick={() => setBulkGradeLevel(checked ? '' : option)}
                                                                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${checked ? 'border-indigo-400 bg-indigo-50 text-indigo-800 font-bold' : 'border-line bg-card text-muted font-medium hover:border-line hover:bg-app'}`}
                                                            >
                                                                {checked && <CheckCircle2 size={14} />}
                                                                {option}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex-1 flex flex-col min-h-[250px]">
                                            <label className="block text-xs font-bold text-muted mb-1.5 uppercase tracking-wide flex justify-between">
                                                <span>Add Emails</span>
                                                <span className="font-normal text-faint normal-case">Paste or drop CSV</span>
                                            </label>
                                            <div 
                                                className={`flex-1 relative border-2 border-dashed rounded-xl transition-all duration-200 flex flex-col overflow-hidden ${isDragOver ? 'border-indigo-500 bg-indigo-50/50' : 'border-line bg-app hover:border-line'} ${isBulkProcessing ? 'opacity-50 pointer-events-none' : ''}`}
                                                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                                onDragLeave={() => setIsDragOver(false)}
                                                onDrop={handleBulkDrop}
                                            >
                                                <textarea
                                                    className="w-full h-full p-4 bg-transparent resize-none outline-none text-sm placeholder:text-faint"
                                                    placeholder="Enter emails separated by commas, spaces, or newlines..."
                                                    value={bulkInputText}
                                                    onChange={(e) => setBulkInputText(e.target.value)}
                                                    disabled={isBulkProcessing}
                                                />
                                                <div className="absolute bottom-3 right-3 flex gap-2">
                                                    <label className="cursor-pointer bg-card border border-line text-muted hover:text-indigo-600 hover:border-indigo-300 p-2 rounded-lg shadow-sm transition-all hover:shadow">
                                                        <FileUp size={16} />
                                                        <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => handleBulkFileUpload(e.target.files?.[0] || null)} disabled={isBulkProcessing} />
                                                    </label>
                                                    <button 
                                                        onClick={() => extractBulkEmails(bulkInputText)}
                                                        disabled={!bulkInputText.trim() || isBulkProcessing}
                                                        className="bg-indigo-600 text-white p-2 rounded-lg shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-all hover:shadow"
                                                    >
                                                        <ArrowRight size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Review List */}
                                    <div className="lg:col-span-2 flex flex-col bg-app rounded-xl border border-line overflow-hidden min-h-[300px]">
                                        <div className="px-4 py-3 border-b border-line bg-card flex justify-between items-center">
                                            <h3 className="text-sm font-bold text-fg flex items-center gap-2 m-0">
                                                <ClipboardList size={16} className="text-faint" />
                                                Review List
                                                <span className="bg-subtle-soft text-muted text-xs py-0.5 px-2 rounded-full font-medium border border-line">
                                                    {bulkEmails.length}
                                                </span>
                                            </h3>
                                            {bulkEmails.length > 0 && !isBulkProcessing && (
                                                <button onClick={clearAllBulkEmails} className="text-xs font-bold text-danger hover:text-danger">Clear All</button>
                                            )}
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 max-h-[300px]">
                                            {bulkEmails.length === 0 ? (
                                                <div className="flex-1 flex flex-col items-center justify-center text-faint gap-3">
                                                    <div className="w-12 h-12 rounded-full bg-subtle-soft flex items-center justify-center">
                                                        <Mail size={20} className="text-faint" />
                                                    </div>
                                                    <p className="text-sm font-medium m-0">List is empty</p>
                                                    <p className="text-xs m-0">Add emails to start sending invites.</p>
                                                </div>
                                            ) : (
                                                bulkEmails.map((entry, idx) => (
                                                    <div key={`${entry.email}-${idx}`} className={`flex items-center justify-between p-3 rounded-lg border text-sm transition-all ${entry.status === 'success' ? 'bg-success-soft border-success-line text-success' : entry.status === 'error' ? 'bg-danger-soft border-danger-line text-danger' : entry.status === 'sending' ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-card border-line text-fg'}`}>
                                                        <div className="flex items-center gap-3 truncate">
                                                            {entry.status === 'success' ? <CheckCircle2 size={16} className="text-success shrink-0" /> : entry.status === 'error' ? <XCircle size={16} className="text-danger shrink-0" /> : entry.status === 'sending' ? <Loader2 size={16} className="text-indigo-500 animate-spin shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-line shrink-0" />}
                                                            <div className="flex flex-col truncate">
                                                                <span className="font-medium truncate">{entry.email}</span>
                                                                {entry.errorMessage && <span className="text-xs text-danger mt-0.5 truncate">{entry.errorMessage}</span>}
                                                            </div>
                                                        </div>
                                                        {entry.status === 'pending' && !isBulkProcessing && (
                                                            <button onClick={() => removeBulkEmail(idx)} className="text-faint hover:text-danger p-1">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        <div className="p-4 border-t border-line bg-card">
                                            <button 
                                                onClick={handleBulkSendInvites}
                                                disabled={isBulkProcessing || bulkEmails.filter(e => e.status === 'pending' || e.status === 'error').length === 0}
                                                className={`w-full py-2.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${isBulkProcessing ? 'bg-indigo-400 cursor-not-allowed' : bulkEmails.filter(e => e.status === 'pending' || e.status === 'error').length === 0 ? 'bg-subtle-soft text-faint cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-[0_4px_12px_-4px_rgba(79,70,229,0.4)] hover:shadow-[0_6px_16px_-4px_rgba(79,70,229,0.5)]'}`}
                                            >
                                                {isBulkProcessing ? <><Loader2 size={18} className="animate-spin" /> Sending Invites...</> : <><Play size={18} className="fill-current" /> Send Invites</>}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <h2 className="text-lg font-bold text-fg flex items-center gap-2 m-0 mb-4">
                                Pending Invites
                            </h2>

                            {/* Action Bar (Search, Filters) */}
                            <div className="flex flex-col lg:flex-row justify-between gap-4 mb-5 items-start">
                                <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center w-full lg:flex-1 min-w-0">
                                    <div className="relative w-full md:flex-1 md:max-w-[400px]">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                                        <input
                                            type="text"
                                            placeholder="Search by email..."
                                            value={invitationSearch}
                                            onChange={e => setInvitationSearch(e.target.value)}
                                            style={{
                                                width: "100%",
                                                padding: "8px 12px 8px 36px",
                                                borderRadius: "6px",
                                                border: "1px solid var(--border-light)",
                                                fontSize: "0.9rem",
                                                height: "38px",
                                                outline: "none",
                                                boxSizing: "border-box",
                                                background: "var(--bg-primary)",
                                            }}
                                        />
                                    </div>
                                    <div className="flex gap-2 items-center overflow-x-auto w-full md:w-auto pb-1 md:pb-0" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                                        {uniqueInvitationRoles.map(r => {
                                            const isActive = invitationRoleFilters.includes(r);
                                            return (
                                                <button
                                                    key={r}
                                                    onClick={() => toggleInvitationRoleFilter(r)}
                                                    style={{
                                                        padding: "6px 14px",
                                                        borderRadius: "20px",
                                                        border: `1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-light)'}`,
                                                        fontSize: "0.8rem",
                                                        fontWeight: isActive ? 600 : 400,
                                                        background: isActive ? '#eff6ff' : 'var(--bg-primary)',
                                                        color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                                        cursor: "pointer",
                                                        transition: "all 0.2s"
                                                    }}
                                                >
                                                    {r}
                                                </button>
                                            );
                                        })}
                                        {(invitationSearch || invitationRoleFilters.length > 0) && (
                                            <button 
                                                onClick={() => { setInvitationSearch(''); setInvitationRoleFilters([]); }}
                                                style={{ padding: "6px 12px", background: "none", border: "none", color: "var(--text-secondary)", fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}
                                            >
                                                Clear Filters
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                                <span>Showing {Math.min(processedInvitations.length, paginatedInvitations.length)} of {processedInvitations.length} invitations</span>
                                {pendingInvitations.length > 10 && (
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                        <span>Show:</span>
                                        <CustomSelect
                                            size="sm"
                                            className="w-20"
                                            triggerClassName="h-8 rounded-md px-2 text-sm font-medium"
                                            ariaLabel="Invitations per page"
                                            value={String(invitationItemsPerPage)}
                                            onChange={(v) => setInvitationItemsPerPage(Number(v))}
                                            options={PAGE_SIZE_OPTIONS}
                                        />
                                    </div>
                                )}
                            </div>

                            {processedInvitations.length === 0 ? (
                                <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 1rem", background: "var(--bg-primary)", borderRadius: "8px", border: "1px dashed var(--text-muted)" }}>
                                    {pendingInvitations.length === 0
                                        ? "No pending invitations in the system."
                                        : invitationSearch && invitationRoleFilters.length > 0
                                            ? `No invitations match "${invitationSearch}" with the selected role filters.`
                                            : invitationSearch
                                                ? `No invitations match "${invitationSearch}".`
                                                : invitationRoleFilters.length > 0
                                                    ? "No invitations match the selected role filters."
                                                    : "No invitations to show."}
                                </p>
                            ) : (
                                <>
                                    <div className="hidden md:block" style={{ overflowX: "auto", width: "100%", borderRadius: "12px", border: "2px solid var(--border-light)" }}>
                                        <table style={{ width: "100%", minWidth: "600px", borderCollapse: "collapse", textAlign: "left" }}>
                                            <thead>
                                                <tr>
                                                    <th onClick={() => handleInvitationSort('email')} style={{ cursor: "pointer", padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            EMAIL
                                                            <span style={{ opacity: invitationSortConfig.key === 'email' ? 1 : 0.3 }}>
                                                                {invitationSortConfig.key === 'email' ? (invitationSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleInvitationSort('role')} style={{ cursor: "pointer", padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            ROLE
                                                            <span style={{ opacity: invitationSortConfig.key === 'role' ? 1 : 0.3 }}>
                                                                {invitationSortConfig.key === 'role' ? (invitationSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleInvitationSort('date')} style={{ cursor: "pointer", padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            SENT DATE
                                                            <span style={{ opacity: invitationSortConfig.key === 'date' ? 1 : 0.3 }}>
                                                                {invitationSortConfig.key === 'date' ? (invitationSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th style={{ padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>EXPIRES</th>
                                                    <th style={{ padding: "12px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedInvitations.map(inv => {
                                                    const expiry = inv.expires_at ? getExpiryDisplay(inv.expires_at) : null;
                                                    return (
                                                    <tr key={inv.id} style={{ borderBottom: "1px solid var(--border-light)", verticalAlign: "middle", opacity: expiry?.isExpired ? 0.65 : 1 }} className="hover:bg-subtle-soft transition-colors duration-150">
                                                        <td style={{ padding: "12px", fontWeight: "bold", color: "var(--text-primary)", textDecoration: expiry?.isExpired ? 'line-through' : 'none' }}>{inv.email}</td>
                                                        <td style={{ padding: "12px" }}>
                                                            <Badge role={inv.role} icon />
                                                        </td>
                                                        <td style={{ padding: "12px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{new Date(inv.created_at).toLocaleDateString()}</td>
                                                        <td style={{ padding: "12px" }}>
                                                            {expiry ? (
                                                                <span style={{ fontSize: "0.72rem", background: expiry.bg, color: expiry.color, padding: "4px 10px", borderRadius: "12px", fontWeight: "bold", letterSpacing: "0.3px", whiteSpace: "nowrap" }}>
                                                                    {expiry.label}
                                                                </span>
                                                            ) : <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>—</span>}
                                                        </td>
                                                        <td style={{ padding: "12px", textAlign: "right" }}>
                                                            <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" }}>
                                                                {!expiry?.isExpired && (
                                                                    <button
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`);
                                                                            toast.success("Invite link copied.");
                                                                        }}
                                                                        className="hover:bg-indigo-50 transition-colors duration-200"
                                                                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "6px", background: "none", border: "none", color: "var(--text-info)", cursor: "pointer", padding: 0 }}
                                                                        title="Copy Invite Link"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => setInviteToResend(inv)}
                                                                    className="hover:bg-success-soft transition-colors duration-200"
                                                                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "6px", background: "none", border: "none", color: "var(--success)", cursor: "pointer", padding: 0 }}
                                                                    title="Resend Invitation"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.49 2.74l1.51 1.51"/><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.49-2.74L3.5 16.75"/><polyline points="20 4 20 9 15 9"/><polyline points="4 20 4 15 9 15"/></svg>
                                                                </button>
                                                                <button onClick={() => setInviteToRevoke(inv)} className="hover:bg-danger-soft transition-colors duration-200" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--danger)", padding: 0 }} title="Revoke Invite">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="md:hidden flex flex-col gap-3">
                                        {paginatedInvitations.map(inv => {
                                            const expiry = inv.expires_at ? getExpiryDisplay(inv.expires_at) : null;
                                            return (
                                                <div key={inv.id} className={`bg-card rounded-xl border border-line p-4 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-3 ${expiry?.isExpired ? 'opacity-65' : ''}`}>
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="flex flex-col flex-1 min-w-0">
                                                            <span className={`font-bold text-[var(--text-primary)] text-[1rem] truncate ${expiry?.isExpired ? 'line-through' : ''}`} title={inv.email}>
                                                                {inv.email}
                                                            </span>
                                                            <span className="text-sm text-muted mt-1">Sent: {new Date(inv.created_at).toLocaleDateString()}</span>
                                                        </div>
                                                        <Badge role={inv.role} icon className="shrink-0" />
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2 text-sm">
                                                        <span className="text-muted">Expires:</span>
                                                        {expiry ? (
                                                            <span style={{ fontSize: "0.72rem", background: expiry.bg, color: expiry.color, padding: "2px 8px", borderRadius: "12px", fontWeight: "bold", whiteSpace: "nowrap" }}>
                                                                {expiry.label}
                                                            </span>
                                                        ) : <span className="text-faint">—</span>}
                                                    </div>
                                                    <div className="border-t border-line pt-3 flex justify-end gap-2 flex-wrap">
                                                        {!expiry?.isExpired && (
                                                            <button onClick={() => {
                                                                navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`);
                                                                toast.success("Invite link copied.");
                                                            }} className="btn-secondary text-xs flex-1 text-center py-2" title="Copy Invite Link">
                                                                Copy Link
                                                            </button>
                                                        )}
                                                        <button onClick={() => setInviteToResend(inv)} className="btn-secondary text-xs flex-1 text-center py-2" title="Resend Invitation">
                                                            Resend
                                                        </button>
                                                        <button onClick={() => setInviteToRevoke(inv)} className="btn-red text-xs flex-1 py-2" title="Revoke Invite">
                                                            Revoke
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            {/* Pagination Controls */}
                            {processedInvitations.length > 0 && totalInvitationPages > 1 && (
                                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "1rem" }}>
                                    <button 
                                        onClick={() => setInvitationPage(p => Math.max(1, p - 1))} 
                                        disabled={safeInvitationPage === 1}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-light)", background: safeInvitationPage === 1 ? "var(--bg-primary)" : "var(--bg-card)", color: safeInvitationPage === 1 ? "var(--text-muted)" : "inherit", cursor: safeInvitationPage === 1 ? "not-allowed" : "pointer" }}
                                    >Previous</button>
                                    <span style={{ padding: "6px 12px", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                                        Page {safeInvitationPage} of {totalInvitationPages}
                                    </span>
                                    <button 
                                        onClick={() => setInvitationPage(p => Math.min(totalInvitationPages, p + 1))} 
                                        disabled={safeInvitationPage === totalInvitationPages}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-light)", background: safeInvitationPage === totalInvitationPages ? "var(--bg-primary)" : "var(--bg-card)", color: safeInvitationPage === totalInvitationPages ? "var(--text-muted)" : "inherit", cursor: safeInvitationPage === totalInvitationPages ? "not-allowed" : "pointer" }}
                                    >Next</button>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>





            {/* ── Invite User Modal ──────────────────────────────────────── */}
            {showInviteModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "var(--bg-secondary)", padding: "2rem", borderRadius: "16px", width: "420px", maxWidth: "90%", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.5rem" }}>
                            <div style={{ background: "var(--accent-soft)", color: "var(--accent-primary)", padding: "8px", borderRadius: "10px" }}>
                                <UserPlus size={20} />
                            </div>
                            <h2 style={{ marginTop: 0, marginBottom: 0, fontSize: "1.25rem", color: "var(--text-primary)", fontWeight: 800 }}>Registration</h2>
                        </div>
                        
                        <form onSubmit={handleInviteUser} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                            <div>
                                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Account Role <span style={{ color: "var(--danger)" }}>*</span></label>
                                <CustomSelect 
                                    value={inviteRole}
                                    onChange={setInviteRole}
                                    disabled={invitingUser}
                                    options={[
                                        { value: 'PARENT', label: 'Parent' },
                                        { value: 'TEACHER', label: 'Teacher' },
                                        { value: 'SPECIALIST', label: 'Specialist' }
                                    ]}
                                />
                            </div>

                            {inviteRole === 'SPECIALIST' && (
                                <div>
                                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Specialty</label>
                                    <p style={{ margin: "0 0 8px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                        Assign now so their disciplines are ready on sign-up. They can request a change during onboarding if it&apos;s wrong.
                                    </p>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                        {SPECIALIST_SPECIALTIES.map(option => {
                                            const checked = inviteSpecialties.includes(option);
                                            return (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    disabled={invitingUser}
                                                    aria-pressed={checked}
                                                    onClick={() => setInviteSpecialties(prev => checked ? prev.filter(s => s !== option) : [...prev, option])}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                                                    style={{
                                                        borderColor: checked ? "var(--accent-primary)" : "var(--border-light)",
                                                        background: checked ? "var(--accent-primary-soft, rgba(99,102,241,0.1))" : "var(--bg-primary)",
                                                        color: checked ? "var(--accent-primary)" : "var(--text-secondary)",
                                                        fontWeight: checked ? 700 : 500,
                                                    }}
                                                >
                                                    {checked && <CheckCircle2 size={14} />}
                                                    {option}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {inviteRole === 'TEACHER' && (
                                <div>
                                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Grade Level</label>
                                    <p style={{ margin: "0 0 8px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                        Assign now so student matching works from their first day. You can change it later on their profile.
                                    </p>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                        {GRADE_LEVELS.map(option => {
                                            const checked = inviteGradeLevel === option;
                                            return (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    disabled={invitingUser}
                                                    aria-pressed={checked}
                                                    onClick={() => setInviteGradeLevel(checked ? '' : option)}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                                                    style={{
                                                        borderColor: checked ? "var(--accent-primary)" : "var(--border-light)",
                                                        background: checked ? "var(--accent-primary-soft, rgba(99,102,241,0.1))" : "var(--bg-primary)",
                                                        color: checked ? "var(--accent-primary)" : "var(--text-secondary)",
                                                        fontWeight: checked ? 700 : 500,
                                                    }}
                                                >
                                                    {checked && <CheckCircle2 size={14} />}
                                                    {option}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email Address <span style={{ color: "var(--danger)" }}>*</span></label>
                                <input required type="email" placeholder="name@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="form-input" style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--text-muted)", background: "var(--bg-primary)", fontSize: "0.9rem", transition: "all 0.2s" }} />
                            </div>
                            
                            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                                <button type="submit" className="btn-primary" style={{ flex: 1, padding: "8px 16px", borderRadius: "8px", fontSize: "0.85rem", opacity: invitingUser ? 0.6 : 1, transition: "all 0.2s" }} disabled={invitingUser}>
                                    {invitingUser ? "Sending..." : "Send Link"}
                                </button>
                                <button type="button" onClick={() => { setShowInviteModal(false); setInviteSpecialties([]); setInviteGradeLevel(''); }} style={{ flex: 1, padding: "8px 16px", background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--text-muted)", borderRadius: "8px", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", transition: "all 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }} disabled={invitingUser}>
                                    Cancel
                                </button>
                            </div>

                            <div style={{ marginTop: "1rem", textAlign: "center", borderTop: "1px dashed var(--border-light)", paddingTop: "1rem" }}>
                                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0 }}>
                                    Need to invite multiple people? <br/>
                                    <Link href="/dashboard?tab=invitations" onClick={() => setShowInviteModal(false)} style={{ color: "var(--accent-primary)", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
                                        Go to Bulk Registration <ArrowRight size={14} />
                                    </Link>
                                </p>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Delete User Confirmation Modal ─────────────────────────── */}
            {userToDelete && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "var(--bg-secondary)", padding: "2rem", borderRadius: "12px", width: "400px", maxWidth: "90%" }}>
                        <h2 style={{ marginTop: 0, color: "var(--danger)" }}>Delete User</h2>
                        <p style={{ color: "var(--text-secondary)", marginBottom: "1rem", fontSize: "0.95rem" }}>
                            You are about to permanently delete <strong>{userToDelete.first_name} {userToDelete.last_name}</strong>.
                        </p>
                        <p style={{ color: "var(--text-primary)", marginBottom: "1rem", fontSize: "0.9rem", fontWeight: "bold" }}>
                            To confirm, please type their email address:<br/>
                            <span style={{ color: "var(--text-muted)", fontStyle: "italic", userSelect: "none" }}>{userToDelete.email}</span>
                        </p>

                        {deleteError && (
                            <div style={{ background: "var(--bg-danger-light)", color: "var(--text-danger)", padding: "10px", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.85rem", fontWeight: "bold" }}>
                                {deleteError}
                            </div>
                        )}

                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <input
                                required
                                type="email"
                                placeholder="Type email to confirm"
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)}
                                className="form-input"
                                style={{ padding: "10px", borderRadius: "4px", border: "1px solid #ccc", width: "100%", boxSizing: "border-box" }}
                            />

                            <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
                                <button
                                    onClick={handleConfirmDeleteUser}
                                    disabled={deleteConfirmText !== userToDelete.email}
                                    style={{ flex: 1, padding: "10px", background: deleteConfirmText === userToDelete.email ? "var(--danger)" : "var(--text-danger)", color: "white", border: "none", borderRadius: "8px", cursor: deleteConfirmText === userToDelete.email ? "pointer" : "not-allowed", fontWeight: "bold" }}
                                >
                                    Permanently Delete
                                </button>
                                <button type="button" onClick={() => { setUserToDelete(null); setDeleteConfirmText(""); setDeleteError(""); }} style={{ flex: 1, padding: "10px", background: "var(--bg-neutral-light)", border: "1px solid var(--text-muted)", borderRadius: "8px", cursor: "pointer" }}>Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Revoke Invite Confirmation ──────────────────────────────── */}
            {inviteToRevoke && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-2xl">
                        <h2 className="m-0 text-lg font-extrabold text-danger">Revoke invitation</h2>
                        <p className="mt-2 text-sm text-muted">
                            Revoking will invalidate the existing invite link for <strong>{inviteToRevoke.email}</strong>. They will not be able to register with the current link.
                        </p>
                        <div className="mt-5 flex gap-2">
                            <button
                                type="button"
                                onClick={handleConfirmRevokeInvite}
                                disabled={inviteActionLoading}
                                className="flex-1 rounded-xl bg-danger-solid px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-danger-solid disabled:opacity-60"
                            >
                                {inviteActionLoading ? "Revoking..." : "Revoke"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setInviteToRevoke(null)}
                                disabled={inviteActionLoading}
                                className="flex-1 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-bold text-fg transition-colors hover:bg-app disabled:opacity-60"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Resend Invite Confirmation ──────────────────────────────── */}
            {inviteToResend && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-2xl">
                        <h2 className="m-0 text-lg font-extrabold text-success">Resend invitation</h2>
                        <p className="mt-2 text-sm text-muted">
                            This will revoke the previous link for <strong>{inviteToResend.email}</strong> and issue a fresh 72-hour invitation. You'll get a new copyable link after the resend.
                        </p>
                        <div className="mt-5 flex gap-2">
                            <button
                                type="button"
                                onClick={handleConfirmResendInvite}
                                disabled={inviteActionLoading}
                                className="flex-1 rounded-xl bg-success-solid px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-success-solid disabled:opacity-60"
                            >
                                {inviteActionLoading ? "Sending..." : "Resend"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setInviteToResend(null)}
                                disabled={inviteActionLoading}
                                className="flex-1 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-bold text-fg transition-colors hover:bg-app disabled:opacity-60"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Created/Resent Invite Token (copyable) ──────────────────── */}
            {createdInvite && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-2xl">
                        <h2 className="m-0 text-lg font-extrabold text-fg">Invite link ready</h2>
                        <p className="mt-2 text-sm text-muted">
                            Send this link to <strong>{createdInvite.email}</strong>. It's valid for 72 hours.
                        </p>
                        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-app/60 p-2">
                            <code className="flex-1 break-all text-xs font-medium text-fg">
                                {`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${createdInvite.token}`}
                            </code>
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/invite/${createdInvite.token}`);
                                    toast.success("Invite link copied.");
                                }}
                                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
                            >
                                Copy
                            </button>
                        </div>
                        <div className="mt-5 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setCreatedInvite(null)}
                                className="flex-1 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-bold text-fg transition-colors hover:bg-app"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
