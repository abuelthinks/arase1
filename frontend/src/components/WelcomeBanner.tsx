"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

interface Student {
    id: number;
    first_name: string;
    last_name: string;
    status: string;
    has_parent_assessment?: boolean;
    parent_current_tracker_submitted?: boolean;
    active_cycle_label?: string | null;
    latest_final_monthly_report_id?: number | null;
}

interface WelcomeBannerProps {
    students: Student[];
}

interface BannerContent {
    student: Student;
    priority: number;
    tone: "action" | "waiting" | "ready" | "neutral";
    label: string;
    title: string;
    body: string;
    href: string;
    cta: string;
    note?: string;
}

const toneStyles = {
    action: {
        bg: "linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)",
        border: "#bfdbfe",
        labelBg: "#dbeafe",
        labelText: "#1d4ed8",
        accent: "#2563eb",
    },
    waiting: {
        bg: "linear-gradient(135deg, #fffbeb 0%, #f8fafc 100%)",
        border: "#fde68a",
        labelBg: "#fef3c7",
        labelText: "#92400e",
        accent: "#d97706",
    },
    ready: {
        bg: "linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)",
        border: "#bbf7d0",
        labelBg: "#dcfce7",
        labelText: "#166534",
        accent: "#16a34a",
    },
    neutral: {
        bg: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)",
        border: "#e2e8f0",
        labelBg: "#f1f5f9",
        labelText: "#475569",
        accent: "#64748b",
    },
};

function getWorkspaceHref(studentId: number, tab: string) {
    // Parents use a unified workspace — no workspace/tab params needed
    if (tab === "parent_tracker") {
        return `/workspace?studentId=${studentId}`;
    }
    const params = new URLSearchParams({
        studentId: studentId.toString(),
        workspace: "forms",
        tab,
    });
    return `/workspace?${params.toString()}`;
}

function getBannerContent(student: Student): BannerContent | null {
    const firstName = student.first_name;

    if (student.status === "PENDING_ASSESSMENT" && !student.has_parent_assessment) {
        return {
            student,
            priority: 1,
            tone: "action",
            label: "Your input is needed",
            title: `Tell us about ${firstName}`,
            body: "Share your insights about your child — their strengths, daily routines, and any concerns. This helps our team understand how to best support them.",
            href: `/parent-onboarding?studentId=${student.id}`,
            cta: "Get Started",
            note: "Usually takes about 10–15 minutes.",
        };
    }

    if (student.status === "ENROLLED" && !student.parent_current_tracker_submitted) {
        const cycleLabel = student.active_cycle_label || "this month";
        return {
            student,
            priority: 2,
            tone: "action",
            label: "Monthly update due",
            title: `How is ${firstName} doing at home?`,
            body: `Share your observations for ${cycleLabel} — what's going well, any changes, and milestones you've noticed. This helps the team prepare the monthly progress report.`,
            href: getWorkspaceHref(student.id, "parent_tracker"),
            cta: "Share Update",
            note: "One update per month keeps the team in sync.",
        };
    }

    if (student.status === "PENDING_ASSESSMENT" && student.has_parent_assessment) {
        return {
            student,
            priority: 3,
            tone: "waiting",
            label: "Thank you!",
            title: `We received your input for ${firstName}`,
            body: "You're all set for now. Our team is reviewing what you shared and will begin the next step of the evaluation soon.",
            href: `/students/${student.id}`,
            cta: "View Profile",
        };
    }

    if (student.status === "ASSESSMENT_SCHEDULED") {
        return {
            student,
            priority: 4,
            tone: "waiting",
            label: "Evaluation in progress",
            title: `${firstName}'s evaluation is underway`,
            body: "Our specialist team is working on the assessment. No action is needed from you right now — we'll let you know when there's an update.",
            href: `/students/${student.id}`,
            cta: "View Details",
        };
    }

    if (student.status === "ASSESSED") {
        return {
            student,
            priority: 5,
            tone: "waiting",
            label: "Almost there",
            title: `${firstName}'s evaluation is complete`,
            body: "The assessment is done and is now being reviewed for enrollment. Once approved, you'll be able to track monthly progress together with the team.",
            href: `/students/${student.id}`,
            cta: "View Profile",
        };
    }

    if (student.status === "ENROLLED") {
        return {
            student,
            priority: 6,
            tone: "ready",
            label: "All caught up",
            title: `${firstName} is on track`,
            body: student.latest_final_monthly_report_id
                ? "Your monthly update is submitted. You can review finalized reports, goals, and progress from the profile."
                : "Your monthly update is submitted. The team is preparing the progress report — check back soon!",
            href: `/students/${student.id}`,
            cta: "View Progress",
        };
    }

    if (student.status === "ARCHIVED") {
        return {
            student,
            priority: 7,
            tone: "neutral",
            label: "Archived",
            title: `${firstName}'s record is archived`,
            body: "No action is needed. The profile and past reports remain available for your reference anytime.",
            href: `/students/${student.id}`,
            cta: "View Record",
        };
    }

    return null;
}

export default function WelcomeBanner({ students }: WelcomeBannerProps) {
    const { user } = useAuth();
    const [dismissed, setDismissed] = useState(false);

    if (user?.role !== "PARENT") return null;
    if (!students || students.length === 0) return null;

    const content = students
        .map(getBannerContent)
        .filter((item): item is BannerContent => Boolean(item))
        .sort((a, b) => a.priority - b.priority)[0];

    if (!content) return null;

    const style = toneStyles[content.tone];
    const fullName = `${content.student.first_name} ${content.student.last_name}`.trim();

    if (dismissed) {
        return (
            <button
                type="button"
                onClick={() => setDismissed(false)}
                className="mb-8 flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition-colors outline-none focus:ring-4"
                style={{
                    color: style.labelText,
                    background: style.labelBg,
                    borderColor: style.border,
                }}
                aria-label="Show next step"
            >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
                Show Next Step
            </button>
        );
    }

    return (
        <section
            className="relative mb-8 overflow-hidden rounded-2xl border p-6 shadow-sm transition-all duration-300 md:p-8"
            style={{ background: style.bg, borderColor: style.border }}
            aria-label={`Next step for ${fullName}`}
        >
            <button
                type="button"
                onClick={() => setDismissed(true)}
                className="absolute right-4 top-4 border-none bg-transparent p-1 text-slate-400 transition-colors hover:text-slate-700"
                aria-label="Dismiss banner"
                title="Dismiss banner"
            >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            <div className="flex flex-col justify-between gap-6 pr-8 md:flex-row md:items-center">
                <div className="max-w-3xl">
                    <div
                        className="mb-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide"
                        style={{ background: style.labelBg, color: style.labelText }}
                    >
                        {content.label}
                    </div>
                    <h2 className="mb-3 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
                        {content.title}
                    </h2>
                    <p className="m-0 text-base font-medium leading-relaxed text-slate-600 md:text-lg">
                        {content.body}
                    </p>
                    {content.note && (
                        <p className="mt-3 text-sm font-semibold text-slate-500">
                            {content.note}
                        </p>
                    )}
                </div>

                <div className="flex shrink-0 flex-col items-stretch gap-3 md:items-end">
                    <Link
                        href={content.href}
                        className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-extrabold text-white no-underline shadow-sm transition-transform hover:scale-[1.02]"
                        style={{ background: style.accent }}
                    >
                        {content.cta}
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                    </Link>
                    <span className="text-center text-xs font-bold uppercase tracking-wide text-slate-400 md:text-right">
                        {fullName}
                    </span>
                </div>
            </div>
        </section>
    );
}
