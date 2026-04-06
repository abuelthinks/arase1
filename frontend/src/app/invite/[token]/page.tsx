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
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "var(--bg-light)" }}>
            <div style={{ background: "white", padding: "3rem", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", width: "100%", maxWidth: "450px" }}>
                <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                    <h1 style={{ color: "var(--accent-primary)", margin: "0 0 10px 0" }}>Complete Setup</h1>
                    <p style={{ color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                        Welcome! Please verify your email and set up a secure password below to activate your account.
                    </p>
                </div>

                {error && (
                    <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "10px", borderRadius: "6px", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                    <div>
                        <label style={{ display: "block", marginBottom: "5px", fontSize: "0.9rem", fontWeight: "bold" }}>Email Address</label>
                        <input
                            type="email"
                            disabled
                            style={{ 
                                width: "100%", padding: "10px", borderRadius: "6px", 
                                border: "1px solid #cbd5e1", boxSizing: "border-box",
                                background: "#f1f5f9", color: "#64748b", cursor: "not-allowed"
                            }}
                            value={email}
                        />
                        <span style={{ fontSize: "0.8rem", color: "#94a3b8", display: "block", marginTop: "6px" }}>
                            If you need to use a different email, please contact your administrator for a new invitation.
                        </span>
                    </div>

                    <div style={{ display: "flex", gap: "1rem" }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", marginBottom: "5px", fontSize: "0.9rem", fontWeight: "bold" }}>First Name</label>
                            <input
                                required
                                type="text"
                                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                                value={formData.firstName}
                                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", marginBottom: "5px", fontSize: "0.9rem", fontWeight: "bold" }}>Last Name</label>
                            <input
                                required
                                type="text"
                                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                                value={formData.lastName}
                                onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: "block", marginBottom: "5px", fontSize: "0.9rem", fontWeight: "bold" }}>Phone Number</label>
                        <input
                            required
                            type="tel"
                            pattern="^\+?[0-9\s\-\(\)]{7,15}$"
                            title="Please enter a valid phone number (7-15 digits, plus, hyphens, or spaces)."
                            style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            value={formData.phoneNumber}
                            onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                        />
                    </div>


                    <div>
                        <label style={{ display: "block", marginBottom: "5px", fontSize: "0.9rem", fontWeight: "bold" }}>Create Password</label>
                        <input
                            required
                            type="password"
                            style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                        />
                    </div>

                    <div>
                        <label style={{ display: "block", marginBottom: "5px", fontSize: "0.9rem", fontWeight: "bold" }}>Confirm Password</label>
                        <input
                            required
                            type="password"
                            style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            value={formData.confirmPassword}
                            onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary"
                        style={{ marginTop: "1rem", padding: "12px", width: "100%", fontSize: "1rem", opacity: loading ? 0.7 : 1 }}
                    >
                        {loading ? "Creating Account..." : "Complete Account Setup"}
                    </button>
                </form>
            </div>
        </div>
    );
}
