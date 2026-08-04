"use client";

import { useEffect, useState, useMemo } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { extractApiError } from "@/lib/toast-utils";
import { Calendar, Search, ClipboardList, Clock, CheckCircle2, Sparkles, Archive, FileText, ArrowRight, Users as UsersIcon, Plus, LayoutGrid, List, Smartphone } from "lucide-react";
import { semanticToneClass, statusColorClass, statusColorHex, statusLabel, studentRowActionPillClass } from "@/lib/role-colors";
import AdminDashboard from "./AdminDashboard";
import WelcomeBanner from "@/components/WelcomeBanner";
import SMSVerificationModal from "@/components/SMSVerificationModal";
import PageHeader from "@/components/ui/PageHeader";
import CustomSelect, { PAGE_SIZE_OPTIONS } from "@/components/CustomSelect";
import { isSpecialistOnboardingIncomplete, specialistOnboardingMessage } from "@/lib/specialist-onboarding";
import { isTeacherProfileIncomplete, teacherProfileMessage } from "@/lib/teacher-profile";

interface Student {
    id: number;
    first_name: string;
    last_name: string;
    grade: string;
    status: string;
    has_parent_assessment?: boolean;
    has_specialist_assessment?: boolean;
    has_assigned_specialists?: boolean;
    parent_assessment_unlocked?: boolean;
    parent_current_tracker_submitted?: boolean;
    specialist_current_tracker_submitted?: boolean;
    teacher_current_tracker_submitted?: boolean;
    active_cycle_label?: string | null;
    latest_final_monthly_report_id?: number | null;
    next_action?: {
        id: string;
        label: string;
        tone: string;
        workspace?: string;
        tab?: string;
        view?: string;
        docId?: string;
        teamRole?: string;
    } | null;
}

