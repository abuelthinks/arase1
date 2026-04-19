"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

interface FormStatus {
    submitted: boolean;
    id: number | null;
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
    assigned_staff: { id: number; role: string; first_name?: string; last_name?: string; specialty?: string }[];
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

const STATUS_STEPS = [
    { key: "Pending Assessment", label: "Pending", shortLabel: "Pending" },
    { key: "Assessment Scheduled", label: "Scheduled", shortLabel: "Scheduled" },
    { key: "Assessed", label: "Assessed", shortLabel: "Assessed" },
    { key: "Enrolled", label: "Enrolled", shortLabel: "Enrolled" },
];

export function StudentProfileContent({ propStudentId, propHideNavigation, propEmbedded }: { propStudentId?: string, propHideNavigation?: boolean, propEmbedded?: boolean } = {}) {
    const params = useParams();
    const id = propStudentId || (params?.id as string);
    const router = useRouter();
    const { user } = useAuth();
    const [data, setData] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    // Delete modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deleteError, setDeleteError] = useState("");
    const [dangerZoneOpen, setDangerZoneOpen] = useState(false);

    const fetchProfile = useCallback(async () => {
        try {
            const res = await api.get(`/api/students/${id}/profile/`);
            setData(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || "Failed to load profile.");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (user && id) {
            fetchProfile();
        }
    }, [fetchProfile, id, user]);

    useEffect(() => {
        if (user?.role !== "PARENT" || !id || typeof window === "undefined") return;
        window.localStorage.setItem("arase:last-parent-student-id", id);
    }, [id, user?.role]);

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

    const { student, form_statuses, generated_documents, assigned_staff, cycle_status, previous_recommendations } = data;
    const statusBadge = statusConfig[student.status] ?? { label: student.status, bg: "#f1f5f9", color: "#475569" };

    // Calculate stats
    const formsSubmittedCount = Object.values(form_statuses).filter(f => f.submitted).length;
    const totalForms = Object.keys(form_statuses).length;
    const docsCount = generated_documents.length;
    const teamCount = assigned_staff.length;

    // Age calculation
    const calcAge = () => {
        const today = new Date();
        const birthDate = new Date(student.date_of_birth + "T00:00:00");
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
        return age;
    };

    // Status stepper
    const currentStepIdx = STATUS_STEPS.findIndex(s => s.key === student.status);
    const isArchived = student.status === "Archived";

    const renderLifecycleAction = () => {
        if (user?.role === "PARENT") {
            if (student.status === "Enrolled") {
                return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <span className="text-sm text-slate-500 italic" style={{ display: "block", background: "#f8fafc", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                            Your child is enrolled. You can now submit the monthly Parent Progress tracker.
                        </span>
                        <Link
                            href={`/workspace?studentId=${student.id}&workspace=forms&tab=parent_tracker`}
                            className="btn-primary px-5 py-2 text-sm text-center"
                            style={{ textDecoration: "none", display: "inline-block" }}
                        >
                            Fill Parent Progress
                        </Link>
                    </div>
                );
            }
            if (student.status === "Pending Assessment") {
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
            return null;
        }
        return null;
    };

    const lifecycleContent = renderLifecycleAction();
    const isParent = user?.role === "PARENT";

    return (
        <>
            <div style={{ maxWidth: "1024px", margin: "0 auto", padding: propEmbedded ? "1.5rem" : propHideNavigation ? "1.5rem" : "2rem 1rem 4rem" }}>
            
            {/* ═══════════════════════════════════════════════════════ */}
            {/* PROFILE HEADER — Avatar + Name + Status + Stepper     */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div style={{ background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 50%, #dbeafe 100%)", borderRadius: "16px", padding: "0", marginBottom: "1.5rem", position: "relative", overflow: "hidden" }}>
                {/* Subtle decorative circles */}
                <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "120px", height: "120px", borderRadius: "50%", background: "rgba(99,102,241,0.08)" }}></div>
                <div style={{ position: "absolute", bottom: "-30px", left: "-20px", width: "80px", height: "80px", borderRadius: "50%", background: "rgba(59,130,246,0.06)" }}></div>

                {/* Subtle back button — top-right, hidden when embedded */}
                {!propHideNavigation && (
                    <button type="button" onClick={() => router.back()} className="hidden md:flex"
                        title="Go back"
                        style={{
                            position: "absolute", top: "14px", right: "14px", zIndex: 2,
                            width: "32px", height: "32px", borderRadius: "50%",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: "rgba(255,255,255,0.35)",
                            border: "1px solid rgba(255,255,255,0.4)",
                            color: "rgba(30,27,75,0.4)", cursor: "pointer",
                            transition: "all 0.15s ease",
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.7)"; e.currentTarget.style.color = "#1e1b4b"; }}
                        onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.35)"; e.currentTarget.style.color = "rgba(30,27,75,0.4)"; }}
                    >
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </button>
                )}

                {/* Avatar + Name */}
                <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", position: "relative", zIndex: 1, flexWrap: "wrap", padding: "2rem 2rem 0.85rem" }}>
                    {/* Avatar */}
                    <div style={{
                        width: "72px", height: "72px", borderRadius: "50%",
                        background: "white", color: "#4f46e5",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "1.6rem", fontWeight: 800,
                        boxShadow: "0 4px 12px rgba(79,70,229,0.15)", border: "3px solid white",
                        flexShrink: 0,
                    }}>
                        {student.first_name[0]}{student.last_name[0]}
                    </div>

                    {/* Name + Status */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e1b4b", margin: "0 0 6px" }}>
                            {student.first_name} {student.last_name}
                        </h1>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                            <span style={{
                                display: "inline-block",
                                fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
                                letterSpacing: "0.5px", padding: "3px 10px", borderRadius: "999px",
                                background: statusBadge.bg, color: statusBadge.color,
                            }}>
                                {statusBadge.label}
                            </span>
                            {student.grade && (
                                <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>
                                    Grade: {student.grade}
                                </span>
                            )}
                            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                                {calcAge()} years old
                            </span>
                        </div>
                    </div>
                </div>

                {/* Status Journey Stepper */}
                {!isArchived && (
                    <div style={{ padding: "0 2rem 1.1rem", position: "relative", zIndex: 1, opacity: 0.88 }}>
                        <div style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "0",
                        }}>
                        {STATUS_STEPS.map((step, idx) => {
                            const isCompleted = idx < currentStepIdx;
                            const isCurrent = idx === currentStepIdx;
                            const isFinalCompleted = student.status === "Enrolled" && idx === STATUS_STEPS.length - 1;
                            return (
                                <div key={step.key} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 auto", minWidth: "56px" }}>
                                        <div style={{
                                            width: "24px", height: "24px", borderRadius: "50%",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            fontSize: "0.62rem", fontWeight: 700,
                                            background: isCompleted || isFinalCompleted ? "rgba(79,70,229,0.88)" : isCurrent ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.22)",
                                            color: isCompleted || isFinalCompleted ? "white" : isCurrent ? "#4f46e5" : "#94a3b8",
                                            border: isCurrent && !isFinalCompleted ? "1.5px solid rgba(79,70,229,0.75)" : isCompleted || isFinalCompleted ? "1.5px solid rgba(79,70,229,0.65)" : "1.5px solid rgba(148,163,184,0.35)",
                                            boxShadow: isCurrent && !isFinalCompleted ? "0 0 0 2px rgba(79,70,229,0.08)" : "none",
                                            transition: "all 0.3s ease",
                                        }}>
                                            {isCompleted || isFinalCompleted ? (
                                                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            ) : (
                                                idx + 1
                                            )}
                                        </div>
                                        <span style={{
                                            fontSize: "0.62rem", fontWeight: isCurrent ? 700 : 600,
                                            color: isCurrent || isFinalCompleted ? "#3730a3" : isCompleted ? "#4f46e5" : "#64748b",
                                            marginTop: "6px", textAlign: "center", lineHeight: 1.1,
                                        }}>
                                            {step.shortLabel}
                                        </span>
                                    </div>
                                    {idx < STATUS_STEPS.length - 1 && (
                                        <div style={{
                                            flex: 1, height: "1.5px", margin: "11px 8px 0",
                                            background: isCompleted ? "rgba(79,70,229,0.7)" : "rgba(148,163,184,0.28)",
                                            borderRadius: "999px",
                                            transition: "background 0.3s ease",
                                        }}></div>
                                    )}
                                </div>
                            );
                        })}
                        </div>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* SUMMARY STAT CARDS                         */}
            {/* ═══════════════════════════════════════════ */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "1.5rem" }}>
                {/* Forms */}
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1rem 1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#6366f1" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.3px" }}>Forms</span>
                    </div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e1b4b" }}>{formsSubmittedCount}<span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#94a3b8" }}>/{totalForms}</span></div>
                    <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>submitted</div>
                </div>

                {/* Documents */}
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1rem 1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                        </div>
                        <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.3px" }}>Documents</span>
                    </div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e1b4b" }}>{docsCount}</div>
                    <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>generated</div>
                </div>

                {!isParent && (
                    <>
                        {/* Team */}
                        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1rem 1.25rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </div>
                                <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.3px" }}>Team</span>
                            </div>
                            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e1b4b" }}>{teamCount}</div>
                            <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>assigned</div>
                        </div>

                        {/* Cycle Status (only if enrolled) */}
                        {cycle_status && (
                            <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1rem 1.25rem" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                                    <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#0ea5e9" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    </div>
                                    <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.3px" }}>Cycle</span>
                                </div>
                                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: cycle_status.days_remaining <= 5 ? "#dc2626" : "#1e1b4b" }}>{cycle_status.days_remaining}d</div>
                                <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>remaining</div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* MAIN CONTENT GRID                          */}
            {/* ═══════════════════════════════════════════ */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }} className="profile-grid">

                {/* Student Details */}
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "14px", overflow: "hidden" }}>
                    <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "8px" }}>
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#6366f1" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e1b4b", margin: 0 }}>Student Details</h3>
                    </div>
                    <div>
                        {[
                            { label: "Full Name", value: `${student.first_name} ${student.last_name}` },
                            { label: "Grade / Level", value: student.grade || "TBD" },
                            { label: "Date of Birth", value: new Date(student.date_of_birth + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
                            { label: "Age", value: `${calcAge()} years old` },
                        ].map((item, idx, arr) => (
                            <div key={item.label} style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                padding: "12px 1.25rem",
                                borderBottom: idx < arr.length - 1 ? "1px solid #f8fafc" : "none",
                                fontSize: "0.85rem"
                            }}>
                                <span style={{ color: "#64748b", fontWeight: 500 }}>{item.label}</span>
                                <span style={{ color: "#1e1b4b", fontWeight: 600, textAlign: "right" }}>{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Parent / Guardian Contact */}
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "14px", overflow: "hidden" }}>
                    <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "8px" }}>
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e1b4b", margin: 0 }}>Parent / Guardian</h3>
                    </div>
                    <div>
                        {[
                            { label: "Name", value: student.parent_guardian_name || "Not provided", isLink: false },
                            { label: "Email", value: student.parent_email || "Not provided", isLink: !!student.parent_email, href: `mailto:${student.parent_email}` },
                            { label: "Phone", value: student.parent_phone || "Not provided", isLink: !!student.parent_phone, href: `tel:${student.parent_phone}` },
                        ].map((item, idx, arr) => (
                            <div key={item.label} style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                padding: "12px 1.25rem",
                                borderBottom: idx < arr.length - 1 ? "1px solid #f8fafc" : "none",
                                fontSize: "0.85rem"
                            }}>
                                <span style={{ color: "#64748b", fontWeight: 500 }}>{item.label}</span>
                                {item.isLink ? (
                                    <a href={item.href} style={{ color: "#4f46e5", fontWeight: 600, textDecoration: "none", textAlign: "right" }}>
                                        {item.value}
                                    </a>
                                ) : (
                                    <span style={{ color: item.value === "Not provided" ? "#cbd5e1" : "#1e1b4b", fontWeight: 600, fontStyle: item.value === "Not provided" ? "italic" : "normal", textAlign: "right" }}>{item.value}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* ASSIGNED TEAM (if any)                      */}
            {/* ═══════════════════════════════════════════ */}
            {!isParent && (
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "14px", overflow: "hidden", marginBottom: "1.5rem" }}>
                    <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "8px" }}>
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e1b4b", margin: 0 }}>Assigned Team</h3>
                    </div>
                    {assigned_staff.length === 0 ? (
                        <div style={{ padding: "1.5rem", textAlign: "center" }}>
                            <p style={{ fontSize: "0.8rem", color: "#94a3b8", fontStyle: "italic", margin: 0 }}>No team members assigned yet.</p>
                        </div>
                    ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0" }}>
                            {assigned_staff.map((staff) => {
                                const staffName = (staff.first_name || staff.last_name)
                                    ? `${staff.first_name || ""} ${staff.last_name || ""}`.trim()
                                    : `Staff #${staff.id}`;
                                const initials = `${(staff.first_name || "?")[0]}${(staff.last_name || "?")[0]}`;
                                const isSpecialist = staff.role === "SPECIALIST";
                                return (
                                    <div key={staff.id} style={{
                                        display: "flex", alignItems: "center", gap: "12px",
                                        padding: "14px 1.25rem",
                                        borderBottom: "1px solid #f8fafc",
                                    }}>
                                        <div style={{
                                            width: "36px", height: "36px", borderRadius: "50%",
                                            background: isSpecialist ? "#eef2ff" : "#ecfdf5",
                                            color: isSpecialist ? "#4f46e5" : "#059669",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            fontSize: "0.75rem", fontWeight: 700, flexShrink: 0,
                                        }}>
                                            {initials}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1e1b4b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{staffName}</div>
                                            <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                                                {staff.specialty || (isSpecialist ? "Specialist" : "Teacher")}
                                            </div>
                                        </div>
                                        <span style={{
                                            fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase",
                                            padding: "2px 8px", borderRadius: "999px", flexShrink: 0,
                                            background: isSpecialist ? "#eef2ff" : "#ecfdf5",
                                            color: isSpecialist ? "#4338ca" : "#047857",
                                        }}>
                                            {staff.role}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════════════════════════════════════ */}
            {/* MONTHLY CYCLE STATUS (Enrolled only)       */}
            {/* ═══════════════════════════════════════════ */}
            {!isParent && student.status === "Enrolled" && cycle_status && (
                <div style={{ background: "white", borderRadius: "14px", padding: "1.25rem", border: "1px solid #e2e8f0", marginBottom: "1.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e1b4b", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#0ea5e9" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            {cycle_status.label}
                        </h3>
                        <span style={{ 
                            fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase", 
                            padding: "3px 8px", borderRadius: "6px", 
                            background: cycle_status.status === "OPEN" ? "#dcfce7" : cycle_status.status === "GRACE" ? "#fee2e2" : "#f1f5f9",
                            color: cycle_status.status === "OPEN" ? "#166534" : cycle_status.status === "GRACE" ? "#991b1b" : "#475569"
                        }}>
                            {cycle_status.status}
                        </span>
                    </div>

                    <div style={{ marginBottom: "1rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#64748b", marginBottom: "6px" }}>
                            <span>Progress ({cycle_status.trackers.submitted_count}/3 trackers)</span>
                            <span>{Math.round((cycle_status.trackers.submitted_count/3)*100)}%</span>
                        </div>
                        <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ width: `${(cycle_status.trackers.submitted_count/3)*100}%`, height: "100%", background: "#0ea5e9", transition: "width 0.5s ease" }}></div>
                        </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem" }}>
                        <span style={{ color: "#64748b" }}>Deadline:</span>
                        <span style={{ fontWeight: 600, color: cycle_status.days_remaining <= 5 ? "#dc2626" : "#1e1b4b" }}>
                            {cycle_status.days_remaining} days left
                        </span>
                    </div>
                    {cycle_status.status === "GRACE" && (
                        <div style={{ fontSize: "0.75rem", color: "#dc2626", background: "#fee2e2", padding: "6px 10px", borderRadius: "6px", fontWeight: 500, marginTop: "8px" }}>
                            ⚠️ Grace period ends: {new Date(cycle_status.grace_deadline).toLocaleDateString()}
                        </div>
                    )}

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
            {!isParent && previous_recommendations && (
                <div style={{ background: "#fffbeb", borderRadius: "14px", padding: "1.25rem", border: "1px solid #fde68a", marginBottom: "1.5rem" }}>
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
            {lifecycleContent && (
                <div style={{ background: "white", borderRadius: "14px", padding: "1.25rem", border: "1px solid #e2e8f0", marginBottom: "1.5rem" }}>
                    <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e1b4b", margin: "0 0 1rem", display: "flex", alignItems: "center", gap: "8px" }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        Next Action
                    </h3>
                    {lifecycleContent}
                </div>
            )}

            {/* ═══════════════════════════════════════════ */}
            {/* DANGER ZONE — Accordion (Admin only)       */}
            {/* ═══════════════════════════════════════════ */}
            {user?.role === "ADMIN" && (
                <div style={{ borderRadius: "14px", border: "1px solid #fca5a5", background: "#fff5f5", overflow: "hidden" }}>
                    <button
                        onClick={() => setDangerZoneOpen(!dangerZoneOpen)}
                        style={{
                            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "1rem 1.25rem", background: "transparent", border: "none", cursor: "pointer",
                        }}
                    >
                        <span style={{ fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", color: "#b91c1c", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                            Danger Zone
                        </span>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#b91c1c" strokeWidth="2" style={{ transform: dangerZoneOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {dangerZoneOpen && (
                        <div style={{ padding: "0 1.25rem 1.25rem" }}>
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
            )}

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

        {/* Responsive grid styles */}
        <style dangerouslySetInnerHTML={{__html: `
            @media (max-width: 640px) {
                .profile-grid {
                    grid-template-columns: 1fr !important;
                }
            }
            ${isParent ? `
                .profile-grid {
                    grid-template-columns: 1fr !important;
                }
            ` : ""}
        `}} />
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
