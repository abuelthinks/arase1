"use client";

import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { LogOut, User } from "lucide-react";

export default function Navbar() {
    const { user, logout } = useAuth();
    const pathname = usePathname();
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const NO_NAVBAR_PATHS = ["/login", "/invite"];
    const hideNavbar = !user || pathname === "/" || NO_NAVBAR_PATHS.some(p => pathname?.startsWith(p));

    // Close dropdown when tapping outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowProfileMenu(false);
            }
        }
        if (showProfileMenu) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [showProfileMenu]);

    if (hideNavbar) return null;

    const isAdmin = user?.role === "ADMIN";
    const initials = user ? `${(user.first_name || "")[0] || ""}${(user.last_name || "")[0] || ""}`.toUpperCase() || "?" : "?";

    return (
        <nav className="bg-white border-b border-slate-200 px-4 md:px-6 py-1.5 flex justify-between items-center shadow-sm sticky top-0 z-50">
            <div className="flex items-center gap-4">
                <Link href="/dashboard" className="font-bold text-lg text-blue-600 hover:text-blue-800 transition">
                    ARASE
                </Link>
            </div>

            {/* Desktop: Original logout button — unchanged */}
            <button
                onClick={logout}
                className="hidden md:flex btn-red px-3 py-1.5 text-sm items-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
            </button>

            {/* Mobile: Avatar with dropdown (admin only) */}
            {isAdmin && (
                <div className="md:hidden relative" ref={menuRef}>
                    <button
                        onClick={() => setShowProfileMenu(prev => !prev)}
                        className="w-9 h-9 rounded-full bg-slate-700 text-white text-sm font-bold flex items-center justify-center"
                    >
                        {initials}
                    </button>

                    {showProfileMenu && (
                        <div className="absolute right-0 top-12 w-56 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-2 z-50">
                            <div className="px-4 py-3 border-b border-slate-100">
                                <p className="text-sm font-bold text-slate-800 m-0">{user?.first_name} {user?.last_name}</p>
                                <p className="text-xs text-slate-400 m-0 mt-0.5">{user?.email}</p>
                            </div>
                            <button
                                onClick={() => { setShowProfileMenu(false); logout(); }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                            >
                                <LogOut size={16} />
                                Sign out
                            </button>
                        </div>
                    )}
                </div>
            )}
        </nav>
    );
}
