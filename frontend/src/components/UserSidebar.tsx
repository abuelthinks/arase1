"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { User, BookOpen, LayoutTemplate } from "lucide-react";

export default function UserSidebar() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const [lastParentStudentId, setLastParentStudentId] = useState<string | null>(null);
    const [fallbackParentStudentId, setFallbackParentStudentId] = useState<string | null>(null);

    const isTeacher = user?.role === "TEACHER";
    const isSpecialist = user?.role === "SPECIALIST";
    const isParent = user?.role === "PARENT";

    const portalTitle = isTeacher ? "Teacher Portal" : isSpecialist ? "Specialist Portal" : "Parent Portal";

    const isMyChildren =
        pathname === "/dashboard" ||
        pathname.startsWith("/dashboard/") ||
        pathname.startsWith("/parent-onboarding");
    const isProfile = pathname.startsWith("/profile") || pathname.startsWith("/users");
    const isWorkspace = pathname.startsWith("/workspace") || pathname.startsWith("/students");
    const isParentMonthlyProgress =
        isParent &&
        pathname.startsWith("/workspace") &&
        searchParams.get("workspace") === "forms" &&
        searchParams.get("tab") === "parent_tracker";

    useEffect(() => {
        if (!isParent || typeof window === "undefined") return;
        const currentStudentId =
            searchParams.get("studentId") ||
            pathname.match(/^\/students\/(\d+)/)?.[1] ||
            window.localStorage.getItem("arase:last-parent-student-id");

        if (currentStudentId) {
            setLastParentStudentId(currentStudentId);
            window.localStorage.setItem("arase:last-parent-student-id", currentStudentId);
        } else {
            setLastParentStudentId(window.localStorage.getItem("arase:last-parent-student-id"));
        }

        api.get("/api/students/").then(res => {
            const firstEnrolled = res.data?.find((student: any) => student.status === "ENROLLED")?.id;
            setFallbackParentStudentId(firstEnrolled ? String(firstEnrolled) : null);
        }).catch(() => {});
    }, [isParent, pathname, searchParams]);

    const openMonthlyProgress = () => {
        if (!isParent) return;
        const studentId = lastParentStudentId
            || fallbackParentStudentId
            || (typeof window !== "undefined" ? window.localStorage.getItem("arase:last-parent-student-id") : null);
        if (studentId) {
            router.push(`/workspace?studentId=${studentId}&workspace=forms&tab=parent_tracker`);
            return;
        }
        router.push("/dashboard");
    };

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-[180px] bg-white border-r border-[var(--border-light)] p-4 shadow-[2px_0_5px_rgba(0,0,0,0.02)] sticky top-0 h-full overflow-y-auto shrink-0">
                {/* Logo / Branding */}
                <div
                    className="mb-8 cursor-pointer px-1"
                    onClick={() => window.location.href = "/dashboard"}
                >
                    <h1 className="text-xl font-bold text-[var(--accent-primary)] m-0 leading-tight truncate">
                        {portalTitle}
                    </h1>
                </div>

                {/* Navigation */}
                <nav className="flex flex-col gap-1 w-full">
                    <div className="px-2 pb-1 text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        My Work
                    </div>

                    {isParent && (
                        <button
                            type="button"
                            onClick={openMonthlyProgress}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${isParentMonthlyProgress ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`}
                        >
                            <LayoutTemplate size={18} />
                            <span className="truncate">Report</span>
                        </button>
                    )}

                    {(isTeacher || isSpecialist) && (
                        <Link href="/workspace" className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${isWorkspace ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`} aria-current={isWorkspace ? "page" : undefined}>
                            <LayoutTemplate size={18} />
                            <span className="truncate">Workspace</span>
                        </Link>
                    )}

                    <Link href="/dashboard" className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${isMyChildren ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`} aria-current={isMyChildren ? "page" : undefined}>
                        <BookOpen size={18} />
                        <span className="truncate">{isTeacher || isSpecialist ? "My Students" : "My Children"}</span>
                    </Link>

                    <div className="px-2 pb-1 mt-5 text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        Account
                    </div>

                    {user && (
                        <>
                            <Link href={`/users/${user.user_id}`} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${isProfile ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`}>
                                <User size={18} />
                                <span className="truncate">My Profile</span>
                            </Link>
                        </>
                    )}
                </nav>
            </aside>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden flex fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border-light)] z-[1000] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
                {isParent && (
                    <button
                        type="button"
                        onClick={openMonthlyProgress}
                        className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${isParentMonthlyProgress ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}
                    >
                        <LayoutTemplate size={20} className={isParentMonthlyProgress ? "stroke-[2.5px]" : ""} />
                        <span className="text-[0.65rem] font-medium">Report</span>
                    </button>
                )}
                {(isTeacher || isSpecialist) && (
                    <Link href="/workspace" className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${isWorkspace ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                        <LayoutTemplate size={20} className={isWorkspace ? "stroke-[2.5px]" : ""} />
                        <span className="text-[0.65rem] font-medium">Workspace</span>
                    </Link>
                )}
                <Link href="/dashboard" className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${isMyChildren ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                    <BookOpen size={20} className={isMyChildren ? "stroke-[2.5px]" : ""} />
                    <span className="text-[0.65rem] font-medium">{isTeacher || isSpecialist ? "Roster" : "Children"}</span>
                </Link>
                {user && (
                        <>
                            <Link href={`/users/${user.user_id}`} className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${isProfile ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                                <User size={20} className={isProfile ? "stroke-[2.5px]" : ""} />
                                <span className="text-[0.65rem] font-medium">Profile</span>
                            </Link>
                        </>
                )}
            </nav>
        </>
    );
}
