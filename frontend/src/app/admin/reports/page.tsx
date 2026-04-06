"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";

interface FormStatus {
    submitted: boolean;
    id: number | null;
}

interface FormStatuses {
    parent_tracker: FormStatus;
    multi_tracker: FormStatus;
    sped_tracker: FormStatus;
}

const progressTrackerLabels: Record<string, string> = {
    parent_tracker: "Parent Progress",
    multi_tracker: "Specialist Progress",
    sped_tracker: "Teacher Progress",
};

function AdminReportsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const studentId = searchParams.get("studentId");
    const [reportCycleId, setReportCycleId] = useState("1");
    const [studentStatus, setStudentStatus] = useState("Pending Assessment");
    const [studentName, setStudentName] = useState("");
    const [formStatuses, setFormStatuses] = useState<FormStatuses | null>(null);
    const [cycleStatus, setCycleStatus] = useState<any>(null);

    const [loading, setLoading] = useState(false);
    const [monthlyLoading, setMonthlyLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => {
        if (studentId) {
            api.get(`/api/students/${studentId}/profile/`)
                .then(res => {
                    setStudentStatus(res.data.student.status);
                    setStudentName(`${res.data.student.first_name} ${res.data.student.last_name}`);
                    if (res.data.active_cycle) {
                        setReportCycleId(res.data.active_cycle.id.toString());
                    }
                    const fs = res.data.form_statuses || {};
                    setFormStatuses({
                        parent_tracker: fs.parent_tracker ?? { submitted: false, id: null },
                        multi_tracker:  fs.multi_tracker  ?? { submitted: false, id: null },
                        sped_tracker:   fs.sped_tracker   ?? { submitted: false, id: null },
                    });
                    if (res.data.cycle_status) {
                        setCycleStatus(res.data.cycle_status);
                    }
                })
                .catch(() => {});
        }
    }, [studentId]);

    const handleGenerateIEP = async () => {
        if (!studentId || !reportCycleId) {
            setErrorMsg("Student ID and Report Cycle ID are required.");
            return;
        }
        setLoading(true);
        setErrorMsg("");
        try {
            const res = await api.post("/api/iep/generate/", {
                student_id: studentId,
                report_cycle_id: reportCycleId,
            });
            router.push(`/admin/iep?id=${res.data.iep_id}`);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Failed to generate IEP.");
            setLoading(false);
        }
    };

    const handleGenerateMonthly = async () => {
        if (!studentId || !reportCycleId) {
            setErrorMsg("Student ID and Report Cycle ID are required.");
            return;
        }
        setMonthlyLoading(true);
        setErrorMsg("");
        try {
            const res = await api.post("/api/monthly-report/generate/", {
                student_id: parseInt(studentId),
                report_cycle_id: parseInt(reportCycleId),
            });
            router.push(`/admin/monthly-report?id=${res.data.report_id}`);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Failed to generate monthly report.");
            setMonthlyLoading(false);
        }
    };

    const allTrackersSubmitted = formStatuses
        ? Object.values(formStatuses).every(fs => fs.submitted)
        : false;

    const monthlyEnabled = studentStatus === "Enrolled" && allTrackersSubmitted && !monthlyLoading;

    if (!studentId) {
        return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Missing student context. Return to dashboard.</div>;
    }

    return (
        <ProtectedRoute allowedRoles={["ADMIN"]}>
            <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "3rem 1rem" }}>
                <div style={{ maxWidth: "700px", margin: "0 auto" }}>
                    {/* Breadcrumb Nav */}
                    <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "8px" }}>
                        <button type="button" onClick={() => router.back()}
                            className="btn-slate"
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                        >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back to Student Profile
                        </button>
                        <span style={{ color: "#cbd5e1" }}>›</span>
                        <span style={{ color: "#0f172a", fontWeight: 600, fontSize: "0.9rem" }}>Report Generator</span>
                    </div>

                    <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                        {/* Header */}
                        <div style={{ padding: "1.5rem 2rem", borderBottom: "1px solid #e2e8f0" }}>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>Report Generator</h1>
                            <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "4px" }}>
                                Generate documents for <strong>{studentName || `Student #${studentId}`}</strong>
                            </p>
                        </div>

                        <div style={{ padding: "1.5rem 2rem" }}>
                            {/* Status bar */}
                            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "1.5rem", padding: "12px 16px", borderRadius: "10px", background: "#f1f5f9" }}>
                                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b" }}>Student Status:</span>
                                <span style={{
                                    padding: "3px 12px", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 700,
                                    background: studentStatus === "Enrolled" ? "#d1fae5" : "#fef3c7",
                                    color: studentStatus === "Enrolled" ? "#065f46" : "#92400e",
                                }}>
                                    {studentStatus}
                                </span>
                                {cycleStatus && (
                                    <>
                                        <span style={{ color: "#cbd5e1" }}>|</span>
                                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b" }}>Current Month:</span>
                                        <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.8rem" }}>{cycleStatus.label}</span>
                                        <span style={{ 
                                            fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", 
                                            padding: "2px 8px", borderRadius: "6px", 
                                            background: cycleStatus.status === "OPEN" ? "#dcfce7" : cycleStatus.status === "GRACE" ? "#fee2e2" : "#f1f5f9",
                                            color: cycleStatus.status === "OPEN" ? "#166534" : cycleStatus.status === "GRACE" ? "#991b1b" : "#475569",
                                            marginLeft: "4px"
                                        }}>
                                            {cycleStatus.status}
                                        </span>
                                        <span style={{ marginLeft: "auto", fontSize: "0.75rem", fontWeight: 600, color: cycleStatus.days_remaining <= 5 ? "#dc2626" : "#64748b" }}>
                                            {cycleStatus.days_remaining} days left
                                        </span>
                                    </>
                                )}
                            </div>

                            {errorMsg && (
                                <div style={{ padding: "12px 16px", borderRadius: "10px", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", marginBottom: "1rem", fontSize: "0.85rem" }}>
                                    {errorMsg}
                                </div>
                            )}

                            {/* IEP Card */}
                            <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.25rem", marginBottom: "1rem", background: "white" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div>
                                        <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                                            <span style={{ marginRight: "8px" }}>📋</span>Comprehensive AI-Generated IEP
                                        </h3>
                                        <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>
                                            Compiles all assessment data and uses AI to generate goals, objectives, and recommendations.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleGenerateIEP}
                                        disabled={loading || !["assessed", "enrolled"].includes(studentStatus.toLowerCase())}
                                        style={{
                                            padding: "10px 20px", borderRadius: "8px", border: "none",
                                            background: loading ? "#a5b4fc" : ["assessed", "enrolled"].includes(studentStatus.toLowerCase()) ? "#4f46e5" : "#e2e8f0",
                                            color: ["assessed", "enrolled"].includes(studentStatus.toLowerCase()) ? "white" : "#94a3b8",
                                            fontWeight: 700, fontSize: "0.85rem",
                                            cursor: loading || !["assessed", "enrolled"].includes(studentStatus.toLowerCase()) ? "not-allowed" : "pointer",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {loading ? "⏳ Generating…" : ["assessed", "enrolled"].includes(studentStatus.toLowerCase()) ? "🤖 Generate" : "Requires Review"}
                                    </button>
                                </div>
                            </div>

                            {/* Monthly Progress Card */}
                            <div style={{
                                border: `1px solid ${monthlyEnabled ? "#bbf7d0" : "#e2e8f0"}`,
                                borderRadius: "12px", padding: "1.25rem", background: "white",
                            }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                                            <span style={{ marginRight: "8px" }}>📊</span>Monthly Progress Report
                                        </h3>
                                        <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px", marginBottom: "14px" }}>
                                            Generates the AI monthly tracking document from all 3 submitted progress tracker forms. Also updates IEP Section 10.
                                        </p>

                                        {/* Progress Tracker Status Pills */}
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                            {Object.entries(progressTrackerLabels).map(([key, label]) => {
                                                const submitted = formStatuses?.[key as keyof FormStatuses]?.submitted ?? false;
                                                return (
                                                    <span key={key} style={{
                                                        display: "inline-flex", alignItems: "center", gap: "5px",
                                                        padding: "4px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700,
                                                        background: submitted ? "#dcfce7" : "#f1f5f9",
                                                        color: submitted ? "#166534" : "#94a3b8",
                                                        border: `1px solid ${submitted ? "#a7f3d0" : "#e2e8f0"}`,
                                                    }}>
                                                        {submitted ? (
                                                            <svg style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            <svg style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                        )}
                                                        {label}
                                                    </span>
                                                );
                                            })}
                                            {studentStatus.toLowerCase() === "enrolled" && !allTrackersSubmitted && (
                                                <span style={{ fontSize: "0.75rem", color: "#92400e", fontStyle: "italic", alignSelf: "center" }}>
                                                    All 3 trackers must be submitted first
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleGenerateMonthly}
                                        disabled={!monthlyEnabled}
                                        title={
                                            studentStatus.toLowerCase() !== "enrolled"
                                                ? "Requires Active status"
                                                : !allTrackersSubmitted
                                                ? "All 3 progress tracker forms must be submitted first"
                                                : "Generate monthly progress report"
                                        }
                                        style={{
                                            padding: "10px 20px", borderRadius: "8px", border: "none",
                                            background: monthlyLoading ? "#6ee7b7" : monthlyEnabled ? "#059669" : "#e2e8f0",
                                            color: monthlyEnabled ? "white" : "#94a3b8",
                                            fontWeight: 700, fontSize: "0.85rem",
                                            cursor: monthlyEnabled ? "pointer" : "not-allowed",
                                            whiteSpace: "nowrap", flexShrink: 0,
                                            marginTop: "4px",
                                        }}
                                    >
                                        {monthlyLoading ? "⏳ Generating…"
                                            : studentStatus.toLowerCase() !== "active" ? "Requires Active"
                                            : !allTrackersSubmitted ? "Forms Pending"
                                            : "🤖 Generate"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </ProtectedRoute>
    );
}

export default function AdminReportsPage() {
    return (
        <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Loading Report Generator...</div>}>
            <AdminReportsContent />
        </Suspense>
    );
}
