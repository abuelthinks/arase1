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

// Solid (filled) variants: a saturated background with white text. Roles use
// these so a role reads as a filled chip — visually distinct from the soft,
// outlined status badges — which keeps a shared hue (e.g. green) from meaning
// two different things at a glance. Backed by the --solid-* tokens.
export const SEMANTIC_TONE_STRONG_CLASS: Record<SemanticTone, string> = {
    primary: "bg-accent-strong text-white border-accent-strong",
    info: "bg-info-strong text-white border-info-strong",
    success: "bg-success-strong text-white border-success-strong",
    warning: "bg-warning-strong text-white border-warning-strong",
    danger: "bg-danger-strong text-white border-danger-strong",
    attention: "bg-attention-strong text-white border-attention-strong",
    neutral: "bg-subtle-strong text-white border-subtle-strong",
};

export function semanticToneHex(tone: SemanticTone): { bg: string; color: string; border: string } {
    return SEMANTIC_TONE_HEX[tone] ?? SEMANTIC_TONE_HEX.neutral;
}

export function semanticToneClass(tone: SemanticTone): string {
    return SEMANTIC_TONE_CLASS[tone] ?? SEMANTIC_TONE_CLASS.neutral;
}

export function semanticToneStrongClass(tone: SemanticTone): string {
    return SEMANTIC_TONE_STRONG_CLASS[tone] ?? SEMANTIC_TONE_STRONG_CLASS.neutral;
}

export function normalizeStatusKey(status?: string | null): string {
    return (status || "").toUpperCase().replace(/\s+/g, "_");
}

// Each role maps to a semantic tone. Roles render as solid/filled chips while
// statuses render soft/outlined, so the two never read as the same thing even
// when they share a hue (Specialist and Enrolled are both green, but one is a
// filled chip and the other a tinted pill).
export const ROLE_TONE: Record<string, SemanticTone> = {
    ADMIN: "primary",
    TEACHER: "info",
    SPECIALIST: "success",
    PARENT: "warning",
};

export function roleTone(role: RoleKey): SemanticTone {
    return ROLE_TONE[role?.toUpperCase()] ?? "neutral";
}

// Solid fill + white text, so inline role badges (e.g. admin tables) read as
// filled chips. Mirrors SEMANTIC_TONE_STRONG_CLASS for the inline-style path.
export const ROLE_COLOR_HEX: Record<string, { bg: string; color: string }> = {
    ADMIN: { bg: "#4338ca", color: "#ffffff" },
    TEACHER: { bg: "#1d4ed8", color: "#ffffff" },
    SPECIALIST: { bg: "#15803d", color: "#ffffff" },
    PARENT: { bg: "#b45309", color: "#ffffff" },
};

export function roleColorHex(role: RoleKey): { bg: string; color: string } {
    return ROLE_COLOR_HEX[role?.toUpperCase()] ?? { bg: "#475569", color: "#ffffff" };
}

export function roleColorClass(role: RoleKey): string {
    return semanticToneStrongClass(roleTone(role));
}

// ── Student lifecycle ───────────────────────────────────────────────────────
// The status sequence is a pipeline, so its colors form an ordered ramp rather
// than a grab-bag of semantic tones: a cool slate (queued) advances through
// sky → blue → teal (receiving services), then breaks to violet for integrated —
// the goal state gets a hue outside the ramp so it reads as "graduated" rather
// than one more step past enrolled. Archived drops to a faint, de-emphasized gray. It uses NO alert hues — amber/pink/red are reserved for
// genuine problems (e.g. an item stalled in a stage too long), so those colors
// keep their meaning. Backed by --stage-* tokens, so pills swap in dark mode.

export type LifecycleStage =
    | "intake"      // pending assessment — queued, not started
    | "scheduled"   // assessment booked
    | "assessed"    // assessment complete, awaiting enrollment
    | "enrolled"    // receiving services
    | "integrated"  // fully integrated — the goal state
    | "closed";     // archived / inactive

export const STATUS_STAGE: Record<string, LifecycleStage> = {
    PENDING_ASSESSMENT: "intake",
    ASSESSMENT_SCHEDULED: "scheduled",
    ASSESSED: "assessed",
    ASSESSED_AWAITING_ENROLLMENT: "assessed",
    "ASSESSED_(AWAITING_ENROLLMENT)": "assessed",
    ENROLLED: "enrolled",
    INTEGRATED: "integrated",
    ARCHIVED: "closed",
};

