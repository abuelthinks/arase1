"use client";

import { useEffect } from "react";

/**
 * Lightweight client component that loads accessibility preferences
 * (theme, contrast, font scale) on mount. This runs on every page,
 * including pages without a Navbar (e.g. login, invite).
 * The full AccessibilityToolbar UI lives in the Navbar.
 */
export default function AccessibilityLoader() {
  useEffect(() => {
    const root = document.documentElement;
    const savedTheme = localStorage.getItem("arase:accessibility:theme");
    const savedContrast = localStorage.getItem("arase:accessibility:contrast") === "true";
    const savedScale = localStorage.getItem("arase:accessibility:scale");

    if (savedTheme === "dark") root.classList.add("dark-theme");
    if (savedContrast) root.classList.add("high-contrast-theme");
    if (savedScale === "large") root.classList.add("font-scale-large");
    if (savedScale === "xlarge") root.classList.add("font-scale-xlarge");
  }, []);

  return null;
}
