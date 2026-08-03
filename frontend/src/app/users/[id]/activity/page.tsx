"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

interface UserData {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
}

interface ActivityEvent {
    id: number;
    event_type: string;
    student_name: string;
    actor_name: string;
    title: string;
    message: string;
    created_at: string;
}

type EventKind = "report" | "note" | "student" | "account" | "system";

// ActivityEvent.EVENT_TYPES has 16 members; they collapse into the five icons
// this timeline draws.
const EVENT_KIND: Record<string, EventKind> = {
    REPORT_QUEUED: "report",
    REPORT_GENERATING: "report",
    REPORT_READY: "report",
    REPORT_FAILED: "report",
    REPORT_FINALIZED: "report",
    FORM_SUBMITTED: "note",
    FORM_FINALIZED: "note",
    DIAGNOSTIC_UPLOADED: "note",
    STUDENT_CREATED: "student",
    STUDENT_UPDATED: "student",
    STUDENT_STATUS_CHANGED: "student",
    TEAM_UPDATED: "student",
    SCHEDULE_UPDATED: "student",
    USER_REGISTERED: "account",
    ONBOARDING_COMPLETED: "account",
    SYSTEM: "system",
};

function eventKind(eventType: string): EventKind {
    return EVENT_KIND[eventType] || "system";
}

function kindColors(kind: EventKind, failed: boolean): { bg: string; color: string } {
    if (failed) return { bg: "var(--bg-danger-light)", color: "var(--danger)" };
    switch (kind) {
        case "report":
            return { bg: "var(--bg-success-light)", color: "var(--success)" };
        case "note":
            return { bg: "var(--bg-warning-light)", color: "var(--warning)" };
        case "student":
            return { bg: "#f3e8ff", color: "#9333ea" };
        case "account":
            return { bg: "#e0f2fe", color: "#0284c7" };
        default:
            return { bg: "var(--bg-neutral-light)", color: "var(--text-secondary)" };
    }
}

function formatRelativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const minutes = Math.floor((Date.now() - then) / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) {
        const weeks = Math.floor(days / 7);
        return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
    }
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function UserActivityPage() {
    const { id } = useParams();
    const router = useRouter();
    const { user: authUser, loading: authLoading } = useAuth();
    const [user, setUser] = useState<UserData | null>(null);
    const [events, setEvents] = useState<ActivityEvent[]>([]);
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

        const fetchActivity = async () => {
            try {
                const [userRes, eventsRes] = await Promise.all([
                    api.get(`/api/users/${id}/`),
                    api.get("/api/activity/", { params: { actor_id: id, limit: 100 } }),
                ]);
                setUser(userRes.data);
                setEvents(eventsRes.data?.events || []);
            } catch {
                setError("Failed to load activity.");
            } finally {
                setLoading(false);
            }
        };
        fetchActivity();
    }, [authLoading, canViewActivity, id, router]);

    if (authLoading || (loading && canViewActivity)) return <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading activity...</div>;
    if (!canViewActivity) return null;
    if (loading) return <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading activity...</div>;
    if (error)   return <div style={{ padding: "3rem", textAlign: "center", color: "var(--danger)" }}>{error}</div>;
    if (!user)   return <div style={{ padding: "3rem", textAlign: "center" }}>User not found.</div>;

    const displayName = (user.first_name || user.last_name)
        ? `${user.first_name} ${user.last_name}`.trim()
        : user.email;

    return (
        <ProtectedRoute allowedRoles={["ADMIN", "TEACHER", "SPECIALIST"]}>
            <div className="max-w-3xl mx-auto pb-16 px-4">

                {/* Site Header / Breadcrumbs */}
                <div className="hidden md:flex" style={{ marginBottom: "2rem", justifyContent: "space-between", alignItems: "center", background: "var(--bg-secondary)", padding: "12px 20px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <button type="button" onClick={() => router.back()}
                            style={{ background: "var(--bg-primary)", border: "1px solid var(--border-light)", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.85rem", transition: "all 0.2s" }}
                            className="hover:bg-subtle-soft"
                        >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back
                        </button>
                        <span style={{ color: "var(--text-muted)" }}>/</span>
                        <Link href={`/users/${id}`} style={{ color: "var(--text-secondary)", fontSize: "0.9rem", textDecoration: "none" }} className="hover:text-indigo-600 hover:underline">
                            {displayName}
                        </Link>
                        <span style={{ color: "var(--text-muted)" }}>/</span>
                        <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "0.95rem" }}>Activity Log</span>
                    </div>
                </div>

                <div className="glass-panel" style={{ background: "var(--bg-secondary)", borderRadius: "14px", border: "1px solid var(--border-light)", overflow: "hidden" }}>
                    <div style={{ padding: "1.5rem 1.75rem", borderBottom: "1px solid var(--border-light)", background: "var(--bg-primary)" }}>
                        <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-secondary)" }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                            Full Activity History
                        </h2>
                        <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>Complete log of actions performed by {displayName}</p>
                    </div>

                    {events.length === 0 ? (
                        <div style={{ padding: "3.5rem 2rem", textAlign: "center" }}>
                            <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>No activity recorded yet</p>
                            <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                Events appear here as {displayName} works in the system.
                            </p>
                        </div>
                    ) : (
                        <div style={{ padding: "1.75rem 2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                            {events.map((act, idx) => {
                                const kind = eventKind(act.event_type);
                                const failed = act.event_type === "REPORT_FAILED";
                                const { bg, color } = kindColors(kind, failed);
                                const isLast = idx === events.length - 1;

                                return (
                                    <div key={act.id} style={{ display: "flex", gap: "16px", alignItems: "flex-start", position: "relative", borderBottom: !isLast ? "1px solid var(--border-light)" : "none", paddingBottom: !isLast ? "1.5rem" : "0" }}>
                                        {/* Timeline vertical line connector */}
                                        {!isLast && (
                                            <div style={{ position: "absolute", left: "18px", top: "36px", bottom: "-1.5rem", width: "2px", background: "var(--border-light)", zIndex: 0 }}></div>
                                        )}
                                        <div style={{
                                            width: "36px", height: "36px", borderRadius: "50%",
                                            background: bg, color: color,
                                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                            boxShadow: `0 0 0 4px var(--bg-secondary)`, zIndex: 1
                                        }}>
                                            {kind === "report" && <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                                            {kind === "note" && <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>}
                                            {kind === "student" && <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>}
                                            {kind === "account" && <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg>}
                                            {kind === "system" && <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
                                        </div>
                                        <div style={{ flex: 1, paddingTop: "6px", paddingBottom: "10px" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                                                <p style={{ margin: "0 0 6px", fontSize: "0.95rem", color: "var(--text-primary)", fontWeight: 600 }}>
                                                    {act.title}
                                                </p>
                                                <span title={new Date(act.created_at).toLocaleString()} style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>
                                                    {formatRelativeTime(act.created_at)}
                                                </span>
                                            </div>
                                            {act.student_name && !act.title.includes(act.student_name) && (
                                                <p style={{ margin: "0 0 6px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                                    Student: <strong style={{ fontWeight: 600 }}>{act.student_name}</strong>
                                                </p>
                                            )}
                                            {act.message && (
                                                <div style={{ padding: "12px 16px", background: "var(--bg-primary)", borderRadius: "8px", border: "1px solid var(--border-light)", fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "8px", position: "relative" }}>
                                                    {act.message}
                                                    <div style={{ position: "absolute", top: "-5px", left: "16px", width: "8px", height: "8px", background: "var(--bg-primary)", borderLeft: "1px solid var(--border-light)", borderTop: "1px solid var(--border-light)", transform: "rotate(45deg)" }}></div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

            </div>
        </ProtectedRoute>
    );
}
