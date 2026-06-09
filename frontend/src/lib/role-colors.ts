/**
 * Centralized role and status color tokens.
 * Used by admin tables, profile pages, and dashboards. Use the *Class()
 * helpers when writing in Tailwind contexts; the *Hex() helpers exist for
 * legacy inline-style call sites still being migrated.
 */

export type RoleKey = "ADMIN" | "TEACHER" | "SPECIALIST" | "PARENT" | string;
export type StatusKey =
    | "PENDING_ASSESSMENT"
    | "ASSESSMENT_SCHEDULED"
    | "ASSESSED"
    | "ENROLLED"
    | "INTEGRATED"
    | "ARCHIVED"
    | string;

export type SemanticTone = "primary" | "info" | "success" | "warning" | "danger" | "attention" | "neutral";

export const SEMANTIC_TONE_HEX: Record<SemanticTone, { bg: string; color: string; border: string }> = {
    primary: { bg: "#eef2ff", color: "#3730a3", border: "#c7d2fe" },
    info: { bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" },
    success: { bg: "#dcfce7", color: "#166534", border: "#bbf7d0" },
    warning: { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
    danger: { bg: "#fee2e2", color: "#991b1b", border: "#fecaca" },
    attention: { bg: "#fce7f3", color: "#9d174d", border: "#fbcfe8" },
    neutral: { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" },
};

export const SEMANTIC_TONE_CLASS: Record<SemanticTone, string> = {
    primary: "bg-indigo-50 text-indigo-700 border-indigo-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    attention: "bg-pink-50 text-pink-700 border-pink-200",
    neutral: "bg-slate-50 text-slate-600 border-slate-200",
};

export function semanticToneHex(tone: SemanticTone): { bg: string; color: string; border: string } {
    return SEMANTIC_TONE_HEX[tone] ?? SEMANTIC_TONE_HEX.neutral;
}

export function semanticToneClass(tone: SemanticTone): string {
    return SEMANTIC_TONE_CLASS[tone] ?? SEMANTIC_TONE_CLASS.neutral;
}

export function normalizeStatusKey(status?: string | null): string {
    return (status || "").toUpperCase().replace(/\s+/g, "_");
}

export const ROLE_COLOR_HEX: Record<string, { bg: string; color: string }> = {
    ADMIN: { bg: "#ede9fe", color: "#5b21b6" },
    TEACHER: { bg: "#dbeafe", color: "#1e40af" },
    SPECIALIST: { bg: "#dcfce7", color: "#166534" },
    PARENT: { bg: "#fef3c7", color: "#92400e" },
};

export function roleColorHex(role: RoleKey): { bg: string; color: string } {
    return ROLE_COLOR_HEX[role?.toUpperCase()] ?? { bg: "#f1f5f9", color: "#475569" };
}

export const ROLE_COLOR_CLASS: Record<string, string> = {
    ADMIN: "bg-violet-100 text-violet-800 border-violet-200",
    TEACHER: "bg-blue-100 text-blue-800 border-blue-200",
    SPECIALIST: "bg-emerald-100 text-emerald-800 border-emerald-200",
    PARENT: "bg-amber-100 text-amber-800 border-amber-200",
};

export function roleColorClass(role: RoleKey): string {
    return ROLE_COLOR_CLASS[role?.toUpperCase()] ?? "bg-slate-100 text-slate-700 border-slate-200";
}

export const STATUS_COLOR_HEX: Record<string, { bg: string; color: string }> = {
    PENDING_ASSESSMENT: { bg: SEMANTIC_TONE_HEX.attention.bg, color: SEMANTIC_TONE_HEX.attention.color },
    ASSESSMENT_SCHEDULED: { bg: SEMANTIC_TONE_HEX.warning.bg, color: SEMANTIC_TONE_HEX.warning.color },
    ASSESSED: { bg: SEMANTIC_TONE_HEX.info.bg, color: SEMANTIC_TONE_HEX.info.color },
    "ASSESSED_(AWAITING_ENROLLMENT)": { bg: SEMANTIC_TONE_HEX.info.bg, color: SEMANTIC_TONE_HEX.info.color },
    ENROLLED: { bg: SEMANTIC_TONE_HEX.success.bg, color: SEMANTIC_TONE_HEX.success.color },
    INTEGRATED: { bg: SEMANTIC_TONE_HEX.primary.bg, color: SEMANTIC_TONE_HEX.primary.color },
    ARCHIVED: { bg: SEMANTIC_TONE_HEX.neutral.bg, color: SEMANTIC_TONE_HEX.neutral.color },
};

export const STATUS_TONE: Record<string, SemanticTone> = {
    PENDING_ASSESSMENT: "attention",
    ASSESSMENT_SCHEDULED: "warning",
    ASSESSED: "info",
    ASSESSED_AWAITING_ENROLLMENT: "info",
    "ASSESSED_(AWAITING_ENROLLMENT)": "info",
    ENROLLED: "success",
    INTEGRATED: "primary",
    ARCHIVED: "neutral",
};

export function statusTone(status: StatusKey): SemanticTone {
    const key = normalizeStatusKey(status);
    return STATUS_TONE[key] ?? "neutral";
}

export function statusColorHex(status: StatusKey): { bg: string; color: string } {
    const tone = statusTone(status);
    return { bg: SEMANTIC_TONE_HEX[tone].bg, color: SEMANTIC_TONE_HEX[tone].color };
}

export const STATUS_COLOR_CLASS: Record<string, string> = {
    PENDING_ASSESSMENT: SEMANTIC_TONE_CLASS.attention,
    ASSESSMENT_SCHEDULED: SEMANTIC_TONE_CLASS.warning,
    ASSESSED: SEMANTIC_TONE_CLASS.info,
    "ASSESSED_(AWAITING_ENROLLMENT)": SEMANTIC_TONE_CLASS.info,
    ENROLLED: SEMANTIC_TONE_CLASS.success,
    INTEGRATED: SEMANTIC_TONE_CLASS.primary,
    ARCHIVED: SEMANTIC_TONE_CLASS.neutral,
};

export function statusColorClass(status: StatusKey): string {
    return semanticToneClass(statusTone(status));
}

export const SEMANTIC_TONE_HOVER_CLASS: Record<SemanticTone, string> = {
    primary: "hover:bg-indigo-100 hover:border-indigo-300",
    info: "hover:bg-blue-100 hover:border-blue-300",
    success: "hover:bg-emerald-100 hover:border-emerald-300",
    warning: "hover:bg-amber-100 hover:border-amber-300",
    danger: "hover:bg-red-100 hover:border-red-300",
    attention: "hover:bg-pink-100 hover:border-pink-300",
    neutral: "hover:bg-slate-100 hover:border-slate-300",
};

export function statusActionPillClass(status: StatusKey): string {
    const tone = statusTone(status);
    return `${statusColorClass(status)} ${SEMANTIC_TONE_HOVER_CLASS[tone]}`;
}

export const STUDENT_WAITING_ACTION_CLASS = "bg-slate-50 text-slate-500 border-slate-100";
export const STUDENT_WAITING_ACTION_HOVER_CLASS = "hover:bg-slate-100 hover:border-slate-200";

export function studentRowActionPillClass(status: StatusKey, tone?: string | null): string {
    if ((tone || "").toLowerCase() === "waiting") {
        return `${STUDENT_WAITING_ACTION_CLASS} ${STUDENT_WAITING_ACTION_HOVER_CLASS}`;
    }
    return statusActionPillClass(status);
}

export const STUDENT_ACTION_TONE_CLASS: Record<string, string> = {
    positive: SEMANTIC_TONE_CLASS.success,
    success: SEMANTIC_TONE_CLASS.success,
    warning: SEMANTIC_TONE_CLASS.warning,
    waiting: SEMANTIC_TONE_CLASS.neutral,
    info: SEMANTIC_TONE_CLASS.info,
    attention: SEMANTIC_TONE_CLASS.attention,
    default: SEMANTIC_TONE_CLASS.primary,
};

export function studentActionPillClass(tone?: string | null): string {
    const key = (tone || "default").toLowerCase();
    return STUDENT_ACTION_TONE_CLASS[key] ?? STUDENT_ACTION_TONE_CLASS.default;
}

export const STATUS_LABELS: Record<string, string> = {
    PENDING_ASSESSMENT: "Pending Assessment",
    ASSESSMENT_SCHEDULED: "Assessment Scheduled",
    ASSESSED: "Assessed",
    ASSESSED_AWAITING_ENROLLMENT: "Assessed",
    "ASSESSED_(AWAITING_ENROLLMENT)": "Assessed",
    ENROLLED: "Enrolled",
    INTEGRATED: "Integrated",
    ARCHIVED: "Archived",
};

export function statusLabel(status?: string | null): string {
    const key = normalizeStatusKey(status);
    return STATUS_LABELS[key] ?? (status || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}
