"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";

function AdminReportsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const studentId = searchParams.get("studentId");
    const [reportCycleId, setReportCycleId] = useState("1");
    const [studentStatus, setStudentStatus] = useState("Pending Assessment");
    const [studentName, setStudentName] = useState("");

    const [loading, setLoading] = useState(false);
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
                })
                .catch(() => { });
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
            // Navigate to the IEP viewer
            router.push(`/admin/iep?id=${res.data.iep_id}`);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Failed to generate IEP.");
            setLoading(false);
        }
    };

    const handleGenerateWeekly = () => {
        if (!studentId || !reportCycleId) {
            setErrorMsg("Student ID and Report Cycle ID are required.");
            return;
        }
        router.push(`/admin/reports/preview?studentId=${studentId}&cycleId=${reportCycleId}&docType=WEEKLY`);
    };

    if (!studentId) {
        return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Missing student context. Return to dashboard.</div>;
    }

    return (
        <ProtectedRoute allowedRoles={["ADMIN"]}>
            <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "3rem 1rem" }}>
                <div style={{ maxWidth: "700px", margin: "0 auto" }}>
                    <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                        {/* Header */}
                        <div style={{ padding: "1.5rem 2rem", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>Report Generator</h1>
                                <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "4px" }}>Generate documents for <strong>{studentName || `Student #${studentId}`}</strong></p>
                            </div>
                            <button onClick={() => router.back()} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", cursor: "pointer", fontWeight: 600, color: "#64748b", fontSize: "0.85rem" }}>
                                ← Back
                            </button>
                        </div>

                        <div style={{ padding: "1.5rem 2rem" }}>
                            {/* Status bar */}
                            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "1.5rem", padding: "12px 16px", borderRadius: "10px", background: "#f1f5f9" }}>
                                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b" }}>Student Status:</span>
                                <span style={{ padding: "3px 12px", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 700, background: studentStatus === "Enrolled" ? "#d1fae5" : "#fef3c7", color: studentStatus === "Enrolled" ? "#065f46" : "#92400e" }}>
                                    {studentStatus}
                                </span>
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
                                        disabled={loading || !["Assessed", "Enrolled"].includes(studentStatus)}
                                        style={{
                                            padding: "10px 20px", borderRadius: "8px", border: "none",
                                            background: loading ? "#a5b4fc" : ["Assessed", "Enrolled"].includes(studentStatus) ? "#4f46e5" : "#e2e8f0",
                                            color: ["Assessed", "Enrolled"].includes(studentStatus) ? "white" : "#94a3b8",
                                            fontWeight: 700, fontSize: "0.85rem", cursor: loading || !["Assessed", "Enrolled"].includes(studentStatus) ? "not-allowed" : "pointer",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {loading ? "⏳ Generating…" : ["Assessed", "Enrolled"].includes(studentStatus) ? "🤖 Generate" : "Requires Assessed"}
                                    </button>
                                </div>
                            </div>

                            {/* Weekly Progress Card */}
                            <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.25rem", background: "white" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div>
                                        <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                                            <span style={{ marginRight: "8px" }}>📊</span>Weekly Progress Report
                                        </h3>
                                        <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>
                                            Generates the latest weekly tracking document from progress trackers.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleGenerateWeekly}
                                        disabled={studentStatus !== "Enrolled"}
                                        style={{
                                            padding: "10px 20px", borderRadius: "8px", border: "none",
                                            background: studentStatus === "Enrolled" ? "#059669" : "#e2e8f0",
                                            color: studentStatus === "Enrolled" ? "white" : "#94a3b8",
                                            fontWeight: 700, fontSize: "0.85rem", cursor: studentStatus !== "Enrolled" ? "not-allowed" : "pointer",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {studentStatus === "Enrolled" ? "Generate" : "Requires Enrolled"}
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
