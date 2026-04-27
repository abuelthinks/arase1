"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ArrowRight, BarChart3, ClipboardList, Clock, FileCheck2, Mail, Search, Sparkles, UserPlus, Users as UsersIcon, Zap } from "lucide-react";
import { SPECIALIST_SPECIALTIES, type SpecialistSpecialty } from "@/lib/specialties";
import { roleColorHex, statusColorHex } from "@/lib/role-colors";
import { toast } from "sonner";

/* ─── Utility: Title Case ────────────────────────────────────────────────── */

function toTitleCase(str: string): string {
    return str
        .toLowerCase()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface UserData {
    id: number;
    
    email: string;
    role: string;
    first_name: string;
    last_name: string;
    specialty?: SpecialistSpecialty | "";
    specialties?: SpecialistSpecialty[];
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
    expires_at: string;
}

const ALLOWED_ACTION_PREFIXES = ["/dashboard", "/workspace", "/students", "/users", "/admin", "/specialists"];
function isSafeActionLink(link?: string): boolean {
    if (!link || typeof link !== "string") return false;
    if (!link.startsWith("/")) return false;
    return ALLOWED_ACTION_PREFIXES.some(p => link === p || link.startsWith(`${p}?`) || link.startsWith(`${p}/`));
}

function getExpiryDisplay(expiresAt: string): { label: string; color: string; bg: string; isExpired: boolean } {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();
    if (diffMs <= 0) return { label: 'Expired', color: '#be123c', bg: '#fff1f2', isExpired: true };
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHrs < 6) return { label: `${diffHrs}h ${diffMins}m left`, color: '#b45309', bg: '#fef3c7', isExpired: false };
    if (diffHrs < 24) return { label: `${diffHrs}h left`, color: '#b45309', bg: '#fef3c7', isExpired: false };
    return { label: `${diffHrs}h left`, color: '#166534', bg: '#dcfce7', isExpired: false };
}

interface StudentData {
    id: number;
    first_name: string;
    last_name: string;
    grade: string;
    status: string;
}

interface DashboardAction {
    id: string;
    title: string;
    description: string;
    action_text: string;
    link: string;
    type: "positive" | "info" | "warning";
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const getRoleStyle = roleColorHex;
const getStatusStyle = statusColorHex;

const getActionTypeStyle = (type: DashboardAction["type"]) => {
    if (type === 'positive') return { bg: '#f0fdf4', border: '#bbf7d0', title: '#166534', body: '#15803d' };
    if (type === 'warning') return { bg: '#fffbeb', border: '#fde68a', title: '#b45309', body: '#b45309' };
    return { bg: '#eff6ff', border: '#bfdbfe', title: '#1d4ed8', body: '#2563eb' };
};

/* ─── Main Component ─────────────────────────────────────────────────────── */

export default function AdminDashboard() {
    const searchParams = useSearchParams();
    const { user: authUser } = useAuth();
    const getTimeGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return { text: "Good morning", emoji: "☀️" };
        if (hour < 17) return { text: "Good afternoon", emoji: "👋" };
        return { text: "Good evening", emoji: "🌙" };
    };

    // Check URL for explicit tab, default to students
    const initialTab = (searchParams.get('tab') as "analytics" | "students" | "users" | "invitations") || "analytics";
    const [activeTab, setActiveTab] = useState<"analytics" | "students" | "users" | "invitations">(initialTab);
    const [students, setStudents] = useState<StudentData[]>([]);
    const [users, setUsers] = useState<UserData[]>([]);
    const [invitations, setInvitations] = useState<InvitationData[]>([]);
    const [dashboardActions, setDashboardActions] = useState<DashboardAction[]>([]);
    const [loading, setLoading] = useState(true);

    // Student search & filter
    const [studentSearch, setStudentSearch] = useState("");
    const [statusFilters, setStatusFilters] = useState<string[]>([]);
    
    // Student Sorting
    const [studentSortConfig, setStudentSortConfig] = useState<{ key: 'id' | 'name' | 'grade' | 'status' | null, direction: 'asc' | 'desc' | null }>({ key: null, direction: null });

    // Student Pagination
    const [studentPage, setStudentPage] = useState(1);
    const [studentItemsPerPage, setStudentItemsPerPage] = useState(10);

    // User search & filter
    const [userSearch, setUserSearch] = useState("");
    const [userRoleFilters, setUserRoleFilters] = useState<string[]>([]);
    
    // User Sorting
    const [userSortConfig, setUserSortConfig] = useState<{ key: 'name' | 'role' | 'kids' | null, direction: 'asc' | 'desc' | null }>({ key: null, direction: null });

    // User Pagination
    const [userPage, setUserPage] = useState(1);
    const [userItemsPerPage, setUserItemsPerPage] = useState(10);

    // Invitation search & filter
    const [invitationSearch, setInvitationSearch] = useState("");
    const [invitationRoleFilters, setInvitationRoleFilters] = useState<string[]>([]);
    
    // Invitation Sorting
    const [invitationSortConfig, setInvitationSortConfig] = useState<{ key: 'email' | 'role' | 'date' | null, direction: 'asc' | 'desc' | null }>({ key: null, direction: null });

    // Invitation Pagination
    const [invitationPage, setInvitationPage] = useState(1);
    const [invitationItemsPerPage, setInvitationItemsPerPage] = useState(10);

    // Modal state for User
    const [showUserModal, setShowUserModal] = useState(false);
    const [newUser, setNewUser] = useState({
        
        password: '',
        confirm_password: '',
        email: '',
        role: 'TEACHER',
        specialty: '' as SpecialistSpecialty | "",
        specialties: [] as SpecialistSpecialty[],
        first_name: '',
        last_name: ''
    });
    const [userFormError, setUserFormError] = useState("");
    const [creatingUser, setCreatingUser] = useState(false);

    // Modal state for Inviting User
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('PARENT');

    // Modal state for Student
    const [showStudentModal, setShowStudentModal] = useState(false);
    const [newStudent, setNewStudent] = useState({ first_name: '', last_name: '', date_of_birth: '', parent_email: '' });
    const [creatingStudent, setCreatingStudent] = useState(false);

