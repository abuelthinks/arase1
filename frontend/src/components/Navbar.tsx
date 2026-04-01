"use client";

import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
    const { user, logout } = useAuth();
    const pathname = usePathname();

    const NO_NAVBAR_PATHS = ["/login", "/invite"];
    const hideNavbar = !user || pathname === "/" || NO_NAVBAR_PATHS.some(p => pathname?.startsWith(p));

    if (hideNavbar) return null;

    return (
        <nav className="bg-white border-b border-slate-200 px-6 py-1.5 flex justify-between items-center shadow-sm sticky top-0 z-50">
            <div className="flex items-center gap-4">
                <Link href="/dashboard" className="font-bold text-lg text-blue-600 hover:text-blue-800 transition">
                    ARASE
                </Link>
            </div>

            <button
                onClick={logout}
                className="btn-red px-3 py-1.5 text-sm flex items-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
            </button>
        </nav>
    );
}
