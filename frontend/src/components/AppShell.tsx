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

    const hideSidebar = !user || NO_SIDEBAR_PATHS.some(p => pathname.startsWith(p));

    if (hideSidebar) {
        return <>{children}</>;
    }

    const isAdmin = user.role === "ADMIN";

    return (
        <div style={{ display: "flex", height: "calc(100vh - 40px)", overflow: "hidden", backgroundColor: "var(--bg-lighter)" }}>
            {isAdmin ? <AdminSidebar /> : <UserSidebar />}
            <main style={{ flex: 1, padding: "2rem 3rem", overflowY: "auto", height: "100%" }}>
                {children}
            </main>
        </div>
    );
}
