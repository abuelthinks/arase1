"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

interface AssignedStudent {
    id: number;
    first_name: string;
    last_name: string;
    grade: string;
    status: string;
}

interface UserData {
    id: number;
    username: string;
    email: string;
    role: string;
    first_name: string;
    last_name: string;
    specialty: string;
    phone_number?: string;
    is_phone_verified?: boolean;
    assigned_students_count: number;
    assigned_students: AssignedStudent[];
    last_login?: string;
}

const roleConfig: Record<string, { bg: string; color: string }> = {
    ADMIN:      { bg: "#ede9fe", color: "#5b21b6" },
    TEACHER:    { bg: "#dbeafe", color: "#1e40af" },
    SPECIALIST: { bg: "#d1fae5", color: "#065f46" },
    PARENT:     { bg: "#fef3c7", color: "#92400e" },
};

const statusColors: Record<string, { bg: string; color: string }> = {
    "PENDING_ASSESSMENT":    { bg: "#fce7f3", color: "#9d174d" },
    "ASSESSMENT_SCHEDULED": { bg: "#fef3c7", color: "#92400e" },
    "ASSESSED":     { bg: "#dbeafe", color: "#1e40af" },
    "ENROLLED":     { bg: "#dcfce7", color: "#14532d" },
    "ARCHIVED":   { bg: "#f1f5f9", color: "#64748b" },
};

// Module-level cache: persists across navigations within the same browser session
const profileCache = new Map<string, UserData>();

