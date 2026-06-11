"use client";

import { useEffect, useState, useMemo } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import Link from "next/link";
import { Calendar, Search, ClipboardList, Clock, CheckCircle2, Sparkles, Archive, FileText, ArrowRight, Users as UsersIcon, Plus, LayoutGrid, List } from "lucide-react";
import { semanticToneClass, statusColorClass, statusColorHex, statusLabel } from "@/lib/role-colors";
import AdminDashboard from "./AdminDashboard";
import WelcomeBanner from "@/components/WelcomeBanner";
import SMSVerificationModal from "@/components/SMSVerificationModal";
import { isSpecialistOnboardingIncomplete, specialistOnboardingMessage } from "@/lib/specialist-onboarding";

interface Student {
    id: number;
    first_name: string;
    last_name: string;
    grade: string;
    status: string;
    has_parent_assessment?: boolean;
    parent_current_tracker_submitted?: boolean;
    active_cycle_label?: string | null;
    latest_final_monthly_report_id?: number | null;
}

export default function DashboardPage() {
    const { user, refreshUser } = useAuth();
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSMSModal, setShowSMSModal] = useState(false);
    const [isPhoneVerified, setIsPhoneVerified] = useState<boolean | null>(null);

    // Search / filter / pagination state
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilters, setStatusFilters] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const specialistOnboardingIncomplete = isSpecialistOnboardingIncomplete(user);

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
    }, [searchQuery, itemsPerPage]);

    // Faceted Data Processing
    const uniqueStatuses = Array.from(new Set(students.map(s => s.status))).filter(Boolean);

    const toggleStatusFilter = (status: string) => {
        setStatusFilters(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
        setCurrentPage(1);
    };

    const processedStudents = useMemo(() => {
        let result = [...students];

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(s => {
                const fullName = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
                const studentId = s.id?.toString() || '';
                return fullName.includes(query) || studentId.includes(query);
            });
        }

        if (statusFilters.length > 0) {
            result = result.filter(s => statusFilters.includes(s.status));
        }

        return result;
    }, [students, searchQuery, statusFilters]);

    const totalPages = Math.ceil(processedStudents.length / itemsPerPage);
    const safePage = Math.min(currentPage, Math.max(1, totalPages));
    const paginatedStudents = processedStudents.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

    const getSubtitle = () => {
        switch (user?.role) {
            case "TEACHER": {
                const enrolled = students.filter(s => s.status === "ENROLLED").length;
                if (enrolled === 0) {
                    return "Your students will appear here once they're enrolled.";
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
                    return "No active students yet — your caseload will appear here.";
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
                return "All caught up! Nothing needed right now ✨";
            }
            default: return "";
        }
    };

    const getTimeGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return { text: "Good morning", emoji: "☀️" };
        if (hour < 17) return { text: "Good afternoon", emoji: "👋" };
        return { text: "Good evening", emoji: "🌙" };
    };

    const getStudentWorkspaceHref = (studentId: number, tab?: string) => {
        if (user?.role === "PARENT") {
            return `/workspace?studentId=${studentId}`;
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

    if (user?.role === "ADMIN") {
        return <AdminDashboard />;
    }

    return (
        <ProtectedRoute>
            <div className="px-4 md:px-0">
                {/* SMS Verification Banner — Parent only */}
                {user?.role === "PARENT" && isPhoneVerified === false && (
                    <div className={`mb-6 flex flex-col items-start justify-between gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:px-5 sm:py-3 ${semanticToneClass("warning")}`}>
                        <div className="flex items-start gap-3">
                            <span className="text-xl leading-none mt-0.5">📱</span>
                            <p className="m-0 text-sm md:text-[0.9rem] text-amber-900 font-medium">
                                {user?.phone_number
                                    ? <>Your phone number <strong>({user.phone_number})</strong> is unverified. Verify it to enable SMS alerts and notifications.</>
                                    : <>Your phone number has not been verified yet. Verify it to enable SMS alerts and notifications.</>
                                }
                            </p>
                        </div>
                        <button
                            onClick={() => setShowSMSModal(true)}
                            className="bg-amber-500 hover:bg-amber-600 text-white border-none rounded-md px-4 py-2 font-bold cursor-pointer text-sm whitespace-nowrap transition-colors w-full sm:w-auto mt-2 sm:mt-0"
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
                        <Link href="/specialist-onboarding" className="rounded-lg bg-amber-600 px-4 py-2 text-center text-sm font-bold text-white hover:bg-amber-700">
                            Finish setup
                        </Link>
                    </div>
                )}

                {/* Page header */}
                <div className="mb-5 md:mb-8">
                    {user?.role === "PARENT" ? (
                        <>
                            <h2 className="m-0 text-xl md:text-3xl font-bold text-slate-800 flex items-center gap-2">
                                <span>{getTimeGreeting().text}, {user?.first_name || 'there'}</span>
                                <span>{getTimeGreeting().emoji}</span>
                            </h2>
                            <p className="mt-1 md:mt-2 text-sm md:text-base text-slate-500">{getSubtitle()}</p>
                        </>
                    ) : (
                        <>
                            <h2 className="m-0 text-xl md:text-3xl font-bold text-slate-800 flex items-center gap-2">
                                <span>{getTimeGreeting().text}, {user?.first_name || 'there'}</span>
                                <span>{getTimeGreeting().emoji}</span>
                            </h2>
                            <p className="mt-1 md:mt-2 text-sm md:text-base text-slate-500">{getSubtitle()}</p>
                            {students.length > 0 && (
                                <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-500">
                                    <UsersIcon className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
                                    {processedStudents.length} of {students.length} student{students.length !== 1 ? "s" : ""}
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* Content panel */}
                <div className={user?.role === "PARENT" ? "" : "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"}>
                    {loading ? (
                        <div className="flex items-center gap-2 p-8 text-sm text-slate-500">
                            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" aria-hidden="true" />
                            Loading...
                        </div>
                    ) : students.length === 0 ? (
                        user?.role === "PARENT" ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
                                <Link
                                    href="/parent-onboarding"
                                    className="group flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center no-underline transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
                                    style={{ minHeight: "260px" }}
                                >
                                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors group-hover:bg-indigo-100 group-hover:text-indigo-600">
                                        <Plus className="h-6 w-6" strokeWidth={2.5} />
                                    </div>
                                    <h3 className="m-0 text-lg font-bold text-slate-700 transition-colors group-hover:text-indigo-700">
                                        Register a New Child
                                    </h3>
                                    <p className="mt-2 text-sm text-slate-500 max-w-[200px]">
                                        Start an onboarding assessment for a new student.
                                    </p>
                                </Link>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-12 text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
                                    <UsersIcon className="h-6 w-6" aria-hidden="true" />
                                </div>
                                <p className="m-0 text-sm font-medium text-slate-500">
                                    No students assigned at this time.
                                </p>
                            </div>
                        )
                    ) : (
                        <div>
                            {/* Action Bar (Search, Filters) */}
                            {!(user?.role === "PARENT" && students.length < 5) && (
                                <>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", flex: "1 1 auto" }}>
                                            <div style={{ position: "relative", flex: "1 1 280px", maxWidth: "400px" }}>
                                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                <input
                                                    type="text"
                                                    placeholder="Search by name or ID..."
                                                    value={searchQuery}
                                                    onChange={e => setSearchQuery(e.target.value)}
                                                    style={{
                                                        width: "100%",
                                                        padding: "8px 12px 8px 36px",
                                                        borderRadius: "6px",
                                                        border: "1px solid #e2e8f0",
                                                        fontSize: "0.9rem",
                                                        height: "38px",
                                                        outline: "none",
                                                        boxSizing: "border-box",
                                                        background: "#f8fafc",
                                                    }}
                                                />
                                            </div>
                                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                                                {uniqueStatuses.map(s => {
                                                    const isActive = statusFilters.includes(s);
                                                    return (
                                                        <button
                                                            key={s}
                                                            onClick={() => toggleStatusFilter(s)}
                                                            style={{
                                                                padding: "6px 14px",
                                                                borderRadius: "20px",
                                                                border: `1px solid ${isActive ? 'var(--accent-primary)' : '#e2e8f0'}`,
                                                                fontSize: "0.8rem",
                                                                fontWeight: isActive ? 600 : 400,
                                                                background: isActive ? '#eff6ff' : '#f8fafc',
                                                                color: isActive ? 'var(--accent-primary)' : '#475569',
                                                                cursor: "pointer",
                                                                transition: "all 0.2s"
                                                            }}
                                                        >
                                                            {s.replace(/_/g, " ")}
                                                        </button>
                                                    );
                                                })}
                                                {(searchQuery || statusFilters.length > 0) && (
                                                    <button 
                                                        onClick={() => { setSearchQuery(''); setStatusFilters([]); }}
                                                        style={{ padding: "6px 12px", background: "none", border: "none", color: "#64748b", fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}
                                                    >
                                                        Clear Filters
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 shrink-0 ml-auto">
                                            <button 
                                                onClick={() => handleViewModeChange("grid")} 
                                                className={`rounded-md p-1.5 transition-colors ${viewMode === "grid" ? "bg-white shadow-sm text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
                                                aria-label="Grid View"
                                            >
                                                <LayoutGrid className="h-4 w-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleViewModeChange("list")} 
                                                className={`rounded-md p-1.5 transition-colors ${viewMode === "list" ? "bg-white shadow-sm text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
                                                aria-label="List View"
                                            >
                                                <List className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {students.length > 10 && (
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", color: "#64748b", marginBottom: "1rem" }}>
                                            <span>Showing {Math.min(processedStudents.length, paginatedStudents.length)} of {processedStudents.length} entries</span>
                                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                                <span>Show:</span>
                                                <select
                                                    value={itemsPerPage}
                                                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                                                    style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f8fafc" }}
                                                >
                                                    <option value={10}>10</option>
                                                    <option value={25}>25</option>
                                                    <option value={50}>50</option>
                                                    <option value={100}>100</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {processedStudents.length === 0 ? (
                                <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 1rem", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
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

                                        return (
                                            <div
                                                key={s.id}
                                                className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                                            >
                                                {/* Child header */}
                                                <div className="flex items-center gap-4 border-b border-indigo-100/60 p-5">
                                                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border text-xl font-extrabold shadow-sm ${semanticToneClass("primary")}`}>
                                                        {s.first_name.charAt(0).toUpperCase()}
                                                        {s.last_name?.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <h3 className="m-0 truncate text-xl font-extrabold leading-tight text-slate-900">
                                                            {s.first_name} {s.last_name}
                                                        </h3>
                                                        {s.grade && s.grade !== "TBD" && (
                                                            <p className="m-0 mt-0.5 text-sm font-medium text-slate-500">Grade {s.grade}</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Status */}
                                                <div className={`flex items-start gap-3 border-b px-5 py-3 ${statusTone}`}>
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/80">
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
                                                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 no-underline transition-colors hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-700"
                                                        >
                                                            <UsersIcon className="h-4 w-4" aria-hidden="true" />
                                                            Specialist Preferences
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
                                            className="group flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center no-underline transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
                                            style={{ minHeight: "260px" }}
                                        >
                                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors group-hover:bg-indigo-100 group-hover:text-indigo-600">
                                                <Plus className="h-6 w-6" strokeWidth={2.5} />
                                            </div>
                                            <h3 className="m-0 text-lg font-bold text-slate-700 transition-colors group-hover:text-indigo-700">
                                                Add Another Child
                                            </h3>
                                            <p className="mt-2 text-sm text-slate-500 max-w-[200px]">
                                                Start an onboarding assessment for a new student.
                                            </p>
                                        </Link>
                                    )}
                                </div>
                            ) : viewMode === "list" ? (
                                <div style={{ overflowX: "auto", width: "100%", borderRadius: "12px", border: "1px solid var(--border-light, #e2e8f0)" }}>
                                    <table style={{ width: "100%", minWidth: "700px", borderCollapse: "collapse", textAlign: "left", background: "white" }}>
                                        <thead>
                                            <tr>
                                                <th style={{ padding: "12px 16px", color: "#64748b", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid var(--border-light, #e2e8f0)", backgroundColor: "#f8fafc" }}>Student</th>
                                                <th style={{ padding: "12px 16px", color: "#64748b", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid var(--border-light, #e2e8f0)", backgroundColor: "#f8fafc" }}>Grade</th>
                                                <th style={{ padding: "12px 16px", color: "#64748b", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid var(--border-light, #e2e8f0)", backgroundColor: "#f8fafc" }}>Status</th>
                                                <th style={{ padding: "12px 16px", color: "#64748b", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid var(--border-light, #e2e8f0)", backgroundColor: "#f8fafc", textAlign: "right" }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedStudents.map(s => {
                                                const ss = statusColorHex(s.status || "PENDING_ASSESSMENT");
                                                return (
                                                    <tr key={s.id} className="hover:bg-slate-50 transition-colors" style={{ borderBottom: "1px solid var(--border-light, #e2e8f0)", verticalAlign: "middle" }}>
                                                        <td style={{ padding: "12px 16px" }}>
                                                            <Link href={getStudentWorkspaceHref(s.id)} className="hover:text-indigo-600 hover:underline transition-colors duration-200" style={{ color: "#0f172a", textDecoration: "none", fontWeight: "bold", fontSize: "0.95rem" }}>
                                                                {s.first_name} {s.last_name}
                                                            </Link>
                                                        </td>
                                                        <td style={{ padding: "12px 16px", fontSize: "0.85rem", color: "#64748b" }}>{s.grade && s.grade !== "TBD" ? `Grade ${s.grade}` : "Unassigned"}</td>
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
                                                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                                                            <Link
                                                                href={getStudentWorkspaceHref(s.id)}
                                                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 no-underline transition-colors hover:bg-indigo-100"
                                                            >
                                                                Open Workspace
                                                            </Link>
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
                                                className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                                            >
                                                <div className="flex items-center gap-3 border-b border-indigo-100/60 p-4">
                                                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm font-extrabold shadow-sm ${semanticToneClass("primary")}`}>
                                                        {initials || "?"}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <Link
                                                            href={getStudentWorkspaceHref(s.id)}
                                                            className="m-0 block truncate text-base font-extrabold text-slate-900 no-underline transition-colors hover:text-indigo-700"
                                                        >
                                                            {s.first_name} {s.last_name}
                                                        </Link>
                                                        <p className="m-0 mt-0.5 text-xs font-medium text-slate-500">
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
                                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/80">
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
                                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "1rem" }}>
                                    <button 
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                        disabled={safePage === 1}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", background: safePage === 1 ? "#f8fafc" : "white", color: safePage === 1 ? "#cbd5e1" : "inherit", cursor: safePage === 1 ? "not-allowed" : "pointer" }}
                                    >Previous</button>
                                    <span style={{ padding: "6px 12px", fontSize: "0.9rem", color: "#64748b" }}>
                                        Page {safePage} of {totalPages}
                                    </span>
                                    <button 
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                                        disabled={safePage === totalPages}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", background: safePage === totalPages ? "#f8fafc" : "white", color: safePage === totalPages ? "#cbd5e1" : "inherit", cursor: safePage === totalPages ? "not-allowed" : "pointer" }}
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
