"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api, { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/* ─── Shared UI helpers ───────────────────────────────────────────────────── */

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "1.25rem" }}>
            <div style={{ padding: "0.875rem 1.5rem", borderBottom: "1px solid #e2e8f0", background: "#f0f9ff" }}>
                <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>{title}</h2>
            </div>
            <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>{children}</div>
        </div>
    );
}

function Field({ label, value, edit, onChange }: { label: string; value: string; edit: boolean; onChange?: (v: string) => void }) {
    return (
        <div>
            <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "#64748b", marginBottom: "3px" }}>{label}</p>
            {edit ? (
                <textarea
                    value={value}
                    onChange={e => onChange?.(e.target.value)}
                    rows={Math.max(2, (value || "").split("\n").length)}
                    style={{ width: "100%", borderRadius: "8px", border: "1px solid #e2e8f0", padding: "8px 12px", fontSize: "0.85rem", resize: "vertical", boxSizing: "border-box" }}
                />
            ) : (
                <p style={{ fontSize: "0.85rem", color: "#1e293b", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.5 }}>{value || "—"}</p>
            )}
        </div>
    );
}

function PillList({ items }: { items: string[] }) {
    if (!items || items.length === 0) return <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>—</span>;
    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {items.map(i => <span key={i} style={{ padding: "3px 10px", borderRadius: "999px", background: "#e0f2fe", color: "#0369a1", fontSize: "0.78rem", fontWeight: 600 }}>{i}</span>)}
        </div>
    );
}

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface IEPData {
    section1_student_info: Record<string, any>;
    section2_background: Record<string, string>;
    section3_strengths: { strengths: string[]; interests: string[] };
    section4_plop: Record<string, Record<string, string>>;
    section5_ltg: { id: string; domain: string; goal: string; disciplines: string }[];
    section6_sto: { id: string; ltg_ref: string; objective: string; target_skill: string; teaching_method: string; success_criteria: string; frequency: string; responsible: string }[];
    section7_accommodations: { classroom: string[]; learning_modifications: string[]; communication_supports: string[] };
    section8_therapies: Record<string, Record<string, string>>;
    section9_home_program: Record<string, string[]>;
    section10_progress: Record<string, any>;
    section11_review: Record<string, string>;
    section12_signatures: Record<string, string>;
}

/* ─── Main Component ──────────────────────────────────────────────────────── */

function IEPViewerContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const iepId = searchParams.get("id");
    const { user } = useAuth();

    const [iep, setIep] = useState<IEPData | null>(null);
    const [iepStatus, setIepStatus] = useState<string>("DRAFT");
    const [meta, setMeta] = useState<{ student_name: string; created_at: string; report_cycle: { start: string; end: string } } | null>(null);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState("");
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [auditHistory, setAuditHistory] = useState<any[]>([]);

    useEffect(() => {
        if (!iepId) return;
        setLoading(true);
        api.get(`/api/iep/${iepId}/`)
            .then(res => {
                setIep(res.data.iep_data);
                setMeta({ student_name: res.data.student_name, created_at: res.data.created_at, report_cycle: res.data.report_cycle });
                setIepStatus(res.data.status);
                if (res.data.status === "DRAFT") {
                    setEditing(true);
                }
            })
            .catch(() => setErrorMsg("Failed to load IEP."))
            .finally(() => setLoading(false));
    }, [iepId]);

    if (!iepId) return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Missing IEP ID.</div>;
    if (loading) return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Loading IEP…</div>;
    if (errorMsg) return <div style={{ padding: "3rem", textAlign: "center", color: "#ef4444" }}>{errorMsg}</div>;
    if (!iep || !meta) return null;

    const set = (section: keyof IEPData, path: string[], value: any) => {
        setIep(prev => {
            if (!prev) return prev;
            const copy = JSON.parse(JSON.stringify(prev));
            let obj = copy[section];
            for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
            obj[path[path.length - 1]] = value;
            return copy;
        });
    };

    const handleSave = async (newStatus?: string) => {
        setSaving(true);
        const payloadStatus = newStatus || iepStatus;
        try {
            const res = await api.patch(`/api/iep/${iepId}/`, { iep_data: iep, status: payloadStatus });
            setIepStatus(res.data.status);
            if (newStatus === "FINAL") {
                setEditing(false);
            }
        } catch { setErrorMsg("Failed to save."); }
        finally { setSaving(false); }
    };

    const handleDownload = () => {
        // Redirect to the download endpoint. 
        // Since it's a file download response, the browser will handle it without leaving the page.
        window.location.href = `${API_BASE_URL}/api/iep/${iepId}/download/`;
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}/admin/iep?id=${iepId}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const fetchAuditHistory = async () => {
        try {
            const res = await api.get(`/api/documents/${iepId}/history/`);
            setAuditHistory(res.data.history);
            setShowAuditModal(true);
        } catch (e) {
            console.error("Failed to fetch audit history", e);
        }
    };

    const s1 = iep.section1_student_info || {};
    const s2 = iep.section2_background || {};
    const s3 = iep.section3_strengths || { strengths: [], interests: [] };
    const s4 = iep.section4_plop || {};
    const s5 = iep.section5_ltg || [];
    const s6 = iep.section6_sto || [];
    const s7 = iep.section7_accommodations || { classroom: [], learning_modifications: [], communication_supports: [] };
    const s8 = iep.section8_therapies || {};
    const s9 = iep.section9_home_program || {};

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
                    IEP for {meta.student_name}
                </span>
            </div>
            
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "12px" }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
                        Comprehensive AI-Generated IEP
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "4px 8px", borderRadius: "6px", verticalAlign: "middle", background: iepStatus === "FINAL" ? "#dcfce7" : "#fef3c7", color: iepStatus === "FINAL" ? "#166534" : "#92400e", border: `1px solid ${iepStatus === "FINAL" ? "#bbf7d0" : "#fde68a"}` }}>
                            {iepStatus === "FINAL" ? "FINAL" : "DRAFT"}
                        </span>
                    </h1>
                    <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "4px" }}>
                        {meta.student_name} · Generated {new Date(meta.created_at).toLocaleDateString()}
                    </p>
                </div>
                {user?.role === "ADMIN" && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button onClick={fetchAuditHistory}
                            style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", color: "#475569" }}>
                            ⏱️ Audit History
                        </button>
                        <button onClick={handleCopyLink}
                            style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", color: copied ? "#059669" : "#475569" }}>
                            {copied ? "✓ Copied!" : "🔗 Share Link"}
                        </button>
                        <button onClick={handleDownload}
                            style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", color: "#475569" }}>
                            📥 Download PDF
                        </button>
                        {editing ? (
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                <button onClick={() => setEditing(false)} style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", color: "#64748b" }}>Cancel</button>
                                <button onClick={() => handleSave("DRAFT")} disabled={saving}
                                    style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#334155", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer" }}>
                                    {saving ? "Saving…" : "💾 Save Draft"}
                                </button>
                                <button onClick={() => handleSave("FINAL")} disabled={saving}
                                    style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "#059669", color: "white", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer" }}>
                                    {saving ? "Saving…" : "✅ Finalize"}
                                </button>
                            </div>
                        ) : (
                            <button onClick={() => setEditing(true)}
                                style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "#4f46e5", color: "white", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer" }}>
                                ✏️ Edit
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Section 1 — Student Info */}
            <SectionCard title="Section 1 — Student Information">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                    {[["Student Name", "student_name"], ["Date of Birth", "date_of_birth"], ["Gender", "gender"], ["Grade/Level", "grade_level"], ["IEP Start", "iep_start_date"], ["IEP End", "iep_end_date"]].map(([label, key]) => (
                        <Field key={key} label={label} value={s1[key] || ""} edit={false} />
                    ))}
                </div>
                {s1.team_members?.length > 0 && (
                    <div>
                        <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "#64748b", marginBottom: "4px" }}>IEP Team Members</p>
                        <PillList items={s1.team_members.map((m: any) => `${m.name} (${m.role})`)} />
                    </div>
                )}
            </SectionCard>

            {/* Section 2 — Background */}
            <SectionCard title="Section 2 — Background & Developmental Summary">
                <Field label="Developmental History" value={s2.developmental_history || ""} edit={editing}
                    onChange={v => set("section2_background", ["developmental_history"], v)} />
                <Field label="Classroom Functioning Overview" value={s2.classroom_functioning || ""} edit={editing}
                    onChange={v => set("section2_background", ["classroom_functioning"], v)} />
                <Field label="Family Input Summary" value={s2.family_input_summary || ""} edit={editing}
                    onChange={v => set("section2_background", ["family_input_summary"], v)} />
            </SectionCard>

            {/* Section 3 — Strengths & Interests */}
            <SectionCard title="Section 3 — Strengths & Interests">
                <div><p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "4px" }}>Strengths</p><PillList items={s3.strengths} /></div>
                <div><p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "4px" }}>Interests / Motivators</p><PillList items={s3.interests} /></div>
            </SectionCard>

            {/* Section 4 — PLOP */}
            <SectionCard title="Section 4 — Present Levels of Performance (PLOP)">
                {Object.entries({
                    communication_slp: "Communication (SLP)",
                    fine_motor_ot: "Fine Motor, Sensory & ADLs (OT)",
                    gross_motor_pt: "Gross Motor / Physical (PT)",
                    behavioral_psych: "Behavioral & Emotional (Psych)",
                    academic_sped: "Academic / Learning (SPED)",
                    adaptive_life_skills: "Adaptive & Life Skills"
                }).map(([key, lbl]) => {
                    const domain = s4[key] || {};
                    return (
                        <div key={key} style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: "10px" }}>
                            <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#0ea5e9", marginBottom: "6px" }}>{lbl}</p>
                            {Object.entries(domain).map(([fk, fv]) => (
                                <Field key={fk} label={fk.replace(/_/g, ' ')} value={String(fv)} edit={editing}
                                    onChange={v => set("section4_plop", [key, fk], v)} />
                            ))}
                        </div>
                    );
                })}
            </SectionCard>

            {/* Section 5 — Long-Term Goals */}
            <SectionCard title="Section 5 — Long-Term IEP Goals (1 Year)">
                {s5.map((ltg, i) => (
                    <div key={ltg.id} style={{ background: "#f8fafc", borderRadius: "10px", padding: "12px 16px", border: "1px solid #e2e8f0" }}>
                        <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#4f46e5", margin: "0 0 4px" }}>{ltg.id} — {ltg.domain}</p>
                        <Field label="Goal" value={ltg.goal} edit={editing}
                            onChange={v => { const copy = [...s5]; copy[i] = { ...copy[i], goal: v }; setIep(prev => prev ? { ...prev, section5_ltg: copy } : prev); }} />
                        <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}><em>Disciplines: {ltg.disciplines}</em></p>
                    </div>
                ))}
            </SectionCard>

            {/* Section 6 — Short-Term Objectives */}
            <SectionCard title="Section 6 — Short-Term Objectives (3–4 months)">
                {s6.map((sto, i) => (
                    <div key={sto.id} style={{ background: "#f8fafc", borderRadius: "10px", padding: "12px 16px", border: "1px solid #e2e8f0" }}>
                        <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#059669", margin: "0 0 4px" }}>Objective {sto.id} → {sto.ltg_ref}</p>
                        <Field label="Objective" value={sto.objective} edit={editing}
                            onChange={v => { const c = [...s6]; c[i] = { ...c[i], objective: v }; setIep(p => p ? { ...p, section6_sto: c } : p); }} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "4px" }}>
                            <Field label="Target Skill" value={sto.target_skill} edit={editing}
                                onChange={v => { const c = [...s6]; c[i] = { ...c[i], target_skill: v }; setIep(p => p ? { ...p, section6_sto: c } : p); }} />
                            <Field label="Teaching Method" value={sto.teaching_method} edit={editing}
                                onChange={v => { const c = [...s6]; c[i] = { ...c[i], teaching_method: v }; setIep(p => p ? { ...p, section6_sto: c } : p); }} />
                            <Field label="Success Criteria" value={sto.success_criteria} edit={editing}
                                onChange={v => { const c = [...s6]; c[i] = { ...c[i], success_criteria: v }; setIep(p => p ? { ...p, section6_sto: c } : p); }} />
                            <Field label="Frequency" value={sto.frequency} edit={editing}
                                onChange={v => { const c = [...s6]; c[i] = { ...c[i], frequency: v }; setIep(p => p ? { ...p, section6_sto: c } : p); }} />
                        </div>
                        <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>Responsible: {sto.responsible}</p>
                    </div>
                ))}
            </SectionCard>

            {/* Section 7 — Accommodations */}
            <SectionCard title="Section 7 — Accommodations & Modifications">
                <div><p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "4px" }}>Classroom Accommodations</p><PillList items={s7.classroom} /></div>
                <div><p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "4px" }}>Learning Modifications</p><PillList items={s7.learning_modifications} /></div>
                <div><p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "4px" }}>Communication Supports</p><PillList items={s7.communication_supports} /></div>
            </SectionCard>

            {/* Section 8 — Therapies */}
            <SectionCard title="Section 8 — Therapies & Intervention Plan">
                {Object.entries({
                    speech_therapy: "Speech Therapy",
                    occupational_therapy: "Occupational Therapy",
                    physical_therapy: "Physical Therapy",
                    psychology: "Psychology / Behavioral",
                    sped_sessions: "SPED Sessions",
                    shadow_teacher: "Shadow Teacher"
                }).map(([key, lbl]) => {
                    const t = s8[key] || {};
                    return (
                        <div key={key} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                            <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1e293b", minWidth: "160px" }}>{lbl}</span>
                            {key === "shadow_teacher" ? (
                                <span style={{ fontSize: "0.85rem", color: "#475569" }}>Hours: {t.hours || "N/A"}</span>
                            ) : (
                                <span style={{ fontSize: "0.85rem", color: "#475569" }}>{t.frequency || "N/A"} — {t.focus_areas || "N/A"}</span>
                            )}
                        </div>
                    );
                })}
            </SectionCard>

            {/* Section 9 — Home Program */}
            <SectionCard title="Section 9 — Home Program">
                {Object.entries({
                    speech_tasks: "Speech Tasks",
                    sensory_ot_tasks: "Sensory / OT Tasks",
                    behavioral_tasks: "Behavioral Tasks",
                    academic_tasks: "Academic Tasks"
                }).map(([key, lbl]) => (
                    <div key={key}>
                        <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0ea5e9", marginBottom: "4px" }}>{lbl}</p>
                        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", color: "#1e293b" }}>
                            {(s9[key] || []).map((item: string, i: number) => <li key={i}>{item}</li>)}
                        </ul>
                    </div>
                ))}
            </SectionCard>

            {/* Section 10 — Progress Monitoring */}
            <SectionCard title="Section 10 — Progress Monitoring & GAS Scores">
                {iep.section10_progress && iep.section10_progress.gas_scores?.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        {/* Last updated badge */}
                        {iep.section10_progress.last_updated && (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "0.72rem", fontWeight: 700, background: "#dcfce7", color: "#166534", padding: "3px 10px", borderRadius: "999px" }}>
                                    📅 Last updated: Week of {iep.section10_progress.last_updated}
                                </span>
                                {iep.section10_progress.report_period && (
                                    <span style={{ fontSize: "0.72rem", color: "#64748b" }}>({iep.section10_progress.report_period})</span>
                                )}
                            </div>
                        )}

                        {/* GAS Score Table */}
                        <div>
                            <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "#64748b", marginBottom: "8px" }}>Goal Achievement Scores</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                {iep.section10_progress.gas_scores.map((g: any, i: number) => {
                                    const sc = g.score >= 5 ? { bg: "#dcfce7", color: "#166534" }
                                        : g.score >= 4 ? { bg: "#d1fae5", color: "#065f46" }
                                        : g.score >= 3 ? { bg: "#dbeafe", color: "#1e40af" }
                                        : g.score >= 2 ? { bg: "#fef3c7", color: "#92400e" }
                                        : { bg: "#fee2e2", color: "#991b1b" };
                                    return (
                                        <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                                            <div style={{ width: 34, height: 34, borderRadius: "8px", background: sc.bg, color: sc.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 800, flexShrink: 0 }}>
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
                        </div>

                        {/* Narrative Summary */}
                        {iep.section10_progress.narrative_summary && (
                            <Field label="Narrative Summary" value={iep.section10_progress.narrative_summary} edit={false} />
                        )}
                        {/* Regression Indicators */}
                        {iep.section10_progress.regression_indicators && iep.section10_progress.regression_indicators !== "No regression indicators reported." && (
                            <div style={{ padding: "10px 14px", borderRadius: "10px", background: "#fff1f2", border: "1px solid #fecdd3" }}>
                                <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "#be123c", marginBottom: "4px", textTransform: "uppercase" }}>⚠ Regression Indicators</p>
                                <p style={{ fontSize: "0.82rem", color: "#9f1239", margin: 0 }}>{iep.section10_progress.regression_indicators}</p>
                            </div>
                        )}
                        {/* Attendance */}
                        {iep.section10_progress.attendance_summary && (
                            <Field label="Attendance Summary" value={iep.section10_progress.attendance_summary} edit={false} />
                        )}
                    </div>
                ) : (
                    <p style={{ fontSize: "0.85rem", color: "#94a3b8", fontStyle: "italic" }}>Progress data will be populated automatically after the first weekly report is generated.</p>
                )}
            </SectionCard>

            {/* Section 11 — Review (placeholder) */}
            <SectionCard title="Section 11 — IEP Review Summary">
                <p style={{ fontSize: "0.85rem", color: "#94a3b8", fontStyle: "italic" }}>Quarterly review summary will be generated automatically.</p>
            </SectionCard>

            {/* Section 12 — Signatures */}
            <SectionCard title="Section 12 — Signatures">
                <p style={{ fontSize: "0.85rem", color: "#94a3b8", fontStyle: "italic" }}>Signatures will be collected upon IEP approval.</p>
            </SectionCard>

            {/* Audit History Modal */}
            {showAuditModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }} onClick={() => setShowAuditModal(false)}>
                    <div style={{ background: "white", borderRadius: "16px", padding: "2rem", width: "100%", maxWidth: "500px", position: "relative", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)" }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setShowAuditModal(false)} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "#64748b" }}>×</button>
                        <h2 style={{ margin: "0 0 1.5rem 0", fontSize: "1.25rem", color: "#0f172a", fontWeight: 800 }}>Document Audit History</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "60vh", overflowY: "auto", paddingRight: "0.5rem" }}>
                            {auditHistory.length === 0 ? (
                                <p style={{ color: "#64748b", margin: 0, fontSize: "0.9rem" }}>No history found.</p>
                            ) : (
                                auditHistory.map((item, idx) => (
                                    <div key={item.id} style={{ display: "flex", gap: "1rem", position: "relative" }}>
                                        {idx !== auditHistory.length - 1 && <div style={{ position: "absolute", width: "2px", background: "#e2e8f0", top: "24px", bottom: "-16px", left: "11px" }} />}
                                        <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#e0e7ff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                                            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4f46e5" }} />
                                        </div>
                                        <div>
                                            <p style={{ margin: "0 0 4px 0", fontSize: "0.9rem", color: "#0f172a", fontWeight: 700 }}>
                                                {item.action === "GENERATED" ? "AI Generated Draft" : item.action === "EDITED_DRAFT" ? "Draft Saved" : "Document Finalized"}
                                            </p>
                                            <p style={{ margin: "0 0 2px 0", fontSize: "0.8rem", color: "#475569" }}>By {item.edited_by}</p>
                                            <p style={{ margin: 0, fontSize: "0.75rem", color: "#94a3b8" }}>{new Date(item.created_at).toLocaleString()}</p>
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

export default function IEPViewerPage() {
    return (
        <ProtectedRoute>
            <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Loading IEP…</div>}>
                <IEPViewerContent />
            </Suspense>
        </ProtectedRoute>
    );
}
