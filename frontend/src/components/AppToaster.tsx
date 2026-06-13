"use client";

import { Toaster } from "sonner";
import { useEffect, useState } from "react";

/**
 * Responsive, theme-aware Toaster wrapper.
 * - Desktop (≥768px): bottom-right · Mobile (<768px): bottom-center
 * - Follows the app's dark mode (the `.dark-theme` class on <html> that the
 *   accessibility toolbar toggles), so toasts match the rest of the UI.
 *
 * Colors come entirely from the design tokens in globals.css (see the Sonner
 * override block there) — no `richColors`, so light/dark "just work".
 */
export default function AppToaster() {
    const [isMobile, setIsMobile] = useState(false);
    const [theme, setTheme] = useState<"light" | "dark">("light");

    useEffect(() => {
        const mql = window.matchMedia("(max-width: 767px)");
        const onChange = (e: MediaQueryListEvent | MediaQueryList) =>
            setIsMobile(e.matches);
        onChange(mql);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        const sync = () =>
            setTheme(root.classList.contains("dark-theme") ? "dark" : "light");
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(root, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);

    return (
        <Toaster
            position={isMobile ? "bottom-center" : "bottom-right"}
            theme={theme}
            closeButton
            gap={8}
            toastOptions={{
                className: "app-toast",
                duration: 4000,
            }}
        />
    );
}
