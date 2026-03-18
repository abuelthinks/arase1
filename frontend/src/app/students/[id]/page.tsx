"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

interface FormStatus {
    submitted: boolean;
    id: number | null;
}

interface StaffMember {
    id: number;
    first_name: string;
    last_name: string;
    username: string;
    email: string;
    role: string;
    specialty: string;
    caseload: number;
    recommended: boolean;
}

interface ProfileData {
    student: {
        id: number;
        first_name: string;
        last_name: string;
        grade: string;
        date_of_birth: string;
        status: string;
    };
    active_cycle: {
        id: number;
        start_date: string;
        end_date: string;
    } | null;
    form_statuses: {
        parent_assessment: FormStatus;
        multi_assessment: FormStatus;
        sped_assessment: FormStatus;
        parent_tracker: FormStatus;
        multi_tracker: FormStatus;
        sped_tracker: FormStatus;
    };
    generated_documents: {
        id: number;
        type: string;
        file_url: string;
        created_at: string;
        has_iep_data?: boolean;
    }[];
    assigned_staff: { id: number; role: string }[];
}

const statusConfig: Record<string, { label: string; bg: string; color: string }> = {
    "Pending Assessment":    { label: "Pending Assessment",    bg: "#fef3c7", color: "#92400e" },
    "Assessment Requested":  { label: "Assessment Requested",  bg: "#dbeafe", color: "#1e40af" },
    "Assessment Scheduled":  { label: "Assessment Scheduled",  bg: "#ede9fe", color: "#5b21b6" },
    "Assessed":              { label: "Assessed",              bg: "#d1fae5", color: "#065f46" },
    "Enrolled":              { label: "Enrolled",              bg: "#dcfce7", color: "#14532d" },
};

// Which form keys each role CAN FILL (owns)
const ownedFormKeys: Record<string, string[]> = {
    PARENT:     ["parent_assessment", "parent_tracker"],
    TEACHER:    ["sped_assessment",   "sped_tracker"],
    SPECIALIST: ["multi_assessment",  "multi_tracker"],
};

// Which form keys each role can VIEW (includes read-only access to parent form for staff)
const roleFormKeys: Record<string, string[]> = {
    PARENT:     ["parent_assessment", "parent_tracker"],
    TEACHER:    ["parent_assessment", "sped_assessment", "sped_tracker"],
    SPECIALIST: ["parent_assessment", "multi_assessment", "multi_tracker"],
};

// Human-friendly names for each form key
const formLabels: Record<string, string> = {
    parent_assessment: "Parent Assessment",
    parent_tracker:    "Parent Progress",
    sped_assessment:   "Teacher Assessment",
    sped_tracker:      "Teacher Progress",
    multi_assessment:  "Specialist Assessment",
    multi_tracker:     "Specialist Progress",
};

// Route for starting / viewing each form
const formRoutes: Record<string, string> = {
    parent_assessment: "/parent-onboarding",
    parent_tracker:    "/forms/parent-tracker",
    sped_assessment:   "/forms/teacher",
    sped_tracker:      "/forms/teacher",
    multi_assessment:  "/forms/specialist-a",
    multi_tracker:     "/forms/specialist-b",
};

