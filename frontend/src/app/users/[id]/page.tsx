"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { SPECIALIST_SPECIALTIES, type SpecialistSpecialty } from "@/lib/specialties";

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
    specialty: SpecialistSpecialty | "";
    specialties?: SpecialistSpecialty[];
    phone_number?: string;
    is_phone_verified?: boolean;
    assigned_students_count: number;
    assigned_students: AssignedStudent[];
    last_login?: string;
}

const roleConfig: Record<string, { color: string; gradient: string; accent: string }> = {
    ADMIN: {
        color: "#5b21b6",
        gradient: "linear-gradient(135deg, #eef2ff 0%, #ede9fe 52%, #ddd6fe 100%)",
        accent: "#6d28d9",
    },
    TEACHER: {
        color: "#1e40af",
        gradient: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 55%, #bfdbfe 100%)",
        accent: "#2563eb",
    },
    SPECIALIST: {
        color: "#065f46",
        gradient: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 55%, #a7f3d0 100%)",
        accent: "#059669",
    },
    PARENT: {
        color: "#92400e",
        gradient: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 55%, #fde68a 100%)",
        accent: "#d97706",
    },
};

const statusColors: Record<string, { bg: string; color: string }> = {
    PENDING_ASSESSMENT: { bg: "#fce7f3", color: "#9d174d" },
    ASSESSMENT_SCHEDULED: { bg: "#fef3c7", color: "#92400e" },
    ASSESSED: { bg: "#dbeafe", color: "#1e40af" },
    ENROLLED: { bg: "#dcfce7", color: "#14532d" },
    ARCHIVED: { bg: "#f1f5f9", color: "#64748b" },
};

const profileCache = new Map<string, UserData>();

