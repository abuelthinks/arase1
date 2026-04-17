"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BarChart3, GraduationCap, UsersRound, Mail, LayoutTemplate } from "lucide-react";

export default function AdminSidebar() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Determine active tab dynamically
    let activeTab = "analytics";
    if (pathname.includes("/workspace")) {
        activeTab = "workspace";
    } else if (pathname.includes("/users")) {
        activeTab = "users";
    } else if (pathname.includes("/students")) {
        activeTab = "students";
    } else {
        const tabParam = searchParams.get("tab");
        if (tabParam) activeTab = tabParam;
    }

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-[180px] bg-white border-r border-[var(--border-light)] p-4 shadow-[2px_0_5px_rgba(0,0,0,0.02)] sticky top-0 h-full overflow-y-auto shrink-0">
                {/* Logo */}
                <div
                    className="mb-8 cursor-pointer px-1"
                    onClick={() => window.location.href = "/dashboard"}
                >
                    <h1 className="text-xl font-bold text-[var(--accent-primary)] m-0 leading-tight truncate">Admin Portal</h1>
                </div>

                {/* Nav */}
                <nav className="flex flex-col gap-1 w-full">
                    <Link href="/workspace" className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'workspace' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`}>
                        <LayoutTemplate size={18} />
                        <span className="truncate">Workspace</span>
                    </Link>

                    <div className="px-2 pb-1 mt-5 text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        System Data
                    </div>
                    
                    <Link href="/dashboard?tab=analytics" className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'analytics' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`}>
                        <BarChart3 size={18} />
                        <span className="truncate">Analytics</span>
                    </Link>
                    <Link href="/dashboard?tab=students" className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'students' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`}>
                        <GraduationCap size={18} />
                        <span className="truncate">Student Roster</span>
                    </Link>

                    <div className="px-2 pb-1 mt-5 text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        Organization
                    </div>

                    <Link href="/dashboard?tab=users" className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'users' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`}>
                        <UsersRound size={18} />
                        <span className="truncate">System Users</span>
                    </Link>
                    <Link href="/dashboard?tab=invitations" className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'invitations' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`}>
                        <Mail size={18} />
                        <span className="truncate">Pending Invites</span>
                    </Link>
                </nav>
            </aside>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden flex fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border-light)] z-[1000] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
                <Link href="/dashboard?tab=analytics" className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${activeTab === 'analytics' ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                    <BarChart3 size={20} className={activeTab === 'analytics' ? "stroke-[2.5px]" : ""} />
                    <span className="text-[0.65rem] font-medium">Analytics</span>
                </Link>
                <Link href="/dashboard?tab=students" className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${activeTab === 'students' ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                    <GraduationCap size={20} className={activeTab === 'students' ? "stroke-[2.5px]" : ""} />
                    <span className="text-[0.65rem] font-medium">Students</span>
                </Link>
                <Link href="/dashboard?tab=users" className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${activeTab === 'users' ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                    <UsersRound size={20} className={activeTab === 'users' ? "stroke-[2.5px]" : ""} />
                    <span className="text-[0.65rem] font-medium">Users</span>
                </Link>
                <Link href="/dashboard?tab=invitations" className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${activeTab === 'invitations' ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                    <Mail size={20} className={activeTab === 'invitations' ? "stroke-[2.5px]" : ""} />
                    <span className="text-[0.65rem] font-medium">Invites</span>
                </Link>
            </nav>
        </>
    );
}
