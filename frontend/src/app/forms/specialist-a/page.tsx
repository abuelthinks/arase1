"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
    ASSESSMENT_SECTION_OWNERS,
    canEditSection,
    SHARED,
    specialtyShortLabel,
    SectionOwner,
    userSpecialtyList,
} from "@/lib/sectionOwners";
import { toast } from "sonner";

const getWorkspaceFormUrl = (studentId: string) =>
    `/workspace?studentId=${encodeURIComponent(studentId)}&workspace=forms&tab=multi_assessment`;

// Section keys → field names belonging to that section.
const SECTION_FIELDS: Record<string, string[]> = {
    A: [
        "therapist_name", "date",
        "a2_verification", "a2_correction_notes",
        "a3_reports_reviewed", "a3_notes",
    ],
    B: ["b1_milestones", "b2_developmental_concerns"],
    C: ["c1_expressive", "c2_receptive", "c3_articulation", "c4_pragmatics", "c_notes"],
    D: ["d1_fine_motor", "d2_sensory", "d3_adls", "d4_regulation", "d_notes"],
    E: ["e1_gross_motor", "e2_strength", "e3_posture", "e4_motor_planning", "e_notes"],
    F1: ["f1_behavior", "f2_emotional", "f_aba_notes"],
    F2: ["f3_cognitive", "f4_autism", "f_dev_psych_notes"],
    G: [
        "g1_slp_summary", "g1_ot_summary", "g1_pt_summary", "g1_aba_summary",
        "g1_developmental_psychology_summary",
        "g2_strengths", "g3_needs", "g4_frequency", "g5_follow_up",
    ],
};

// Map a logged-in specialist's section, given their normalized specialty.
const SPECIALTY_TO_SECTION: Record<string, string> = {
    "Speech-Language Pathology": "C",
    "Occupational Therapy": "D",
    "Physical Therapy": "E",
    "Applied Behavior Analysis (ABA)": "F1",
    "Developmental Psychology": "F2",
};

// ─── Shared helpers ────────────────────────────────────────────────────────────

function CheckboxItem({ label, checked, onChange, readOnly }: { label: string; checked: boolean; onChange: () => void; readOnly?: boolean }) {
    return (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--form-control-font-size)", lineHeight: "var(--form-line-height)", cursor: readOnly ? "default" : "pointer", color: "var(--text-primary)", userSelect: "none" }}>
            <input type="checkbox" checked={checked} onChange={readOnly ? undefined : onChange} readOnly={readOnly} style={{ width: 18, height: 18, accentColor: "#4f46e5", cursor: readOnly ? "default" : "pointer" }} />
            {label}
        </label>
    );
}

function SectionCard({
    title, subtitle, children, ownerLabel, status, locked,
}: {
    title: string; subtitle?: string; children: React.ReactNode;
    ownerLabel?: string; status?: "draft" | "submitted" | "pending"; locked?: boolean;
}) {
    const badge = status === "submitted"
        ? { label: "✓ Submitted", color: "#065f46", bg: "#d1fae5" }
        : status === "draft"
        ? { label: "Draft", color: "#92400e", bg: "#fef3c7" }
        : { label: "Pending", color: "#475569", bg: "#f1f5f9" };

    return (
        <div className="bg-white rounded-xl border border-[var(--border-light)] overflow-hidden mb-5 shadow-sm">
            <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-[var(--border-light)] bg-slate-50 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h2 style={{ fontSize: "var(--form-section-title-size)", lineHeight: 1.35 }} className="font-bold text-[var(--text-primary)] m-0">{title}</h2>
                    {subtitle && <p className="text-sm text-[var(--text-secondary)] m-0 mt-1 leading-relaxed">{subtitle}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {ownerLabel && (
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "3px 8px", background: "#eef2ff", color: "#4338ca", borderRadius: "999px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                            {ownerLabel}
                        </span>
                    )}
                    {locked && (
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "3px 8px", background: "#fef3c7", color: "#92400e", borderRadius: "999px" }}>
                            🔒 Locked
                        </span>
                    )}
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "3px 8px", background: badge.bg, color: badge.color, borderRadius: "999px" }}>
                        {badge.label}
                    </span>
                </div>
            </div>
            <div className="p-4 sm:p-6 flex flex-col gap-4">
                {children}
            </div>
        </div>
    );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p style={{ fontSize: "var(--form-field-label-size)", lineHeight: "var(--form-line-height)", fontWeight: 650, color: "#334155", marginBottom: "8px" }}>{label}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>{children}</div>
        </div>
    );
}