function formatLastSeen(lastLogin?: string): string {
    if (!lastLogin) return "No recent login recorded";

    const date = new Date(lastLogin);
    if (Number.isNaN(date.getTime())) return "Last login unavailable";

    return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function getRoleSummary(role: string): string {
    switch (role) {
        case "ADMIN":
            return "Manages users, assignments, and system operations.";
        case "TEACHER":
            return "Supports classroom learning, routines, and academic tracking.";
        case "SPECIALIST":
            return "Provides therapeutic services, assessments, and progress monitoring.";
        case "PARENT":
            return "Your account for staying connected with your child's learning journey.";
        default:
            return "System account";
    }
}

export default function UserProfile() {
    const { id } = useParams();
    const router = useRouter();
    const { user: authUser } = useAuth();
    const cacheKey = String(id);
    const cached = id ? profileCache.get(cacheKey) ?? null : null;

    const [user, setUser] = useState<UserData | null>(cached);
    const [loading, setLoading] = useState(cached === null);
    const [error, setError] = useState("");
    const [specialties, setSpecialties] = useState<SpecialistSpecialty[]>([]);
    const [savingSpecialty, setSavingSpecialty] = useState(false);
    const [specialtyError, setSpecialtyError] = useState("");
    const [isEditingSpecialty, setIsEditingSpecialty] = useState(false);

    const initialSpecialties = (raw: UserData): SpecialistSpecialty[] => {
        if (Array.isArray(raw.specialties) && raw.specialties.length > 0) {
            return raw.specialties as SpecialistSpecialty[];
        }
        return raw.specialty ? [raw.specialty as SpecialistSpecialty] : [];
    };

    const isAdmin = authUser?.role === "ADMIN";

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await api.get(`/api/users/${id}/`);
                profileCache.set(cacheKey, res.data);
                setUser(res.data);
                setSpecialties(initialSpecialties(res.data));
                setError("");
            } catch (err: any) {
                if (!profileCache.has(cacheKey)) {
                    setError(err.response?.data?.detail || "Failed to load user profile.");
                }
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchUser();
    }, [cacheKey, id]);

    if (loading) {
        return <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading profile...</div>;
    }

    if (error) {
        return <div style={{ padding: "3rem", textAlign: "center", color: "#dc2626" }}>{error}</div>;
    }

    if (!user) {
        return <div style={{ padding: "3rem", textAlign: "center" }}>User not found.</div>;
    }

    const displayName = (user.first_name || user.last_name)
        ? `${user.first_name} ${user.last_name}`.trim()
        : user.username;
    const initials = displayName.split(" ").map(word => word[0]).join("").toUpperCase().slice(0, 2);
    const role = user.role?.toUpperCase() || "UNKNOWN";
    const roleBadge = roleConfig[role] ?? {
        color: "#475569",
        gradient: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
        accent: "#475569",
    };

    const assignedStudents = Array.isArray(user.assigned_students) ? user.assigned_students : [];
    const studentCount = assignedStudents.length;
    const activeCount = assignedStudents.filter(student => student.status === "ENROLLED").length;
    const pendingCount = assignedStudents.filter(student => ["PENDING_ASSESSMENT", "ASSESSMENT_SCHEDULED"].includes(student.status)).length;
    const assessedCount = assignedStudents.filter(student => student.status === "ASSESSED").length;
    const isParent = role === "PARENT";

    const profileInfo = isParent
        ? [
            { label: "Email", value: user.email, href: `mailto:${user.email}` },
            { label: "Phone", value: user.phone_number || "Not provided", href: user.phone_number ? `tel:${user.phone_number}` : undefined },
            { label: "Account Status", value: "Active" },
        ]
        : [
            { label: "Email", value: user.email, href: `mailto:${user.email}` },
            { label: "Username", value: user.username !== user.email ? `@${user.username}` : "Same as email" },
            { label: "Phone", value: user.phone_number || "Not provided", href: user.phone_number ? `tel:${user.phone_number}` : undefined },
            { label: "Role", value: user.role },
            { label: "Last Active", value: formatLastSeen(user.last_login) },
            { label: "Account Status", value: "Active" },
        ];

    const statCards = !isParent
        ? [
            { label: "Caseload", value: studentCount, note: "total assigned students", tone: "#4f46e5", bg: "#eef2ff" },
            { label: "Active", value: activeCount, note: "enrolled students", tone: "#059669", bg: "#ecfdf5" },
            { label: "Needs Follow-Up", value: pendingCount + assessedCount, note: "pending or assessed students", tone: "#d97706", bg: "#fffbeb" },
        ]
        : [];

    return (
        <div className="profile-shell">
            <div className="profile-hero" style={{ background: roleBadge.gradient }}>
                <div className="profile-hero-orb top"></div>
                <div className="profile-hero-orb bottom"></div>

                <div className="profile-hero-inner">
                    <div className="profile-hero-toolbar">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="profile-back-button"
                            aria-label="Go back"
                        >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back
                        </button>

                        {!isParent && (
                            <div className="profile-hero-actions">
                                <Link href={`/users/${user.id}/activity`} className="profile-hero-link">
                                    View Activity
                                </Link>
                                {user.email && (
                                    <a href={`mailto:${user.email}`} className="profile-hero-link">
                                        Email User
                                    </a>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="profile-hero-identity">
                        <div className="profile-avatar" style={{ color: roleBadge.accent }}>
                            {initials}
                        </div>

                        <div className="profile-identity-copy">
                            <div className="profile-name-row">
                                <h1 className="profile-name">{displayName}</h1>
                                <span className="profile-role-chip" style={{ color: roleBadge.color }}>
                                    {role}
                                </span>
                            </div>

                            <p className="profile-summary">
                                {getRoleSummary(role)}
                            </p>

                            <div className="profile-meta-row">
                                <span className="profile-meta-pill">{user.email}</span>
                                {user.phone_number && (
                                    <span className="profile-meta-pill">{user.phone_number}</span>
                                )}
                                {!isParent && (
                                    <span className="profile-meta-pill">
                                        {(user.specialties && user.specialties.length > 0)
                                            ? user.specialties.join(", ")
                                            : (user.specialty || "Specialty not set")}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {statCards.length > 0 && (
                <div className="profile-stats-grid">
                    {statCards.map(card => (
                        <div key={card.label} className="profile-stat-card">
                            <div className="profile-stat-icon" style={{ background: card.bg, color: card.tone }}>
                                {card.value}
                            </div>
                            <p className="profile-stat-label">{card.label}</p>
                            <p className="profile-stat-note">{card.note}</p>
                        </div>
                    ))}
                </div>
            )}

            <div className="profile-main-grid">
                <div className="profile-column">
                    <section className="profile-panel">
                        <div className="profile-panel-header">
                            <h2 className="profile-panel-title">{isParent ? "Your Information" : "Profile Information"}</h2>
                            <p className="profile-panel-copy">{isParent ? "Your contact details and account status." : "Identity, contact details, and account state."}</p>
                        </div>

                        <div>
                            {profileInfo.map((item, index) => (
                                <div
                                    key={item.label}
                                    className="profile-info-row"
                                    style={{ borderBottom: index < profileInfo.length - 1 ? "1px solid #f8fafc" : "none" }}
                                >
                                    <span style={{ color: "#64748b", fontWeight: 600, fontSize: "0.82rem" }}>
                                        {item.label}
                                    </span>
                                    {item.href ? (
                                        <a href={item.href} style={{ color: "#2563eb", fontWeight: 600, textDecoration: "none", textAlign: "right", wordBreak: "break-word", fontSize: "0.84rem" }}>
                                            {item.value}
                                        </a>
                                    ) : (
                                        <span style={{ color: "#0f172a", fontWeight: 600, textAlign: "right", fontSize: "0.84rem" }}>
                                            {item.value}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>

                    {!isParent && (
                        <section className="profile-panel">
                            <div className="profile-panel-header">
                                <h2 className="profile-panel-title">Verification & Role Context</h2>
                                <p className="profile-panel-copy">Important account context at a glance.</p>
                            </div>

                            <div className="profile-panel-body" style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                                <div className="profile-context-card">
                                    <div className="profile-context-label">Phone Verification</div>
                                    <div className="profile-context-inline">
                                        <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#0f172a" }}>
                                            {user.phone_number || "No phone number on file"}
                                        </span>
                                        <span
                                            className="profile-status-chip"
                                            style={{
                                                background: user.is_phone_verified ? "#dcfce7" : "#fffbeb",
                                                color: user.is_phone_verified ? "#166534" : "#b45309",
                                            }}
                                        >
                                            {user.is_phone_verified ? "Verified" : "Not verified"}
                                        </span>
                                    </div>
                                </div>

                                <div className="profile-context-card">
                                    <div className="profile-context-label">Specialties / Responsibility</div>
                                    <div className="profile-context-value">
                                        {(user.specialties && user.specialties.length > 0)
                                            ? user.specialties.join(", ")
                                            : (user.specialty || "Not configured yet")}
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {isAdmin && role === "SPECIALIST" && (
                        <section className="profile-panel">
                            <div className="profile-panel-header split">
                                <div>
                                    <h2 className="profile-panel-title">Edit Specialties</h2>
                                    <p className="profile-panel-copy">A specialist may hold one or more disciplines. Each one unlocks the matching section in assessment and tracker forms.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSpecialtyError("");
                                        setIsEditingSpecialty(current => !current);
                                        setSpecialties(initialSpecialties(user));
                                    }}
                                    className="btn-slate"
                                >
                                    {isEditingSpecialty ? "Close" : "Edit"}
                                </button>
                            </div>

                            <div className="profile-panel-body">
                                {isEditingSpecialty ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                            {SPECIALIST_SPECIALTIES.map(option => {
                                                const checked = specialties.includes(option);
                                                return (
                                                    <label key={option} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem", color: "#0f172a", cursor: "pointer" }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => {
                                                                setSpecialties(prev => checked
                                                                    ? prev.filter(s => s !== option)
                                                                    : [...prev, option]
                                                                );
                                                            }}
                                                            style={{ width: 16, height: 16, accentColor: "#4f46e5" }}
                                                        />
                                                        {option}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        {specialtyError && (
                                            <div style={{ fontSize: "0.8rem", color: "#dc2626" }}>
                                                {specialtyError}
                                            </div>
                                        )}
                                        <div style={{ display: "flex", gap: "8px" }}>
                                            <button
                                                type="button"
                                                disabled={savingSpecialty}
                                                onClick={async () => {
                                                    setSavingSpecialty(true);
                                                    setSpecialtyError("");
                                                    try {
                                                        const res = await api.patch(`/api/users/${id}/`, { specialties });
                                                        profileCache.delete(cacheKey);
                                                        setUser(prev => prev ? {
                                                            ...prev,
                                                            specialty: res.data?.specialty ?? (specialties[0] || ""),
                                                            specialties: res.data?.specialties ?? specialties,
                                                        } : prev);
                                                        setIsEditingSpecialty(false);
                                                    } catch (err: any) {
                                                        setSpecialtyError(err.response?.data?.specialties || err.response?.data?.detail || "Could not save specialties. Please try again.");
                                                    } finally {
                                                        setSavingSpecialty(false);
                                                    }
                                                }}
                                                className="btn-primary"
                                                style={{ flex: 1 }}
                                            >
                                                {savingSpecialty ? "Saving..." : "Save Specialties"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsEditingSpecialty(false);
                                                    setSpecialties(initialSpecialties(user));
                                                    setSpecialtyError("");
                                                }}
                                                className="btn-slate"
                                                style={{ flex: 1 }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                        {specialties.length > 0
                                            ? specialties.map(s => (
                                                <span
                                                    key={s}
                                                    className="profile-meta-pill"
                                                    style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}
                                                >
                                                    {s}
                                                </span>
                                            ))
                                            : (
                                                <span style={{ fontSize: "0.84rem", color: "#94a3b8", fontStyle: "italic" }}>
                                                    No specialty configured yet.
                                                </span>
                                            )}
                                    </div>
                                )}
                            </div>
                        </section>
                    )}
                </div>

                <div className="profile-column">
                    <section className="profile-panel">
                        <div className="profile-panel-header split">
                            <div>
                                <h2 className="profile-panel-title">
                                    {isParent ? "Children" : "Assigned Students"}
                                </h2>
                                <p className="profile-panel-copy">
                                    {isParent
                                        ? "Children connected to this account."
                                        : "Students this user is currently responsible for supporting."}
                                </p>
                            </div>
                            {!isParent && (
                                <span className="profile-student-summary">
                                    {activeCount} Active • {pendingCount} Pending • {assessedCount} Assessed
                                </span>
                            )}
                        </div>

                        {studentCount === 0 ? (
                            <div className="profile-empty">
                                <div className="profile-empty-icon">
                                    <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </div>
                                <p style={{ fontSize: "0.95rem", color: "#334155", fontWeight: 700, marginBottom: "4px" }}>
                                    {isParent ? "No children linked yet" : "No students assigned yet"}
                                </p>
                                <p style={{ fontSize: "0.82rem", color: "#94a3b8", margin: 0 }}>
                                    {isParent ? "Once your child is added by the administrator, their profile will appear here." : "This profile will become more useful once students are linked to the account."}
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="hidden md:block profile-students-scroll">
                                    <table className="profile-table">
                                        <thead>
                                            <tr>
                                                <th>Student</th>
                                                <th>Grade</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...assignedStudents].sort((a, b) => b.id - a.id).map(student => {
                                                const badge = statusColors[student.status?.toUpperCase()] ?? { bg: "#f1f5f9", color: "#475569" };
                                                return (
                                                    <tr key={student.id}>
                                                        <td>
                                                            <Link href={`/students/${student.id}`} style={{ color: "#0f172a", textDecoration: "none", fontWeight: 700 }}>
                                                                {student.first_name} {student.last_name}
                                                            </Link>
                                                        </td>
                                                        <td style={{ color: "#64748b", fontWeight: 600 }}>
                                                            {student.grade || "TBD"}
                                                        </td>
                                                        <td>
                                                            <span style={{
                                                                display: "inline-flex",
                                                                alignItems: "center",
                                                                padding: "4px 10px",
                                                                borderRadius: "999px",
                                                                fontSize: "0.68rem",
                                                                fontWeight: 800,
                                                                textTransform: "uppercase",
                                                                letterSpacing: "0.45px",
                                                                background: badge.bg,
                                                                color: badge.color,
                                                            }}>
                                                                {student.status?.replace(/_/g, " ")}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="md:hidden profile-students-scroll profile-mobile-students">
                                    {[...assignedStudents].sort((a, b) => b.id - a.id).map(student => {
                                        const badge = statusColors[student.status?.toUpperCase()] ?? { bg: "#f1f5f9", color: "#475569" };
                                        return (
                                            <Link
                                                key={student.id}
                                                href={`/students/${student.id}`}
                                                className="profile-student-card"
                                            >
                                                <div className="profile-student-card-row">
                                                    <div>
                                                        <div style={{ color: "#0f172a", fontWeight: 700 }}>
                                                            {student.first_name} {student.last_name}
                                                        </div>
                                                        <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "3px" }}>
                                                            Grade: {student.grade || "TBD"}
                                                        </div>
                                                    </div>
                                                    <span style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        padding: "4px 8px",
                                                        borderRadius: "999px",
                                                        fontSize: "0.62rem",
                                                        fontWeight: 800,
                                                        textTransform: "uppercase",
                                                        background: badge.bg,
                                                        color: badge.color,
                                                    }}>
                                                        {student.status?.replace(/_/g, " ")}
                                                    </span>
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </section>

                    <section className="profile-panel">
                        <div className="profile-panel-header">
                            <h2 className="profile-panel-title">{isParent ? "Quick Links" : "Next Best Actions"}</h2>
                            <p className="profile-panel-copy">{isParent ? "Helpful shortcuts for you." : "Quick paths for reviewing this account and continuing work."}</p>
                        </div>

                        <div className="profile-action-list">
                            {isParent ? (
                                <>
                                    <Link href="/dashboard" className="profile-action-card">
                                        <div>
                                            <div className="profile-action-title">Go to Dashboard</div>
                                            <div className="profile-action-copy">See your children and any pending tasks at a glance.</div>
                                        </div>
                                        <span className="profile-action-arrow">›</span>
                                    </Link>
                                    {studentCount > 0 && (
                                        <Link href={`/students/${assignedStudents[0].id}`} className="profile-action-card">
                                            <div>
                                                <div className="profile-action-title">View {assignedStudents[0].first_name}'s Profile</div>
                                                <div className="profile-action-copy">Check progress, status, and available actions for your child.</div>
                                            </div>
                                            <span className="profile-action-arrow">›</span>
                                        </Link>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Link href={`/users/${user.id}/activity`} className="profile-action-card">
                                        <div>
                                            <div className="profile-action-title">Review Activity Log</div>
                                            <div className="profile-action-copy">See recent account events and history for this user.</div>
                                        </div>
                                        <span className="profile-action-arrow">›</span>
                                    </Link>

                                    {studentCount > 0 && (
                                        <Link href={`/students/${assignedStudents[0].id}`} className="profile-action-card">
                                            <div>
                                                <div className="profile-action-title">Open Latest Student</div>
                                                <div className="profile-action-copy">Jump into the most recently listed student on this profile.</div>
                                            </div>
                                            <span className="profile-action-arrow">›</span>
                                        </Link>
                                    )}

                                    {user.email && (
                                        <a href={`mailto:${user.email}`} className="profile-action-card">
                                            <div>
                                                <div className="profile-action-title">Contact User</div>
                                                <div className="profile-action-copy">Send an email directly from the profile page.</div>
                                            </div>
                                            <span className="profile-action-arrow">›</span>
                                        </a>
                                    )}
                                </>
                            )}
                        </div>
                    </section>

                    {isAdmin && (
                        <section className="profile-admin-panel">
                            <div className="profile-panel-header">
                                <h2 className="profile-panel-title" style={{ color: "#9a3412" }}>Admin Tools</h2>
                                <p className="profile-panel-copy" style={{ color: "#c2410c" }}>
                                    Higher-impact actions belong here once they are wired up.
                                </p>
                            </div>

                            <div className="profile-admin-body">
                                <div style={{ fontSize: "0.84rem", color: "#7c2d12" }}>
                                    This section is intentionally limited to real tools. Reset-password and deactivate controls should be added only after the backend action is implemented.
                                </div>
                                <Link href={`/users/${user.id}/activity`} className="btn-slate" style={{ width: "fit-content" }}>
                                    Open Audit Trail
                                </Link>
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
