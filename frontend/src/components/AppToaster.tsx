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

    return (
        <Toaster
            position={isMobile ? "bottom-center" : "top-right"}
            closeButton
            gap={8}
            toastOptions={{
                className: "app-toast",
                style: {
                    // Offset below navbar only on desktop when navbar is visible
                    ...((!isMobile && !hideNavbar)
                        ? { marginTop: "52px" }
                        : {}),
                },
            }}
        />
    );
}
