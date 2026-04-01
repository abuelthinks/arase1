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
        status?: string;
        has_iep_data?: boolean;
    }[];
    assigned_staff: { id: number; role: string }[];
}

const statusConfig: Record<string, { label: string; bg: string; color: string }> = {
    "Pending Assessment":   { label: "Pending Assessment",   bg: "#fce7f3", color: "#9d174d" },
    "Assessment Scheduled": { label: "Assessment Scheduled", bg: "#fef3c7", color: "#92400e" },
    "Assessed":             { label: "Assessed",             bg: "#dbeafe", color: "#1e40af" },
    "Enrolled":             { label: "Enrolled",             bg: "#dcfce7", color: "#14532d" },
    "Archived":             { label: "Archived",             bg: "#f1f5f9", color: "#64748b" },
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
    sped_assessment:   "/forms/sped-assessment",
    sped_tracker:      "/forms/sped-tracker",
    multi_assessment:  "/forms/multidisciplinary-assessment",
    multi_tracker:     "/forms/multidisciplinary-tracker",
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

    const renderLifecycleAction = () => {
        if (user?.role === "PARENT") {
            if (student.status === "Pending Assessment") {
                // Must submit parent assessment form before requesting
                if (!form_statuses.parent_assessment?.submitted) {
                    return (
                        <div>
                            <p style={{ fontSize: "0.85rem", color: "#92400e", marginBottom: "8px" }}>
                                Please fill in the <strong>Parent Assessment</strong> form before requesting an evaluation.
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
                        Request Evaluation
                    </button>
                );
            }
            if (student.status === "Assessment Scheduled") {
                return (
                    <span className="text-sm text-slate-500 italic">Evaluation in progress — our team will be in touch…</span>
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
                        Enroll Student → Set Active
                    </button>
                );
            }
            if (student.status === "Enrolled") {
                return (
                    <button
                        onClick={() => handleAction("archive")}
                        className="btn-slate"
                    >
                        Archive Student
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
            <div className="max-w-7xl mx-auto pb-16 px-4">
            
            {/* Breadcrumb Nav / Site Header */}
            <div style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: "white", padding: "12px 20px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <button type="button" onClick={() => router.back()}
                        className="btn-slate"
                        style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                    >
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back
                    </button>
                    <span style={{ color: "#cbd5e1" }}>/</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Students</span>
                    <span style={{ color: "#cbd5e1" }}>/</span>
                    <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "0.95rem" }}>
                        {student.first_name} {student.last_name}
                    </span>
                </div>
                
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: statusBadge.bg === "#f1f5f9" ? "#cbd5e1" : statusBadge.color, boxShadow: `0 0 0 2px ${statusBadge.bg}` }}></span>
                    Status: {statusBadge.label}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* ── Left Sidebar: Identity & Lifecycle ── */}
                <div className="flex flex-col gap-6 lg:col-span-1">
                    
                    {/* Main Profile Card */}
                    <div className="glass-panel" style={{ background: "white", borderRadius: "14px", padding: "1.75rem", border: "1px solid var(--border-light)" }}>
                        {/* Avatar */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: "1.5rem" }}>
                            <div style={{
                                width: "80px", height: "80px", borderRadius: "50%",
                                background: "#dbeafe", color: "#1e40af",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "1.8rem", fontWeight: 700, marginBottom: "1rem",
                                boxShadow: "0 4px 10px rgba(0,0,0,0.05)", border: "2px solid #bfdbfe"
                            }}>
                                {student.first_name[0]}{student.last_name[0]}
                            </div>

                            <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", margin: "0 0 6px" }}>
                                {student.first_name} {student.last_name}
                            </h1>

                            <span style={{
                                display: "inline-block",
                                fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
                                letterSpacing: "0.5px", padding: "4px 10px", borderRadius: "999px",
                                background: statusBadge.bg, color: statusBadge.color,
                            }}>
                                {statusBadge.label}
                            </span>
                        </div>

                        {/* Details */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.85rem" }}>
                            {[
                                { label: "Grade",         value: student.grade || "TBD" },
                                { label: "Date of Birth", value: new Date(student.date_of_birth + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
                                { label: "Student ID",    value: `#${student.id}` },
                            ].map(({ label, value }) => (
                                <div key={label} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                    <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
                                    <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Report Cycle Progression Card */}
                    {active_cycle && (
                        <div className="glass-panel" style={{ background: "white", borderRadius: "14px", padding: "1.5rem", border: "1px solid var(--border-light)" }}>
                            <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 1rem", display: "flex", alignItems: "center", gap: "8px" }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#3b82f6" }}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                Active Report Cycle
                            </h3>
                            
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                                    <span>{new Date(active_cycle.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                    <span>{new Date(active_cycle.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                </div>
                                <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                                    <div style={{ width: `${Math.min(100, Math.max(0, Math.round(((new Date().getTime() - new Date(active_cycle.start_date).getTime()) / (new Date(active_cycle.end_date).getTime() - new Date(active_cycle.start_date).getTime())) * 100)))}%`, height: "100%", background: "#3b82f6", borderRadius: "4px" }}></div>
                                </div>
                                <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "4px 0 0", textAlign: "right" }}>
                                    {Math.min(100, Math.max(0, Math.round(((new Date().getTime() - new Date(active_cycle.start_date).getTime()) / (new Date(active_cycle.end_date).getTime() - new Date(active_cycle.start_date).getTime())) * 100)))}% completed
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Lifecycle action */}
                    {renderLifecycleAction() && (
                        <div className="glass-panel" style={{ background: "white", borderRadius: "14px", padding: "1.5rem", border: "1px solid var(--border-light)" }}>
                            <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 1rem", display: "flex", alignItems: "center", gap: "8px" }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#f59e0b" }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                                Next Action
                            </h3>
                            {renderLifecycleAction()}
                        </div>
                    )}

                    {/* Admin: Danger Zone */}
                    {user?.role === "ADMIN" && (
                        <div style={{ borderRadius: "14px", padding: "1.5rem", border: "1px solid #fca5a5", background: "#fff5f5" }}>
                            <p style={{ fontSize: "0.85rem", fontWeight: 800, textTransform: "uppercase", color: "#b91c1c", letterSpacing: "0.5px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                                Danger Zone
                            </p>
                            <p style={{ fontSize: "0.8rem", color: "#7f1d1d", marginBottom: "16px", lineHeight: 1.4 }}>
                                Deleting this student will permanently remove all associated assessments, documents, and records. This cannot be undone.
                            </p>
                            <button
                                onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(""); setDeleteError(""); }}
                                className="btn-red"
                                style={{ width: "100%" }}
                            >
                                Delete Student
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Right Column: Workflow Engine ── */}
                <div className="flex flex-col gap-6 lg:col-span-2">

                    {/* Input Forms */}
                    {visibleFormKeys.length > 0 && (
                        <div className="glass-panel" style={{ background: "white", borderRadius: "14px", border: "1px solid var(--border-light)", overflow: "hidden" }}>
                            <div style={{ padding: "1.25rem 1.75rem", borderBottom: "1px solid var(--border-light)", background: "#f8fafc" }}>
                                <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
                                    Input Forms Grid
                                </h2>
                                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "4px 0 0" }}>
                                    Monitor workflow submissions.
                                </p>
                            </div>
                            <div style={{ padding: "1.5rem 1.75rem" }}>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {visibleFormKeys.map((key) => {
                                        const fs: FormStatus = form_statuses[key] ?? { submitted: false, id: null };
                                        const label = formLabels[key] ?? key;
                                        const route = formRoutes[key] ?? "#";
                                        
                                        // "Remind Teacher" capability context for ADMIN
                                        const isSpedForm = key.includes("sped");
                                        const assignedTeacher = isSpedForm ? staffList.find(s => s.role === "TEACHER" && (data.assigned_staff || []).some(a => a.id === s.id && a.role === "TEACHER")) : null;

                                        return (
                                            <div key={key} style={{
                                                borderRadius: "10px", padding: "16px",
                                                border: `1px solid ${fs.submitted ? "#a7f3d0" : "#e2e8f0"}`,
                                                background: fs.submitted ? "#f0fdf4" : "white",
                                                display: "flex", flexDirection: "column", justifyContent: "space-between",
                                                boxShadow: fs.submitted ? "none" : "0 1px 2px rgba(0,0,0,0.02)"
                                            }}>
                                                <div>
                                                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px", gap: "8px" }}>
                                                        <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-primary)", margin: 0, lineHeight: 1.2 }}>
                                                            {label}
                                                        </p>
                                                        {fs.submitted ? (
                                                            <svg style={{ width: 20, height: 20, color: "#16a34a", flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        ) : (
                                                            <svg style={{ width: 20, height: 20, color: "#cbd5e1", flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Missing Action Text */}
                                                    {!fs.submitted && user?.role === "ADMIN" && isSpedForm && (
                                                        <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0 0 12px", display: "flex", alignItems: "center", gap: "4px" }}>
                                                            {assignedTeacher ? `Waiting on: ${assignedTeacher.first_name}` : "No teacher assigned"}
                                                        </p>
                                                    )}
                                                </div>

                                                <div style={{ marginTop: "auto" }}>
                                                    {fs.submitted ? (
                                                        <Link href={`${route}?studentId=${student.id}&mode=view&submissionId=${fs.id}`} style={{ fontSize: "0.8rem", color: "#16a34a", textDecoration: "none", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }} className="hover:underline">
                                                            View Result →
                                                        </Link>
                                                    ) : (
                                                        ownedFormKeys[user?.role ?? ""]?.includes(key) ? (
                                                            (key.includes("tracker") && student.status !== "Enrolled") ? (
                                                                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", color: "#94a3b8", fontWeight: 500 }}>
                                                                    <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                                                    Locked
                                                                </div>
                                                            ) : (key === "sped_assessment" && !["Observation Scheduled", "Assessed", "Enrolled"].includes(student.status)) ? (
                                                                <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", color: "#94a3b8", fontWeight: 500 }}>
                                                                    <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                                                    Waiting for Admin
                                                                </div>
                                                            ) : (
                                                                <Link href={`${route}?studentId=${student.id}`} className="btn-indigo" style={{ textDecoration: "none" }}>
                                                                    + Complete Form
                                                                </Link>
                                                            )
                                                        ) : (
                                                            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8" }}>Pending Input</span>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Admin: Staff Assignment Panel */}
                    {user?.role === "ADMIN" && (
                        <div className="glass-panel" style={{ background: "white", borderRadius: "14px", border: "1px solid var(--border-light)", overflow: "hidden" }}>
                            <div style={{ padding: "1.25rem 1.75rem", borderBottom: "1px solid var(--border-light)", background: "#f8fafc" }}>
                                <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Clinical Caseload Team</h2>
                                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "4px 0 0" }}>Manage assigned specialists and teachers.</p>
                            </div>
                            <div style={{ padding: "1.5rem 1.75rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
                                {(["SPECIALIST", "TEACHER"] as const).map(role => {
                                    const assignedIds = (data.assigned_staff ?? []).filter(s => s.role === role).map(s => s.id);
                                    const list = staffList.filter(s => s.role === role);
                                    return (
                                        <div key={role}>
                                            <p style={{ fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", marginBottom: "12px", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px" }}>
                                                {role === "SPECIALIST" ? "Specialists" : "Teachers"}
                                            </p>
                                            {list.length === 0 ? (
                                                <p style={{ fontSize: "0.85rem", color: "#94a3b8", fontStyle: "italic" }}>No staff found.</p>
                                            ) : (
                                                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                                    {list.map(s => {
                                                        const alreadyAssigned = assignedIds.includes(s.id);
                                                        const isLoading = assigning === s.id;
                                                        return (
                                                            <div key={s.id} onClick={() => router.push(`/users/${s.id}`)} style={{
                                                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                                                padding: "12px 14px",
                                                                borderRadius: "10px",
                                                                border: `2px solid ${alreadyAssigned ? "#22c55e" : "#e2e8f0"}`,
                                                                background: alreadyAssigned ? "#f0fdf4" : "white",
                                                                gap: "8px",
                                                                cursor: "pointer",
                                                                transition: "all 0.2s"
                                                            }} className={!alreadyAssigned ? "hover:border-blue-300 hover:shadow-sm" : "hover:shadow-sm"}>
                                                                <div style={{ minWidth: 0 }}>
                                                                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "2px" }}>
                                                                        <p style={{ fontSize: "0.9rem", fontWeight: 700, color: alreadyAssigned ? "#166534" : "var(--text-primary)", margin: 0 }}>
                                                                            {s.first_name || s.last_name ? `${s.first_name} ${s.last_name}`.trim() : s.username}
                                                                        </p>
                                                                        {s.recommended && (
                                                                            <span style={{ fontSize: "0.65rem", fontWeight: 800, background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: "999px", display: "inline-flex", alignItems: "center", gap: "3px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                                                                ⭐ Best Match
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {s.specialty && (
                                                                        <p style={{ fontSize: "0.75rem", color: "#6366f1", fontWeight: 500, margin: "0 0 2px" }}>
                                                                            {s.specialty}
                                                                        </p>
                                                                    )}
                                                                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0 }}>
                                                                        <strong style={{ color: "#334155" }}>{s.caseload}</strong> student{s.caseload !== 1 ? "s" : ""}
                                                                    </p>
                                                                </div>
                                                                {alreadyAssigned ? (
                                                                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#16a34a", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "4px" }}>
                                                                        <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                                        Active
                                                                    </span>
                                                                ) : (
                                                                    <button
                                                                        disabled={isLoading}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleAssign(role === "SPECIALIST" ? "specialist" : "teacher", s.id);
                                                                        }}
                                                                        className="btn-indigo"
                                                                        style={{ opacity: isLoading ? 0.6 : 1, cursor: isLoading ? "not-allowed" : "pointer" }}
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
                    <div className="glass-panel" style={{ background: "#f0f9ff", borderRadius: "14px", border: "1px solid #bae6fd", overflow: "hidden" }}>
                        <div style={{ padding: "1.25rem 1.75rem", borderBottom: "1px solid #e0f2fe", background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                            <div>
                                <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0369a1", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
                                    Generated Documents Output
                                </h2>
                                <p style={{ fontSize: "0.85rem", color: "#0ea5e9", margin: "4px 0 0" }}>Finalized clinical AI outputs approved for this student.</p>
                            </div>
                            {user?.role === "ADMIN" && (student.status === "Assessed" || student.status === "Enrolled") && (
                        <Link
                                    href={`/admin/reports?studentId=${student.id}`}
                                    className="btn-primary"
                                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", textDecoration: "none", whiteSpace: "nowrap" }}
                                >
                                    <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    Generate Report Now
                                </Link>
                            )}
                        </div>
                        <div style={{ padding: "1.5rem 1.75rem" }}>
                            {generated_documents.length === 0 ? (
                                <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#38bdf8", background: "#e0f2fe", borderRadius: "8px", border: "1px dashed #7dd3fc" }}>
                                    <svg style={{ width: 44, height: 44, margin: "0 auto 12px", opacity: 0.8 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "#0284c7" }}>No final reports generated yet.</p>
                                    <p style={{ fontSize: "0.85rem", margin: "6px 0 0", color: "#0ea5e9" }}>Generations will appear here.</p>
                                </div>
                            ) : (
                                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                                    {generated_documents.map((doc) => {
                                        const isIEP = doc.type === "IEP" && doc.has_iep_data;
                                        const isWeekly = doc.type === "WEEKLY" && doc.has_iep_data;
                                        const badgeLabel = isIEP ? "IEP" : isWeekly ? "WK" : "PDF";
                                        const badgeBg = isIEP ? "#dbeafe" : isWeekly ? "#dcfce7" : "#fee2e2";
                                        const badgeColor = isIEP ? "#2563eb" : isWeekly ? "#16a34a" : "#dc2626";
                                        const docTitle = isIEP ? "AI-Generated IEP Master" : isWeekly ? "Weekly Progress Snapshot" : `${doc.type} Report`;
                                        return (
                                        <li key={doc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "white", borderRadius: "10px", border: "1px solid #bae6fd", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                                                <div style={{ width: 42, height: 42, background: badgeBg, color: badgeColor, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 800 }}>
                                                    {badgeLabel}
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                                                        {isIEP ? (
                                                            <a href={`/admin/iep?id=${doc.id}`} style={{ color: "var(--text-primary)", textDecoration: "none" }} className="hover:text-indigo-600 transition-colors">
                                                                {docTitle}
                                                            </a>
                                                        ) : isWeekly ? (
                                                            <a href={`/admin/weekly-report?id=${doc.id}`} style={{ color: "var(--text-primary)", textDecoration: "none" }} className="hover:text-green-600 transition-colors">
                                                                {docTitle}
                                                            </a>
                                                        ) : (
                                                            <span style={{ color: "var(--text-primary)" }}>{docTitle}</span>
                                                        )}
                                                        {doc.status === "DRAFT" && (
                                                            <span style={{ fontSize: "0.65rem", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>DRAFT</span>
                                                        )}
                                                    </p>

                                                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "2px 0 0", display: "flex", alignItems: "center", gap: "4px" }}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                                        {new Date(doc.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", gap: "8px" }}>
                                                {isIEP && (
                                                    <a href={`/admin/iep?id=${doc.id}`} className="btn-indigo" style={{ textDecoration: "none" }}>
                                                        View IEP
                                                    </a>
                                                )}
                                                {isWeekly && (
                                                    <a href={`/admin/weekly-report?id=${doc.id}`} className="btn-green" style={{ textDecoration: "none" }}>
                                                        View Report
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
