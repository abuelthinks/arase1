"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { BarChart3, GraduationCap, UsersRound, Mail, LayoutTemplate, LogOut, ChevronDown } from "lucide-react";

function Badge({ count, tone }: { count: number; tone: "indigo" | "amber" }) {
    if (count <= 0) return null;
    const cls = tone === "amber"
        ? "bg-amber-100 text-amber-800"
        : "bg-indigo-100 text-indigo-800";
    return (
        <span className={`ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[0.65rem] font-extrabold ${cls}`}>
            {count}
        </span>
    );
}

export default function AdminSidebar() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [pendingInviteCount, setPendingInviteCount] = useState(0);
    const [awaitingReviewCount, setAwaitingReviewCount] = useState(0);
    const { user, logout } = useAuth();

    const initials = (
        ((user?.first_name?.[0] || "") + (user?.last_name?.[0] || "")) ||
        (user?.email?.[0] || "?")
    ).toUpperCase();

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            api.get("/api/invitations/").catch(() => ({ data: [] })),
            api.get("/api/students/").catch(() => ({ data: [] })),
        ]).then(([inviteRes, studentRes]) => {
            if (cancelled) return;
            const now = Date.now();
            const valid = (inviteRes.data || []).filter((i: any) =>
                !i.is_used && new Date(i.expires_at).getTime() > now
            );
            setPendingInviteCount(valid.length);
            const awaiting = (studentRes.data || []).filter((s: any) => s.status === "ASSESSED");
            setAwaitingReviewCount(awaiting.length);
        });
        return () => { cancelled = true; };
    }, [pathname, searchParams]);

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
                <button
                    type="button"
                    className="mb-8 cursor-pointer px-1 text-left rounded-lg"
                    onClick={() => router.push("/dashboard")}
                >
                    <h1 className="text-xl font-bold text-[var(--accent-primary)] m-0 leading-tight truncate">Admin Portal</h1>
                </button>

                {/* Nav */}
                <nav className="flex flex-col gap-1 w-full" aria-label="Admin navigation">
                    <Link href="/workspace" aria-current={activeTab === 'workspace' ? 'page' : undefined} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'workspace' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`}>
                        <LayoutTemplate size={18} />
                        <span className="truncate">Workspace</span>
                    </Link>

                    <div className="px-2 pb-1 mt-5 text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        System Data
                    </div>
                    
                    <Link href="/dashboard?tab=analytics" aria-current={activeTab === 'analytics' ? 'page' : undefined} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'analytics' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`}>
                        <BarChart3 size={18} />
                        <span className="truncate">Analytics</span>
                    </Link>
                    <Link href="/dashboard?tab=students" aria-current={activeTab === 'students' ? 'page' : undefined} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'students' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`}>
                        <GraduationCap size={18} />
                        <span className="truncate">Student Roster</span>
                        <Badge count={awaitingReviewCount} tone="indigo" />
                    </Link>

                    <div className="px-2 pb-1 mt-5 text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        Organization
                    </div>

                    <Link href="/dashboard?tab=users" aria-current={activeTab === 'users' ? 'page' : undefined} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'users' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`}>
                        <UsersRound size={18} />
                        <span className="truncate">System Users</span>
                    </Link>
                    <Link href="/dashboard?tab=invitations" aria-current={activeTab === 'invitations' ? 'page' : undefined} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'invitations' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-slate-50 font-normal'}`}>
                        <Mail size={18} />
                        <span className="truncate">Pending Invites</span>
                        <Badge count={pendingInviteCount} tone="amber" />
                    </Link>
                </nav>

                {/* Bottom Actions */}
                <div className="mt-auto pt-4 border-t border-[var(--border-light)] flex flex-col gap-3 w-full">
                    {user && (
                        <div className="relative group w-full">
                            {/* Avatar and Info */}
                            <button className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-slate-50 transition-colors text-left border border-transparent hover:border-slate-200">
                                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                                    {initials}
                                </span>
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-sm font-bold text-slate-800 truncate">{user?.first_name} {user?.last_name}</span>
                                    <span className="text-xs text-slate-500 truncate">{user?.email}</span>
                                </div>
                                <ChevronDown size={14} className="text-slate-400 shrink-0" />
                            </button>
                            {/* Dropdown Menu */}
                            <div className="absolute bottom-full left-0 mb-1 w-full hidden group-hover:block z-50">
                                <div className="bg-white rounded-xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] border border-slate-200 overflow-hidden">
                                    <button
                                        onClick={logout}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
                                    >
                                        <LogOut size={16} />
                                        Log Out
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden flex fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border-light)] z-[1000] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
                <Link href="/dashboard?tab=analytics" className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${activeTab === 'analytics' ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                    <BarChart3 size={20} className={activeTab === 'analytics' ? "stroke-[2.5px]" : ""} />
                    <span className="text-[0.65rem] font-medium">Analytics</span>
                </Link>
                <Link href="/dashboard?tab=students" className={`relative flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${activeTab === 'students' ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                    <GraduationCap size={20} className={activeTab === 'students' ? "stroke-[2.5px]" : ""} />
                    <span className="text-[0.65rem] font-medium">Students</span>
                    {awaitingReviewCount > 0 && (
                        <span className="absolute top-1.5 right-[calc(50%-22px)] inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-indigo-600 px-1 text-[0.55rem] font-extrabold text-white">{awaitingReviewCount}</span>
                    )}
                </Link>
                <Link href="/dashboard?tab=users" className={`flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${activeTab === 'users' ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                    <UsersRound size={20} className={activeTab === 'users' ? "stroke-[2.5px]" : ""} />
                    <span className="text-[0.65rem] font-medium">Users</span>
                </Link>
                <Link href="/dashboard?tab=invitations" className={`relative flex flex-col items-center justify-center flex-1 py-3 min-h-[56px] space-y-1 ${activeTab === 'invitations' ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]"}`}>
                    <Mail size={20} className={activeTab === 'invitations' ? "stroke-[2.5px]" : ""} />
                    <span className="text-[0.65rem] font-medium">Invites</span>
                    {pendingInviteCount > 0 && (
                        <span className="absolute top-1.5 right-[calc(50%-22px)] inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[0.55rem] font-extrabold text-white">{pendingInviteCount}</span>
                    )}
                </Link>
            </nav>
        </>
    );
}
