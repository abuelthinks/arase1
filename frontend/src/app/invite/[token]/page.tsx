"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";

export default function AcceptInvitePage() {
    const params = useParams();
    const router = useRouter();
    const token = params.token as string;

    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        phoneNumber: "",
        password: "",
        confirmPassword: ""
    });
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [pageLoading, setPageLoading] = useState(true);
    const [fatalError, setFatalError] = useState("");

    useEffect(() => {
        if (!token) return;
        api.get(`/api/invitations/accept/?token=${token}`)
            .then(res => {
                setEmail(res.data.email);
            })
            .catch(err => {
                setFatalError(err.response?.data?.error || "This invitation link is invalid or has expired.");
            })
            .finally(() => {
                setPageLoading(false);
            });
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (formData.password !== formData.confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            await api.post("/api/invitations/accept/", {
                token: token,
                first_name: formData.firstName,
                last_name: formData.lastName,
                phone_number: formData.phoneNumber,
                password: formData.password
            });
            setSuccess(true);
            setTimeout(() => {
                router.push("/login");
            }, 3000);
        } catch (err: any) {
            setError(err.response?.data?.error || "Failed to accept invitation. The link may be expired or invalid.");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "var(--bg-light)" }}>
                <div style={{ background: "white", padding: "3rem", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", textAlign: "center" }}>
                    <h1 style={{ color: "var(--accent-primary)" }}>Account Created!</h1>
                    <p>Your account has been successfully set up.</p>
                    <p style={{ color: "var(--text-muted)" }}>Redirecting to login...</p>
                </div>
            </div>
        );
    }

    if (pageLoading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "var(--bg-light)" }}>
                <p style={{ color: "var(--text-muted)" }}>Loading invitation details...</p>
            </div>
        );
    }

    if (fatalError) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "var(--bg-light)" }}>
                <div style={{ background: "white", padding: "3rem", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", textAlign: "center", maxWidth: "450px" }}>
                    <div style={{ color: "#ef4444", marginBottom: "1rem" }}>
                        <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ margin: "0 auto" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                    </div>
                    <h1 style={{ color: "#b91c1c", fontSize: "1.5rem", margin: "0 0 10px 0" }}>Invalid Link</h1>
                    <p style={{ color: "var(--text-secondary)", margin: 0 }}>{fatalError}</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)", padding: "1rem" }}>
            <div style={{ background: "rgba(255, 255, 255, 0.8)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", padding: "2rem", borderRadius: "16px", boxShadow: "0 20px 40px -10px rgba(0,0,0,0.05), 0 0 0 1px rgba(255,255,255,0.6) inset", width: "100%", maxWidth: "420px", display: "flex", flexDirection: "column", gap: "1.2rem", transition: "all 0.3s ease" }}>
                
                <div style={{ textAlign: "center" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "42px", height: "42px", borderRadius: "12px", background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)", color: "white", marginBottom: "1rem", boxShadow: "0 6px 12px -4px rgba(59, 130, 246, 0.3)" }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
                    </div>
                    <h1 style={{ color: "#1e293b", margin: "0 0 6px 0", fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.025em" }}>Complete Setup</h1>
                    <p style={{ color: "#64748b", margin: 0, fontSize: "0.9rem", lineHeight: 1.4 }}>
                        Verify your email and create a password.
                    </p>
                </div>

                {error && (
                    <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "10px 14px", borderRadius: "8px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px", border: "1px solid #fee2e2" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>Email Address</label>
                        <input
                            type="email"
                            disabled
                            style={{ 
                                width: "100%", padding: "10px 12px", borderRadius: "8px", 
                                border: "1px solid #e2e8f0", boxSizing: "border-box",
                                background: "#f1f5f9", color: "#64748b", cursor: "not-allowed",
                                fontSize: "0.9rem", outline: "none", transition: "all 0.2s"
                            }}
                            value={email}
                        />
                    </div>

                    <div style={{ display: "flex", gap: "0.75rem" }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", marginBottom: "4px", fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>First Name <span style={{ color: "#ef4444" }}>*</span></label>
                            <input
                                required
                                type="text"
                                autoComplete="given-name"
                                placeholder="Grace"
                                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: "0.9rem", outline: "none", transition: "border-color 0.2s, box-shadow 0.2s, background-color 0.2s" }}
                                onFocus={(e) => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)"; e.target.style.backgroundColor = "#fff"; }}
                                onBlur={(e) => { e.target.style.borderColor = "#cbd5e1"; e.target.style.boxShadow = "none"; e.target.style.backgroundColor = ""; }}
                                value={formData.firstName}
                                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", marginBottom: "4px", fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>Last Name <span style={{ color: "#ef4444" }}>*</span></label>
                            <input
                                required
                                type="text"
                                autoComplete="family-name"
                                placeholder="Doe"
                                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: "0.9rem", outline: "none", transition: "border-color 0.2s, box-shadow 0.2s, background-color 0.2s" }}
                                onFocus={(e) => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)"; e.target.style.backgroundColor = "#fff"; }}
                                onBlur={(e) => { e.target.style.borderColor = "#cbd5e1"; e.target.style.boxShadow = "none"; e.target.style.backgroundColor = ""; }}
                                value={formData.lastName}
                                onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>Phone Number <span style={{ color: "#ef4444" }}>*</span></label>
                        <input
                            required
                            type="tel"
                            autoComplete="tel"
                            placeholder="+1 (555) 123-4567"
                            pattern="^\+?[0-9\s\-\(\)]{7,15}$"
                            title="Please enter a valid phone number (7-15 digits)."
                            style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: "0.9rem", outline: "none", transition: "border-color 0.2s, box-shadow 0.2s, background-color 0.2s" }}
                            onFocus={(e) => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)"; e.target.style.backgroundColor = "#fff"; }}
                            onBlur={(e) => { e.target.style.borderColor = "#cbd5e1"; e.target.style.boxShadow = "none"; e.target.style.backgroundColor = ""; }}
                            value={formData.phoneNumber}
                            onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                        />
                    </div>

                    {/* Hidden username field for password managers */}
                    <input type="text" autoComplete="username" value={email} readOnly style={{ display: 'none' }} />
                    <div style={{ position: "relative" }}>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>Create Password <span style={{ color: "#ef4444" }}>*</span></label>
                        <input
                            required
                            type="password"
                            autoComplete="new-password"
                            placeholder="••••••••"
                            style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: "0.9rem", outline: "none", transition: "border-color 0.2s, box-shadow 0.2s, background-color 0.2s" }}
                            onFocus={(e) => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)"; e.target.style.backgroundColor = "#fff"; }}
                            onBlur={(e) => { e.target.style.borderColor = "#cbd5e1"; e.target.style.boxShadow = "none"; e.target.style.backgroundColor = ""; }}
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                        />
                    </div>

                    <div style={{ position: "relative" }}>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>Confirm Password <span style={{ color: "#ef4444" }}>*</span></label>
                        <input
                            required
                            type="password"
                            autoComplete="new-password"
                            placeholder="••••••••"
                            style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: "0.9rem", outline: "none", transition: "border-color 0.2s, box-shadow 0.2s, background-color 0.2s" }}
                            onFocus={(e) => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)"; e.target.style.backgroundColor = "#fff"; }}
                            onBlur={(e) => { e.target.style.borderColor = "#cbd5e1"; e.target.style.boxShadow = "none"; e.target.style.backgroundColor = ""; }}
                            value={formData.confirmPassword}
                            onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{ 
                            marginTop: "1rem", 
                            padding: "12px", 
                            width: "100%", 
                            fontSize: "0.95rem", 
                            fontWeight: 700,
                            color: "white",
                            background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                            border: "none",
                            borderRadius: "8px",
                            cursor: loading ? "not-allowed" : "pointer",
                            boxShadow: "0 4px 10px 0 rgba(37, 99, 235, 0.3)",
                            transition: "all 0.2s ease",
                            opacity: loading ? 0.8 : 1,
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: "8px"
                        }}
                        onMouseOver={(e) => { if(!loading) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(37,99,235,0.4)"; } }}
                        onMouseOut={(e) => { if(!loading) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 10px 0 rgba(37, 99, 235, 0.3)"; } }}
                    >
                        {loading ? (
                            <>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin_btn 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                Creating Account...
                            </>
                        ) : "Complete Account Setup"}
                    </button>
                    <style dangerouslySetInnerHTML={{__html: `
                        @keyframes spin_btn { 100% { transform: rotate(360deg); } }
                    `}} />
                </form>
            </div>
        </div>
    );
}
