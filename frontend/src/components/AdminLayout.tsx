"use client";

import React from "react";
import AdminSidebar from "./AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-65px)] overflow-hidden bg-[var(--bg-primary)]">
            <AdminSidebar />
            
            <main className="flex-1 p-4 md:p-8 md:px-12 overflow-y-auto h-full pb-20 md:pb-8">
                {children}
            </main>
        </div>
    );
}
