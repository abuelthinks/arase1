"use client";

import {
    semanticToneClass,
    statusTone,
    statusLabel,
    roleColorClass,
    type SemanticTone,
} from "@/lib/role-colors";

function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(" ");
}

interface BaseProps {
    className?: string;
    /** Pill (default) or squarer tag corners. */
    shape?: "pill" | "tag";
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
 *   <Badge status={student.status} />     // auto-colored + auto-labeled
 *   <Badge role="ADMIN">Admin</Badge>
 *   <Badge tone="success">Saved</Badge>
 */
export default function Badge(props: BadgeProps) {
    const { className, shape = "pill", children } = props;

    let toneClass: string;
    let content: React.ReactNode = children;

    if ("status" in props && props.status !== undefined) {
        toneClass = semanticToneClass(statusTone(props.status));
        if (content === undefined) content = statusLabel(props.status);
    } else if ("role" in props && props.role !== undefined) {
        toneClass = roleColorClass(props.role);
        if (content === undefined) {
            content = props.role.charAt(0).toUpperCase() + props.role.slice(1).toLowerCase();
        }
    } else {
        toneClass = semanticToneClass((props as { tone: SemanticTone }).tone);
    }

    return (
        <span
            className={cx(
                "inline-flex items-center gap-1 border px-2.5 py-0.5 text-xs font-bold",
                SHAPE_CLASS[shape],
                toneClass,
                className
            )}
        >
            {content}
        </span>
    );
}
