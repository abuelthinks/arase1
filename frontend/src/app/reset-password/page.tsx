"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, Eye, EyeOff } from "lucide-react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";

const passwordToggleStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    right: "12px",
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "var(--text-secondary)",
};

const linkStyle: React.CSSProperties = {
    textDecoration: "none",
    fontSize: "0.95rem",
};

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const uid = searchParams.get("uid") || "";
    const token = searchParams.get("token") || "";

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setShowPassword(false);
        setShowConfirmPassword(false);

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            await api.post("/api/auth/password-reset/confirm/", { uid, token, password });
            setSuccess(true);
            setTimeout(() => router.push("/login"), 3000);
        } catch (err: any) {
            const data = err.response?.data;
            if (err.response?.status === 429) {
                setError("Too many attempts. Please wait a while and try again.");
            } else {
                setError(data?.error || data?.password?.join(" ") || "Couldn't reset your password. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    if (!uid || !token) {
        return (
            <div className="text-center">
                <h2 style={{ marginBottom: "0.5rem", fontSize: "1.5rem", color: "var(--text-primary)" }}>Invalid Link</h2>
                <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
                    This reset link is incomplete. Please request a new one.
                </p>
                <Link href="/forgot-password" className="text-[var(--accent-primary)] transition-colors hover:text-[var(--text-primary)]" style={linkStyle}>
                    Request a new link
                </Link>
            </div>
        );
    }

    if (success) {
        return (
            <div className="text-center">
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem", color: "var(--accent-primary)" }}>
                    <CircleCheck size={40} />
                </div>
                <h2 style={{ marginBottom: "0.5rem", fontSize: "1.5rem", color: "var(--text-primary)" }}>Password Updated</h2>
                <p style={{ color: "var(--text-secondary)", margin: 0 }}>Redirecting to sign in...</p>
            </div>
        );
    }

    return (
        <>
            <h2 className="text-center" style={{ marginBottom: "0.5rem", fontSize: "1.8rem", color: "var(--accent-primary)" }}>
                Reset Password
            </h2>
            <p className="text-center" style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
                Choose a new password for your account
            </p>

            {error && (
                <div className="bg-danger-soft text-danger border border-danger-line" style={{ padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label className="form-label" htmlFor="password">New Password</label>
                    <div style={{ position: "relative" }}>
                        <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            className="form-input"
                            style={{ paddingRight: "44px" }}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="At least 8 characters"
                            autoComplete="new-password"
                            minLength={8}
                            required
                        />
                        {password.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                aria-pressed={showPassword}
                                style={passwordToggleStyle}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        )}
                    </div>
                </div>

                <div className="form-group" style={{ marginBottom: "2rem" }}>
                    <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
                    <div style={{ position: "relative" }}>
                        <input
                            id="confirmPassword"
                            type={showConfirmPassword ? "text" : "password"}
                            className="form-input"
                            style={{ paddingRight: "44px" }}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter your new password"
                            autoComplete="new-password"
                            required
                        />
                        {confirmPassword.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword((v) => !v)}
                                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                                aria-pressed={showConfirmPassword}
                                style={passwordToggleStyle}
                            >
                                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        )}
                    </div>
                </div>

                <Button type="submit" style={{ width: "100%", padding: "12px" }} disabled={loading}>
                    {loading ? "Saving..." : "Set New Password"}
                </Button>
            </form>

            <p className="text-center" style={{ marginTop: "1.5rem", marginBottom: 0 }}>
                <Link href="/login" className="text-[var(--accent-primary)] transition-colors hover:text-[var(--text-primary)]" style={linkStyle}>
                    Back to sign in
                </Link>
            </p>
        </>
    );
}

export default function ResetPasswordPage() {
    return (
        <div className="flex-center" style={{ minHeight: "100vh", padding: "2rem" }}>
            <div className="glass-panel" style={{ width: "100%", maxWidth: "420px", padding: "2.5rem" }}>
                <Suspense fallback={<p className="text-center" style={{ color: "var(--text-muted)", margin: 0 }}>Loading...</p>}>
                    <ResetPasswordForm />
                </Suspense>
            </div>
        </div>
    );
}
