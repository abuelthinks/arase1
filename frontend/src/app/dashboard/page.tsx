"use client";

import { useEffect, useState, useMemo } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import Link from "next/link";
import AdminDashboard from "./AdminDashboard";
import WelcomeBanner from "@/components/WelcomeBanner";

interface Student {
    id: number;
    first_name: string;
    last_name: string;
    grade: string;
    status: string;
}

const statusColors: Record<string, { bg: string; color: string }> = {
    INQUIRY:    { bg: "#fce7f3", color: "#9d174d" },
    EVALUATION: { bg: "#fef3c7", color: "#92400e" },
    REVIEW:     { bg: "#dbeafe", color: "#1e40af" },
    ACTIVE:     { bg: "#dcfce7", color: "#14532d" },
    ARCHIVED:   { bg: "#f1f5f9", color: "#64748b" },
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

                <WelcomeBanner students={students} />

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
                            {!(user?.role === "PARENT" && students.length < 3) && (
                                <>
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
                                </>
                            )}

                            {processedStudents.length === 0 ? (
                                <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 1rem", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                                    No records found matching your filters.
                                </p>
                            ) : user?.role === "PARENT" ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-4">
                                    {paginatedStudents.map(s => {
                                        const statusKey = s.status?.toUpperCase().replace(/ /g, "_");
                                        const badge = statusColors[statusKey] ?? { bg: "#f1f5f9", color: "#475569" };
                                        return (
                                            <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all relative overflow-hidden group hover:border-blue-200">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-3xl font-black border-4 border-white shadow-sm transition-transform group-hover:scale-105">
                                                            {s.first_name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <h3 className="font-extrabold text-2xl text-slate-900 leading-tight">{s.first_name}</h3>
                                                            <p className="text-slate-500 font-medium">{s.last_name}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div className="-mx-6 px-6 py-3 bg-slate-50 border-y border-slate-100 flex items-center justify-between">
                                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</span>
                                                    <span style={{
                                                        fontSize: "0.75rem",
                                                        fontWeight: "bold",
                                                        padding: "4px 10px",
                                                        borderRadius: "20px",
                                                        textTransform: "uppercase",
                                                        letterSpacing: "0.5px",
                                                        background: badge.bg,
                                                        color: badge.color,
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: "6px",
                                                        border: `1px solid ${badge.color}20`
                                                    }}>
                                                        {s.status === "PENDING_ASSESSMENT" && (
                                                            <span className="flex h-2 w-2 rounded-full relative">
                                                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                                              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                                                            </span>
                                                        )}
                                                        {s.status?.replace(/_/g, " ")}
                                                    </span>
                                                </div>

                                                <div className="mt-auto flex flex-col gap-2 pt-2">
                                                    {s.status === "INQUIRY" ? (
                                                        <Link 
                                                            href={`/parent-onboarding?studentId=${s.id}`}
                                                            className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-lg text-center hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg hover:-translate-y-0.5 focus:ring-4 focus:ring-blue-100 flex items-center justify-center gap-2"
                                                        >
                                                            Start Assessment
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                                        </Link>
                                                    ) : (
                                                        <Link 
                                                            href={`/students/${s.id}`}
                                                            className="w-full py-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-bold text-center hover:bg-blue-100 transition-colors focus:ring-4 focus:ring-blue-100 flex items-center justify-center gap-2"
                                                        >
                                                            View Submitted Form
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                                        </Link>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Supportive Side/Resources Card */}
                                    <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-2xl border border-slate-200 p-6 flex flex-col gap-4 shadow-sm">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center drop-shadow-sm">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            </div>
                                            <h3 className="font-bold text-lg text-slate-800">What's Next?</h3>
                                        </div>
                                        <p className="text-sm text-slate-600 leading-relaxed flex-grow">
                                            After you submit the parent assessment, our specialist team will review your insights alongside school reports to develop a personalized milestone plan. You'll be notified when it's ready!
                                        </p>
                                        <div className="space-y-3 pt-4 border-t border-slate-200 text-sm">
                                            <a href="#" className="flex items-center justify-between text-blue-600 hover:text-blue-700 font-medium group transition-colors">
                                                How we use this data
                                                <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                            </a>
                                            <a href="#" className="flex items-center justify-between text-blue-600 hover:text-blue-700 font-medium group transition-colors">
                                                Contact Support
                                                <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                            </a>
                                        </div>
                                    </div>
                                </div>
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
                                                const badge = statusColors[s.status?.toUpperCase()] ?? { bg: "#f1f5f9", color: "#475569" };
                                                return (
                                                    <tr key={s.id} style={{ borderBottom: "1px solid var(--border-light)", verticalAlign: "middle" }} className="hover:bg-slate-50 transition-colors duration-150">
                                                        <td style={{ padding: "12px" }}>
                                                            <Link href={`/students/${s.id}`} style={{ fontWeight: "bold", color: "var(--text-primary)", textDecoration: "none" }} className="hover:text-blue-600 transition-colors">
                                                                {s.first_name} {s.last_name}
                                                            </Link>
                                                        </td>
                                                        <td style={{ padding: "12px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                                                            {s.grade && s.grade !== "TBD" ? s.grade : <span className="text-slate-400 italic">Not yet assigned</span>}
                                                        </td>
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
                                                                {s.status === "INQUIRY" && (
                                                                    <Link 
                                                                        href={`/students/${s.id}`}
                                                                        className="text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                                                                    >
                                                                        Start Assessment
                                                                    </Link>
                                                                )}
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
