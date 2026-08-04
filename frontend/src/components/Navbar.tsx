"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ChevronDown } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import AccessibilityToolbar from "@/components/AccessibilityToolbar";
import ThemeToggle from "@/components/ThemeToggle";

export default function Navbar() {
    const { user, logout } = useAuth();
    const pathname = usePathname();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Click to open, Escape to close, focus back on the trigger — this used to
    // be hover-only, which left it unreachable by keyboard and on touch.
    useEffect(() => {
        if (!menuOpen) return;
        const handlePointerDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setMenuOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [menuOpen]);

    const NO_NAVBAR_PATHS = ["/login", "/invite"];
    const hideNavbar = !user || pathname === "/" || NO_NAVBAR_PATHS.some(p => pathname?.startsWith(p));

    if (hideNavbar) return null;

    const initials = (
        ((user?.first_name?.[0] || "") + (user?.last_name?.[0] || "")) ||
        (user?.email?.[0] || "?")
    ).toUpperCase();

    return (
        <nav className="bg-card border-b border-line px-4 md:px-6 py-1 flex justify-between items-center shadow-sm sticky top-0 z-50">
            <div className="flex items-center gap-4">
                <Link href="/dashboard" className="font-bold text-lg text-indigo-600 hover:text-indigo-800 transition">
                    ARASE
                </Link>
            </div>

            {/* Avatar dropdown & Notifications */}
            <div className="flex items-center gap-1.5 relative">
                {/* This bar is the phone-only chrome (the desktop shell renders the
                    floating toolbar instead). Parents get just light/dark here —
                    contrast and text scaling stay on the larger-screen panel. */}
                {user?.role === "PARENT" ? <ThemeToggle /> : <AccessibilityToolbar />}
                <NotificationBell />

                <div className="relative" ref={menuRef}>
                    <button
                        ref={triggerRef}
                        type="button"
                        onClick={() => setMenuOpen(open => !open)}
                        className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 hover:bg-subtle-soft transition-colors"
                        aria-label="Account menu"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        title={`${user?.first_name || ""} ${user?.last_name || ""}`.trim() || user?.email}
                    >
                        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                            {initials}
                        </span>
                        <ChevronDown size={14} className={`text-faint transition-transform ${menuOpen ? "rotate-180" : ""}`} />
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 top-full pt-2 w-56 z-50">
                            <div role="menu" aria-label="Account" className="bg-card rounded-xl shadow-lg border border-line overflow-hidden">
                                <div className="px-4 py-3 border-b border-line">
                                    <p className="text-sm font-bold text-fg m-0">{user?.first_name} {user?.last_name}</p>
                                    <p className="text-xs text-faint m-0 mt-0.5">{user?.email}</p>
                                </div>
                                <button
                                    role="menuitem"
                                    onClick={() => { setMenuOpen(false); logout(); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-danger hover:bg-danger-soft transition-colors"
                                >
                                    <LogOut size={16} />
                                    Log Out
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}