export default function DashboardPage() {
    const router = useRouter();
    const { user, refreshUser } = useAuth();
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSMSModal, setShowSMSModal] = useState(false);
    const [isPhoneVerified, setIsPhoneVerified] = useState<boolean | null>(null);

    // Search / filter / pagination state
    const [searchQuery, setSearchQuery] = useState("");
    const [gradeFilter, setGradeFilter] = useState("ALL");
    const [statusFilters, setStatusFilters] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [studentSortConfig, setStudentSortConfig] = useState<{ key: 'id' | 'name' | 'grade' | 'status' | null; direction: 'asc' | 'desc' | null }>({ key: null, direction: null });
    const specialistOnboardingIncomplete = isSpecialistOnboardingIncomplete(user);
    const teacherProfileIncomplete = isTeacherProfileIncomplete(user);

    const handleStudentSort = (key: 'id' | 'name' | 'grade' | 'status') => {
        setStudentSortConfig(prev => {
            if (prev.key === key) {
                if (prev.direction === 'asc') return { key, direction: 'desc' };
                if (prev.direction === 'desc') return { key: null, direction: null };
            }
            return { key, direction: 'asc' };
        });
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

    const buildStudentActionHref = (student: Student) => {
        const params = new URLSearchParams({ studentId: student.id.toString() });
        const action = student.next_action;
        if (action?.workspace) params.set("workspace", action.workspace);
        if (action?.tab) params.set("tab", action.tab);
        if (action?.view) params.set("view", action.view);
        if (action?.docId) params.set("docId", action.docId);
        if (action?.teamRole) params.set("teamRole", action.teamRole);
        return `/workspace?${params.toString()}`;
    };

    const handleWaitingAction = (student: Student, nextAction: NonNullable<Student['next_action']>) => {
        toast.info(nextAction.label === 'Awaiting Parent' ? 'Waiting on parent' : 'Waiting on specialists', {
            description: nextAction.label === 'Awaiting Parent'
                ? 'Parent assessment is still missing.'
                : 'Specialist assessment is not finalized yet.',
        });
    };

    useEffect(() => {
        const savedViewMode = window.localStorage.getItem("arase:dashboard-view-mode");
        if (savedViewMode === "list" || savedViewMode === "grid") {
            setViewMode(savedViewMode);
        }
    }, []);

    const handleViewModeChange = (mode: "grid" | "list") => {
        setViewMode(mode);
        window.localStorage.setItem("arase:dashboard-view-mode", mode);
    };

    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const res = await api.get("/api/students/");
                setStudents(res.data);
            } catch {
                console.error("Failed to fetch students");
            } finally {
                setLoading(false);
            }
        };
        if (user && user.role !== "ADMIN") {
            fetchStudents();
            // is_phone_verified comes back as true/false/undefined from /api/auth/me/
            // Treat undefined (old accounts) as false so the banner still shows
            setIsPhoneVerified(user.is_phone_verified === true ? true : false);
        } else {
            setLoading(false);
        }
    }, [user]);

    // Reset page to 1 on search or filter match count resize
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, gradeFilter, itemsPerPage]);

    // Faceted Data Processing
    const statusPriority: Record<string, number> = {
        "PENDING_ASSESSMENT": 1,
        "ASSESSMENT_SCHEDULED": 2,
        "ASSESSED": 3,
        "ENROLLED": 4,
        "INTEGRATED": 5,
        "ARCHIVED": 6
    };

    const uniqueGrades = useMemo(() => {
        return Array.from(new Set(students.map(s => s.grade).filter(Boolean))).sort();
    }, [students]);

    const uniqueStatuses = useMemo(() => {
        return Array.from(new Set(students.map(s => s.status)))
            .filter(Boolean)
            .sort((a, b) => (statusPriority[a] || 99) - (statusPriority[b] || 99));
    }, [students]);

    const statusCounts = useMemo(() => {
        return students.reduce<Record<string, number>>((acc, student) => {
            if (student.status) {
                acc[student.status] = (acc[student.status] || 0) + 1;
            }
            return acc;
        }, {});
    }, [students]);

    const toggleStatusFilter = (status: string) => {
        setStatusFilters(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
        setCurrentPage(1);
    };

    const processedStudents = useMemo(() => {
        let result = [...students];

        if (searchQuery) {
            const searchTerms = searchQuery.toLowerCase().trim().split(/\s+/);
            result = result.filter(s => {
                const searchableString = `${s.first_name || ''} ${s.last_name || ''} ${s.id || ''}`.toLowerCase();
                return searchTerms.every(term => searchableString.includes(term));
            });
        }

        if (gradeFilter !== "ALL") {
            result = result.filter(s => s.grade === gradeFilter);
        }

        if (statusFilters.length > 0) {
            result = result.filter(s => statusFilters.includes(s.status));
        }

        if (studentSortConfig.key && studentSortConfig.direction) {
            result.sort((a, b) => {
                let aVal: any = '';
                let bVal: any = '';
                if (studentSortConfig.key === 'id') {
                    aVal = a.id;
                    bVal = b.id;
                } else if (studentSortConfig.key === 'name') {
                    aVal = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
                    bVal = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
                } else if (studentSortConfig.key === 'grade') {
                    aVal = a.grade || '';
                    bVal = b.grade || '';
                } else if (studentSortConfig.key === 'status') {
                    aVal = statusPriority[a.status] || 99;
                    bVal = statusPriority[b.status] || 99;
                }
                if (aVal < bVal) return studentSortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return studentSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [students, searchQuery, gradeFilter, statusFilters, studentSortConfig]);

    const totalPages = Math.ceil(processedStudents.length / itemsPerPage);
    const safePage = Math.min(currentPage, Math.max(1, totalPages));
    const paginatedStudents = processedStudents.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

    const getSubtitle = () => {
        switch (user?.role) {
            case "TEACHER": {
                const enrolled = students.filter(s => s.status === "ENROLLED").length;
                if (enrolled === 0) {
                    // The empty-state card below explains what happens next — keep this short
                    // so the same message isn't stacked twice on the page.
                    return "Your class list is empty right now.";
                }
                return `You have ${enrolled} enrolled student${enrolled !== 1 ? "s" : ""} to track this cycle.`;
            }
            case "SPECIALIST": {
                const pending = students.filter(s => s.status === "PENDING_ASSESSMENT").length;
                const enrolled = students.filter(s => s.status === "ENROLLED").length;
                const parts: string[] = [];
                if (pending > 0) parts.push(`${pending} awaiting assessment`);
                if (enrolled > 0) parts.push(`${enrolled} enrolled`);
                if (parts.length === 0) {
                    return "Your caseload is empty right now.";
                }
                return `You have ${parts.join(" and ")}.`;
            }
            case "PARENT": {
                if (students.length === 0) {
                    return "Register your child to begin the parent assessment.";
                }
                const needsAssessment = students.filter(s => s.status === "PENDING_ASSESSMENT" && !s.has_parent_assessment).length;
                const needsTracker = students.filter(s => s.status === "ENROLLED" && !s.parent_current_tracker_submitted).length;
                const totalActions = needsAssessment + needsTracker;
                if (totalActions > 0) {
                    const parts: string[] = [];
                    if (needsAssessment > 0) parts.push(`${needsAssessment} assessment${needsAssessment > 1 ? 's' : ''} to complete`);
                    if (needsTracker > 0) parts.push(`${needsTracker} monthly update${needsTracker > 1 ? 's' : ''} due`);
                    return `You have ${parts.join(' and ')}.`;
                }
                return "All caught up! Nothing needed right now.";
            }
            default: return "";
        }
    };

    const getTimeGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    };

    const getStudentWorkspaceHref = (studentId: number, tab?: string) => {
        if (user?.role === "PARENT") {
            // Parents use the unified workspace, where panels are `view` params.
            // Without one they land on the overview.
            const parentView = tab === "parent_tracker" ? "tracker" : tab === "parent_assessment" ? "assessment" : null;
            return parentView
                ? `/workspace?studentId=${studentId}&view=${parentView}`
                : `/workspace?studentId=${studentId}`;
        }
        const params = new URLSearchParams({
            studentId: studentId.toString(),
            workspace: "forms",
        });
        if (tab) params.set("tab", tab);
        return `/workspace?${params.toString()}`;
    };

    const rememberParentStudent = (studentId: number) => {
        if (user?.role !== "PARENT" || typeof window === "undefined") return;
        window.localStorage.setItem("arase:last-parent-student-id", studentId.toString());
    };

    const hasPhoneNumber = Boolean(user?.phone_number?.trim());

    if (user?.role === "ADMIN") {
        return <AdminDashboard />;
    }

    return (
        <ProtectedRoute>
            <div className="px-4 md:px-0">
                {/* SMS Verification Banner — Parent only, and only once a number is
                    on file. A phone number is optional at sign-up, so there is
                    nothing to verify (and nothing to nag about) without one. */}
                {user?.role === "PARENT" && isPhoneVerified === false && hasPhoneNumber && (
                    <div className={`mb-6 flex flex-col items-start justify-between gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:px-5 sm:py-3 ${semanticToneClass("warning")}`}>
                        <div className="flex items-start gap-3">
                            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                            <p className="m-0 text-sm md:text-[0.9rem] text-warning font-medium">
                                Your phone number <strong>({user.phone_number})</strong> is unverified. Verify it to enable SMS alerts and notifications.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowSMSModal(true)}
                            className="bg-warning-solid hover:bg-warning-solid text-white border-none rounded-md px-4 py-2 font-bold cursor-pointer text-sm whitespace-nowrap transition-colors w-full sm:w-auto mt-2 sm:mt-0"
                        >
                            Verify Now
                        </button>
                    </div>
                )}

                {showSMSModal && (
                    <SMSVerificationModal
                        onClose={() => setShowSMSModal(false)}
                        onVerified={async () => {
                            setIsPhoneVerified(true);
                            setShowSMSModal(false);
                            if (refreshUser) {
                                await refreshUser();
                            }
                        }}
                    />
                )}

                <WelcomeBanner students={students} />

                {specialistOnboardingIncomplete && (
                    <div className={`mb-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${semanticToneClass("warning")}`}>
                        <div className="flex items-start gap-3">
                            <Calendar className="mt-0.5 h-5 w-5 shrink-0" />
                            <div>
                                <p className="m-0 text-sm font-bold">Complete your profile setup</p>
                                <p className="m-0 text-sm">{specialistOnboardingMessage(user?.specialist_onboarding_missing)}</p>
                            </div>
                        </div>
                        <Link href="/specialist-onboarding" className="rounded-lg bg-warning-solid px-4 py-2 text-center text-sm font-bold text-white hover:bg-warning-solid">
                            Finish setup
                        </Link>
                    </div>
                )}

                {/* A nudge, not a gate — teachers can work with an incomplete profile. */}
                {teacherProfileIncomplete && (
                    <div className={`mb-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${semanticToneClass("info")}`}>
                        <div className="flex items-start gap-3">
                            <Calendar className="mt-0.5 h-5 w-5 shrink-0" />
                            <div>
                                <p className="m-0 text-sm font-bold">Finish your profile</p>
                                <p className="m-0 text-sm">{teacherProfileMessage(user?.teacher_profile_missing)}</p>
                            </div>
                        </div>
                        <Link href={`/users/${user?.user_id}`} className="rounded-lg bg-info-strong px-4 py-2 text-center text-sm font-bold text-white hover:bg-info-strong">
                            Update profile
                        </Link>
                    </div>
                )}

                {/* Page header */}
                <PageHeader
                    title={`${getTimeGreeting()}, ${user?.first_name || "there"}`}
                    subtitle={getSubtitle()}
                    meta={user?.role !== "PARENT" && students.length > 0 ? (
                        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-bold text-muted">
                            <UsersIcon className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
                            {processedStudents.length} of {students.length} student{students.length !== 1 ? "s" : ""}
                        </span>
                    ) : undefined}
                />

                {/* Content panel */}
                <div className={user?.role === "PARENT" ? "" : "rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-6"}>
                    {loading ? (
                        <div className="flex items-center gap-2 p-8 text-sm text-muted">
                            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-indigo-500" aria-hidden="true" />
                            Loading...
                        </div>
                    ) : students.length === 0 ? (
                        user?.role === "PARENT" ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
                                <Link
                                    href="/parent-onboarding"
                                    className="group flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-app/50 p-8 text-center no-underline transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
                                    style={{ minHeight: "260px" }}
                                >
                                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-subtle-soft text-faint transition-colors group-hover:bg-indigo-100 group-hover:text-indigo-600">
                                        <Plus className="h-6 w-6" strokeWidth={2.5} />
                                    </div>
                                    <h3 className="m-0 text-lg font-bold text-fg transition-colors group-hover:text-indigo-700">
                                        Register a New Child
                                    </h3>
                                    <p className="mt-2 text-sm text-muted max-w-[200px]">
                                        Start an onboarding assessment for a new student.
                                    </p>
                                </Link>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-app/40 p-8 text-center">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-card text-faint shadow-sm">
                                    <UsersIcon className="h-5 w-5" aria-hidden="true" />
                                </div>
                                <p className="m-0 max-w-sm text-sm text-muted">
                                    Admin assigns students to your{" "}
                                    {user?.role === "TEACHER" ? "class list" : "caseload"}. You&apos;ll get a
                                    notification the moment your first one arrives.
                                </p>
                            </div>
                        )
                    ) : (
                        <div>
                            {/* Action Bar (Search, Filters) */}
                            {!(user?.role === "PARENT" && students.length < 5) && (
                                <>
                                    <div className="flex flex-col gap-4 mb-5">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
                                                {/* Search Input */}
                                                <div className="relative flex-1 min-w-[220px] max-w-[360px]">
                                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search by name or ID..."
                                                        value={searchQuery}
                                                        onChange={e => setSearchQuery(e.target.value)}
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

                                                {/* Grade Filter Dropdown */}
                                                <CustomSelect
                                                    size="sm"
                                                    className="w-44 shrink-0"
                                                    triggerClassName="h-[38px] rounded-md px-3 text-[0.85rem] font-medium"
                                                    ariaLabel="Filter students by grade"
                                                    value={gradeFilter}
                                                    onChange={(v) => { setGradeFilter(v); setCurrentPage(1); }}
                                                    options={[
                                                        { value: "ALL", label: "All grades" },
                                                        ...uniqueGrades.map(grade => ({
                                                            value: grade,
                                                            label: grade.startsWith("Grade") ? grade : `Grade ${grade}`,
                                                        })),
                                                    ]}
                                                />

                                                {/* Clear Filters Button */}
                                                {(searchQuery || gradeFilter !== "ALL" || statusFilters.length > 0) && (
                                                    <button
                                                        onClick={() => { setSearchQuery(''); setGradeFilter('ALL'); setStatusFilters([]); setCurrentPage(1); }}
                                                        className="h-[38px] whitespace-nowrap rounded-md border border-line bg-card px-3 text-xs font-bold text-muted transition-colors duration-200 hover:border-line hover:bg-app hover:text-fg cursor-pointer"
                                                    >
                                                        Clear Filters
                                                    </button>
                                                )}
                                            </div>

                                            {/* View Mode Toggle */}
                                            <div className="flex items-center gap-1 rounded-lg border border-line bg-app p-1 shrink-0 ml-auto">
                                                <button 
                                                    onClick={() => handleViewModeChange("grid")} 
                                                    className={`rounded-md p-1.5 transition-colors ${viewMode === "grid" ? "bg-card shadow-sm text-indigo-600" : "text-faint hover:text-muted"}`}
                                                    aria-label="Grid View"
                                                >
                                                    <LayoutGrid className="h-4 w-4" />
                                                </button>
                                                <button 
                                                    onClick={() => handleViewModeChange("list")} 
                                                    className={`rounded-md p-1.5 transition-colors ${viewMode === "list" ? "bg-card shadow-sm text-indigo-600" : "text-faint hover:text-muted"}`}
                                                    aria-label="List View"
                                                >
                                                    <List className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Status Filter Tabs with Count Badges */}
                                        {uniqueStatuses.length > 0 && (
                                            <div className="flex flex-wrap gap-2 items-center">
                                                {uniqueStatuses.map(status => {
                                                    const isActive = statusFilters.includes(status);
                                                    const style = statusColorHex(status);
                                                    const count = statusCounts[status] || 0;
                                                    return (
                                                        <button
                                                            key={status}
                                                            onClick={() => toggleStatusFilter(status)}
                                                            aria-pressed={isActive}
                                                            className={`flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-xs font-bold transition-colors duration-200 cursor-pointer sm:min-h-9 ${isActive ? 'shadow-sm' : 'border-line bg-card text-muted hover:border-line hover:bg-app hover:text-fg'}`}
                                                            style={isActive ? { background: style.bg, borderColor: style.color, color: style.color } : {}}
                                                        >
                                                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: style.color }} />
                                                            <span className="uppercase">{statusLabel(status)}</span>
                                                            <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${isActive ? 'bg-card/75' : 'bg-subtle-soft text-muted'}`}>
                                                                {count}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {students.length > 10 && (
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                                            <span>Showing {Math.min(processedStudents.length, paginatedStudents.length)} of {processedStudents.length} entries</span>
                                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                                <span>Show:</span>
                                                <CustomSelect
                                                    size="sm"
                                                    className="w-20"
                                                    triggerClassName="h-8 rounded-md px-2 text-sm font-medium"
                                                    ariaLabel="Students per page"
                                                    value={String(itemsPerPage)}
                                                    onChange={(v) => setItemsPerPage(Number(v))}
                                                    options={PAGE_SIZE_OPTIONS}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {processedStudents.length === 0 ? (
                                <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 1rem", background: "var(--bg-primary)", borderRadius: "8px", border: "1px dashed var(--text-muted)" }}>
                                    No records found matching your filters.
                                </p>
                            ) : user?.role === "PARENT" ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
                                    {paginatedStudents.map(s => {
                                        const statusMap: Record<string, { text: string; Icon: any }> = {
                                            PENDING_ASSESSMENT: {
                                                text: s.has_parent_assessment ? "Assessment submitted — awaiting review" : "Waiting for your assessment",
                                                Icon: s.has_parent_assessment ? Clock : ClipboardList,
                                            },
                                            ASSESSMENT_SCHEDULED: { text: "Specialist evaluation in progress", Icon: Clock },
                                            ASSESSED: { text: "Assessment complete — enrollment pending", Icon: CheckCircle2 },
                                            ENROLLED: {
                                                text: s.parent_current_tracker_submitted ? "Enrolled & up to date" : "Monthly progress update needed",
                                                Icon: s.parent_current_tracker_submitted ? Sparkles : FileText,
                                            },
                                            ARCHIVED: { text: "Record archived", Icon: Archive },
                                        };
                                        const statusKey = s.status?.toUpperCase().replace(/ /g, "_");
                                        const statusInfo = statusMap[statusKey] ?? { text: s.status?.replace(/_/g, " "), Icon: FileText };
                                        const statusTone = statusColorClass(s.status || "ARCHIVED");

                                        const getPrimaryCTA = () => {
                                            if (s.status === "PENDING_ASSESSMENT" && !s.has_parent_assessment) {
                                                const isDraft = typeof window !== "undefined" && window.localStorage.getItem(`parent_form_draft_v2_${s.id}`);
                                                return { label: isDraft ? "Continue Assessment" : "Start Assessment", href: `/parent-onboarding?studentId=${s.id}` };
                                            }
                                            if (s.status === "ENROLLED" && !s.parent_current_tracker_submitted) {
                                                return { label: "Submit Monthly Update", href: getStudentWorkspaceHref(s.id, "parent_tracker") };
                                            }
                                            return { label: "View Progress", href: getStudentWorkspaceHref(s.id) };
                                        };
                                        const cta = getPrimaryCTA();
                                        const teamAssigned = Boolean(s.has_assigned_specialists);

                                        return (
                                            <div
                                                key={s.id}
                                                className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm"
                                            >
                                                {/* Child header */}
                                                <div className="flex items-center gap-4 border-b border-indigo-100/60 p-5">
                                                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border text-xl font-extrabold shadow-sm ${semanticToneClass("primary")}`}>
                                                        {s.first_name.charAt(0).toUpperCase()}
                                                        {s.last_name?.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <h3 className="m-0 truncate text-xl font-extrabold leading-tight text-fg">
                                                            {s.first_name} {s.last_name}
                                                        </h3>
                                                        {s.grade && s.grade !== "TBD" && (
                                                            <p className="m-0 mt-0.5 text-sm font-medium text-muted">Grade {s.grade}</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Status */}
                                                <div className={`flex items-start gap-3 border-b px-5 py-3 ${statusTone}`}>
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card/80">
                                                        <statusInfo.Icon className="h-4 w-4" aria-hidden="true" />
                                                    </div>
                                                    <p className="m-0 text-sm font-semibold leading-snug">
                                                        {statusInfo.text}
                                                    </p>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex flex-col gap-2 p-5">
                                                    <Link
                                                        href={cta.href}
                                                        onClick={() => rememberParentStudent(s.id)}
                                                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white no-underline shadow-sm transition-colors hover:bg-indigo-700"
                                                    >
                                                        {cta.label}
                                                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                                    </Link>

                                                    {s.status !== "ARCHIVED" && (
                                                        <Link
                                                            href={`/specialists?studentId=${s.id}`}
                                                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-bold text-fg no-underline transition-colors hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-700"
                                                        >
                                                            <UsersIcon className="h-4 w-4" aria-hidden="true" />
                                                            {teamAssigned ? "Clinical Team" : "Specialist Preferences"}
                                                        </Link>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    
                                    {/* Add Child Card */}
                                    {students.every(s => s.has_parent_assessment) && (
                                        <Link
                                            href="/parent-onboarding"
                                            className="group flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-app/50 p-8 text-center no-underline transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
                                            style={{ minHeight: "260px" }}
                                        >
                                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-subtle-soft text-faint transition-colors group-hover:bg-indigo-100 group-hover:text-indigo-600">
                                                <Plus className="h-6 w-6" strokeWidth={2.5} />
                                            </div>
                                            <h3 className="m-0 text-lg font-bold text-fg transition-colors group-hover:text-indigo-700">
                                                Add Another Child
                                            </h3>
                                            <p className="mt-2 text-sm text-muted max-w-[200px]">
                                                Start an onboarding assessment for a new student.
                                            </p>
                                        </Link>
                                    )}
                                </div>
                            ) : viewMode === "list" ? (
                                <div style={{ overflowX: "auto", width: "100%", borderRadius: "12px", border: "1px solid var(--border-light, var(--border-light))" }}>
                                    <table style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse", textAlign: "left", background: "var(--bg-secondary)" }}>
                                        <thead>
                                            <tr>
                                                <th onClick={() => handleStudentSort('id')} style={{ cursor: "pointer", padding: "12px 16px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light, var(--border-light))", userSelect: "none" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                        ID
                                                        <span style={{ opacity: studentSortConfig.key === 'id' ? 1 : 0.3 }}>
                                                            {studentSortConfig.key === 'id' ? (studentSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                        </span>
                                                    </div>
                                                </th>
                                                <th onClick={() => handleStudentSort('name')} style={{ cursor: "pointer", padding: "12px 16px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light, var(--border-light))", userSelect: "none" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                        STUDENT
                                                        <span style={{ opacity: studentSortConfig.key === 'name' ? 1 : 0.3 }}>
                                                            {studentSortConfig.key === 'name' ? (studentSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                        </span>
                                                    </div>
                                                </th>
                                                <th onClick={() => handleStudentSort('grade')} style={{ cursor: "pointer", padding: "12px 16px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light, var(--border-light))", userSelect: "none" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                        GRADE
                                                        <span style={{ opacity: studentSortConfig.key === 'grade' ? 1 : 0.3 }}>
                                                            {studentSortConfig.key === 'grade' ? (studentSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                        </span>
                                                    </div>
                                                </th>
                                                <th onClick={() => handleStudentSort('status')} style={{ cursor: "pointer", padding: "12px 16px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light, var(--border-light))", userSelect: "none" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                        STATUS
                                                        <span style={{ opacity: studentSortConfig.key === 'status' ? 1 : 0.3 }}>
                                                            {studentSortConfig.key === 'status' ? (studentSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                        </span>
                                                    </div>
                                                </th>
                                                <th style={{ padding: "12px 16px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light, var(--border-light))" }}>
                                                    FORMS STATUS
                                                </th>
                                                <th style={{ padding: "12px 16px", color: "var(--text-primary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--bg-primary)", borderBottom: "2px solid var(--border-light, var(--border-light))", textAlign: "right" }}>
                                                    ACTION
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedStudents.map(s => {
                                                const ss = statusColorHex(s.status || "PENDING_ASSESSMENT");
                                                const nextAction = s.next_action;
                                                return (
                                                    <tr key={s.id} className="hover:bg-app transition-colors" style={{ borderBottom: "1px solid var(--border-light, var(--border-light))", verticalAlign: "middle" }}>
                                                        <td style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                                                            #{s.id}
                                                        </td>
                                                        <td style={{ padding: "12px 16px" }}>
                                                            <Link href={getStudentWorkspaceHref(s.id)} className="hover:text-indigo-600 hover:underline transition-colors duration-200" style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: "bold", fontSize: "0.95rem" }}>
                                                                {s.first_name} {s.last_name}
                                                            </Link>
                                                        </td>
                                                        <td style={{ padding: "12px 16px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                                            {s.grade && s.grade !== "TBD" ? (s.grade.startsWith("Grade") ? s.grade : `Grade ${s.grade}`) : "Unassigned"}
                                                        </td>
                                                        <td style={{ padding: "12px 16px" }}>
                                                            <span style={{
                                                                fontSize: "0.72rem",
                                                                textTransform: "uppercase",
                                                                background: ss.bg,
                                                                color: ss.color,
                                                                padding: "4px 10px",
                                                                borderRadius: "12px",
                                                                fontWeight: "bold",
                                                                letterSpacing: "0.3px",
                                                            }}>{statusLabel(s.status) || "Pending"}</span>
                                                        </td>
                                                        <td style={{ padding: "12px 16px" }}>
                                                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxWidth: "250px" }}>
                                                                {s.status?.toUpperCase() !== "ENROLLED" && s.status?.toUpperCase() !== "INTEGRATED" ? (
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
                                                                        {s.status?.toUpperCase() === "INTEGRATED" && (
                                                                            <div
                                                                                className={getFormPillClass(s.teacher_current_tracker_submitted)}
                                                                                onClick={() => s.teacher_current_tracker_submitted ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=sped_tracker`) : toast.error("Not submitted yet.", { id: "not-submitted" })}
                                                                            >Teacher</div>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                                                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", alignItems: "center" }}>
                                                                {nextAction ? (
                                                                    nextAction.tone === "waiting" ? (
                                                                        <button 
                                                                            onClick={() => handleWaitingAction(s, nextAction)}
                                                                            style={{ 
                                                                                fontSize: "0.75rem", 
                                                                                padding: "6px 12px", 
                                                                                borderRadius: "6px", 
                                                                                fontWeight: 600,
                                                                                display: "flex",
                                                                                alignItems: "center",
                                                                                gap: "4px",
                                                                                cursor: "help",
                                                                            }} 
                                                                            className={`${getActionButtonClass(s.status, nextAction.tone)} hover:opacity-90`}
                                                                        >
                                                                            {nextAction.label}
                                                                        </button>
                                                                    ) : (
                                                                        <Link 
                                                                            href={buildStudentActionHref(s)} 
                                                                            style={{ 
                                                                                fontSize: "0.75rem", 
                                                                                padding: "6px 12px", 
                                                                                borderRadius: "6px", 
                                                                                fontWeight: 600,
                                                                                display: "flex",
                                                                                alignItems: "center",
                                                                                gap: "4px"
                                                                            }} 
                                                                            className={getActionButtonClass(s.status, nextAction.tone)}
                                                                        >
                                                                            {nextAction.tone === "positive" ? <Sparkles size={12} /> : null}
                                                                            {nextAction.label}
                                                                        </Link>
                                                                    )
                                                                ) : (
                                                                    <Link 
                                                                        href={getStudentWorkspaceHref(s.id)} 
                                                                        style={{ 
                                                                            fontSize: "0.75rem", 
                                                                            padding: "6px 12px", 
                                                                            background: "var(--bg-primary)", 
                                                                            border: "1px solid var(--border-light)", 
                                                                            borderRadius: "6px", 
                                                                            color: "var(--text-secondary)", 
                                                                            textDecoration: "none", 
                                                                            fontWeight: 600 
                                                                        }} 
                                                                        className="transition-colors hover:bg-subtle-soft"
                                                                    >
                                                                        Open Workspace
                                                                    </Link>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    {paginatedStudents.map(s => {
                                        const statusIconMap: Record<string, any> = {
                                            PENDING_ASSESSMENT: ClipboardList,
                                            ASSESSMENT_SCHEDULED: Clock,
                                            ASSESSED: CheckCircle2,
                                            ENROLLED: Sparkles,
                                            INTEGRATED: Sparkles,
                                            ARCHIVED: Archive,
                                        };
                                        const statusKey = s.status?.toUpperCase().replace(/ /g, "_");
                                        const StatusIcon = statusIconMap[statusKey] ?? FileText;
                                        const statusClass = statusColorClass(s.status || "ARCHIVED");
                                        const initials = `${s.first_name?.[0] || ""}${s.last_name?.[0] || ""}`.toUpperCase();

                                        return (
                                            <div
                                                key={s.id}
                                                className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm"
                                            >
                                                <div className="flex items-center gap-3 border-b border-indigo-100/60 p-4">
                                                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm font-extrabold shadow-sm ${semanticToneClass("primary")}`}>
                                                        {initials || "?"}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <Link
                                                            href={getStudentWorkspaceHref(s.id)}
                                                            className="m-0 block truncate text-base font-extrabold text-fg no-underline transition-colors hover:text-indigo-700"
                                                        >
                                                            {s.first_name} {s.last_name}
                                                        </Link>
                                                        <p className="m-0 mt-0.5 text-xs font-medium text-muted">
                                                            {s.grade && s.grade !== "TBD" ? `Grade ${s.grade}` : "Grade unassigned"}
                                                        </p>
                                                        {user?.role === "SPECIALIST" && Array.isArray((user as any)?.specialties) && (user as any).specialties.length > 0 && (
                                                            <div className="mt-1.5 flex flex-wrap gap-1">
                                                                {(user as any).specialties.slice(0, 2).map((sp: string) => (
                                                                    <span key={sp} className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold ${semanticToneClass("primary")}`}>
                                                                        {sp}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className={`flex items-center gap-2 border-b px-4 py-2.5 ${statusClass}`}>
                                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-card/80">
                                                        <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                                    </div>
                                                    <span className="text-xs font-bold">{statusLabel(s.status)}</span>
                                                </div>
                                                <div className="flex flex-col gap-2 p-4">
                                                    {user?.role === "SPECIALIST" && s.status === "PENDING_ASSESSMENT" ? (
                                                        <>
                                                            <Link
                                                                href={getStudentWorkspaceHref(s.id)}
                                                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white no-underline shadow-sm transition-colors hover:bg-indigo-700"
                                                            >
                                                                Open Workspace
                                                                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                                            </Link>
                                                        </>
                                                    ) : (
                                                        <Link
                                                            href={getStudentWorkspaceHref(s.id)}
                                                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white no-underline shadow-sm transition-colors hover:bg-indigo-700"
                                                        >
                                                            Open Workspace
                                                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                                        </Link>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Pagination Controls */}
                            {processedStudents.length > 0 && totalPages > 1 && (
                                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={safePage === 1}
                                        className="min-h-11 rounded-md border border-line bg-card px-4 text-sm font-semibold text-fg transition-colors hover:bg-app disabled:cursor-not-allowed disabled:bg-app disabled:text-muted"
                                    >Previous</button>
                                    <span className="min-h-11 shrink-0 px-2 py-3 text-sm text-muted">
                                        Page {safePage} of {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={safePage === totalPages}
                                        className="min-h-11 rounded-md border border-line bg-card px-4 text-sm font-semibold text-fg transition-colors hover:bg-app disabled:cursor-not-allowed disabled:bg-app disabled:text-muted"
                                    >Next</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}
