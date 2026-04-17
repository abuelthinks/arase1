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
        parent_guardian_name?: string;
        parent_phone?: string;
        parent_email?: string;
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
    cycle_status: {
        cycle_id: number;
        label: string;
        start_date: string;
        end_date: string;
        status: string;
        days_remaining: number;
        grace_deadline: string;
        trackers: {
            parent: boolean;
            specialist: boolean;
            teacher: boolean;
            submitted_count: number;
            total: number;
        };
        report: {
            exists: boolean;
            id: number | null;
            status: string | null;
        } | null;
    } | null;
    previous_recommendations: {
        focus_areas: string[];
        recommendations: string[];
        report_period: string;
        report_id: number;
    } | null;
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
    TEACHER:    ["sped_tracker"],
    SPECIALIST: ["multi_assessment",  "multi_tracker"],
};

// Which form keys each role can VIEW (includes read-only access to parent form for staff)
const roleFormKeys: Record<string, string[]> = {
    PARENT:     ["parent_assessment", "parent_tracker"],
    TEACHER:    ["parent_assessment", "sped_tracker"],
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

export function StudentProfileContent({ propStudentId, propHideNavigation, propEmbedded }: { propStudentId?: string, propHideNavigation?: boolean, propEmbedded?: boolean } = {}) {
    const params = useParams();
    const id = propStudentId || (params?.id as string);
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

    const { student, active_cycle, form_statuses, generated_documents, cycle_status, previous_recommendations } = data;
    const statusBadge = statusConfig[student.status] ?? { label: student.status, bg: "#f1f5f9", color: "#475569" };

    // Which form keys to show for the current user
    const visibleFormKeys: (keyof typeof form_statuses)[] =
        user?.role === "ADMIN"
            ? (Object.keys(form_statuses) as (keyof typeof form_statuses)[]).filter(k => k !== "sped_assessment")
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
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <span className="text-sm text-slate-500 italic" style={{ display: "block", background: "#f8fafc", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                            Assessment submitted. Awaiting administrator review and specialist assignment...
                        </span>
                        <Link
                            href={`/parent-onboarding?studentId=${student.id}&submissionId=${form_statuses.parent_assessment?.id}`}
                            className="btn-slate px-5 py-2 text-sm text-center"
                            style={{ textDecoration: "none", display: "inline-block" }}
                        >
                            Edit Assessment
                        </Link>
                    </div>
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

    const renderDangerZone = () => {
        if (user?.role !== "ADMIN") return null;
        return (
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
        );
    };

    return (
        <>
            <div className={`max-w-7xl mx-auto pb-16 px-4 ${propHideNavigation ? 'pt-4' : ''}`}>
            
            {/* Desktop Breadcrumb — hidden when embedded */}
            {!propHideNavigation && (
            <div className="hidden md:flex" style={{ marginBottom: "2rem", justifyContent: "space-between", alignItems: "center", background: "white", padding: "12px 20px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
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
            )}



            <div className="flex flex-col gap-6 max-w-4xl mx-auto mt-2">

                {/* ── Profile Identity & Lifecycle ── */}
                <div className="flex flex-col gap-6">
                    
                    {/* Main Profile Card */}
                    <div className="glass-panel" style={{ background: "white", borderRadius: "14px", padding: "1.75rem", border: "1px solid var(--border-light)" }}>
                        <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
                            {/* Avatar */}
                            <div className="flex flex-col items-center text-center flex-shrink-0 md:w-1/3">
                                <div style={{
                                    width: "96px", height: "96px", borderRadius: "50%",
                                    background: "#dbeafe", color: "#1e40af",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "2.2rem", fontWeight: 700, marginBottom: "1rem",
                                    boxShadow: "0 4px 10px rgba(0,0,0,0.05)", border: "2px solid #bfdbfe"
                                }}>
                                    {student.first_name[0]}{student.last_name[0]}
                                </div>

                                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)", margin: "0 0 8px" }}>
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

                            <div className="flex-1 w-full flex flex-col justify-center">
                                <div style={{ background: "#f8fafc", borderRadius: "10px", border: "1px solid var(--border-light)", overflow: "hidden" }}>
                                    {[
                                        { label: "Grade",         value: student.grade || "TBD" },
                                        { label: "Date of Birth", value: new Date(student.date_of_birth + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
                                        { label: "Current Age",   value: (() => {
                                            const today = new Date();
                                            const birthDate = new Date(student.date_of_birth + "T00:00:00");
                                            let age = today.getFullYear() - birthDate.getFullYear();
                                            const m = today.getMonth() - birthDate.getMonth();
                                            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                                                age--;
                                            }
                                            return `${age} years old`;
                                        })() },
                                        { label: "Parent/Guardian", value: student.parent_guardian_name || "Not provided" },
                                        { label: "Parent Email", value: student.parent_email || "Not provided" },
                                        { label: "Parent Phone", value: student.parent_phone || "Not provided" },
                                    ].map((item, idx, arr) => (
                                        <div key={item.label} style={{ 
                                            display: "flex", justifyContent: "space-between", alignItems: "center",
                                            padding: "14px 20px",
                                            borderBottom: idx < arr.length - 1 ? "1px solid var(--border-light)" : "none",
                                            fontSize: "0.9rem"
                                        }}>
                                            <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{item.label}</span>
                                            <div style={{ color: "var(--text-primary)", fontWeight: 700, wordBreak: "break-all", textAlign: "right" }}>{item.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Monthly Cycle Status Card */}
                    {student.status === "Enrolled" && cycle_status && (
                        <div className="glass-panel" style={{ background: "#f8fafc", borderRadius: "14px", padding: "1.5rem", border: "1px solid #e2e8f0" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                                <h3 style={{ fontSize: "0.9rem", fontWeight: 800, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#0ea5e9" }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    {cycle_status.label}
                                </h3>
                                <span style={{ 
                                    fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", 
                                    padding: "3px 8px", borderRadius: "6px", 
                                    background: cycle_status.status === "OPEN" ? "#dcfce7" : cycle_status.status === "GRACE" ? "#fee2e2" : "#f1f5f9",
                                    color: cycle_status.status === "OPEN" ? "#166534" : cycle_status.status === "GRACE" ? "#991b1b" : "#475569"
                                }}>
                                    {cycle_status.status}
                                </span>
                            </div>

                            <div style={{ marginBottom: "1rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#64748b", marginBottom: "6px" }}>
                                    <span>Progress ({cycle_status.trackers.submitted_count}/3 trackers)</span>
                                    <span>{Math.round((cycle_status.trackers.submitted_count/3)*100)}%</span>
                                </div>
                                <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                                    <div style={{ width: `${(cycle_status.trackers.submitted_count/3)*100}%`, height: "100%", background: "#0ea5e9", transition: "width 0.5s ease" }}></div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <div style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <span style={{ color: "#64748b" }}>Deadline:</span>
                                    <span style={{ fontWeight: 600, color: cycle_status.days_remaining <= 5 ? "#dc2626" : "var(--text-primary)" }}>
                                        {cycle_status.days_remaining} days left
                                    </span>
                                </div>
                                {cycle_status.status === "GRACE" && (
                                    <div style={{ fontSize: "0.75rem", color: "#dc2626", background: "#fee2e2", padding: "6px 10px", borderRadius: "6px", fontWeight: 500 }}>
                                        ⚠️ Grace period ends: {new Date(cycle_status.grace_deadline).toLocaleDateString()}
                                    </div>
                                )}
                            </div>

                            {user?.role === "ADMIN" && (
                                <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #e2e8f0" }}>
                                    <button 
                                        onClick={() => handleAction("cycles/send-reminders")}
                                        className="btn-indigo text-xs w-full py-2"
                                    >
                                        Send Reminder Notification
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Previous Month Recommendations Banner */}
                    {previous_recommendations && (
                        <div className="glass-panel" style={{ background: "#fffbeb", borderRadius: "14px", padding: "1.25rem", border: "1px solid #fde68a" }}>
                            <h4 style={{ fontSize: "0.8rem", fontWeight: 800, color: "#92400e", margin: "0 0 10px", display: "flex", alignItems: "center", gap: "6px", textTransform: "uppercase" }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
                                Carrying forward from {previous_recommendations.report_period}
                            </h4>
                            <div style={{ fontSize: "0.8rem", color: "#b45309", lineHeight: 1.5 }}>
                                {previous_recommendations.focus_areas.length > 0 ? (
                                    <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
                                        {previous_recommendations.focus_areas.slice(0, 3).map((f, i) => <li key={i}>{f}</li>)}
                                        {previous_recommendations.focus_areas.length > 3 && <li>...</li>}
                                    </ul>
                                ) : (
                                    <p style={{ margin: 0 }}>Review previous recommendations in tracker forms.</p>
                                )}
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
                    <div>
                        {renderDangerZone()}
                    </div>
                </div>
            </div>
        </div>

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

export default function StudentProfilePage() {
    const { id } = useParams();
    return (
        <ProtectedRoute>
            <StudentProfileContent propStudentId={id as string} />
        </ProtectedRoute>
    );
}
