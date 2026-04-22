"use client";

import { useState, useEffect, Suspense, useMemo, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import {
    SHARED,
    SLP,
    OT,
    PT,
    ABA,
    DEV_PSY,
    SectionOwner,
    specialtyShortLabel,
    userSpecialtyList,
} from "@/lib/sectionOwners";

// Import all JSON schemas
import parent_assessment from "@/config/forms/parentAssessmentSchema.json";
import multidisciplinary_assessment from "@/config/forms/multidisciplinaryAssessmentSchema.json";
import sped_assessment from "@/config/forms/spedAssessmentSchema.json";
import parent_tracker from "@/config/forms/parentProgressTrackerSchema.json";
import multidisciplinary_tracker from "@/config/forms/multidisciplinaryProgressTrackerSchema.json";
import sped_tracker from "@/config/forms/spedProgressTrackerSchema.json";

// ─── Section / field ownership maps for the multi-disciplinary forms ──────────
//
// These map the schema's section_id (and sometimes field_id) to the
// specialty that owns that area. SHARED means anyone may edit; null means
// the form is not section-gated (e.g. parent or sped forms).
//
// The multidisciplinary assessment schema collapses ABA (F1) and Dev. Psych
// (F2) into a single "section_f", so we gate at the field level there.
// The multidisciplinary tracker schema collapses every discipline into a
// single "section_c", so we gate at the field level for that section too.

const ASSESSMENT_SECTION_OWNER_MAP: Record<string, SectionOwner> = {
    section_a: SHARED,
    section_b: SHARED,
    section_c: SLP,
    section_d: OT,
    section_e: PT,
    section_f1: ABA,
    section_f2: DEV_PSY,
    section_g: SHARED,
};

// Field IDs that belong to F1 (ABA) within the original schema's section_f.
// Anything else under section_f belongs to F2 (Dev Psych).
const ASSESSMENT_F1_FIELDS = new Set<string>([
    "behavioral_observations",
    "psych_emotional_functioning",
    "psych_notes",
]);

const TRACKER_SECTION_OWNER_MAP: Record<string, SectionOwner> = {
    section_a: SHARED,
    section_b: SHARED,
    // section_c: per-field
    section_d: SHARED,
    section_e: SHARED,
    section_f: SHARED,
};

const TRACKER_C_FIELD_OWNERS: Record<string, SectionOwner> = {
    communication: SLP,
    slp_notes: SLP,
    fine_motor_sensory_adls: OT,
    ot_notes: OT,
    gross_motor: PT,
    pt_notes: PT,
    behavior_emotional: ABA,
    aba_notes: ABA,
    developmental_psychology: DEV_PSY,
    developmental_psychology_notes: DEV_PSY,
};

function getFieldOwner(formType: string, sectionId: string, fieldId: string): SectionOwner | null {
    if (formType === "multidisciplinary-assessment") {
        return ASSESSMENT_SECTION_OWNER_MAP[sectionId] ?? null;
    }
    if (formType === "multidisciplinary-tracker") {
        if (sectionId === "section_c") return TRACKER_C_FIELD_OWNERS[fieldId] ?? SHARED;
        return TRACKER_SECTION_OWNER_MAP[sectionId] ?? null;
    }
    return null;
}

function getSectionOwner(formType: string, sectionId: string): SectionOwner | "MIXED" | null {
    if (formType === "multidisciplinary-assessment") {
        return ASSESSMENT_SECTION_OWNER_MAP[sectionId] ?? null;
    }
    if (formType === "multidisciplinary-tracker") {
        if (sectionId === "section_c") return "MIXED";
        return TRACKER_SECTION_OWNER_MAP[sectionId] ?? null;
    }
    return null;
}

// For the assessment form, split the schema's combined section_f into two
// virtual sections (section_f1 ABA / section_f2 Dev Psych) so each can be
// owned independently. Underlying form data still lives under section_f.
function transformSchema(formType: string, schema: any): any {
    if (!schema || formType !== "multidisciplinary-assessment") return schema;
    const next = { ...schema, sections: [] as any[] };
    for (const sec of schema.sections || []) {
        if (sec.id !== "section_f") {
            next.sections.push(sec);
            continue;
        }
        const f1Fields = (sec.fields || []).filter((f: any) => ASSESSMENT_F1_FIELDS.has(f.id));
        const f2Fields = (sec.fields || []).filter((f: any) => !ASSESSMENT_F1_FIELDS.has(f.id));
        next.sections.push({
            id: "section_f1",
            title: "SECTION F1 — APPLIED BEHAVIOR ANALYSIS (ABA) ASSESSMENT",
            fields: f1Fields,
            __dataSection: "section_f",
        });
        next.sections.push({
            id: "section_f2",
            title: "SECTION F2 — DEVELOPMENTAL PSYCHOLOGY ASSESSMENT",
            fields: f2Fields,
            __dataSection: "section_f",
        });
    }
    return next;
}

function canEditOwner(owner: SectionOwner | null, userSpecialties: string[], isAdmin: boolean): boolean {
    if (isAdmin) return true;
    if (!owner) return true; // ungated forms
    if (owner === SHARED) return true;
    return userSpecialties.includes(owner);
}

const schemaMap: Record<string, any> = {
    "parent-assessment": parent_assessment,
    "multidisciplinary-assessment": multidisciplinary_assessment,
    "sped-assessment": sped_assessment,
    "parent-tracker": parent_tracker,
    "multidisciplinary-tracker": multidisciplinary_tracker,
    "sped-tracker": sped_tracker,
};

const workspaceTabByFormType: Record<string, string> = {
    "parent-assessment": "parent_assessment",
    "multidisciplinary-assessment": "multi_assessment",
    "sped-assessment": "sped_assessment",
    "parent-tracker": "parent_tracker",
    "multidisciplinary-tracker": "multi_tracker",
    "sped-tracker": "sped_tracker",
};

const getWorkspaceFormUrl = (studentId: string, formType: string) => {
    const tab = workspaceTabByFormType[formType];
    if (!studentId || !tab) return null;
    return `/workspace?studentId=${encodeURIComponent(studentId)}&workspace=forms&tab=${encodeURIComponent(tab)}`;
};

/* ─── Shared UI Components ─────────────────────────────────────────────────── */

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
            <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 bg-slate-50">
                <h2 style={{ fontSize: "var(--form-section-title-size)", lineHeight: 1.35 }} className="font-bold text-slate-900 m-0">{title}</h2>
            </div>
            <div className="p-4 sm:p-6 flex flex-col gap-4">
                {children}
            </div>
        </div>
    );
}

