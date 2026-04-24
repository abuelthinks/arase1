"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

interface UserData {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    role: string;
}

const mockFullActivities = [
    { type: "report", action: "generated a report for", target: "Ethan Santos", time: "2 hours ago", details: "Generated Initial Assessment IEP Draft" },
    { type: "note", action: "logged session notes for", target: "Sophia Lin", time: "Yesterday", details: "Session length 45 mins. Status: Progressing." },
    { type: "iep", action: "updated IEP draft for", target: "Marcus Johnson", time: "3 days ago", details: "Adjusted Goal #2 parameters." },
    { type: "login", action: "logged into the system", target: "", time: "4 days ago", details: "IP verified." },
    { type: "report", action: "reviewed report for", target: "Aiden Chen", time: "1 week ago", details: "Approved Final PDF Generation" },
    { type: "note", action: "logged session notes for", target: "Isabella Martinez", time: "1 week ago", details: "Consultation focus." },
    { type: "iep", action: "finalized IEP for", target: "Oliver Smith", time: "2 weeks ago", details: "Ready for parent signature" },
    { type: "system", action: "updated profile specialty", target: "", time: "2 weeks ago", details: "Added AT Specialization" },
];

export default function UserActivityPage() {
    const { id } = useParams();
    const router = useRouter();
    const { user: authUser, loading: authLoading } = useAuth();
    const [user, setUser] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const targetUserId = Number(id);
    const canViewActivity = authUser?.role === "ADMIN" || authUser?.user_id === targetUserId;
    
    useEffect(() => {
        if (authLoading || !id) return;
        if (!canViewActivity) {
            router.replace("/dashboard");
            return;
        }

        const fetchUser = async () => {
            try {
                const res = await api.get(`/api/users/${id}/`);
                setUser(res.data);
            } catch {
                setError("Failed to load user info.");
            } finally {
                setLoading(false);
            }
        };
        fetchUser();
    }, [authLoading, canViewActivity, id, router]);

    if (authLoading || (loading && canViewActivity)) return <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading activity...</div>;
    if (!canViewActivity) return null;
    if (loading) return <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading activity...</div>;
    if (error)   return <div style={{ padding: "3rem", textAlign: "center", color: "#dc2626" }}>{error}</div>;
    if (!user)   return <div style={{ padding: "3rem", textAlign: "center" }}>User not found.</div>;

    const displayName = (user.first_name || user.last_name)
        ? `${user.first_name} ${user.last_name}`.trim()
        : user.username;

    return (
        <ProtectedRoute>
            <div className="max-w-3xl mx-auto pb-16 px-4">
                
                {/* Site Header / Breadcrumbs */}
                <div className="hidden md:flex" style={{ marginBottom: "2rem", justifyContent: "space-between", alignItems: "center", background: "white", padding: "12px 20px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <button type="button" onClick={() => router.back()}
                            style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", color: "#475569", fontWeight: 600, fontSize: "0.85rem", transition: "all 0.2s" }}
                            className="hover:bg-slate-200"
                        >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back
                        </button>
                        <span style={{ color: "#cbd5e1" }}>/</span>
                        <Link href={`/users/${id}`} style={{ color: "var(--text-secondary)", fontSize: "0.9rem", textDecoration: "none" }} className="hover:text-blue-600 hover:underline">
                            {displayName}
                        </Link>
                        <span style={{ color: "#cbd5e1" }}>/</span>
                        <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "0.95rem" }}>Activity Log</span>
                    </div>
                </div>

                <div className="glass-panel" style={{ background: "white", borderRadius: "14px", border: "1px solid var(--border-light)", overflow: "hidden" }}>
                    <div style={{ padding: "1.5rem 1.75rem", borderBottom: "1px solid var(--border-light)", background: "#f8fafc" }}>
                        <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#64748b" }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                            Full Activity History
                        </h2>
                        <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>Complete log of actions performed by {displayName}</p>
                    </div>

                    <div style={{ padding: "1.75rem 2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                        {mockFullActivities.map((act, idx) => {
                            const isReport = act.type === "report";
                            const isNote = act.type === "note";
                            const isIEP = act.type === "iep";
                            const isLogin = act.type === "login";
                            const isSystem = act.type === "system";
                            
                            const bg = isReport ? "#dcfce7" : isNote ? "#fef3c7" : isIEP ? "#f3e8ff" : isSystem ? "#e0f2fe" : "#f1f5f9";
                            const color = isReport ? "#16a34a" : isNote ? "#d97706" : isIEP ? "#9333ea" : isSystem ? "#0284c7" : "#475569";
                            
                            return (
                                <div key={idx} style={{ display: "flex", gap: "16px", alignItems: "flex-start", position: "relative", borderBottom: idx !== mockFullActivities.length - 1 ? "1px solid var(--border-light)" : "none", paddingBottom: idx !== mockFullActivities.length - 1 ? "1.5rem" : "0" }}>
                                    {/* Timeline vertical line connector */}
                                    {idx !== mockFullActivities.length - 1 && (
                                        <div style={{ position: "absolute", left: "18px", top: "36px", bottom: "-1.5rem", width: "2px", background: "var(--border-light)", zIndex: 0 }}></div>
                                    )}
                                    <div style={{ 
                                        width: "36px", height: "36px", borderRadius: "50%", 
                                        background: bg, color: color,
                                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                        boxShadow: `0 0 0 4px white`, zIndex: 1
                                    }}>
                                        {isReport && <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                                        {isNote && <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>}
                                        {isIEP && <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>}
                                        {isLogin && <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg>}
                                        {isSystem && <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
                                    </div>
                                    <div style={{ flex: 1, paddingTop: "6px", paddingBottom: "10px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                                            <p style={{ margin: "0 0 6px", fontSize: "0.95rem", color: "var(--text-primary)" }}>
                                                <strong style={{ fontWeight: 600 }}>{displayName.split(" ")[0]}</strong> {act.action} {act.target && <strong style={{ fontWeight: 600 }}>{act.target}</strong>}
                                            </p>
                                            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600, whiteSpace: "nowrap" }}>{act.time}</span>
                                        </div>
                                        {act.details && (
                                            <div style={{ padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "8px", position: "relative" }}>
                                                {act.details}
                                                <div style={{ position: "absolute", top: "-5px", left: "16px", width: "8px", height: "8px", background: "#f8fafc", borderLeft: "1px solid #e2e8f0", borderTop: "1px solid #e2e8f0", transform: "rotate(45deg)" }}></div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>
        </ProtectedRoute>
    );
}
