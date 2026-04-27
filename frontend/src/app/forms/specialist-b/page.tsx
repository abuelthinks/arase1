"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
    TRACKER_SECTION_OWNERS,
    canEditSection,
    specialtyShortLabel,
    SectionOwner,
    userSpecialtyList,
} from "@/lib/sectionOwners";
import { useFormCollaboration } from "@/hooks/useFormCollaboration";

const getWorkspaceFormUrl = (studentId: string) =>
    `/workspace?studentId=${encodeURIComponent(studentId)}&workspace=forms&tab=multi_tracker`;

/* ─── Shared UI Components ─────────────────────────────────────────────────── */

function SectionCard({
    title, subtitle, children, ownerLabel, status, locked,
    onFocus, onBlur, remoteHolder,
}: {
    title: string; subtitle?: string; children: React.ReactNode;
    ownerLabel?: string; status?: "draft" | "submitted" | "pending"; locked?: boolean;
    onFocus?: () => void; onBlur?: () => void;
    remoteHolder?: { user_name: string; specialty?: string } | null;
}) {
    const badge = status === "submitted"
        ? { label: "✓ Submitted", color: "#065f46", bg: "#d1fae5" }
        : status === "draft"
        ? { label: "Draft", color: "#92400e", bg: "#fef3c7" }
        : { label: "Pending", color: "#475569", bg: "#f1f5f9" };

    return (
        <div
            style={{ background: "white", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "1.25rem" }}
            onFocusCapture={onFocus}
            onBlurCapture={(e) => {
                const next = e.relatedTarget as Node | null;
                if (!next || !e.currentTarget.contains(next)) onBlur?.();
            }}
        >
            <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border-light)", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                <div>
                    <h2 style={{ fontSize: "var(--form-section-title-size)", lineHeight: 1.35, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</h2>
                    {subtitle && <p style={{ fontSize: "var(--form-helper-font-size)", lineHeight: "var(--form-line-height)", color: "var(--text-secondary)", margin: "2px 0 0" }}>{subtitle}</p>}
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {ownerLabel && (
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "3px 8px", background: "#eef2ff", color: "#4338ca", borderRadius: "999px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                            {ownerLabel}
                        </span>
                    )}
                    {remoteHolder && (
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "3px 8px", background: "#fef3c7", color: "#92400e", borderRadius: "999px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                            {remoteHolder.user_name} editing…
                        </span>
                    )}
                    {locked && !remoteHolder && (
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "3px 8px", background: "#fef3c7", color: "#92400e", borderRadius: "999px" }}>
                            🔒 Locked
                        </span>
                    )}
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "3px 8px", background: badge.bg, color: badge.color, borderRadius: "999px" }}>
                        {badge.label}
                    </span>
                </div>
            </div>
            <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
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

function CheckboxItem({ label, checked, onChange, readOnly }: { label: string; checked: boolean; onChange: () => void; readOnly?: boolean }) {
    return (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--form-control-font-size)", lineHeight: "var(--form-line-height)", cursor: readOnly ? "default" : "pointer", color: "var(--text-primary)", userSelect: "none" }}>
            <input type="checkbox" checked={checked} onChange={readOnly ? undefined : onChange} readOnly={readOnly} style={{ width: 18, height: 18, accentColor: "#4f46e5", cursor: readOnly ? "default" : "pointer" }} />
            {label}
        </label>
    );
}

function RadioItem({ label, checked, onChange, readOnly }: { label: string; checked: boolean; onChange: () => void; readOnly?: boolean }) {
    return (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--form-control-font-size)", lineHeight: "var(--form-line-height)", cursor: readOnly ? "default" : "pointer", color: "#0f172a", userSelect: "none" }}>
            <input type="radio" checked={checked} onChange={readOnly ? undefined : onChange} readOnly={readOnly}
                style={{ width: 16, height: 16, accentColor: "#4f46e5", cursor: readOnly ? "default" : "pointer" }} />
            {label}
        </label>
    );
}

function TextInput({ value, onChange, placeholder, readOnly, type = "text" }: { value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean; type?: string }) {
    return (
        <input type={type} value={value} onChange={onChange ? e => onChange(e.target.value) : undefined}
            readOnly={readOnly} placeholder={placeholder}
            style={{ width: "100%", borderRadius: "8px", border: "1px solid #e2e8f0", padding: "10px 13px", fontSize: "var(--form-control-font-size)", lineHeight: "var(--form-line-height)", color: "#0f172a", background: readOnly ? "#f8fafc" : "white", boxSizing: "border-box" }} />
    );
}

