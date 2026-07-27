"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import Button from "@/components/ui/Button";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const router = useRouter();
    const { login } = useAuth();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setShowPassword(false);

        try {
            // login() calls the API and sets HttpOnly cookies server-side
            const authenticatedUser = await login(email, password);
            const landingRoute = authenticatedUser.role === "SPECIALIST" && authenticatedUser.specialist_onboarding_complete === false
                ? "/specialist-onboarding"
                : authenticatedUser.role === "ADMIN"
                    ? "/dashboard"
                    : ["TEACHER", "SPECIALIST"].includes(authenticatedUser.role)
                        ? "/workspace"
                        : "/dashboard";
            router.push(landingRoute);
        } catch (err: any) {
            const status = err.response?.status;
            const detail = err.response?.data?.detail || err.response?.data?.error;

            if (!status) {
                setError("Login request could not reach the server. Check your deployed API URL and auth cookie configuration.");
            } else {
                setError(detail || "Invalid credentials. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-center" style={{ minHeight: "100vh", padding: "2rem" }}>
            <div className="glass-panel" style={{ width: "100%", maxWidth: "420px", padding: "2.5rem" }}>
                <h2 className="text-center" style={{ marginBottom: "0.5rem", fontSize: "1.8rem", color: "var(--accent-primary)" }}>
                    Welcome Back
                </h2>
                <p className="text-center" style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
                    Sign in to access student reports
                </p>

                {error && (
                    <div className="bg-danger-soft text-danger border border-danger-line" style={{ padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin}>
                    <div className="form-group">
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

                    <div className="form-group" style={{ marginBottom: "2rem" }}>
                        <label className="form-label" htmlFor="password">Password</label>
                        <div style={{ position: "relative" }}>
                            <input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                className="form-input"
                                style={{ paddingRight: "44px" }}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                required
                            />
                            {password.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                aria-pressed={showPassword}
                                style={{
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
                                }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                            )}
                        </div>
                    </div>

                    <Button type="submit" style={{ width: "100%", padding: "12px" }} disabled={loading}>
                        {loading ? "Signing In..." : "Sign In"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
