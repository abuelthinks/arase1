"use client";

function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(" ");
}

export interface PageHeaderProps {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    /** Right-aligned actions (buttons, filters). Wraps below the title on mobile. */
    actions?: React.ReactNode;
    /** Optional content under the subtitle (e.g. a count badge). */
    meta?: React.ReactNode;
    className?: string;
}

/**
 * Shared page header: title + subtitle on the left, actions on the right.
 * Gives every page the same top frame and type scale.
 */
export default function PageHeader({
    title,
    subtitle,
    actions,
    meta,
    className,
}: PageHeaderProps) {
    return (
        <div
            className={cx(
                "mb-5 md:mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
                className
            )}
        >
            <div className="min-w-0">
                <h1 className="m-0 text-xl md:text-3xl font-bold text-fg flex items-center gap-2">
                    {title}
                </h1>
                {subtitle && (
                    <p className="mt-1 md:text-base text-muted">{subtitle}</p>
                )}
                {meta && <div className="mt-3">{meta}</div>}
            </div>
            {actions && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {actions}
                </div>
            )}
        </div>
    );
}