export default function UserProfile() {
    const { id } = useParams();
    const router = useRouter();
    const { user: authUser } = useAuth();
    const cacheKey = String(id);
    const cached = id ? profileCache.get(cacheKey) ?? null : null;

    const [user, setUser] = useState<UserData | null>(cached);
    const [loading, setLoading] = useState(cached === null);
    const [error, setError] = useState("");

    const isAdmin = authUser?.role === "ADMIN";
    const backHref = isAdmin ? "/dashboard?tab=users" : "/dashboard";
    const backLabel = isAdmin ? "System Users" : "Dashboard";

    const [specialty, setSpecialty] = useState("");
    const [savingSpecialty, setSavingSpecialty] = useState(false);
    const [specialtySaved, setSpecialtySaved] = useState(false);
    
    // Mock States for UI depth
    const [isEditingProfile, setIsEditingProfile] = useState(false);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await api.get(`/api/users/${id}/`);
                profileCache.set(cacheKey, res.data);
                setUser(res.data);
                setSpecialty(res.data.specialty || "");
            } catch (err: any) {
                if (!profileCache.has(cacheKey)) {
                    setError(err.response?.data?.detail || "Failed to load user profile.");
                }
            } finally {
                setLoading(false);
            }
        };
        if (id) fetchUser();
    }, [id]);

    if (loading) return <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading profile...</div>;
    if (error)   return <div style={{ padding: "3rem", textAlign: "center", color: "#dc2626" }}>{error}</div>;
    if (!user)   return <div style={{ padding: "3rem", textAlign: "center" }}>User not found.</div>;

    const displayName = (user.first_name || user.last_name)
        ? `${user.first_name} ${user.last_name}`.trim()
        : user.username;

    const initials = displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    const role = user.role?.toUpperCase() || "UNKNOWN";
    const roleBadge = roleConfig[role] ?? { bg: "#f1f5f9", color: "#475569" };

    const activeCount = user.assigned_students?.filter(s => s.status === "ENROLLED").length || 0;
    const pendingCount = user.assigned_students?.filter(s => ["PENDING_ASSESSMENT", "ASSESSMENT_SCHEDULED"].includes(s.status)).length || 0;

    // Static mock data for Clinical UI
    const mockCredentials = role === "SPECIALIST" ? ["SLP-CCC License #102938", "State Board Certified"] : (role === "TEACHER" ? ["M.Ed Special Education", "State Credential #9821"] : []);
    const mockActivities = [
        { type: "report", action: "generated a report for", target: "Ethan Santos", time: "2 hours ago" },
        { type: "note", action: "logged session notes for", target: "Sophia Lin", time: "Yesterday" },
        { type: "iep", action: "updated IEP draft for", target: "Marcus Johnson", time: "3 days ago" },
    ];


    return (
        <div className="max-w-7xl mx-auto pb-16 px-4">

            {/* Breadcrumb Nav / Site Header */}
            <div className="hidden md:flex" style={{ marginBottom: "2rem", justifyContent: "space-between", alignItems: "center", background: "white", padding: "12px 20px", borderRadius: "12px", border: "1px solid var(--border-light)", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <button type="button" onClick={() => router.back()}
                        className="btn-slate"
                        style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                    >
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back
                    </button>
                    <span style={{ color: "#cbd5e1" }}>/</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{backLabel}</span>
                    <span style={{ color: "#cbd5e1" }}>/</span>
                    <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "0.95rem" }}>{displayName}</span>
                </div>
                
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 0 2px #dcfce7" }}></span>
                    Active Now (Last Login: Today, 9:24 AM)
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* ── Left Sidebar: Context & Actions ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }} className="lg:col-span-1">
                    
                    {/* Main Profile Info */}
                    <div className="glass-panel" style={{ background: "white", borderRadius: "14px", padding: "1.75rem", border: "1px solid var(--border-light)" }}>
                        
                        <div className="flex flex-col md:flex-row lg:flex-col items-center gap-6">
                            {/* Avatar & Name */}
                            <div className="flex flex-col items-center text-center flex-shrink-0 md:w-1/3 lg:w-full">
                                <div style={{
                                    width: "80px", height: "80px", borderRadius: "50%",
                                    background: roleBadge.bg, color: roleBadge.color,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "1.8rem", fontWeight: 700, marginBottom: "1rem",
                                    boxShadow: "0 4px 10px rgba(0,0,0,0.05)", border: `2px solid ${roleBadge.bg}`
                                }}>
                                    {initials}
                                </div>

                                <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", margin: "0 0 6px" }}>
                                    {displayName}
                                </h1>

                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{
                                        display: "inline-block",
                                        fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
                                        letterSpacing: "0.5px", padding: "4px 10px", borderRadius: "999px",
                                        background: roleBadge.bg, color: roleBadge.color,
                                    }}>
                                        {user.role}
                                    </span>
                                </div>
                            </div>

                            {/* Details List */}
                            <div className="flex-1 w-full flex flex-col justify-center">
                                <div style={{ background: "#f8fafc", borderRadius: "10px", border: "1px solid var(--border-light)", overflow: "hidden" }}>
                                    {[
                                        { label: "Email", value: user.email },
                                        ...(user.username !== user.email ? [{ label: "Username", value: `@${user.username}` }] : []),
                                        { 
                                            label: "Phone", 
                                            value: user.phone_number ? (
                                                <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
                                                    <span>{user.phone_number}</span>
                                                    {user.is_phone_verified ? (
                                                        <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 6px", background: "#dcfce7", color: "#16a34a", borderRadius: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                                                            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                                                            Verified
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 6px", background: "#fef3c7", color: "#d97706", borderRadius: "12px" }}>
                                                            Unverified
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span style={{ fontStyle: "italic", color: "#94a3b8" }}>Not provided</span>
                                            )
                                        }
                                    ].map(({ label, value }, idx, arr) => (
                                        <div key={label} style={{ 
                                            display: "flex", justifyContent: "space-between", alignItems: "center",
                                            padding: "12px 16px",
                                            borderBottom: idx < arr.length - 1 ? "1px solid var(--border-light)" : "none",
                                            fontSize: "0.85rem"
                                        }}>
                                            <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{label}</span>
                                            <div style={{ color: "var(--text-primary)", fontWeight: 600, wordBreak: "break-all", textAlign: "right" }}>{value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                            {/* Specialty System */}
                            {(role === "SPECIALIST" || role === "TEACHER") && (
                                <div style={{ marginTop: "1rem" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                        <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                            Registered Specialty
                                        </span>
                                        {isAdmin && (
                                            <button 
                                                onClick={() => setIsEditingProfile(!isEditingProfile)}
                                                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "2px" }}
                                                className="hover:text-blue-600 transition-colors"
                                                title="Edit Specialty"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                                            </button>
                                        )}
                                    </div>
                                    
                                    {isEditingProfile && isAdmin ? (

                                        <div style={{ display: "flex", gap: "6px", flexDirection: "column" }}>
                                            <input
                                                type="text"
                                                value={specialty}
                                                onChange={e => { setSpecialty(e.target.value); setSpecialtySaved(false); }}
                                                placeholder="e.g. Speech Therapy"
                                                style={{
                                                    width: "100%", fontSize: "0.85rem", padding: "8px 12px",
                                                    borderRadius: "6px", border: "1px solid #cbd5e1",
                                                    outline: "none", color: "var(--text-primary)", background: "#f8fafc"
                                                }}
                                            />
                                            <button
                                                disabled={savingSpecialty}
                                                onClick={async () => {
                                                    setSavingSpecialty(true);
                                                    try {
                                                        await api.patch(`/api/users/${id}/`, { specialty });
                                                        profileCache.delete(cacheKey);
                                                        setSpecialtySaved(true);
                                                        setIsEditingProfile(false);
                                                    } catch { /* ignore */ }
                                                    setSavingSpecialty(false);
                                                }}
                                                className="btn-primary"
                                                style={{ width: "100%" }}
                                            >
                                                {savingSpecialty ? "Saving..." : "Save Specialty"}
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                            {specialty ? specialty.split(',').map(tag => (
                                                <span key={tag} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", padding: "4px 10px", borderRadius: "16px", fontSize: "0.8rem", fontWeight: 600, color: "#334155" }}>
                                                    {tag.trim()}
                                                </span>
                                            )) : (
                                                <span style={{ fontSize: "0.85rem", color: "#94a3b8", fontStyle: "italic" }}>Not configured</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                    </div>

                    {/* Verification / Credentials Card */}
                    {mockCredentials.length > 0 && (
                        <div className="glass-panel" style={{ background: "white", borderRadius: "14px", padding: "1.5rem", border: "1px solid var(--border-light)" }}>
                            <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 1rem", display: "flex", alignItems: "center", gap: "8px" }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#10b981" }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                Clinical Credentials
                            </h3>
                            <ul style={{ padding: 0, margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
                                {mockCredentials.map((cred, i) => (
                                    <li key={i} style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                                        <span style={{ color: "#94a3b8", marginTop: "2px" }}>•</span>
                                        {cred}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Account Management Actions */}
                    {isAdmin && (
                        <div className="glass-panel" style={{ background: "white", borderRadius: "14px", padding: "1.5rem", border: "1px solid var(--border-light)" }}>
                            <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 1rem", display: "flex", alignItems: "center", gap: "8px" }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#64748b" }}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                                Account Actions
                            </h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                <button className="btn-slate" style={{ width: "100%" }}>
                                    Reset Password
                                </button>
                                <button className="btn-red" style={{ width: "100%" }}>
                                    Deactivate Account
                                </button>
                            </div>
                        </div>
                    )}

                </div>

                {/* ── Main Data & Workflow Area ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }} className="lg:col-span-2">
                    
                    {/* Assigned Students Management */}
                    <div className="glass-panel" style={{ background: "white", borderRadius: "14px", border: "1px solid var(--border-light)", overflow: "hidden" }}>
                        <div style={{ padding: "1.25rem 1.75rem", borderBottom: "1px solid var(--border-light)", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                            <div>
                                <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>
                                    Assigned Students
                                </h2>
                                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                    {activeCount} Active, {pendingCount} Pending
                                </p>
                            </div>
                            

                        </div>

                        <div style={{ padding: "1.5rem 1.75rem" }}>
                            {user.assigned_students_count === 0 ? (
                                <div style={{ textAlign: "center", padding: "3rem 1rem", border: "1px dashed #cbd5e1", borderRadius: "8px", background: "#f8fafc" }}>
                                    <svg style={{ width: 42, height: 42, margin: "0 auto 12px", color: "#94a3b8" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <p style={{ fontSize: "0.95rem", color: "#64748b", fontWeight: 500, margin: 0 }}>No students currently assigned to this user's caseload.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="hidden md:block" style={{ overflowX: "auto", border: "1px solid var(--border-light)", borderRadius: "8px" }}>
                                        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                                            <thead>
                                                <tr>
                                                    {["Name", "Grade", "Status"].map(h => (
                                                        <th key={h} style={{
                                                            padding: "12px 16px",
                                                            fontSize: "0.75rem", fontWeight: 700,
                                                            textTransform: "uppercase", letterSpacing: "0.5px",
                                                            color: "var(--text-secondary)",
                                                            borderBottom: "2px solid var(--border-light)",
                                                            background: "#f8fafc",
                                                        }}>
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[...user.assigned_students].sort((a, b) => b.id - a.id).map(student => {
                                                    const badge = statusColors[student.status?.toUpperCase()] ?? { bg: "#f1f5f9", color: "#475569" };
                                                    return (
                                                        <tr key={student.id} style={{ borderBottom: "1px solid var(--border-light)" }} className="hover:bg-slate-50 transition-colors">
                                                            <td style={{ padding: "14px 16px", fontWeight: 600 }}>
                                                                <Link href={`/students/${student.id}`} style={{ color: "#2563eb", textDecoration: "none" }} className="hover:underline">
                                                                    {student.first_name} {student.last_name}
                                                                </Link>
                                                            </td>
                                                            <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                                                                {student.grade || "TBD"}
                                                            </td>
                                                            <td style={{ padding: "14px 16px" }}>
                                                                <span style={{
                                                                    fontSize: "0.72rem", fontWeight: 700,
                                                                    textTransform: "uppercase", letterSpacing: "0.5px",
                                                                    padding: "4px 10px", borderRadius: "999px",
                                                                    background: badge.bg, color: badge.color,
                                                                }}>
                                                                    {student.status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="md:hidden flex flex-col gap-3">
                                        {[...user.assigned_students].sort((a, b) => b.id - a.id).map(student => {
                                            const badge = statusColors[student.status?.toUpperCase()] ?? { bg: "#f1f5f9", color: "#475569" };
                                            return (
                                                <div key={student.id} className="bg-white rounded-xl border border-slate-200 p-4 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-2">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="flex flex-col">
                                                            <Link href={`/students/${student.id}`} className="font-bold text-[var(--text-primary)] no-underline text-[1.05rem] hover:text-blue-600 transition-colors">
                                                                {student.first_name} {student.last_name}
                                                            </Link>
                                                            <span className="text-sm text-slate-500 mt-0.5">{student.grade || "Grade: TBD"}</span>
                                                        </div>
                                                        <span style={{ fontSize: "0.65rem", fontWeight: "bold", padding: "4px 8px", borderRadius: "12px", textTransform: "uppercase", background: badge.bg, color: badge.color, textAlign: "center", whiteSpace: "nowrap" }}>
                                                            {student.status?.replace(/_/g, " ")}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Recent Activity Feed */}
                    <div className="glass-panel" style={{ background: "white", borderRadius: "14px", border: "1px solid var(--border-light)", overflow: "hidden" }}>
                        <div style={{ padding: "1.25rem 1.75rem", borderBottom: "1px solid var(--border-light)", background: "#f8fafc" }}>
                            <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#64748b" }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                                Recent Activity
                            </h2>
                        </div>
                        <div style={{ padding: "1.5rem 1.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                            {mockActivities.map((act, idx) => {
                                const isReport = act.type === "report";
                                const isNote = act.type === "note";
                                const isIEP = act.type === "iep";
                                
                                return (
                                    <div key={idx} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                                        <div style={{ 
                                            width: "28px", height: "28px", borderRadius: "50%", 
                                            background: isReport ? "#dcfce7" : isNote ? "#fef3c7" : "#f3e8ff", 
                                            color: isReport ? "#16a34a" : isNote ? "#d97706" : "#9333ea",
                                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 
                                        }}>
                                            {isReport && <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                                            {isNote && <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>}
                                            {isIEP && <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>}
                                        </div>
                                        <div style={{ flex: 1, paddingTop: "2px" }}>
                                            <p style={{ margin: "0 0 4px", fontSize: "0.9rem", color: "var(--text-primary)" }}>
                                                <strong style={{ fontWeight: 600 }}>{displayName.split(" ")[0]}</strong> {act.action} <strong style={{ fontWeight: 600 }}>{act.target}</strong>
                                            </p>
                                            <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 500 }}>{act.time}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            <Link href={`/users/${id}/activity`} style={{ alignSelf: "flex-start", marginTop: "0.5rem", color: "#2563eb", fontSize: "0.85rem", fontWeight: 600, textDecoration: "none", padding: 0 }} className="hover:underline">
                                View Full History →
                            </Link>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
