"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Users, User, BookOpen } from "lucide-react";

export default function UserSidebar() {
    const pathname = usePathname();
    const { user } = useAuth();

    const isTeacher = user?.role === "TEACHER";
    const isSpecialist = user?.role === "SPECIALIST";

    const portalTitle = isTeacher ? "Teacher Portal" : isSpecialist ? "Specialist Portal" : "Parent Portal";

    const isMyChildren =
        pathname === "/dashboard" ||
        pathname.startsWith("/dashboard/") ||
        pathname.startsWith("/students") ||
        pathname.startsWith("/parent-onboarding");
    const isProfile = pathname.startsWith("/profile") || pathname.startsWith("/users");

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-56 bg-white border-r border-[var(--border-light)] p-6 shadow-[2px_0_5px_rgba(0,0,0,0.02)] sticky top-0 h-full overflow-y-auto shrink-0">
                {/* Logo / Branding */}
                <div
                    className="mb-10 cursor-pointer px-2"
                    onClick={() => window.location.href = "/dashboard"}
                >
                    <h1 className="text-xl font-bold text-[var(--accent-primary)] m-0 mb-1 leading-tight">
                        {portalTitle}
                    </h1>
                    <span className="text-xs text-[var(--text-secondary)] font-bold uppercase tracking-wider">
                        Workspace
                    </span>
                </div>

                {/* Navigation */}
                <nav className="flex flex-col gap-1">
                    <div className="px-3 pb-1 text-[0.7rem] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        My Work
                    </div>

                    <Link href="/dashboard" className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-200 ${isMyChildren ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`} aria-current={isMyChildren ? "page" : undefined}>
                        <BookOpen size={18} />
                        <span>{isTeacher || isSpecialist ? "My Students" : "My Children"}</span>
                    </Link>

                    <div className="px-3 pb-1 mt-6 text-[0.7rem] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        Account
                    </div>

                    {user && (
                        <Link href={`/users/${user.user_id}`}  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-200 ${isProfile ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`}>
                            <User size={18} />
                            <span>My Profile</span>
                        </Link>
                    )}
                </nav>
            </aside>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden flex fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border-light)] z-[1000] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
                <Link href="/dashboard" className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${isMyChildren ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                    <BookOpen size={20} className={isMyChildren ? "stroke-[2.5px]" : ""} />
                    <span className="text-[0.65rem] font-medium">{isTeacher || isSpecialist ? "Students" : "Children"}</span>
                </Link>
                {user && (
                    <Link href={`/users/${user.user_id}`} className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${isProfile ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                        <User size={20} className={isProfile ? "stroke-[2.5px]" : ""} />
                        <span className="text-[0.65rem] font-medium">Profile</span>
                    </Link>
                )}
            </nav>
        </>
    );
}
