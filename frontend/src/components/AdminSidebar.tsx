"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { BarChart3, GraduationCap, UsersRound, Mail, LayoutTemplate, LogOut, PanelLeftClose, PanelLeft } from "lucide-react";

function Badge({ count, tone }: { count: number; tone: "indigo" | "amber" }) {
    if (count <= 0) return null;
    const cls = tone === "amber"
        ? "bg-amber-100 text-amber-800"
        : "bg-indigo-100 text-indigo-800";
    return (
        <span className={`ml-auto inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[0.65rem] font-extrabold ${cls}`}>
            {count}
        </span>
    );
}

interface AdminSidebarProps {
    collapsed?: boolean;
    onToggle?: () => void;
}

export default function AdminSidebar({ collapsed = false, onToggle }: AdminSidebarProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [pendingInviteCount, setPendingInviteCount] = useState(0);
    const [awaitingReviewCount, setAwaitingReviewCount] = useState(0);
    const { user, logout } = useAuth();

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
            <aside className={`hidden md:flex flex-col bg-card border-r border-[var(--border-light)] shadow-[2px_0_5px_rgba(0,0,0,0.02)] sticky top-0 h-full overflow-y-auto shrink-0 transition-all duration-300 ${collapsed ? 'w-[56px] p-2' : 'w-[204px] p-4'}`}>
                {/* Logo */}
                <button
                    type="button"
                    className={`cursor-pointer text-left rounded-lg ${collapsed ? 'mb-4 px-0 flex items-center justify-center' : 'mb-8 px-1'}`}
                    onClick={() => router.push("/dashboard")}
                    title="Go to Dashboard"
                >
                    {collapsed ? (
                        <span className="text-lg font-bold text-[var(--accent-primary)]">A</span>
                    ) : (
                        <h1 className="text-xl font-bold text-[var(--accent-primary)] m-0 leading-tight truncate">Admin Portal</h1>
                    )}
                </button>

                {/* Nav */}
                <nav className="flex flex-col gap-1 w-full" aria-label="Admin navigation">
                    <Link href="/workspace" aria-current={activeTab === 'workspace' ? 'page' : undefined} className={`flex min-w-0 items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'workspace' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-app font-normal'} ${collapsed ? 'justify-center px-0' : ''}`} title="Workspace">
                        <LayoutTemplate size={18} className="shrink-0" />
                        {!collapsed && <span className="min-w-0 flex-1 truncate">Workspace</span>}
                    </Link>

                    {!collapsed && (
                        <div className="px-2 pb-1 mt-5 text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            System Data
                        </div>
                    )}
                    {collapsed && <div className="my-2 h-px bg-subtle-soft" />}
                    
                    <Link href="/dashboard?tab=analytics" aria-current={activeTab === 'analytics' ? 'page' : undefined} className={`flex min-w-0 items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'analytics' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-app font-normal'} ${collapsed ? 'justify-center px-0' : ''}`} title="Analytics">
                        <BarChart3 size={18} className="shrink-0" />
                        {!collapsed && <span className="min-w-0 flex-1 truncate">Analytics</span>}
                    </Link>
                    <Link href="/dashboard?tab=students" aria-current={activeTab === 'students' ? 'page' : undefined} className={`flex min-w-0 items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'students' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-app font-normal'} ${collapsed ? 'justify-center px-0 relative' : ''}`} title="Students">
                        <GraduationCap size={18} className="shrink-0" />
                        {!collapsed && <span className="min-w-0 flex-1 truncate">Students</span>}
                        {!collapsed && <Badge count={awaitingReviewCount} tone="indigo" />}
                        {collapsed && awaitingReviewCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white leading-none">
                                {awaitingReviewCount}
                            </span>
                        )}
                    </Link>

                    {!collapsed && (
                        <div className="px-2 pb-1 mt-5 text-[0.65rem] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            Organization
                        </div>
                    )}
                    {collapsed && <div className="my-2 h-px bg-subtle-soft" />}

                    <Link href="/dashboard?tab=users" aria-current={activeTab === 'users' ? 'page' : undefined} className={`flex min-w-0 items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'users' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-app font-normal'} ${collapsed ? 'justify-center px-0' : ''}`} title="System Users">
                        <UsersRound size={18} className="shrink-0" />
                        {!collapsed && <span className="min-w-0 flex-1 truncate">System Users</span>}
                    </Link>
                    <Link href="/dashboard?tab=invitations" aria-current={activeTab === 'invitations' ? 'page' : undefined} className={`flex min-w-0 items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeTab === 'invitations' ? 'bg-[var(--accent-primary)] text-white font-bold' : 'text-[var(--text-primary)] hover:bg-app font-normal'} ${collapsed ? 'justify-center px-0 relative' : ''}`} title="Registration">
                        <Mail size={18} className="shrink-0" />
                        {!collapsed && <span className="min-w-0 flex-1 truncate">Registration</span>}
                        {!collapsed && <Badge count={pendingInviteCount} tone="amber" />}
                        {collapsed && pendingInviteCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white leading-none">
                                {pendingInviteCount}
                            </span>
                        )}
                    </Link>
                </nav>

                {/* Bottom Actions */}
                <div className="mt-auto pt-4 border-t border-[var(--border-light)] flex flex-col gap-2 w-full">
                    <button
                        onClick={logout}
                        title="Log Out"
                        className={`flex min-w-0 items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted hover:text-red-600 hover:bg-red-50 transition-colors ${collapsed ? 'justify-center px-0' : ''}`}
                    >
                        <LogOut size={18} className="shrink-0" />
                        {!collapsed && <span className="min-w-0 flex-1 truncate">Log Out</span>}
                    </button>
                    <button
                        onClick={onToggle}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        className={`flex min-w-0 items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-faint hover:text-fg hover:bg-subtle-soft transition-colors ${collapsed ? 'justify-center px-0' : ''}`}
                    >
                        {collapsed ? <PanelLeft size={18} className="shrink-0" /> : <PanelLeftClose size={18} className="shrink-0" />}
                        {!collapsed && <span className="min-w-0 flex-1 truncate">Collapse</span>}
                    </button>
                </div>
            </aside>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden flex fixed bottom-0 left-0 right-0 bg-card border-t border-[var(--border-light)] z-[1000] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
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
                    <span className="text-[0.65rem] font-medium">Registration</span>
                    {pendingInviteCount > 0 && (
                        <span className="absolute top-1.5 right-[calc(50%-22px)] inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[0.55rem] font-extrabold text-white">{pendingInviteCount}</span>
                    )}
                </Link>
            </nav>
        </>
    );
}
