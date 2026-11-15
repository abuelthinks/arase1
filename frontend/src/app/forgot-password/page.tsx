"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            await api.post("/api/auth/password-reset/", { email });
            setSent(true);
        } catch (err: any) {
            if (err.response?.status === 429) {
                setError("Too many reset requests. Please wait a while and try again.");
            } else {
                setError(err.response?.data?.error || "Couldn't send the reset email. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-center" style={{ minHeight: "100vh", padding: "2rem" }}>
            <div className="glass-panel" style={{ width: "100%", maxWidth: "420px", padding: "2.5rem" }}>
                {sent ? (
                    <div className="text-center">
                        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem", color: "var(--accent-primary)" }}>
                            <MailCheck size={40} />
                        </div>
                        <h2 style={{ marginBottom: "0.5rem", fontSize: "1.5rem", color: "var(--text-primary)" }}>
                            Check your email
                        </h2>
                        <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
                            If an account exists for <strong>{email}</strong>, we sent a link to reset your password. It expires in 1 hour.
                        </p>
                        <Link
                            href="/login"
                            className="text-[var(--accent-primary)] transition-colors hover:text-[var(--text-primary)]"
                            style={{ textDecoration: "none", fontSize: "0.95rem" }}
                        >
                            Back to sign in
                        </Link>
                    </div>
                ) : (
                    <>
                        <h2 className="text-center" style={{ marginBottom: "0.5rem", fontSize: "1.8rem", color: "var(--accent-primary)" }}>
                            Forgot Password
                        </h2>
                        <p className="text-center" style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
                            Enter your email and we'll send you a reset link
                        </p>

                        {error && (
                            <div className="bg-danger-soft text-danger border border-danger-line" style={{ padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit}>
                            <div className="form-group" style={{ marginBottom: "2rem" }}>
                                <label className="form-label" htmlFor="email">Email</label>
                                <input
                                    id="email"
                                    type="email"
                                    className="form-input"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your email address"
                                    autoComplete="email"
                                    required
                                />
                            </div>

                            <Button type="submit" style={{ width: "100%", padding: "12px" }} disabled={loading}>
                                {loading ? "Sending..." : "Send Reset Link"}
                            </Button>
                        </form>

                        <p className="text-center" style={{ marginTop: "1.5rem", marginBottom: 0 }}>
                            <Link
                                href="/login"
                                className="text-[var(--accent-primary)] transition-colors hover:text-[var(--text-primary)]"
                                style={{ textDecoration: "none", fontSize: "0.95rem" }}
                            >
                                Back to sign in
                            </Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
