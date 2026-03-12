"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import Link from "next/link";
import AdminDashboard from "./AdminDashboard";

interface Student {
    id: number;
    first_name: string;
    last_name: string;
    grade: string;
    status: string;
}

const thStyle: React.CSSProperties = {
    padding: "12px",
    color: "var(--text-secondary)",
    position: "sticky",
    top: 0,
    zIndex: 10,
    backgroundColor: "#f8fafc",
    borderBottom: "2px solid var(--border-light)",
    fontWeight: 600,
    fontSize: "0.85rem",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
};

const statusColors: Record<string, { bg: string; color: string }> = {
    PENDING_ASSESSMENT: { bg: "#fef3c7", color: "#92400e" },
    ASSESSMENT_REQUESTED: { bg: "#dbeafe", color: "#1e40af" },
    ASSESSMENT_SCHEDULED: { bg: "#ede9fe", color: "#5b21b6" },
    ASSESSED: { bg: "#d1fae5", color: "#065f46" },
    ENROLLED: { bg: "#dcfce7", color: "#14532d" },
};

export default function DashboardPage() {
    const { user } = useAuth();
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const res = await api.get("/api/students/");
                setStudents(res.data);
            } catch (err) {
                console.error("Failed to fetch students");
            } finally {
                setLoading(false);
            }
        };
        if (user && user.role !== "ADMIN") {
            fetchStudents();
        } else {
            setLoading(false);
        }
    }, [user]);

    const getSubtitle = () => {
        switch (user?.role) {
            case "TEACHER": return "Select a student to provide academic and behavioral inputs.";
            case "SPECIALIST": return "Select a student to log therapy metrics and checklists.";
            case "PARENT": return "Select your child to submit home context, milestones, and goals.";
            default: return "";
        }
    };

    if (user?.role === "ADMIN") {
        return <AdminDashboard />;
    }

    return (
        <ProtectedRoute>
            <>
                {/* Page header */}
                <div style={{ marginBottom: "2rem" }}>
                    <h2 style={{ margin: 0, fontSize: "2rem", color: "var(--text-primary)" }}>
                        {user?.role === "PARENT" ? "My Children" : "My Students"}
                    </h2>
                    <p style={{ color: "var(--text-secondary)", marginTop: "5px" }}>{getSubtitle()}</p>
                </div>

                {/* Content panel */}
                <div className="glass-panel" style={{ padding: "2rem", background: "white", borderRadius: "12px", border: "1px solid var(--border-light)", minHeight: "60vh" }}>
                    {loading ? (
                        <p>Loading...</p>
                    ) : students.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
                            <p style={{ color: "var(--text-muted)", fontSize: "1.1rem" }}>
                                {user?.role === "PARENT" ? "No children assigned yet. Please contact the administrator." : "No students assigned at this time."}
                            </p>
                        </div>
                    ) : (
                        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 280px)", width: "100%", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                            <table style={{ width: "100%", minWidth: "500px", borderCollapse: "collapse", textAlign: "left" }}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>Name</th>
                                        <th style={thStyle}>Grade</th>
                                        <th style={thStyle}>Status</th>
                                        <th style={{ ...thStyle, textAlign: "right" }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {students.map(s => {
                                        const statusKey = s.status?.toUpperCase().replace(/ /g, "_");
                                        const badge = statusColors[statusKey] ?? { bg: "#f1f5f9", color: "#475569" };
                                        return (
                                            <tr key={s.id} style={{ borderBottom: "1px solid var(--border-light)" }} className="hover:bg-slate-50">
                                                <td style={{ padding: "12px", fontWeight: "bold" }}>{s.first_name} {s.last_name}</td>
                                                <td style={{ padding: "12px", color: "var(--text-secondary)" }}>{s.grade || "TBD"}</td>
                                                <td style={{ padding: "12px" }}>
                                                    <span style={{
                                                        fontSize: "0.75rem",
                                                        fontWeight: "bold",
                                                        padding: "3px 10px",
                                                        borderRadius: "999px",
                                                        textTransform: "uppercase",
                                                        letterSpacing: "0.5px",
                                                        background: badge.bg,
                                                        color: badge.color,
                                                    }}>
                                                        {s.status?.replace(/_/g, " ")}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "12px", textAlign: "right" }}>
                                                    <Link href={`/students/${s.id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                                                        View Profile
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
            </>
        </ProtectedRoute>
    );
}