function TextArea({ value, onChange, placeholder, readOnly }: { value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean }) {
    return (
        <textarea
            value={value}
            onChange={onChange ? e => onChange(e.target.value) : undefined}
            readOnly={readOnly}
            placeholder={placeholder}
            rows={3}
            style={{
                width: "100%", borderRadius: "8px", border: "1px solid #e2e8f0",
                padding: "10px 13px", fontSize: "var(--form-control-font-size)", lineHeight: "var(--form-line-height)", resize: "vertical",
                color: "var(--text-primary)", background: readOnly ? "#f8fafc" : "white",
                boxSizing: "border-box"
            }}
        />
    );
}

// ─── Default form state ─────────────────────────────────────────────────────

function defaultForm() {
    return {
        // Section A
        therapist_name: "",
        date: new Date().toISOString().split('T')[0],
        a2_verification: "" as "matches" | "corrections" | "",
        a2_correction_notes: "",
        a3_reports_reviewed: [] as string[],
        a3_notes: "",
        // Section B
        b1_milestones: [] as string[],
        b2_developmental_concerns: [] as string[],
        // Section C – SLP
        c1_expressive: [] as string[],
        c2_receptive: [] as string[],
        c3_articulation: [] as string[],
        c4_pragmatics: [] as string[],
        c_notes: "",
        // Section D – OT
        d1_fine_motor: [] as string[],
        d2_sensory: [] as string[],
        d3_adls: [] as string[],
        d4_regulation: [] as string[],
        d_notes: "",
        // Section E – PT
        e1_gross_motor: [] as string[],
        e2_strength: [] as string[],
        e3_posture: [] as string[],
        e4_motor_planning: [] as string[],
        e_notes: "",
        // Section F1 – ABA
        f1_behavior: [] as string[],
        f2_emotional: [] as string[],
        f_aba_notes: "",
        // Section F2 – Developmental Psychology
        f3_cognitive: [] as string[],
        f4_autism: [] as string[],
        f_dev_psych_notes: "",
        // Section G – Summary
        g1_slp_summary: "",
        g1_ot_summary: "",
        g1_pt_summary: "",
        g1_aba_summary: "",
        g1_developmental_psychology_summary: "",
        g2_strengths: [] as string[],
        g3_needs: [] as string[],
        g4_frequency: [] as string[],
        g5_follow_up: [] as string[],
    };
}

type FormState = ReturnType<typeof defaultForm>;

function toggle(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}

function pickSectionData(form: FormState, sectionKey: string): Record<string, any> {
    const fields = SECTION_FIELDS[sectionKey] || [];
    const out: Record<string, any> = {};
    for (const f of fields) out[f] = (form as any)[f];
    return out;
}

// ─── Main component ──────────────────────────────────────────────────────────

function SpecialistAFormContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const studentId = searchParams.get("studentId");
    const isViewMode = searchParams.get("mode") === "view";
    const submissionId = searchParams.get("submissionId");
    const { user } = useAuth();

    const [form, setForm] = useState<FormState>(defaultForm());
    const [parentInfo, setParentInfo] = useState<Record<string, any>>({});
    const [studentProfile, setStudentProfile] = useState<any>(null);
    const [savingSection, setSavingSection] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState("");
    const [reportCycleId, setReportCycleId] = useState("1");
    const [contributions, setContributions] = useState<Record<string, { status: "draft" | "submitted"; specialist_name: string; submitted_at?: string | null }>>({});

    // For Translation Toggle
    const [fullSubmission, setFullSubmission] = useState<any>(null);
    const [isTranslated, setIsTranslated] = useState(false);
    const hasTranslation = fullSubmission && fullSubmission.translated_data && Object.keys(fullSubmission.translated_data).length > 0 && fullSubmission.original_language && !['en', 'english'].includes(fullSubmission.original_language.toLowerCase());

    const draftKey = `draft_specialist-a_${studentId}`;
    const userSpecialties = useMemo(
        () => userSpecialtyList(user?.specialties, user?.specialty),
        [user?.specialties, user?.specialty],
    );
    const isAdmin = user?.role === "ADMIN";

    const refreshContributions = async () => {
        if (!studentId || !reportCycleId) return;
        try {
            const res = await api.get(`/api/inputs/multidisciplinary-assessment/contributions/`, {
                params: { student: studentId, report_cycle: reportCycleId },
            });
            const map: typeof contributions = {};
            for (const c of res.data || []) {
                map[c.section_key] = { status: c.status, specialist_name: c.specialist_name, submitted_at: c.submitted_at };
            }
            setContributions(map);
        } catch (err) {
            console.error("Failed to load contributions:", err);
        }
    };

    // Load Draft from LocalStorage
    useEffect(() => {
        if (!isViewMode && studentId) {
            try {
                const saved = localStorage.getItem(draftKey);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    setForm(prev => ({ ...prev, ...parsed }));
                }
            } catch (err) {
                console.error("Failed to load draft:", err);
            }
        }
    }, [draftKey, isViewMode, studentId]);

    // Load existing submission in view mode
    useEffect(() => {
        if (isViewMode && submissionId) {
            api.get(`/api/inputs/multidisciplinary-assessment/${submissionId}/`)
                .then(res => {
                    setFullSubmission(res.data);
                    const fd = res.data.form_data;
                    if (fd?.v2) setForm(prev => ({ ...prev, ...fd.v2 }));
                })
                .catch(console.error);
        }
        if (studentId) {
            api.get(`/api/students/${studentId}/profile/`)
                .then(res => {
                    setStudentProfile(res.data);
                    if (!isViewMode && res.data.active_cycle?.id) {
                        setReportCycleId(String(res.data.active_cycle.id));
                    }
                    const pa = res.data.form_statuses?.parent_assessment;
                    if (pa?.submitted && pa.id) {
                        api.get(`/api/inputs/parent-assessment/${pa.id}/`).then(r => {
                            const pfd = r.data.form_data;
                            setParentInfo(pfd?.v2 ?? pfd ?? {});
                        });
                    }
                    if (!isViewMode && user && !form.therapist_name) {
                        const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
                        set("therapist_name", name || user.username || "");
                    }
                })
                .catch(console.error);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isViewMode, studentId, submissionId, user]);

    // Load contributions + existing form_data so other specialists' sections show as read-only.
    useEffect(() => {
        if (!studentId || !reportCycleId || isViewMode) return;
        refreshContributions();
        api.get(`/api/inputs/multidisciplinary-assessment/`, {
            params: { student: studentId, report_cycle: reportCycleId },
        })
            .then(res => {
                const list = Array.isArray(res.data?.results) ? res.data.results : res.data;
                const match = (list || []).find((x: any) => String(x.student) === String(studentId) && String(x.report_cycle) === String(reportCycleId));
                if (match?.form_data?.v2) {
                    setForm(prev => ({ ...prev, ...match.form_data.v2 }));
                    setFullSubmission(match);
                }
            })
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, reportCycleId, isViewMode]);

    useEffect(() => {
        if (isViewMode && fullSubmission) {
            const fd = (isTranslated && fullSubmission.translated_data) ? fullSubmission.translated_data : fullSubmission.form_data;
            if (fd?.v2) setForm(prev => ({ ...prev, ...fd.v2 }));
        }
    }, [isTranslated, fullSubmission, isViewMode]);

    const set = (key: keyof FormState, val: any) => setForm(prev => ({ ...prev, [key]: val }));
    const tog = (key: keyof FormState, val: string) => setForm(prev => ({ ...prev, [key]: toggle(prev[key] as string[], val) }));

    // Auto-save effect
    useEffect(() => {
        if (isViewMode || !studentId) return;
        const timeoutId = setTimeout(() => {
            try { localStorage.setItem(draftKey, JSON.stringify(form)); } catch {}
        }, 1000);
        return () => clearTimeout(timeoutId);
    }, [draftKey, form, isViewMode, studentId]);

    // Compute per-section editability
    const sectionStatus = useMemo(() => {
        const result: Record<string, { status: "draft" | "submitted" | "pending"; locked: boolean; canEdit: boolean; ownerLabel: string }> = {};
        for (const key of Object.keys(ASSESSMENT_SECTION_OWNERS)) {
            const owner = ASSESSMENT_SECTION_OWNERS[key];
            const ownerLabel = specialtyShortLabel(owner as SectionOwner);
            const contrib = contributions[key];
            const sectionASubmittedMatches = key === "A" && form.a2_verification === "matches";
            const isFinalized = !!fullSubmission?.finalized_at;
            const isSelfSubmitted = contrib?.status === "submitted";
            const lockedShared = owner === SHARED && sectionASubmittedMatches && key === "A";
            const canEdit = !isViewMode && !isFinalized && !isSelfSubmitted && !lockedShared
                && canEditSection(ASSESSMENT_SECTION_OWNERS, key, userSpecialties, user?.role);
            result[key] = {
                status: contrib?.status || "pending",
                locked: lockedShared || isSelfSubmitted || isFinalized,
                canEdit,
                ownerLabel,
            };
        }
        return result;
    }, [contributions, form.a2_verification, fullSubmission, isViewMode, user?.role, userSpecialties]);

    const saveSection = async (sectionKey: string, opts: { submit?: boolean } = {}) => {
        if (!studentId) { setErrorMsg("No student selected."); return; }
        setSavingSection(sectionKey + (opts.submit ? ":submit" : ":save"));
        setErrorMsg("");
        try {
            const sectionData = pickSectionData(form, sectionKey);
            if (opts.submit) {
                // Save first to flush latest edits, then submit.
                await api.patch(`/api/inputs/multidisciplinary-assessment/sections/${sectionKey}/`, {
                    student: parseInt(studentId), report_cycle: parseInt(reportCycleId),
                    section_data: sectionData,
                });
                const res = await api.post(`/api/inputs/multidisciplinary-assessment/sections/${sectionKey}/submit/`, {
                    student: parseInt(studentId), report_cycle: parseInt(reportCycleId),
                });
                toast.success(`Section ${sectionKey} submitted.`);
                if (res.data?.finalized_at) {
                    toast.success("Assessment finalized — all sections complete.");
                    setTimeout(() => router.replace(getWorkspaceFormUrl(studentId)), 1500);
                }
            } else {
                await api.patch(`/api/inputs/multidisciplinary-assessment/sections/${sectionKey}/`, {
                    student: parseInt(studentId), report_cycle: parseInt(reportCycleId),
                    section_data: sectionData,
                });
                toast.success(`Section ${sectionKey} saved.`);
            }
            await refreshContributions();
        } catch (err: any) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Save failed.";
            setErrorMsg(msg);
            toast.error(msg);
        } finally {
            setSavingSection(null);
        }
    };

    const ro = (sectionKey: string) => isViewMode || !sectionStatus[sectionKey]?.canEdit;

    const sectionFooter = (sectionKey: string) => {
        if (isViewMode) return null;
        const s = sectionStatus[sectionKey];
        if (!s) return null;
        if (s.locked && !isAdmin) {
            const contrib = contributions[sectionKey];
            return (
                <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#475569", background: "#f1f5f9", padding: "10px 14px", borderRadius: "8px" }}>
                    {contrib ? <>Submitted by <strong>{contrib.specialist_name}</strong>{contrib.submitted_at ? ` on ${new Date(contrib.submitted_at).toLocaleDateString()}` : ""}.</> : "Locked."}
                </div>
            );
        }
        if (!s.canEdit) {
            return (
                <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#64748b", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px" }}>
                    Pending {s.ownerLabel}. Only the assigned specialist can edit this section.
                </div>
            );
        }
        const saving = !!(savingSection && savingSection.startsWith(sectionKey + ":"));
        const savingDraft = savingSection === sectionKey + ":save";
        const savingSubmit = savingSection === sectionKey + ":submit";
        return (
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button onClick={() => saveSection(sectionKey, { submit: false })} disabled={saving}
                    style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "white", color: "#334155", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.85rem" }}>
                    {savingDraft ? "Saving…" : "Save Draft"}
                </button>
                <button onClick={() => saveSection(sectionKey, { submit: true })} disabled={saving}
                    style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: saving ? "#a5b4fc" : "#4f46e5", color: "white", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.85rem" }}>
                    {savingSubmit ? "Submitting…" : "Submit My Section"}
                </button>
            </div>
        );
    };

    const mySections = userSpecialties
        .map((s) => SPECIALTY_TO_SECTION[s])
        .filter(Boolean);

    return (
        <div style={{ maxWidth: "1024px", margin: "0 auto", paddingBottom: "3rem" }}>
            {/* Breadcrumb Nav */}
            {studentProfile && (
                <div className="hidden md:flex" style={{
                    marginBottom: "2rem", justifyContent: "space-between", alignItems: "center",
                    background: "white", padding: "12px 20px", borderRadius: "12px",
                    border: "1px solid var(--border-light)", boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <button type="button" onClick={() => router.back()}
                            style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", color: "#475569", fontWeight: 600, fontSize: "0.85rem" }}
                            className="hover:bg-slate-200">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back
                        </button>
                        <span style={{ color: "#cbd5e1" }}>/</span>
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Students</span>
                        <span style={{ color: "#cbd5e1" }}>/</span>
                        <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "0.95rem" }}>
                            {studentProfile.student.first_name} {studentProfile.student.last_name}
                        </span>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col items-start gap-4 mb-6 w-full">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] m-0 flex flex-wrap items-baseline gap-2">
                        Multidisciplinary Assessment Form {isViewMode && <span className="text-sm font-medium text-slate-500">— Read Only</span>}
                    </h1>
                    {!isViewMode && userSpecialties.length > 0 && mySections.length > 0 && (
                        <p className="text-sm text-[var(--text-secondary)] mt-1 mb-0">
                            Logged in as <strong>{userSpecialties.join(", ")}</strong> — you can edit Section{mySections.length > 1 ? "s" : ""} {mySections.join(", ")} and shared sections.
                        </p>
                    )}
                    {!isViewMode && user?.role === "SPECIALIST" && userSpecialties.length === 0 && (
                        <p className="text-sm text-amber-600 mt-1 mb-0">
                            Your account has no specialty set. Contact an admin to assign one.
                        </p>
                    )}
                    {fullSubmission?.finalized_at && (
                        <p className="text-sm text-emerald-700 mt-1 mb-0">
                            ✓ Finalized on {new Date(fullSubmission.finalized_at).toLocaleString()}.
                        </p>
                    )}
                </div>
                {isViewMode && hasTranslation && (
                    <div className="flex gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                        <button onClick={() => setIsTranslated(false)}
                            className={`px-3 py-1.5 rounded-md text-sm transition-all duration-200 ${!isTranslated ? "font-bold text-slate-900 bg-white shadow-sm" : "font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}>
                            Original
                        </button>
                        <button onClick={() => setIsTranslated(true)}
                            className={`px-3 py-1.5 rounded-md text-sm transition-all duration-200 ${isTranslated ? "font-bold text-indigo-600 bg-white shadow-sm" : "font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}>
                            English (AI) ✨
                        </button>
                    </div>
                )}
            </div>

            {/* Progress header */}
            {!isViewMode && (
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px 16px", marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {Object.entries(ASSESSMENT_SECTION_OWNERS).map(([key, owner]) => {
                        const s = sectionStatus[key];
                        const isMine = canEditSection(ASSESSMENT_SECTION_OWNERS, key, userSpecialties, user?.role);
                        const icon = s?.status === "submitted" ? "✓" : "○";
                        const color = s?.status === "submitted" ? "#10b981" : isMine ? "#4f46e5" : "#94a3b8";
                        return (
                            <span key={key} style={{ fontSize: "0.8rem", padding: "4px 10px", borderRadius: "999px", background: "#f8fafc", border: "1px solid #e2e8f0", color, fontWeight: isMine ? 700 : 500 }}>
                                {icon} §{key} <span style={{ color: "#94a3b8", fontWeight: 500 }}>· {specialtyShortLabel(owner as SectionOwner)}</span>
                            </span>
                        );
                    })}
                </div>
            )}

            {errorMsg && (
                <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", marginBottom: "1rem" }}>
                    {errorMsg}
                </div>
            )}

            {/* SECTION A: Background */}
            <SectionCard title="Section A — Background (Parent Input + Therapist Verification)" subtitle="A1 is auto-filled from parent submission. Complete A2 and A3."
                ownerLabel="Shared" status={sectionStatus.A?.status} locked={sectionStatus.A?.locked}>
                <FieldGroup label="A1. Parent-Provided Information (Auto-filled)">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {[
                            ["Child Name", `${parentInfo.first_name || ""} ${parentInfo.last_name || ""}`.trim() || "—"],
                            ["Date of Birth", parentInfo.date_of_birth || "—"],
                            ["Gender", parentInfo.gender || "—"],
                            ["Grade/Level", parentInfo.grade || "—"],
                            ["Primary Language", (parentInfo.primary_language || []).join(", ") || "—"],
                            ["Medical Alerts", parentInfo.medical_alerts || "—"],
                            ["Known Diagnoses", (parentInfo.known_conditions || []).join(", ") || "—"],
                        ].map(([label, value]) => (
                            <div key={label} style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", margin: "0 0 2px" }}>{label}</p>
                                <p style={{ fontSize: "0.875rem", color: "var(--text-primary)", margin: 0, fontWeight: 500 }}>{value}</p>
                            </div>
                        ))}
                    </div>
                </FieldGroup>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "4px" }}>Therapist Name</p>
                        <input type="text" value={form.therapist_name}
                            onChange={ro("A") ? undefined : e => set("therapist_name", e.target.value)}
                            readOnly={ro("A")}
                            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0", background: ro("A") ? "#f8fafc" : "white" }} />
                    </div>
                    <div>
                        <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "4px" }}>Date</p>
                        <input type="date" value={form.date}
                            onChange={ro("A") ? undefined : e => set("date", e.target.value)}
                            readOnly={ro("A")}
                            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0", background: ro("A") ? "#f8fafc" : "white" }} />
                    </div>
                </div>

                <FieldGroup label="A2. Therapist Verification">
                    {[["matches", "Matches parent input"], ["corrections", "Corrections needed"]].map(([val, label]) => (
                        <CheckboxItem key={val} label={label} checked={form.a2_verification === val} readOnly={ro("A")}
                            onChange={() => set("a2_verification", form.a2_verification === val ? "" : val)} />
                    ))}
                    <TextArea value={form.a2_correction_notes} onChange={ro("A") ? undefined : v => set("a2_correction_notes", v)} placeholder="Correction notes…" readOnly={ro("A")} />
                </FieldGroup>

                <FieldGroup label="A3. Additional Clinical Notes">
                    {["Medical reports reviewed", "Previous therapy reports reviewed", "School reports reviewed"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.a3_reports_reviewed.includes(item)} readOnly={ro("A")}
                            onChange={() => tog("a3_reports_reviewed", item)} />
                    ))}
                    <TextArea value={form.a3_notes} onChange={ro("A") ? undefined : v => set("a3_notes", v)} placeholder="Notes…" readOnly={ro("A")} />
                </FieldGroup>
                {sectionFooter("A")}
            </SectionCard>

            {/* SECTION B: Developmental Screening */}
            <SectionCard title="Section B — Developmental Screening" ownerLabel="Shared" status={sectionStatus.B?.status} locked={sectionStatus.B?.locked}>
                <FieldGroup label="B1. Developmental Milestones Achieved">
                    {["Sat independently", "Crawled", "Walked", "First words", "Combined words", "Toilet trained", "Feeding independently"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.b1_milestones.includes(item)} readOnly={ro("B")}
                            onChange={() => tog("b1_milestones", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="B2. Observed Developmental Concerns">
                    {["Delayed speech", "Motor concerns", "Sensory issues", "Emotional regulation issues", "Behavioral concerns", "Social challenges", "Repetitive behaviors"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.b2_developmental_concerns.includes(item)} readOnly={ro("B")}
                            onChange={() => tog("b2_developmental_concerns", item)} />
                    ))}
                </FieldGroup>
                {sectionFooter("B")}
            </SectionCard>

            {/* SECTION C: SLP */}
            <SectionCard title="Section C — Speech & Language Pathology (SLP) Assessment" ownerLabel="SLP" status={sectionStatus.C?.status} locked={sectionStatus.C?.locked}>
                <FieldGroup label="C1. Expressive Language">
                    {["Babbling", "Single words", "Phrases", "Full sentences", "Limited vocabulary", "Echolalia", "Age-appropriate"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.c1_expressive.includes(item)} readOnly={ro("C")} onChange={() => tog("c1_expressive", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="C2. Receptive Language">
                    {["Responds to name", "Follows 1-step instructions", "Follows 2-step instructions", "Understands WH questions", "Limited comprehension"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.c2_receptive.includes(item)} readOnly={ro("C")} onChange={() => tog("c2_receptive", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="C3. Speech Sound / Articulation">
                    {["Clear", "Substitutions", "Omissions", "Lisp", "Stuttering"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.c3_articulation.includes(item)} readOnly={ro("C")} onChange={() => tog("c3_articulation", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="C4. Pragmatics / Social Communication">
                    {["Eye contact", "Turn-taking", "Joint attention"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.c4_pragmatics.includes(item)} readOnly={ro("C")} onChange={() => tog("c4_pragmatics", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="SLP Notes">
                    <TextArea value={form.c_notes} onChange={ro("C") ? undefined : v => set("c_notes", v)} placeholder="SLP clinical notes…" readOnly={ro("C")} />
                </FieldGroup>
                {sectionFooter("C")}
            </SectionCard>

            {/* SECTION D: OT */}
            <SectionCard title="Section D — Occupational Therapy (OT) Assessment" ownerLabel="OT" status={sectionStatus.D?.status} locked={sectionStatus.D?.locked}>
                <FieldGroup label="D1. Fine Motor Skills">
                    {["Pencil grasp", "Hand dominance", "Manipulates small objects", "Hand strength concerns"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.d1_fine_motor.includes(item)} readOnly={ro("D")} onChange={() => tog("d1_fine_motor", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="D2. Sensory Processing">
                    {["Auditory sensitivity", "Tactile sensitivity", "Seeks movement", "Avoids textures"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.d2_sensory.includes(item)} readOnly={ro("D")} onChange={() => tog("d2_sensory", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="D3. Activities of Daily Living (ADLs)">
                    {["Feeding independence", "Dressing", "Grooming", "Toileting"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.d3_adls.includes(item)} readOnly={ro("D")} onChange={() => tog("d3_adls", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="D4. Emotional / Self-Regulation">
                    {["Identifies feelings", "Uses calming strategies", "Impulsive behavior"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.d4_regulation.includes(item)} readOnly={ro("D")} onChange={() => tog("d4_regulation", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="OT Notes">
                    <TextArea value={form.d_notes} onChange={ro("D") ? undefined : v => set("d_notes", v)} placeholder="OT clinical notes…" readOnly={ro("D")} />
                </FieldGroup>
                {sectionFooter("D")}
            </SectionCard>

            {/* SECTION E: PT */}
            <SectionCard title="Section E — Physical Therapy (PT) Assessment" ownerLabel="PT" status={sectionStatus.E?.status} locked={sectionStatus.E?.locked}>
                <FieldGroup label="E1. Gross Motor Skills">
                    {["Sitting balance", "Walking gait", "Running", "Jumping"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.e1_gross_motor.includes(item)} readOnly={ro("E")} onChange={() => tog("e1_gross_motor", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="E2. Strength & Endurance">
                    {["Core weakness", "Tires easily", "Difficulty with stairs"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.e2_strength.includes(item)} readOnly={ro("E")} onChange={() => tog("e2_strength", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="E3. Posture & Alignment">
                    {["Toe-walking", "Flat feet", "Poor posture"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.e3_posture.includes(item)} readOnly={ro("E")} onChange={() => tog("e3_posture", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="E4. Motor Planning & Coordination">
                    {["Difficulty imitating movements", "Clumsy", "Poor coordination"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.e4_motor_planning.includes(item)} readOnly={ro("E")} onChange={() => tog("e4_motor_planning", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="PT Notes">
                    <TextArea value={form.e_notes} onChange={ro("E") ? undefined : v => set("e_notes", v)} placeholder="PT clinical notes…" readOnly={ro("E")} />
                </FieldGroup>
                {sectionFooter("E")}
            </SectionCard>

            {/* SECTION F1: ABA */}
            <SectionCard title="Section F1 — Applied Behavior Analysis (ABA) Assessment" ownerLabel="ABA" status={sectionStatus.F1?.status} locked={sectionStatus.F1?.locked}>
                <FieldGroup label="F1a. Behavior Observations">
                    {["Inattentive", "Hyperactive", "Impulsive", "Withdrawn", "Aggressive"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.f1_behavior.includes(item)} readOnly={ro("F1")} onChange={() => tog("f1_behavior", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="F1b. Regulation / Behavior Support">
                    {["Anxiety", "Mood changes", "Easily overwhelmed"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.f2_emotional.includes(item)} readOnly={ro("F1")} onChange={() => tog("f2_emotional", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="ABA Notes">
                    <TextArea value={form.f_aba_notes} onChange={ro("F1") ? undefined : v => set("f_aba_notes", v)} placeholder="ABA clinical notes…" readOnly={ro("F1")} />
                </FieldGroup>
                {sectionFooter("F1")}
            </SectionCard>

            {/* SECTION F2: Developmental Psychology */}
            <SectionCard title="Section F2 — Developmental Psychology Assessment" ownerLabel="Dev. Psych" status={sectionStatus.F2?.status} locked={sectionStatus.F2?.locked}>
                <FieldGroup label="F2a. Cognitive / Play Skills Screening">
                    {["Memory", "Problem-solving", "Academic readiness"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.f3_cognitive.includes(item)} readOnly={ro("F2")} onChange={() => tog("f3_cognitive", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="F2b. Autism / Social-Development Screening">
                    {["Reduced eye contact", "Repetitive behaviors", "Restricted interests"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.f4_autism.includes(item)} readOnly={ro("F2")} onChange={() => tog("f4_autism", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="Developmental Psychology Notes">
                    <TextArea value={form.f_dev_psych_notes} onChange={ro("F2") ? undefined : v => set("f_dev_psych_notes", v)} placeholder="Developmental psychology clinical notes…" readOnly={ro("F2")} />
                </FieldGroup>
                {sectionFooter("F2")}
            </SectionCard>

            {/* SECTION G: Summary */}
            <SectionCard title="Section G — Multidisciplinary Summary & Recommendations" ownerLabel="Shared" status={sectionStatus.G?.status} locked={sectionStatus.G?.locked}>
                <FieldGroup label="G1. Discipline Summaries — fill the row matching your specialty">
                    {[
                        ["SLP Summary", "g1_slp_summary", "Speech & Language observations and conclusions…", "Speech-Language Pathology"],
                        ["OT Summary", "g1_ot_summary", "Occupational Therapy observations and conclusions…", "Occupational Therapy"],
                        ["PT Summary", "g1_pt_summary", "Physical Therapy observations and conclusions…", "Physical Therapy"],
                        ["ABA Summary", "g1_aba_summary", "ABA observations and conclusions…", "Applied Behavior Analysis (ABA)"],
                        ["Developmental Psychology Summary", "g1_developmental_psychology_summary", "Developmental psychology observations and conclusions…", "Developmental Psychology"],
                    ].map(([label, key, placeholder, ownerSpec]) => {
                        const rowReadOnly = ro("G") || (!isAdmin && !userSpecialties.includes(ownerSpec as any));
                        return (
                            <div key={key}>
                                <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>{label}</p>
                                <TextArea value={form[key as keyof FormState] as string} onChange={rowReadOnly ? undefined : v => set(key as keyof FormState, v)} placeholder={placeholder} readOnly={rowReadOnly} />
                            </div>
                        );
                    })}
                </FieldGroup>
                <FieldGroup label="G2. Unified Strengths">
                    {["Visual learner", "Good memory", "Cooperative", "Motivated"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.g2_strengths.includes(item)} readOnly={ro("G")} onChange={() => tog("g2_strengths", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="G3. Unified Needs">
                    {["Speech therapy", "Occupational therapy", "Physical therapy", "ABA support", "Developmental psychology support"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.g3_needs.includes(item)} readOnly={ro("G")} onChange={() => tog("g3_needs", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="G4. Recommended Therapy Frequency">
                    {["1× weekly", "2× weekly", "3× weekly", "Intensive program"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.g4_frequency.includes(item)} readOnly={ro("G")} onChange={() => tog("g4_frequency", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="G5. Follow-Up Plan">
                    {["Start intervention", "Monthly monitoring", "Provide home activities", "Refer to specialist"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.g5_follow_up.includes(item)} readOnly={ro("G")} onChange={() => tog("g5_follow_up", item)} />
                    ))}
                </FieldGroup>
                {sectionFooter("G")}
            </SectionCard>

            {!isViewMode && (
                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                    <button onClick={() => router.back()}
                        style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", color: "var(--text-secondary)", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" }}>
                        Back
                    </button>
                </div>
            )}
        </div>
    );
}

export default function SpecialistAForm() {
    return (
        <ProtectedRoute>
            <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>Loading form…</div>}>
                <SpecialistAFormContent />
            </Suspense>
        </ProtectedRoute>
    );
}
