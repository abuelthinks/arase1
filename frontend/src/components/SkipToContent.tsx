"use client";

export default function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="skip-to-content"
      style={{
        position: "absolute",
        top: "-100%",
        left: "16px",
        zIndex: 100000,
        padding: "12px 24px",
        backgroundColor: "var(--accent-primary, #3b82f6)",
        color: "#ffffff",
        fontWeight: 700,
        fontSize: "0.9rem",
        borderRadius: "0 0 8px 8px",
        textDecoration: "none",
        transition: "top 0.2s ease",
      }}
      onFocus={(e) => { e.currentTarget.style.top = "0"; }}
      onBlur={(e) => { e.currentTarget.style.top = "-100%"; }}
    >
      Skip to main content
    </a>
  );
}
