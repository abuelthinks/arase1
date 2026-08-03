"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

/**
 * Light/dark switch only — the parent-facing stand-in for the full
 * AccessibilityToolbar. Reads and writes the same localStorage key so the
 * preference survives a role change and AccessibilityLoader still picks it up.
 */
export default function ThemeToggle() {
    const [theme, setTheme] = useState<"light" | "dark">("light");

    useEffect(() => {
        const saved = localStorage.getItem("arase:accessibility:theme") as "light" | "dark" | null;
        if (saved) setTheme(saved);
    }, []);

    const toggleTheme = () => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        localStorage.setItem("arase:accessibility:theme", next);
        document.documentElement.classList.toggle("dark-theme", next === "dark");
    };

    const isDark = theme === "dark";

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-pressed={isDark}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="flex items-center justify-center rounded-lg p-1.5 text-muted transition-colors hover:bg-subtle-soft hover:text-fg"
        >
            {isDark ? <Moon size={16} /> : <Sun size={16} />}
        </button>
    );
}
