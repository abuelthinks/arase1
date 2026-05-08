"use client";

import { Toaster } from "sonner";
import { useEffect, useState } from "react";

/**
 * Responsive Toaster wrapper.
 * - Desktop (≥768px): bottom-right
 * - Mobile (<768px): bottom-center, within thumb zone
 */

export default function AppToaster() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mql = window.matchMedia("(max-width: 767px)");
        const onChange = (e: MediaQueryListEvent | MediaQueryList) =>
            setIsMobile(e.matches);
        onChange(mql); // initial
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, []);

    return (
        <Toaster
            position={isMobile ? "bottom-center" : "bottom-right"}
            theme="light"
            richColors
            closeButton
            gap={8}
            toastOptions={{
                className: "app-toast",
                duration: 5000,
            }}
        />
    );
}
