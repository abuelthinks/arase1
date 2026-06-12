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

// Token-backed Tailwind classes (see tailwind.config.js). These swap to the
// correct values in dark mode automatically because the underlying CSS
// variables are redefined under .dark-theme.
export const SEMANTIC_TONE_CLASS: Record<SemanticTone, string> = {
    primary: "bg-accent-soft text-accent-text border-accent-border",
    info: "bg-info-soft text-info border-info-line",
    success: "bg-success-soft text-success border-success-line",
    warning: "bg-warning-soft text-warning border-warning-line",
    danger: "bg-danger-soft text-danger border-danger-line",
    attention: "bg-attention-soft text-attention border-attention-line",
    neutral: "bg-subtle-soft text-subtle border-subtle-line",
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

// Mapped onto the shared semantic tones so role badges are dark-mode-correct
// and consistent with status badges.
export const ROLE_COLOR_CLASS: Record<string, string> = {
    ADMIN: SEMANTIC_TONE_CLASS.primary,
    TEACHER: SEMANTIC_TONE_CLASS.info,
    SPECIALIST: SEMANTIC_TONE_CLASS.success,
    PARENT: SEMANTIC_TONE_CLASS.warning,
};

export function roleColorClass(role: RoleKey): string {
    return ROLE_COLOR_CLASS[role?.toUpperCase()] ?? SEMANTIC_TONE_CLASS.neutral;
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

// Theme-agnostic hover: subtly intensify the soft background. Works in both
// light and dark mode without hardcoded palette colors.
const TONE_HOVER = "hover:brightness-95 dark:hover:brightness-125";
export const SEMANTIC_TONE_HOVER_CLASS: Record<SemanticTone, string> = {
    primary: TONE_HOVER,
    info: TONE_HOVER,
    success: TONE_HOVER,
    warning: TONE_HOVER,
    danger: TONE_HOVER,
    attention: TONE_HOVER,
    neutral: TONE_HOVER,
};

export function statusActionPillClass(status: StatusKey): string {
    const tone = statusTone(status);
    return `${statusColorClass(status)} ${SEMANTIC_TONE_HOVER_CLASS[tone]}`;
}

export const STUDENT_WAITING_ACTION_CLASS = "bg-subtle-soft text-faint border-subtle-line";
export const STUDENT_WAITING_ACTION_HOVER_CLASS = "hover:brightness-95 dark:hover:brightness-125";

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
