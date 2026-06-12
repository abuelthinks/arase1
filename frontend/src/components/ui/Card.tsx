"use client";

function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(" ");
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Inner padding. Defaults to comfortable; pass "none" for flush content (e.g. tables). */
    padding?: "none" | "sm" | "md" | "lg";
    /** Optional header rendered above the body with a divider. */
    header?: React.ReactNode;
    children: React.ReactNode;
}

const PADDING_CLASS: Record<NonNullable<CardProps["padding"]>, string> = {
    none: "",
    sm: "p-3",
    md: "p-5",
    lg: "p-6",
};

/**
 * Shared surface/panel. Matches the .glass-panel look (card background, hairline
 * border, rounded corners, subtle shadow) using semantic color tokens so it is
 * dark-mode-correct without overrides.
 */
export default function Card({
    padding = "md",
    header,
    className,
    children,
    ...rest
}: CardProps) {
    return (
        <div
            className={cx(
                "bg-card border border-line rounded-2xl shadow-sm",
                className
            )}
            {...rest}
        >
            {header && (
                <div className="px-5 py-4 border-b border-line">{header}</div>
            )}
            <div className={PADDING_CLASS[padding]}>{children}</div>
        </div>
    );
}