function FieldLabel({ label }: { label: string }) {
    return (
        <p style={{ fontSize: "var(--form-field-label-size)", lineHeight: "var(--form-line-height)", fontWeight: 650, color: "#334155", marginBottom: "6px" }}>
            {label}
        </p>
    );
}

function TextInput({ value, onChange, placeholder, type = "text", min, max, readOnly }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; min?: number; max?: number; readOnly?: boolean }) {
    return (
        <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            min={min}
            max={max}
            readOnly={readOnly}
            disabled={readOnly}
            style={{
                width: "100%", borderRadius: "8px", border: "1px solid #e2e8f0",
                padding: "10px 13px", fontSize: "var(--form-control-font-size)", lineHeight: "var(--form-line-height)",
                color: "#0f172a", background: readOnly ? "#f1f5f9" : "white",
                cursor: readOnly ? "not-allowed" : "text",
                boxSizing: "border-box",
            }}
        />
    );
}

function TextAreaInput({ value, onChange, placeholder, rows = 3, readOnly, autoGrow }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; readOnly?: boolean; autoGrow?: boolean }) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (!autoGrow || !textareaRef.current) return;
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }, [autoGrow, value]);

    return (
        <textarea
            ref={textareaRef}
            value={value}
            onChange={e => {
                onChange(e.target.value);
                if (autoGrow) {
                    e.currentTarget.style.height = "auto";
                    e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                }
            }}
            placeholder={placeholder}
            rows={rows}
            readOnly={readOnly}
            disabled={readOnly}
            style={{
                width: "100%", borderRadius: "8px", border: "1px solid #e2e8f0",
                padding: "10px 13px", fontSize: "var(--form-control-font-size)", lineHeight: "var(--form-line-height)", resize: autoGrow ? "none" : "vertical",
                color: "#0f172a", background: readOnly ? "#f1f5f9" : "white",
                cursor: readOnly ? "not-allowed" : "text",
                boxSizing: "border-box",
                overflow: autoGrow ? "hidden" : undefined,
            }}
        />
    );
}

function CheckboxItem({ label, checked, onChange, readOnly }: { label: string; checked: boolean; onChange: () => void; readOnly?: boolean }) {
    return (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--form-control-font-size)", lineHeight: "var(--form-line-height)", cursor: readOnly ? "not-allowed" : "pointer", color: readOnly ? "#64748b" : "#0f172a", userSelect: "none" }}>
            <input
                type="checkbox"
                checked={checked}
                onChange={onChange}
                disabled={readOnly}
                style={{ width: 18, height: 18, accentColor: "#4f46e5", cursor: readOnly ? "not-allowed" : "pointer" }}
            />
            {label}
        </label>
    );
}

function RadioGroup({ options, value, onChange, readOnly }: { options: string[]; value: string; onChange: (v: string) => void; readOnly?: boolean }) {
    return (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {options.map(opt => (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: readOnly ? "not-allowed" : "pointer", fontSize: "var(--form-control-font-size)", lineHeight: "var(--form-line-height)", color: readOnly ? "#64748b" : "#0f172a" }}>
                    <input
                        type="radio"
                        checked={value === opt}
                        onChange={() => onChange(opt)}
                        disabled={readOnly}
                        style={{ width: 18, height: 18, accentColor: "#4f46e5", cursor: readOnly ? "not-allowed" : "pointer" }}
                    />
                    {opt}
                </label>
            ))}
        </div>
    );
}

/* ─── Main Component ───────────────────────────────────────────────────────── */

const GAS_OPTIONS = [
    { score: 1, label: "None", tone: "#fee2e2", color: "#991b1b" },
    { score: 2, label: "Minimal", tone: "#fef3c7", color: "#92400e" },
    { score: 3, label: "Expected", tone: "#dbeafe", color: "#1e40af" },
    { score: 4, label: "More", tone: "#d1fae5", color: "#065f46" },
    { score: 5, label: "Achieved", tone: "#dcfce7", color: "#166534" },
];

const scoreLabelFor = (score: number | string) => {
    const numeric = typeof score === "number" ? score : parseInt(String(score), 10);
    return GAS_OPTIONS.find(opt => opt.score === numeric)?.label || "";
};

const scoreNumberFrom = (value: any) => {
    if (typeof value === "number") return value;
    if (!value) return "";
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : "";
};

