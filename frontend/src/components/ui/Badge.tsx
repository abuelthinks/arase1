"use client";

import {
    ShieldCheck,
    GraduationCap,
    Stethoscope,
    Users,
    Clock,
    CalendarClock,
    ClipboardCheck,
    CircleCheckBig,
    Sparkles,
    Archive,
    type LucideIcon,
} from "lucide-react";
import {
    semanticToneClass,
    semanticToneStrongClass,
    statusColorClass,
    statusLabel,
    roleTone,
    normalizeStatusKey,
    type SemanticTone,
} from "@/lib/role-colors";

function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(" ");
}

// Icons give each role/status a second, color-independent cue — readable even
// in high-contrast mode, where the theme collapses every tone to black/white.
const ROLE_ICON: Record<string, LucideIcon> = {
    ADMIN: ShieldCheck,
    TEACHER: GraduationCap,
    SPECIALIST: Stethoscope,
    PARENT: Users,
};

const STATUS_ICON: Record<string, LucideIcon> = {
    PENDING_ASSESSMENT: Clock,
    ASSESSMENT_SCHEDULED: CalendarClock,
    ASSESSED: ClipboardCheck,
    "ASSESSED_(AWAITING_ENROLLMENT)": ClipboardCheck,
    ASSESSED_AWAITING_ENROLLMENT: ClipboardCheck,
    ENROLLED: CircleCheckBig,
    INTEGRATED: Sparkles,
    ARCHIVED: Archive,
};

interface BaseProps {
    className?: string;
    /** Pill (default) or squarer tag corners. */
    shape?: "pill" | "tag";
    /** Render a leading icon (role/status only). Off by default. */
    icon?: boolean;
    children?: React.ReactNode;
}

type BadgeProps =
    | (BaseProps & { tone: SemanticTone; status?: undefined; role?: undefined })
    | (BaseProps & { status: string; tone?: undefined; role?: undefined })
    | (BaseProps & { role: string; tone?: undefined; status?: undefined });

const SHAPE_CLASS = {
    pill: "rounded-full",
    tag: "rounded-md",
};

/**
 * Shared status/role/tone badge. Colors come from role-colors.ts (token-backed,
 * dark-mode-correct). Provide exactly one of `tone`, `status`, or `role`.
 *
 * Roles render as solid/filled chips; statuses render soft/outlined — so a
 * shared hue never reads as the same thing across the two.
 *
 *   <Badge status={student.status} />          // soft, auto-labeled
 *   <Badge role="ADMIN" icon />                // solid + leading icon
 *   <Badge tone="success">Saved</Badge>
 */
export default function Badge(props: BadgeProps) {
    const { className, shape = "pill", icon = false, children } = props;

    let toneClass: string;
    let content: React.ReactNode = children;
    let Icon: LucideIcon | undefined;
    let isRole = false;

    if ("status" in props && props.status !== undefined) {
        toneClass = statusColorClass(props.status);
        if (content === undefined) content = statusLabel(props.status);
        Icon = STATUS_ICON[normalizeStatusKey(props.status)];
    } else if ("role" in props && props.role !== undefined) {
        isRole = true;
        toneClass = semanticToneStrongClass(roleTone(props.role));
        if (content === undefined) {
            content = props.role.charAt(0).toUpperCase() + props.role.slice(1).toLowerCase();
        }
        Icon = ROLE_ICON[props.role.toUpperCase()];
    } else {
        toneClass = semanticToneClass((props as { tone: SemanticTone }).tone);
    }

    return (
        <span
            {...(isRole ? { "data-role-badge": "" } : {})}
            className={cx(
                "inline-flex items-center gap-1 border px-2.5 py-0.5 text-xs font-bold",
                SHAPE_CLASS[shape],
                toneClass,
                className
            )}
        >
            {icon && Icon && <Icon size={12} aria-hidden="true" className="shrink-0" />}
            {content}
        </span>
    );
}
