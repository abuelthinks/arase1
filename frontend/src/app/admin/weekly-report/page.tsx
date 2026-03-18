"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api, { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/* ─── UI Helpers ─────────────────────────────────────────────────────────── */

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "1.25rem" }}>
            <div style={{ padding: "0.875rem 1.5rem", borderBottom: "1px solid #e2e8f0", background: "#f0fdf4" }}>
                <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>{title}</h2>
            </div>
            <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>{children}</div>
        </div>
    );
}

function ProgressSection({ title, data }: { title: string; data: any }) {
    if (!data || (!data.summary && !data.highlights?.length && !data.concerns?.length)) return null;
    return (
        <SectionCard title={title}>
            {data.summary && <p style={{ fontSize: "0.85rem", color: "#1e293b", lineHeight: 1.6, margin: 0 }}>{data.summary}</p>}
            {data.highlights?.length > 0 && (
                <div>
                    <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "#16a34a", marginBottom: "4px" }}>Highlights</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {data.highlights.map((h: string, i: number) => <span key={i} style={{ padding: "3px 10px", borderRadius: "999px", background: "#dcfce7", color: "#166534", fontSize: "0.78rem", fontWeight: 600 }}>{h}</span>)}
                    </div>
                </div>
            )}
            {data.concerns?.length > 0 && (
                <div>
                    <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "#dc2626", marginBottom: "4px" }}>Concerns</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {data.concerns.map((c: string, i: number) => <span key={i} style={{ padding: "3px 10px", borderRadius: "999px", background: "#fee2e2", color: "#991b1b", fontSize: "0.78rem", fontWeight: 600 }}>{c}</span>)}
                    </div>
                </div>
            )}
        </SectionCard>
    );
}

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface WeeklyReportData {
    student_info: Record<string, string>;
    report_period: string;
    executive_summary: string;
    communication_progress: any;
    behavioral_social_progress: any;
    academic_progress: any;
    motor_sensory_progress: any;
    daily_living_independence: any;
    goal_achievement_scores: { goal_id: string; domain: string; score: number; note: string }[];
    therapy_session_summary: Record<string, any>;
    parent_observations: Record<string, any>;
    recommendations: Record<string, string[]>;
    next_week_focus_areas: string[];
}

/* ─── Main Component ──────────────────────────────────────────────────────── */

function WeeklyReportContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const reportId = searchParams.get("id");
    const { user } = useAuth();

    const [report, setReport] = useState<WeeklyReportData | null>(null);
    const [meta, setMeta] = useState<{ student_name: string; created_at: string; report_cycle: { start: string; end: string } } | null>(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!reportId) return;
        setLoading(true);
        api.get(`/api/weekly-report/${reportId}/`)
            .then(res => {
                setReport(res.data.report_data);
                setMeta({ student_name: res.data.student_name, created_at: res.data.created_at, report_cycle: res.data.report_cycle });
            })
            .catch(() => setErrorMsg("Failed to load weekly report."))
            .finally(() => setLoading(false));
    }, [reportId]);

    if (!reportId) return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Missing Report ID.</div>;
    if (loading) return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Loading Weekly Report…</div>;
    if (errorMsg) return <div style={{ padding: "3rem", textAlign: "center", color: "#ef4444" }}>{errorMsg}</div>;
    if (!report || !meta) return null;

    const handleDownload = async () => {
        try {
            // Use fetch with credentials so HttpOnly cookies are sent automatically
            const res = await fetch(`${API_BASE_URL}/api/weekly-report/${reportId}/download/`, {
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Download failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Weekly_Report_${meta?.student_name?.replace(/\s+/g, '_') || reportId}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            setErrorMsg('Failed to download PDF. Please try again.');
        }
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}/admin/weekly-report?id=${reportId}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const si = report.student_info || {};
    const gas = report.goal_achievement_scores || [];
    const tss = report.therapy_session_summary || {};
    const po = report.parent_observations || {};
    const recs = report.recommendations || {};
    const focus = report.next_week_focus_areas || [];

    const scoreColor = (s: number) => {
        if (s >= 5) return { bg: "#dcfce7", color: "#166534" };
        if (s >= 4) return { bg: "#d1fae5", color: "#065f46" };
        if (s >= 3) return { bg: "#dbeafe", color: "#1e40af" };
        if (s >= 2) return { bg: "#fef3c7", color: "#92400e" };
        return { bg: "#fee2e2", color: "#991b1b" };
    };

    return (
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1rem 4rem" }}>
            {/* Breadcrumb Nav */}
            <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "8px" }}>
                <button type="button" onClick={() => router.back()}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", color: "#64748b", textDecoration: "none", fontWeight: 600, fontSize: "0.9rem" }}
                    onMouseOver={(e) => e.currentTarget.style.color = "#2563eb"}
                    onMouseOut={(e) => e.currentTarget.style.color = "#64748b"}
                >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Student Profile
                </button>
                <span style={{ color: "#cbd5e1" }}>›</span>
                <span style={{ color: "#0f172a", fontWeight: 600, fontSize: "0.9rem" }}>
                    Weekly Report for {meta.student_name}
                </span>
            </div>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "12px" }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>📊 Weekly Progress Report</h1>
                    <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "4px" }}>
                        {meta.student_name} · {report.report_period || `Generated ${new Date(meta.created_at).toLocaleDateString()}`}
                    </p>
                </div>
                {user?.role === "ADMIN" && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button onClick={handleCopyLink}
                            style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", color: copied ? "#059669" : "#475569" }}>
                            {copied ? "✓ Copied!" : "🔗 Share Link"}
                        </button>
                        <button onClick={handleDownload}
                            style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", color: "#475569" }}>
                            📥 Download PDF
                        </button>
                    </div>
                )}
            </div>

            {/* Student Info */}
            <SectionCard title="Student Information">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                    {[["Student Name", si.student_name], ["Date of Birth", si.date_of_birth], ["Grade/Level", si.grade_level], ["Report Period", report.report_period]].map(([label, val]) => (
                        <div key={label}>
                            <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "#64748b", marginBottom: "3px" }}>{label}</p>
                            <p style={{ fontSize: "0.85rem", color: "#1e293b", margin: 0 }}>{val || "—"}</p>
                        </div>
                    ))}
                </div>
            </SectionCard>

            {/* Executive Summary */}
            <SectionCard title="Executive Summary">
                <p style={{ fontSize: "0.9rem", color: "#1e293b", lineHeight: 1.7, margin: 0 }}>{report.executive_summary || "No summary available."}</p>
            </SectionCard>

            {/* Progress Sections */}
            <ProgressSection title="Communication Progress" data={report.communication_progress} />
            <ProgressSection title="Behavioral & Social Progress" data={report.behavioral_social_progress} />
            <ProgressSection title="Academic Progress" data={report.academic_progress} />
            <ProgressSection title="Motor & Sensory Progress" data={report.motor_sensory_progress} />
            <ProgressSection title="Daily Living & Independence" data={report.daily_living_independence} />

            {/* Goal Achievement Scores */}
            {gas.length > 0 && (
                <SectionCard title="Goal Achievement Scores (GAS)">
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {gas.map((g, i) => {
                            const sc = scoreColor(g.score);
                            return (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                                    <div style={{ width: 36, height: 36, borderRadius: "8px", background: sc.bg, color: sc.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 800, flexShrink: 0 }}>
                                        {g.score}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>{g.goal_id} — {g.domain}</p>
                                        <p style={{ fontSize: "0.78rem", color: "#64748b", margin: 0 }}>{g.note}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </SectionCard>
            )}

            {/* Therapy Session Summary */}
            {tss.discipline && (
                <SectionCard title="Therapy Session Summary">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        {[["Discipline", tss.discipline], ["Sessions Completed", tss.sessions_completed], ["Attendance", tss.attendance]].map(([label, val]) => (
                            <div key={label as string}>
                                <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "#64748b", marginBottom: "3px" }}>{label}</p>
                                <p style={{ fontSize: "0.85rem", color: "#1e293b", margin: 0 }}>{String(val) || "—"}</p>
                            </div>
                        ))}
                    </div>
                    {tss.key_progress && <p style={{ fontSize: "0.85rem", color: "#1e293b", lineHeight: 1.6, margin: 0 }}><strong>Key Progress:</strong> {tss.key_progress}</p>}
                </SectionCard>
            )}

            {/* Parent Observations */}
            {po.overall_comparison && (
                <SectionCard title="Parent Observations">
                    <p style={{ fontSize: "0.85rem", color: "#1e293b", margin: 0 }}><strong>Overall:</strong> {po.overall_comparison}</p>
                    {po.top_concerns?.length > 0 && (
                        <div>
                            <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "#dc2626", marginBottom: "4px" }}>Concerns</p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {po.top_concerns.map((c: string, i: number) => <span key={i} style={{ padding: "3px 10px", borderRadius: "999px", background: "#fee2e2", color: "#991b1b", fontSize: "0.78rem", fontWeight: 600 }}>{c}</span>)}
                            </div>
                        </div>
                    )}
                    {po.parent_goals?.length > 0 && (
                        <div>
                            <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "#059669", marginBottom: "4px" }}>Goals for Next Week</p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {po.parent_goals.map((g: string, i: number) => <span key={i} style={{ padding: "3px 10px", borderRadius: "999px", background: "#dcfce7", color: "#166534", fontSize: "0.78rem", fontWeight: 600 }}>{g}</span>)}
                            </div>
                        </div>
                    )}
                </SectionCard>
            )}

            {/* Recommendations */}
            {(recs.classroom?.length > 0 || recs.home_program?.length > 0 || recs.therapy_adjustments?.length > 0) && (
                <SectionCard title="Recommendations">
                    {recs.classroom?.length > 0 && (
                        <div>
                            <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#4f46e5", marginBottom: "4px" }}>Classroom</p>
                            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", color: "#1e293b" }}>
                                {recs.classroom.map((r: string, i: number) => <li key={i}>{r}</li>)}
                            </ul>
                        </div>
                    )}
                    {recs.home_program?.length > 0 && (
                        <div>
                            <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#059669", marginBottom: "4px" }}>Home Program</p>
                            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", color: "#1e293b" }}>
                                {recs.home_program.map((r: string, i: number) => <li key={i}>{r}</li>)}
                            </ul>
                        </div>
                    )}
                    {recs.therapy_adjustments?.length > 0 && (
                        <div>
                            <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#dc2626", marginBottom: "4px" }}>Therapy Adjustments</p>
                            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", color: "#1e293b" }}>
                                {recs.therapy_adjustments.map((r: string, i: number) => <li key={i}>{r}</li>)}
                            </ul>
                        </div>
                    )}
                </SectionCard>
            )}

            {/* Next Week Focus Areas */}
            {focus.length > 0 && (
                <SectionCard title="Next Week Focus Areas">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {focus.map((f, i) => (
                            <span key={i} style={{ padding: "6px 14px", borderRadius: "999px", background: "#e0f2fe", color: "#0369a1", fontSize: "0.82rem", fontWeight: 600 }}>🎯 {f}</span>
                        ))}
                    </div>
                </SectionCard>
            )}
        </div>
    );
}

export default function WeeklyReportPage() {
    return (
        <ProtectedRoute>
            <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Loading Weekly Report…</div>}>
                <WeeklyReportContent />
            </Suspense>
        </ProtectedRoute>
    );
}
