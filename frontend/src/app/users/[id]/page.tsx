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
    assigned_students_count: number;
    assigned_students: AssignedStudent[];
}

const roleConfig: Record<string, { bg: string; color: string }> = {
    ADMIN:      { bg: "#ede9fe", color: "#5b21b6" },
    TEACHER:    { bg: "#dbeafe", color: "#1e40af" },
    SPECIALIST: { bg: "#d1fae5", color: "#065f46" },
    PARENT:     { bg: "#fef3c7", color: "#92400e" },
};

const statusColors: Record<string, { bg: string; color: string }> = {
    "PENDING_ASSESSMENT":   { bg: "#fef3c7", color: "#92400e" },
    "ASSESSMENT_REQUESTED": { bg: "#dbeafe", color: "#1e40af" },
    "ASSESSMENT_SCHEDULED": { bg: "#ede9fe", color: "#5b21b6" },
    "ASSESSED":             { bg: "#d1fae5", color: "#065f46" },
    "ENROLLED":             { bg: "#dcfce7", color: "#14532d" },
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
    const role = user.role?.toUpperCase();
    const roleBadge = roleConfig[role] ?? { bg: "#f1f5f9", color: "#475569" };

    return (
        <div style={{ maxWidth: "960px", margin: "0 auto" }}>

            {/* Breadcrumb Nav */}
            <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "8px" }}>
                <button type="button" onClick={() => router.back()}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", color: "#64748b", textDecoration: "none", fontWeight: 600, fontSize: "0.9rem" }}
                    onMouseOver={(e) => e.currentTarget.style.color = "#2563eb"}
                    onMouseOut={(e) => e.currentTarget.style.color = "#64748b"}
                >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to {backLabel}
                </button>
                <span style={{ color: "#cbd5e1" }}>›</span>
                <span style={{ color: "#0f172a", fontWeight: 600, fontSize: "0.9rem" }}>{displayName}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "1.5rem", alignItems: "start" }}>

                {/* ── Left: User Info ── */}
                <div className="glass-panel" style={{ background: "white", borderRadius: "14px", padding: "1.75rem", border: "1px solid var(--border-light)" }}>
                    {/* Avatar */}
                    <div style={{
                        width: "60px", height: "60px", borderRadius: "50%",
                        background: roleBadge.bg, color: roleBadge.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "1.4rem", fontWeight: 700, marginBottom: "1rem",
                    }}>
                        {initials}
                    </div>

                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>
                        {displayName}
                    </h1>

                    {/* Role badge */}
                    <span style={{
                        display: "inline-block", marginBottom: "1.25rem",
                        fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.5px", padding: "4px 10px", borderRadius: "999px",
                        background: roleBadge.bg, color: roleBadge.color,
                    }}>
                        {user.role}
                    </span>

                    {/* Details */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.875rem" }}>
                        {[
                            { label: "Email",    value: user.email },
                            { label: "Username", value: `@${user.username}` },
                            { label: "User ID",  value: `#${user.id}` },
                        ].map(({ label, value }) => (
                            <div key={label} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px", gap: "8px" }}>
                                <span style={{ color: "var(--text-secondary)", flexShrink: 0 }}>{label}</span>
                                <span style={{ fontWeight: 600, color: "var(--text-primary)", textAlign: "right", wordBreak: "break-all" }}>{value}</span>
                            </div>
                        ))}
                        {/* Specialty — editable for admins on specialist/teacher profiles */}
                        {(role === "SPECIALIST" || role === "TEACHER") && (
                            <div style={{ marginTop: "14px" }}>
                                <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", marginBottom: "6px" }}>
                                    Specialty
                                </p>
                                {isAdmin ? (
                                    <div style={{ display: "flex", gap: "6px" }}>
                                        <input
                                            type="text"
                                            value={specialty}
                                            onChange={e => { setSpecialty(e.target.value); setSpecialtySaved(false); }}
                                            placeholder="e.g. Speech Therapy"
                                            style={{
                                                flex: 1, fontSize: "0.85rem", padding: "7px 10px",
                                                borderRadius: "6px", border: "1px solid #e2e8f0",
                                                outline: "none", color: "var(--text-primary)"
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
                                                } catch { /* ignore */ }
                                                setSavingSpecialty(false);
                                            }}
                                            style={{
                                                fontSize: "0.8rem", fontWeight: 600, padding: "7px 12px",
                                                borderRadius: "6px", border: "1px solid #bfdbfe",
                                                background: specialtySaved ? "#d1fae5" : "#eff6ff",
                                                color: specialtySaved ? "#065f46" : "#1d4ed8",
                                                cursor: savingSpecialty ? "not-allowed" : "pointer",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {savingSpecialty ? "…" : specialtySaved ? "Saved ✓" : "Save"}
                                        </button>
                                    </div>
                                ) : (
                                    <p style={{ fontSize: "0.875rem", color: specialty ? "#6366f1" : "#94a3b8", fontWeight: 500 }}>
                                        {specialty || "Not set"}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right: Assigned Students ── */}
                <div className="glass-panel" style={{ background: "white", borderRadius: "14px", border: "1px solid var(--border-light)", overflow: "hidden" }}>
                    <div style={{ padding: "1.25rem 1.75rem", borderBottom: "1px solid var(--border-light)", background: "#f8fafc", display: "flex", alignItems: "center", gap: "10px" }}>
                        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                            Assigned Students
                        </h2>
                        <span style={{
                            fontSize: "0.75rem", fontWeight: 700, padding: "2px 8px",
                            borderRadius: "999px", background: "#e2e8f0", color: "#475569",
                        }}>
                            {user.assigned_students_count}
                        </span>
                    </div>

                    <div style={{ padding: "1.25rem 1.75rem" }}>
                        {user.assigned_students_count === 0 ? (
                            <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-muted)" }}>
                                <svg style={{ width: 36, height: 36, margin: "0 auto 10px", color: "#cbd5e1" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <p style={{ fontSize: "0.9rem" }}>No students assigned to this user yet.</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                                    <thead>
                                        <tr>
                                            {["Name", "Grade", "Status", ""].map(h => (
                                                <th key={h} style={{
                                                    padding: "10px 12px",
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
                                        {user.assigned_students.map(student => {
                                            const statusKey = student.status?.toUpperCase().replace(/ /g, "_");
                                            const badge = statusColors[statusKey] ?? { bg: "#f1f5f9", color: "#475569" };
                                            return (
                                                <tr key={student.id} style={{ borderBottom: "1px solid var(--border-light)" }} className="hover:bg-slate-50">
                                                    <td style={{ padding: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                                                        {student.first_name} {student.last_name}
                                                    </td>
                                                    <td style={{ padding: "12px", color: "var(--text-secondary)" }}>
                                                        {student.grade || "TBD"}
                                                    </td>
                                                    <td style={{ padding: "12px" }}>
                                                        <span style={{
                                                            fontSize: "0.72rem", fontWeight: 700,
                                                            textTransform: "uppercase", letterSpacing: "0.5px",
                                                            padding: "3px 10px", borderRadius: "999px",
                                                            background: badge.bg, color: badge.color,
                                                        }}>
                                                            {student.status?.replace(/_/g, " ")}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: "12px", textAlign: "right" }}>
                                                        <Link href={`/students/${student.id}`} style={{ fontSize: "0.82rem", fontWeight: 500, color: "#2563eb", textDecoration: "none" }} className="hover:underline">
                                                            View Profile →
                                                        </Link>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
