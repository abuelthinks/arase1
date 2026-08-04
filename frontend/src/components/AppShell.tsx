"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import AdminSidebar from "./AdminSidebar";
import UserSidebar from "./UserSidebar";
import React from "react";
import NotificationBell from "@/components/NotificationBell";
import AccessibilityToolbar from "@/components/AccessibilityToolbar";
import { resolveWidgetPlacement, type WidgetPlacement } from "@/lib/widget-placement";

// Pages that should NOT show the sidebar or floating tools (full-width pages).
// /learn is a distraction-free, admin-only developer guide.
const NO_SIDEBAR_PATHS = ["/login", "/invite", "/learn"];

export default function AppShell({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [placementVersion, setPlacementVersion] = useState(0);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const saved = window.localStorage.getItem("arase:sidebar-collapsed");
            if (saved === "true") {
                setSidebarCollapsed(true);
            }
        }
    }, []);

    useEffect(() => {
        const handleAccessibilityUpdate = () => setPlacementVersion(version => version + 1);
        window.addEventListener("arase:accessibility:updated", handleAccessibilityUpdate);
        return () => {
            window.removeEventListener("arase:accessibility:updated", handleAccessibilityUpdate);
        };
    }, []);

    // Derived during render rather than in an effect: the widget only mounts once
    // the role is known, so it lands in its final corner instead of jumping.
    const widgetPlacement: WidgetPlacement = useMemo(
        () => resolveWidgetPlacement(user?.role),
        [user?.role, placementVersion],
    );

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

    // The mobile bottom nav's height is not a fixed number: its labels are rem-based,
    // so the accessibility text scaler grows it, and it carries its own safe-area
    // padding. Anything that needs to sit on top of it (see the specialists action
    // bar) reads --mobile-nav-h rather than hardcoding a guess. Resolves to 0 on
    // desktop, where the nav is display:none.
    useEffect(() => {
        const nav = document.querySelector<HTMLElement>("[data-mobile-nav]");
        const root = document.documentElement;
        if (!nav) {
            root.style.setProperty("--mobile-nav-h", "0px");
            return;
        }
        const publish = () => root.style.setProperty("--mobile-nav-h", `${nav.offsetHeight}px`);
        publish();
        const observer = new ResizeObserver(publish);
        observer.observe(nav);
        return () => observer.disconnect();
    }, [hideSidebar]);

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
            
            {/* Floating Tools (Desktop Only) */}
            <div className={`hidden md:flex absolute ${widgetPlacement === 'bottom-right' ? 'bottom-4' : 'top-4'} right-6 lg:right-12 z-50 items-center gap-3 bg-white/90 backdrop-blur-md border border-line/50 shadow-lg rounded-full px-4 py-1.5 scale-90 lg:scale-100 ${widgetPlacement === 'bottom-right' ? 'origin-bottom-right' : 'origin-top-right'} transition-all duration-300`}>
                <AccessibilityToolbar direction={widgetPlacement === 'bottom-right' ? 'up' : 'down'} alignOffset="-right-[69px]" />
                <div className="w-px h-4 bg-subtle-soft" /> {/* Divider */}
                <NotificationBell direction={widgetPlacement === 'bottom-right' ? 'up' : 'down'} alignOffset="-right-4" />
            </div>

            <main id="main-content" className={`flex-1 h-full ${isWorkspace ? 'p-0 overflow-hidden' : 'px-0 pt-6 pb-28 md:py-8 md:px-12 md:pb-8 overflow-y-auto'}`}>
                {children}
            </main>
        </div>
    );
}
