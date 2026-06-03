"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ArrowRight, BarChart3, ClipboardList, Clock, FileCheck2, Mail, Search, Sparkles, UserPlus, Users as UsersIcon, Zap } from "lucide-react";
import { SPECIALIST_SPECIALTIES, type SpecialistSpecialty } from "@/lib/specialties";
import { roleColorHex, statusColorHex } from "@/lib/role-colors";
import { toast } from "sonner";
import { extractApiError } from "@/lib/toast-utils";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

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
    has_parent_assessment?: boolean;
    has_specialist_assessment?: boolean;
    parent_current_tracker_submitted?: boolean;
    specialist_current_tracker_submitted?: boolean;
    teacher_current_tracker_submitted?: boolean;
    next_action?: {
        label: string;
        tone: string;
        workspace?: string;
    };
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

const getFormPillClass = (isSubmitted?: boolean) => {
    return `cursor-pointer text-[0.65rem] font-bold px-2 py-1 rounded-xl border transition-colors duration-200 ${
        isSubmitted 
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900 hover:border-emerald-300" 
            : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-500 hover:border-slate-300"
    }`;
};

const getActionButtonClass = (tone?: string) => {
    const base = "no-underline transition-colors duration-200 border ";
    if (tone === "warning") return base + "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:border-amber-300";
    if (tone === "positive") return base + "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300";
    return base + "bg-indigo-50/50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300";
};

/* ─── Main Component ─────────────────────────────────────────────────────── */

