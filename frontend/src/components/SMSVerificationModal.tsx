"use client";

import { useState } from "react";
import api from "@/lib/api";

type Props = {
    onClose: () => void;
    onVerified: () => void;
};

export default function SMSVerificationModal({ onClose, onVerified }: Props) {
    const [step, setStep] = useState<"request" | "verify">("request");
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleRequestCode = async () => {
        setLoading(true);
        setError("");
        try {
            await api.post("/api/users/send-verification-sms/");
            setStep("verify");
        } catch (err: any) {
            const errData = err.response?.data;
            // Handle the special case where the account has no phone number on file
            if (errData?.error === "no_phone_number") {
                setError("Your account does not have a phone number on file. Please contact the school administrator to update your contact information.");
            } else {
                setError(errData?.error || errData?.detail || "Failed to send SMS code.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            await api.post("/api/users/verify-sms/", { code });
            onVerified();
        } catch (err: any) {
            setError(err.response?.data?.error || "Invalid verification code.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999
        }}>
            <div style={{
                background: "white", padding: "2rem", borderRadius: "12px", width: "400px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
            }}>
                {step === "request" ? (
                    <div style={{ textAlign: "center" }}>
                        <h2 style={{ margin: "0 0 1rem 0", color: "var(--accent-primary)" }}>Verify Phone Number</h2>
                        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
                            We need to verify your phone number to enable SMS notifications and alerts. 
                            We will send a 6-digit code to your registered mobile number.
                        </p>
                        {error && <p style={{ color: "#ef4444", marginBottom: "1rem" }}>{error}</p>}
                        
                        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                            <button className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
                            <button className="btn-primary" onClick={handleRequestCode} disabled={loading}>
                                {loading ? "Sending..." : "Send Code"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleVerifyCode} style={{ textAlign: "center" }}>
                        <h2 style={{ margin: "0 0 1rem 0", color: "var(--accent-primary)" }}>Enter Verification Code</h2>
                        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
                            Please enter the 6-digit code sent to your phone.
                        </p>
                        
                        <input
                            type="text"
                            maxLength={6}
                            required
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            style={{ 
                                display: "block", width: "100%", padding: "12px",
                                fontSize: "1.2rem", textAlign: "center", letterSpacing: "5px",
                                borderRadius: "8px", border: "1px solid #cbd5e1", marginBottom: "1rem",
                                boxSizing: "border-box"
                            }}
                            placeholder="000000"
                        />

                        {error && <p style={{ color: "#ef4444", marginBottom: "1rem" }}>{error}</p>}

                        <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "1rem" }}>
                            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={loading || code.length !== 6}>
                                {loading ? "Verifying..." : "Verify"}
                            </button>
                        </div>
                        
                        <button 
                            type="button" 
                            style={{ background: "none", border: "none", color: "var(--accent-primary)", marginTop: "1.5rem", cursor: "pointer", textDecoration: "underline" }}
                            onClick={handleRequestCode}
                            disabled={loading}
                        >
                            Resend Code
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
