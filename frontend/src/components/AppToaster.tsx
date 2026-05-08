"use client";

import { Toaster } from "sonner";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Responsive Toaster wrapper.
 * - Desktop (≥768px): top-right, offset below the navbar
 * - Mobile (<768px): bottom-center, within thumb zone
 * - Hides navbar offset on pages without the navbar (login, invite, landing)
 */

const NO_NAVBAR_PATHS = ["/login", "/invite"];

export default function AppToaster() {
    const pathname = usePathname();
    const [isMobile, setIsMobile] = useState(false);

    const hideNavbar =
        pathname === "/" || NO_NAVBAR_PATHS.some((p) => pathname?.startsWith(p));

    useEffect(() => {
        const mql = window.matchMedia("(max-width: 767px)");
        const onChange = (e: MediaQueryListEvent | MediaQueryList) =>
            setIsMobile(e.matches);
        onChange(mql); // initial
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, []);

    const showNavbarOffset = !isMobile && !hideNavbar;

    return (
        <Toaster
            position={isMobile ? "bottom-center" : "top-right"}
            theme="light"
            richColors
            closeButton
            gap={8}
            offset={showNavbarOffset ? { top: 'var(--navbar-h)' } : undefined}
            toastOptions={{
                className: "app-toast",
                duration: 5000,
            }}
        />
    );
}
