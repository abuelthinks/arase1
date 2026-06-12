"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api, { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { semanticToneHex, type SemanticTone } from "@/lib/role-colors";

/* â”€â”€â”€ UI Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ background: "var(--bg-secondary)", borderRadius: "14px", border: "1px solid var(--border-light)", overflow: "hidden", marginBottom: "1.25rem" }}>
            <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border-light)", background: "var(--bg-primary)" }}>
                <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</h2>
            </div>
            <div style={{ padding: "1.15rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>{children}</div>
        </div>
    );
}

const pillStyle = (tone: SemanticTone): React.CSSProperties => {
    const colors = semanticToneHex(tone);
    return {
        padding: "3px 10px",
        borderRadius: "999px",
        background: colors.bg,
        color: colors.color,
        border: `1px solid ${colors.border}`,
        fontSize: "0.78rem",
        fontWeight: 600,
    };
};

const sectionLabelStyle = (tone: SemanticTone): React.CSSProperties => ({
    fontSize: "0.7rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    color: semanticToneHex(tone).color,
    marginBottom: "4px",
});

function ProgressSection({ title, data }: { title: string; data: any }) {
    if (!data || (!data.summary && !data.highlights?.length && !data.concerns?.length)) return null;
    return (
        <SectionCard title={title}>
            {data.summary && <p style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.6, margin: 0 }}>{data.summary}</p>}
            {data.highlights?.length > 0 && (
                <div>
                    <p style={sectionLabelStyle("success")}>Highlights</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {data.highlights.map((h: string, i: number) => <span key={i} style={pillStyle("success")}>{h}</span>)}
                    </div>
                </div>
            )}
            {data.concerns?.length > 0 && (
                <div>
                    <p style={sectionLabelStyle("danger")}>Concerns</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {data.concerns.map((c: string, i: number) => <span key={i} style={pillStyle("danger")}>{c}</span>)}
                    </div>
                </div>
            )}
        </SectionCard>
    );
}

/* â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

interface MonthlyReportData {
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
    next_month_focus_areas: string[];
}

const formatDocumentDateTime = (value?: string | null) => {
    if (!value) return "";
    return new Date(value).toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
};

/* â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export function MonthlyReportContent({ propId, propHideNavigation }: { propId?: string; propHideNavigation?: boolean }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const reportId = propId || searchParams.get("id");
    const { user } = useAuth();

    const [report, setReport] = useState<MonthlyReportData | null>(null);
    const [meta, setMeta] = useState<{ student_name: string; created_at: string; report_cycle: { start: string; end: string } } | null>(null);
    const [reportStatus, setReportStatus] = useState<string>("DRAFT");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [copied, setCopied] = useState(false);
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [auditHistory, setAuditHistory] = useState<any[]>([]);

    useEffect(() => {
        if (!reportId) return;
        setLoading(true);
        api.get(`/api/monthly-report/${reportId}/`)
            .then(res => {
                setReport(res.data.report_data);
                setMeta({ student_name: res.data.student_name, created_at: res.data.created_at, report_cycle: res.data.report_cycle });
                setReportStatus(res.data.status);
            })
            .catch(() => setErrorMsg("Failed to load monthly report."))
            .finally(() => setLoading(false));
    }, [reportId]);

    if (!reportId) return <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Missing Report ID.</div>;
    if (loading) return <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Loading Monthly Reportâ€¦</div>;
    if (errorMsg) return <div style={{ padding: "3rem", textAlign: "center", color: "#ef4444" }}>{errorMsg}</div>;
    if (!report || !meta) return null;

    const handleDownload = () => {
        // Redirect to download endpoint
        window.location.href = `${API_BASE_URL}/api/monthly-report/${reportId}/download/`;
    };

    const handleSaveStatus = async (newStatus: string) => {
        setSaving(true);
        try {
            const res = await api.patch(`/api/monthly-report/${reportId}/`, { status: newStatus });
            setReportStatus(res.data.status);
        } catch { setErrorMsg("Failed to save status."); }
        finally { setSaving(false); }
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}/admin/monthly-report?id=${reportId}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const fetchAuditHistory = async () => {
        try {
            const res = await api.get(`/api/documents/${reportId}/history/`);
            setAuditHistory(res.data.history);
            setShowAuditModal(true);
        } catch (e) {
            console.error("Failed to fetch audit history", e);
        }
    };

    const si = report.student_info || {};
    const gas = report.goal_achievement_scores || [];
    const tss = report.therapy_session_summary || {};
    const po = report.parent_observations || {};
    const recs = report.recommendations || {};
    const focus = report.next_month_focus_areas || [];

    const scoreColor = (s: number) => {
        if (s >= 4) return semanticToneHex("success");
        if (s >= 3) return semanticToneHex("info");
        if (s >= 2) return semanticToneHex("warning");
        return semanticToneHex("danger");
    };
    const reportStatusStyle = semanticToneHex(reportStatus === "FINAL" ? "success" : "warning");

    return (
        <div style={{ maxWidth: propHideNavigation ? "1024px" : "900px", margin: "0 auto", padding: propHideNavigation ? "1.5rem 1.25rem 3rem" : "2rem 1rem 4rem" }}>
            {/* Breadcrumb Nav */}
            {!propHideNavigation && (
                <div className="hidden md:flex" style={{ marginBottom: "1.5rem", alignItems: "center", gap: "8px" }}>
                <button type="button" onClick={() => router.back()}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)", textDecoration: "none", fontWeight: 600, fontSize: "0.9rem" }}
                    onMouseOver={(e) => e.currentTarget.style.color = "#2563eb"}
                    onMouseOut={(e) => e.currentTarget.style.color = "var(--text-secondary)"}
                >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Student Profile
                </button>
                <span style={{ color: "var(--text-muted)" }}>â€º</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "0.9rem" }}>
                    Monthly Report for {meta.student_name}
                </span>
            </div>
            )}

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "12px" }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        ðŸ“Š Monthly Progress Report
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "4px 8px", borderRadius: "6px", verticalAlign: "middle", background: reportStatusStyle.bg, color: reportStatusStyle.color, border: `1px solid ${reportStatusStyle.border}` }}>
                            {reportStatus === "FINAL" ? "FINAL" : "DRAFT"}
                        </span>
                    </h1>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                        {meta.student_name} Â· {report.report_period || "Progress Report"} Â· Generated {formatDocumentDateTime(meta.created_at)}
                    </p>
                </div>
                {user?.role === "ADMIN" && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <button onClick={fetchAuditHistory}
                            style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--border-light)", background: "var(--bg-secondary)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", color: "var(--text-secondary)" }}>
                            â±ï¸ Audit History
                        </button>
                        <button onClick={handleDownload}
                            style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--border-light)", background: "var(--bg-secondary)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", color: "var(--text-secondary)" }}>
                            ðŸ“¥ Download PDF
                        </button>
                        <span className="hidden md:block" style={{ width: "1px", height: "24px", background: "var(--text-muted)", margin: "0 4px" }}></span>
                        {reportStatus !== "FINAL" ? (
                            <button onClick={() => handleSaveStatus("FINAL")} disabled={saving}
                                style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: semanticToneHex("success").color, color: "white", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer" }}>
                                {saving ? "Savingâ€¦" : "âœ… Finalize"}
                            </button>
                        ) : (
                            <button onClick={() => handleSaveStatus("DRAFT")} disabled={saving}
                                style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-light)", background: "var(--bg-primary)", color: "var(--text-secondary)", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer" }}>
                                {saving ? "Savingâ€¦" : "Revert to Draft"}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Student Info */}
            <SectionCard title="Student Information">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {[["Student Name", si.student_name], ["Date of Birth", si.date_of_birth], ["Grade/Level", si.grade_level], ["Report Period", report.report_period]].map(([label, val]) => (
                        <div key={label}>
                            <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--text-secondary)", marginBottom: "3px" }}>{label}</p>
                            <p style={{ fontSize: "0.85rem", color: "var(--text-primary)", margin: 0 }}>{val || "â€”"}</p>
                        </div>
                    ))}
                </div>
            </SectionCard>

            {/* Executive Summary */}
            <SectionCard title="Executive Summary">
                <p style={{ fontSize: "0.9rem", color: "var(--text-primary)", lineHeight: 1.7, margin: 0 }}>{report.executive_summary || "No summary available."}</p>
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
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--border-light)", background: "var(--bg-primary)" }}>
                                    <div style={{ width: 36, height: 36, borderRadius: "8px", background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 800, flexShrink: 0 }}>
                                        {g.score}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{g.goal_id} â€” {g.domain}</p>
                                        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: 0 }}>{g.note}</p>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {[["Discipline", tss.discipline], ["Sessions Completed", tss.sessions_completed], ["Attendance", tss.attendance]].map(([label, val]) => (
                            <div key={label as string}>
                                <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--text-secondary)", marginBottom: "3px" }}>{label}</p>
                                <p style={{ fontSize: "0.85rem", color: "var(--text-primary)", margin: 0 }}>{String(val) || "â€”"}</p>
                            </div>
                        ))}
                    </div>
                    {tss.key_progress && <p style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.6, margin: 0 }}><strong>Key Progress:</strong> {tss.key_progress}</p>}
                </SectionCard>
            )}

            {/* Parent Observations */}
            {po.overall_comparison && (
                <SectionCard title="Parent Observations">
                    <p style={{ fontSize: "0.85rem", color: "var(--text-primary)", margin: 0 }}><strong>Overall:</strong> {po.overall_comparison}</p>
                    {po.top_concerns?.length > 0 && (
                        <div>
                            <p style={sectionLabelStyle("danger")}>Concerns</p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {po.top_concerns.map((c: string, i: number) => <span key={i} style={pillStyle("danger")}>{c}</span>)}
                            </div>
                        </div>
                    )}
                    {po.parent_goals?.length > 0 && (
                        <div>
                            <p style={sectionLabelStyle("success")}>Goals for Next Month</p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {po.parent_goals.map((g: string, i: number) => <span key={i} style={pillStyle("success")}>{g}</span>)}
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
                            <p style={{ fontSize: "0.78rem", fontWeight: 700, color: semanticToneHex("primary").color, marginBottom: "4px" }}>Classroom</p>
                            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                                {recs.classroom.map((r: string, i: number) => <li key={i}>{r}</li>)}
                            </ul>
                        </div>
                    )}
                    {recs.home_program?.length > 0 && (
                        <div>
                            <p style={{ fontSize: "0.78rem", fontWeight: 700, color: semanticToneHex("success").color, marginBottom: "4px" }}>Home Program</p>
                            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                                {recs.home_program.map((r: string, i: number) => <li key={i}>{r}</li>)}
                            </ul>
                        </div>
                    )}
                    {recs.therapy_adjustments?.length > 0 && (
                        <div>
                            <p style={{ fontSize: "0.78rem", fontWeight: 700, color: semanticToneHex("danger").color, marginBottom: "4px" }}>Therapy Adjustments</p>
                            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                                {recs.therapy_adjustments.map((r: string, i: number) => <li key={i}>{r}</li>)}
                            </ul>
                        </div>
                    )}
                </SectionCard>
            )}

            {/* Next Week Focus Areas */}
            {focus.length > 0 && (
                <SectionCard title="Next Month Focus Areas">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {focus.map((f, i) => (
                            <span key={i} style={pillStyle("info")}>Focus: {f}</span>
                        ))}
                    </div>
                </SectionCard>
            )}

            {/* Audit History Modal */}
            {showAuditModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }} onClick={() => setShowAuditModal(false)}>
                    <div style={{ background: "var(--bg-secondary)", borderRadius: "16px", padding: "2rem", width: "100%", maxWidth: "500px", position: "relative", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)" }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setShowAuditModal(false)} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-secondary)" }}>Ã—</button>
                        <h2 style={{ margin: "0 0 1.5rem 0", fontSize: "1.25rem", color: "var(--text-primary)", fontWeight: 800 }}>Document Audit History</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "60vh", overflowY: "auto", paddingRight: "0.5rem" }}>
                            {auditHistory.length === 0 ? (
                                <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.9rem" }}>No history found.</p>
                            ) : (
                                auditHistory.map((item, idx) => (
                                    <div key={item.id} style={{ display: "flex", gap: "1rem", position: "relative" }}>
                                        {idx !== auditHistory.length - 1 && <div style={{ position: "absolute", width: "2px", background: "var(--border-light)", top: "24px", bottom: "-16px", left: "11px" }} />}
                                        <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: semanticToneHex("primary").bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                                            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: semanticToneHex("primary").color }} />
                                        </div>
                                        <div>
                                            <p style={{ margin: "0 0 4px 0", fontSize: "0.9rem", color: "var(--text-primary)", fontWeight: 700 }}>
                                                {item.action === "GENERATED" ? "AI Generated Draft" : item.action === "EDITED_DRAFT" ? "Draft Saved" : "Document Finalized"}
                                            </p>
                                            <p style={{ margin: "0 0 2px 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>By {item.edited_by}</p>
                                            <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-muted)" }}>{new Date(item.created_at).toLocaleString()}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function MonthlyReportRedirect() {
    const searchParams = useSearchParams();
    const router = useRouter();

    useEffect(() => {
        const id = searchParams.get("id");
        if (id) {
            api.get(`/api/monthly-report/${id}/`)
                .then(res => {
                    router.replace(`/workspace?studentId=${res.data.student_id}&workspace=reports&view=monthly&docId=${id}`);
                })
                .catch(() => {
                    router.replace("/workspace");
                });
        } else {
            router.replace("/workspace");
        }
    }, [searchParams, router]);

    return <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Redirecting to workspaceâ€¦</div>;
}

export default function MonthlyReportPage() {
    return (
        <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Loadingâ€¦</div>}>
            <MonthlyReportRedirect />
        </Suspense>
    );
}
