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
    | "ARCHIVED"
    | string;

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
    PENDING_ASSESSMENT: { bg: "#fce7f3", color: "#9d174d" },
    ASSESSMENT_SCHEDULED: { bg: "#fef3c7", color: "#92400e" },
    ASSESSED: { bg: "#dbeafe", color: "#1e40af" },
    ENROLLED: { bg: "#dcfce7", color: "#166534" },
    ARCHIVED: { bg: "#f1f5f9", color: "#64748b" },
};

export function statusColorHex(status: StatusKey): { bg: string; color: string } {
    const key = status?.toUpperCase().replace(/ /g, "_");
    return STATUS_COLOR_HEX[key] ?? { bg: "#f1f5f9", color: "#475569" };
}

export const STATUS_COLOR_CLASS: Record<string, string> = {
    PENDING_ASSESSMENT: "bg-pink-50 text-pink-700 border-pink-100",
    ASSESSMENT_SCHEDULED: "bg-amber-50 text-amber-700 border-amber-100",
    ASSESSED: "bg-blue-50 text-blue-700 border-blue-100",
    ENROLLED: "bg-emerald-50 text-emerald-700 border-emerald-100",
    ARCHIVED: "bg-slate-50 text-slate-500 border-slate-200",
};

export function statusColorClass(status: StatusKey): string {
    const key = status?.toUpperCase().replace(/ /g, "_");
    return STATUS_COLOR_CLASS[key] ?? "bg-slate-50 text-slate-500 border-slate-200";
}