export function statusStage(status: StatusKey): LifecycleStage {
    return STATUS_STAGE[normalizeStatusKey(status)] ?? "intake";
}

// Soft pill (tinted bg + readable text + hairline border), one per stage.
// Arbitrary-value classes point at the --stage-* tokens; written as full static
// strings so Tailwind's JIT picks them up.
export const STAGE_CLASS: Record<LifecycleStage, string> = {
    intake:     "bg-[var(--stage-intake-bg)] text-[var(--stage-intake-text)] border-[var(--stage-intake-border)]",
    scheduled:  "bg-[var(--stage-scheduled-bg)] text-[var(--stage-scheduled-text)] border-[var(--stage-scheduled-border)]",
    assessed:   "bg-[var(--stage-assessed-bg)] text-[var(--stage-assessed-text)] border-[var(--stage-assessed-border)]",
    enrolled:   "bg-[var(--stage-enrolled-bg)] text-[var(--stage-enrolled-text)] border-[var(--stage-enrolled-border)]",
    integrated: "bg-[var(--stage-integrated-bg)] text-[var(--stage-integrated-text)] border-[var(--stage-integrated-border)]",
    closed:     "bg-[var(--stage-closed-bg)] text-[var(--stage-closed-text)] border-[var(--stage-closed-border)]",
};

// Inline-style path (kept for call sites that style spans directly).
export const STAGE_HEX: Record<LifecycleStage, { bg: string; color: string; border: string }> = {
    intake:     { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" },
    scheduled:  { bg: "#e0f2fe", color: "#075985", border: "#bae6fd" },
    assessed:   { bg: "#dbeafe", color: "#1e40af", border: "#bfdbfe" },
    enrolled:   { bg: "#ccfbf1", color: "#115e59", border: "#99f6e4" },
    integrated: { bg: "#ede9fe", color: "#5b21b6", border: "#ddd6fe" },
    closed:     { bg: "#f8fafc", color: "#94a3b8", border: "#e2e8f0" },
};

export function statusColorClass(status: StatusKey): string {
    return STAGE_CLASS[statusStage(status)];
}

export function statusColorHex(status: StatusKey): { bg: string; color: string } {
    const { bg, color } = STAGE_HEX[statusStage(status)];
    return { bg, color };
}

// Theme-agnostic hover: subtly intensify the soft background. Works in both
// light and dark mode without hardcoded palette colors.
export const TONE_HOVER = "hover:brightness-95 dark:hover:brightness-125";

export function statusActionPillClass(status: StatusKey): string {
    return `${statusColorClass(status)} ${TONE_HOVER}`;
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

// ── Categorical palette ─────────────────────────────────────────────────────
// Distinct hues for data series (chart bars, discipline tags) where color means
// "different category" — not status (semantic tones) and not progress (the
// lifecycle ramp). Kept as saturated mid-tones that read on both light and dark
// surfaces, and deliberately stable across themes so a discipline's identity
// colour doesn't shift between modes. The chart's chrome (axes, gridlines,
// labels) still uses the theme tokens, so only the series colour is fixed.
// Keyed by discipline so the same colour follows a discipline wherever it
// appears. `from`/`to` are the gradient stops (lighter → darker).
export type Discipline = "SLP" | "OT" | "PT" | "ABA" | "PSYCH";

export interface CategoryColor {
    solid: string;
    from: string;
    to: string;
}

export const CATEGORY_COLOR: Record<Discipline, CategoryColor> = {
    SLP:   { solid: "#6366f1", from: "#818cf8", to: "#4f46e5" }, // indigo
    OT:    { solid: "#3b82f6", from: "#60a5fa", to: "#2563eb" }, // blue
    PT:    { solid: "#10b981", from: "#34d399", to: "#059669" }, // emerald
    ABA:   { solid: "#ec4899", from: "#f472b6", to: "#db2777" }, // pink
    PSYCH: { solid: "#f59e0b", from: "#fbbf24", to: "#d97706" }, // amber
};
