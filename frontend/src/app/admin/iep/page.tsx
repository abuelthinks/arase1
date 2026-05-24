"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import ProtectedRoute from "@/components/ProtectedRoute";
import api, { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/* ─── Shared UI helpers ───────────────────────────────────────────────────── */

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden mb-5">
            <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50 m-0">{title}</h2>
            </div>
            <div className="p-6 flex flex-col gap-3">{children}</div>
        </div>
    );
}

function Field({ label, value, edit, onChange }: { label: string; value: string; edit: boolean; onChange?: (v: string) => void }) {
    return (
        <div>
            <p className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-1">{label}</p>
            {edit ? (
                <textarea
                    value={value}
                    onChange={e => onChange?.(e.target.value)}
                    rows={Math.max(2, (value || "").split("\n").length)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-xs text-slate-900 dark:text-slate-50 resize-y box-border focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
            ) : (
                <p className="text-xs text-slate-850 dark:text-slate-200 whitespace-pre-wrap m-0 leading-relaxed">{value || "—"}</p>
            )}
        </div>
    );
}

function PillList({ items }: { items: string[] }) {
    if (!items || items.length === 0) return <span className="text-xs text-slate-400 dark:text-slate-400">—</span>;
    return (
        <div className="flex flex-wrap gap-1.5">
            {items.map(i => <span key={i} className="px-2.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-[0.7rem] font-semibold">{i}</span>)}
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

/* ─── Main Component ──────────────────────────────────────────────────────── */

export function IEPViewerContent({ propId, propHideNavigation }: { propId?: string; propHideNavigation?: boolean }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const iepId = propId || searchParams.get("id");
    const { user } = useAuth();

    const [iep, setIep] = useState<IEPData | null>(null);
    const [iepStatus, setIepStatus] = useState<string>("DRAFT");
    const [meta, setMeta] = useState<{ student_id: number; student_name: string; created_at: string; report_cycle: { start: string; end: string } } | null>(null);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState("");
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [auditHistory, setAuditHistory] = useState<any[]>([]);
    const loadedIepStr = useRef("");
    const editSnapshotStr = useRef("");

    useEffect(() => {
        if (!iepId) return;
        setLoading(true);
        api.get(`/api/iep/${iepId}/`)
            .then(res => {
                setIep(res.data.iep_data);
                loadedIepStr.current = JSON.stringify(res.data.iep_data);
                setMeta({ student_id: res.data.student_id, student_name: res.data.student_name, created_at: res.data.created_at, report_cycle: res.data.report_cycle });
                setIepStatus(res.data.status);
                if (res.data.status === "DRAFT") {
                    setEditing(true);
                    editSnapshotStr.current = JSON.stringify(res.data.iep_data);
                }
            })
            .catch(() => setErrorMsg("Failed to load IEP."))
            .finally(() => setLoading(false));
    }, [iepId]);

    // Auto-save
    useEffect(() => {
        if (!editing || !iep) return;
        const currentIepStr = JSON.stringify(iep);
        if (currentIepStr === loadedIepStr.current) return;
        
        const timeoutId = setTimeout(() => {
            setSaving(true);
            api.patch(`/api/iep/${iepId}/`, { iep_data: iep, status: iepStatus })
                .then(res => {
                    setIepStatus(res.data.status);
                    loadedIepStr.current = currentIepStr;
                    setErrorMsg("");
                })
                .catch(() => setErrorMsg("Auto-save failed."))
                .finally(() => setSaving(false));
        }, 1500);

        return () => clearTimeout(timeoutId);
    }, [iep, editing, iepId, iepStatus]);

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
                // Nudge the admin toward the next step (enroll / integrate).
                const studentId = meta?.student_id;
                toast.success("IEP finalized. Ready to place this student.", {
                    duration: 8000,
                    action: studentId ? {
                        label: "Go to actions",
                        onClick: () => router.push(`/workspace?studentId=${studentId}&workspace=overview`),
                    } : undefined,
                });
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
        <div className={`mx-auto pb-16 ${propHideNavigation ? "max-w-5xl px-6 pt-8" : "max-w-4xl px-4 pt-8"}`}>
            {/* Breadcrumb Nav */}
            {!propHideNavigation && (
                <div className="hidden md:flex mb-6 items-center gap-2">
                <button type="button" onClick={() => router.back()}
                    className="btn-slate text-xs py-1.5 px-3"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Student Profile
                </button>
                <span className="text-slate-350 dark:text-slate-650">›</span>
                <span className="text-slate-900 dark:text-slate-50 text-xs font-bold">
                    IEP for {meta.student_name}
                </span>
            </div>
            )}
            
            {/* Header */}
            <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
                <div>
                    <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-50 m-0 flex items-center gap-2.5 flex-wrap">
                        Comprehensive AI-Generated IEP
                        <span className={`text-[0.7rem] font-bold px-2 py-0.5 rounded border ${
                            iepStatus === "FINAL" 
                                ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" 
                                : "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                        }`}>
                            {iepStatus === "FINAL" ? "FINAL" : "DRAFT"}
                        </span>
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {meta.student_name} · Generated {formatDocumentDateTime(meta.created_at)}
                    </p>
                </div>
                {user?.role === "ADMIN" && (
                    <div className="flex gap-2 flex-wrap items-center">
                        <button onClick={fetchAuditHistory} className="btn-slate text-xs py-1.5 px-3">⏱️ Audit History</button>
                        <button onClick={handleDownload} className="btn-slate text-xs py-1.5 px-3">📥 Download PDF</button>
                        {editing ? (
                            <div className="flex gap-1.5 items-center">
                                <button onClick={() => {
                                    const snapshot = editSnapshotStr.current;
                                    if (snapshot) {
                                        const original = JSON.parse(snapshot);
                                        setIep(original);
                                        loadedIepStr.current = snapshot;
                                        setSaving(true);
                                        api.patch(`/api/iep/${iepId}/`, { iep_data: original, status: iepStatus })
                                            .then(() => setErrorMsg(""))
                                            .catch(() => setErrorMsg("Failed to revert changes."))
                                            .finally(() => setSaving(false));
                                    }
                                    setEditing(false);
                                }} className="btn-slate text-xs py-1.5 px-3">Cancel Edit</button>
                                <button onClick={() => handleSave("FINAL")} disabled={saving} className="btn-green text-xs py-1.5 px-3">
                                    ✅ Finalize
                                </button>
                                <span className="text-[0.7rem] text-slate-500 dark:text-slate-400 italic ml-1">
                                    {saving ? "Saving…" : "All changes saved"}
                                </span>
                            </div>
                        ) : (
                            <button onClick={() => { editSnapshotStr.current = JSON.stringify(iep); setEditing(true); }} className="btn-indigo text-xs py-1.5 px-3">✏️ Edit</button>
                        )}
                    </div>
                )}
            </div>

            {/* Section 1 — Student Info */}
            <SectionCard title="Section 1 — Student Information">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {[["Student Name", "student_name"], ["Date of Birth", "date_of_birth"], ["Gender", "gender"], ["Grade/Level", "grade_level"], ["IEP Start", "iep_start_date"], ["IEP End", "iep_end_date"]].map(([label, key]) => (
                        <Field key={key} label={label} value={s1[key] || ""} edit={false} />
                    ))}
                </div>
                {s1.team_members?.length > 0 && (
                    <div>
                        <p className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-1">IEP Team Members</p>
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
                    behavioral_psych: "Behavioral & Emotional (ABA / Developmental Psychology)",
                    academic_sped: "Academic / Learning (SPED)",
                    adaptive_life_skills: "Adaptive & Life Skills"
                }).map(([key, lbl]) => {
                    const domain = s4[key] || {};
                    return (
                        <div key={key} className="py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                            <p className="text-xs font-bold text-sky-600 dark:text-sky-400 mb-2">{lbl}</p>
                            <div className="flex flex-col gap-3">
                            {Object.entries(domain).map(([fk, fv]) => (
                                <Field key={fk} label={fk.replace(/_/g, ' ')} value={String(fv)} edit={editing}
                                    onChange={v => set("section4_plop", [key, fk], v)} />
                            ))}
                            </div>
                        </div>
                    );
                })}
            </SectionCard>

            {/* Section 5 — Long-Term Goals */}
            <SectionCard title="Section 5 — Long-Term IEP Goals (1 Year)">
                {s5.map((ltg, i) => (
                    <div key={ltg.id} className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-3.5 border border-slate-200 dark:border-slate-700 flex flex-col gap-3 mb-3 last:mb-0">
                        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 m-0">{ltg.id} — {ltg.domain}</p>
                        <Field label="Goal" value={ltg.goal} edit={editing}
                            onChange={v => { const copy = [...s5]; copy[i] = { ...copy[i], goal: v }; setIep(prev => prev ? { ...prev, section5_ltg: copy } : prev); }} />
                        <p className="text-[0.7rem] text-slate-400 dark:text-slate-500 m-0 italic">Disciplines: {ltg.disciplines}</p>
                    </div>
                ))}
            </SectionCard>

            {/* Section 6 — Short-Term Objectives */}
            <SectionCard title="Section 6 — Short-Term Objectives (3–4 months)">
                {s6.map((sto, i) => (
                    <div key={sto.id} className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-3.5 border border-slate-200 dark:border-slate-700 flex flex-col gap-3 mb-3 last:mb-0">
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 m-0">Objective {sto.id} → {sto.ltg_ref}</p>
                        <Field label="Objective" value={sto.objective} edit={editing}
                            onChange={v => { const c = [...s6]; c[i] = { ...c[i], objective: v }; setIep(p => p ? { ...p, section6_sto: c } : p); }} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-1">
                            <Field label="Target Skill" value={sto.target_skill} edit={editing}
                                onChange={v => { const c = [...s6]; c[i] = { ...c[i], target_skill: v }; setIep(p => p ? { ...p, section6_sto: c } : p); }} />
                            <Field label="Teaching Method" value={sto.teaching_method} edit={editing}
                                onChange={v => { const c = [...s6]; c[i] = { ...c[i], teaching_method: v }; setIep(p => p ? { ...p, section6_sto: c } : p); }} />
                            <Field label="Success Criteria" value={sto.success_criteria} edit={editing}
                                onChange={v => { const c = [...s6]; c[i] = { ...c[i], success_criteria: v }; setIep(p => p ? { ...p, section6_sto: c } : p); }} />
                            <Field label="Frequency" value={sto.frequency} edit={editing}
                                onChange={v => { const c = [...s6]; c[i] = { ...c[i], frequency: v }; setIep(p => p ? { ...p, section6_sto: c } : p); }} />
                        </div>
                        <p className="text-[0.7rem] text-slate-400 dark:text-slate-500 m-0">Responsible: {sto.responsible}</p>
                    </div>
                ))}
            </SectionCard>

            {/* Section 7 — Accommodations */}
            <SectionCard title="Section 7 — Accommodations & Modifications">
                <div><p className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-1.5">Classroom Accommodations</p><PillList items={s7.classroom} /></div>
                <div><p className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-1.5">Learning Modifications</p><PillList items={s7.learning_modifications} /></div>
                <div><p className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-1.5">Communication Supports</p><PillList items={s7.communication_supports} /></div>
            </SectionCard>

            {/* Section 8 — Therapies */}
            <SectionCard title="Section 8 — Therapies & Intervention Plan">
                {Object.entries({
                    speech_therapy: "Speech-Language Pathology",
                    occupational_therapy: "Occupational Therapy",
                    physical_therapy: "Physical Therapy",
                    applied_behavior_analysis: "Applied Behavior Analysis (ABA)",
                    developmental_psychology: "Developmental Psychology",
                    psychology: "Applied Behavior Analysis (ABA) / Developmental Psychology",
                    sped_sessions: "SPED Sessions",
                    shadow_teacher: "Shadow Teacher"
                }).map(([key, lbl]) => {
                    const t = s8[key] || {};
                    return (
                        <div key={key} className="py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 m-0 mb-1">{lbl}</p>
                            {key === "shadow_teacher" ? (
                                <span className="text-xs text-slate-500 dark:text-slate-400">Hours: {t.hours || "N/A"}</span>
                            ) : (
                                <span className="text-xs text-slate-500 dark:text-slate-400">{t.frequency || "N/A"} — {t.focus_areas || "N/A"}</span>
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
                    <div key={key} className="mb-3 last:mb-0">
                        <p className="text-xs font-bold text-sky-600 dark:text-sky-400 mb-1">{lbl}</p>
                        <ul className="m-0 pl-5 text-xs text-slate-800 dark:text-slate-250 leading-relaxed list-disc">
                            {(s9[key] || []).map((item: string, i: number) => <li key={i}>{item}</li>)}
                        </ul>
                    </div>
                ))}
            </SectionCard>

            {/* Section 10 — Progress Monitoring */}
            <SectionCard title="Section 10 — Progress Monitoring & GAS Scores">
                {iep.section10_progress && iep.section10_progress.gas_scores?.length > 0 ? (
                    <div className="flex flex-col gap-3">
                        {/* Last updated badge */}
                        {iep.section10_progress.last_updated && (
                            <div className="flex items-center gap-2">
                                <span className="text-[0.7rem] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 rounded-full">
                                    📅 Last updated: Week of {iep.section10_progress.last_updated}
                                </span>
                                {iep.section10_progress.report_period && (
                                    <span className="text-[0.7rem] text-slate-500 dark:text-slate-400">({iep.section10_progress.report_period})</span>
                                )}
                            </div>
                        )}

                        {/* GAS Score Table */}
                        <div>
                            <p className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-2">Goal Achievement Scores</p>
                            <div className="flex flex-col gap-2.5">
                                {iep.section10_progress.gas_scores.map((g: any, i: number) => {
                                    const sc = g.score >= 5 ? { bg: "bg-emerald-100 dark:bg-emerald-950/40", color: "text-emerald-800 dark:text-emerald-300" }
                                        : g.score >= 4 ? { bg: "bg-emerald-50 dark:bg-emerald-950/20", color: "text-emerald-700 dark:text-emerald-400" }
                                        : g.score >= 3 ? { bg: "bg-blue-100 dark:bg-blue-950/40", color: "text-blue-800 dark:text-blue-300" }
                                        : g.score >= 2 ? { bg: "bg-amber-100 dark:bg-amber-950/40", color: "text-amber-800 dark:text-amber-300" }
                                        : { bg: "bg-rose-100 dark:bg-rose-950/40", color: "text-rose-800 dark:text-rose-300" };
                                    return (
                                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60">
                                            <div className={`w-8.5 h-8.5 rounded-lg ${sc.bg} ${sc.color} flex items-center justify-center text-sm font-extrabold shrink-0`}>
                                                {g.score}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-slate-900 dark:text-slate-50 m-0 truncate">{g.goal_id} — {g.domain}</p>
                                                <p className="text-[0.7rem] text-slate-500 dark:text-slate-400 m-0 mt-0.5 truncate">{g.note}</p>
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
                            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/50">
                                <p className="text-[0.7rem] font-bold text-rose-800 dark:text-rose-400 mb-1 uppercase tracking-wider">⚠ Regression Indicators</p>
                                <p className="text-xs text-rose-900 dark:text-rose-300 m-0 leading-relaxed">{iep.section10_progress.regression_indicators}</p>
                            </div>
                        )}
                        {/* Attendance */}
                        {iep.section10_progress.attendance_summary && (
                            <Field label="Attendance Summary" value={iep.section10_progress.attendance_summary} edit={false} />
                        )}
                    </div>
                ) : (
                    <p className="text-xs text-slate-400 dark:text-slate-450 italic m-0">Progress data will be populated automatically after the first monthly report is generated.</p>
                )}
            </SectionCard>

            {/* Section 11 — Review (placeholder) */}
            <SectionCard title="Section 11 — IEP Review Summary">
                <p className="text-xs text-slate-400 dark:text-slate-450 italic m-0">Quarterly review summary will be generated automatically.</p>
            </SectionCard>

            {/* Section 12 — Signatures */}
            <SectionCard title="Section 12 — Signatures">
                <p className="text-xs text-slate-400 dark:text-slate-450 italic m-0">Signatures will be collected upon IEP approval.</p>
            </SectionCard>

            {/* Audit History Modal */}
            {showAuditModal && (
                <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 flex items-center justify-center z-[1000] p-4" onClick={() => setShowAuditModal(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 w-full max-w-[500px] relative border border-slate-200 dark:border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setShowAuditModal(false)} className="absolute top-4 right-4 bg-transparent border-none text-xl cursor-pointer text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400">×</button>
                        <h2 className="m-0 text-slate-900 dark:text-slate-50 text-xl font-extrabold mb-5">Document Audit History</h2>
                        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2">
                            {auditHistory.length === 0 ? (
                                <p className="text-slate-500 dark:text-slate-400 m-0 text-sm">No history found.</p>
                            ) : (
                                auditHistory.map((item, idx) => (
                                    <div key={item.id} className="flex gap-4 relative">
                                        {idx !== auditHistory.length - 1 && <div className="absolute w-0.5 bg-slate-200 dark:bg-slate-750 top-6 bottom-[-16px] left-[11px]" />}
                                        <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950/50 flex items-center justify-center z-10 shrink-0">
                                            <div className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                                        </div>
                                        <div>
                                            <p className="m-0 text-sm font-bold text-slate-900 dark:text-slate-50">
                                                {item.action === "GENERATED" ? "AI Generated Draft" : item.action === "EDITED_DRAFT" ? "Draft Saved" : "Document Finalized"}
                                            </p>
                                            <p className="m-0 text-xs text-slate-500 dark:text-slate-400">By {item.edited_by}</p>
                                            <p className="m-0 text-[0.7rem] text-slate-400 dark:text-slate-500 mt-0.5">{new Date(item.created_at).toLocaleString()}</p>
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

function IEPViewerRedirect() {
    const searchParams = useSearchParams();
    const router = useRouter();

    useEffect(() => {
        const id = searchParams.get("id");
        if (id) {
            api.get(`/api/iep/${id}/`)
                .then(res => {
                    router.replace(`/workspace?studentId=${res.data.student_id}&workspace=reports&view=iep&docId=${id}`);
                })
                .catch(() => {
                    router.replace("/workspace");
                });
        } else {
            router.replace("/workspace");
        }
    }, [searchParams, router]);

    return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Redirecting to workspace…</div>;
}

export default function IEPViewerPage() {
    return (
        <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Loading…</div>}>
            <IEPViewerRedirect />
        </Suspense>
    );
}
