"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import AdminSidebar from "./AdminSidebar";
import UserSidebar from "./UserSidebar";
import React from "react";
import NotificationBell from "@/components/NotificationBell";
import AccessibilityToolbar from "@/components/AccessibilityToolbar";

// Pages that should NOT show the sidebar (full-width pages)
const NO_SIDEBAR_PATHS = ["/login", "/invite"];

export default function AppShell({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const saved = window.localStorage.getItem("arase:sidebar-collapsed");
            if (saved === "true") {
                setSidebarCollapsed(true);
            }
        }
    }, []);

    const toggleSidebar = () => {
        setSidebarCollapsed(c => {
            const next = !c;
            if (typeof window !== "undefined") {
                window.localStorage.setItem("arase:sidebar-collapsed", String(next));
            }
            return next;
        });
    };

    const specialistOnboardingIncomplete =
        user?.role === "SPECIALIST" && user.specialist_onboarding_complete === false;

    useEffect(() => {
        if (specialistOnboardingIncomplete && pathname !== "/specialist-onboarding") {
            router.replace("/specialist-onboarding");
        }
    }, [specialistOnboardingIncomplete, pathname]);

    const hideSidebar =
        !user ||
        pathname === "/" ||
        NO_SIDEBAR_PATHS.some(p => pathname.startsWith(p)) ||
        specialistOnboardingIncomplete;

    if (hideSidebar) {
        return <div className="h-full w-full overflow-y-auto">{children}</div>;
    }

    const isAdmin = user.role === "ADMIN";
    const isWorkspace = pathname.includes("/workspace");

    return (
        <div className="flex flex-col md:flex-row h-full w-full overflow-hidden bg-[var(--bg-lighter)] relative">
            {isAdmin
                ? <AdminSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
                : <UserSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
            }
            
            {/* Floating Bottom-Right Tools (Desktop Only) */}
            <div className="hidden md:flex absolute bottom-4 right-6 lg:right-12 z-50 items-center gap-3 bg-white/90 backdrop-blur-md border border-slate-200/50 shadow-lg rounded-full px-4 py-1.5 scale-90 lg:scale-100 origin-bottom-right transition-all duration-300">
                <AccessibilityToolbar direction="up" alignOffset="-right-[69px]" />
                <div className="w-px h-4 bg-slate-200" /> {/* Divider */}
                <NotificationBell direction="up" alignOffset="-right-4" />
            </div>

            <main id="main-content" className={`flex-1 h-full ${isWorkspace ? 'p-0 overflow-hidden' : 'px-0 pt-6 pb-28 md:py-8 md:px-12 md:pb-8 overflow-y-auto'}`}>
                {children}
            </main>
        </div>
    );
}
