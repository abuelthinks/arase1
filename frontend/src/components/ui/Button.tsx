"use client";

import Link from "next/link";
import { forwardRef } from "react";

export type ButtonVariant =
    | "primary"
    | "secondary"
    | "indigo"
    | "green"
    | "red"
    | "slate"
    | "amber";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    indigo: "btn-indigo",
    green: "btn-green",
    red: "btn-red",
    slate: "btn-slate",
    amber: "btn-amber",
};

function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(" ");
}

type CommonProps = {
    variant?: ButtonVariant;
    className?: string;
    children: React.ReactNode;
};

type ButtonAsButton = CommonProps &
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
        href?: undefined;
    };

type ButtonAsLink = CommonProps &
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & {
        href: string;
    };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/**
 * Shared button built on the .btn-* classes in globals.css.
 * Renders a Next.js <Link> when `href` is provided, otherwise a <button>.
 */
const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
    function Button({ variant = "primary", className, children, ...rest }, ref) {
        const classes = cx(VARIANT_CLASS[variant], className);

        if ("href" in rest && rest.href !== undefined) {
            const { href, ...anchorRest } = rest as ButtonAsLink;
            return (
                <Link
                    href={href}
                    ref={ref as React.Ref<HTMLAnchorElement>}
                    className={classes}
                    {...anchorRest}
                >
                    {children}
                </Link>
            );
        }

        return (
            <button
                ref={ref as React.Ref<HTMLButtonElement>}
                className={classes}
                {...(rest as ButtonAsButton)}
            >
                {children}
            </button>
        );
    }
);

export default Button;
