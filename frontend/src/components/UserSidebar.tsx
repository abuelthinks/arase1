"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

// Lazy initializer: reads localStorage synchronously on mount.
// For client-side navigation (Link clicks), window is always defined,
// so collapsed starts at the correct value and there is no flash.
function getInitialCollapsed(key: string): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(key) === "true";
}

export default function UserSidebar() {
    const pathname = usePathname();
    const { user } = useAuth();

    const [collapsed, setCollapsed] = useState(() => getInitialCollapsed("user-sidebar-collapsed"));
    const [transitioning, setTransitioning] = useState(false);

    const toggleCollapse = () => {
        setTransitioning(true);
        setCollapsed(prev => {
            const next = !prev;
            localStorage.setItem("user-sidebar-collapsed", String(next));
            return next;
        });
    };

    const isTeacher = user?.role === "TEACHER";
    const isSpecialist = user?.role === "SPECIALIST";

    const portalTitle = isTeacher ? "Teacher Portal" : isSpecialist ? "Specialist Portal" : "Parent Portal";
    const portalIcon = isTeacher ? "🏫" : isSpecialist ? "🩺" : "👨‍👩‍👧";

    const navLinkStyle = (active: boolean): React.CSSProperties => ({
        padding: collapsed ? "12px" : "12px 16px",
        background: active ? "var(--accent-primary)" : "transparent",
        color: active ? "white" : "var(--text-primary)",
        borderRadius: "8px",
        fontWeight: active ? "bold" : "normal",
        cursor: "pointer",
        fontSize: "1rem",
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        gap: collapsed ? "0" : "10px",
        justifyContent: collapsed ? "center" : "flex-start",
        overflow: "hidden",
        whiteSpace: "nowrap",
        transition: transitioning ? "background 0.2s ease, padding 0.25s ease" : "background 0.2s ease",
    });

    const labelStyle: React.CSSProperties = {
        overflow: "hidden",
        maxWidth: collapsed ? "0" : "160px",
        opacity: collapsed ? 0 : 1,
        transition: transitioning ? "max-width 0.25s ease, opacity 0.2s ease" : "none",
        whiteSpace: "nowrap",
    };

    const isDashboard = pathname === "/dashboard";
    const isProfile = pathname.startsWith("/profile") || pathname.startsWith("/users");

    return (
        <aside
            suppressHydrationWarning
            style={{
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
            }}
        >
            {/* Logo / Branding */}
            <div
                style={{ marginBottom: "3rem", padding: "0 10px", cursor: "pointer", overflow: "hidden" }}
                onClick={() => window.location.href = "/dashboard"}
            >
                {collapsed ? (
                    <div style={{ fontSize: "1.4rem", textAlign: "center" }}>{portalIcon}</div>
                ) : (
                    <>
                        <h1 style={{ fontSize: "1.5rem", color: "var(--accent-primary)", margin: "0 0 0.25rem 0", whiteSpace: "nowrap" }}>
                            {portalIcon} {portalTitle}
                        </h1>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>
                            Workspace
                        </span>
                    </>
                )}
            </div>

            {/* Navigation */}
            <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {!collapsed && (
                    <div style={{ padding: "4px 16px 4px 16px", fontSize: "0.75rem", fontWeight: "bold", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
                        My Work
                    </div>
                )}

                <Link href="/dashboard" style={navLinkStyle(isDashboard)}>
                    <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>📚</span>
                    <span style={labelStyle}>{isTeacher || isSpecialist ? "My Students" : "My Children"}</span>
                </Link>

                {!collapsed && (
                    <div style={{ padding: "8px 16px 4px 16px", marginTop: "1rem", fontSize: "0.75rem", fontWeight: "bold", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>
                        Account
                    </div>
                )}
                {collapsed && <div style={{ height: "1.5rem" }} />}

                {user && (
                    <Link href={`/users/${user.user_id}`} style={navLinkStyle(isProfile)}>
                        <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>👤</span>
                        <span style={labelStyle}>My Profile</span>
                    </Link>
                )}
            </nav>

            {/* Collapse Toggle — sits right below the nav, not at the bottom */}
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
                    transition: "background 0.2s ease",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
                <span style={{
                    transition: transitioning ? "transform 0.25s ease" : "none",
                    display: "inline-block",
                    transform: collapsed ? "rotate(180deg)" : "rotate(0deg)"
                }}>‹‹</span>
                {!collapsed && <span style={labelStyle}>Collapse</span>}
            </button>
        </aside>
    );
}
