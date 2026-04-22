"use client";

import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ChevronDown } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

export default function Navbar() {
    const { user, logout } = useAuth();
    const pathname = usePathname();

    const NO_NAVBAR_PATHS = ["/login", "/invite"];
    const hideNavbar = !user || pathname === "/" || NO_NAVBAR_PATHS.some(p => pathname?.startsWith(p));

    if (hideNavbar) return null;

    const initials = (
        ((user?.first_name?.[0] || "") + (user?.last_name?.[0] || "")) ||
        (user?.email?.[0] || "?")
    ).toUpperCase();

    return (
        <nav className="bg-white border-b border-slate-200 px-4 md:px-6 py-1 flex justify-between items-center shadow-sm sticky top-0 z-50">
            <div className="flex items-center gap-4">
                <Link href="/dashboard" className="font-bold text-lg text-blue-600 hover:text-blue-800 transition">
                    ARASE
                </Link>
            </div>

            {/* Avatar dropdown & Notifications */}
            <div className="flex items-center gap-1.5 relative">
                <NotificationBell />

                <div className="relative group">
                    <button
                        type="button"
                        className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 hover:bg-slate-100 transition-colors"
                        aria-label="Account menu"
                        title={`${user?.first_name || ""} ${user?.last_name || ""}`.trim() || user?.email}
                    >
                        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                            {initials}
                        </span>
                        <ChevronDown size={14} className="text-slate-400" />
                    </button>

                    {/* Dropdown — visible on hover (desktop) */}
                    <div className="absolute right-0 top-full pt-2 w-56 hidden group-hover:block z-50">
                        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-100">
                                <p className="text-sm font-bold text-slate-800 m-0">{user?.first_name} {user?.last_name}</p>
                                <p className="text-xs text-slate-400 m-0 mt-0.5">{user?.email}</p>
                            </div>
                            <button
                                onClick={logout}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                            >
                                <LogOut size={16} />
                                Log Out
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}