    // Modal state for Delete User Confirmation
    const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deleteError, setDeleteError] = useState("");

    // Modal state for Invite Confirmations
    const [inviteToRevoke, setInviteToRevoke] = useState<InvitationData | null>(null);
    const [inviteToResend, setInviteToResend] = useState<InvitationData | null>(null);
    const [inviteActionLoading, setInviteActionLoading] = useState(false);

    // Modal state for showing newly issued invite token
    const [createdInvite, setCreatedInvite] = useState<{ email: string; token: string } | null>(null);


    const fetchData = async () => {
        setLoading(true);
        try {
            const [studentRes, userRes, inviteRes, actionsRes] = await Promise.all([
                api.get("/api/students/"),
                api.get("/api/users/"),
                api.get("/api/invitations/"),
                api.get("/api/dashboard/actions/").catch(() => ({ data: { actions: [] } }))
            ]);
            setStudents(studentRes.data);
            setUsers(userRes.data.sort((a: any, b: any) => b.id - a.id));
            setInvitations(inviteRes.data.sort((a: any, b: any) => b.id - a.id));
            setDashboardActions(actionsRes.data?.actions || []);
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
        if (tab && (tab === 'analytics' || tab === 'students' || tab === 'users' || tab === 'invitations')) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    /* ─── Filtered, Sorted, and Paginated Students ───────────────────────── */

    const uniqueStatuses = Array.from(new Set(students.map(s => s.status)));

    const processedStudents = students.filter(s => {
        const searchTerms = studentSearch.toLowerCase().trim().split(/\s+/);
        const searchableString = `${s.first_name} ${s.last_name} ${s.id}`.toLowerCase();
        const matchesSearch = searchTerms.every(term => searchableString.includes(term));
        const matchesStatus = statusFilters.length === 0 || statusFilters.includes(s.status);
        return matchesSearch && matchesStatus;
    });

    if (studentSortConfig.key && studentSortConfig.direction) {
        processedStudents.sort((a, b) => {
            let aVal: any = '';
            let bVal: any = '';
            if (studentSortConfig.key === 'id') {
                aVal = a.id;
                bVal = b.id;
            } else if (studentSortConfig.key === 'name') {
                aVal = `${a.first_name} ${a.last_name}`.trim();
                bVal = `${b.first_name} ${b.last_name}`.trim();
            } else if (studentSortConfig.key === 'grade') {
                aVal = a.grade;
                bVal = b.grade;
            } else if (studentSortConfig.key === 'status') {
                aVal = a.status;
                bVal = b.status;
            }
            if (aVal < bVal) return studentSortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return studentSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    const totalStudentPages = Math.ceil(processedStudents.length / studentItemsPerPage) || 1;
    const safeStudentPage = Math.min(Math.max(1, studentPage), totalStudentPages);
    const paginatedStudents = processedStudents.slice((safeStudentPage - 1) * studentItemsPerPage, safeStudentPage * studentItemsPerPage);

    /* ─── Filtered, Sorted, and Paginated Users ──────────────────────────── */

    const uniqueUserRoles = Array.from(new Set(users.map(u => u.role)));

    const processedUsers = users.filter(u => {
        // Fuzzy search logic (matches all words)
        const searchTerms = userSearch.toLowerCase().trim().split(/\s+/);
        const searchableString = `${u.first_name} ${u.last_name} ${u.email} `.toLowerCase();
        const matchesSearch = searchTerms.every(term => searchableString.includes(term));
        
        // Multi-select role filter
        const matchesRole = userRoleFilters.length === 0 || userRoleFilters.includes(u.role);
        
        return matchesSearch && matchesRole;
    });

    // Sorting Logic
    if (userSortConfig.key && userSortConfig.direction) {
        processedUsers.sort((a, b) => {
            let aVal: any = '';
            let bVal: any = '';
            
            if (userSortConfig.key === 'name') {
                aVal = `${a.first_name} ${a.last_name}`.trim() || a.email;
                bVal = `${b.first_name} ${b.last_name}`.trim() || b.email;
            } else if (userSortConfig.key === 'role') {
                aVal = a.role;
                bVal = b.role;
            } else if (userSortConfig.key === 'kids') {
                aVal = a.assigned_students_count || 0;
                bVal = b.assigned_students_count || 0;
            }
            
            if (aVal < bVal) return userSortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return userSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // Pagination Logic
    const totalUserPages = Math.ceil(processedUsers.length / userItemsPerPage) || 1;
    // ensure current page is within bounds
    const safeUserPage = Math.min(Math.max(1, userPage), totalUserPages);
    const paginatedUsers = processedUsers.slice((safeUserPage - 1) * userItemsPerPage, safeUserPage * userItemsPerPage);

    /* ─── Filtered, Sorted, and Paginated Invitations ────────────────────── */

    const uniqueInvitationRoles = Array.from(new Set(invitations.map(i => i.role)));

    const processedInvitations = invitations.filter(i => {
        if (i.is_used) return false;
        const searchTerms = invitationSearch.toLowerCase().trim().split(/\s+/);
        const searchableString = `${i.email}`.toLowerCase();
        const matchesSearch = searchTerms.every(term => searchableString.includes(term));
        const matchesRole = invitationRoleFilters.length === 0 || invitationRoleFilters.includes(i.role);
        return matchesSearch && matchesRole;
    });

    if (invitationSortConfig.key && invitationSortConfig.direction) {
        processedInvitations.sort((a, b) => {
            let aVal: any = '';
            let bVal: any = '';
            if (invitationSortConfig.key === 'email') {
                aVal = a.email;
                bVal = b.email;
            } else if (invitationSortConfig.key === 'role') {
                aVal = a.role;
                bVal = b.role;
            } else if (invitationSortConfig.key === 'date') {
                aVal = new Date(a.created_at).getTime();
                bVal = new Date(b.created_at).getTime();
            }
            if (aVal < bVal) return invitationSortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return invitationSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    const totalInvitationPages = Math.ceil(processedInvitations.length / invitationItemsPerPage) || 1;
    const safeInvitationPage = Math.min(Math.max(1, invitationPage), totalInvitationPages);
    const paginatedInvitations = processedInvitations.slice((safeInvitationPage - 1) * invitationItemsPerPage, safeInvitationPage * invitationItemsPerPage);

    /* ─── Handlers ───────────────────────────────────────────────────────── */

    const handleStudentSort = (key: 'id' | 'name' | 'grade' | 'status') => {
        setStudentSortConfig(current => {
            if (current.key !== key) return { key, direction: 'asc' };
            if (current.direction === 'asc') return { key, direction: 'desc' };
            if (current.direction === 'desc') return { key: null, direction: null };
            return { key, direction: 'asc' };
        });
    };

    const toggleStudentStatusFilter = (status: string) => {
        setStatusFilters(prev => 
            prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
        );
        setStudentPage(1);
    };

    const handleInvitationSort = (key: 'email' | 'role' | 'date') => {
        setInvitationSortConfig(current => {
            if (current.key !== key) return { key, direction: 'asc' };
            if (current.direction === 'asc') return { key, direction: 'desc' };
            if (current.direction === 'desc') return { key: null, direction: null };
            return { key, direction: 'asc' };
        });
    };

    const toggleInvitationRoleFilter = (role: string) => {
        setInvitationRoleFilters(prev => 
            prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
        );
        setInvitationPage(1);
    };

    const handleUserSort = (key: 'name' | 'role' | 'kids') => {
        setUserSortConfig(current => {
            if (current.key !== key) return { key, direction: 'asc' };
            if (current.direction === 'asc') return { key, direction: 'desc' };
            if (current.direction === 'desc') return { key: null, direction: null };
            return { key, direction: 'asc' };
        });
    };

    const toggleUserRoleFilter = (role: string) => {
        setUserRoleFilters(prev => 
            prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
        );
        setUserPage(1); // Reset pagination on re-filter
    };
    
    useEffect(() => {
        setUserPage(1);
    }, [userSearch, userItemsPerPage]);
    
    useEffect(() => {
        setStudentPage(1);
    }, [studentSearch, studentItemsPerPage]);
    
    useEffect(() => {
        setInvitationPage(1);
    }, [invitationSearch, invitationItemsPerPage]);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setUserFormError("");

        // Password confirmation
        if (newUser.password !== newUser.confirm_password) {
            setUserFormError("Passwords do not match.");
            return;
        }
        if (newUser.password.length < 6) {
            setUserFormError("Password must be at least 6 characters.");
            return;
        }

        setCreatingUser(true);
        try {
            const payload = {
                
                password: newUser.password,
                email: newUser.email,
                role: newUser.role,
                specialties: newUser.role === "SPECIALIST" ? newUser.specialties : [],
                first_name: toTitleCase(newUser.first_name),
                last_name: toTitleCase(newUser.last_name),
            };
            await api.post("/api/users/", payload);
            setShowUserModal(false);
            setNewUser({  password: '', confirm_password: '', email: '', role: 'TEACHER', specialty: '', specialties: [], first_name: '', last_name: '' });
            fetchData();
            toast.success("User created successfully");
        } catch (err: any) {
            toast.error(
                err.response?.data?.specialties
                || err.response?.data?.specialty?.[0]
                || err.response?.data?.email
                || err.response?.data?.detail
                || "Failed to create user"
            );
        } finally {
            setCreatingUser(false);
        }
    };

    const handleInviteUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await api.post("/api/invitations/", { email: inviteEmail, role: inviteRole });
            const issuedEmail = inviteEmail;
            setShowInviteModal(false);
            setInviteEmail('');
            setInviteRole('PARENT');
            fetchData();
            toast.success(`Invitation sent to ${issuedEmail}.`);
            if (response.data?.token) {
                setCreatedInvite({ email: issuedEmail, token: response.data.token });
            }
        } catch (err: any) {
            toast.error(err.response?.data?.email?.[0] || err.response?.data?.error || "Failed to send invite");
        }
    };

    const handleCreateStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreatingStudent(true);
        try {
            const payload = {
                first_name: toTitleCase(newStudent.first_name),
                last_name: toTitleCase(newStudent.last_name),
                date_of_birth: newStudent.date_of_birth,
                parent_email: newStudent.parent_email,
                status: 'PENDING_ASSESSMENT',
                grade: 'TBD',
            };
            await api.post("/api/students/", payload);
            setShowStudentModal(false);
            setNewStudent({ first_name: '', last_name: '', date_of_birth: '', parent_email: '' });
            fetchData();
            toast.success("Student registered successfully");
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Failed to register student");
        } finally {
            setCreatingStudent(false);
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

    const handleConfirmRevokeInvite = async () => {
        if (!inviteToRevoke) return;
        setInviteActionLoading(true);
        try {
            await api.delete(`/api/invitations/${inviteToRevoke.id}/`);
            toast.success(`Invitation for ${inviteToRevoke.email} revoked.`);
            setInviteToRevoke(null);
            fetchData();
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Failed to delete invitation.");
        } finally {
            setInviteActionLoading(false);
        }
    };

    const handleConfirmResendInvite = async () => {
        if (!inviteToResend) return;
        setInviteActionLoading(true);
        try {
            const res = await api.post(`/api/invitations/${inviteToResend.id}/resend/`);
            toast.success(`Invitation resent to ${inviteToResend.email}.`);
            const refreshedToken = res.data?.token;
            const email = inviteToResend.email;
            setInviteToResend(null);
            if (refreshedToken) {
                setCreatedInvite({ email, token: refreshedToken });
            }
            fetchData();
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Failed to resend invitation.");
        } finally {
            setInviteActionLoading(false);
        }
    };

    /* ─── Analytics Metrics ──────────────────────────────────────────────── */
    const totalStudents = students.filter(s => s.status !== 'ARCHIVED').length;
    const activeStudents = students.filter(s => s.status === 'ENROLLED').length;
    const scheduledStudents = students.filter(s => s.status === 'ASSESSMENT_SCHEDULED').length;
    const reviewStudents = students.filter(s => s.status === 'ASSESSED').length;
    const pendingStudents = students.filter(s => s.status === 'PENDING_ASSESSMENT').length;
    const archivedStudents = students.filter(s => s.status === 'ARCHIVED').length;
    const inProgressStudents = scheduledStudents + reviewStudents;

    const pendingInvitations = invitations.filter(i => !i.is_used);
    const expiredInvitations = pendingInvitations.filter(i => getExpiryDisplay(i.expires_at).isExpired);
    const validPendingInvitations = pendingInvitations.filter(i => !getExpiryDisplay(i.expires_at).isExpired);
    const expiringSoonInvitations = pendingInvitations.filter(i => {
        const expiryTime = new Date(i.expires_at).getTime();
        const nowTime = Date.now();
        return expiryTime > nowTime && expiryTime - nowTime <= 24 * 60 * 60 * 1000;
    });

    const adminUsers = users.filter(u => u.role === 'ADMIN');
    const teacherUsers = users.filter(u => u.role === 'TEACHER');
    const specialistUsers = users.filter(u => u.role === 'SPECIALIST');
    const parentUsers = users.filter(u => u.role === 'PARENT');
    const instructionalStaff = users.filter(u => u.role === 'TEACHER' || u.role === 'SPECIALIST');
    const staffSortedByCaseload = [...instructionalStaff].sort((a, b) => (b.assigned_students_count || 0) - (a.assigned_students_count || 0));
    const unassignedStaff = instructionalStaff.filter(u => (u.assigned_students_count || 0) === 0);
    const specialistsWithoutSpecialty = specialistUsers.filter(u => !((u.specialties && u.specialties.length > 0) || u.specialty));
    const averageCaseload = instructionalStaff.length
        ? instructionalStaff.reduce((sum, user) => sum + (user.assigned_students_count || 0), 0) / instructionalStaff.length
        : 0;

    const actionCounts = dashboardActions.reduce((acc, action) => {
        acc[action.type] += 1;
        return acc;
    }, { positive: 0, info: 0, warning: 0 });

    const watchlistItems = [
        ...dashboardActions
            .filter(action => action.type === 'warning')
            .slice(0, 3)
            .map(action => ({
                id: `action-${action.id}`,
                title: action.title,
                description: action.description,
                link: action.link,
                cta: action.action_text,
                tone: 'warning' as const,
            })),
        ...expiringSoonInvitations.slice(0, 2).map(invite => {
            const expiry = getExpiryDisplay(invite.expires_at);
            return {
                id: `invite-${invite.id}`,
                title: `Invitation expiring soon: ${invite.email}`,
                description: `${toTitleCase(invite.role)} access expires ${expiry.label.toLowerCase()}.`,
                link: "/dashboard?tab=invitations",
                cta: "Review invites",
                tone: 'info' as const,
            };
        }),
        ...(specialistsWithoutSpecialty.length > 0 ? [{
            id: 'missing-specialty',
            title: `${specialistsWithoutSpecialty.length} specialist account${specialistsWithoutSpecialty.length === 1 ? '' : 's'} missing discipline`,
            description: "Add specialties so assignment decisions stay accurate and easier to scan.",
            link: "/dashboard?tab=users",
            cta: "Review users",
            tone: 'info' as const,
        }] : []),
    ].slice(0, 5);

    const adminActionSummary = (() => {
        const parts: string[] = [];
        if (expiringSoonInvitations.length > 0) parts.push(`${expiringSoonInvitations.length} invite${expiringSoonInvitations.length === 1 ? "" : "s"} expiring soon`);
        if (reviewStudents > 0) parts.push(`${reviewStudents} awaiting enrollment review`);
        if (actionCounts.warning > 0) parts.push(`${actionCounts.warning} urgent action${actionCounts.warning === 1 ? "" : "s"}`);
        if (parts.length === 0) return "Everything is on track.";
        return `You have ${parts.slice(0, 2).join(" and ")}.`;
    })();

    return (
        <>
            {/* Desktop heading */}
            <div className="hidden md:block mb-6">
                <h2 className="m-0 text-3xl font-bold text-slate-800 flex items-center gap-2">
                    <span>{getTimeGreeting().text}, {authUser?.first_name || "Admin"}</span>
                    <span>{getTimeGreeting().emoji}</span>
                </h2>
                <p className="mt-2 text-base text-slate-500">
                    {activeTab === "analytics" && adminActionSummary}
                    {activeTab === "students" && `Manage all registered students. Showing ${processedStudents.length} of ${students.length}.`}
                    {activeTab === "users" && `Manage active system users. Showing ${processedUsers.length} of ${users.length}.`}
                    {activeTab === "invitations" && `Track and revoke pending invitations. Showing ${processedInvitations.length} of ${pendingInvitations.length}.`}
                </p>
            </div>

                {/* Desktop only: card wrapper. Mobile: px-4 content padding */}
                <div className="p-4 sm:p-6 md:p-8 md:glass-panel md:bg-white md:rounded-xl md:border md:border-[var(--border-light)] md:min-h-[60vh]">
                    {/* Mobile-only title */}
                    <div className="md:hidden mb-5">
                        <h2 className="m-0 text-xl font-bold text-slate-800">
                            {activeTab === "analytics" && "Analytics Dashboard"}
                            {activeTab === "students" && <>Student Roster <span className="text-base font-normal text-slate-400">({processedStudents.length})</span></>}
                            {activeTab === "users" && <>System Users <span className="text-base font-normal text-slate-400">({processedUsers.length})</span></>}
                            {activeTab === "invitations" && <>Pending Invitations <span className="text-base font-normal text-slate-400">({processedInvitations.length})</span></>}
                        </h2>
                        <p className="m-0 mt-1 text-sm text-slate-400">
                            {activeTab === "analytics" && "Live pipeline health, actions, staffing coverage, and invitation risk."}
                            {activeTab === "students" && "Manage all registered students in the system."}
                            {activeTab === "users" && "Manage active system users and clinical roles."}
                            {activeTab === "invitations" && "Track and revoke pending access invitations."}
                        </p>
                    </div>
                    {loading ? (
                        <p>Loading database...</p>
                    ) : activeTab === "analytics" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2rem", animation: "fadeIn 0.4s ease-out" }}>
                            
                            {/* KPI Row */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-200">
                                        <UsersIcon className="h-5 w-5" aria-hidden="true" />
                                    </div>
                                    <p className="m-0 text-xs font-bold uppercase tracking-wide text-slate-500">Active Students</p>
                                    <p className="mt-1 text-3xl font-extrabold text-slate-900">{totalStudents}</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        {activeStudents} enrolled · {archivedStudents} archived
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-5 shadow-sm">
                                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-200">
                                        <Clock className="h-5 w-5" aria-hidden="true" />
                                    </div>
                                    <p className="m-0 text-xs font-bold uppercase tracking-wide text-amber-700">Awaiting Assessment</p>
                                    <p className="mt-1 text-3xl font-extrabold text-amber-900">{pendingStudents}</p>
                                    <p className="mt-1 text-xs font-semibold text-amber-700">
                                        Still waiting on intake or scheduling
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5 shadow-sm">
                                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-200">
                                        <ClipboardList className="h-5 w-5" aria-hidden="true" />
                                    </div>
                                    <p className="m-0 text-xs font-bold uppercase tracking-wide text-blue-700">Awaiting Enrollment</p>
                                    <p className="mt-1 text-3xl font-extrabold text-blue-900">{reviewStudents}</p>
                                    <p className="mt-1 text-xs font-semibold text-blue-700">
                                        Assessed and ready for your decision
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-pink-100 bg-pink-50/50 p-5 shadow-sm">
                                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-md shadow-pink-200">
                                        <Mail className="h-5 w-5" aria-hidden="true" />
                                    </div>
                                    <p className="m-0 text-xs font-bold uppercase tracking-wide text-pink-700">Pending Invitations</p>
                                    <p className="mt-1 text-3xl font-extrabold text-pink-900">{validPendingInvitations.length}</p>
                                    <p className="mt-1 text-xs font-semibold text-pink-700">
                                        {expiringSoonInvitations.length} expiring in 24h
                                        {expiredInvitations.length > 0 && ` · ${expiredInvitations.length} expired`}
                                    </p>
                                </div>
                            </div>

                            {/* Quick Actions */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                                <div className="mb-4 flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm">
                                        <Zap className="h-4 w-4" aria-hidden="true" />
                                    </div>
                                    <div>
                                        <h3 className="m-0 text-base font-extrabold text-slate-900">Quick actions</h3>
                                        <p className="m-0 text-xs text-slate-500">Jump straight into the most-used admin tasks.</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowStudentModal(true)}
                                        className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                                                <UserPlus className="h-4 w-4" aria-hidden="true" />
                                            </div>
                                            <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-700">Register student</span>
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowInviteModal(true)}
                                        className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
                                                <Mail className="h-4 w-4" aria-hidden="true" />
                                            </div>
                                            <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-700">Invite a user</span>
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                                    </button>
                                    <Link
                                        href="/admin/iep"
                                        className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 no-underline transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                                                <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                                            </div>
                                            <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-700">IEP generator</span>
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                                    </Link>
                                    <Link
                                        href="/admin/reports"
                                        className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 no-underline transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                                                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                                            </div>
                                            <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-700">Monthly reports</span>
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                                    </Link>
                                </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2rem", alignItems: "stretch" }}>
                                <div style={{ background: "white", padding: "1.75rem", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                                    <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", color: "var(--text-primary)", fontWeight: 800 }}>Student Workflow Snapshot</h3>
                                    <p style={{ margin: "0 0 1.5rem 0", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                                        A live read on where students currently sit in the admin pipeline.
                                    </p>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                                        <div>
                                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>
                                                <span style={{ color: "#a16207" }}>Pending Assessment</span>
                                                <span>{pendingStudents}</span>
                                            </div>
                                            <div style={{ height: "12px", background: "#f1f5f9", borderRadius: "999px", overflow: "hidden" }}>
                                                <div style={{ height: "100%", width: `${totalStudents ? (pendingStudents / totalStudents) * 100 : 0}%`, background: "#f59e0b", borderRadius: "999px", transition: "width 1s ease-out" }}></div>
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>
                                                <span style={{ color: "#0369a1" }}>Assessment Scheduled</span>
                                                <span>{scheduledStudents}</span>
                                            </div>
                                            <div style={{ height: "12px", background: "#f1f5f9", borderRadius: "999px", overflow: "hidden" }}>
                                                <div style={{ height: "100%", width: `${totalStudents ? (scheduledStudents / totalStudents) * 100 : 0}%`, background: "#0ea5e9", borderRadius: "999px", transition: "width 1s ease-out" }}></div>
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>
                                                <span style={{ color: "#1d4ed8" }}>Awaiting Enrollment Review</span>
                                                <span>{reviewStudents}</span>
                                            </div>
                                            <div style={{ height: "12px", background: "#f1f5f9", borderRadius: "999px", overflow: "hidden" }}>
                                                <div style={{ height: "100%", width: `${totalStudents ? (reviewStudents / totalStudents) * 100 : 0}%`, background: "#3b82f6", borderRadius: "999px", transition: "width 1s ease-out" }}></div>
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>
                                                <span style={{ color: "#166534" }}>Enrolled</span>
                                                <span>{activeStudents}</span>
                                            </div>
                                            <div style={{ height: "12px", background: "#f1f5f9", borderRadius: "999px", overflow: "hidden" }}>
                                                <div style={{ height: "100%", width: `${totalStudents ? (activeStudents / totalStudents) * 100 : 0}%`, background: "#22c55e", borderRadius: "999px", transition: "width 1s ease-out" }}></div>
                                            </div>
                                        </div>

                                        <div style={{ marginTop: "0.5rem", padding: "0.9rem 1rem", borderRadius: "10px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                                            <span style={{ color: "#334155", fontSize: "0.85rem" }}>{inProgressStudents} students are actively moving through evaluation or review.</span>
                                            <Link href="/dashboard?tab=students" style={{ color: "#2563eb", fontWeight: 700, fontSize: "0.85rem", textDecoration: "none" }}>
                                                Open roster →
                                            </Link>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ background: "white", padding: "1.75rem", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                                    <h3 style={{ margin: "0 0 1.25rem 0", fontSize: "1.1rem", color: "var(--text-primary)", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
                                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        Action Center
                                    </h3>
                                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "1rem" }}>
                                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", padding: "4px 10px", borderRadius: "999px" }}>{actionCounts.warning} urgent</span>
                                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1d4ed8", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "4px 10px", borderRadius: "999px" }}>{actionCounts.info} queued</span>
                                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "4px 10px", borderRadius: "999px" }}>{actionCounts.positive} ready</span>
                                    </div>
                                    {dashboardActions.length === 0 ? (
                                        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>You're all caught up! No pending actions required right now.</p>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                            {dashboardActions.map(action => {
                                                const actionStyle = getActionTypeStyle(action.type);
                                                return (
                                                    <div key={action.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: actionStyle.bg, borderRadius: "8px", border: `1px solid ${actionStyle.border}`, gap: "1rem" }}>
                                                        <div>
                                                            <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: actionStyle.title }}>{action.title}</p>
                                                            <p style={{ margin: "2px 0 0 0", fontSize: "0.75rem", color: actionStyle.body }}>{action.description}</p>
                                                        </div>
                                                        {isSafeActionLink(action.link) ? (
                                                            <Link href={action.link} className="hover:scale-105 transition-transform" style={{ fontSize: "0.8rem", padding: "4px 10px", background: "white", border: `1px solid ${actionStyle.border}`, color: actionStyle.title, borderRadius: "4px", textDecoration: "none", fontWeight: 600, display: "inline-block", textAlign: "center", minWidth: "90px" }}>
                                                                {action.action_text}
                                                            </Link>
                                                        ) : (
                                                            <span style={{ fontSize: "0.78rem", padding: "4px 10px", color: "#94a3b8", borderRadius: "4px", fontStyle: "italic", minWidth: "90px", textAlign: "center" }} title="Action link unavailable">
                                                                Unavailable
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Admin Watchlist */}
                                <div style={{ background: "white", padding: "1.75rem", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                                    <h3 style={{ margin: "0 0 1.25rem 0", fontSize: "1.1rem", color: "var(--text-primary)", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
                                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6 0A10 10 0 1112 2a10 10 0 0110 10z" /></svg>
                                        Admin Watchlist
                                    </h3>
                                    {watchlistItems.length === 0 ? (
                                        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Nothing pressing right now. The system doesn&apos;t have urgent admin follow-ups at the moment.</p>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                            {watchlistItems.map(item => {
                                                const tone = item.tone === 'warning'
                                                    ? { bg: '#fffbeb', border: '#fde68a', title: '#92400e', body: '#b45309' }
                                                    : { bg: '#eff6ff', border: '#bfdbfe', title: '#1d4ed8', body: '#2563eb' };

                                                return (
                                                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", padding: "12px 14px", borderRadius: "10px", background: tone.bg, border: `1px solid ${tone.border}` }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: tone.title }}>{item.title}</p>
                                                        <p style={{ margin: "2px 0 0 0", fontSize: "0.78rem", color: tone.body }}>{item.description}</p>
                                                    </div>
                                                    {isSafeActionLink(item.link) ? (
                                                        <Link href={item.link} style={{ fontSize: "0.8rem", padding: "4px 10px", background: "white", border: `1px solid ${tone.border}`, color: tone.title, borderRadius: "4px", textDecoration: "none", fontWeight: 600, display: "inline-block", textAlign: "center", minWidth: "96px" }}>
                                                            {item.cta} →
                                                        </Link>
                                                    ) : (
                                                        <span style={{ fontSize: "0.78rem", padding: "4px 10px", color: "#94a3b8", fontStyle: "italic", minWidth: "96px", textAlign: "center" }}>Unavailable</span>
                                                    )}
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div style={{ background: "white", padding: "1.75rem", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                                    <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", color: "var(--text-primary)", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
                                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5V4H2v16h5m10 0v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5m10 0H7" /></svg>
                                        Team Capacity
                                    </h3>
                                    <p style={{ margin: "0 0 1.25rem 0", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                                        A quick read on staffing coverage before you assign more work.
                                    </p>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px", marginBottom: "1rem" }}>
                                        <div style={{ padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                                            <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>Admins</div>
                                            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>{adminUsers.length}</div>
                                        </div>
                                        <div style={{ padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                                            <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>Teachers</div>
                                            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>{teacherUsers.length}</div>
                                        </div>
                                        <div style={{ padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                                            <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>Specialists</div>
                                            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>{specialistUsers.length}</div>
                                        </div>
                                        <div style={{ padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                                            <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>Parents</div>
                                            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>{parentUsers.length}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                        <div style={{ padding: "12px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                                            <p style={{ margin: 0, fontSize: "0.85rem", color: "#334155", fontWeight: 700 }}>Average instructional caseload</p>
                                            <p style={{ margin: "4px 0 0 0", fontSize: "1.35rem", fontWeight: 800, color: "#0f172a" }}>{averageCaseload.toFixed(1)} students</p>
                                        </div>
                                        <div style={{ padding: "12px 14px", background: unassignedStaff.length > 0 ? "#fffbeb" : "#f0fdf4", border: `1px solid ${unassignedStaff.length > 0 ? '#fde68a' : '#bbf7d0'}`, borderRadius: "10px" }}>
                                            <p style={{ margin: 0, fontSize: "0.85rem", color: unassignedStaff.length > 0 ? "#92400e" : "#166534", fontWeight: 700 }}>
                                                {unassignedStaff.length} staff member{unassignedStaff.length === 1 ? '' : 's'} currently have no assigned students
                                            </p>
                                            <p style={{ margin: "2px 0 0 0", fontSize: "0.8rem", color: unassignedStaff.length > 0 ? "#b45309" : "#15803d" }}>
                                                {unassignedStaff.length > 0 ? "Useful if you need assignment capacity right away." : "Everyone currently has at least one student assigned."}
                                            </p>
                                        </div>
                                        <div style={{ padding: "12px 14px", background: specialistsWithoutSpecialty.length > 0 ? "#eff6ff" : "#f8fafc", border: `1px solid ${specialistsWithoutSpecialty.length > 0 ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: "10px" }}>
                                            <p style={{ margin: 0, fontSize: "0.85rem", color: specialistsWithoutSpecialty.length > 0 ? "#1d4ed8" : "#334155", fontWeight: 700 }}>
                                                {specialistsWithoutSpecialty.length} specialist account{specialistsWithoutSpecialty.length === 1 ? '' : 's'} missing a specialty
                                            </p>
                                            <p style={{ margin: "2px 0 0 0", fontSize: "0.8rem", color: specialistsWithoutSpecialty.length > 0 ? "#2563eb" : "#64748b" }}>
                                                Filling these in makes assignment decisions clearer for admins.
                                            </p>
                                        </div>
                                        <div>
                                            <p style={{ margin: "0 0 0.6rem 0", fontSize: "0.85rem", fontWeight: 700, color: "#334155" }}>Highest current caseloads</p>
                                            {staffSortedByCaseload.slice(0, 4).map(staff => (
                                                <div key={staff.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "8px", background: "#fff" }}>
                                                    <div>
                                                        <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: "#0f172a" }}>{staff.first_name} {staff.last_name}</p>
                                                        <p style={{ margin: "2px 0 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                                                            {toTitleCase(staff.role)}{(staff.specialties && staff.specialties.length > 0)
                                                                ? ` • ${staff.specialties.join(", ")}`
                                                                : (staff.specialty ? ` • ${staff.specialty}` : "")}
                                                        </p>
                                                    </div>
                                                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155", background: "#f8fafc", border: "1px solid #e2e8f0", padding: "4px 10px", borderRadius: "999px" }}>
                                                        {staff.assigned_students_count} students
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === "students" ? (
                        <div>
                            {/* Action Bar (Search, Filters, Button) */}
                            <div className="flex flex-col lg:flex-row justify-between gap-4 mb-5 items-start">
                                <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center w-full lg:flex-1 min-w-0">
                                    <div className="relative w-full md:flex-1 md:max-w-[400px]">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        <input
                                            type="text"
                                            placeholder="Search by name or ID..."
                                            value={studentSearch}
                                            onChange={e => setStudentSearch(e.target.value)}
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
                                    <div className="flex gap-2 items-center overflow-x-auto w-full md:w-auto pb-1 md:pb-0" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                                        {uniqueStatuses.map(s => {
                                            const isActive = statusFilters.includes(s);
                                            return (
                                                <button
                                                    key={s}
                                                    onClick={() => toggleStudentStatusFilter(s)}
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
                                                    {s}
                                                </button>
                                            );
                                        })}
                                        {(studentSearch || statusFilters.length > 0) && (
                                            <button 
                                                onClick={() => { setStudentSearch(''); setStatusFilters([]); }}
                                                style={{ padding: "6px 12px", background: "none", border: "none", color: "#64748b", fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}
                                            >
                                                Clear Filters
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="w-full md:w-auto flex items-center shrink-0">
                                    <button onClick={() => setShowStudentModal(true)} className="btn-primary w-full md:w-auto" style={{ padding: "8px 16px", height: "38px", whiteSpace: "nowrap" }}>
                                        + Register New Student
                                    </button>
                                </div>
                            </div>
                            
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", color: "#64748b", marginBottom: "1rem" }}>
                                <span>Showing {Math.min(processedStudents.length, paginatedStudents.length)} of {processedStudents.length} students</span>
                                {students.length > 10 && (
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                        <span>Show:</span>
                                        <select
                                            value={studentItemsPerPage}
                                            onChange={(e) => setStudentItemsPerPage(Number(e.target.value))}
                                            style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f8fafc" }}
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            {processedStudents.length === 0 ? (
                                <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 1rem", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                                    {students.length === 0
                                        ? "No students in the system yet."
                                        : studentSearch && statusFilters.length > 0
                                            ? `No students match "${studentSearch}" with the selected status filters. Try clearing one.`
                                            : studentSearch
                                                ? `No students match "${studentSearch}". Try a different search term.`
                                                : statusFilters.length > 0
                                                    ? `No students match the selected status filters.`
                                                    : "No students to show."}
                                </p>
                            ) : (
                                <>
                                    <div className="hidden md:block" style={{ overflowX: "auto", width: "100%", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                                        <table style={{ width: "100%", minWidth: "700px", borderCollapse: "collapse", textAlign: "left" }}>
                                            <thead>
                                                <tr>
                                                    <th onClick={() => handleStudentSort('id')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            ID
                                                            <span style={{ opacity: studentSortConfig.key === 'id' ? 1 : 0.3 }}>
                                                                {studentSortConfig.key === 'id' ? (studentSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleStudentSort('name')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            NAME
                                                            <span style={{ opacity: studentSortConfig.key === 'name' ? 1 : 0.3 }}>
                                                                {studentSortConfig.key === 'name' ? (studentSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleStudentSort('grade')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            GRADE
                                                            <span style={{ opacity: studentSortConfig.key === 'grade' ? 1 : 0.3 }}>
                                                                {studentSortConfig.key === 'grade' ? (studentSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleStudentSort('status')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            STATUS
                                                            <span style={{ opacity: studentSortConfig.key === 'status' ? 1 : 0.3 }}>
                                                                {studentSortConfig.key === 'status' ? (studentSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th style={{ padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedStudents.map(s => {
                                                    const ss = getStatusStyle(s.status);
                                                    return (
                                                        <tr key={s.id} style={{ borderBottom: "1px solid var(--border-light)", verticalAlign: "middle" }} className="hover:bg-slate-100 transition-colors duration-150">
                                                            <td style={{ padding: "12px", color: "#94a3b8", fontSize: "0.85rem" }}>#{s.id}</td>
                                                            <td style={{ padding: "12px" }}>
                                                                <Link href={`/students/${s.id}`} className="hover:text-blue-500 hover:underline transition-colors duration-200" style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: "bold", fontSize: "0.95rem" }}>
                                                                    {s.first_name} {s.last_name}
                                                                </Link>
                                                            </td>
                                                            <td style={{ padding: "12px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{s.grade}</td>
                                                            <td style={{ padding: "12px" }}>
                                                                <span style={{
                                                                    fontSize: "0.72rem",
                                                                    textTransform: "uppercase",
                                                                    background: ss.bg,
                                                                    color: ss.color,
                                                                    padding: "4px 10px",
                                                                    borderRadius: "12px",
                                                                    fontWeight: "bold",
                                                                    letterSpacing: "0.3px",
                                                                }}>{s.status.replace(/_/g, " ")}</span>
                                                            </td>
                                                            <td style={{ padding: "12px", textAlign: "right" }}>
                                                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", alignItems: "center" }}>
                                                                    <Link href={`/students/${s.id}`} className="hover:bg-blue-50 transition-colors duration-200" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "6px", color: "#3b82f6" }} title="View Profile">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                                                                    </Link>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="md:hidden flex flex-col gap-3">
                                        {paginatedStudents.map(s => {
                                            const ss = getStatusStyle(s.status);
                                            return (
                                                <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-3">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-xs font-mono text-slate-400 mb-1">#{s.id}</span>
                                                            <Link href={`/students/${s.id}`} className="font-bold text-[var(--text-primary)] no-underline text-[1.1rem] hover:text-blue-600 transition-colors truncate">
                                                                {s.first_name} {s.last_name}
                                                            </Link>
                                                            <span className="text-sm text-slate-500 mt-1">{s.grade || "Grade TBD"}</span>
                                                        </div>
                                                        <span style={{ fontSize: "0.65rem", fontWeight: "bold", padding: "4px 8px", borderRadius: "12px", textTransform: "uppercase", background: ss.bg, color: ss.color, textAlign: "center", whiteSpace: "nowrap" }}>
                                                            {s.status.replace(/_/g, " ")}
                                                        </span>
                                                    </div>
                                                    <div className="border-t border-slate-100 pt-3 flex justify-end">
                                                        <Link href={`/students/${s.id}`} className="btn-slate text-sm w-full text-center flex justify-center py-2" title="View Profile">
                                                            View Profile
                                                        </Link>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                            
                            {/* Pagination Controls */}
                            {processedStudents.length > 0 && totalStudentPages > 1 && (
                                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "1rem" }}>
                                    <button 
                                        onClick={() => setStudentPage(p => Math.max(1, p - 1))} 
                                        disabled={safeStudentPage === 1}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", background: safeStudentPage === 1 ? "#f8fafc" : "white", color: safeStudentPage === 1 ? "#cbd5e1" : "inherit", cursor: safeStudentPage === 1 ? "not-allowed" : "pointer" }}
                                    >Previous</button>
                                    <span style={{ padding: "6px 12px", fontSize: "0.9rem", color: "#64748b" }}>
                                        Page {safeStudentPage} of {totalStudentPages}
                                    </span>
                                    <button 
                                        onClick={() => setStudentPage(p => Math.min(totalStudentPages, p + 1))} 
                                        disabled={safeStudentPage === totalStudentPages}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", background: safeStudentPage === totalStudentPages ? "#f8fafc" : "white", color: safeStudentPage === totalStudentPages ? "#cbd5e1" : "inherit", cursor: safeStudentPage === totalStudentPages ? "not-allowed" : "pointer" }}
                                    >Next</button>
                                </div>
                            )}
                        </div>
                    ) : activeTab === "users" ? (
                        <div>
                            {/* Action Bar (Search, Filters, Button) */}
                            <div className="flex flex-col lg:flex-row justify-between gap-4 mb-5 items-start">
                                <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center w-full lg:flex-1 min-w-0">
                                    <div className="relative w-full md:flex-1 md:max-w-[400px]">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        <input
                                            type="text"
                                            placeholder="Search by name or email..."
                                            value={userSearch}
                                            onChange={e => setUserSearch(e.target.value)}
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
                                    <div className="flex gap-2 items-center overflow-x-auto w-full md:w-auto pb-1 md:pb-0" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                                        {uniqueUserRoles.map(r => {
                                            const isActive = userRoleFilters.includes(r);
                                            return (
                                                <button
                                                    key={r}
                                                    onClick={() => toggleUserRoleFilter(r)}
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
                                                    {r}
                                                </button>
                                            );
                                        })}
                                        {(userSearch || userRoleFilters.length > 0) && (
                                            <button 
                                                onClick={() => { setUserSearch(''); setUserRoleFilters([]); }}
                                                style={{ padding: "6px 12px", background: "none", border: "none", color: "#64748b", fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}
                                            >
                                                Clear Filters
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="w-full md:w-auto flex items-center shrink-0">
                                    <button onClick={() => setShowUserModal(true)} className="btn-primary inline-flex items-center justify-center gap-2 w-full md:w-auto" style={{ padding: "8px 16px", height: "38px", whiteSpace: "nowrap" }}>
                                        <UserPlus className="h-4 w-4" aria-hidden="true" />
                                        Create New User
                                    </button>
                                </div>
                            </div>
                            
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", color: "#64748b", marginBottom: "1rem" }}>
                                <span>Showing {Math.min(processedUsers.length, paginatedUsers.length)} of {processedUsers.length} users</span>
                                {users.length > 10 && (
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                        <span>Show:</span>
                                        <select
                                            value={userItemsPerPage}
                                            onChange={(e) => setUserItemsPerPage(Number(e.target.value))}
                                            style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f8fafc" }}
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            {processedUsers.length === 0 ? (
                                <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 1rem", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                                    {users.length === 0
                                        ? "No users in the system yet."
                                        : userSearch && userRoleFilters.length > 0
                                            ? `No users match "${userSearch}" with the selected role filters. Try clearing one.`
                                            : userSearch
                                                ? `No users match "${userSearch}". Try a different search term.`
                                                : userRoleFilters.length > 0
                                                    ? `No users match the selected role filters.`
                                                    : "No users to show."}
                                </p>
                            ) : (
                                <>
                                    <div className="hidden md:block" style={{ overflowX: "auto", width: "100%", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                                        <table style={{ width: "100%", minWidth: "800px", borderCollapse: "collapse", textAlign: "left" }}>
                                            <thead>
                                                <tr>
                                                    <th onClick={() => handleUserSort('name')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            NAME
                                                            <span style={{ opacity: userSortConfig.key === 'name' ? 1 : 0.3 }}>
                                                                {userSortConfig.key === 'name' ? (userSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleUserSort('role')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            ROLE
                                                            <span style={{ opacity: userSortConfig.key === 'role' ? 1 : 0.3 }}>
                                                                {userSortConfig.key === 'role' ? (userSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleUserSort('kids')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            ASSIGNED KIDS
                                                            <span style={{ opacity: userSortConfig.key === 'kids' ? 1 : 0.3 }}>
                                                                {userSortConfig.key === 'kids' ? (userSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th style={{ padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedUsers.map(u => {
                                                    const hasName = u.first_name || u.last_name;
                                                    const displayName = hasName ? `${u.first_name} ${u.last_name}`.trim() : u.email;
                                                    return (
                                                        <tr key={u.id} style={{ borderBottom: "1px solid var(--border-light)", verticalAlign: "middle" }} className="hover:bg-slate-100 transition-colors duration-150">
                                                            <td style={{ padding: "12px" }}>
                                                                <div style={{ display: "flex", flexDirection: "column" }}>
                                                                    <Link href={`/users/${u.id}`} className="hover:text-blue-500 hover:underline transition-colors duration-200" style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: "bold", fontSize: "0.95rem" }}>
                                                                        {displayName}
                                                                    </Link>
                                                                    <span style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>{u.email}</span>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: "12px" }}>
                                                                <span style={{ fontSize: "0.75rem", background: getRoleStyle(u.role).bg, color: getRoleStyle(u.role).color, padding: "4px 10px", borderRadius: "12px", fontWeight: "600", letterSpacing: "0.3px" }}>
                                                                    {u.role}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: "12px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                                                {(u.role === 'TEACHER' || u.role === 'SPECIALIST') ? (
                                                                    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "24px", height: "24px", borderRadius: "12px", background: "#f1f5f9", color: "#475569", fontWeight: "bold", fontSize: "0.8rem", padding: "0 6px" }}>
                                                                        {u.assigned_students_count}
                                                                    </div>
                                                                ) : u.role === 'PARENT' && u.assigned_student_names && u.assigned_student_names.length > 0 ? (
                                                                    <div
                                                                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "24px", height: "24px", borderRadius: "12px", background: "#fef3c7", color: "#92400e", fontWeight: "bold", fontSize: "0.8rem", padding: "0 8px" }}
                                                                        title={u.assigned_student_names.join(', ')}
                                                                    >
                                                                        {u.assigned_student_names.length} {u.assigned_student_names.length === 1 ? "child" : "children"}
                                                                    </div>
                                                                ) : (
                                                                    <span style={{ color: "#cbd5e1" }}>-</span>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: "12px", textAlign: "right" }}>
                                                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", alignItems: "center" }}>
                                                                    <Link href={`/users/${u.id}`} className="hover:bg-blue-50 transition-colors duration-200" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "6px", color: "#3b82f6" }} title="View Profile">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                                                                    </Link>
                                                                    <button onClick={() => {
                                                                        setUserToDelete(u);
                                                                        setDeleteConfirmText("");
                                                                        setDeleteError("");
                                                                    }} className="hover:bg-red-50 transition-colors duration-200" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", background: "none", border: "none", cursor: "pointer", color: "#ef4444", borderRadius: "6px", padding: 0 }} title="Delete User">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="md:hidden flex flex-col gap-3">
                                        {paginatedUsers.map(u => {
                                            const hasName = u.first_name || u.last_name;
                                            const displayName = hasName ? `${u.first_name} ${u.last_name}`.trim() : u.email;
                                            return (
                                                <div key={u.id} className="bg-white rounded-xl border border-slate-200 p-4 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-3">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="flex flex-col min-w-0">
                                                            <Link href={`/users/${u.id}`} className="font-bold text-[var(--text-primary)] no-underline text-[1.1rem] hover:text-blue-600 transition-colors truncate">
                                                                {displayName}
                                                            </Link>
                                                            <span className="text-sm text-slate-500 mt-1 truncate">{u.email}</span>
                                                        </div>
                                                        <span style={{ fontSize: "0.65rem", fontWeight: "bold", padding: "4px 8px", borderRadius: "12px", textTransform: "uppercase", background: getRoleStyle(u.role).bg, color: getRoleStyle(u.role).color, textAlign: "center", whiteSpace: "nowrap" }}>
                                                            {u.role}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-slate-600">
                                                        <span className="font-semibold mr-1">Assigned Kids:</span>
                                                        {(u.role === 'TEACHER' || u.role === 'SPECIALIST') ? (
                                                            <span>{u.assigned_students_count}</span>
                                                        ) : u.role === 'PARENT' && u.assigned_student_names && u.assigned_student_names.length > 0 ? (
                                                            <span title={u.assigned_student_names.join(', ')}>
                                                                {u.assigned_student_names.length} {u.assigned_student_names.length === 1 ? "child" : "children"}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-400">None</span>
                                                        )}
                                                    </div>
                                                    <div className="border-t border-slate-100 pt-3 flex justify-end gap-2">
                                                        <Link href={`/users/${u.id}`} className="btn-slate text-sm flex-1 text-center py-2" title="View Profile">
                                                            Profile
                                                        </Link>
                                                        <button onClick={() => {
                                                            setUserToDelete(u);
                                                            setDeleteConfirmText("");
                                                            setDeleteError("");
                                                        }} className="btn-red text-sm flex-1 py-2" title="Delete User">
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                            
                            {/* Pagination Controls */}
                            {processedUsers.length > 0 && totalUserPages > 1 && (
                                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "1rem" }}>
                                    <button 
                                        onClick={() => setUserPage(p => Math.max(1, p - 1))} 
                                        disabled={safeUserPage === 1}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", background: safeUserPage === 1 ? "#f8fafc" : "white", color: safeUserPage === 1 ? "#cbd5e1" : "inherit", cursor: safeUserPage === 1 ? "not-allowed" : "pointer" }}
                                    >Previous</button>
                                    <span style={{ padding: "6px 12px", fontSize: "0.9rem", color: "#64748b" }}>
                                        Page {safeUserPage} of {totalUserPages}
                                    </span>
                                    <button 
                                        onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))} 
                                        disabled={safeUserPage === totalUserPages}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", background: safeUserPage === totalUserPages ? "#f8fafc" : "white", color: safeUserPage === totalUserPages ? "#cbd5e1" : "inherit", cursor: safeUserPage === totalUserPages ? "not-allowed" : "pointer" }}
                                    >Next</button>
                                </div>
                            )}
                        </div>
                    ) : activeTab === "invitations" ? (
                        <div>
                            {/* Action Bar (Search, Filters, Button) */}
                            <div className="flex flex-col lg:flex-row justify-between gap-4 mb-5 items-start">
                                <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center w-full lg:flex-1 min-w-0">
                                    <div className="relative w-full md:flex-1 md:max-w-[400px]">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        <input
                                            type="text"
                                            placeholder="Search by email..."
                                            value={invitationSearch}
                                            onChange={e => setInvitationSearch(e.target.value)}
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
                                    <div className="flex gap-2 items-center overflow-x-auto w-full md:w-auto pb-1 md:pb-0" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                                        {uniqueInvitationRoles.map(r => {
                                            const isActive = invitationRoleFilters.includes(r);
                                            return (
                                                <button
                                                    key={r}
                                                    onClick={() => toggleInvitationRoleFilter(r)}
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
                                                    {r}
                                                </button>
                                            );
                                        })}
                                        {(invitationSearch || invitationRoleFilters.length > 0) && (
                                            <button 
                                                onClick={() => { setInvitationSearch(''); setInvitationRoleFilters([]); }}
                                                style={{ padding: "6px 12px", background: "none", border: "none", color: "#64748b", fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}
                                            >
                                                Clear Filters
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="w-full md:w-auto flex items-center shrink-0">
                                    <button onClick={() => setShowInviteModal(true)} className="btn-secondary w-full md:w-auto" style={{ padding: "8px 16px", height: "38px", whiteSpace: "nowrap", background: "#f8fafc", color: "var(--accent-primary)", border: "1px solid var(--accent-primary)", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>
                                        ✉️ Invite New User
                                    </button>
                                </div>
                            </div>
                            
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", color: "#64748b", marginBottom: "1rem" }}>
                                <span>Showing {Math.min(processedInvitations.length, paginatedInvitations.length)} of {processedInvitations.length} invitations</span>
                                {pendingInvitations.length > 10 && (
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                        <span>Show:</span>
                                        <select
                                            value={invitationItemsPerPage}
                                            onChange={(e) => setInvitationItemsPerPage(Number(e.target.value))}
                                            style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#f8fafc" }}
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            {processedInvitations.length === 0 ? (
                                <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem 1rem", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                                    {pendingInvitations.length === 0
                                        ? "No pending invitations in the system."
                                        : invitationSearch && invitationRoleFilters.length > 0
                                            ? `No invitations match "${invitationSearch}" with the selected role filters.`
                                            : invitationSearch
                                                ? `No invitations match "${invitationSearch}".`
                                                : invitationRoleFilters.length > 0
                                                    ? "No invitations match the selected role filters."
                                                    : "No invitations to show."}
                                </p>
                            ) : (
                                <>
                                    <div className="hidden md:block" style={{ overflowX: "auto", width: "100%", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                                        <table style={{ width: "100%", minWidth: "600px", borderCollapse: "collapse", textAlign: "left" }}>
                                            <thead>
                                                <tr>
                                                    <th onClick={() => handleInvitationSort('email')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            EMAIL
                                                            <span style={{ opacity: invitationSortConfig.key === 'email' ? 1 : 0.3 }}>
                                                                {invitationSortConfig.key === 'email' ? (invitationSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleInvitationSort('role')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            ROLE
                                                            <span style={{ opacity: invitationSortConfig.key === 'role' ? 1 : 0.3 }}>
                                                                {invitationSortConfig.key === 'role' ? (invitationSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleInvitationSort('date')} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            SENT DATE
                                                            <span style={{ opacity: invitationSortConfig.key === 'date' ? 1 : 0.3 }}>
                                                                {invitationSortConfig.key === 'date' ? (invitationSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th style={{ padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>EXPIRES</th>
                                                    <th style={{ padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedInvitations.map(inv => {
                                                    const expiry = inv.expires_at ? getExpiryDisplay(inv.expires_at) : null;
                                                    return (
                                                    <tr key={inv.id} style={{ borderBottom: "1px solid var(--border-light)", verticalAlign: "middle", opacity: expiry?.isExpired ? 0.65 : 1 }} className="hover:bg-slate-100 transition-colors duration-150">
                                                        <td style={{ padding: "12px", fontWeight: "bold", color: "var(--text-primary)", textDecoration: expiry?.isExpired ? 'line-through' : 'none' }}>{inv.email}</td>
                                                        <td style={{ padding: "12px" }}>
                                                            <span style={{ fontSize: "0.72rem", background: getRoleStyle(inv.role).bg, color: getRoleStyle(inv.role).color, padding: "4px 10px", borderRadius: "12px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                                                                {inv.role}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: "12px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{new Date(inv.created_at).toLocaleDateString()}</td>
                                                        <td style={{ padding: "12px" }}>
                                                            {expiry ? (
                                                                <span style={{ fontSize: "0.72rem", background: expiry.bg, color: expiry.color, padding: "4px 10px", borderRadius: "12px", fontWeight: "bold", letterSpacing: "0.3px", whiteSpace: "nowrap" }}>
                                                                    {expiry.label}
                                                                </span>
                                                            ) : <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>—</span>}
                                                        </td>
                                                        <td style={{ padding: "12px", textAlign: "right" }}>
                                                            <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" }}>
                                                                {!expiry?.isExpired && (
                                                                    <button
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`);
                                                                            toast.success('Invite link copied to clipboard!');
                                                                        }}
                                                                        className="hover:bg-blue-50 transition-colors duration-200"
                                                                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "6px", background: "none", border: "none", color: "#3b82f6", cursor: "pointer", padding: 0 }}
                                                                        title="Copy Invite Link"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => setInviteToResend(inv)}
                                                                    className="hover:bg-emerald-50 transition-colors duration-200"
                                                                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "6px", background: "none", border: "none", color: "#16a34a", cursor: "pointer", padding: 0 }}
                                                                    title="Resend Invitation"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.49 2.74l1.51 1.51"/><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.49-2.74L3.5 16.75"/><polyline points="20 4 20 9 15 9"/><polyline points="4 20 4 15 9 15"/></svg>
                                                                </button>
                                                                <button onClick={() => setInviteToRevoke(inv)} className="hover:bg-red-50 transition-colors duration-200" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "6px", background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 0 }} title="Revoke Invite">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="md:hidden flex flex-col gap-3">
                                        {paginatedInvitations.map(inv => {
                                            const expiry = inv.expires_at ? getExpiryDisplay(inv.expires_at) : null;
                                            return (
                                                <div key={inv.id} className={`bg-white rounded-xl border border-slate-200 p-4 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-3 ${expiry?.isExpired ? 'opacity-65' : ''}`}>
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="flex flex-col flex-1 min-w-0">
                                                            <span className={`font-bold text-[var(--text-primary)] text-[1rem] truncate ${expiry?.isExpired ? 'line-through' : ''}`} title={inv.email}>
                                                                {inv.email}
                                                            </span>
                                                            <span className="text-sm text-slate-500 mt-1">Sent: {new Date(inv.created_at).toLocaleDateString()}</span>
                                                        </div>
                                                        <span style={{ fontSize: "0.65rem", fontWeight: "bold", padding: "4px 8px", borderRadius: "12px", textTransform: "uppercase", background: getRoleStyle(inv.role).bg, color: getRoleStyle(inv.role).color, textAlign: "center", whiteSpace: "nowrap", flexShrink: 0 }}>
                                                            {inv.role}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2 text-sm">
                                                        <span className="text-slate-500">Expires:</span>
                                                        {expiry ? (
                                                            <span style={{ fontSize: "0.72rem", background: expiry.bg, color: expiry.color, padding: "2px 8px", borderRadius: "12px", fontWeight: "bold", whiteSpace: "nowrap" }}>
                                                                {expiry.label}
                                                            </span>
                                                        ) : <span className="text-slate-400">—</span>}
                                                    </div>
                                                    <div className="border-t border-slate-100 pt-3 flex justify-end gap-2 flex-wrap">
                                                        {!expiry?.isExpired && (
                                                            <button onClick={() => {
                                                                navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`);
                                                                toast.success('Invite link copied to clipboard!');
                                                            }} className="btn-secondary text-xs flex-1 text-center py-2" title="Copy Invite Link">
                                                                Copy Link
                                                            </button>
                                                        )}
                                                        <button onClick={() => setInviteToResend(inv)} className="btn-secondary text-xs flex-1 text-center py-2" title="Resend Invitation">
                                                            Resend
                                                        </button>
                                                        <button onClick={() => setInviteToRevoke(inv)} className="btn-red text-xs flex-1 py-2" title="Revoke Invite">
                                                            Revoke
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            {/* Pagination Controls */}
                            {processedInvitations.length > 0 && totalInvitationPages > 1 && (
                                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "1rem" }}>
                                    <button 
                                        onClick={() => setInvitationPage(p => Math.max(1, p - 1))} 
                                        disabled={safeInvitationPage === 1}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", background: safeInvitationPage === 1 ? "#f8fafc" : "white", color: safeInvitationPage === 1 ? "#cbd5e1" : "inherit", cursor: safeInvitationPage === 1 ? "not-allowed" : "pointer" }}
                                    >Previous</button>
                                    <span style={{ padding: "6px 12px", fontSize: "0.9rem", color: "#64748b" }}>
                                        Page {safeInvitationPage} of {totalInvitationPages}
                                    </span>
                                    <button 
                                        onClick={() => setInvitationPage(p => Math.min(totalInvitationPages, p + 1))} 
                                        disabled={safeInvitationPage === totalInvitationPages}
                                        style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", background: safeInvitationPage === totalInvitationPages ? "#f8fafc" : "white", color: safeInvitationPage === totalInvitationPages ? "#cbd5e1" : "inherit", cursor: safeInvitationPage === totalInvitationPages ? "not-allowed" : "pointer" }}
                                    >Next</button>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

            {/* ── Create User Modal ───────────────────────────────────────── */}
            {showUserModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "white", padding: "2rem", borderRadius: "12px", width: "420px", maxWidth: "90%" }}>
                        <h2 style={{ marginTop: 0 }}>Create User Account</h2>
                        {userFormError && (
                            <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "10px", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.85rem", fontWeight: "bold" }}>
                                {userFormError}
                            </div>
                        )}
                        <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <div style={{ display: "flex", gap: "1rem" }}>
                                <input required placeholder="First Name" value={newUser.first_name} onChange={e => setNewUser({ ...newUser, first_name: e.target.value })} className="form-input" style={{ width: "50%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                                <input required placeholder="Last Name" value={newUser.last_name} onChange={e => setNewUser({ ...newUser, last_name: e.target.value })} className="form-input" style={{ width: "50%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                            </div>
                            <input required type="email" placeholder="Email Address" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                            <div style={{ display: "flex", gap: "1rem" }}>
                                <input required type="password" placeholder="Password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} className="form-input" style={{ width: "50%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                                <input required type="password" placeholder="Confirm Password" value={newUser.confirm_password}
                                    onChange={e => setNewUser({ ...newUser, confirm_password: e.target.value })}
                                    className="form-input"
                                    style={{
                                        width: "50%", padding: "8px", borderRadius: "4px",
                                        border: `1px solid ${newUser.confirm_password && newUser.password !== newUser.confirm_password ? '#ef4444' : '#ccc'}`,
                                    }}
                                />
                            </div>
                            {newUser.confirm_password && newUser.password !== newUser.confirm_password && (
                                <p style={{ color: "#ef4444", fontSize: "0.8rem", margin: "-6px 0 0 0" }}>Passwords do not match</p>
                            )}
                            <select required value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value, specialties: e.target.value === "SPECIALIST" ? newUser.specialties : [] })} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}>
                                <option value="ADMIN">Admin</option>
                                <option value="TEACHER">Teacher</option>
                                <option value="SPECIALIST">Specialist</option>
                                <option value="PARENT">Parent</option>
                            </select>
                            {newUser.role === "SPECIALIST" && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px", border: "1px solid #ccc", borderRadius: "4px" }}>
                                    <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569", margin: "0 0 4px 0", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                                        Specialties (select one or more)
                                    </p>
                                    {SPECIALIST_SPECIALTIES.map(option => {
                                        const checked = newUser.specialties.includes(option);
                                        return (
                                            <label key={option} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "#0f172a", cursor: "pointer" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {
                                                        setNewUser(prev => ({
                                                            ...prev,
                                                            specialties: checked
                                                                ? prev.specialties.filter(s => s !== option)
                                                                : [...prev.specialties, option],
                                                        }));
                                                    }}
                                                    style={{ width: 16, height: 16, accentColor: "#4f46e5" }}
                                                />
                                                {option}
                                            </label>
                                        );
                                    })}
                                    {newUser.specialties.length === 0 && (
                                        <p style={{ fontSize: "0.78rem", color: "#dc2626", margin: "4px 0 0 0" }}>
                                            Select at least one specialty.
                                        </p>
                                    )}
                                </div>
                            )}
                            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
                                <button type="submit" className="btn-primary" style={{ flex: 1, padding: "10px", opacity: creatingUser ? 0.6 : 1 }} disabled={creatingUser}>
                                    {creatingUser ? "Creating..." : "Create"}
                                </button>
                                <button type="button" onClick={() => { setShowUserModal(false); setUserFormError(""); }} style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", cursor: "pointer" }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Create Student Modal ────────────────────────────────────── */}
            {showStudentModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "white", padding: "2rem", borderRadius: "12px", width: "400px", maxWidth: "90%" }}>
                        <h2 style={{ marginTop: 0, fontWeight: 500, color: "#334155" }}>Register Student</h2>
                        <form onSubmit={handleCreateStudent} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <input required placeholder="First Name *" value={newStudent.first_name} onChange={e => setNewStudent({ ...newStudent, first_name: e.target.value })} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                            <input required placeholder="Last Name *" value={newStudent.last_name} onChange={e => setNewStudent({ ...newStudent, last_name: e.target.value })} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <label style={{ fontSize: "0.9rem", color: "#64748b", fontWeight: 400 }}>
                                    Child's Date of Birth <span style={{ color: "#ef4444" }}>*</span>
                                </label>
                                <input required type="date" value={newStudent.date_of_birth} onChange={e => setNewStudent({ ...newStudent, date_of_birth: e.target.value })} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />
                            </div>
                            <input required placeholder="Parent Email *" type="email" value={newStudent.parent_email} onChange={e => setNewStudent({ ...newStudent, parent_email: e.target.value })} className="form-input" style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }} />

                            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
                                <button type="submit" className="btn-primary" style={{ flex: 1, padding: "10px", opacity: creatingStudent ? 0.6 : 1 }} disabled={creatingStudent}>
                                    {creatingStudent ? "Registering..." : "Register"}
                                </button>
                                <button type="button" onClick={() => setShowStudentModal(false)} style={{ flex: 1, padding: "10px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", cursor: "pointer" }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Invite User Modal ──────────────────────────────────────── */}
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

            {/* ── Delete User Confirmation Modal ─────────────────────────── */}
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

            {/* ── Revoke Invite Confirmation ──────────────────────────────── */}
            {inviteToRevoke && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
                        <h2 className="m-0 text-lg font-extrabold text-red-700">Revoke invitation</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            Revoking will invalidate the existing invite link for <strong>{inviteToRevoke.email}</strong>. They will not be able to register with the current link.
                        </p>
                        <div className="mt-5 flex gap-2">
                            <button
                                type="button"
                                onClick={handleConfirmRevokeInvite}
                                disabled={inviteActionLoading}
                                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-60"
                            >
                                {inviteActionLoading ? "Revoking..." : "Revoke"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setInviteToRevoke(null)}
                                disabled={inviteActionLoading}
                                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Resend Invite Confirmation ──────────────────────────────── */}
            {inviteToResend && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
                        <h2 className="m-0 text-lg font-extrabold text-emerald-700">Resend invitation</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            This will revoke the previous link for <strong>{inviteToResend.email}</strong> and issue a fresh 72-hour invitation. You'll get a new copyable link after the resend.
                        </p>
                        <div className="mt-5 flex gap-2">
                            <button
                                type="button"
                                onClick={handleConfirmResendInvite}
                                disabled={inviteActionLoading}
                                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
                            >
                                {inviteActionLoading ? "Sending..." : "Resend"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setInviteToResend(null)}
                                disabled={inviteActionLoading}
                                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Created/Resent Invite Token (copyable) ──────────────────── */}
            {createdInvite && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
                        <h2 className="m-0 text-lg font-extrabold text-slate-900">Invite link ready</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            Send this link to <strong>{createdInvite.email}</strong>. It's valid for 72 hours.
                        </p>
                        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2">
                            <code className="flex-1 break-all text-xs font-medium text-slate-700">
                                {`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${createdInvite.token}`}
                            </code>
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/invite/${createdInvite.token}`);
                                    toast.success("Invite link copied.");
                                }}
                                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
                            >
                                Copy
                            </button>
                        </div>
                        <div className="mt-5 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setCreatedInvite(null)}
                                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
