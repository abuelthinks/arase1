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
}

interface WelcomeBannerProps {
    students: Student[];
}

export default function WelcomeBanner({ students }: WelcomeBannerProps) {
    const { user } = useAuth();
    const [dismissed, setDismissed] = useState(false);
    
    // Only show for parents
    if (user?.role !== "PARENT") return null;
    if (!students || students.length === 0) return null;

    const pendingStudent = students.find(s => s.status === "PENDING_ASSESSMENT" && !s.has_parent_assessment);
    const analyzingStudent = students.find(s => 
        ["ASSESSMENT_SCHEDULED", "ASSESSED"].includes(s.status) || 
        (s.status === "PENDING_ASSESSMENT" && s.has_parent_assessment)
    );
    const activeStudent = students.find(s => s.status === "ENROLLED");
    
    const targetStudent = pendingStudent || analyzingStudent || activeStudent;
    if (!targetStudent) return null;

    if (dismissed) {
        return (
            <button 
                onClick={() => setDismissed(false)}
                className="mb-8 flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-full border border-blue-200 shadow-sm w-fit focus:ring-4 focus:ring-blue-50 outline-none"
                aria-label="Show welcome message"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
                Show Welcome Message
            </button>
        );
    }

    let Content = null;
    const isPending = !!pendingStudent;
    
    if (pendingStudent) {
        Content = (
            <>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-3 text-slate-800">
                    Welcome! Let's get started with <span className="text-blue-600">{targetStudent.first_name}'s</span> first assessment.
                </h1>
                <p className="text-lg text-slate-600 leading-relaxed font-medium">
                    We're excited to partner with you on this developmental journey. The first step is to complete the Parent Assessment Form.
                </p>
            </>
        );
    } else if (analyzingStudent) {
        Content = (
            <>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-3 text-slate-800">
                    All caught up! We're reviewing <span className="text-blue-600">{targetStudent.first_name}'s</span> milestones.
                </h1>
                <p className="text-lg text-slate-600 leading-relaxed font-medium">
                    Check back soon for the full report and next steps. We'll notify you once our specialists have completed their assessment.
                </p>
            </>
        );
    } else if (activeStudent) {
        Content = (
             <>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-3 text-slate-800">
                    Great news! <span className="text-blue-600">{targetStudent.first_name}</span> is now Enrolled and active.
                </h1>
                <p className="text-lg text-slate-600 leading-relaxed font-medium">
                    You can view progress reports, goals, and update home context anytime from the profile page.
                </p>
            </>
        );
    }

    return (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-6 md:p-8 shadow-sm mb-8 transition-all duration-300">
            {/* Soft decorative shapes */}
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 left-1/4 h-48 w-48 rounded-full bg-indigo-400/10 blur-3xl pointer-events-none" />
            
            {/* Dismiss button */}
            <button 
                onClick={() => setDismissed(true)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors p-1"
                aria-label="Dismiss banner"
                title="Dismiss banner"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
            
            <div className="relative flex flex-col items-center justify-between gap-6 md:flex-row">
                <div className="max-w-xl text-center md:text-left">
                    {Content}
                </div>
                
                {isPending && (
                    <div className="shrink-0 flex flex-col items-center gap-3 mt-4 md:mt-0">
                        <Link 
                            href={`/parent-onboarding?studentId=${targetStudent.id}`}
                            className="btn-primary inline-flex items-center justify-center gap-2"
                            style={{ textDecoration: "none", fontSize: "1rem", padding: "12px 28px" }}
                        >
                            Start Assessment
                            <svg className="ml-2 -mr-1 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                        </Link>
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Takes about 10-15 minutes
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
