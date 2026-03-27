"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

function getInitialCollapsed(key: string): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(key) === "true";
}

export default function AdminSidebar() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [collapsed, setCollapsed] = useState(() => getInitialCollapsed("admin-sidebar-collapsed"));
    const [transitioning, setTransitioning] = useState(false);

    const toggleCollapse = () => {
        setTransitioning(true);
        setCollapsed(prev => {
            const next = !prev;
            localStorage.setItem("admin-sidebar-collapsed", String(next));
            return next;
        });
    };

    // Determine active tab dynamically
    let activeTab = "analytics";
    if (pathname.includes("/users")) {
        activeTab = "users";
    } else if (pathname.includes("/students")) {
        activeTab = "students";
    } else {
        const tabParam = searchParams.get("tab");
        if (tabParam) activeTab = tabParam;
    }

    const navLinkStyle = (active: boolean): React.CSSProperties => ({
        padding: collapsed ? "12px" : "12px 16px",
        background: active ? "var(--accent-primary)" : "transparent",
        color: active ? "white" : "var(--text-primary)",
        borderRadius: "8px",
        textAlign: "left",
        fontWeight: active ? "bold" : "normal",
        cursor: "pointer",
        fontSize: "1rem",
        transition: "all 0.2s ease",
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        gap: collapsed ? "0" : "10px",
        justifyContent: collapsed ? "center" : "flex-start",
        overflow: "hidden",
        whiteSpace: "nowrap",
    });

    const labelStyle: React.CSSProperties = {
        overflow: "hidden",
        maxWidth: collapsed ? "0" : "160px",
        opacity: collapsed ? 0 : 1,
        transition: transitioning ? "max-width 0.25s ease, opacity 0.2s ease" : "none",
        whiteSpace: "nowrap",
    };

    return (
        <aside style={{
            position: "sticky",
            top: 0,
            height: "100%",
            overflowY: "auto",
            width: collapsed ? "68px" : "250px",
            transition: transitioning ? "width 0.25s ease" : "none",
            backgroundColor: "white",
            borderRight: "1px solid var(--border-light)",
            display: "flex",
            flexDirection: "column",
            padding: "2rem 0.75rem",
            boxShadow: "2px 0 5px rgba(0,0,0,0.02)",
            flexShrink: 0,
        }}>
            {/* Logo */}
            <div
                style={{ marginBottom: "3rem", padding: "0 10px", cursor: "pointer", overflow: "hidden" }}
                onClick={() => window.location.href = "/dashboard"}
            >
                {collapsed ? (
                    <div style={{ fontSize: "1.4rem", textAlign: "center" }}>🛡️</div>
                ) : (
                    <>
                        <h1 style={{ fontSize: "1.5rem", color: "var(--accent-primary)", margin: "0 0 0.5rem 0", whiteSpace: "nowrap" }}>Admin Portal</h1>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Workspace</span>
                    </>
                )}
            </div>

            {/* Nav */}
            <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <Link href="/dashboard?tab=analytics" style={navLinkStyle(activeTab === "analytics")}>
                    <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>📊</span>
                    <span style={labelStyle}>Analytics</span>
                </Link>
                <Link href="/dashboard?tab=students" style={navLinkStyle(activeTab === "students")}>
                    <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>📚</span>
                    <span style={labelStyle}>Student Roster</span>
                </Link>

                {!collapsed && (
                    <div style={{ padding: "8px 16px 4px 16px", marginTop: "1rem", fontSize: "0.75rem", fontWeight: "bold", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>
                        Organization
                    </div>
                )}
                {collapsed && <div style={{ height: "1.5rem" }} />}

                <Link href="/dashboard?tab=users" style={navLinkStyle(activeTab === "users")}>
                    <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>👥</span>
                    <span style={labelStyle}>System Users</span>
                </Link>
                <Link href="/dashboard?tab=invitations" style={navLinkStyle(activeTab === "invitations")}>
                    <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>✉️</span>
                    <span style={labelStyle}>Pending Invites</span>
                </Link>
            </nav>

            {/* Collapse Toggle */}
            <button
                onClick={toggleCollapse}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                style={{
                    marginTop: "1rem",
                    width: "100%",
                    padding: "10px",
                    background: "transparent",
                    border: "1px solid var(--border-light)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    fontSize: "1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "all 0.2s ease",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
                <span style={{ transition: "transform 0.25s ease", display: "inline-block", transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}>‹‹</span>
                {!collapsed && <span style={labelStyle}>Collapse</span>}
            </button>
        </aside>
    );
}
