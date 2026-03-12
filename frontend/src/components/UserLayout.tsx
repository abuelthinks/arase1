"use client";

import React from "react";
import UserSidebar from "./UserSidebar";

export default function UserLayout({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ display: "flex", height: "calc(100vh - 65px)", overflow: "hidden", backgroundColor: "var(--bg-lighter)" }}>
            <UserSidebar />
            <main style={{ flex: 1, padding: "2rem 3rem", overflowY: "auto", height: "100%" }}>
                {children}
            </main>
        </div>
    );
}
