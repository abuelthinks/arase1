"use client";

import { useEffect, useState, useMemo } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import Link from "next/link";
import { Search } from "lucide-react";
import AdminDashboard from "./AdminDashboard";
import WelcomeBanner from "@/components/WelcomeBanner";
import SMSVerificationModal from "@/components/SMSVerificationModal";

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

const statusColors: Record<string, { bg: string; color: string }> = {
    PENDING_ASSESSMENT:    { bg: "#fce7f3", color: "#9d174d" },
    ASSESSMENT_SCHEDULED: { bg: "#fef3c7", color: "#92400e" },
    ASSESSED:     { bg: "#dbeafe", color: "#1e40af" },
    ENROLLED:     { bg: "#dcfce7", color: "#14532d" },
    ARCHIVED:   { bg: "#f1f5f9", color: "#64748b" },
};

export default function DashboardPage() {
    const { user, refreshUser } = useAuth();
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSMSModal, setShowSMSModal] = useState(false);
    const [isPhoneVerified, setIsPhoneVerified] = useState<boolean | null>(null);

    // Advanced Table States
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilters, setStatusFilters] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: keyof Student | 'name', direction: 'asc' | 'desc' } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

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

    const handleSort = (key: keyof Student | 'name') => {
        setSortConfig(current => {
            if (!current || current.key !== key) return { key, direction: 'asc' };
            if (current.direction === 'asc') return { key, direction: 'desc' };
            return null;
        });
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

        if (sortConfig) {
            result.sort((a, b) => {
                let aValue: any = a[sortConfig.key as keyof Student];
                let bValue: any = b[sortConfig.key as keyof Student];

                if (sortConfig.key === 'name') {
                    aValue = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
                    bValue = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [students, searchQuery, statusFilters, sortConfig]);

    const totalPages = Math.ceil(processedStudents.length / itemsPerPage);
    const safePage = Math.min(currentPage, Math.max(1, totalPages));
    const paginatedStudents = processedStudents.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

    const getSubtitle = () => {
        switch (user?.role) {
            case "TEACHER": return "Select a student to provide academic and behavioral inputs.";
            case "SPECIALIST": return "Select a student to log therapy metrics and checklists.";
            case "PARENT": {
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

    const getPrimaryInputTab = () => {
        if (user?.role === "SPECIALIST") return "multi_assessment";
        if (user?.role === "TEACHER") return "sped_tracker";
        return undefined;
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
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 p-4 sm:px-5 sm:py-3 rounded-lg border border-amber-400"
                        style={{ background: "linear-gradient(90deg, #fef3c7, #fffbeb)" }}>
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
                            <h2 className="m-0 text-xl md:text-3xl font-bold text-slate-800 flex items-baseline gap-2">
                                My Students
                                {students.length > 0 && <span className="text-base md:text-xl text-slate-400 font-normal">({processedStudents.length})</span>}
                            </h2>
                            <p className="mt-1 md:mt-2 text-sm md:text-base text-slate-500">{getSubtitle()}</p>
                        </>
                    )}
                </div>

                {/* Content panel */}
                <div className="glass-panel p-4 sm:p-6 md:p-8" style={{ background: "white", borderRadius: "12px", border: "1px solid var(--border-light)", minHeight: "60vh" }}>
                    {loading ? (
                        <p>Loading...</p>
                    ) : students.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
                            <p style={{ color: "var(--text-muted)", fontSize: "1.1rem" }}>
                                {user?.role === "PARENT" ? "No children assigned yet. Please contact the administrator." : "No students assigned at this time."}
                            </p>
                        </div>
                    ) : (
                        <div>
                            {/* Action Bar (Search, Filters) */}
                            {!(user?.role === "PARENT" && students.length < 3) && (
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
                                    </div>

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
                                </>
                            )}

                            {processedStudents.length === 0 ? (
                                <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 1rem", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                                    No records found matching your filters.
                                </p>
                            ) : user?.role === "PARENT" ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                                    {paginatedStudents.map(s => {
                                        // Plain-English status mapping
                                        const statusMap: Record<string, { text: string; color: string; bg: string; icon: string }> = {
                                            PENDING_ASSESSMENT: {
                                                text: s.has_parent_assessment ? "Assessment submitted — awaiting review" : "Waiting for your assessment",
                                                color: s.has_parent_assessment ? "#92400e" : "#c2410c",
                                                bg: s.has_parent_assessment ? "#fef3c7" : "#fff7ed",
                                                icon: s.has_parent_assessment ? "⏳" : "📋",
                                            },
                                            ASSESSMENT_SCHEDULED: { text: "Specialist evaluation in progress", color: "#1e40af", bg: "#dbeafe", icon: "🔍" },
                                            ASSESSED: { text: "Assessment complete — enrollment pending", color: "#1e40af", bg: "#eff6ff", icon: "✅" },
                                            ENROLLED: {
                                                text: s.parent_current_tracker_submitted ? "Enrolled & up to date" : "Monthly progress update needed",
                                                color: s.parent_current_tracker_submitted ? "#166534" : "#c2410c",
                                                bg: s.parent_current_tracker_submitted ? "#f0fdf4" : "#fff7ed",
                                                icon: s.parent_current_tracker_submitted ? "🌟" : "📝",
                                            },
                                            ARCHIVED: { text: "Record archived", color: "#64748b", bg: "#f1f5f9", icon: "📁" },
                                        };
                                        const statusKey = s.status?.toUpperCase().replace(/ /g, "_");
                                        const statusInfo = statusMap[statusKey] ?? { text: s.status?.replace(/_/g, " "), color: "#475569", bg: "#f1f5f9", icon: "📄" };

                                        // Determine the single primary CTA
                                        const getPrimaryCTA = () => {
                                            if (s.status === "PENDING_ASSESSMENT" && !s.has_parent_assessment) {
                                                return { label: "Start Assessment", href: `/parent-onboarding?studentId=${s.id}`, style: "primary" as const };
                                            }
                                            if (s.status === "ENROLLED" && !s.parent_current_tracker_submitted) {
                                                return { label: "Submit Monthly Update", href: getStudentWorkspaceHref(s.id, "parent_tracker"), style: "primary" as const };
                                            }
                                            return { label: "View Progress", href: `/students/${s.id}`, style: "secondary" as const };
                                        };
                                        const cta = getPrimaryCTA();

                                        return (
                                            <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-0 flex flex-col shadow-sm hover:shadow-md transition-all relative overflow-hidden group hover:border-blue-200">
                                                {/* Child header with gradient */}
                                                <div style={{ background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 50%, #dbeafe 100%)", padding: "1.5rem 1.5rem 1.25rem", position: "relative", overflow: "hidden" }}>
                                                    <div style={{ position: "absolute", top: "-20px", right: "-20px", width: "80px", height: "80px", borderRadius: "50%", background: "rgba(99,102,241,0.06)" }}></div>
                                                    <div className="flex items-center gap-4 relative z-[1]">
                                                        <div className="w-14 h-14 rounded-full bg-white text-indigo-600 flex items-center justify-center text-2xl font-black border-2 border-white shadow-sm transition-transform group-hover:scale-105 shrink-0">
                                                            {s.first_name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <h3 className="font-extrabold text-xl text-slate-900 leading-tight truncate">{s.first_name} {s.last_name}</h3>
                                                            {s.grade && s.grade !== "TBD" && (
                                                                <p className="text-slate-500 text-sm font-medium mt-0.5">Grade {s.grade}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Status section */}
                                                <div style={{ padding: "1rem 1.5rem", background: statusInfo.bg, borderBottom: "1px solid #e2e8f0" }}>
                                                    <div className="flex items-center gap-2">
                                                        <span style={{ fontSize: "1.1rem" }}>{statusInfo.icon}</span>
                                                        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: statusInfo.color, lineHeight: 1.4 }}>
                                                            {statusInfo.text}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* CTA section */}
                                                <div style={{ padding: "1.25rem 1.5rem" }}>
                                                    <Link
                                                        href={cta.href}
                                                        onClick={() => rememberParentStudent(s.id)}
                                                        className={cta.style === "primary" ? "btn-primary" : "btn-indigo"}
                                                        style={{ textDecoration: "none", padding: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", boxSizing: "border-box" }}
                                                    >
                                                        {cta.label}
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                                    </Link>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <>
                                    <div className="hidden md:block" style={{ overflowX: "auto", width: "100%", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                                        <table style={{ width: "100%", minWidth: "500px", borderCollapse: "collapse", textAlign: "left" }}>
                                            <thead>
                                                <tr>
                                                    <th onClick={() => handleSort('name')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            NAME
                                                            <span style={{ opacity: sortConfig?.key === 'name' ? 1 : 0.3 }}>
                                                                {sortConfig?.key === 'name' ? (sortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleSort('grade')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            GRADE
                                                            <span style={{ opacity: sortConfig?.key === 'grade' ? 1 : 0.3 }}>
                                                                {sortConfig?.key === 'grade' ? (sortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleSort('status')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            STATUS
                                                            <span style={{ opacity: sortConfig?.key === 'status' ? 1 : 0.3 }}>
                                                                {sortConfig?.key === 'status' ? (sortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th style={{ padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedStudents.map(s => {
                                                    const badge = statusColors[s.status?.toUpperCase()] ?? { bg: "#f1f5f9", color: "#475569" };
                                                    return (
                                                        <tr key={s.id} style={{ borderBottom: "1px solid var(--border-light)", verticalAlign: "middle" }} className="hover:bg-slate-50 transition-colors duration-150">
                                                            <td style={{ padding: "12px" }}>
                                                                <Link href={getStudentWorkspaceHref(s.id)} style={{ fontWeight: "bold", color: "var(--text-primary)", textDecoration: "none" }} className="hover:text-blue-600 transition-colors">
                                                                    {s.first_name} {s.last_name}
                                                                </Link>
                                                            </td>
                                                            <td style={{ padding: "12px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                                                                {s.grade && s.grade !== "TBD" ? s.grade : <span className="text-slate-400 italic">Not yet assigned</span>}
                                                            </td>
                                                            <td style={{ padding: "12px" }}>
                                                                <span style={{
                                                                    fontSize: "0.72rem",
                                                                    fontWeight: "bold",
                                                                    padding: "4px 10px",
                                                                    borderRadius: "12px",
                                                                    textTransform: "uppercase",
                                                                    letterSpacing: "0.3px",
                                                                    background: badge.bg,
                                                                    color: badge.color,
                                                                }}>
                                                                    {s.status?.replace(/_/g, " ")}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: "12px", textAlign: "right" }}>
                                                                <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" }}>
                                                                    {s.status === "PENDING_ASSESSMENT" && (
                                                                        <Link 
                                                                            href={getStudentWorkspaceHref(s.id, getPrimaryInputTab())}
                                                                            className="btn-indigo"
                                                                            style={{ textDecoration: "none" }}
                                                                        >
                                                                            Start Assessment
                                                                        </Link>
                                                                    )}
                                                                    <Link 
                                                                        href={getStudentWorkspaceHref(s.id)} 
                                                                        className="hover:bg-blue-50 transition-colors duration-200 block"
                                                                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "6px", background: "none", color: "#3b82f6" }}
                                                                        title="Open Workspace"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                                                    </Link>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="md:hidden flex flex-col gap-4 w-full">
                                        {paginatedStudents.map(s => {
                                            const badge = statusColors[s.status?.toUpperCase()] ?? { bg: "#f1f5f9", color: "#475569" };
                                            return (
                                                <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-3">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="flex flex-col">
                                                            <Link href={getStudentWorkspaceHref(s.id)} className="font-bold text-[var(--text-primary)] no-underline text-lg hover:text-blue-600 transition-colors">
                                                                {s.first_name} {s.last_name}
                                                            </Link>
                                                            <span className="text-sm text-slate-500 mt-0.5">{s.grade && s.grade !== "TBD" ? `Grade: ${s.grade}` : "Grade: Unassigned"}</span>
                                                        </div>
                                                        <span style={{ fontSize: "0.65rem", fontWeight: "bold", padding: "4px 8px", borderRadius: "12px", textTransform: "uppercase", background: badge.bg, color: badge.color, textAlign: "center", whiteSpace: "nowrap" }}>
                                                            {s.status?.replace(/_/g, " ")}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-2 justify-end mt-2 pt-2 border-t border-slate-100">
                                                        {s.status === "PENDING_ASSESSMENT" && (
                                                            <Link href={getStudentWorkspaceHref(s.id, getPrimaryInputTab())} className="btn-indigo flex-1 text-center justify-center text-sm py-2">Start Assessment</Link>
                                                        )}
                                                        <Link href={getStudentWorkspaceHref(s.id)} className="btn-secondary flex-1 text-center justify-center text-sm py-2">Workspace</Link>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
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