export default function AdminDashboard() {
    const router = useRouter();
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


    const fetchData = useCallback(async () => {
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
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const dashboardEditing =
        showUserModal || showInviteModal || showStudentModal ||
        !!userToDelete || !!inviteToRevoke || !!inviteToResend || !!createdInvite;
    useRealtimeRefresh({
        targets: ['dashboard', 'users', 'staff', 'invitations'],
        isEditing: dashboardEditing,
        onRefresh: fetchData,
    });

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
            toast.error(extractApiError(err, "Failed to create user"));
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
            toast.error(extractApiError(err, "Failed to send invite"));
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
            toast.error(extractApiError(err, "Failed to register student"));
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
            toast.error(extractApiError(err, "Failed to delete invitation."));
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
            toast.error(extractApiError(err, "Failed to resend invitation."));
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
                            
                            {/* Sleek Action Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white text-slate-900 rounded-2xl shadow-sm border border-slate-200">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                                        <Zap className="h-5 w-5" aria-hidden="true" />
                                    </div>
                                    <div>
                                        <h3 className="m-0 text-base font-extrabold text-slate-900">Quick Actions</h3>
                                        <p className="m-0 text-xs text-slate-500">Most-used admin tasks</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowStudentModal(true)}
                                        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-500 border border-indigo-500"
                                    >
                                        <UserPlus className="h-4 w-4" aria-hidden="true" />
                                        Register student
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowInviteModal(true)}
                                        className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 hover:border-slate-300"
                                    >
                                        <Mail className="h-4 w-4" aria-hidden="true" />
                                        Invite user
                                    </button>
                                    <Link
                                        href="/admin/iep"
                                        className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 hover:border-slate-300 no-underline"
                                    >
                                        <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                                        IEP generator
                                    </Link>
                                    <Link
                                        href="/admin/reports"
                                        className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 hover:border-slate-300 no-underline"
                                    >
                                        <BarChart3 className="h-4 w-4" aria-hidden="true" />
                                        Reports
                                    </Link>
                                </div>
                            </div>

                            {/* Top Row: Urgent & Pending Tasks + KPIs */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                
                                {/* Urgent & Pending Tasks (Action Center + Watchlist combined) */}
                                <div className="lg:col-span-2 flex flex-col bg-white rounded-2xl border border-rose-200 shadow-sm overflow-hidden">
                                    <div className="bg-rose-50 border-b border-rose-100 p-4 sm:p-5 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600 shadow-inner">
                                                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                            </div>
                                            <div>
                                                <h3 className="m-0 text-lg font-extrabold text-slate-900">Needs Attention</h3>
                                                <p className="m-0 text-sm text-slate-500">Urgent actions, pending tasks, and watchlist items.</p>
                                            </div>
                                        </div>
                                        <div className="hidden sm:flex gap-2">
                                            <span className="text-xs font-bold text-rose-700 bg-rose-100 px-3 py-1 rounded-full border border-rose-200">{actionCounts.warning} urgent</span>
                                            <span className="text-xs font-bold text-blue-700 bg-blue-100 px-3 py-1 rounded-full border border-blue-200">{actionCounts.info} queued</span>
                                        </div>
                                    </div>
                                    <div className="p-4 sm:p-5 flex-1 max-h-[400px] overflow-y-auto bg-slate-50/50">
                                        {dashboardActions.length === 0 && watchlistItems.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-full text-center py-8">
                                                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3 shadow-sm">
                                                    <Sparkles className="w-8 h-8" />
                                                </div>
                                                <p className="font-bold text-slate-900 m-0 text-lg">You're all caught up!</p>
                                                <p className="text-sm text-slate-500 mt-1 mb-0">No pending actions required right now.</p>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-3">
                                                {/* Actions */}
                                                {dashboardActions.map(action => {
                                                    const actionStyle = getActionTypeStyle(action.type);
                                                    return (
                                                        <div key={action.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl shadow-sm" style={{ backgroundColor: actionStyle.bg, border: `1px solid ${actionStyle.border}` }}>
                                                            <div>
                                                                <p className="m-0 text-sm font-bold" style={{ color: actionStyle.title }}>{action.title}</p>
                                                                <p className="mt-1 mb-0 text-xs" style={{ color: actionStyle.body }}>{action.description}</p>
                                                            </div>
                                                            {isSafeActionLink(action.link) ? (
                                                                <Link href={action.link} className="shrink-0 text-center text-xs font-bold px-4 py-2 rounded-lg bg-white shadow-sm transition-transform hover:scale-105 hover:shadow-md" style={{ color: actionStyle.title, border: `1px solid ${actionStyle.border}`, textDecoration: "none" }}>
                                                                    {action.action_text}
                                                                </Link>
                                                            ) : (
                                                                <span className="shrink-0 text-center text-xs italic text-slate-400 px-4 py-2" title="Action link unavailable">Unavailable</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                
                                                {/* Watchlist Items */}
                                                {watchlistItems.map(item => {
                                                    const tone = (item.tone as string) === 'warning' ? { bg: '#fffbeb', border: '#fde68a', title: '#92400e', body: '#b45309' } : { bg: '#eff6ff', border: '#bfdbfe', title: '#1d4ed8', body: '#2563eb' };
                                                    return (
                                                        <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl shadow-sm" style={{ backgroundColor: tone.bg, border: `1px solid ${tone.border}` }}>
                                                            <div>
                                                                <p className="m-0 text-sm font-bold" style={{ color: tone.title }}>{item.title}</p>
                                                                <p className="mt-1 mb-0 text-xs" style={{ color: tone.body }}>{item.description}</p>
                                                            </div>
                                                            {isSafeActionLink(item.link) ? (
                                                                <Link href={item.link} className="shrink-0 text-center text-xs font-bold px-4 py-2 rounded-lg bg-white shadow-sm transition-transform hover:scale-105 hover:shadow-md" style={{ color: tone.title, border: `1px solid ${tone.border}`, textDecoration: "none" }}>
                                                                    {item.cta} &rarr;
                                                                </Link>
                                                            ) : (
                                                                <span className="shrink-0 text-center text-xs italic text-slate-400 px-4 py-2">Unavailable</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Condense KPIs */}
                                <div className="flex flex-col gap-3">
                                    <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm flex items-center justify-between hover:border-indigo-300 transition-all hover:shadow-md group">
                                        <div>
                                            <p className="m-0 text-[10px] font-bold uppercase tracking-widest text-indigo-500">Active Students</p>
                                            <p className="mt-1 mb-0 text-2xl font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">{totalStudents}</p>
                                            <p className="mt-1 text-xs font-medium text-slate-500 mb-0">{activeStudents} enrolled &middot; {archivedStudents} archived</p>
                                        </div>
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-200">
                                            <UsersIcon className="h-5 w-5" />
                                        </div>
                                    </div>
                                    
                                    <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm flex items-center justify-between hover:border-amber-300 transition-all hover:shadow-md group">
                                        <div>
                                            <p className="m-0 text-[10px] font-bold uppercase tracking-widest text-amber-600">Awaiting Assess</p>
                                            <p className="mt-1 mb-0 text-2xl font-extrabold text-slate-900 group-hover:text-amber-600 transition-colors">{pendingStudents}</p>
                                            <p className="mt-1 text-xs font-medium text-slate-500 mb-0">Intake / Scheduling</p>
                                        </div>
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-md shadow-amber-200">
                                            <Clock className="h-5 w-5" />
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm flex items-center justify-between hover:border-sky-300 transition-all hover:shadow-md group">
                                        <div>
                                            <p className="m-0 text-[10px] font-bold uppercase tracking-widest text-sky-600">Awaiting Enroll</p>
                                            <p className="mt-1 mb-0 text-2xl font-extrabold text-slate-900 group-hover:text-sky-600 transition-colors">{reviewStudents}</p>
                                            <p className="mt-1 text-xs font-medium text-slate-500 mb-0">Ready for decision</p>
                                        </div>
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-500 text-white shadow-md shadow-sky-200">
                                            <ClipboardList className="h-5 w-5" />
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm flex items-center justify-between hover:border-pink-300 transition-all hover:shadow-md group">
                                        <div>
                                            <p className="m-0 text-[10px] font-bold uppercase tracking-widest text-pink-600">Pending Invites</p>
                                            <p className="mt-1 mb-0 text-2xl font-extrabold text-slate-900 group-hover:text-pink-600 transition-colors">{validPendingInvitations.length}</p>
                                            <p className="mt-1 text-xs font-medium text-slate-500 mb-0">{expiringSoonInvitations.length} expiring in 24h</p>
                                        </div>
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-pink-400 to-pink-500 text-white shadow-md shadow-pink-200">
                                            <Mail className="h-5 w-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Middle Row: Funnel and Team Capacity */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                
                                {/* Student Workflow Snapshot (Horizontal Funnel) */}
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col hover:shadow-md transition-shadow">
                                    <div className="mb-6">
                                        <h3 className="m-0 text-lg font-extrabold text-slate-900">Student Pipeline</h3>
                                        <p className="m-0 mt-1 text-sm text-slate-500">Live view of where students sit in the enrollment flow.</p>
                                    </div>
                                    
                                    <div className="flex flex-col gap-4 mt-auto mb-auto">
                                        {/* Horizontal bar representation */}
                                        <div className="relative pt-6">
                                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">
                                                <span>Assess</span>
                                                <span>Schedule</span>
                                                <span>Review</span>
                                                <span>Enrolled</span>
                                            </div>
                                            <div className="flex h-12 w-full rounded-full overflow-hidden border border-slate-200 bg-slate-100 shadow-inner">
                                                <div style={{ width: `${totalStudents ? (pendingStudents / totalStudents) * 100 : 0}%`, transition: "width 1s ease-out" }} className="bg-amber-400 h-full flex items-center justify-center text-xs font-bold text-white" title="Pending Assessment">
                                                    {pendingStudents > 0 ? pendingStudents : ""}
                                                </div>
                                                <div style={{ width: `${totalStudents ? (scheduledStudents / totalStudents) * 100 : 0}%`, transition: "width 1s ease-out" }} className="bg-sky-400 h-full flex items-center justify-center text-xs font-bold text-white" title="Assessment Scheduled">
                                                    {scheduledStudents > 0 ? scheduledStudents : ""}
                                                </div>
                                                <div style={{ width: `${totalStudents ? (reviewStudents / totalStudents) * 100 : 0}%`, transition: "width 1s ease-out" }} className="bg-indigo-400 h-full flex items-center justify-center text-xs font-bold text-white" title="Awaiting Review">
                                                    {reviewStudents > 0 ? reviewStudents : ""}
                                                </div>
                                                <div style={{ width: `${totalStudents ? (activeStudents / totalStudents) * 100 : 0}%`, transition: "width 1s ease-out" }} className="bg-emerald-400 h-full flex items-center justify-center text-xs font-bold text-white" title="Enrolled">
                                                    {activeStudents > 0 ? activeStudents : ""}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                                            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                                <div className="w-3 h-3 rounded-full bg-amber-400 shrink-0"></div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Pending</span>
                                                    <span className="text-sm font-extrabold text-slate-700">{pendingStudents}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                                <div className="w-3 h-3 rounded-full bg-sky-400 shrink-0"></div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Scheduled</span>
                                                    <span className="text-sm font-extrabold text-slate-700">{scheduledStudents}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                                <div className="w-3 h-3 rounded-full bg-indigo-400 shrink-0"></div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Review</span>
                                                    <span className="text-sm font-extrabold text-slate-700">{reviewStudents}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                                <div className="w-3 h-3 rounded-full bg-emerald-400 shrink-0"></div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Enrolled</span>
                                                    <span className="text-sm font-extrabold text-slate-700">{activeStudents}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center bg-slate-50 p-4 rounded-xl">
                                        <span className="text-sm font-medium text-slate-700">{inProgressStudents} students actively moving through evaluation.</span>
                                        <Link href="/dashboard?tab=students" className="text-sm font-bold text-indigo-600 hover:text-indigo-700 no-underline whitespace-nowrap">
                                            Open roster &rarr;
                                        </Link>
                                    </div>
                                </div>

                                {/* Team Capacity Chart */}
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h3 className="m-0 text-lg font-extrabold text-slate-900">Team Capacity</h3>
                                            <p className="m-0 mt-1 text-sm text-slate-500">Average caseload: <span className="font-bold text-slate-800">{averageCaseload.toFixed(1)} students</span></p>
                                        </div>
                                        {unassignedStaff.length > 0 && (
                                            <div className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200">
                                                {unassignedStaff.length} staff available
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="flex-1 flex flex-col justify-end">
                                        {/* Visual Bar Chart for Caseloads */}
                                        <div className="space-y-4">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider m-0">Top Caseloads</p>
                                            {staffSortedByCaseload.slice(0, 4).map(staff => {
                                                const maxCaseload = Math.max(1, staffSortedByCaseload[0]?.assigned_students_count || 1);
                                                const pct = (staff.assigned_students_count / maxCaseload) * 100;
                                                // Color changes depending on load
                                                const barColor = pct > 80 ? "bg-rose-500" : pct > 50 ? "bg-amber-400" : "bg-emerald-400";
                                                
                                                return (
                                                    <div key={staff.id} className="flex flex-col gap-1.5">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="font-bold text-slate-700 truncate w-40">{staff.first_name} {staff.last_name}</span>
                                                            <span className="font-extrabold text-slate-900">{staff.assigned_students_count}</span>
                                                        </div>
                                                        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                                            <div className={`${barColor} h-full rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {staffSortedByCaseload.length === 0 && (
                                                <p className="text-sm text-slate-500 italic">No instructional staff assigned yet.</p>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {specialistsWithoutSpecialty.length > 0 && (
                                        <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3 transition-colors hover:bg-blue-100/50">
                                            <div className="mt-0.5 text-blue-500">
                                                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-blue-900 m-0">{specialistsWithoutSpecialty.length} specialist(s) missing specialty</p>
                                                <p className="text-xs text-blue-700 mt-0.5 mb-0">Update their profiles for better assignment tracking.</p>
                                            </div>
                                        </div>
                                    )}
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
                                    <div className="hidden md:block" style={{ overflowX: "auto", width: "100%", borderRadius: "12px", border: "2px solid var(--border-light)" }}>
                                        <table style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse", textAlign: "left" }}>
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
                                                    <th style={{ padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>
                                                        {statusFilters.length > 0 && statusFilters.every(f => ["ENROLLED", "INTEGRATED"].includes(f.toUpperCase())) ? "PROGRESS TRACKERS" : "FORMS STATUS"}
                                                    </th>
                                                    <th style={{ padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)" }}>ACTION</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedStudents.map(s => {
                                                    const ss = getStatusStyle(s.status);
                                                    const nextAction = s.next_action;
                                                    return (
                                                        <tr key={s.id} style={{ borderBottom: "1px solid var(--border-light)", verticalAlign: "middle" }}>
                                                            <td style={{ padding: "12px", color: "#94a3b8", fontSize: "0.85rem" }}>#{s.id}</td>
                                                            <td style={{ padding: "12px" }}>
                                                                <Link href={`/workspace?studentId=${s.id}`} className="hover:text-indigo-600 hover:underline transition-colors duration-200" style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: "bold", fontSize: "0.95rem" }}>
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
                                                            <td style={{ padding: "12px" }}>
                                                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxWidth: "250px" }}>
                                                                    {s.status.toUpperCase() !== "ENROLLED" && s.status.toUpperCase() !== "INTEGRATED" ? (
                                                                        <>
                                                                            <div
                                                                                className={getFormPillClass(s.has_parent_assessment)}
                                                                                onClick={() => s.has_parent_assessment ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=parent_assessment`) : toast.error("Not yet submitted")}
                                                                            >Parent Assessment</div>
                                                                            <div
                                                                                className={getFormPillClass(s.has_specialist_assessment)}
                                                                                onClick={() => s.has_specialist_assessment ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=multi_assessment`) : toast.error("Not yet submitted")}
                                                                            >Specialist Assessment</div>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <div
                                                                                className={getFormPillClass(s.parent_current_tracker_submitted)}
                                                                                onClick={() => s.parent_current_tracker_submitted ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=parent_tracker`) : toast.error("Not yet submitted")}
                                                                            >Parent Progress</div>
                                                                            <div
                                                                                className={getFormPillClass(s.specialist_current_tracker_submitted)}
                                                                                onClick={() => s.specialist_current_tracker_submitted ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=multi_tracker`) : toast.error("Not yet submitted")}
                                                                            >Specialist Progress</div>
                                                                            {s.status.toUpperCase() === "INTEGRATED" && (
                                                                                <div
                                                                                    className={getFormPillClass(s.teacher_current_tracker_submitted)}
                                                                                    onClick={() => s.teacher_current_tracker_submitted ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=sped_tracker`) : toast.error("Not yet submitted")}
                                                                                >Teacher Progress</div>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: "12px", textAlign: "right" }}>
                                                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", alignItems: "center" }}>
                                                                    {nextAction ? (
                                                                        <Link 
                                                                            href={`/workspace?studentId=${s.id}${nextAction.workspace ? `&workspace=${nextAction.workspace}` : ''}`} 
                                                                            style={{ 
                                                                                fontSize: "0.75rem", 
                                                                                padding: "6px 12px", 
                                                                                borderRadius: "6px", 
                                                                                fontWeight: 600,
                                                                                display: "flex",
                                                                                alignItems: "center",
                                                                                gap: "4px"
                                                                            }} 
                                                                            className={`${getActionButtonClass(nextAction.tone)} active:scale-95`}
                                                                        >
                                                                            {nextAction.tone === "positive" ? <Sparkles size={12} /> : null}
                                                                            {nextAction.label}
                                                                        </Link>
                                                                    ) : (
                                                                        <Link 
                                                                            href={`/workspace?studentId=${s.id}`} 
                                                                            style={{ 
                                                                                fontSize: "0.75rem", 
                                                                                padding: "6px 12px", 
                                                                                background: "#f8fafc", 
                                                                                border: "1px solid #e2e8f0", 
                                                                                borderRadius: "6px", 
                                                                                color: "#475569", 
                                                                                textDecoration: "none", 
                                                                                fontWeight: 600 
                                                                            }} 
                                                                            className="hover:bg-slate-100 active:scale-95 transition-all"
                                                                        >
                                                                            Open Workspace
                                                                        </Link>
                                                                    )}
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
                                            const nextAction = s.next_action;
                                            return (
                                                <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-3">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-xs font-mono text-slate-400 mb-1">#{s.id}</span>
                                                            <Link href={`/workspace?studentId=${s.id}`} className="font-bold text-[var(--text-primary)] no-underline text-[1.1rem] hover:text-blue-600 transition-colors truncate">
                                                                {s.first_name} {s.last_name}
                                                            </Link>
                                                            <span className="text-sm text-slate-500 mt-1">{s.grade || "Grade TBD"}</span>
                                                        </div>
                                                        <span style={{ fontSize: "0.65rem", fontWeight: "bold", padding: "4px 8px", borderRadius: "12px", textTransform: "uppercase", background: ss.bg, color: ss.color, textAlign: "center", whiteSpace: "nowrap" }}>
                                                            {s.status.replace(/_/g, " ")}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                                                        <div className="flex flex-col gap-2">
                                                            <span className="text-slate-400 font-semibold text-xs">
                                                                {["ENROLLED", "INTEGRATED"].includes(s.status.toUpperCase()) ? "Progress Trackers" : "Assessments"}
                                                            </span>
                                                            <div className="flex flex-wrap gap-2">
                                                                {s.status.toUpperCase() !== "ENROLLED" && s.status.toUpperCase() !== "INTEGRATED" ? (
                                                                    <>
                                                                        <div
                                                                            className={getFormPillClass(s.has_parent_assessment)}
                                                                            onClick={() => s.has_parent_assessment ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=parent_assessment`) : toast.error("Not yet submitted")}
                                                                        >Parent Assessment</div>
                                                                        <div
                                                                            className={getFormPillClass(s.has_specialist_assessment)}
                                                                            onClick={() => s.has_specialist_assessment ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=multi_assessment`) : toast.error("Not yet submitted")}
                                                                        >Specialist Assessment</div>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <div
                                                                            className={getFormPillClass(s.parent_current_tracker_submitted)}
                                                                            onClick={() => s.parent_current_tracker_submitted ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=parent_tracker`) : toast.error("Not yet submitted")}
                                                                        >Parent Progress</div>
                                                                        <div
                                                                            className={getFormPillClass(s.specialist_current_tracker_submitted)}
                                                                            onClick={() => s.specialist_current_tracker_submitted ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=multi_tracker`) : toast.error("Not yet submitted")}
                                                                        >Specialist Progress</div>
                                                                        {s.status.toUpperCase() === "INTEGRATED" && (
                                                                            <div
                                                                                className={getFormPillClass(s.teacher_current_tracker_submitted)}
                                                                                onClick={() => s.teacher_current_tracker_submitted ? router.push(`/workspace?studentId=${s.id}&workspace=forms&tab=sped_tracker`) : toast.error("Not yet submitted")}
                                                                            >Teacher Progress</div>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="border-t border-slate-100 pt-3 flex flex-wrap gap-2 justify-end w-full">
                                                        {nextAction ? (
                                                            <Link 
                                                                href={`/workspace?studentId=${s.id}${nextAction.workspace ? `&workspace=${nextAction.workspace}` : ''}`} 
                                                                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-bold flex-1 justify-center active:scale-95 ${getActionButtonClass(nextAction.tone)}`} 
                                                                title={nextAction.label}
                                                            >
                                                                {nextAction.tone === "positive" ? <Sparkles size={12} /> : null}
                                                                {nextAction.label}
                                                            </Link>
                                                        ) : (
                                                            <Link 
                                                                href={`/workspace?studentId=${s.id}`} 
                                                                className="text-xs px-3 py-1.5 rounded bg-slate-50 border border-slate-200 text-slate-700 font-bold no-underline hover:bg-slate-100 active:scale-95 transition-all flex-1 text-center" 
                                                                title="Open Workspace"
                                                            >
                                                                Open Workspace
                                                            </Link>
                                                        )}
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
                                    <div className="hidden md:block" style={{ overflowX: "auto", width: "100%", borderRadius: "12px", border: "2px solid var(--border-light)" }}>
                                        <table style={{ width: "100%", minWidth: "800px", borderCollapse: "collapse", textAlign: "left" }}>
                                            <thead>
                                                <tr>
                                                    <th onClick={() => handleUserSort('name')} aria-sort={userSortConfig.key === 'name' ? (userSortConfig.direction === 'desc' ? 'descending' : 'ascending') : undefined} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            NAME
                                                            <span style={{ opacity: userSortConfig.key === 'name' ? 1 : 0.3 }}>
                                                                {userSortConfig.key === 'name' ? (userSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleUserSort('role')} aria-sort={userSortConfig.key === 'role' ? (userSortConfig.direction === 'desc' ? 'descending' : 'ascending') : undefined} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            ROLE
                                                            <span style={{ opacity: userSortConfig.key === 'role' ? 1 : 0.3 }}>
                                                                {userSortConfig.key === 'role' ? (userSortConfig.direction === 'desc' ? '↓' : '↑') : '↑'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleUserSort('kids')} aria-sort={userSortConfig.key === 'kids' ? (userSortConfig.direction === 'desc' ? 'descending' : 'ascending') : undefined} style={{ cursor: "pointer", padding: "12px", color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-light)", userSelect: "none" }}>
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
                                                                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>{u.email}</span>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: "12px" }}>
                                                                <span data-role-badge style={{ fontSize: "0.75rem", background: getRoleStyle(u.role).bg, color: getRoleStyle(u.role).color, padding: "4px 10px", borderRadius: "12px", fontWeight: "600", letterSpacing: "0.3px" }}>
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
                                                                    <Link href={`/users/${u.id}`} aria-label={`View profile of ${displayName}`} className="hover:bg-blue-50 transition-colors duration-200" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "6px", color: "#3b82f6" }} title="View Profile">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                                                                    </Link>
                                                                    <button onClick={() => {
                                                                        setUserToDelete(u);
                                                                        setDeleteConfirmText("");
                                                                        setDeleteError("");
                                                                    }} aria-label={`Delete user ${displayName}`} className="hover:bg-red-50 transition-colors duration-200" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", background: "none", border: "none", cursor: "pointer", color: "#ef4444", borderRadius: "6px", padding: 0 }} title="Delete User">
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
                                                        <span data-role-badge style={{ fontSize: "0.65rem", fontWeight: "bold", padding: "4px 8px", borderRadius: "12px", textTransform: "uppercase", background: getRoleStyle(u.role).bg, color: getRoleStyle(u.role).color, textAlign: "center", whiteSpace: "nowrap" }}>
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
                                    <div className="hidden md:block" style={{ overflowX: "auto", width: "100%", borderRadius: "12px", border: "2px solid var(--border-light)" }}>
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
                                                            <span data-role-badge style={{ fontSize: "0.72rem", background: getRoleStyle(inv.role).bg, color: getRoleStyle(inv.role).color, padding: "4px 10px", borderRadius: "12px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.3px" }}>
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
