"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, CircleUserRound, ChevronDown } from "lucide-react";

export default function Navbar() {
    const { user, logout } = useAuth();
    const pathname = usePathname();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const NO_NAVBAR_PATHS = ["/login", "/invite"];
    const hideNavbar = !user || pathname === "/" || NO_NAVBAR_PATHS.some(p => pathname?.startsWith(p));

    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };

        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, []);

    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);

    if (hideNavbar) return null;

    const firstName = user?.first_name || user?.email?.split("@")[0] || "there";

    return (
        <nav className="bg-white border-b border-slate-200 px-4 md:px-6 py-1.5 flex justify-between items-center shadow-sm sticky top-0 z-50">
            <div className="flex items-center gap-4">
                <Link href="/dashboard" className="font-bold text-lg text-blue-600 hover:text-blue-800 transition">
                    ARASE
                </Link>
            </div>

            <div className="relative" ref={menuRef}>
                <button
                    type="button"
                    onClick={() => setMenuOpen((open) => !open)}
                    className="flex items-center gap-2.5 cursor-pointer bg-transparent border-0 p-0 text-left"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                >
                    <span className="text-sm text-slate-500 hidden md:inline">
                        Howdy, <span className="font-semibold text-slate-700">{firstName}</span>
                    </span>
                    <span className="text-xs text-slate-500 font-medium md:hidden">
                        Howdy, {firstName}
                    </span>
                    <CircleUserRound size={30} className="text-slate-500 shrink-0" strokeWidth={1.5} />
                    <ChevronDown size={16} className={`text-slate-400 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
                </button>

                {menuOpen && (
                    <div className="absolute right-0 top-full pt-2 w-56 z-50">
                        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-100">
                                <p className="text-sm font-bold text-slate-800 m-0">{user?.first_name} {user?.last_name}</p>
                                <p className="text-xs text-slate-400 m-0 mt-0.5">{user?.email}</p>
                            </div>
                            <button
                                type="button"
                                onClick={async () => {
                                    setMenuOpen(false);
                                    await logout();
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                            >
                                <LogOut size={16} />
                                Log Out
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </nav>
    );
}
