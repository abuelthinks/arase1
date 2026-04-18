"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const router = useRouter();
    const { login } = useAuth();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            // login() calls the API and sets HttpOnly cookies server-side
            const authenticatedUser = await login(username, password);
            const landingRoute = ["ADMIN", "TEACHER", "SPECIALIST"].includes(authenticatedUser.role)
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
                    <div style={{ backgroundColor: "#fef2f2", color: "var(--danger)", padding: "12px", borderRadius: "8px", marginBottom: "1.5rem", fontSize: "0.95rem", border: "1px solid #fca5a5" }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="username">Username or Email</label>
                        <input
                            id="username"
                            type="text"
                            className="form-input"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter your username or email"
                            required
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: "2rem" }}>
                        <label className="form-label" htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            className="form-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button type="submit" className="btn-primary" style={{ width: "100%", padding: "12px" }} disabled={loading}>
                        {loading ? "Signing In..." : "Sign In"}
                    </button>
                </form>
            </div>
        </div>
    );
}
