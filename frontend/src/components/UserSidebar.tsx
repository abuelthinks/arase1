"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { User, BookOpen, LayoutTemplate, LogOut, PanelLeftClose, PanelLeft } from "lucide-react";

interface UserSidebarProps {
    collapsed?: boolean;
    onToggle?: () => void;
}

export default function UserSidebar({ collapsed = false, onToggle }: UserSidebarProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user, logout } = useAuth();
    const [lastParentStudentId, setLastParentStudentId] = useState<string | null>(null);
    const [fallbackParentStudentId, setFallbackParentStudentId] = useState<string | null>(null);
    const [isProgressLocked, setIsProgressLocked] = useState(false);

    const isTeacher = user?.role === "TEACHER";
    const isSpecialist = user?.role === "SPECIALIST";
    const isParent = user?.role === "PARENT";

    const portalTitle = isTeacher ? "Teacher Portal" : isSpecialist ? "Specialist Portal" : "Parent Portal";
    const portalInitial = isTeacher ? "T" : isSpecialist ? "S" : "P";

    const isMyChildren =
        pathname === "/dashboard" ||
        pathname.startsWith("/dashboard/") ||
        pathname.startsWith("/parent-onboarding");
    const isProfile = pathname.startsWith("/profile") || pathname.startsWith("/users");
    const isWorkspace = pathname.startsWith("/workspace") || pathname.startsWith("/students");
    const isParentMonthlyProgress =
        isParent &&
        pathname.startsWith("/workspace");

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
            const firstAny = res.data?.[0]?.id;
            const chosen = firstEnrolled || firstAny;
            setFallbackParentStudentId(chosen ? String(chosen) : null);
            
            // Check if progress should be locked for the relevant child
            const studentIdToCheck = currentStudentId || chosen;
            const studentToCheck = res.data?.find((s: any) => String(s.id) === String(studentIdToCheck)) || res.data?.[0];
            if (studentToCheck) {
                // If they haven't submitted the initial assessment yet, lock the progress page
                const isAssessmentPending = studentToCheck.status === "PENDING_ASSESSMENT" && !studentToCheck.has_parent_assessment;
                setIsProgressLocked(isAssessmentPending);
            }
        }).catch(() => {});
    }, [isParent, pathname, searchParams]);

    const openMonthlyProgress = () => {
        if (!isParent) return;
        const studentId = lastParentStudentId
            || fallbackParentStudentId
            || (typeof window !== "undefined" ? window.localStorage.getItem("arase:last-parent-student-id") : null);
        if (studentId) {
            router.push(`/workspace?studentId=${studentId}`);
            return;
        }
        router.push("/dashboard");
    };

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className={`hidden md:flex flex-col bg-white border-r border-[var(--border-light)] shadow-[2px_0_5px_rgba(0,0,0,0.02)] sticky top-0 h-full overflow-y-auto shrink-0 transition-all duration-300 ${collapsed ? 'w-[56px] p-2' : 'w-[180px] p-4'}`}>
                {/* Logo / Branding */}
                <div
                    className={`cursor-pointer ${collapsed ? 'mb-4 px-0 flex items-center justify-center' : 'mb-8 px-1'}`}
                    onClick={() => window.location.href = "/dashboard"}
                >
                    {collapsed ? (
                        <span className="text-lg font-bold text-[var(--accent-primary)]">{portalInitial}</span>
                    ) : (
                        <h1 className="text-xl font-bold text-[var(--accent-primary)] m-0 leading-tight truncate">
                            {portalTitle}
                        </h1>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex flex-col gap-1 w-full">
                    {!collapsed && (
                        <div className="px-2 pb-1 text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            My Work
                        </div>
                    )}

                    {isParent && (
                        <button
                            type="button"
                            onClick={() => !isProgressLocked && openMonthlyProgress()}
                            disabled={isProgressLocked}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${isProgressLocked ? 'text-slate-400 cursor-not-allowed opacity-70' : isParentMonthlyProgress ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'} ${collapsed ? 'justify-center px-0' : ''}`}
                            title={isProgressLocked ? "Available after initial assessment" : "Progress"}
                        >
                            <LayoutTemplate size={18} />
                            {!collapsed && (
                                <div className="flex items-center justify-between w-full">
                                    <span className="truncate">Progress</span>
                                    {isProgressLocked && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>}
                                </div>
                            )}
                        </button>
                    )}

                    {(isTeacher || isSpecialist) && (
                        <Link href="/workspace" className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${isWorkspace ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'} ${collapsed ? 'justify-center px-0' : ''}`} aria-current={isWorkspace ? "page" : undefined} title="Workspace">
                            <LayoutTemplate size={18} />
                            {!collapsed && <span className="truncate">Workspace</span>}
                        </Link>
                    )}

                    <Link href="/dashboard" className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${isMyChildren ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'} ${collapsed ? 'justify-center px-0' : ''}`} aria-current={isMyChildren ? "page" : undefined} title={isTeacher || isSpecialist ? "My Students" : "My Children"}>
                        <BookOpen size={18} />
                        {!collapsed && <span className="truncate">{isTeacher || isSpecialist ? "My Students" : "My Children"}</span>}
                    </Link>

                    {!collapsed && (
                        <div className="px-2 pb-1 mt-5 text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            Account
                        </div>
                    )}
                    {collapsed && <div className="my-2 h-px bg-slate-200" />}

                    {user && (
                        isProgressLocked ? (
                            <button disabled className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 text-slate-400 cursor-not-allowed opacity-70 ${collapsed ? 'justify-center px-0' : ''}`} title="Available after initial assessment">
                                <User size={18} />
                                {!collapsed && (
                                    <div className="flex items-center justify-between w-full">
                                        <span className="truncate">My Profile</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                    </div>
                                )}
                            </button>
                        ) : (
                            <Link href={`/users/${user.user_id}`} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${isProfile ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'} ${collapsed ? 'justify-center px-0' : ''}`} title="My Profile">
                                <User size={18} />
                                {!collapsed && <span className="truncate">My Profile</span>}
                            </Link>
                        )
                    )}
                </nav>

                {/* Bottom Actions */}
                <div className="mt-auto pt-4 border-t border-[var(--border-light)] flex flex-col gap-2 w-full">
                    <button
                        onClick={logout}
                        title="Log Out"
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors ${collapsed ? 'justify-center px-0' : ''}`}
                    >
                        <LogOut size={18} />
                        {!collapsed && <span className="truncate">Log Out</span>}
                    </button>
                    <button
                        onClick={onToggle}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ${collapsed ? 'justify-center px-0' : ''}`}
                    >
                        {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
                        {!collapsed && <span className="truncate">Collapse</span>}
                    </button>
                </div>
            </aside>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden flex fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border-light)] z-[1000] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
                {isParent && (
                    <button
                        type="button"
                        onClick={() => !isProgressLocked && openMonthlyProgress()}
                        disabled={isProgressLocked}
                        className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${isProgressLocked ? "text-slate-400 opacity-60 cursor-not-allowed" : isParentMonthlyProgress ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}
                    >
                        <div className="relative">
                            <LayoutTemplate size={20} className={isParentMonthlyProgress && !isProgressLocked ? "stroke-[2.5px]" : ""} />
                            {isProgressLocked && (
                                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-[1px]">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                </div>
                            )}
                        </div>
                        <span className="text-[0.65rem] font-medium">Progress</span>
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
                            {isProgressLocked ? (
                                <button disabled className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 text-slate-400 opacity-60 cursor-not-allowed`}>
                                    <div className="relative">
                                        <User size={20} />
                                        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-[1px]">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                        </div>
                                    </div>
                                    <span className="text-[0.65rem] font-medium">Profile</span>
                                </button>
                            ) : (
                                <Link href={`/users/${user.user_id}`} className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${isProfile ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                                    <User size={20} className={isProfile ? "stroke-[2.5px]" : ""} />
                                    <span className="text-[0.65rem] font-medium">Profile</span>
                                </Link>
                            )}
                        </>
                )}
            </nav>
        </>
    );
}
