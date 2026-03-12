"use client";

import React from "react";
import AdminSidebar from "./AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ display: "flex", height: "calc(100vh - 65px)", overflow: "hidden", backgroundColor: "var(--bg-lighter)" }}>
            <AdminSidebar />
            
            <main style={{ flex: 1, padding: "2rem 3rem", overflowY: "auto", height: "100%" }}>
                {children}
            </main>
        </div>
    );
}
