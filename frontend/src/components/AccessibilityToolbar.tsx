"use client";

import { useEffect, useState, useRef } from "react";
import { Eye, Sun, Moon, ChevronDown } from "lucide-react";

interface AccessibilityToolbarProps {
  direction?: 'up' | 'down';
  alignOffset?: string;
}

export default function AccessibilityToolbar({ direction = 'down', alignOffset = 'right-0' }: AccessibilityToolbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [highContrast, setHighContrast] = useState(false);
  const [fontScale, setFontScale] = useState<"standard" | "large" | "xlarge">("standard");
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("arase:accessibility:theme") as "light" | "dark" | null;
    const savedContrast = localStorage.getItem("arase:accessibility:contrast") === "true";
    const savedScale = localStorage.getItem("arase:accessibility:scale") as "standard" | "large" | "xlarge" | null;

    if (savedTheme) setTheme(savedTheme);
    if (savedContrast !== undefined) setHighContrast(savedContrast);
    if (savedScale) setFontScale(savedScale);

    applyPreferences(savedTheme || "light", savedContrast, savedScale || "standard");
  }, []);

  const applyPreferences = (
    currentTheme: "light" | "dark",
    currentContrast: boolean,
    currentScale: "standard" | "large" | "xlarge"
  ) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    // 1. Theme
    if (currentTheme === "dark") {
      root.classList.add("dark-theme");
    } else {
      root.classList.remove("dark-theme");
    }

    // 2. High Contrast
    if (currentContrast) {
      root.classList.add("high-contrast-theme");
    } else {
      root.classList.remove("high-contrast-theme");
    }

    // 3. Font Scale
    root.classList.remove("font-scale-large", "font-scale-xlarge");
    if (currentScale === "large") {
      root.classList.add("font-scale-large");
    } else if (currentScale === "xlarge") {
      root.classList.add("font-scale-xlarge");
    }
  };

  const handleThemeChange = (newTheme: "light" | "dark") => {
    setTheme(newTheme);
    localStorage.setItem("arase:accessibility:theme", newTheme);
    applyPreferences(newTheme, highContrast, fontScale);
  };

  const handleContrastToggle = () => {
    const nextContrast = !highContrast;
    setHighContrast(nextContrast);
    localStorage.setItem("arase:accessibility:contrast", String(nextContrast));
    applyPreferences(theme, nextContrast, fontScale);
  };

  const handleScaleChange = (newScale: "standard" | "large" | "xlarge") => {
    setFontScale(newScale);
    localStorage.setItem("arase:accessibility:scale", newScale);
    applyPreferences(theme, highContrast, newScale);
  };

  return (
    <div
      ref={panelRef}
      className="accessibility-toolbar-container"
      style={{
        position: "relative",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Header Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "5px",
          backgroundColor: "transparent",
          color: "var(--text-secondary, #64748b)",
          border: "none",
          borderRadius: "8px",
          padding: "6px 10px",
          fontWeight: 600,
          fontSize: "0.78rem",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
        className="hover:bg-slate-100"
        aria-label="Accessibility options"
        title="Accessibility options"
      >
        <Eye size={16} />
        <ChevronDown size={12} style={{ transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className={`absolute ${alignOffset} z-[9999] origin-bottom-right ${
            direction === 'up' ? 'bottom-[calc(100%+1rem)]' : 'top-[calc(100%+8px)]'
          }`}
          style={{
            width: "260px",
            backgroundColor: theme === "dark" ? "#161e2f" : "#ffffff",
            border: highContrast
              ? "2px solid #000000"
              : `1px solid ${theme === "dark" ? "#2d3748" : "#e2e8f0"}`,
            borderRadius: "12px",
            padding: "14px",
            boxShadow: "0 12px 28px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            color: theme === "dark" ? "#f1f5f9" : "#0f172a",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.8rem",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              color: theme === "dark" ? "#cbd5e1" : "#64748b",
            }}
          >
            Accessibility Options
          </p>

          {/* Theme Selector */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>Theme Mode</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => handleThemeChange("light")}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "8px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  borderRadius: "8px",
                  cursor: "pointer",
                  border: theme === "light"
                    ? "2px solid var(--accent-primary, #3b82f6)"
                    : "1px solid #2d3748",
                  backgroundColor: theme === "light"
                    ? "#eff6ff"
                    : "transparent",
                  color: theme === "light"
                    ? "var(--accent-primary, #3b82f6)"
                    : (theme === "dark" ? "#f1f5f9" : "#64748b"),
                }}
              >
                <Sun size={14} />
                <span>Light</span>
              </button>
              <button
                onClick={() => handleThemeChange("dark")}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "8px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  borderRadius: "8px",
                  cursor: "pointer",
                  border: theme === "dark"
                    ? "2px solid var(--accent-primary, #3b82f6)"
                    : "1px solid #e2e8f0",
                  backgroundColor: theme === "dark"
                    ? "#2d3748"
                    : "transparent",
                  color: theme === "dark"
                    ? "#ffffff"
                    : "#64748b",
                }}
              >
                <Moon size={14} />
                <span>Dark</span>
              </button>
            </div>
          </div>

          {/* High Contrast Toggle */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>High Contrast</span>
            <button
              onClick={handleContrastToggle}
              style={{
                padding: "6px 12px",
                fontSize: "0.7rem",
                fontWeight: 800,
                borderRadius: "20px",
                cursor: "pointer",
                border: highContrast
                  ? "2px solid #ef4444"
                  : `1px solid ${theme === "dark" ? "#2d3748" : "#cbd5e1"}`,
                backgroundColor: highContrast ? "#fee2e2" : "transparent",
                color: highContrast ? "#ef4444" : (theme === "dark" ? "#cbd5e1" : "#475569"),
              }}
            >
              {highContrast ? "Enabled" : "Disabled"}
            </button>
          </div>

          {/* Font Sizer */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>Text Size Scaling</span>
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                onClick={() => handleScaleChange("standard")}
                style={{
                  flex: 1,
                  padding: "6px",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  borderRadius: "6px",
                  cursor: "pointer",
                  border: fontScale === "standard" ? "1.5px solid var(--accent-primary, #3b82f6)" : "1px solid #cbd5e1",
                  backgroundColor: fontScale === "standard" ? "#eff6ff" : "transparent",
                  color: fontScale === "standard" ? "var(--accent-primary, #3b82f6)" : "inherit",
                }}
              >
                100%
              </button>
              <button
                onClick={() => handleScaleChange("large")}
                style={{
                  flex: 1,
                  padding: "6px",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  borderRadius: "6px",
                  cursor: "pointer",
                  border: fontScale === "large" ? "1.5px solid var(--accent-primary, #3b82f6)" : "1px solid #cbd5e1",
                  backgroundColor: fontScale === "large" ? "#eff6ff" : "transparent",
                  color: fontScale === "large" ? "var(--accent-primary, #3b82f6)" : "inherit",
                }}
              >
                112%
              </button>
              <button
                onClick={() => handleScaleChange("xlarge")}
                style={{
                  flex: 1,
                  padding: "6px",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  borderRadius: "6px",
                  cursor: "pointer",
                  border: fontScale === "xlarge" ? "1.5px solid var(--accent-primary, #3b82f6)" : "1px solid #cbd5e1",
                  backgroundColor: fontScale === "xlarge" ? "#eff6ff" : "transparent",
                  color: fontScale === "xlarge" ? "var(--accent-primary, #3b82f6)" : "inherit",
                }}
              >
                125%
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