function GoalAchievementInput({ goals, value, sectionData, onChange, readOnly, notePlaceholderPrefix }: { goals: any[]; value: any; sectionData: any; onChange: (v: any[]) => void; readOnly?: boolean; notePlaceholderPrefix: string }) {
    const currentList = Array.isArray(value) ? value : [];
    const normalized = goals.map((goal, index) => {
        const existing = currentList.find((item: any) => item?.goal_id === goal.goal_id) || currentList[index] || {};
        const legacyScore = sectionData?.[`dynamic_goal_${index + 1}`] || sectionData?.[`gas_goal_${index + 1}`];
        const score = scoreNumberFrom(existing.score ?? legacyScore);
        return {
            goal_id: goal.goal_id,
            domain: goal.domain || "",
            goal_text: goal.goal_text || "",
            score,
            score_label: score ? scoreLabelFor(score) : "",
            note: existing.note || "",
        };
    });

    const updateGoal = (goalId: string, patch: Record<string, any>) => {
        if (readOnly) return;
        onChange(normalized.map(item => (
            item.goal_id === goalId ? { ...item, ...patch } : item
        )));
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", fontSize: "0.72rem", color: "#475569" }}>
                {GAS_OPTIONS.map(opt => (
                    <span key={opt.score} style={{ padding: "2px 7px", borderRadius: "999px", background: opt.tone, color: opt.color, fontWeight: 700 }}>
                        {opt.score} - {opt.label}
                    </span>
                ))}
            </div>
            {normalized.map(goal => (
                <div key={goal.goal_id} style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px", background: "#f8fafc" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div style={{ minWidth: 0 }}>
                            <p style={{ margin: "0 0 3px", fontSize: "0.9rem", fontWeight: 800, color: "#172554" }}>
                                {goal.goal_id}{goal.domain ? ` (${goal.domain})` : ""}
                            </p>
                            <p style={{ margin: 0, fontSize: "var(--form-small-font-size)", color: "#475569", lineHeight: 1.45 }}>
                                {goal.goal_text || "No IEP goal text available."}
                            </p>
                        </div>
                        {goal.score && (
                            <div style={{ width: 30, height: 30, borderRadius: "7px", background: GAS_OPTIONS.find(opt => opt.score === goal.score)?.tone || "#e2e8f0", color: GAS_OPTIONS.find(opt => opt.score === goal.score)?.color || "#334155", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flexShrink: 0 }}>
                                {goal.score}
                            </div>
                        )}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "5px", marginBottom: "8px" }}>
                        {GAS_OPTIONS.map(opt => {
                            const selected = goal.score === opt.score;
                            return (
                                <button
                                    key={opt.score}
                                    type="button"
                                    disabled={readOnly}
                                    onClick={() => updateGoal(goal.goal_id, { score: opt.score, score_label: opt.label })}
                                    style={{
                                        border: selected ? `2px solid ${opt.color}` : "1px solid #cbd5e1",
                                        background: selected ? opt.tone : "white",
                                        color: selected ? opt.color : "#334155",
                                        borderRadius: "7px",
                                        padding: "5px 6px",
                                        fontSize: "0.72rem",
                                        fontWeight: 800,
                                        cursor: readOnly ? "not-allowed" : "pointer",
                                        minHeight: "34px",
                                    }}
                                >
                                    {opt.score} <span style={{ fontSize: "0.68rem", fontWeight: 700 }}>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <TextAreaInput
                        value={goal.note}
                        rows={1}
                        placeholder={`${notePlaceholderPrefix} for ${goal.goal_id}`}
                        readOnly={readOnly}
                        autoGrow
                        onChange={note => updateGoal(goal.goal_id, { note })}
                    />
                </div>
            ))}
        </div>
    );
}

export function FormEntryContent({ propType, propStudentId, propSubmissionId, propMode, propHideNavigation, propOnSubmitted }: { propType?: string, propStudentId?: string, propSubmissionId?: string, propMode?: string, propHideNavigation?: boolean, propOnSubmitted?: (message: string) => void | Promise<void> } = {}) {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAuth();

    const formType = propType || (params?.type as string) || "unknown";
    const studentId = propStudentId || searchParams.get("studentId");

    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [reportCycleId, setReportCycleId] = useState("1");
    const [schema, setSchema] = useState<any>(null);
    const [formData, setFormData] = useState<any>({});
    const [studentProfile, setStudentProfile] = useState<any>(null);
    const [showDescriptions, setShowDescriptions] = useState<Record<string, boolean>>({});

    const toggleDescription = (fieldId: string) => {
        setShowDescriptions(prev => ({ ...prev, [fieldId]: !prev[fieldId] }));
    };

    const isViewMode = propMode === "view" || searchParams.get("mode") === "view";
    const formIdStr = propSubmissionId || searchParams.get("submissionId") || searchParams.get("formId");

    const isAdmin = user?.role === "ADMIN";
    const userSpecialties = useMemo(
        () => userSpecialtyList(user?.specialties, user?.specialty),
        [user?.specialties, user?.specialty],
    );
    const goalNotePlaceholderPrefix = useMemo(() => {
        if (user?.role === "TEACHER") return "Describe classroom progress observed";
        if (user?.role === "SPECIALIST") {
            return userSpecialties.length === 1
                ? `Describe ${specialtyShortLabel(userSpecialties[0])} progress observed`
                : "Describe specialist progress observed";
        }
        return "Describe progress observed";
    }, [user?.role, userSpecialties]);

    const isFieldEditable = (sectionId: string, fieldId: string): boolean => {
        // For the assessment form, callers may pass the underlying data
        // section_id (section_f) — translate into the virtual ABA/Dev-Psych
        // section so ownership resolves correctly.
        let resolvedSectionId = sectionId;
        if (formType === "multidisciplinary-assessment" && sectionId === "section_f") {
            resolvedSectionId = ASSESSMENT_F1_FIELDS.has(fieldId) ? "section_f1" : "section_f2";
        }
        const owner = getFieldOwner(formType, resolvedSectionId, fieldId);
        return canEditOwner(owner, userSpecialties, isAdmin);
    };

    // Resolve a (possibly virtual) section_id back to the underlying data
    // bucket. Virtual sections (e.g. section_f1/section_f2) carry a
    // __dataSection pointer on the schema entry; everything else is itself.
    const dataKeyFor = (section: any): string => section?.__dataSection || section?.id;

    // For Translation Toggle
    const [fullSubmission, setFullSubmission] = useState<any>(null);
    const [isTranslated, setIsTranslated] = useState(false);
    const hasTranslation = fullSubmission && fullSubmission.translated_data && Object.keys(fullSubmission.translated_data).length > 0 && fullSubmission.original_language && !['en', 'english'].includes(fullSubmission.original_language.toLowerCase());

    const draftKey = `draft_${formType}_${studentId}`;

    useEffect(() => {
        let isMounted = true;
        const loadForm = async () => {
            const loadedSchema = schemaMap[formType];
            if (!loadedSchema) return;

            const finalSchema = JSON.parse(JSON.stringify(loadedSchema));
            let activeIepData: any = null;
            let profileData: any = null;

            if (studentId) {
                try {
                    const res = await api.get(`/api/students/${studentId}/profile/`);
                    profileData = res.data;
                    setStudentProfile(profileData);
                    
                    if (isMounted) {
                        if (profileData.active_cycle?.id) {
                            setReportCycleId(String(profileData.active_cycle.id));
                        }
                        
                        // Prefer the finalized IEP so progress ratings track the approved goals.
                        const iepDoc = profileData.generated_documents?.find((d: any) => d.type === 'IEP' && d.has_iep_data && d.status === 'FINAL')
                            || profileData.generated_documents?.find((d: any) => d.type === 'IEP' && d.has_iep_data);
                        if (iepDoc) {
                            const iepRes = await api.get(`/api/iep/${iepDoc.id}/`);
                            activeIepData = iepRes.data?.iep_data;
                        }
                    }
                } catch (e) {
                    console.error("Failed to load profile/IEP data:", e);
                }
            }

            // Inject dynamic IEP goals if available
            if (activeIepData && activeIepData.section5_ltg && activeIepData.section5_ltg.length > 0) {
                finalSchema.sections.forEach((sec: any) => {
                    // Identify sections related to goals strictly per form to avoid overwriting wrong sections (like Section E in SPED tracker)
                    const isMultiGoal = formType === 'multidisciplinary-tracker' && sec.id === 'section_e';
                    const isSpedGoal = formType === 'sped-tracker' && sec.id === 'section_h';
                    const isTitleMatch = sec.title?.toLowerCase().includes('goal achievement');
                    
                    const isGoalSection = isMultiGoal || isSpedGoal || isTitleMatch;
                    
                    if (isGoalSection) {
                        const goals = activeIepData.section5_ltg.map((goal: any, idx: number) => {
                            // Strip boilerplate "By the end of the IEP period, [Name] will " text to make it concise
                            let shortGoal = goal.goal || "";
                            shortGoal = shortGoal.replace(/^By the end of (the )?(IEP |reporting )?period, .*? will /gi, '');
                            // Capitalize first letter
                            if (shortGoal) {
                                shortGoal = shortGoal.charAt(0).toUpperCase() + shortGoal.slice(1);
                            }
                            
                            const domainLabel = goal.domain ? ` (${goal.domain})` : "";
                            const goalIdLabel = goal.id || `Goal ${idx + 1}`;

                            return {
                                goal_id: goalIdLabel,
                                domain: goal.domain || "",
                                label: `${goalIdLabel}${domainLabel}`,
                                goal_text: shortGoal,
                            };
                        });

                        const dynamicFields: any[] = [{
                            id: 'goal_achievement',
                            label: 'IEP Goal Achievement Ratings',
                            type: 'goal_rating_group',
                            goals,
                        }];
                        
                        // Preserve the comments/statement fields at the end if they exist
                        const commentsField = sec.fields?.find((f: any) => f.id === 'gas_comments' || f.id === 'parent_goal_statement');
                        // Always provide a comments generic field if none exists, else preserve the schema's with a simplified label
                        if (commentsField) {
                            dynamicFields.push({
                                ...commentsField,
                                label: "Comments"
                            });
                        } else {
                            dynamicFields.push({
                                id: 'goal_comments',
                                label: 'Comments',
                                type: 'textarea'
                            });
                        }
                        
                        // Modify section title to indicate these are IEP goals, preserving "SECTION X"
                        const prefixMatch = sec.title?.match(/^(SECTION [A-Z])\s*—/i);
                        const prefix = prefixMatch ? `${prefixMatch[1]} — ` : "";
                        sec.title = `${prefix}GOAL ACHIEVEMENT (from IEP)`;
                        sec.fields = dynamicFields;
                    }
                });
            }

            // Apply ownership-driven schema transforms (e.g. split section_f
            // into section_f1/F2 for the multidisciplinary assessment).
            const renderSchema = transformSchema(formType, finalSchema);

            if (!isMounted) return;
            setSchema(renderSchema);

            // Initialize form data based on the original schema's data shape
            // (transformed sections collapse back to their __dataSection key).
            const dataSchema = finalSchema;
            const initialData: any = {};
            dataSchema.sections?.forEach((sec: any) => {
                initialData[sec.id] = {};
                sec.fields?.forEach((f: any) => {
                    if (f.type === "checkbox_group") {
                        initialData[sec.id][f.id] = [];
                    } else if (f.type === "goal_rating_group") {
                        initialData[sec.id][f.id] = [];
                    } else if (f.type === "grid") {
                        initialData[sec.id][f.id] = {};
                    } else {
                        initialData[sec.id][f.id] = "";
                    }
                });
            });

            const mergedData = { ...initialData };

            if (isViewMode && formIdStr) {
                // If viewing a previous submission
                try {
                    const res = await api.get(`/api/inputs/${formType}/${formIdStr}/`);
                    setFullSubmission(res.data);
                    const savedData = res.data.form_data?.v2 || res.data.form_data || {};
                    
                    // Detect if savedData is from older flat structure
                    const isFlat = !Object.keys(savedData).some(k => k.startsWith("section_"));
                    if (isFlat) {
                        finalSchema.sections?.forEach((sec: any) => {
                            sec.fields?.forEach((f: any) => {
                                if (savedData[f.id] !== undefined) {
                                    mergedData[sec.id][f.id] = savedData[f.id];
                                }
                            });
                        });
                    } else {
                        Object.keys(savedData).forEach(secKey => {
                            if (mergedData[secKey]) {
                                mergedData[secKey] = { ...mergedData[secKey], ...savedData[secKey] };
                            }
                        });
                    }
                } catch (err) {
                    console.error("Failed to load submission:", err);
                    setErrorMsg("Failed to load the form submission.");
                }
            } else {
                // Try to load auto-saved draft
                try {
                    const draftKey = `draft_${formType}_${studentId}`;
                    const saved = localStorage.getItem(draftKey);
                    if (saved) {
                        const parsedData = JSON.parse(saved);
                        Object.keys(parsedData).forEach(secKey => {
                            if (mergedData[secKey]) {
                                mergedData[secKey] = { ...mergedData[secKey], ...parsedData[secKey] };
                            }
                        });
                    }
                } catch (err) {
                    console.error("Failed to load draft:", err);
                }
            }

            // Auto-detect report cycle and fill section_a fields if NOT viewing a historical submission
            if (!isViewMode && profileData && mergedData.section_a) {
                const newSectionA = { ...mergedData.section_a };
                const sName = `${profileData.student.first_name} ${profileData.student.last_name}`;
                if ('student_name' in newSectionA) newSectionA.student_name = sName;
                if ('child_name' in newSectionA) newSectionA.child_name = sName;
                if ('date_of_birth' in newSectionA && profileData.student.date_of_birth) {
                    newSectionA.date_of_birth = profileData.student.date_of_birth;
                }
                if ('grade_level' in newSectionA && profileData.student.grade) {
                    newSectionA.grade_level = profileData.student.grade;
                }
                if ('class_level' in newSectionA && profileData.student.grade) {
                    newSectionA.class_level = profileData.student.grade;
                }
                if ('sped_teacher' in newSectionA && user) {
                    const teacherName = [user.first_name, user.last_name].filter(Boolean).join(" ");
                    newSectionA.sped_teacher = teacherName || user.username || "";
                }
                if ('therapist_name' in newSectionA && user) {
                    const therapistName = [user.first_name, user.last_name].filter(Boolean).join(" ");
                    newSectionA.therapist_name = therapistName || user.username || "";
                }
                if ('discipline' in newSectionA) {
                    const existing = newSectionA.discipline;
                    if (typeof existing === "string") {
                        newSectionA.discipline = existing ? [existing] : [];
                    } else if (!Array.isArray(existing)) {
                        newSectionA.discipline = [];
                    }
                    if (newSectionA.discipline.length === 0 && userSpecialties.length > 0) {
                        newSectionA.discipline = [...userSpecialties];
                    }
                }
                if ('date_of_assessment' in newSectionA) {
                    newSectionA.date_of_assessment = new Date().toISOString().split('T')[0];
                }
                if ('date' in newSectionA) {
                    newSectionA.date = new Date().toISOString().split('T')[0];
                }
                mergedData.section_a = newSectionA;
            }

            // Cross-Form Data Merger (Auto-fill from Parent Assessment)
            if (!isViewMode) {
                try {
                    const parentRes = await api.get('/api/inputs/parent-assessment/');
                    // Find latest submission for this student
                    const pForm = parentRes.data.find((f: any) => parseInt(f.student) === parseInt(studentId || "0"));
                    if (pForm) {
                        const pData = pForm.form_data?.v2 || pForm.form_data;
                        if (pData) {
                            const hasPrimaryLanguage = finalSchema.sections.some((s: any) => s.fields?.some((f: any) => f.id === 'primary_language'));
                            if (hasPrimaryLanguage) {
                                const langSec = finalSchema.sections.find((s: any) => s.fields?.some((f: any) => f.id === 'primary_language'));
                                if (langSec && (!mergedData[langSec.id] || !mergedData[langSec.id]['primary_language'])) {
                                    const langs = Array.isArray(pData.primary_language) 
                                        ? pData.primary_language 
                                        : (pData.primary_language ? [pData.primary_language] : []);
                                    const otherLang = pData.primary_language_other;
                                    const langStr = [...langs, otherLang].filter(Boolean).join(", ");
                                    if (langStr) {
                                        if (!mergedData[langSec.id]) mergedData[langSec.id] = {};
                                        mergedData[langSec.id]['primary_language'] = langStr;
                                    }
                                }
                            }
                            
                            // Map additional fields here in the future if overlapping schemas are added
                        }
                    }
                } catch (err) {
                    console.log("Could not auto-fill cross-form data from parent assessment", err);
                }
            }

            setFormData(mergedData);
        };

        loadForm();
        
        return () => { isMounted = false; };
    }, [draftKey, formIdStr, formType, isViewMode, studentId, user, userSpecialties]);

    useEffect(() => {
        if (isViewMode && fullSubmission && schema) {
            const sourceData = (isTranslated && fullSubmission.translated_data) ? fullSubmission.translated_data : fullSubmission.form_data;
            const savedData = sourceData?.v2 || sourceData || {};
            
            // Re-run the merge logic for view mode
            const initialData: any = {};
            schema.sections?.forEach((sec: any) => {
                initialData[sec.id] = {};
                sec.fields?.forEach((f: any) => {
                    if (f.type === "checkbox_group") {
                        initialData[sec.id][f.id] = [];
                    } else if (f.type === "grid") {
                        initialData[sec.id][f.id] = {};
                    } else {
                        initialData[sec.id][f.id] = "";
                    }
                });
            });

            const mergedData = { ...initialData };
            const isFlat = !Object.keys(savedData).some(k => k.startsWith("section_"));
            if (isFlat) {
                schema.sections?.forEach((sec: any) => {
                    sec.fields?.forEach((f: any) => {
                        if (savedData[f.id] !== undefined) {
                            mergedData[sec.id][f.id] = savedData[f.id];
                        }
                    });
                });
            } else {
                Object.keys(savedData).forEach(secKey => {
                    if (mergedData[secKey]) {
                        mergedData[secKey] = { ...mergedData[secKey], ...savedData[secKey] };
                    }
                });
            }
            setFormData(mergedData);
        }
    }, [isTranslated, fullSubmission, schema, isViewMode]);

    // Auto-save effect
    useEffect(() => {
        if (isViewMode) return; // Do not auto-save if merely viewing an old submission
        if (!formData || Object.keys(formData).length === 0 || !studentId || !formType) return;
        
        // Use a timeout to debounce the saving slightly
        const timeoutId = setTimeout(() => {
            try {
                localStorage.setItem(draftKey, JSON.stringify(formData));
            } catch (err) {
                console.error("Failed to auto-save draft:", err);
            }
        }, 1000); // 1s debounce

        return () => clearTimeout(timeoutId);
    }, [draftKey, formData, formType, isViewMode, studentId]);

    const handleChange = (sectionId: string, fieldId: string, value: any, isCheckboxArray = false) => {
        if (!isFieldEditable(sectionId, fieldId)) return;
        setFormData((prev: any) => {
            const currentSection = prev[sectionId] || {};
            if (isCheckboxArray) {
                const currentArr = currentSection[fieldId] || [];
                const newArr = currentArr.includes(value)
                    ? currentArr.filter((item: string) => item !== value)
                    : [...currentArr, value];
                return { ...prev, [sectionId]: { ...currentSection, [fieldId]: newArr } };
            }
            return { ...prev, [sectionId]: { ...currentSection, [fieldId]: value } };
        });
    };

    const handleGridChange = (sectionId: string, fieldId: string, rowKey: string, value: any) => {
        if (!isFieldEditable(sectionId, fieldId)) return;
        setFormData((prev: any) => {
            const currentSection = prev[sectionId] || {};
            const currentGrid = currentSection[fieldId] || {};
            return {
                ...prev,
                [sectionId]: {
                    ...currentSection,
                    [fieldId]: { ...currentGrid, [rowKey]: value }
                }
            };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccessMsg("");
        setErrorMsg("");

        if (!schema) {
            setErrorMsg("Invalid form schema.");
            setLoading(false);
            return;
        }

        try {
            await api.post(`/api/inputs/${formType}/`, {
                student: parseInt(studentId || "0"),
                report_cycle: parseInt(reportCycleId),
                form_data: formData
            });
            
            // Clear draft upon successful submission
            try {
                localStorage.removeItem(draftKey);
            } catch (e) {
                console.error("Failed to clear draft:", e);
            }

            const message = `${schema.title || "Form"} submitted successfully.`;
            setSuccessMsg(message);
            await propOnSubmitted?.(message);
            if (propHideNavigation) {
                setLoading(false);
                return;
            }
            const workspaceUrl = getWorkspaceFormUrl(studentId || "", formType);
            setTimeout(() => router.replace(workspaceUrl || "/dashboard"), 1500);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Failed to submit form. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    if (!studentId) return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Missing student context. Return to dashboard.</div>;
    if (!schema) return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Loading form…</div>;

    return (
        <ProtectedRoute>
            <div style={{ maxWidth: "1024px", margin: "0 auto", padding: "2rem 1rem 3rem" }}>
                {/* Breadcrumb Nav */}
                {studentProfile && !propHideNavigation && (
                    <div className="hidden md:flex" style={{ 
                        marginBottom: "2rem", 
                        justifyContent: "space-between", 
                        alignItems: "center", 
                        background: "white", 
                        padding: "12px 20px", 
                        borderRadius: "12px", 
                        border: "1px solid var(--border-light)", 
                        boxShadow: "0 1px 3px rgba(0,0,0,0.02)" 
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <button type="button" onClick={() => router.back()}
                                style={{ 
                                    background: "#f8fafc", 
                                    border: "1px solid #e2e8f0", 
                                    padding: "6px 12px", 
                                    borderRadius: "6px", 
                                    cursor: "pointer", 
                                    display: "inline-flex", 
                                    alignItems: "center", 
                                    gap: "6px", 
                                    color: "#475569", 
                                    fontWeight: 600, 
                                    fontSize: "0.85rem", 
                                    transition: "all 0.2s" 
                                }}
                                className="hover:bg-slate-200"
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
                                {studentProfile.student.first_name} {studentProfile.student.last_name}
                            </span>
                        </div>
                        
                        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ 
                                display: "inline-block", 
                                width: "8px", 
                                height: "8px", 
                                borderRadius: "50%", 
                                background: studentProfile.student.status === "Enrolled" ? "#22c55e" : "#f59e0b",
                                boxShadow: `0 0 0 2px ${studentProfile.student.status === "Enrolled" ? "#dcfce7" : "#fef3c7"}`
                            }}></span>
                            Status: {studentProfile.student.status}
                        </div>
                    </div>
                )}
                {/* Header */}
                <div className="flex flex-col items-start gap-4 mb-6 w-full">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 m-0 flex flex-wrap items-baseline gap-2 leading-tight">
                            {schema.title}
                        </h1>
                        <p className="text-sm text-slate-500 mt-1 mb-0 leading-relaxed">Fill out each section below.</p>
                    </div>
                    {isViewMode && hasTranslation && (
                        <div className="flex gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                            <button
                                type="button"
                                onClick={() => setIsTranslated(false)}
                                className={`px-3 py-1.5 rounded-md text-sm transition-all duration-200 ${!isTranslated ? "font-bold text-slate-900 bg-white shadow-sm" : "font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
                            >
                                Original
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsTranslated(true)}
                                className={`px-3 py-1.5 rounded-md text-sm transition-all duration-200 ${isTranslated ? "font-bold text-indigo-600 bg-white shadow-sm" : "font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
                            >
                                English (AI) ✨
                            </button>
                        </div>
                    )}
                </div>

                {/* Alerts */}
                {successMsg && (
                    <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#d1fae5", color: "#065f46", border: "1px solid #a7f3d0", marginBottom: "1rem", fontWeight: 600 }}>
                        ✓ {successMsg}
                    </div>
                )}
                {errorMsg && (
                    <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", marginBottom: "1rem" }}>
                        {errorMsg}
                    </div>
                )}

                {/* Previous Recommendations Banner (for Trackers) */}
                {formType.includes('tracker') && studentProfile?.previous_recommendations && (
                    <div style={{ 
                        background: "#fffbeb", 
                        borderRadius: "14px", 
                        padding: "1.5rem", 
                        border: "1px solid #fde68a", 
                        marginBottom: "2rem",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                            <div style={{ background: "#fef3c7", padding: "8px", borderRadius: "8px", color: "#92400e" }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                            </div>
                            <div>
                                <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#92400e", margin: 0 }}>
                                    Context: Carried Forward from {studentProfile.previous_recommendations.report_period}
                                </h3>
                                <p style={{ fontSize: "0.8rem", color: "#b45309", margin: "2px 0 0" }}>
                                    Use these previous focus areas to guide your monthly progress evaluation.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {studentProfile.previous_recommendations.focus_areas?.length > 0 && (
                                <div>
                                    <h4 style={{ fontSize: "0.75rem", fontWeight: 800, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                                        🎯 Last Month's Focus Areas
                                    </h4>
                                    <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem", color: "#b45309", display: "flex", flexDirection: "column", gap: "4px" }}>
                                        {studentProfile.previous_recommendations.focus_areas.map((f: string, i: number) => <li key={i}>{f}</li>)}
                                    </ul>
                                </div>
                            )}
                            {studentProfile.previous_recommendations.recommendations?.length > 0 && (
                                <div>
                                    <h4 style={{ fontSize: "0.75rem", fontWeight: 800, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                                        📋 Active Recommendations
                                    </h4>
                                    <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem", color: "#b45309", display: "flex", flexDirection: "column", gap: "4px" }}>
                                        {studentProfile.previous_recommendations.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Section-gating banner */}
                {!isViewMode && !isAdmin && (formType === "multidisciplinary-assessment" || formType === "multidisciplinary-tracker") && (
                    <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#eef2ff", color: "#3730a3", border: "1px solid #c7d2fe", marginBottom: "1rem", fontSize: "0.875rem" }}>
                        {userSpecialties.length > 0 ? (
                            <>You can edit shared sections and your assigned discipline area{userSpecialties.length > 1 ? "s" : ""}: <strong>{userSpecialties.map(s => specialtyShortLabel(s)).join(", ")}</strong>. Other sections are read-only.</>
                        ) : (
                            <>No specialty assigned to your account — you can only edit shared sections.</>
                        )}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <fieldset disabled={isViewMode} style={{ border: "none", padding: 0, margin: 0 }}>
                        {/* Dynamic sections from schema */}
                        {schema.sections?.map((section: any) => {
                            const dataKey = dataKeyFor(section);
                            const sectionOwner = getSectionOwner(formType, section.id);
                            const sectionFullyEditable = isAdmin
                                || sectionOwner === null
                                || sectionOwner === SHARED
                                || (sectionOwner !== "MIXED" && userSpecialties.includes(sectionOwner));
                            const ownerLabel: string | null =
                                !sectionOwner ? null
                                : sectionOwner === SHARED ? "Shared"
                                : sectionOwner === "MIXED" ? "Per-field"
                                : specialtyShortLabel(sectionOwner);
                            return (
                            <SectionCard key={section.id} title={section.title}>
                                {ownerLabel && !isViewMode && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "-4px", marginBottom: "4px" }}>
                                        <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "3px 8px", background: "#eef2ff", color: "#4338ca", borderRadius: "999px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                                            {ownerLabel}
                                        </span>
                                        {!sectionFullyEditable && sectionOwner !== "MIXED" && (
                                            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                                Read-only — owned by another discipline
                                            </span>
                                        )}
                                    </div>
                                )}
                                {section.fields?.map((field: any) => {
                                    const currentValue = formData[dataKey]?.[field.id];
                                    const currentSectionData = formData[dataKey] || {};
                                    const fieldReadOnly = !isViewMode && !isFieldEditable(section.id, field.id);

                                    return (
                                        <div key={field.id}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                                                <FieldLabel label={field.label} />
                                                {field.description && (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleDescription(field.id)}
                                                        style={{
                                                            background: "none", border: "none", padding: "2px 6px",
                                                            fontSize: "var(--form-small-font-size)", color: "#6366f1", fontWeight: 600,
                                                            cursor: "pointer", borderRadius: "4px",
                                                            textDecoration: "underline"
                                                        }}
                                                    >
                                                        {showDescriptions[field.id] ? "Hide details" : "Show details"}
                                                    </button>
                                                )}
                                            </div>

                                            {field.description && showDescriptions[field.id] && (
                                                <p style={{ fontSize: "var(--form-helper-font-size)", color: "#475569", marginBottom: "12px", marginTop: "0", lineHeight: "var(--form-line-height)" }}>
                                                    {field.description}
                                                </p>
                                            )}

                                            {field.type === "goal_rating_group" && (
                                                <GoalAchievementInput
                                                    goals={field.goals || []}
                                                    value={currentValue || []}
                                                    sectionData={currentSectionData}
                                                    readOnly={fieldReadOnly}
                                                    notePlaceholderPrefix={goalNotePlaceholderPrefix}
                                                    onChange={v => handleChange(dataKey, field.id, v)}
                                                />
                                            )}

                                            {(field.type === "text" || field.type === "number" || field.type === "date") && (
                                                <TextInput type={field.type} value={currentValue || ""} min={field.min} max={field.max} readOnly={fieldReadOnly} onChange={v => handleChange(dataKey, field.id, v)} />
                                            )}

                                            {field.type === "textarea" && (
                                                <TextAreaInput value={currentValue || ""} readOnly={fieldReadOnly} onChange={v => handleChange(dataKey, field.id, v)} />
                                            )}

                                            {field.type === "radio" && (
                                                <RadioGroup options={field.options || []} value={currentValue || ""} readOnly={fieldReadOnly} onChange={v => handleChange(dataKey, field.id, v)} />
                                            )}

                                            {field.type === "checkbox_group" && (
                                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                                    {field.options?.map((opt: string) => (
                                                        <CheckboxItem key={opt} label={opt}
                                                            checked={(currentValue || []).includes(opt)}
                                                            readOnly={fieldReadOnly}
                                                            onChange={() => handleChange(dataKey, field.id, opt, true)} />
                                                    ))}
                                                </div>
                                            )}

                                            {field.type === "grid" && (
                                                <div style={{ overflowX: "auto" }}>
                                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--form-helper-font-size)", lineHeight: "var(--form-line-height)" }}>
                                                        <thead>
                                                            <tr>
                                                                <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, color: "#475569" }}>Skill / Item</th>
                                                                {field.columns?.map((col: string) => (
                                                                    <th key={col} style={{ padding: "10px 12px", textAlign: "center", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, color: "#475569" }}>{col}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {field.rows?.map((row: string) => (
                                                                <tr key={row} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                                    <td style={{ padding: "10px 12px", color: "#0f172a", fontWeight: 500 }}>{row}</td>
                                                                    {field.columns?.map((col: string) => (
                                                                        <td key={col} style={{ padding: "10px 12px", textAlign: "center" }}>
                                                                            <input
                                                                                type="radio"
                                                                                name={`${field.id}_${row}`}
                                                                                checked={(currentValue && currentValue[row]) === col}
                                                                                onChange={() => handleGridChange(dataKey, field.id, row, col)}
                                                                                disabled={fieldReadOnly}
                                                                                style={{ width: 16, height: 16, accentColor: "#4f46e5", cursor: fieldReadOnly ? "not-allowed" : "pointer" }}
                                                                            />
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </SectionCard>
                            );
                        })}
                    </fieldset>

                    {/* Submit */}
                    {!isViewMode && (
                        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                            <button type="button" onClick={() => router.push("/dashboard")}
                                style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", color: "#475569", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" }}>
                                Cancel
                            </button>
                            <button type="submit" disabled={loading}
                                style={{ padding: "10px 24px", borderRadius: "8px", border: "none", background: loading ? "#a5b4fc" : "#4f46e5", color: "white", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>
                                {loading ? "Submitting…" : "Submit Form"}
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </ProtectedRoute>
    );
}

export default function FormEntryPage() {
    return (
        <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>Loading form…</div>}>
            <FormEntryContent />
        </Suspense>
    );
}
