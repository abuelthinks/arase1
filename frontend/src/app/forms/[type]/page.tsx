"use client";

import { useState, useEffect, Suspense, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { extractApiError } from "@/lib/toast-utils";
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
import { isSpecialistOnboardingIncomplete, specialistOnboardingMessage } from "@/lib/specialist-onboarding";
import { useFormCollaboration } from "@/hooks/useFormCollaboration";
import { semanticToneClass, type SemanticTone } from "@/lib/role-colors";

const formBannerClass = (tone: SemanticTone) =>
    `rounded-md border p-3 flex items-center justify-between gap-3 ${semanticToneClass(tone)}`;

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

function getAssignedSpecialtiesForUser(profileData: any, currentUser: any, userSpecialties: string[]): string[] {
    const currentUserId = currentUser?.user_id ?? currentUser?.id;
    if (!profileData?.assigned_staff || !currentUserId) return [];

    const assignedStaff = profileData.assigned_staff.find(
        (staff: any) => String(staff.id) === String(currentUserId),
    );
    if (!assignedStaff) return [];

    const assignedSpecialties = userSpecialtyList(assignedStaff.specialties, assignedStaff.specialty);
    return assignedSpecialties.filter((specialty) => userSpecialties.includes(specialty));
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

const ASSESSMENT_SECTION_API_KEYS: Record<string, string> = {
    section_a: "A",
    section_b: "B",
    section_c: "C",
    section_d: "D",
    section_e: "E",
    section_f1: "F1",
    section_f2: "F2",
    section_g: "G",
};

function buildInitialFormData(schema: any) {
    const initialData: any = {};
    schema.sections?.forEach((sec: any) => {
        const dataKey = sec.__dataSection || sec.id;
        if (!initialData[dataKey]) {
            initialData[dataKey] = {};
        }
        sec.fields?.forEach((field: any) => {
            if (field.type === "checkbox_group") {
                initialData[dataKey][field.id] = [];
            } else if (field.type === "goal_rating_group") {
                initialData[dataKey][field.id] = [];
            } else if (field.type === "grid") {
                initialData[dataKey][field.id] = {};
            } else {
                initialData[dataKey][field.id] = "";
            }
        });
    });
    return initialData;
}

function mergeSavedFormData(baseData: any, schema: any, rawSavedData: any) {
    const savedData = rawSavedData?.v2 || rawSavedData || {};
    const next = { ...baseData };
    const isFlat = !Object.keys(savedData).some(key => key.startsWith("section_"));

    if (isFlat) {
        schema.sections?.forEach((sec: any) => {
            const dataKey = sec.__dataSection || sec.id;
            sec.fields?.forEach((field: any) => {
                if (savedData[field.id] !== undefined) {
                    next[dataKey] = {
                        ...(next[dataKey] || {}),
                        [field.id]: savedData[field.id],
                    };
                }
            });
        });
        return next;
    }

    Object.keys(savedData).forEach(secKey => {
        if (next[secKey]) {
            next[secKey] = { ...next[secKey], ...savedData[secKey] };
        }
    });
    return next;
}

/* ─── Shared UI Components ─────────────────────────────────────────────────── */

function SectionCard({ title, children, isMySection }: { title: string; children: React.ReactNode; isMySection?: boolean }) {
    return (
        <div style={{
            background: "white", borderRadius: "12px", overflow: "hidden", marginBottom: "1.25rem",
            border: isMySection ? "2px solid #818cf8" : "1px solid #e2e8f0",
            boxShadow: isMySection ? "0 0 0 2px rgba(238, 242, 255, 0.5)" : "none",
            transition: "all 0.2s"
        }} className={isMySection ? "" : "bg-white rounded-xl"}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", background: isMySection ? "#eef2ff" : "#f8fafc" }}>
                <h2 style={{ fontSize: "var(--form-section-title-size)", lineHeight: 1.35 }} className="font-bold text-slate-900 m-0">{title}</h2>
            </div>
            <div className="p-4 sm:p-6 flex flex-col gap-4">
                {children}
            </div>
        </div>
    );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
    return (
        <p style={{ fontSize: "var(--form-field-label-size)", lineHeight: "var(--form-line-height)", fontWeight: 650, color: "#334155", marginBottom: "6px" }}>
            {label}
            {required && <span style={{ color: "#ef4444", marginLeft: "4px" }}>*</span>}
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

const normalizeList = (value: any): string[] => {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    return value ? [String(value)] : [];
};

const buildParentSummaryRows = (profileData: any) => {
    const student = profileData?.student || {};
    const primaryLanguage = [
        ...normalizeList(student.primary_language),
        student.primary_language_other,
    ].filter(Boolean);
    const medicalAlerts = [
        student.medical_alerts,
        student.medical_alerts_detail,
    ].filter(Boolean);
    const knownConditions = [
        ...normalizeList(student.known_conditions),
        student.known_conditions_other,
    ].filter(Boolean);

    return [
        { label: "Child Name", value: `${student.first_name || ""} ${student.last_name || ""}`.trim() },
        { label: "Date of Birth", value: student.date_of_birth || "" },
        { label: "Gender", value: student.gender || "" },
        { label: "Grade/Level", value: student.grade || "" },
        { label: "Primary Language", value: primaryLanguage.join(", ") },
        { label: "Medical Alerts", value: medicalAlerts.join(" - ") },
        { label: "Known Diagnoses", value: knownConditions.join(", ") },
    ];
};

function ReadOnlyParentSummary({ rows }: { rows: { label: string; value: string }[] }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
            {rows.map(row => (
                <div key={row.label} style={{ padding: "9px 11px", background: "#f8fafc", borderRadius: "7px", border: "1px solid #e2e8f0" }}>
                    <p style={{ fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", color: "#64748b", margin: "0 0 3px", letterSpacing: "0.3px" }}>
                        {row.label}
                    </p>
                    <p style={{ fontSize: "var(--form-control-font-size)", color: "#0f172a", margin: 0, fontWeight: 500, lineHeight: 1.35 }}>
                        {row.value || "-"}
                    </p>
                </div>
            ))}
        </div>
    );
}

const GAS_OPTIONS = [
    { score: 1, label: "None", tone: "#fee2e2", color: "#991b1b" },
    { score: 2, label: "Minimal", tone: "#fef3c7", color: "#92400e" },
    { score: 3, label: "Expected", tone: "#dbeafe", color: "#1e40af" },
    { score: 4, label: "More", tone: "#d1fae5", color: "#065f46" },
    { score: 5, label: "Achieved", tone: "#dcfce7", color: "#166534" },
];

const SUPPORT_OPTIONS = ["Independent", "Verbal prompt", "Visual prompt", "Physical support", "Full assistance"];
const OBSERVED_IN_OPTIONS = ["Classroom", "Therapy", "Home", "Group activity", "Daily routine"];
const NEXT_STEP_OPTIONS = ["Continue", "Increase support", "Reduce prompts", "Modify strategy", "Review goal"];
const CONFIDENCE_OPTIONS = ["Confident", "Somewhat sure", "Not enough observation"];

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

function CompactSelect({ label, value, options, onChange, readOnly }: { label: string; value: string; options: string[]; onChange: (v: string) => void; readOnly?: boolean }) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
            <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                {label}
            </span>
            <select
                value={value || ""}
                disabled={readOnly}
                onChange={e => onChange(e.target.value)}
                style={{
                    width: "100%",
                    borderRadius: "7px",
                    border: "1px solid #cbd5e1",
                    background: readOnly ? "#f1f5f9" : "white",
                    color: value ? "#0f172a" : "#94a3b8",
                    cursor: readOnly ? "not-allowed" : "pointer",
                    fontSize: "0.78rem",
                    lineHeight: 1.35,
                    padding: "7px 8px",
                    minHeight: "34px",
                }}
            >
                <option value="">Select</option>
                {options.map(option => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        </label>
    );
}

function GoalAchievementInput({ goals, value, sectionData, onChange, readOnly }: { goals: any[]; value: any; sectionData: any; onChange: (v: any[]) => void; readOnly?: boolean }) {
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
            support_level: existing.support_level || "",
            observed_in: existing.observed_in || "",
            next_step: existing.next_step || "",
            confidence: existing.confidence || "",
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
            {normalized.map(goal => {
                const goalScore = typeof goal.score === "number" ? goal.score : scoreNumberFrom(goal.score);
                const attention =
                    goal.next_step === "Review goal"
                        ? { label: "Review goal", bg: "#fef3c7", color: "#92400e" }
                        : goalScore && goalScore <= 2
                            ? { label: "Needs attention", bg: "#fee2e2", color: "#991b1b" }
                            : goalScore === 5
                                ? { label: "Achieved", bg: "#dcfce7", color: "#166534" }
                                : null;

                return (
                <div key={goal.goal_id} style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px", background: "#f8fafc" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "3px" }}>
                                <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 800, color: "#172554" }}>
                                    {goal.goal_id}{goal.domain ? ` (${goal.domain})` : ""}
                                </p>
                                {attention && (
                                    <span style={{ padding: "2px 7px", borderRadius: "999px", background: attention.bg, color: attention.color, fontSize: "0.68rem", fontWeight: 800 }}>
                                        {attention.label}
                                    </span>
                                )}
                            </div>
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
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", marginBottom: "8px" }}>
                        <CompactSelect
                            label="Support"
                            value={goal.support_level}
                            options={SUPPORT_OPTIONS}
                            readOnly={readOnly}
                            onChange={support_level => updateGoal(goal.goal_id, { support_level })}
                        />
                        <CompactSelect
                            label="Observed In"
                            value={goal.observed_in}
                            options={OBSERVED_IN_OPTIONS}
                            readOnly={readOnly}
                            onChange={observed_in => updateGoal(goal.goal_id, { observed_in })}
                        />
                        <CompactSelect
                            label="Next Step"
                            value={goal.next_step}
                            options={NEXT_STEP_OPTIONS}
                            readOnly={readOnly}
                            onChange={next_step => updateGoal(goal.goal_id, { next_step })}
                        />
                        <CompactSelect
                            label="Confidence"
                            value={goal.confidence}
                            options={CONFIDENCE_OPTIONS}
                            readOnly={readOnly}
                            onChange={confidence => updateGoal(goal.goal_id, { confidence })}
                        />
                    </div>
                    <TextAreaInput
                        value={goal.note}
                        rows={1}
                        placeholder="Additional notes"
                        readOnly={readOnly}
                        autoGrow
                        onChange={note => updateGoal(goal.goal_id, { note })}
                    />
                </div>
            );
            })}
        </div>
    );
}

function isFieldRequired(formType: string, field: any): boolean {
    if (formType !== "parent-assessment") return false;
    return field.type !== "text" && field.type !== "textarea" && field.type !== "readonly_parent_summary";
}

function isFieldEmpty(field: any, val: any): boolean {
    if (field.type === "checkbox_group") {
        return !Array.isArray(val) || val.length === 0;
    }
    if (field.type === "grid") {
        if (!val || typeof val !== "object") return true;
        const rowKeys = field.rows || [];
        return rowKeys.some((row: string) => !val[row]);
    }
    return !val || String(val).trim() === "";
}

export function FormEntryContent({ propType, propStudentId, propSubmissionId, propMode, propHideNavigation, propOnSubmitted }: { propType?: string, propStudentId?: string, propSubmissionId?: string, propMode?: string, propHideNavigation?: boolean, propOnSubmitted?: (message: string) => void | Promise<void> } = {}) {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAuth();

    const formType = propType || (params?.type as string) || "unknown";
    const studentId = propStudentId || searchParams.get("studentId");
    const isTeamScopedForm = formType === "multidisciplinary-assessment" || formType === "multidisciplinary-tracker";
    const isSectionScopedAssessment = formType === "multidisciplinary-assessment";

    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [reportCycleId, setReportCycleId] = useState("");
    const [schema, setSchema] = useState<any>(null);
    const [formData, setFormData] = useState<any>({});
    const [studentProfile, setStudentProfile] = useState<any>(null);
    const [showDescriptions, setShowDescriptions] = useState<Record<string, boolean>>({});
    const [sectionContributions, setSectionContributions] = useState<Record<string, any>>({});
    const [pendingSectionSaves, setPendingSectionSaves] = useState<Record<string, number>>({});
    const [submittingOwnedSections, setSubmittingOwnedSections] = useState(false);
    const [teamSubmission, setTeamSubmission] = useState<any>(null);
    const [isReopening, setIsReopening] = useState<string | null>(null);
    const [attemptedSubmit, setAttemptedSubmit] = useState(false);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        actionText: string;
        actionVariant: "danger" | "primary" | "warning";
        onConfirm: () => void;
    } | null>(null);

    const invalidFields = useMemo(() => {
        if (formType !== "parent-assessment") return new Set<string>();
        const invalidSet = new Set<string>();
        if (!schema?.sections) return invalidSet;

        for (const section of schema.sections) {
            const dataKey = section.__dataSection || section.id;
            if (!section.fields) continue;
            for (const field of section.fields) {
                if (isFieldRequired(formType, field)) {
                    const currentValue = formData[dataKey]?.[field.id];
                    if (isFieldEmpty(field, currentValue)) {
                        invalidSet.add(`${dataKey}_${field.id}`);
                    }
                }
            }
        }
        return invalidSet;
    }, [formType, schema, formData]);

    // Last-known server values per (sectionId, fieldId). Used by the peer
    // merge logic to detect which local fields the user has edited since the
    // last sync (those stay; clean fields get peer changes merged in).
    const serverSnapshot = useRef<Record<string, Record<string, any>>>({});

    const toggleDescription = (fieldId: string) => {
        setShowDescriptions(prev => ({ ...prev, [fieldId]: !prev[fieldId] }));
    };

    const isViewMode = propMode === "view" || searchParams.get("mode") === "view";
    const formIdStr = propSubmissionId || searchParams.get("submissionId") || searchParams.get("formId");

    useEffect(() => {
        if (!propHideNavigation || !successMsg) return;
        const timeoutId = setTimeout(() => setSuccessMsg(""), 2500);
        return () => clearTimeout(timeoutId);
    }, [propHideNavigation, successMsg]);

    const isAdmin = user?.role === "ADMIN";
    const specialistOnboardingIncomplete = isSpecialistOnboardingIncomplete(user);
    const specialistOnboardingLocked = specialistOnboardingIncomplete && ["multidisciplinary-assessment", "multidisciplinary-tracker"].includes(formType);
    const userSpecialties = useMemo(
        () => userSpecialtyList(user?.specialties, user?.specialty),
        [user?.specialties, user?.specialty],
    );
    const assignedSpecialties = useMemo(
        () => getAssignedSpecialtiesForUser(studentProfile, user, userSpecialties),
        [studentProfile, user, userSpecialties],
    );
    const editableSpecialties = isTeamScopedForm ? assignedSpecialties : userSpecialties;
    const sectionById = useMemo(() => {
        const next: Record<string, any> = {};
        schema?.sections?.forEach((section: any) => {
            next[section.id] = section;
        });
        return next;
    }, [schema]);
    const isFieldEditable = (sectionId: string, fieldId: string): boolean => {
        if (specialistOnboardingLocked) return false;
        // For the assessment form, callers may pass the underlying data
        // section_id (section_f) — translate into the virtual ABA/Dev-Psych
        // section so ownership resolves correctly.
        let resolvedSectionId = sectionId;
        if (formType === "multidisciplinary-assessment" && sectionId === "section_f") {
            resolvedSectionId = ASSESSMENT_F1_FIELDS.has(fieldId) ? "section_f1" : "section_f2";
        }
        const owner = getFieldOwner(formType, resolvedSectionId, fieldId);
        return canEditOwner(owner, editableSpecialties, isAdmin);
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

    // Reset per-student state when switching students inside the workspace
    // shell. Without this, a previous student's teamSubmission (incl. its
    // finalized_at) bleeds into the new student's view.
    useEffect(() => {
        setTeamSubmission(null);
        setFullSubmission(null);
        setFormData({});
        setSectionContributions({});
        setPendingSectionSaves({});
        serverSnapshot.current = {};
    }, [studentId, reportCycleId, formType]);

    // ─── Real-time collaboration ────────────────────────────────────────────
    const collabFormType: "assessment" | "tracker" | null =
        formType === "multidisciplinary-assessment"
            ? "assessment"
            : formType === "multidisciplinary-tracker"
                ? "tracker"
                : null;
    const collabInstanceId = !isViewMode && collabFormType ? (teamSubmission?.id ?? null) : null;

    // Full refetch — pulls latest form_data into local state. Used when the
    // user *explicitly* asks to update (e.g. clicks Update on a peer's draft).
    const refetchTeamSubmission = useCallback(async () => {
        const instanceId = teamSubmission?.id ?? collabInstanceId;
        if (!instanceId || !collabFormType) return;
        try {
            const res = await api.get(`/api/inputs/${formType}/${instanceId}/`);
            setTeamSubmission(res.data);
            if (res.data?.form_data && schema) {
                setFormData((prev: any) => mergeSavedFormData(prev, schema, res.data.form_data));
            }
        } catch (err) {
            console.debug("collab refetch failed:", err);
        }
    }, [collabFormType, collabInstanceId, formType, schema, teamSubmission?.id]);

    // Selective merge — pulls peer changes for fields the local user hasn't
    // touched since the last sync. Local dirty fields are preserved.
    const mergePeerChangesIfClean = useCallback(async (eventFormData?: any, isOwnEcho = false) => {
        console.debug('[Collab merge] called, collabInstanceId=', collabInstanceId, 'collabFormType=', collabFormType, 'isOwnEcho=', isOwnEcho);
        if (!collabInstanceId || !collabFormType) {
            console.debug('[Collab merge] bailing: no instanceId or formType');
            return;
        }
        try {
            let serverData = eventFormData;
            if (!serverData) {
                console.debug('[Collab merge] no event form_data, fetching from API');
                const res = await api.get(`/api/inputs/${formType}/${collabInstanceId}/`, { params: { _t: Date.now() } });
                setTeamSubmission(res.data);
                serverData = res.data?.form_data;
            }
            if (!serverData || !schema) {
                console.debug('[Collab merge] bailing: no serverData or schema', { serverData: !!serverData, schema: !!schema });
                return;
            }
            
            // Normalize server payload into section_k -> { fieldId: value } shape
            // (especially needed for assessments which store a flat dict under "v2")
            const normalizedServerData = mergeSavedFormData(buildInitialFormData(schema), schema, serverData);
            console.debug('[Collab merge] normalizedServerData keys:', Object.keys(normalizedServerData));
            
            // Capture a frozen snapshot BEFORE we mutate the ref, so the React 
            // updater is a pure function (fixing Strict Mode double-invocation bugs).
            const frozenSnapshot = JSON.parse(JSON.stringify(serverSnapshot.current));
            
            // Synchronously update the snapshot ref so future WS messages or
            // subsequent rapid calls have the correct baseline.
            for (const section of schema.sections || []) {
                const dataKey = section.__dataSection || section.id;
                const incoming = normalizedServerData[dataKey];
                if (incoming && typeof incoming === "object") {
                    serverSnapshot.current[dataKey] = { ...(serverSnapshot.current[dataKey] || {}), ...incoming };
                }
            }
            
            if (isOwnEcho) {
                // If it's our own echo, we just update the snapshot so our local
                // edits become "clean" again. We don't overwrite formData.
                console.debug('[Collab merge] own echo: snapshot updated, skipping setFormData');
                return;
            }
            
            setFormData((prev: any) => {
                const next: any = { ...prev };
                let mergedCount = 0;
                let skippedCount = 0;
                for (const section of schema.sections || []) {
                    const dataKey = section.__dataSection || section.id;
                    const incoming = normalizedServerData[dataKey];
                    if (!incoming || typeof incoming !== "object") continue;
                    const localSection = next[dataKey] || {};
                    const snapshotSection = frozenSnapshot[dataKey] || {};
                    const mergedSection: any = { ...localSection };
                    
                    for (const fieldId of Object.keys(incoming)) {
                        const incomingVal = incoming[fieldId];
                        const localVal = localSection[fieldId];
                        const snapshotVal = snapshotSection[fieldId];
                        
                        // Check if field is dirty (locally edited since last sync)
                        // Ignore array ordering (important for checkboxes)
                        let isDirty = false;
                        if (Array.isArray(localVal) && Array.isArray(snapshotVal)) {
                            const sortedLocal = [...localVal].sort();
                            const sortedSnap = [...snapshotVal].sort();
                            isDirty = JSON.stringify(sortedLocal) !== JSON.stringify(sortedSnap);
                        } else {
                            isDirty = JSON.stringify(localVal) !== JSON.stringify(snapshotVal);
                        }
                        
                        // Field is dirty (locally edited since last sync) if
                        // local diverges from the snapshot. Skip merge in
                        // that case — never overwrite in-progress typing.
                        if (!isDirty) {
                            mergedSection[fieldId] = incomingVal;
                            mergedCount++;
                        } else {
                            skippedCount++;
                            console.debug(`[Collab merge] skipping dirty field ${fieldId}:`, { localVal, snapshotVal, incomingVal });
                        }
                    }
                    next[dataKey] = mergedSection;
                }
                console.debug(`[Collab merge] result: ${mergedCount} fields merged, ${skippedCount} skipped (dirty)`);
                return next;
            });
        } catch (err) {
            console.debug("collab merge failed:", err);
        }
    }, [collabFormType, collabInstanceId, formType, schema]);

    const collab = useFormCollaboration({
        formType: collabFormType ?? "assessment",
        instanceId: collabFormType ? collabInstanceId : null,
        currentUserId: user?.user_id,
        onSectionSaved: (event) => {
            console.debug('[Collab] onSectionSaved fired:', { eventUserId: event.by.user_id, myUserId: user?.user_id, sectionKey: event.section_key, hasFormData: !!event.form_data });
            const isOwnEcho = event.by.user_id === user?.user_id;
            console.debug(`[Collab] calling mergePeerChangesIfClean with form_data:`, event.form_data);
            mergePeerChangesIfClean(event.form_data, isOwnEcho);
            if (collabFormType === "assessment" && reportCycleId && !isOwnEcho) {
                refreshSectionContributions(reportCycleId);
            }
        },
        onSectionSubmitted: (event) => {
            const isOwnEcho = event.by.user_id === user?.user_id;
            mergePeerChangesIfClean(undefined, isOwnEcho);
            if (collabFormType === "assessment" && reportCycleId && !isOwnEcho) {
                refreshSectionContributions(reportCycleId);
            }
        },
    });

    // Materialize the parent record on first open so the collab WebSocket has
    // an instance to connect to even before any section has been saved.
    useEffect(() => {
        if (!collabFormType || isViewMode) return;
        if (!studentId || !reportCycleId || teamSubmission?.id) return;
        const apiPath = collabFormType === "assessment"
            ? "/api/inputs/multidisciplinary-assessment/ensure/"
            : "/api/inputs/multidisciplinary-tracker/ensure/";
        api.post(apiPath, {
            student: parseInt(studentId),
            report_cycle: parseInt(reportCycleId),
        })
            .then(res => {
                if (res.data) {
                    setTeamSubmission(res.data);
                    if (res.data.form_data && schema) {
                        setFormData((prev: any) => {
                            const newMerged = mergeSavedFormData(prev, schema, res.data.form_data);
                            // Seed snapshot with initial server values so future
                            // peer merges can detect what the user has changed.
                            serverSnapshot.current = JSON.parse(JSON.stringify(newMerged));
                            return newMerged;
                        });
                    }
                }
            })
            .catch(err => console.debug("collab ensure failed:", err));
    }, [collabFormType, isViewMode, studentId, reportCycleId, teamSubmission?.id, schema]);

    const refreshSectionContributions = useCallback(async (cycleId = reportCycleId) => {
        if (!isSectionScopedAssessment || !studentId || !cycleId) return;
        try {
            const res = await api.get(`/api/inputs/multidisciplinary-assessment/contributions/`, {
                params: {
                    student: studentId,
                    report_cycle: cycleId,
                },
            });
            const next: Record<string, any> = {};
            for (const contribution of res.data || []) {
                next[contribution.section_key] = contribution;
            }
            setSectionContributions(next);
        } catch (err) {
            console.error("Failed to load section contributions:", err);
        }
    }, [isSectionScopedAssessment, reportCycleId, studentId]);

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
            let mergedData = buildInitialFormData(renderSchema);

            if (isViewMode && formIdStr) {
                // If viewing a previous submission
                try {
                    const res = await api.get(`/api/inputs/${formType}/${formIdStr}/`);
                    setFullSubmission(res.data);
                    setTeamSubmission(res.data);
                    mergedData = mergeSavedFormData(mergedData, renderSchema, res.data.form_data);
                } catch (err) {
                    console.error("Failed to load submission:", err);
                    setErrorMsg("Failed to load the form submission.");
                }
            } else {
                if (isSectionScopedAssessment && profileData?.form_statuses?.multi_assessment?.id) {
                    try {
                        const res = await api.get(`/api/inputs/${formType}/${profileData.form_statuses.multi_assessment.id}/`, {
                            params: { _t: Date.now() }
                        });
                        setTeamSubmission(res.data);
                        mergedData = mergeSavedFormData(mergedData, renderSchema, res.data.form_data);
                    } catch (err) {
                        console.error("Failed to load assessment draft:", err);
                    }
                } else if (!isSectionScopedAssessment) {
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
                if ('parent_provided_information' in newSectionA) {
                    newSectionA.parent_provided_information = buildParentSummaryRows(profileData);
                }
                if ('sped_teacher' in newSectionA && user) {
                    const teacherName = [user.first_name, user.last_name].filter(Boolean).join(" ");
                    newSectionA.sped_teacher = teacherName || user.email || "";
                }
                if ('therapist_name' in newSectionA && user) {
                    const therapistName = [user.first_name, user.last_name].filter(Boolean).join(" ");
                    newSectionA.therapist_name = therapistName || user.email || "";
                }
                if ('discipline' in newSectionA) {
                    const existing = newSectionA.discipline;
                    if (typeof existing === "string") {
                        newSectionA.discipline = existing ? [existing] : [];
                    } else if (!Array.isArray(existing)) {
                        newSectionA.discipline = [];
                    }
                    const disciplineSpecialties = isTeamScopedForm && !isAdmin
                        ? getAssignedSpecialtiesForUser(profileData, user, userSpecialties)
                        : userSpecialties;
                    if (isTeamScopedForm && !isAdmin) {
                        newSectionA.discipline = userSpecialtyList(newSectionA.discipline).filter((specialty) =>
                            disciplineSpecialties.includes(specialty),
                        );
                    }
                    if (newSectionA.discipline.length === 0 && disciplineSpecialties.length > 0) {
                        newSectionA.discipline = [...disciplineSpecialties];
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

            // Seed snapshot with initial form state (including defaults like [] or "")
            // so that peer merges correctly see these untouched fields as clean.
            serverSnapshot.current = JSON.parse(JSON.stringify(mergedData));
            setFormData(mergedData);
        };

        loadForm();
        
        return () => { isMounted = false; };
    }, [draftKey, formIdStr, formType, isAdmin, isSectionScopedAssessment, isTeamScopedForm, isViewMode, studentId, user, userSpecialties]);

    useEffect(() => {
        if (isViewMode && fullSubmission && schema) {
            const sourceData = (isTranslated && fullSubmission.translated_data) ? fullSubmission.translated_data : fullSubmission.form_data;
            const mergedData = mergeSavedFormData(buildInitialFormData(schema), schema, sourceData);
            setFormData(mergedData);
        }
    }, [isTranslated, fullSubmission, schema, isViewMode]);

    // Auto-save effect
    useEffect(() => {
        if (isViewMode) return; // Do not auto-save if merely viewing an old submission
        if (isSectionScopedAssessment) return; // Collaborative assessment drafts live on the server.
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
    }, [draftKey, formData, formType, isSectionScopedAssessment, isViewMode, studentId]);

    useEffect(() => {
        if (isViewMode || !isSectionScopedAssessment || !studentId || !reportCycleId) return;
        refreshSectionContributions(reportCycleId);
    }, [isSectionScopedAssessment, isViewMode, refreshSectionContributions, reportCycleId, studentId]);

    const queueAssessmentSectionAutosave = (sectionId: string) => {
        if (!isSectionScopedAssessment) return;
        setPendingSectionSaves(prev => ({
            ...prev,
            [sectionId]: Date.now() + Math.random(),
        }));
    };

    const handleChange = (sectionId: string, fieldId: string, value: any, isCheckboxArray = false) => {
        if (!isFieldEditable(sectionId, fieldId)) return;
        setFormData((prev: any) => {
            const currentSection = prev[sectionId] || {};
            if (isCheckboxArray) {
                const currentArr = currentSection[fieldId] || [];
                const exclusive = ["None", "Not sure", "N/A"];
                if (exclusive.includes(value)) {
                    const newArr = currentArr.includes(value) ? [] : [value];
                    return { ...prev, [sectionId]: { ...currentSection, [fieldId]: newArr } };
                }
                const tempArr = currentArr.includes(value)
                    ? currentArr.filter((item: string) => item !== value)
                    : [...currentArr, value];
                const newArr = tempArr.filter((item: string) => !exclusive.includes(item));
                return { ...prev, [sectionId]: { ...currentSection, [fieldId]: newArr } };
            }
            return { ...prev, [sectionId]: { ...currentSection, [fieldId]: value } };
        });
        let autosaveSectionId = sectionId;
        if (formType === "multidisciplinary-assessment" && sectionId === "section_f") {
            autosaveSectionId = ASSESSMENT_F1_FIELDS.has(fieldId) ? "section_f1" : "section_f2";
        }
        queueAssessmentSectionAutosave(autosaveSectionId);
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
        let autosaveSectionId = sectionId;
        if (formType === "multidisciplinary-assessment" && sectionId === "section_f") {
            autosaveSectionId = ASSESSMENT_F1_FIELDS.has(fieldId) ? "section_f1" : "section_f2";
        }
        queueAssessmentSectionAutosave(autosaveSectionId);
    };

    const sectionStates = useMemo(() => {
        if (!isSectionScopedAssessment || !schema) return {};
        const next: Record<string, any> = {};
        schema.sections?.forEach((section: any) => {
            const apiKey = ASSESSMENT_SECTION_API_KEYS[section.id];
            const contribution = apiKey ? sectionContributions[apiKey] : null;
            const sectionOwner = getSectionOwner(formType, section.id);
            const isVerificationLocked = apiKey === "A" && formData.section_a?.a2_verification === "matches";
            const isFinalized = !!teamSubmission?.finalized_at;
            const isSubmitted = contribution?.status === "submitted";

            const canEditSection = !isViewMode
                && !specialistOnboardingLocked
                && !isFinalized
                && !isVerificationLocked
                && !isSubmitted
                && canEditOwner(
                    sectionOwner === "MIXED" ? SHARED : sectionOwner,
                    editableSpecialties,
                    isAdmin,
                );

            next[section.id] = {
                apiKey,
                contribution,
                isVerificationLocked,
                isLocked: isFinalized || isSubmitted || isVerificationLocked,
                canEditSection,
            };
        });
        return next;
    }, [
        editableSpecialties,
        formData.section_a,
        formType,
        isAdmin,
        isSectionScopedAssessment,
        isViewMode,
        schema,
        sectionContributions,
        specialistOnboardingLocked,
        teamSubmission?.finalized_at,
    ]);

    const saveAssessmentSection = useCallback(async (section: any, submit = false, options: { silent?: boolean } = {}) => {
        const apiKey = ASSESSMENT_SECTION_API_KEYS[section.id];
        if (!apiKey || !studentId) return null;
        const silent = options.silent === true;
        if (specialistOnboardingLocked) {
            const message = specialistOnboardingMessage(user?.specialist_onboarding_missing);
            setErrorMsg(message);
            if (!silent) {
                toast.error(message);
            }
            return null;
        }

        if (!silent) {
            setSuccessMsg("");
            setErrorMsg("");
        }

        const dataKey = dataKeyFor(section);
        const currentSectionData = formData[dataKey] || {};
        const sectionPayload: Record<string, any> = {};
        section.fields?.forEach((field: any) => {
            sectionPayload[field.id] = currentSectionData[field.id];
        });

        try {
            const saveRes = await api.patch(`/api/inputs/multidisciplinary-assessment/sections/${apiKey}/`, {
                student: parseInt(studentId || "0"),
                report_cycle: parseInt(reportCycleId),
                section_data: sectionPayload,
            });
            setTeamSubmission(saveRes.data);
            // Mark these fields as in-sync with the server so future peer
            // merges can tell them apart from in-progress local edits.
            const snapshotSection = serverSnapshot.current[dataKey] || {};
            serverSnapshot.current[dataKey] = { ...snapshotSection, ...sectionPayload };

            if (submit) {
                const submitRes = await api.post(`/api/inputs/multidisciplinary-assessment/sections/${apiKey}/submit/`, {
                    student: parseInt(studentId || "0"),
                    report_cycle: parseInt(reportCycleId),
                });
                setTeamSubmission(submitRes.data);
                await refreshSectionContributions(reportCycleId);

                if (submitRes.data?.finalized_at) {
                    const message = `${schema.title || "Form"} finalized successfully.`;
                    setSuccessMsg(message);
                    if (!silent) {
                        toast.success(message);
                    }
                    await propOnSubmitted?.(message);
                    if (!propHideNavigation) {
                        const workspaceUrl = getWorkspaceFormUrl(studentId || "", formType);
                        setTimeout(() => router.replace(workspaceUrl || "/dashboard"), 1200);
                    }
                    return submitRes.data;
                }

                const message = `Section ${apiKey} submitted.`;
                setSuccessMsg(message);
                if (!silent) {
                    toast.success(message);
                }
                return submitRes.data;
            }

            await refreshSectionContributions(reportCycleId);
            const message = `Section ${apiKey} saved.`;
            if (!silent) {
                setSuccessMsg(message);
                toast.success(message);
            }
            return saveRes.data;
        } catch (err: any) {
            const message = extractApiError(err, "Failed to save section. Please try again.");
            setErrorMsg(message);
            if (!silent) {
                toast.error(message, { id: `save-error-${apiKey}`, duration: 7000 });
            }
            return null;
        }
    }, [
        formData,
        formType,
        propHideNavigation,
        propOnSubmitted,
        refreshSectionContributions,
        reportCycleId,
        router,
        schema,
        specialistOnboardingLocked,
        studentId,
        user?.specialist_onboarding_missing,
    ]);

    const reopenSection = async (sectionKey: string) => {
        if (!studentId || !reportCycleId) return;
        setIsReopening(sectionKey);
        try {
            const res = await api.post(`/api/inputs/multidisciplinary-assessment/sections/${sectionKey}/reopen/`, {
                student: parseInt(studentId),
                report_cycle: parseInt(reportCycleId),
            });
            toast.success(`Section ${sectionKey} reopened for editing.`);
            await refreshSectionContributions(reportCycleId);
        } catch (err: any) {
            toast.error(extractApiError(err, `Failed to reopen Section ${sectionKey}.`), {
                id: `reopen-error-${sectionKey}`,
                duration: 7000,
            });
        } finally {
            setIsReopening(null);
        }
    };

    const ownedAssessmentSections = useMemo<Array<{ section: any; owner: SectionOwner; state: any }>>(() => {
        if (!isSectionScopedAssessment || !schema) return [];
        return (schema.sections || [])
            .map((section: any) => {
                const owner = getSectionOwner(formType, section.id);
                const state = sectionStates[section.id];
                return { section, owner, state };
            })
            .filter(({ owner }: { owner: SectionOwner | "MIXED" | null }) =>
                owner && owner !== SHARED && owner !== "MIXED" && editableSpecialties.includes(owner)
            ) as Array<{ section: any; owner: SectionOwner; state: any }>;
    }, [editableSpecialties, formType, isSectionScopedAssessment, schema, sectionStates]);

    const submittableOwnedSections = useMemo(
        () => ownedAssessmentSections.filter(({ state }) => state?.canEditSection),
        [ownedAssessmentSections],
    );

    // Draft contributions the current user owns (includes both their assigned
    // sections AND shared sections where they're the latest editor).
    const myDraftContributionCount = useMemo(() => {
        if (!user?.user_id) return 0;
        return Object.values(sectionContributions || {}).filter(
            (c: any) => c?.status === "draft" && c?.specialist === user.user_id
        ).length;
    }, [sectionContributions, user?.user_id]);

    // The submit button should be active whenever the user has something to
    // submit — either an editable assigned section (filled or not) or a
    // draft contribution on any section (including shared sections they've
    // touched after submitting their assigned work).
    const hasSomethingToSubmit = submittableOwnedSections.length > 0 || myDraftContributionCount > 0;

    const flushPendingAssessmentAutosaves = useCallback(async () => {
        const pendingEntries = Object.entries(pendingSectionSaves);
        if (pendingEntries.length === 0) return true;

        for (const [sectionId, token] of pendingEntries) {
            const section = sectionById[sectionId];
            if (!section) continue;
            const saved = await saveAssessmentSection(section, false, { silent: true });
            if (!saved) {
                return false;
            }
            setPendingSectionSaves(prev => {
                if (prev[sectionId] !== token) return prev;
                const next = { ...prev };
                delete next[sectionId];
                return next;
            });
        }
        return true;
    }, [pendingSectionSaves, saveAssessmentSection, sectionById]);

    const submitOwnedAssessmentSections = useCallback(async () => {
        if (!isSectionScopedAssessment || isViewMode || isAdmin) return;
        if (specialistOnboardingLocked) {
            const message = specialistOnboardingMessage(user?.specialist_onboarding_missing);
            setErrorMsg(message);
            toast.error(message);
            return;
        }
        if (!hasSomethingToSubmit) {
            setSuccessMsg("Nothing to submit — no draft sections.");
            return;
        }
        
        setConfirmModal({
            isOpen: true,
            title: "Submit Assessment Sections?",
            message: "Are you sure you want to submit? Once all specialists submit their part, the form will be locked out and you won't be able to edit it anymore unless you request an admin to unlock it.",
            actionText: "Submit Form",
            actionVariant: "primary",
            onConfirm: async () => {
                setSubmittingOwnedSections(true);
                setSuccessMsg("");
                setErrorMsg("");
        
                try {
                    const draftsFlushed = await flushPendingAssessmentAutosaves();
                    if (!draftsFlushed) {
                        return;
                    }
        
                    // Single backend call submits every draft contribution (owned +
                    // shared sections the user has authored). Validates owned-section
                    // content + finalizes the form when all assigned sections done.
                    const res = await api.post(
                        "/api/inputs/multidisciplinary-assessment/submit-all/",
                        {
                            student: parseInt(studentId || "0"),
                            report_cycle: parseInt(reportCycleId),
                        },
                    );
                    const data = res.data || {};
                    const submitted: string[] = data.submitted || [];
                    const finalized = !!data.finalized;
                    if (data.form) {
                        setTeamSubmission(data.form);
                    }
                    await refreshSectionContributions(reportCycleId);
        
                    const message = finalized
                        ? `${schema.title || "Form"} finalized successfully.`
                        : submitted.length === 0
                            ? "Nothing to submit — no draft sections."
                            : `Submitted ${submitted.length} section${submitted.length === 1 ? "" : "s"}.`;
                    setSuccessMsg(message);
                    toast.success(message);
                    await propOnSubmitted?.(message);
        
                    if (finalized && !propHideNavigation) {
                        const workspaceUrl = getWorkspaceFormUrl(studentId || "", formType);
                        setTimeout(() => router.replace(workspaceUrl || "/dashboard"), 1200);
                    }
                } catch (err: any) {
                    const message = extractApiError(err, "Submit failed.");
                    setErrorMsg(message);
                    toast.error(message, { id: "submit-all-error", duration: 7000 });
                } finally {
                    setSubmittingOwnedSections(false);
                }
            }
        });
    }, [
        flushPendingAssessmentAutosaves,
        formType,
        hasSomethingToSubmit,
        isAdmin,
        isSectionScopedAssessment,
        isViewMode,
        propHideNavigation,
        propOnSubmitted,
        refreshSectionContributions,
        reportCycleId,
        router,
        schema,
        specialistOnboardingLocked,
        studentId,
        user?.specialist_onboarding_missing,
    ]);

    useEffect(() => {
        if (isViewMode || !isSectionScopedAssessment || !studentId || !reportCycleId) return;
        const pendingEntries = Object.entries(pendingSectionSaves);
        if (pendingEntries.length === 0) return;

        const timeoutId = setTimeout(async () => {
            for (const [sectionId, token] of pendingEntries) {
                const section = sectionById[sectionId];
                if (!section) continue;
                await saveAssessmentSection(section, false, { silent: true });
                setPendingSectionSaves(prev => {
                    if (prev[sectionId] !== token) return prev;
                    const next = { ...prev };
                    delete next[sectionId];
                    return next;
                });
            }
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [
        isSectionScopedAssessment,
        isViewMode,
        pendingSectionSaves,
        reportCycleId,
        saveAssessmentSection,
        sectionById,
        studentId,
    ]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccessMsg("");
        setErrorMsg("");

        if (isSectionScopedAssessment) {
            setErrorMsg("Use the section Save Draft and Submit My Section buttons instead of submitting the whole form at once.");
            setLoading(false);
            return;
        }

        if (!schema) {
            setErrorMsg("Invalid form schema.");
            setLoading(false);
            return;
        }

        if (formType === "parent-assessment") {
            setAttemptedSubmit(true);
            if (invalidFields.size > 0) {
                setErrorMsg("Please fill in all required fields.");
                toast.error("Please fill in all required fields.", {
                    id: "validation-error",
                    duration: 4000
                });
                setLoading(false);

                // Scroll beautifully to the first invalid field
                setTimeout(() => {
                    const firstInvalidElement = document.querySelector('[data-invalid="true"]');
                    if (firstInvalidElement) {
                        firstInvalidElement.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                }, 100);
                return;
            }
        }

        try {
            if (specialistOnboardingLocked) {
                setErrorMsg(specialistOnboardingMessage(user?.specialist_onboarding_missing));
                setLoading(false);
                return;
            }
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

    const requestUnlock = () => {
        setConfirmModal({
            isOpen: true,
            title: "Request Unlock?",
            message: "Are you sure you want to request an unlock from the admin?",
            actionText: "Request Unlock",
            actionVariant: "primary",
            onConfirm: async () => {
                try {
                    await api.post("/api/inputs/multidisciplinary-assessment/request-unlock/", {
                        student_id: parseInt(studentId || "0"),
                        report_cycle_id: parseInt(reportCycleId)
                    });
                    toast.success("Unlock requested successfully.");
                    await refetchTeamSubmission();
                } catch (err: any) {
                    toast.error(extractApiError(err));
                }
            }
        });
    };

    const adminUnlockForm = () => {
        setConfirmModal({
            isOpen: true,
            title: "Unlock Form?",
            message: "Are you sure you want to unlock this form? Specialists will be able to edit and re-submit their sections.",
            actionText: "Unlock Form",
            actionVariant: "warning",
            onConfirm: async () => {
                try {
                    await api.post("/api/inputs/multidisciplinary-assessment/unlock/", {
                        student_id: parseInt(studentId || "0"),
                        report_cycle_id: parseInt(reportCycleId)
                    });
                    toast.success("Assessment unlocked successfully.");
                    await refetchTeamSubmission();
                } catch (err: any) {
                    toast.error(extractApiError(err));
                }
            }
        });
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
                        
                        {/* Unlock functionality banners */}
                        {isSectionScopedAssessment && teamSubmission?.finalized_at && (
                            <div className="mt-3">
                                {isAdmin ? (
                                    <div className={formBannerClass("warning")}>
                                        <div className="text-sm">
                                            {teamSubmission?.unlock_requested ? (
                                                <strong>Unlock requested by specialist.</strong>
                                            ) : (
                                                <span>This form is finalized and locked.</span>
                                            )}
                                        </div>
                                        <button
                                            onClick={adminUnlockForm}
                                            className="shrink-0 rounded-md border border-amber-200 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:border-amber-300 hover:bg-amber-100"
                                        >
                                            Unlock Form
                                        </button>
                                    </div>
                                ) : (
                                    user?.role === "SPECIALIST" && !studentProfile?.generated_documents?.some((doc: any) => doc.document_type === "IEP") && (
                                        <div className={formBannerClass("neutral")}>
                                            <div className="text-sm">
                                                {teamSubmission?.unlock_requested ? (
                                                    <span>You have requested an admin to unlock this form.</span>
                                                ) : (
                                                    <span>Need to make changes?</span>
                                                )}
                                            </div>
                                            {!teamSubmission?.unlock_requested && (
                                                <button
                                                    onClick={requestUnlock}
                                                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                                                >
                                                    Request Unlock
                                                </button>
                                            )}
                                        </div>
                                    )
                                )}
                            </div>
                        )}
                        {!isViewMode && collabFormType && collabInstanceId && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "3px 8px", background: collab.connected ? "#dcfce7" : "#f1f5f9", color: collab.connected ? "#166534" : "#475569", borderRadius: "999px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: collab.connected ? "#22c55e" : "#94a3b8", display: "inline-block" }} />
                                    {collab.connected ? "Live" : "Reconnecting…"}
                                </span>
                                {collab.locks.filter(l => l.user_id !== user?.user_id).map(l => (
                                    <span key={`${l.user_id}-${l.section_key}`} style={{ fontSize: "0.7rem", fontWeight: 600, padding: "3px 8px", background: "#eef2ff", color: "#4338ca", borderRadius: "999px" }}>
                                        {l.user_name}{l.section_key && l.section_key !== "*" ? ` · §${l.section_key}` : ""}
                                    </span>
                                ))}
                            </div>
                        )}
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
                {successMsg ? (
                    <div className="bg-white min-h-[500px] flex flex-col items-center justify-center p-8 text-center" style={{ borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "2rem" }}>
                        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#dcfce7", color: "#166534", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: 40, height: 40 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", marginBottom: "12px" }}>
                            {schema.title} Submitted
                        </h2>
                        <p style={{ fontSize: "1rem", color: "#64748b", maxWidth: "450px", lineHeight: 1.5 }}>
                            Thank you for your submission. Our clinical team has received your input.
                        </p>
                    </div>
                ) : (
                    <>
                        {errorMsg && (
                            <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", marginBottom: "1rem" }}>
                                {errorMsg}
                            </div>
                        )}

                {/* Section-gating banner */}
                {!isViewMode && !isAdmin && (formType === "multidisciplinary-assessment" || formType === "multidisciplinary-tracker") && (
                    <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#eef2ff", color: "#3730a3", border: "1px solid #c7d2fe", marginBottom: "1rem", fontSize: "0.875rem" }}>
                        {editableSpecialties.length > 0 ? (
                            <>You can edit shared sections and your assigned discipline area{editableSpecialties.length > 1 ? "s" : ""}: <strong>{editableSpecialties.map(s => specialtyShortLabel(s as SectionOwner)).join(", ")}</strong>. Other sections are read-only.</>
                        ) : (
                            <>No assigned discipline found for this student — you can only edit shared sections.</>
                        )}
                    </div>
                )}

                {specialistOnboardingLocked && (
                    <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a", marginBottom: "1rem", fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                        <span>{specialistOnboardingMessage(user?.specialist_onboarding_missing)}</span>
                        <button
                            type="button"
                            onClick={() => router.push("/specialist-onboarding")}
                            style={{ padding: "8px 12px", borderRadius: "8px", border: "none", background: "#d97706", color: "white", fontWeight: 700, cursor: "pointer" }}
                        >
                            Finish setup
                        </button>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <fieldset disabled={isViewMode || specialistOnboardingLocked} style={{ border: "none", padding: 0, margin: 0 }}>
                        {/* Dynamic sections from schema */}
                        {schema.sections?.map((section: any) => {
                            const dataKey = dataKeyFor(section);
                            const sectionOwner = getSectionOwner(formType, section.id);
                            
                            // Determine if we should show this section
                            const shouldShowSection = 
                                isAdmin || 
                                !sectionOwner || 
                                sectionOwner === SHARED || 
                                sectionOwner === "MIXED" || 
                                editableSpecialties.includes(sectionOwner);
                                
                            if (!shouldShowSection) return null;

                            const sectionState = sectionStates[section.id];
                            const sectionFullyEditable = isAdmin
                                || sectionOwner === null
                                || sectionOwner === SHARED
                                || (sectionOwner !== "MIXED" && editableSpecialties.includes(sectionOwner));
                            const isMySection = Boolean(!isAdmin && sectionOwner && sectionOwner !== SHARED && sectionOwner !== "MIXED" && editableSpecialties.includes(sectionOwner));
                            const ownerLabel: string | null =
                                !sectionOwner ? null
                                : sectionOwner === SHARED ? "Shared"
                                : sectionOwner === "MIXED" ? "Per-field"
                                : specialtyShortLabel(sectionOwner);
                            return (
                            <SectionCard key={section.id} title={section.title} isMySection={isMySection}>
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
                                    const fieldReadOnly = field.type === "readonly_parent_summary"
                                        || !!sectionState?.isLocked
                                        || (!isViewMode && !isFieldEditable(section.id, field.id));

                                    const isRequired = isFieldRequired(formType, field);
                                    const fieldKey = `${dataKey}_${field.id}`;
                                    const isInvalid = attemptedSubmit && invalidFields.has(fieldKey);

                                    return (
                                        <div 
                                            key={field.id}
                                            data-invalid={isInvalid ? "true" : "false"}
                                            style={{
                                                padding: "10px 14px",
                                                margin: "-10px -14px",
                                                borderRadius: "12px",
                                                border: isInvalid ? "1.5px solid #fee2e2" : "1.5px solid transparent",
                                                background: isInvalid ? "#fef2f2" : "transparent",
                                                transition: "all 0.2s",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "6px"
                                            }}
                                        >
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2px" }}>
                                                <FieldLabel label={field.label} required={isRequired} />
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

                                            {isInvalid && (
                                                <p style={{ color: "#ef4444", fontSize: "0.75rem", fontWeight: 650, marginTop: "-4px", marginBottom: "4px" }}>
                                                    * Please select an option or fill in the value
                                                </p>
                                            )}

                                            {field.description && showDescriptions[field.id] && (
                                                <p style={{ fontSize: "var(--form-helper-font-size)", color: "#475569", marginBottom: "12px", marginTop: "0", lineHeight: "var(--form-line-height)" }}>
                                                    {field.description}
                                                </p>
                                            )}

                                            {field.type === "readonly_parent_summary" && (
                                                <ReadOnlyParentSummary
                                                    rows={Array.isArray(currentValue) && currentValue.length > 0
                                                        ? currentValue
                                                        : buildParentSummaryRows(studentProfile)}
                                                />
                                            )}

                                            {field.type === "goal_rating_group" && (
                                                <GoalAchievementInput
                                                    goals={field.goals || []}
                                                    value={currentValue || []}
                                                    sectionData={currentSectionData}
                                                    readOnly={fieldReadOnly}
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
                                {!isViewMode && isSectionScopedAssessment && sectionState?.apiKey && (
                                    <div style={{ marginTop: "0.75rem" }}>
                                        {sectionState.isLocked && !isAdmin ? (
                                            <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#f1f5f9", color: "#475569", fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div>
                                                    {teamSubmission?.finalized_at ? (
                                                        <>Assessment finalized on <strong>{new Date(teamSubmission.finalized_at).toLocaleString()}</strong>.</>
                                                    ) : sectionState.isVerificationLocked ? (
                                                        <>Section A is locked after the verification is marked as <strong>matches</strong>.</>
                                                    ) : sectionState.contribution?.specialist_name ? (
                                                        <>Submitted by <strong>{sectionState.contribution.specialist_name}</strong>{sectionState.contribution.submitted_at ? ` on ${new Date(sectionState.contribution.submitted_at).toLocaleDateString()}` : ""}.</>
                                                    ) : (
                                                        <>This section is locked.</>
                                                    )}
                                                </div>
                                                {!teamSubmission?.finalized_at && (sectionOwner === SHARED || isMySection) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => reopenSection(sectionState.apiKey)}
                                                        disabled={isReopening === sectionState.apiKey}
                                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "white", color: "#334155", fontWeight: 600, fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                                                    >
                                                        {isReopening === sectionState.apiKey ? "..." : (
                                                            <>
                                                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="14" height="14">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                                </svg>
                                                                Update
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        ) : !sectionState.isLocked && sectionState.contribution?.updated_at && !isAdmin ? (
                                            <div style={{ padding: "6px 14px", color: "#64748b", fontSize: "0.75rem", display: "flex", justifyContent: "flex-end" }}>
                                                Last edited by {sectionState.contribution.specialist_name || "Unknown"} on {new Date(sectionState.contribution.updated_at).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                            </SectionCard>
                            );
                        })}
                    </fieldset>

                    {!isViewMode && isSectionScopedAssessment && !isAdmin && (
                        <div style={{ marginTop: "1rem", padding: "16px 18px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                            <div>
                                <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>
                                    Submit My Assessment
                                </p>
                                <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                                    {hasSomethingToSubmit
                                        ? "You have draft changes ready to submit. Drafts save automatically while you work."
                                        : "All of your sections are already submitted. Add or edit content to enable submitting again."}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={submitOwnedAssessmentSections}
                                disabled={specialistOnboardingLocked || submittingOwnedSections || !hasSomethingToSubmit}
                                style={{ padding: "10px 20px", borderRadius: "10px", border: "none", background: specialistOnboardingLocked || submittingOwnedSections || !hasSomethingToSubmit ? "#cbd5f5" : "#4f46e5", color: "white", fontWeight: 700, cursor: specialistOnboardingLocked || submittingOwnedSections || !hasSomethingToSubmit ? "not-allowed" : "pointer", fontSize: "0.9rem", minWidth: "190px" }}
                            >
                                {submittingOwnedSections ? "Submitting..." : "Submit My Assessment"}
                            </button>
                        </div>
                    )}

                    {/* Submit */}
                    {!isViewMode && !isSectionScopedAssessment && (
                        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                            <button type="button" onClick={() => router.push("/dashboard")}
                                style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", color: "#475569", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" }}>
                                Cancel
                            </button>
                            <button type="submit" disabled={loading || specialistOnboardingLocked}
                                style={{ padding: "10px 24px", borderRadius: "8px", border: "none", background: loading ? "#a5b4fc" : "#4f46e5", color: "white", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>
                                {loading ? "Submitting…" : "Submit Form"}
                            </button>
                        </div>
                    )}
                </form>
                    </>
                )}
            </div>

            {confirmModal?.isOpen && typeof document !== "undefined" && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden">
                        <div className="p-6">
                            <h3 className="m-0 text-lg font-bold text-slate-900">{confirmModal.title}</h3>
                            <p className="mt-2 text-sm text-slate-500 leading-relaxed">{confirmModal.message}</p>
                        </div>
                        <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setConfirmModal(null)}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    confirmModal.onConfirm();
                                    setConfirmModal(null);
                                }}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
                                    confirmModal.actionVariant === "danger" ? "bg-red-600 hover:bg-red-700" :
                                    confirmModal.actionVariant === "warning" ? "bg-amber-600 hover:bg-amber-700" :
                                    "bg-indigo-600 hover:bg-indigo-700"
                                }`}
                            >
                                {confirmModal.actionText}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
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
