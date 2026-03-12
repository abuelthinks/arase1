"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useSearchParams } from "next/navigation";


interface UserData {
    id: number;
    username: string;
    email: string;
    role: string;
    first_name: string;
    last_name: string;
    assigned_students_count: number;
    assigned_student_names: string[];
}

interface InvitationData {
    id: number;
    email: string;
    role: string;
    token: string;
    is_used: boolean;
    created_at: string;
}

interface StudentData {
    id: number;
    first_name: string;
    last_name: string;
    grade: string;
    status: string;
}

const getRoleStyle = (role: string) => {
    switch (role?.toUpperCase()) {
        case 'ADMIN': return { bg: '#8b5cf6', color: 'white' };
        case 'TEACHER': return { bg: '#3b82f6', color: 'white' };
        case 'SPECIALIST': return { bg: '#10b981', color: 'white' };
        case 'PARENT': return { bg: '#f59e0b', color: 'white' };
        default: return { bg: '#64748b', color: 'white' };
    }
};

export default function AdminDashboard() {
    const { user, logout } = useAuth();
    const searchParams = useSearchParams();
    
    // Check URL for explicit tab, default to students
    const initialTab = (searchParams.get('tab') as "students" | "users" | "invitations") || "students";
    const [activeTab, setActiveTab] = useState<"students" | "users" | "invitations">(initialTab);
    const [students, setStudents] = useState<StudentData[]>([]);
    const [users, setUsers] = useState<UserData[]>([]);
    const [invitations, setInvitations] = useState<InvitationData[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal state for User
    const [showUserModal, setShowUserModal] = useState(false);
    const [newUser, setNewUser] = useState({ username: '', password: '', email: '', role: 'TEACHER', first_name: '', last_name: '' });

    // Modal state for Inviting User
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('PARENT');

    // Modal state for Student
    const [showStudentModal, setShowStudentModal] = useState(false);
    const [newStudent, setNewStudent] = useState({ first_name: '', last_name: '', date_of_birth: '', parent_email: '' });

    // Modal state for Delete Confirmation
    const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deleteError, setDeleteError] = useState("");

    const fetchData = async () => {
        setLoading(true);
        try {
            const [studentRes, userRes, inviteRes] = await Promise.all([
                api.get("/api/students/"),
                api.get("/api/users/"),
                api.get("/api/invitations/")
            ]);
            setStudents(studentRes.data);
            setUsers(userRes.data);
            setInvitations(inviteRes.data);
        } catch (err) {
            console.error("Failed to fetch admin data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && (tab === 'students' || tab === 'users' || tab === 'invitations')) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post("/api/users/", newUser);
            setShowUserModal(false);
            setNewUser({ username: '', password: '', email: '', role: 'TEACHER', first_name: '', last_name: '' });
            fetchData();
            alert("User created successfully");
        } catch (err: any) {
            alert(err.response?.data?.username || err.response?.data?.detail || "Failed to create user");
        }
    };

    const handleInviteUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await api.post("/api/invitations/", { email: inviteEmail, role: inviteRole });
            setShowInviteModal(false);
            setInviteEmail('');
            setInviteRole('PARENT');
            fetchData();
            alert(`Invite sent successfully to ${inviteEmail}.\nToken: ${response.data.token}\n(In a real app, an email would be sent containing the link http://localhost:3000/invite/${response.data.token})`);
        } catch (err: any) {
            alert(err.response?.data?.email?.[0] || err.response?.data?.error || "Failed to send invite");
        }
    };

    const handleCreateStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = { ...newStudent, status: 'PENDING_ASSESSMENT', grade: 'TBD' };
            await api.post("/api/students/", payload);
            setShowStudentModal(false);
            setNewStudent({ first_name: '', last_name: '', date_of_birth: '', parent_email: '' });
            fetchData();
            alert("Student registered successfully");
        } catch (err: any) {
            alert(err.response?.data?.detail || "Failed to register student");
        }
    };

    const handleConfirmDeleteUser = async () => {
        if (!userToDelete) return;
        if (deleteConfirmText !== userToDelete.email) {
            setDeleteError("Email does not match.");
            return;
        }
        
        try {
            setDeleteError("");
            await api.delete(`/api/users/${userToDelete.id}/`);
            setUserToDelete(null);
            setDeleteConfirmText("");
            fetchData();
        } catch (err: any) {
            setDeleteError(err.response?.data?.error || err.response?.data?.detail || err.message || "Failed to delete user.");
        }
    };

    const handleDeleteInvite = async (inviteId: number, email: string) => {
        if (!confirm(`Are you sure you want to revoke the invitation for ${email}?`)) return;
        try {
            await api.delete(`/api/invitations/${inviteId}/`);
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.error || "Failed to delete invitation.");
        }
    };

    return (
        <>
            <div style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: "2rem", color: "var(--text-primary)" }}>
                            {activeTab === "students" && "Student Roster"}
                            {activeTab === "users" && "System Users"}
                            {activeTab === "invitations" && "Pending Invitations"}
                        </h2>
                        <p style={{ margin: "5px 0 0 0", color: "var(--text-secondary)" }}>
                            {activeTab === "students" && "Manage all registered students in the system."}
                            {activeTab === "users" && "Manage active system users and clinical roles."}
                            {activeTab === "invitations" && "Track and revoke pending access invitations."}
                        </p>
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: "2rem", background: "white", borderRadius: "12px", border: "1px solid var(--border-light)", minHeight: "60vh" }}>
                    {loading ? (
                        <p>Loading database...</p>
                    ) : activeTab === "students" ? (
                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                                <h3>Registered Students</h3>
                                <button onClick={() => setShowStudentModal(true)} className="btn-primary" style={{ padding: "8px 16px" }}>
                                    + Register New Student
                                </button>
                            </div>
                            {students.length === 0 ? (
                                <p style={{ color: "var(--text-muted)" }}>No students in system.</p>
                            ) : (
                                <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 250px)", width: "100%", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                                    <table style={{ width: "100%", minWidth: "600px", borderCollapse: "collapse", textAlign: "left" }}>
                                        <thead>
                                            <tr>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>ID</th>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Name</th>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Grade</th>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Status</th>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {students.map(s => (
                                                <tr key={s.id} style={{ borderBottom: "1px solid var(--border-light)" }} className="hover:bg-slate-50">
                                                    <td style={{ padding: "12px" }}>#{s.id}</td>
                                                    <td style={{ padding: "12px", fontWeight: "bold" }}>{s.first_name} {s.last_name}</td>
                                                    <td style={{ padding: "12px" }}>{s.grade}</td>
                                                    <td style={{ padding: "12px" }}><span className="text-xs uppercase bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold">{s.status}</span></td>
                                                    <td style={{ padding: "12px" }}>
                                                        <Link href={`/students/${s.id}`} className="text-blue-600 hover:text-blue-800 font-medium">Manage Lifecycle</Link>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : activeTab === "users" ? (
                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                                <h3>Active Users</h3>
                                <button onClick={() => setShowUserModal(true)} className="btn-primary" style={{ padding: "8px 16px" }}>
                                    + Create New User
                                </button>
                            </div>

                            {users.length === 0 ? (
                                <p style={{ color: "var(--text-muted)" }}>No users found.</p>
                            ) : (
                                <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 250px)", width: "100%", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                                    <table style={{ width: "100%", minWidth: "800px", borderCollapse: "collapse", textAlign: "left" }}>
                                        <thead>
                                            <tr>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Name</th>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Email</th>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Username</th>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Role</th>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Assigned Kids</th>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", textAlign: "right", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.map(u => (
                                                <tr key={u.id} style={{ borderBottom: "1px solid var(--border-light)", verticalAlign: "top" }} className="hover:bg-slate-50">
                                                    <td style={{ padding: "12px", fontWeight: "bold" }}>
                                                        <Link href={`/users/${u.id}`} className="hover:text-blue-400 hover:underline transition-colors duration-200" style={{ color: "var(--text-primary)", textDecoration: "none" }}>
                                                            {u.first_name} {u.last_name}
                                                        </Link>
                                                    </td>
                                                    <td style={{ padding: "12px", color: "var(--text-primary)" }}>
                                                        {u.email}
                                                    </td>
                                                    <td style={{ padding: "12px", color: "var(--text-muted)" }}>
                                                        @{u.username}
                                                    </td>
                                                    <td style={{ padding: "12px" }}>
                                                        <span style={{ fontSize: "0.75rem", background: getRoleStyle(u.role).bg, color: getRoleStyle(u.role).color, padding: "4px 8px", borderRadius: "12px", fontWeight: "bold" }}>
                                                            {u.role}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: "12px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                                        {(u.role === 'TEACHER' || u.role === 'SPECIALIST') ? (
                                                            <div style={{ fontWeight: "bold", color: "var(--text-primary)" }}>
                                                                Count: {u.assigned_students_count}
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>N/A</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: "12px", textAlign: "right", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                                                        <Link href={`/users/${u.id}`} className="hover:text-blue-400 hover:underline transition-colors duration-200" style={{ fontSize: "0.9rem", color: "var(--accent-primary)", textDecoration: "none" }}>
                                                            View Profile
                                                        </Link>
                                                        <button onClick={() => {
                                                            setUserToDelete(u);
                                                            setDeleteConfirmText("");
                                                            setDeleteError("");
                                                        }} className="hover:text-red-400 hover:underline transition-colors duration-200" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem", color: "#d32f2f" }} title="Delete User">
                                                            Delete
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : activeTab === "invitations" ? (
                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                                <h3>Pending Invitations</h3>
                                <button onClick={() => setShowInviteModal(true)} className="btn-secondary" style={{ padding: "8px 16px", background: "#f8fafc", color: "var(--accent-primary)", border: "1px solid var(--accent-primary)", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>
                                    ✉️ Invite New User
                                </button>
                            </div>

                            {invitations.filter(i => !i.is_used).length === 0 ? (
                                <p style={{ color: "var(--text-muted)" }}>No pending invitations.</p>
                            ) : (
                                <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 250px)", width: "100%", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                                    <table style={{ width: "100%", minWidth: "600px", borderCollapse: "collapse", textAlign: "left" }}>
                                        <thead>
                                            <tr>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Email</th>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Role</th>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Sent Date</th>
                                                <th style={{ padding: "12px", color: "var(--text-secondary)", textAlign: "right", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invitations.filter(i => !i.is_used).map(inv => (
                                                <tr key={inv.id} style={{ borderBottom: "1px solid var(--border-light)" }} className="hover:bg-slate-50">
                                                    <td style={{ padding: "12px", fontWeight: "bold" }}>{inv.email}</td>
                                                    <td style={{ padding: "12px" }}>
                                                        <span style={{ fontSize: "0.75rem", background: getRoleStyle(inv.role).bg, color: getRoleStyle(inv.role).color, padding: "4px 8px", borderRadius: "12px", fontWeight: "bold", textTransform: "uppercase" }}>
                                                            {inv.role}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: "12px", color: "var(--text-secondary)" }}>{new Date(inv.created_at).toLocaleDateString()}</td>
                                                    <td style={{ padding: "12px", textAlign: "right" }}>
                                                        <div style={{ display: "flex", gap: "15px", alignItems: "center", justifyContent: "flex-end" }}>
                                                            <button
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`);
                                                                    alert('Invite link copied to clipboard!');
                                                                }}
                                                                className="hover:text-blue-400 hover:underline transition-color duration-200"
                                                                style={{ background: "none", border: "none", color: "var(--accent-primary)", cursor: "pointer", fontSize: "0.85rem", padding: 0 }}
                                                            >
                                                                Copy Link
                                                            </button>
                                                            <button onClick={() => handleDeleteInvite(inv.id, inv.email)} className="hover:text-red-400 hover:underline transition-colors duration-200" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem", color: "#d32f2f", padding: 0 }} title="Revoke Invite">
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            {/* Create User Modal */}
            {showUserModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "white", padding: "2rem", borderRadius: "12px", width: "400px", maxWidth: "90%" }}>
                        <h2 style={{ marginTop: 0 }}>Create User Account</h2>
                        <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <div style={{ display: "flex", gap: "1rem" }}>
                                <input required placeholder="First Name" value={newUser.first_name} onChange={e => setNewUser({ ...newUser, first_name: e.target.value })} className="form-input" style={{ width: "50%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                                <input required placeholder="Last Name" value={newUser.last_name} onChange={e => setNewUser({ ...newUser, last_name: e.target.value })} className="form-input" style={{ width: "50%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                            </div>
                            <input required type="email" placeholder="Email Address" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                            <div style={{ display: "flex", gap: "1rem" }}>
                                <input required placeholder="Username" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} className="form-input" style={{ width: "50%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                                <input required type="password" placeholder="Password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} className="form-input" style={{ width: "50%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                            </div>
                            <select required value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}>
                                <option value="ADMIN">Admin</option>
                                <option value="TEACHER">Teacher</option>
                                <option value="SPECIALIST">Specialist</option>
                                <option value="PARENT">Parent</option>
                            </select>
                            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
                                <button type="submit" className="btn-primary" style={{ flex: 1, padding: "10px" }}>Create</button>
                                <button type="button" onClick={() => setShowUserModal(false)} style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", cursor: "pointer" }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Create Student Modal */}
            {showStudentModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "white", padding: "2rem", borderRadius: "12px", width: "400px", maxWidth: "90%" }}>
                        <h2 style={{ marginTop: 0 }}>Register Student</h2>
                        <form onSubmit={handleCreateStudent} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <input required placeholder="First Name" value={newStudent.first_name} onChange={e => setNewStudent({ ...newStudent, first_name: e.target.value })} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                            <input required placeholder="Last Name" value={newStudent.last_name} onChange={e => setNewStudent({ ...newStudent, last_name: e.target.value })} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                            <input required type="date" placeholder="Date of Birth" value={newStudent.date_of_birth} onChange={e => setNewStudent({ ...newStudent, date_of_birth: e.target.value })} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                            <input required placeholder="Parent Email" type="email" value={newStudent.parent_email} onChange={e => setNewStudent({ ...newStudent, parent_email: e.target.value })} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />

                            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
                                <button type="submit" className="btn-primary" style={{ flex: 1, padding: "10px" }}>Register</button>
                                <button type="button" onClick={() => setShowStudentModal(false)} style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", cursor: "pointer" }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Invite User Modal */}
            {showInviteModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "white", padding: "2rem", borderRadius: "12px", width: "400px", maxWidth: "90%" }}>
                        <h2 style={{ marginTop: 0 }}>Invite New User</h2>
                        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>Send an email invitation allowing a user to set up their own account.</p>
                        <form onSubmit={handleInviteUser} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <input required type="email" placeholder="Email Address" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                            <select required value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}>
                                <option value="PARENT">Parent</option>
                                <option value="TEACHER">Teacher</option>
                                <option value="SPECIALIST">Specialist</option>
                            </select>
                            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
                                                <button type="submit" className="btn-primary" style={{ flex: 1, padding: "10px" }}>Send Invite</button>
                                                <button type="button" onClick={() => setShowInviteModal(false)} style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", cursor: "pointer" }}>Cancel</button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}

            {/* Delete User Confirmation Modal */}
            {userToDelete && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "white", padding: "2rem", borderRadius: "12px", width: "400px", maxWidth: "90%" }}>
                        <h2 style={{ marginTop: 0, color: "#d32f2f" }}>Delete User</h2>
                        <p style={{ color: "var(--text-secondary)", marginBottom: "1rem", fontSize: "0.95rem" }}>
                            You are about to permanently delete <strong>{userToDelete.first_name} {userToDelete.last_name}</strong>.
                        </p>
                        <p style={{ color: "var(--text-primary)", marginBottom: "1rem", fontSize: "0.9rem", fontWeight: "bold" }}>
                            To confirm, please type their email address:<br/>
                            <span style={{ color: "var(--text-muted)", fontStyle: "italic", userSelect: "none" }}>{userToDelete.email}</span>
                        </p>
                        
                        {deleteError && (
                            <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "10px", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.85rem", fontWeight: "bold" }}>
                                {deleteError}
                            </div>
                        )}

                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <input 
                                required 
                                type="email" 
                                placeholder="Type email to confirm" 
                                value={deleteConfirmText} 
                                onChange={e => setDeleteConfirmText(e.target.value)} 
                                className="form-input" 
                                style={{ padding: "10px", borderRadius: "4px", border: "1px solid #ccc", width: "100%", boxSizing: "border-box" }} 
                            />
                            
                            <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
                                <button 
                                    onClick={handleConfirmDeleteUser} 
                                    disabled={deleteConfirmText !== userToDelete.email}
                                    style={{ flex: 1, padding: "10px", background: deleteConfirmText === userToDelete.email ? "#d32f2f" : "#fca5a5", color: "white", border: "none", borderRadius: "8px", cursor: deleteConfirmText === userToDelete.email ? "pointer" : "not-allowed", fontWeight: "bold" }}
                                >
                                    Permanently Delete
                                </button>
                                <button type="button" onClick={() => { setUserToDelete(null); setDeleteConfirmText(""); setDeleteError(""); }} style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", cursor: "pointer" }}>Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
