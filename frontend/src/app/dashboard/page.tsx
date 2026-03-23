"use client";

import { useEffect, useState, useMemo } from "react";
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

    // Advanced Table States
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilters, setStatusFilters] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: keyof Student | 'name', direction: 'asc' | 'desc' } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

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

    // Reset page to 1 on search or filter match count resize
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, itemsPerPage]);

    // Faceted Data Processing
    const uniqueStatuses = Array.from(new Set(students.map(s => s.status))).filter(Boolean);

    const toggleStatusFilter = (status: string) => {
        setStatusFilters(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
        setCurrentPage(1);
    };

    const handleSort = (key: keyof Student | 'name') => {
        setSortConfig(current => {
            if (!current || current.key !== key) return { key, direction: 'asc' };
            if (current.direction === 'asc') return { key, direction: 'desc' };
            return null;
        });
    };

    const processedStudents = useMemo(() => {
        let result = [...students];

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(s => {
                const fullName = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
                const studentId = s.id?.toString() || '';
                return fullName.includes(query) || studentId.includes(query);
            });
        }

        if (statusFilters.length > 0) {
            result = result.filter(s => statusFilters.includes(s.status));
        }

        if (sortConfig) {
            result.sort((a, b) => {
                let aValue: any = a[sortConfig.key as keyof Student];
                let bValue: any = b[sortConfig.key as keyof Student];

                if (sortConfig.key === 'name') {
                    aValue = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
                    bValue = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [students, searchQuery, statusFilters, sortConfig]);

    const totalPages = Math.ceil(processedStudents.length / itemsPerPage);
    const safePage = Math.min(currentPage, Math.max(1, totalPages));
    const paginatedStudents = processedStudents.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

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
                    <h2 style={{ margin: 0, fontSize: "2rem", color: "var(--text-primary)", display: "flex", alignItems: "baseline", gap: "8px" }}>
                        {user?.role === "PARENT" ? "My Children" : "My Students"} 
                        {students.length > 0 && <span style={{ fontSize: "1.25rem", color: "#94a3b8", fontWeight: "normal" }}>({processedStudents.length})</span>}
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
                        <div>
                            {/* Action Bar (Search, Filters) */}
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", flex: "1 1 auto" }}>
                                    <div style={{ position: "relative", flex: "1 1 280px", maxWidth: "400px" }}>
                                        <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "1rem", pointerEvents: "none" }}>🔍</span>
                                        <input
                                            type="text"
                                            placeholder="Search by name or ID..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            style={{
                                                width: "100%",
                                                padding: "8px 12px 8px 36px",
                                                borderRadius: "6px",
                                                border: "1px solid #e2e8f0",
                                                fontSize: "0.9rem",
                                                height: "38px",
                                                outline: "none",
                                                boxSizing: "border-box",
                                                background: "#f8fafc",
                                            }}
                                        />
                                    </div>
                                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                                        {uniqueStatuses.map(s => {
                                            const isActive = statusFilters.includes(s);
                                            return (
                                                <button
                                                    key={s}
                                                    onClick={() => toggleStatusFilter(s)}
                                                    style={{
                                                        padding: "6px 14px",
                                                        borderRadius: "20px",
                                                        border: `1px solid ${isActive ? 'var(--accent-primary)' : '#e2e8f0'}`,
                                                        fontSize: "0.8rem",
                                                        fontWeight: isActive ? 600 : 400,
                                                        background: isActive ? '#eff6ff' : '#f8fafc',
                                                        color: isActive ? 'var(--accent-primary)' : '#475569',
                                                        cursor: "pointer",
                                                        transition: "all 0.2s"
                                                    }}
                                                >
                                                    {s.replace(/_/g, " ")}
                                                </button>
                                            );
                                        })}
                                        {(searchQuery || statusFilters.length > 0) && (
                                            <button 
                                                onClick={() => { setSearchQuery(''); setStatusFilters([]); }}
                                                style={{ padding: "6px 12px", background: "none", border: "none", color: "#64748b", fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}
                                            >
                                                Clear Filters
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", color: "#64748b", marginBottom: "1rem" }}>
                                <span>Showing {Math.min(processedStudents.length, paginatedStudents.length)} of {processedStudents.length} entries</span>
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                        <span>Show:</span>
                                        <select 
                                            value={itemsPerPage} 
                                            onChange={(e) => setItemsPerPage(Number(e.target.value))}
                                            style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f8fafc" }}
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                    </div>
                                </div>

                            {processedStudents.length === 0 ? (
                                <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 1rem", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                                    No records found matching your filters.
                                </p>
                            ) : (
                                <div style={{ overflowX: "auto", width: "100%", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                                    <table style={{ width: "100%", minWidth: "500px", borderCollapse: "collapse", textAlign: "left" }}>
                                        <thead>
                                            <tr>
                                                <th onClick={() => handleSort('name')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                        NAME
                                                        <span style={{ opacity: sortConfig?.key === 'name' ? 1 : 0.3 }}>
                                                            {sortConfig?.key === 'name' ? (sortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                        </span>
                                                    </div>
                                                </th>
                                                <th onClick={() => handleSort('grade')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                        GRADE
                                                        <span style={{ opacity: sortConfig?.key === 'grade' ? 1 : 0.3 }}>
                                                            {sortConfig?.key === 'grade' ? (sortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                        </span>
                                                    </div>
                                                </th>
                                                <th onClick={() => handleSort('status')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                        STATUS
                                                        <span style={{ opacity: sortConfig?.key === 'status' ? 1 : 0.3 }}>
                                                            {sortConfig?.key === 'status' ? (sortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                        </span>
                                                    </div>
                                                </th>
                                                <th style={{ padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedStudents.map(s => {
                                                const statusKey = s.status?.toUpperCase().replace(/ /g, "_");
                                                const badge = statusColors[statusKey] ?? { bg: "#f1f5f9", color: "#475569" };
                                                return (
                                                    <tr key={s.id} style={{ borderBottom: "1px solid var(--border-light)", verticalAlign: "middle" }} className="hover:bg-slate-50 transition-colors duration-150">
                                                        <td style={{ padding: "12px", fontWeight: "bold", color: "var(--text-primary)" }}>{s.first_name} {s.last_name}</td>
                                                        <td style={{ padding: "12px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>{s.grade || "TBD"}</td>
                                                        <td style={{ padding: "12px" }}>
                                                            <span style={{
                                                                fontSize: "0.72rem",
                                                                fontWeight: "bold",
                                                                padding: "4px 10px",
                                                                borderRadius: "12px",
                                                                textTransform: "uppercase",
                                                                letterSpacing: "0.3px",
                                                                background: badge.bg,
                                                                color: badge.color,
                                                            }}>
                                                                {s.status?.replace(/_/g, " ")}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: "12px", textAlign: "right" }}>
                                                            <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" }}>
                                                                <Link 
                                                                    href={`/students/${s.id}`} 
                                                                    className="hover:bg-blue-50 transition-colors duration-200"
                                                                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "6px", background: "none", color: "#3b82f6" }}
                                                                    title="View Profile"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                                                </Link>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Pagination Controls */}
                            {processedStudents.length > 0 && totalPages > 1 && (
                                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "1rem" }}>
                                    <button 
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                        disabled={safePage === 1}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", background: safePage === 1 ? "#f8fafc" : "white", color: safePage === 1 ? "#cbd5e1" : "inherit", cursor: safePage === 1 ? "not-allowed" : "pointer" }}
                                    >Previous</button>
                                    <span style={{ padding: "6px 12px", fontSize: "0.9rem", color: "#64748b" }}>
                                        Page {safePage} of {totalPages}
                                    </span>
                                    <button 
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                                        disabled={safePage === totalPages}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", background: safePage === totalPages ? "#f8fafc" : "white", color: safePage === totalPages ? "#cbd5e1" : "inherit", cursor: safePage === totalPages ? "not-allowed" : "pointer" }}
                                    >Next</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </>
        </ProtectedRoute>
    );
}
