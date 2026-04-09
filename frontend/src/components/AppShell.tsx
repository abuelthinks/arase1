"use client";

import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import AdminSidebar from "./AdminSidebar";
import UserSidebar from "./UserSidebar";
import React from "react";

// Pages that should NOT show the sidebar (full-width pages)
const NO_SIDEBAR_PATHS = ["/login", "/invite"];

export default function AppShell({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const pathname = usePathname();

    const hideSidebar = !user || pathname === "/" || NO_SIDEBAR_PATHS.some(p => pathname.startsWith(p));

    if (hideSidebar) {
        return <>{children}</>;
    }

    const isAdmin = user.role === "ADMIN";

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-40px)] overflow-hidden bg-[var(--bg-lighter)]">
            {isAdmin ? <AdminSidebar /> : <UserSidebar />}
            <main className="flex-1 px-0 pt-6 pb-28 md:py-8 md:px-12 overflow-y-auto h-full md:pb-8">
                {children}
            </main>
        </div>
    );
}