export default function StudentProfilePage() {
    const { id } = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const [data, setData] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [staffList, setStaffList] = useState<StaffMember[]>([]);
    const [assigning, setAssigning] = useState<number | null>(null); // tracks which staff id is being assigned

    // Delete modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deleteError, setDeleteError] = useState("");

    const fetchProfile = async () => {
        try {
            const res = await api.get(`/api/students/${id}/profile/`);
            setData(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || "Failed to load profile.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user && id) {
            fetchProfile();
            // Fetch staff list for admins
            if (user.role === "ADMIN") {
                api.get(`/api/staff/?student_id=${id}`).then(res => setStaffList(res.data)).catch(() => {});
            }
        }
    }, [user, id]);

    const handleAssign = async (type: "specialist" | "teacher", staffId: number) => {
        setAssigning(staffId);
        try {
            const endpoint = type === "specialist" ? "assign-specialist" : "assign-teacher";
            const payload = type === "specialist" ? { specialist_id: staffId } : { teacher_id: staffId };
            await api.post(`/api/students/${id}/${endpoint}/`, payload);
            await fetchProfile();
        } catch (err: any) {
            alert(err.response?.data?.error || "Assignment failed.");
        } finally {
            setAssigning(null);
        }
    };

    const handleAction = async (endpoint: string, payload: any = {}) => {
        try {
            await api.post(`/api/students/${id}/${endpoint}/`, payload);
            fetchProfile();
        } catch (err: any) {
            alert(err.response?.data?.error || "Action failed.");
        }
    };

    const handleDeleteStudent = async () => {
        if (!data) return;
        const expectedName = `${data.student.first_name} ${data.student.last_name}`;
        if (deleteConfirmText !== expectedName) {
            setDeleteError("Name does not match.");
            return;
        }
        try {
            setDeleteError("");
            await api.delete(`/api/students/${id}/`);
            router.push("/dashboard");
        } catch (err: any) {
            setDeleteError(err.response?.data?.error || err.response?.data?.detail || "Failed to delete student.");
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Loading profile...</div>;
    if (error)   return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!data)   return null;

    const { student, active_cycle, form_statuses, generated_documents } = data;
    const statusBadge = statusConfig[student.status] ?? { label: student.status, bg: "#f1f5f9", color: "#475569" };

    // Which form keys to show for the current user
    const visibleFormKeys: (keyof typeof form_statuses)[] =
        user?.role === "ADMIN"
            ? (Object.keys(form_statuses) as (keyof typeof form_statuses)[])
            : (roleFormKeys[user?.role ?? ""] ?? []) as (keyof typeof form_statuses)[];

    // Lifecycle action button (role-aware)
    const renderLifecycleAction = () => {
        if (user?.role === "PARENT") {
            if (student.status === "Pending Assessment") {
                // Must submit parent assessment form before requesting
                if (!form_statuses.parent_assessment?.submitted) {
                    return (
                        <div>
                            <p style={{ fontSize: "0.85rem", color: "#92400e", marginBottom: "8px" }}>
                                Please fill in the <strong>Parent Assessment</strong> form before requesting an assessment.
                            </p>
                            <Link
                                href={`/parent-onboarding?studentId=${student.id}`}
                                className="btn-primary px-5 py-2 text-sm"
                                style={{ textDecoration: "none", display: "inline-block" }}
                            >
                                + Fill Parent Assessment
                            </Link>
                        </div>
                    );
                }
                return (
                    <button
                        onClick={() => handleAction("request-assessment")}
                        className="btn-primary px-5 py-2 text-sm"
                    >
                        Request Assessment
                    </button>
                );
            }
            if (student.status === "Assessment Requested") {
                return (
                    <span className="text-sm text-slate-500 italic">Assessment request pending review…</span>
                );
            }
        }
        if (user?.role === "ADMIN") {
            if (student.status === "Assessed") {
                return (
                    <button
                        onClick={() => handleAction("enroll")}
                        className="btn-primary px-5 py-2 text-sm"
                    >
                        Formally Enroll Student
                    </button>
                );
            }
            // For admin, lifecycle action is now handled by the assignment panel below
            return null;
        }
        return null;
    };

    return (
        <>
        <ProtectedRoute>
            <div style={{ maxWidth: "960px", margin: "0 auto" }}>
            {/* Breadcrumb Nav */}
            <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "8px" }}>
                <button type="button" onClick={() => router.back()}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", color: "#64748b", fontWeight: 600, fontSize: "0.9rem" }}
                    onMouseOver={(e) => e.currentTarget.style.color = "#2563eb"}
                    onMouseOut={(e) => e.currentTarget.style.color = "#64748b"}
                >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Dashboard
                </button>
                <span style={{ color: "#cbd5e1" }}>›</span>
                <span style={{ color: "#0f172a", fontWeight: 600, fontSize: "0.9rem" }}>
                    {student.first_name} {student.last_name}
                </span>
            </div>

                <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "1.5rem", alignItems: "start" }}>

                    {/* ── Left: Student Info ── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <div className="glass-panel" style={{ background: "white", borderRadius: "14px", padding: "1.75rem", border: "1px solid var(--border-light)" }}>
                            {/* Avatar */}
                            <div style={{
                                width: "60px", height: "60px", borderRadius: "50%",
                                background: "#dbeafe", color: "#1e40af",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "1.4rem", fontWeight: 700, marginBottom: "1rem",
                            }}>
                                {student.first_name[0]}{student.last_name[0]}
                            </div>

                            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>
                                {student.first_name} {student.last_name}
                            </h1>

                            {/* Status badge */}
                            <span style={{
                                display: "inline-block", marginBottom: "1.25rem",
                                fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
                                letterSpacing: "0.5px", padding: "4px 10px", borderRadius: "999px",
                                background: statusBadge.bg, color: statusBadge.color,
                            }}>
                                {statusBadge.label}
                            </span>

                            {/* Details */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.875rem" }}>
                                {[
                                    { label: "Grade",         value: student.grade || "TBD" },
                                    { label: "Date of Birth", value: new Date(student.date_of_birth + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
                                    { label: "Student ID",    value: `#${student.id}` },
                                    {
                                        label: "Report Cycle",
                                        value: active_cycle
                                            ? `${new Date(active_cycle.start_date).toLocaleDateString()} – ${new Date(active_cycle.end_date).toLocaleDateString()}`
                                            : "No active cycle",
                                    },
                                ].map(({ label, value }) => (
                                    <div key={label} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                                        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                                        <span style={{ fontWeight: 600, color: "var(--text-primary)", textAlign: "right", maxWidth: "55%" }}>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Lifecycle action */}
                        {renderLifecycleAction() && (
                            <div className="glass-panel" style={{ background: "white", borderRadius: "14px", padding: "1.25rem 1.75rem", border: "1px solid var(--border-light)" }}>
                                <p style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.5px", marginBottom: "10px" }}>
                                    Next Action
                                </p>
                                {renderLifecycleAction()}
                            </div>
                        )}

                        {/* Admin: Danger Zone */}
                        {user?.role === "ADMIN" && (
                            <div style={{ borderRadius: "14px", padding: "1.25rem 1.75rem", border: "1px solid #fca5a5", background: "#fff5f5" }}>
                                <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#b91c1c", letterSpacing: "0.5px", marginBottom: "8px" }}>
                                    Danger Zone
                                </p>
                                <p style={{ fontSize: "0.8rem", color: "#7f1d1d", marginBottom: "12px" }}>
                                    Deleting this student will permanently remove all associated assessments, documents, and records.
                                </p>
                                <button
                                    onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(""); setDeleteError(""); }}
                                    style={{
                                        width: "100%", padding: "9px", borderRadius: "8px",
                                        background: "white", border: "1px solid #f87171",
                                        color: "#dc2626", fontWeight: 700, fontSize: "0.85rem",
                                        cursor: "pointer",
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.background = "#fef2f2"; }}
                                    onMouseOut={e => { e.currentTarget.style.background = "white"; }}
                                >
                                    🗑 Delete Student
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── Right: Forms + Documents ── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

                        {/* Form submission status */}
                        {visibleFormKeys.length > 0 && (
                            <div className="glass-panel" style={{ background: "white", borderRadius: "14px", padding: "1.75rem", border: "1px solid var(--border-light)" }}>
                                <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "1.25rem" }}>
                                    Input Forms
                                </h2>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
                                    {visibleFormKeys.map((key) => {
                                        const fs: FormStatus = form_statuses[key] ?? { submitted: false, id: null };
                                        const label = formLabels[key] ?? key;
                                        const route = formRoutes[key] ?? "#";
                                        return (
                                            <div key={key} style={{
                                                borderRadius: "10px", padding: "14px 16px",
                                                border: `1px solid ${fs.submitted ? "#a7f3d0" : "#e2e8f0"}`,
                                                background: fs.submitted ? "#f0fdf4" : "#f8fafc",
                                            }}>
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                                                    <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", margin: 0 }}>
                                                        {label}
                                                    </p>
                                                    {/* Show Read Only badge for forms the user can view but not fill */}
                                                    {user?.role !== "ADMIN" && !ownedFormKeys[user?.role ?? ""]?.includes(key) && (
                                                        <span style={{ fontSize: "0.65rem", fontWeight: 700, background: "#f1f5f9", color: "#64748b", padding: "2px 6px", borderRadius: "4px", letterSpacing: "0.3px" }}>
                                                            READ ONLY
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                                                    {fs.submitted ? (
                                                        <><svg style={{ width: 16, height: 16, color: "#16a34a", flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#16a34a" }}>Submitted</span></>
                                                    ) : (
                                                        <><svg style={{ width: 16, height: 16, color: "#94a3b8", flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#94a3b8" }}>Pending</span></>
                                                    )}
                                                </div>
                                                {fs.submitted ? (
                                                    <Link href={`${route}?studentId=${student.id}&mode=view&submissionId=${fs.id}`} style={{ fontSize: "0.8rem", color: "#2563eb", textDecoration: "none", fontWeight: 500 }} className="hover:underline">
                                                        View submission →
                                                    </Link>
                                                ) : (
                                                    // Only show fill link if this role OWNS the form
                                                    ownedFormKeys[user?.role ?? ""]?.includes(key) && (
                                                        // Check if this is a progress tracker and student is not enrolled
                                                        (key.includes("tracker") && student.status !== "Enrolled") ? (
                                                            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", color: "#64748b", fontWeight: 500 }}>
                                                                <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                                                Locked until Enrolled
                                                            </div>
                                                        ) : (
                                                            <Link href={`${route}?studentId=${student.id}`} style={{ fontSize: "0.8rem", color: "#2563eb", textDecoration: "none", fontWeight: 500 }} className="hover:underline">
                                                                + Fill form
                                                            </Link>
                                                        )
                                                    )
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Admin: Staff Assignment Panel */}
                        {user?.role === "ADMIN" && (
                            <div className="glass-panel" style={{ background: "white", borderRadius: "14px", border: "1px solid var(--border-light)", overflow: "hidden" }}>
                                <div style={{ padding: "1.25rem 1.75rem", borderBottom: "1px solid var(--border-light)", background: "#f8fafc" }}>
                                    <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Assign Staff</h2>
                                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>Assign a specialist and teacher to this student.</p>
                                </div>
                                <div style={{ padding: "1.25rem 1.75rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                    {(["SPECIALIST", "TEACHER"] as const).map(role => {
                                        const assignedIds = (data.assigned_staff ?? []).filter(s => s.role === role).map(s => s.id);
                                        const list = staffList.filter(s => s.role === role);
                                        return (
                                            <div key={role}>
                                                <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", marginBottom: "10px" }}>
                                                    {role === "SPECIALIST" ? "Specialists" : "Teachers"}
                                                </p>
                                                {list.length === 0 ? (
                                                    <p style={{ fontSize: "0.85rem", color: "#94a3b8", fontStyle: "italic" }}>No {role.toLowerCase()}s found.</p>
                                                ) : (
                                                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                                        {list.map(s => {
                                                            const alreadyAssigned = assignedIds.includes(s.id);
                                                            const isLoading = assigning === s.id;
                                                            return (
                                                                <div key={s.id} style={{
                                                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                                                    padding: "10px 12px",
                                                                    borderRadius: "8px",
                                                                    border: `1px solid ${alreadyAssigned ? "#a7f3d0" : "#e2e8f0"}`,
                                                                    background: alreadyAssigned ? "#f0fdf4" : "#f8fafc",
                                                                    gap: "8px",
                                                                }}>
                                                                    <div style={{ minWidth: 0 }}>
                                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "2px" }}>
                                                                            <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                                                                                {s.first_name || s.last_name ? `${s.first_name} ${s.last_name}`.trim() : s.username}
                                                                            </p>
                                                                            {s.recommended && (
                                                                                <span style={{ fontSize: "0.68rem", fontWeight: 700, background: "#fef3c7", color: "#92400e", padding: "1px 7px", borderRadius: "999px", display: "inline-flex", alignItems: "center", gap: "3px", whiteSpace: "nowrap" }}>
                                                                                    ⭐ Best Match
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {s.specialty && (
                                                                            <p style={{ fontSize: "0.72rem", color: "#6366f1", fontWeight: 500, margin: "0 0 1px" }}>
                                                                                {s.specialty}
                                                                            </p>
                                                                        )}
                                                                        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0 }}>
                                                                            {s.caseload} student{s.caseload !== 1 ? "s" : ""}
                                                                        </p>
                                                                    </div>
                                                                    {alreadyAssigned ? (
                                                                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#16a34a", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "4px" }}>
                                                                            <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                                            Assigned
                                                                        </span>
                                                                    ) : (
                                                                        <button
                                                                            disabled={isLoading}
                                                                            onClick={() => handleAssign(role === "SPECIALIST" ? "specialist" : "teacher", s.id)}
                                                                            style={{
                                                                                fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap",
                                                                                padding: "5px 12px", borderRadius: "6px",
                                                                                border: "1px solid #bfdbfe",
                                                                                background: "#eff6ff", color: "#1d4ed8",
                                                                                cursor: isLoading ? "not-allowed" : "pointer",
                                                                                opacity: isLoading ? 0.6 : 1,
                                                                            }}
                                                                        >
                                                                            {isLoading ? "…" : "Assign"}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Generated documents */}
                        <div className="glass-panel" style={{ background: "white", borderRadius: "14px", border: "1px solid var(--border-light)", overflow: "hidden" }}>
                            <div style={{ padding: "1.25rem 1.75rem", borderBottom: "1px solid var(--border-light)", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div>
                                    <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Generated Documents</h2>
                                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>Finalized PDFs approved for this student.</p>
                                </div>
                                {user?.role === "ADMIN" && (student.status === "Assessed" || student.status === "Enrolled") && (
                                    <Link
                                        href={`/admin/reports?studentId=${student.id}`}
                                        style={{
                                            display: "inline-flex", alignItems: "center", gap: "6px",
                                            padding: "8px 16px", borderRadius: "8px",
                                            background: "#4f46e5", color: "white",
                                            fontSize: "0.85rem", fontWeight: 700,
                                            textDecoration: "none", whiteSpace: "nowrap",
                                        }}
                                    >
                                        <svg style={{ width: 15, height: 15 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Generate Report
                                    </Link>
                                )}
                            </div>
                            <div style={{ padding: "1.25rem 1.75rem" }}>
                                {generated_documents.length === 0 ? (
                                    <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--text-muted)" }}>
                                        <svg style={{ width: 40, height: 40, margin: "0 auto 12px", color: "#cbd5e1" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <p style={{ fontSize: "0.9rem" }}>No reports generated yet.</p>
                                    </div>
                                ) : (
                                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                                        {generated_documents.map((doc) => {
                                            const isIEP = doc.type === "IEP" && doc.has_iep_data;
                                            const isWeekly = doc.type === "WEEKLY" && doc.has_iep_data;
                                            const badgeLabel = isIEP ? "IEP" : isWeekly ? "WK" : "PDF";
                                            const badgeBg = isIEP ? "#dbeafe" : isWeekly ? "#dcfce7" : "#fee2e2";
                                            const badgeColor = isIEP ? "#2563eb" : isWeekly ? "#16a34a" : "#dc2626";
                                            const docTitle = isIEP ? "AI-Generated IEP" : isWeekly ? "Weekly Progress Report" : `${doc.type} Report`;
                                            return (
                                            <li key={doc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border-light)" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                                    <div style={{ width: 36, height: 36, background: badgeBg, color: badgeColor, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700 }}>
                                                        {badgeLabel}
                                                    </div>
                                                    <div>
                                                        <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{docTitle}</p>
                                                        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0 }}>
                                                            {new Date(doc.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div style={{ display: "flex", gap: "8px" }}>
                                                    {isIEP && (
                                                        <a href={`/admin/iep?id=${doc.id}`} style={{ fontSize: "0.82rem", fontWeight: 600, color: "#4f46e5", padding: "6px 14px", borderRadius: "6px", border: "1px solid #c7d2fe", textDecoration: "none", background: "#eef2ff" }}>
                                                            View IEP
                                                        </a>
                                                    )}
                                                    {isWeekly && (
                                                        <a href={`/admin/weekly-report?id=${doc.id}`} style={{ fontSize: "0.82rem", fontWeight: 600, color: "#16a34a", padding: "6px 14px", borderRadius: "6px", border: "1px solid #bbf7d0", textDecoration: "none", background: "#f0fdf4" }}>
                                                            View Report
                                                        </a>
                                                    )}
                                                    {doc.file_url && (
                                                        <a href={doc.file_url} target="_blank" rel="noreferrer" style={{ fontSize: "0.82rem", fontWeight: 500, color: "#2563eb", padding: "6px 14px", borderRadius: "6px", border: "1px solid #bfdbfe", textDecoration: "none", background: "#eff6ff" }}>
                                                            View PDF
                                                        </a>
                                                    )}
                                                    {doc.file_url && user?.role === "ADMIN" && (
                                                        <a href={doc.file_url} download style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text-secondary)", padding: "6px 14px", borderRadius: "6px", border: "1px solid var(--border-light)", textDecoration: "none", background: "white" }}>
                                                            Download
                                                        </a>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                        })}
                                    </ul>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </ProtectedRoute>

        {/* Delete Student Confirmation Modal */}
        {showDeleteModal && data && (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                <div style={{ background: "white", padding: "2rem", borderRadius: "12px", width: "400px", maxWidth: "90%" }}>
                    <h2 style={{ marginTop: 0, color: "#d32f2f" }}>Delete Student</h2>
                    <p style={{ color: "#4b5563", marginBottom: "1rem", fontSize: "0.95rem" }}>
                        You are about to permanently delete <strong>{data.student.first_name} {data.student.last_name}</strong> and all associated records.
                    </p>
                    <p style={{ color: "#111827", marginBottom: "1rem", fontSize: "0.9rem", fontWeight: "bold" }}>
                        To confirm, type the student's full name:<br />
                        <span style={{ color: "#6b7280", fontStyle: "italic", userSelect: "none" }}>
                            {data.student.first_name} {data.student.last_name}
                        </span>
                    </p>
                    {deleteError && (
                        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "10px", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.85rem", fontWeight: "bold" }}>
                            {deleteError}
                        </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <input
                            type="text"
                            placeholder="Type full name to confirm"
                            value={deleteConfirmText}
                            onChange={e => setDeleteConfirmText(e.target.value)}
                            style={{ padding: "10px", borderRadius: "4px", border: "1px solid #ccc", width: "100%", boxSizing: "border-box" }}
                        />
                        <div style={{ display: "flex", gap: "1rem" }}>
                            <button
                                onClick={handleDeleteStudent}
                                disabled={deleteConfirmText !== `${data.student.first_name} ${data.student.last_name}`}
                                style={{
                                    flex: 1, padding: "10px", fontWeight: "bold", border: "none", borderRadius: "8px", color: "white",
                                    background: deleteConfirmText === `${data.student.first_name} ${data.student.last_name}` ? "#d32f2f" : "#fca5a5",
                                    cursor: deleteConfirmText === `${data.student.first_name} ${data.student.last_name}` ? "pointer" : "not-allowed",
                                }}
                            >
                                Permanently Delete
                            </button>
                            <button
                                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); setDeleteError(""); }}
                                style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", cursor: "pointer" }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