function TextArea({ value, onChange, placeholder, readOnly, rows = 3 }: { value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean; rows?: number }) {
    return (
        <textarea value={value} onChange={onChange ? e => onChange(e.target.value) : undefined}
            readOnly={readOnly} placeholder={placeholder} rows={rows}
            style={{ width: "100%", borderRadius: "8px", border: "1px solid #e2e8f0", padding: "10px 13px", fontSize: "var(--form-control-font-size)", lineHeight: "var(--form-line-height)", resize: "vertical", color: "var(--text-primary)", background: readOnly ? "#f8fafc" : "white", boxSizing: "border-box" }} />
    );
}

/* ─── Main Component ───────────────────────────────────────────────────────── */

function SpecialistBFormContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const studentId = searchParams.get("studentId");
    const isViewMode = searchParams.get("mode") === "view";
    const submissionId = searchParams.get("submissionId");

    const [savingSection, setSavingSection] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState("");
    const [reportCycleId, setReportCycleId] = useState("1");
    const [studentProfile, setStudentProfile] = useState<any>(null);
    const [studentName, setStudentName] = useState("");
    const [contributions, setContributions] = useState<Record<string, { status: "draft" | "submitted"; specialist_name: string; submitted_at?: string | null }>>({});

    const [fullSubmission, setFullSubmission] = useState<any>(null);
    const [isTranslated, setIsTranslated] = useState(false);
    const hasTranslation = fullSubmission && fullSubmission.translated_data && Object.keys(fullSubmission.translated_data).length > 0 && fullSubmission.original_language && !['en', 'english'].includes(fullSubmission.original_language.toLowerCase());

    const { user } = useAuth();
    const userSpecialties = useMemo(
        () => userSpecialtyList(user?.specialties, user?.specialty),
        [user?.specialties, user?.specialty],
    );
    const userSpecialty = userSpecialties[0] || "";
    const isAdmin = user?.role === "ADMIN";

    const blankSectionA = () => ({ date: new Date().toISOString().split('T')[0], therapist_name: "", session_type: "", sessions_completed: "0" });
    const blankSectionB = () => ({ attendance: "", participation_level: "", notes: "" });

    const [formData, setFormData] = useState({
        // Per-discipline session metadata (each specialist runs distinct sessions)
        section_a_slp: blankSectionA(),
        section_a_ot: blankSectionA(),
        section_a_pt: blankSectionA(),
        section_a_aba: blankSectionA(),
        section_a_developmental_psychology: blankSectionA(),
        // Per-discipline attendance / participation
        section_b_slp: blankSectionB(),
        section_b_ot: blankSectionB(),
        section_b_pt: blankSectionB(),
        section_b_aba: blankSectionB(),
        section_b_developmental_psychology: blankSectionB(),
        // Per-discipline goals + notes
        section_c_slp: { goals: [] as string[], notes: "" },
        section_c_ot: { goals: [] as string[], notes: "" },
        section_c_pt: { goals: [] as string[], notes: "" },
        section_c_aba: { goals: [] as string[], notes: "" },
        section_c_developmental_psychology: { goals: [] as string[], notes: "" },
        // Shared
        section_d: { independent_skills: "", behavior_interaction: "", sensory_motor: "", communication_adults: "", notes: "" },
        section_e: { goal_1: "", goal_2: "", goal_3: "", goal_4: "", comments: "" },
        section_f: { therapy_recommendations: [] as string[], home_strategies: [] as string[], therapist_suggested_activities: "" },
    });

    const draftKey = `draft_specialist-b_${studentId}`;

    const refreshContributions = async () => {
        if (!studentId || !reportCycleId) return;
        try {
            const res = await api.get(`/api/inputs/multidisciplinary-tracker/contributions/`, {
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

    useEffect(() => {
        if (!isViewMode && studentId) {
            try {
                const saved = localStorage.getItem(draftKey);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    setFormData(prev => ({ ...prev, ...parsed }));
                }
            } catch (err) {
                console.error("Failed to load draft:", err);
            }
        }
    }, [draftKey, isViewMode, studentId]);

    const OPTIONS = {
        discipline: ["Speech-Language Pathology", "Occupational Therapy", "Physical Therapy", "Applied Behavior Analysis (ABA)", "Developmental Psychology"],
        session_type: ["Online", "Onsite"],
        attendance: ["Present", "Late", "Absent", "Rescheduled"],
        participation: ["Fully engaged", "Needed minimal cues", "Needed moderate prompts", "Needed full assistance", "Refused tasks", "Limited engagement", "Easily distracted", "Overstimulated", "Fatigued"],
        slp_goals: ["Increased verbal output", "Improved receptive skills", "Better articulation", "Improved social communication", "Used AAC/Picture cards", "No improvement", "Regression noted"],
        ot_goals: ["Improved hand strength", "Better pencil grasp", "Improved scissor skills", "Followed sensory strategies", "Reduced sensory overload", "Increased independence in ADLs", "No improvement", "Regression noted"],
        pt_goals: ["Improved balance", "Stronger core strength", "Better coordination", "Improved gait", "Increased endurance", "No improvement", "Regression observed"],
        aba_goals: ["Reduced tantrums", "Improved coping strategies", "Better attention", "Less impulsivity", "Improved transitions", "Improved task behavior", "No improvement", "Regression observed"],
        dev_psy_goals: ["Improved emotional expression", "Improved play skills", "Better problem-solving", "Improved social reciprocity", "Improved developmental regulation", "Improved adaptive functioning", "No improvement", "Regression observed"],
        independent_skills: ["Improved", "Slight improvement", "No change", "Declined"],
        behavior_interaction: ["Cooperative", "Needs support", "Resistant", "Aggressive", "Withdrawn"],
        sensory_motor: ["Calm", "Hyperactive", "Sensory seeking", "Sensory avoidant", "Easily overwhelmed"],
        communication_adults: ["Responds", "Initiates", "Minimal interaction", "No interaction"],
        gas_scale: ["1 – No progress", "2 – Minimal progress", "3 – Expected progress", "4 – More than expected", "5 – Goal achieved"],
        therapy_recs: ["Continue same plan", "Increase frequency", "Reduce frequency", "Add new goals", "Parent training needed", "Referral to another discipline", "Request formal evaluation"],
        home_strategies: ["Speech exercises", "Sensory activities", "Fine motor tasks", "Gross motor tasks", "Behavior strategies", "Academic tasks", "Routine-building activities"],
    };

    const handleNestedChange = (section: keyof typeof formData, field: string, value: string) => {
        setFormData(prev => ({ ...prev, [section]: { ...(prev[section] as any), [field]: value } }));
    };

    const handleArrayToggle = (section: keyof typeof formData, field: string, value: string) => {
        setFormData(prev => {
            const currentArr = (prev[section] as any)[field] as string[];
            const updated = currentArr.includes(value) ? currentArr.filter(item => item !== value) : [...currentArr, value];
            return { ...prev, [section]: { ...(prev[section] as any), [field]: updated } };
        });
    };

    useEffect(() => {
        if (isViewMode || !studentId) return;
        const timeoutId = setTimeout(() => {
            try { localStorage.setItem(draftKey, JSON.stringify(formData)); } catch {}
        }, 1000);
        return () => clearTimeout(timeoutId);
    }, [draftKey, formData, isViewMode, studentId]);

    useEffect(() => {
        if (studentId) {
            api.get(`/api/students/${studentId}/profile/`)
                .then(res => {
                    if (!isViewMode && res.data?.student?.status !== "Enrolled") {
                        toast.error("This progress tracking form is locked until the student is formally enrolled.");
                        router.replace(getWorkspaceFormUrl(studentId));
                        return;
                    }
                    setStudentProfile(res.data);
                    if (res.data.student) setStudentName(`${res.data.student.first_name} ${res.data.student.last_name}`.trim());
                    if (!isViewMode && res.data.active_cycle) setReportCycleId(res.data.active_cycle.id.toString());

                    if (!isViewMode && user) {
                        const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
                        // Auto-fill therapist name into the user's own discipline section(s).
                        const SUFFIX_BY_SPECIALTY: Record<string, string> = {
                            "Speech-Language Pathology": "slp",
                            "Occupational Therapy": "ot",
                            "Physical Therapy": "pt",
                            "Applied Behavior Analysis (ABA)": "aba",
                            "Developmental Psychology": "developmental_psychology",
                        };
                        setFormData(prev => {
                            const next: any = { ...prev };
                            for (const sp of userSpecialties) {
                                const suffix = SUFFIX_BY_SPECIALTY[sp];
                                if (!suffix) continue;
                                const key = `section_a_${suffix}`;
                                next[key] = {
                                    ...prev[key as keyof typeof prev],
                                    therapist_name: (prev as any)[key]?.therapist_name || name || user.email || "",
                                };
                            }
                            return next;
                        });
                    }
                })
                .catch(err => console.error(err));
        }

        if (isViewMode && submissionId) {
            api.get(`/api/inputs/multidisciplinary-tracker/${submissionId}/`)
                .then(res => {
                    setFullSubmission(res.data);
                    if (res.data.form_data) setFormData(prev => ({ ...prev, ...res.data.form_data }));
                })
                .catch(err => console.error("Failed to fetch submission:", err));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isViewMode, router, studentId, submissionId, user, userSpecialty]);

    useEffect(() => {
        if (!studentId || !reportCycleId || isViewMode) return;
        refreshContributions();
        // Ensure the parent tracker row exists so the collab WebSocket can
        // connect before any specialist has saved a section.
        api.post(`/api/inputs/multidisciplinary-tracker/ensure/`, {
            student: parseInt(studentId), report_cycle: parseInt(reportCycleId),
        })
            .then(res => {
                if (res.data) {
                    if (res.data.form_data && Object.keys(res.data.form_data).length > 0) {
                        setFormData(prev => ({ ...prev, ...res.data.form_data }));
                    }
                    setFullSubmission(res.data);
                }
            })
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, reportCycleId, isViewMode]);

    useEffect(() => {
        if (isViewMode && fullSubmission) {
            const sourceData = (isTranslated && fullSubmission.translated_data) ? fullSubmission.translated_data : fullSubmission.form_data;
            if (sourceData) setFormData(prev => ({ ...prev, ...sourceData }));
        }
    }, [isTranslated, fullSubmission, isViewMode]);

    // ─── Real-time collaboration ───────────────────────────────────────────
    const trackerInstanceId = fullSubmission?.id ?? null;
    const collab = useFormCollaboration({
        formType: "tracker",
        instanceId: isViewMode ? null : trackerInstanceId,
        currentUserId: user?.user_id,
        onSectionSaved: (event) => {
            // Other specialist's save → merge their section data into ours,
            // but never stomp the section the current user is editing.
            if (!event.form_data) return;
            if (collab.isLockedByMe(event.section_key)) return;
            const sectionPayload = (event.form_data as any)[event.section_key];
            if (!sectionPayload || typeof sectionPayload !== "object") {
                refreshContributions();
                return;
            }
            setFormData(prev => ({
                ...prev,
                [event.section_key]: { ...(prev as any)[event.section_key], ...sectionPayload },
            } as any));
            refreshContributions();
            toast.info(`${event.by.user_name} updated ${event.section_key.replace("section_", "Section ").toUpperCase()}`);
        },
        onSectionSubmitted: (event) => {
            refreshContributions();
            if (event.finalized) {
                toast.success("Tracker finalized — all sections complete.");
            } else {
                toast.success(`${event.by.user_name} submitted ${event.section_key.replace("section_", "Section ").toUpperCase()}`);
            }
        },
    });

    const sectionStatus = useMemo(() => {
        const result: Record<string, {
            status: "draft" | "submitted" | "pending";
            locked: boolean; canEdit: boolean; ownerLabel: string;
            remoteHolder?: { user_name: string; specialty?: string } | null;
        }> = {};
        for (const key of Object.keys(TRACKER_SECTION_OWNERS)) {
            const owner = TRACKER_SECTION_OWNERS[key];
            const ownerLabel = specialtyShortLabel(owner as SectionOwner);
            const contrib = contributions[key];
            const isFinalized = !!fullSubmission?.finalized_at;
            const isSelfSubmitted = contrib?.status === "submitted";
            const remoteHolder = collab.isLockedByOther(key);
            const canEdit = !isViewMode && !isFinalized && !isSelfSubmitted
                && !remoteHolder
                && canEditSection(TRACKER_SECTION_OWNERS, key, userSpecialties, user?.role);
            result[key] = {
                status: contrib?.status || "pending",
                locked: isSelfSubmitted || isFinalized || !!remoteHolder,
                canEdit,
                ownerLabel,
                remoteHolder: remoteHolder ? { user_name: remoteHolder.user_name, specialty: remoteHolder.specialty } : null,
            };
        }
        return result;
    }, [contributions, fullSubmission, isViewMode, user?.role, userSpecialties, collab]);

    const ro = (key: string) => isViewMode || !sectionStatus[key]?.canEdit;

    const cardProps = (sectionKey: string) => {
        const s = sectionStatus[sectionKey];
        const eligible = !!s?.canEdit;
        return {
            remoteHolder: s?.remoteHolder ?? null,
            onFocus: eligible ? () => collab.acquireLock(sectionKey) : undefined,
            onBlur: eligible ? () => collab.releaseLock(sectionKey) : undefined,
        };
    };

    const saveSection = async (sectionKey: string, opts: { submit?: boolean } = {}) => {
        if (!studentId) { setErrorMsg("No student selected."); return; }
        setSavingSection(sectionKey + (opts.submit ? ":submit" : ":save"));
        setErrorMsg("");
        try {
            const sectionData = (formData as any)[sectionKey] || {};
            await api.patch(`/api/inputs/multidisciplinary-tracker/sections/${sectionKey}/`, {
                student: parseInt(studentId), report_cycle: parseInt(reportCycleId),
                section_data: sectionData,
            });
            if (opts.submit) {
                const res = await api.post(`/api/inputs/multidisciplinary-tracker/sections/${sectionKey}/submit/`, {
                    student: parseInt(studentId), report_cycle: parseInt(reportCycleId),
                });
                toast.success(`Section submitted.`);
                if (res.data?.finalized_at) {
                    toast.success("Tracker finalized — all sections complete.");
                    setTimeout(() => router.replace(getWorkspaceFormUrl(studentId)), 1500);
                }
            } else {
                toast.success(`Section saved.`);
            }
            await refreshContributions();
            collab.releaseLock(sectionKey);
        } catch (err: any) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Save failed.";
            setErrorMsg(msg);
            toast.error(msg);
        } finally {
            setSavingSection(null);
        }
    };

    const sectionFooter = (sectionKey: string) => {
        if (isViewMode) return null;
        const s = sectionStatus[sectionKey];
        if (!s) return null;
        if (s.remoteHolder && !isAdmin) {
            return (
                <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#92400e", background: "#fef3c7", padding: "10px 14px", borderRadius: "8px", border: "1px solid #fde68a" }}>
                    <strong>{s.remoteHolder.user_name}</strong> is editing this section right now. You'll be able to edit once they finish.
                </div>
            );
        }
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
                <button type="button" onClick={() => saveSection(sectionKey, { submit: false })} disabled={saving}
                    style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "white", color: "#334155", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.85rem" }}>
                    {savingDraft ? "Saving…" : "Save Draft"}
                </button>
                <button type="button" onClick={() => saveSection(sectionKey, { submit: true })} disabled={saving}
                    style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: saving ? "#a5b4fc" : "#4f46e5", color: "white", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: "0.85rem" }}>
                    {savingSubmit ? "Submitting…" : "Submit My Section"}
                </button>
            </div>
        );
    };

    if (!studentId && !isViewMode) return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Missing student context. Return to dashboard.</div>;

    type DisciplineGroup = {
        suffix: string;
        label: string;       // short tag — SLP / OT / PT / ABA / Dev. Psych
        cTitle: string;      // existing Section C card title
        goals: string[];
    };
    const DISCIPLINE_GROUPS: DisciplineGroup[] = [
        { suffix: "slp", label: "SLP", cTitle: "C1. Communication (SLP)", goals: OPTIONS.slp_goals },
        { suffix: "ot", label: "OT", cTitle: "C2. Fine Motor / Sensory / ADLs (OT)", goals: OPTIONS.ot_goals },
        { suffix: "pt", label: "PT", cTitle: "C3. Gross Motor / Gait / Coordination (PT)", goals: OPTIONS.pt_goals },
        { suffix: "aba", label: "ABA", cTitle: "C4. Applied Behavior Analysis (ABA)", goals: OPTIONS.aba_goals },
        { suffix: "developmental_psychology", label: "Dev. Psych", cTitle: "C5. Developmental Psychology", goals: OPTIONS.dev_psy_goals },
    ];

    return (
        <div style={{ maxWidth: "1024px", margin: "0 auto", padding: "2rem 1rem 3rem" }}>
            {studentProfile && (
                <div className="hidden md:flex" style={{ marginBottom: "2rem", justifyContent: "space-between", alignItems: "center", background: "white", padding: "12px 20px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <button type="button" onClick={() => router.back()}
                            style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", color: "#475569", fontWeight: 600, fontSize: "0.85rem" }} className="hover:bg-slate-200">
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

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "12px" }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                        Monthly Progress Report {studentName && `for ${studentName}`}
                        {isViewMode && <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginLeft: "8px" }}>— Read Only</span>}
                    </h1>
                    {!isViewMode && userSpecialties.length > 0 && (
                        <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "4px" }}>
                            Logged in as <strong>{userSpecialties.join(", ")}</strong> — you can edit your discipline section{userSpecialties.length > 1 ? "s" : ""} and shared sections.
                        </p>
                    )}
                    {!isViewMode && trackerInstanceId && (
                        <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "3px 8px", background: collab.connected ? "#dcfce7" : "#f1f5f9", color: collab.connected ? "#166534" : "#475569", borderRadius: "999px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: collab.connected ? "#22c55e" : "#94a3b8", display: "inline-block" }} />
                                {collab.connected ? "Live" : "Reconnecting…"}
                            </span>
                            {collab.locks.filter(l => l.user_id !== user?.user_id).map(l => (
                                <span key={`${l.user_id}-${l.section_key}`} style={{ fontSize: "0.7rem", fontWeight: 600, padding: "3px 8px", background: "#eef2ff", color: "#4338ca", borderRadius: "999px" }}>
                                    {l.user_name} · {l.section_key.replace("section_", "§").toUpperCase()}
                                </span>
                            ))}
                        </div>
                    )}
                    {fullSubmission?.finalized_at && (
                        <p style={{ fontSize: "0.85rem", color: "#047857", marginTop: "4px" }}>
                            ✓ Finalized on {new Date(fullSubmission.finalized_at).toLocaleString()}.
                        </p>
                    )}
                </div>
                {isViewMode && hasTranslation && (
                    <div style={{ display: "flex", gap: "4px", background: "#f8fafc", padding: "4px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <button onClick={() => setIsTranslated(false)}
                            style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "0.85rem", fontWeight: !isTranslated ? 700 : 500, color: !isTranslated ? "#0f172a" : "#64748b", background: !isTranslated ? "white" : "transparent", boxShadow: !isTranslated ? "0 1px 2px rgba(0,0,0,0.05)" : "none", border: "none", cursor: "pointer" }}>
                            Original
                        </button>
                        <button onClick={() => setIsTranslated(true)}
                            style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "0.85rem", fontWeight: isTranslated ? 700 : 500, color: isTranslated ? "#4f46e5" : "#64748b", background: isTranslated ? "white" : "transparent", boxShadow: isTranslated ? "0 1px 2px rgba(0,0,0,0.05)" : "none", border: "none", cursor: "pointer" }}>
                            English (AI) ✨
                        </button>
                    </div>
                )}
            </div>

            {/* Progress header */}
            {!isViewMode && (
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px 16px", marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {Object.entries(TRACKER_SECTION_OWNERS).map(([key, owner]) => {
                        const s = sectionStatus[key];
                        const isMine = canEditSection(TRACKER_SECTION_OWNERS, key, userSpecialties, user?.role);
                        const icon = s?.status === "submitted" ? "✓" : "○";
                        const color = s?.status === "submitted" ? "#10b981" : isMine ? "#4f46e5" : "#94a3b8";
                        const label = key.replace("section_", "").replace("_", " ").toUpperCase();
                        return (
                            <span key={key} style={{ fontSize: "0.75rem", padding: "4px 10px", borderRadius: "999px", background: "#f8fafc", border: "1px solid #e2e8f0", color, fontWeight: isMine ? 700 : 500 }}>
                                {icon} {label} <span style={{ color: "#94a3b8", fontWeight: 500 }}>· {specialtyShortLabel(owner as SectionOwner)}</span>
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

            {/* Per-discipline trio: each specialist owns their own A/B/C. */}
            {DISCIPLINE_GROUPS.map(({ suffix, label, cTitle, goals }) => {
                const aKey = `section_a_${suffix}`;
                const bKey = `section_b_${suffix}`;
                const cKey = `section_c_${suffix}`;
                const aData = (formData as any)[aKey] as { date: string; therapist_name: string; session_type: string; sessions_completed: string };
                const bData = (formData as any)[bKey] as { attendance: string; participation_level: string; notes: string };
                const cData = (formData as any)[cKey] as { goals: string[]; notes: string };
                return (
                    <div key={suffix} style={{ marginBottom: "1.5rem", padding: "0.5rem 0" }}>
                        <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#4338ca", margin: "0 0 0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            {label} — your section
                        </h3>

                        <SectionCard title={`Section A — General Information (${label})`} ownerLabel={label} status={sectionStatus[aKey]?.status} locked={sectionStatus[aKey]?.locked} {...cardProps(aKey)}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Child Name</p>
                                    <TextInput value={studentName} readOnly={true} />
                                </div>
                                <div>
                                    <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Date</p>
                                    <TextInput type="date" value={aData.date} onChange={ro(aKey) ? undefined : v => handleNestedChange(aKey as any, 'date', v)} readOnly={ro(aKey)} />
                                </div>
                            </div>
                            <div style={{ marginTop: "12px" }}>
                                <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Therapist Name</p>
                                <TextInput value={aData.therapist_name} onChange={ro(aKey) ? undefined : v => handleNestedChange(aKey as any, 'therapist_name', v)} readOnly={ro(aKey)} />
                            </div>

                            <FieldGroup label="Session Type">
                                <div style={{ display: "flex", gap: "16px" }}>
                                    {OPTIONS.session_type.map(opt => (
                                        <RadioItem key={opt} label={opt} checked={aData.session_type === opt} onChange={() => handleNestedChange(aKey as any, 'session_type', opt)} readOnly={ro(aKey)} />
                                    ))}
                                </div>
                            </FieldGroup>

                            <div>
                                <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Number of sessions completed this period</p>
                                <TextInput type="number" value={aData.sessions_completed} onChange={ro(aKey) ? undefined : v => handleNestedChange(aKey as any, 'sessions_completed', v)} readOnly={ro(aKey)} />
                            </div>
                            {sectionFooter(aKey)}
                        </SectionCard>

                        <SectionCard title={`Section B — Session Attendance & Participation (${label})`} ownerLabel={label} status={sectionStatus[bKey]?.status} locked={sectionStatus[bKey]?.locked} {...cardProps(bKey)}>
                            <FieldGroup label="B1. Attendance">
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                                    {OPTIONS.attendance.map(opt => (
                                        <RadioItem key={opt} label={opt} checked={bData.attendance === opt} onChange={() => handleNestedChange(bKey as any, 'attendance', opt)} readOnly={ro(bKey)} />
                                    ))}
                                </div>
                            </FieldGroup>
                            <FieldGroup label="B2. Participation Level">
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                                    {OPTIONS.participation.map(opt => (
                                        <RadioItem key={opt} label={opt} checked={bData.participation_level === opt} onChange={() => handleNestedChange(bKey as any, 'participation_level', opt)} readOnly={ro(bKey)} />
                                    ))}
                                </div>
                            </FieldGroup>
                            <FieldGroup label="Notes">
                                <TextArea value={bData.notes} onChange={ro(bKey) ? undefined : v => handleNestedChange(bKey as any, 'notes', v)} readOnly={ro(bKey)} />
                            </FieldGroup>
                            {sectionFooter(bKey)}
                        </SectionCard>

                        <SectionCard title={cTitle} ownerLabel={label} status={sectionStatus[cKey]?.status} locked={sectionStatus[cKey]?.locked} {...cardProps(cKey)}>
                            <FieldGroup label="Goals">
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                                    {goals.map(opt => (
                                        <CheckboxItem key={opt} label={opt} checked={cData.goals.includes(opt)} onChange={() => handleArrayToggle(cKey as any, 'goals', opt)} readOnly={ro(cKey)} />
                                    ))}
                                </div>
                            </FieldGroup>
                            <FieldGroup label="Notes">
                                <TextArea value={cData.notes} onChange={ro(cKey) ? undefined : v => handleNestedChange(cKey as any, 'notes', v)} readOnly={ro(cKey)} />
                            </FieldGroup>
                            {sectionFooter(cKey)}
                        </SectionCard>
                    </div>
                );
            })}

            {/* Section D */}
            <SectionCard title="Section D — Functional Observations" ownerLabel="Shared" status={sectionStatus.section_d?.status} locked={sectionStatus.section_d?.locked} {...cardProps("section_d")}>
                <FieldGroup label="D1. Independent Skills">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                        {OPTIONS.independent_skills.map(opt => (
                            <RadioItem key={opt} label={opt} checked={formData.section_d.independent_skills === opt} onChange={() => handleNestedChange('section_d', 'independent_skills', opt)} readOnly={ro("section_d")} />
                        ))}
                    </div>
                </FieldGroup>
                <FieldGroup label="D2. Behavior Interaction with Therapist">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                        {OPTIONS.behavior_interaction.map(opt => (
                            <RadioItem key={opt} label={opt} checked={formData.section_d.behavior_interaction === opt} onChange={() => handleNestedChange('section_d', 'behavior_interaction', opt)} readOnly={ro("section_d")} />
                        ))}
                    </div>
                </FieldGroup>
                <FieldGroup label="D3. Sensory / Motor Regulation">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                        {OPTIONS.sensory_motor.map(opt => (
                            <RadioItem key={opt} label={opt} checked={formData.section_d.sensory_motor === opt} onChange={() => handleNestedChange('section_d', 'sensory_motor', opt)} readOnly={ro("section_d")} />
                        ))}
                    </div>
                </FieldGroup>
                <FieldGroup label="D4. Communication With Adults">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                        {OPTIONS.communication_adults.map(opt => (
                            <RadioItem key={opt} label={opt} checked={formData.section_d.communication_adults === opt} onChange={() => handleNestedChange('section_d', 'communication_adults', opt)} readOnly={ro("section_d")} />
                        ))}
                    </div>
                </FieldGroup>
                <FieldGroup label="Notes">
                    <TextArea value={formData.section_d.notes} onChange={ro("section_d") ? undefined : v => handleNestedChange('section_d', 'notes', v)} readOnly={ro("section_d")} />
                </FieldGroup>
                {sectionFooter("section_d")}
            </SectionCard>

            {/* Section E */}
            <SectionCard title="Section E — Goal Achievement Rating (GAS)" subtitle="(Simple therapist rating for AI calibration)" ownerLabel="Shared" status={sectionStatus.section_e?.status} locked={sectionStatus.section_e?.locked} {...cardProps("section_e")}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
                    {['goal_1', 'goal_2', 'goal_3', 'goal_4'].map((g, i) => (
                        <div key={g} style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                            <p style={{ fontSize: "0.85rem", fontWeight: 700, margin: "0 0 10px 0", color: "#1e293b" }}>Goal {i + 1}</p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                                {OPTIONS.gas_scale.map(opt => (
                                    <RadioItem key={opt} label={opt} checked={(formData.section_e as any)[g] === opt} onChange={() => handleNestedChange('section_e', g, opt)} readOnly={ro("section_e")} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <FieldGroup label="Comments">
                    <TextArea value={formData.section_e.comments} onChange={ro("section_e") ? undefined : v => handleNestedChange('section_e', 'comments', v)} readOnly={ro("section_e")} />
                </FieldGroup>
                {sectionFooter("section_e")}
            </SectionCard>

            {/* Section F */}
            <SectionCard title="Section F — Recommended Next Steps" ownerLabel="Shared" status={sectionStatus.section_f?.status} locked={sectionStatus.section_f?.locked} {...cardProps("section_f")}>
                <FieldGroup label="F1. Therapy Recommendations">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {OPTIONS.therapy_recs.map(opt => (
                            <CheckboxItem key={opt} label={opt} checked={formData.section_f.therapy_recommendations.includes(opt)} onChange={() => handleArrayToggle('section_f', 'therapy_recommendations', opt)} readOnly={ro("section_f")} />
                        ))}
                    </div>
                </FieldGroup>
                <FieldGroup label="F2. Home Strategies">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {OPTIONS.home_strategies.map(opt => (
                            <CheckboxItem key={opt} label={opt} checked={formData.section_f.home_strategies.includes(opt)} onChange={() => handleArrayToggle('section_f', 'home_strategies', opt)} readOnly={ro("section_f")} />
                        ))}
                    </div>
                </FieldGroup>
                <FieldGroup label="Therapist Suggested Activities">
                    <TextArea value={formData.section_f.therapist_suggested_activities} onChange={ro("section_f") ? undefined : v => handleNestedChange('section_f', 'therapist_suggested_activities', v)} readOnly={ro("section_f")} />
                </FieldGroup>
                {sectionFooter("section_f")}
            </SectionCard>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => router.push(`/students/${studentId}`)}
                    style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", color: "#475569", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" }}>
                    Back to Profile
                </button>
            </div>
        </div>
    );
}

export default function SpecialistBInputPage() {
    return (
        <ProtectedRoute>
            <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>Loading form…</div>}>
                <SpecialistBFormContent />
            </Suspense>
        </ProtectedRoute>
    );
}
