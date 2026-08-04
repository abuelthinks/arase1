"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import CustomSelect from "@/components/CustomSelect";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { LANGUAGE_OPTIONS, normalizeLanguages } from "@/lib/languages";
import { semanticToneClass, statusColorClass, type SemanticTone } from "@/lib/role-colors";
import { SPECIALIST_SPECIALTIES, type SpecialistSpecialty } from "@/lib/specialties";
import { GRADE_LEVELS, normalizeGradeLevel, type GradeLevel } from "@/lib/grade-levels";
import { isSpecialistOnboardingIncomplete, specialistOnboardingMessage } from "@/lib/specialist-onboarding";
import type { SpecialtyChangeRequest } from "@/types";
import { toast } from "sonner";
import { extractApiError } from "@/lib/toast-utils";
import type { LucideIcon } from "lucide-react";
import {
    ActivityIcon,
    ArrowRight,
    BadgeCheck,
    Briefcase,
    Check,
    ChevronRight,
    Clock,
    Languages,
    Loader2,
    Mail,
    Minus,
    PhoneCall,
    Plus,
    ShieldCheck,
    Sparkles,
    Users,
    User,
    X,
    Pencil,
    Trash2,
    UserPlus,
    RefreshCw,
} from "lucide-react";

interface AssignedStudent {
    id: number;
    first_name: string;
    last_name: string;
    grade: string;
    status: string;
}

interface UserData {
    id: number;
    
    email: string;
    role: string;
    first_name: string;
    last_name: string;
    specialty: SpecialistSpecialty | "";
    specialties?: SpecialistSpecialty[];
    grade_level?: string;
    languages?: string[];
    phone_number?: string;
    is_phone_verified?: boolean;
    is_active?: boolean;
    specialist_onboarding_complete?: boolean;
    specialist_onboarding_missing?: string[];
    teacher_profile_complete?: boolean;
    teacher_profile_missing?: string[];
    assigned_students_count: number;
    assigned_students: AssignedStudent[];
    last_login?: string;
    pending_specialty_request?: SpecialtyChangeRequest | null;
}

const inputCls =
    "w-full rounded-xl border border-line bg-app/60 px-4 py-3 text-sm font-medium text-fg placeholder:text-faint transition-colors hover:bg-card focus:border-indigo-400 focus:bg-card focus:outline-none focus:ring-4 focus:ring-indigo-500/15";

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

// "raised" carries the hairline border and shadow; "quiet" drops both so the
// side rail sits a level below the primary column instead of competing with it.
function SectionCard({
    children,
    className = "",
    variant = "raised",
}: {
    children: React.ReactNode;
    className?: string;
    variant?: "raised" | "quiet";
}) {
    const surface = variant === "quiet"
        ? "rounded-2xl bg-card p-6 md:p-7"
        : "rounded-2xl border border-line bg-card p-6 shadow-sm md:p-7";
    return <section className={`${surface} ${className}`}>{children}</section>;
}

const STAT_VALUE_TONE_CLASS: Partial<Record<SemanticTone, string>> = {
    primary: "text-accent-text",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
};

function SectionHeader({
    title,
    description,
    action,
}: {
    title: string;
    description?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <h2 className="m-0 text-lg font-extrabold text-fg">{title}</h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

function profileBadgeClass(tone: SemanticTone, extra = "") {
    return `rounded-full border px-3 py-1 text-xs font-semibold ${semanticToneClass(tone)} ${extra}`;
}

export default function UserProfile() {
    const { id } = useParams();
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
    const [specialtyRequestNote, setSpecialtyRequestNote] = useState("");
    const [reviewingRequest, setReviewingRequest] = useState<"approve" | "reject" | null>(null);
    // Self-service specialty request (specialist viewing their own profile)
    const [isRequestingSpecialty, setIsRequestingSpecialty] = useState(false);
    const [requestedSpecialties, setRequestedSpecialties] = useState<SpecialistSpecialty[]>([]);
    const [ownRequestNote, setOwnRequestNote] = useState("");
    const [sendingOwnRequest, setSendingOwnRequest] = useState(false);
    const [withdrawingOwnRequest, setWithdrawingOwnRequest] = useState(false);
    const [gradeLevel, setGradeLevel] = useState<GradeLevel | "">("");
    const [savingGradeLevel, setSavingGradeLevel] = useState(false);
    const [gradeLevelError, setGradeLevelError] = useState("");
    const [isEditingGradeLevel, setIsEditingGradeLevel] = useState(false);
    const [languages, setLanguages] = useState<string[]>([]);
    const [languageOther, setLanguageOther] = useState("");
    const [savingLanguages, setSavingLanguages] = useState(false);
    const [languageError, setLanguageError] = useState("");
    const [isEditingLanguages, setIsEditingLanguages] = useState(false);
    const [hasSeenProfileExplainer, setHasSeenProfileExplainer] = useState(false);

    // Edit profile state (for Admin)
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editFirstName, setEditFirstName] = useState("");
    const [editLastName, setEditLastName] = useState("");
    const [editEmail, setEditEmail] = useState("");
    const [editPhoneNumber, setEditPhoneNumber] = useState("");
    const [editIsPhoneVerified, setEditIsPhoneVerified] = useState(false);
    const [editIsActive, setEditIsActive] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileError, setProfileError] = useState("");

    // Child linkage state
    const [isLinkingStudent, setIsLinkingStudent] = useState(false);
    const [allStudents, setAllStudents] = useState<any[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [selectedStudentId, setSelectedStudentId] = useState<number | "">("");
    const [linkingError, setLinkingError] = useState("");
    const [linkingLoading, setLinkingLoading] = useState(false);

    // Invitation state
    const [pendingInvitation, setPendingInvitation] = useState<any | null>(null);
    const [loadingInvitation, setLoadingInvitation] = useState(false);
    const [resendingInviteId, setResendingInviteId] = useState<number | null>(null);
    const [revokingInviteId, setRevokingInviteId] = useState<number | null>(null);
    
    useEffect(() => {
        if (typeof window !== "undefined") {
            const seen = window.localStorage.getItem("arase:seen-profile-explainer");
            if (seen) setHasSeenProfileExplainer(true);
        }
    }, []);
    const initialSpecialties = (raw: UserData): SpecialistSpecialty[] => {
        if (Array.isArray(raw.specialties) && raw.specialties.length > 0) {
            return raw.specialties as SpecialistSpecialty[];
        }
        return raw.specialty ? [raw.specialty as SpecialistSpecialty] : [];
    };

    const initialLanguages = (raw: UserData): string[] =>
        normalizeLanguages(Array.isArray(raw.languages) ? raw.languages : []);

    const initialGradeLevel = (raw: UserData): GradeLevel | "" =>
        (normalizeGradeLevel(raw.grade_level) as GradeLevel) || "";

    const isAdmin = authUser?.role === "ADMIN";
    const onboardingIncomplete = isSpecialistOnboardingIncomplete(user ?? authUser);
    const pendingSpecialtyRequest = user?.pending_specialty_request ?? null;

    const reviewSpecialtyRequest = async (action: "approve" | "reject") => {
        if (!pendingSpecialtyRequest) return;
        setReviewingRequest(action);
        setSpecialtyError("");
        try {
            const res = await api.post(
                `/api/specialty-change-requests/${pendingSpecialtyRequest.id}/review/`,
                { action, admin_note: specialtyRequestNote },
            );
            const nextSpecialties = (res.data?.specialties ?? []) as SpecialistSpecialty[];
            profileCache.delete(cacheKey);
            setUser(prev => prev ? {
                ...prev,
                pending_specialty_request: null,
                ...(action === "approve"
                    ? { specialties: nextSpecialties, specialty: nextSpecialties[0] ?? "" }
                    : {}),
            } : prev);
            if (action === "approve") setSpecialties(nextSpecialties);
            setSpecialtyRequestNote("");
            toast.success(action === "approve" ? "Specialties updated." : "Request declined.");
        } catch (err: any) {
            toast.error(extractApiError(err, "Could not review the request."));
        } finally {
            setReviewingRequest(null);
        }
    };

    const ownRequestAdded = requestedSpecialties.filter(s => !specialties.includes(s));
    const ownRequestRemoved = specialties.filter(s => !requestedSpecialties.includes(s));
    const ownRequestHasChange = ownRequestAdded.length > 0 || ownRequestRemoved.length > 0;

    const refreshProfile = async () => {
        const res = await api.get(`/api/users/${id}/`);
        profileCache.set(cacheKey, res.data);
        setUser(res.data);
        return res.data as UserData;
    };

    const sendOwnSpecialtyRequest = async () => {
        setSendingOwnRequest(true);
        try {
            await api.post("/api/users/request-specialty-change/", {
                specialties: requestedSpecialties,
                note: ownRequestNote,
            });
            await refreshProfile();
            setIsRequestingSpecialty(false);
            setOwnRequestNote("");
            toast.success("Request sent to admin.");
        } catch (err: any) {
            toast.error(extractApiError(err, "Request failed."));
        } finally {
            setSendingOwnRequest(false);
        }
    };

    const withdrawOwnSpecialtyRequest = async () => {
        setWithdrawingOwnRequest(true);
        try {
            await api.delete("/api/users/request-specialty-change/");
            await refreshProfile();
            toast.success("Request withdrawn.");
        } catch (err: any) {
            toast.error(extractApiError(err, "Could not withdraw the request."));
        } finally {
            setWithdrawingOwnRequest(false);
        }
    };

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await api.get(`/api/users/${id}/`);
                profileCache.set(cacheKey, res.data);
                setUser(res.data);
                setSpecialties(initialSpecialties(res.data));
                setGradeLevel(initialGradeLevel(res.data));
                setLanguages(initialLanguages(res.data));

                // Initialize edit fields
                setEditFirstName(res.data.first_name || "");
                setEditLastName(res.data.last_name || "");
                setEditEmail(res.data.email || "");
                setEditPhoneNumber(res.data.phone_number || "");
                setEditIsPhoneVerified(!!res.data.is_phone_verified);
                setEditIsActive(res.data.is_active !== false);
                
                setError("");
                
                if (res.data.email && res.data.role === "PARENT") {
                    fetchInvitation(res.data.email);
                }
            } catch (err: any) {
                if (!profileCache.has(cacheKey)) {
                    setError(err.response?.data?.detail || "Failed to load user profile.");
                }
            } finally {
                setLoading(false);
            }
        };

        const fetchInvitation = async (email: string) => {
            if (authUser?.role !== "ADMIN") return;
            setLoadingInvitation(true);
            try {
                const res = await api.get("/api/invitations/");
                const invite = res.data.find(
                    (inv: any) => inv.email.toLowerCase() === email.toLowerCase() && !inv.is_used
                );
                setPendingInvitation(invite || null);
            } catch (err) {
                console.error("Failed to load invitations", err);
            } finally {
                setLoadingInvitation(false);
            }
        };

        if (id) fetchUser();
    }, [cacheKey, id, authUser?.role]);

    const handleStartLinking = async () => {
        setIsLinkingStudent(true);
        setLoadingStudents(true);
        setLinkingError("");
        try {
            const res = await api.get("/api/students/");
            setAllStudents(res.data);
        } catch (err) {
            setLinkingError("Failed to fetch students.");
        } finally {
            setLoadingStudents(false);
        }
    };

    const handleLinkStudent = async () => {
        if (!selectedStudentId || !user) return;
        setLinkingLoading(true);
        setLinkingError("");
        try {
            await api.post(`/api/students/${selectedStudentId}/assign-parent/`, {
                parent_id: user.id
            });
            const linkedStudent = allStudents.find(s => s.id === Number(selectedStudentId));
            if (linkedStudent) {
                const updatedAssigned = [...(user.assigned_students || []), {
                    id: linkedStudent.id,
                    first_name: linkedStudent.first_name,
                    last_name: linkedStudent.last_name,
                    grade: linkedStudent.grade,
                    status: linkedStudent.status
                }];
                const updatedUser = { ...user, assigned_students: updatedAssigned };
                setUser(updatedUser);
                profileCache.set(cacheKey, updatedUser);
            }
            setIsLinkingStudent(false);
            setSelectedStudentId("");
        } catch (err: any) {
            setLinkingError(err.response?.data?.error || err.response?.data?.detail || "Failed to link child.");
        } finally {
            setLinkingLoading(false);
        }
    };

    const handleUnlinkStudent = async (studentId: number) => {
        if (!user) return;
        if (!confirm("Are you sure you want to remove this child from the parent's account?")) {
            return;
        }
        try {
            await api.post(`/api/students/${studentId}/unassign-staff/`, {
                staff_id: user.id
            });
            const updatedAssigned = (user.assigned_students || []).filter(s => s.id !== studentId);
            const updatedUser = { ...user, assigned_students: updatedAssigned };
            setUser(updatedUser);
            profileCache.set(cacheKey, updatedUser);
        } catch (err: any) {
            alert(err.response?.data?.error || err.response?.data?.detail || "Failed to unlink child.");
        }
    };

    const handleResendInvitation = async (inviteId: number) => {
        setResendingInviteId(inviteId);
        try {
            await api.post(`/api/invitations/${inviteId}/resend/`);
            alert("Invitation resent successfully!");
        } catch (err: any) {
            alert(err.response?.data?.error || "Failed to resend invitation.");
        } finally {
            setResendingInviteId(null);
        }
    };

    const handleRevokeInvitation = async (inviteId: number) => {
        if (!confirm("Are you sure you want to revoke this invitation?")) {
            return;
        }
        setRevokingInviteId(inviteId);
        try {
            await api.delete(`/api/invitations/${inviteId}/`);
            setPendingInvitation(null);
            alert("Invitation revoked successfully!");
        } catch (err: any) {
            alert(err.response?.data?.error || "Failed to revoke invitation.");
        } finally {
            setRevokingInviteId(null);
        }
    };

    const handleSaveProfile = async () => {
        if (!user) return;
        setSavingProfile(true);
        setProfileError("");
        try {
            // Non-admins may only send their own name; anything else is rejected
            // by UserViewSet.partial_update.
            const payload = isAdmin
                ? {
                    first_name: editFirstName,
                    last_name: editLastName,
                    email: editEmail,
                    phone_number: editPhoneNumber,
                    is_phone_verified: editIsPhoneVerified,
                    is_active: editIsActive
                }
                : {
                    first_name: editFirstName,
                    last_name: editLastName
                };
            const res = await api.patch(`/api/users/${id}/`, payload);
            setUser(res.data);
            profileCache.set(cacheKey, res.data);
            setIsEditingProfile(false);
        } catch (err: any) {
            setProfileError(
                err.response?.data?.email || 
                err.response?.data?.phone_number || 
                err.response?.data?.detail || 
                "Failed to update profile."
            );
        } finally {
            setSavingProfile(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading profile...
            </div>
        );
    }

    if (error) {
        return <div className="p-12 text-center text-sm text-danger">{error}</div>;
    }

    if (!user) {
        return <div className="p-12 text-center text-sm text-muted">User not found.</div>;
    }

    const displayName = user.first_name || user.last_name
        ? `${user.first_name} ${user.last_name}`.trim()
        : user.email;
    const initials = displayName.split(" ").map(word => word[0]).join("").toUpperCase().slice(0, 2);
    const role = user.role?.toUpperCase() || "UNKNOWN";

    const assignedStudents = Array.isArray(user.assigned_students) ? user.assigned_students : [];
    const studentCount = assignedStudents.length;
    const activeCount = assignedStudents.filter(s => ["ENROLLED", "INTEGRATED"].includes(s.status)).length;
    const pendingCount = assignedStudents.filter(s => ["PENDING_ASSESSMENT", "ASSESSMENT_SCHEDULED"].includes(s.status)).length;
    const assessedCount = assignedStudents.filter(s => s.status === "ASSESSED").length;
    const isParent = role === "PARENT";
    const viewerIsParent = authUser?.role === "PARENT";
    const viewerIsSpecialist = authUser?.role === "SPECIALIST";
    const viewingOwnProfile = authUser?.user_id === user.id;
    const isParentViewingOther = viewerIsParent && !viewingOwnProfile;
    const isCrossRoleParentSpecialist = !viewingOwnProfile && (
        (viewerIsParent && role === "SPECIALIST") ||
        (viewerIsSpecialist && role === "PARENT")
    );
    const canViewPrivateContact = isAdmin || viewingOwnProfile;
    const canViewOperationalDetails = isAdmin || viewingOwnProfile;
    // Teachers carry languages too — they feed the same student-matching score.
    const canEditLanguages = (role === "SPECIALIST" || role === "TEACHER") && (isAdmin || authUser?.user_id === user.id);
    // Non-admins on their own profile can only patch first_name/last_name — see
    // UserViewSet.partial_update. The page reads as "my account" for them
    // instead of the admin account record it shows an admin.
    const isSelfServiceView = !isAdmin && viewingOwnProfile;
    const canEditIdentity = isAdmin || viewingOwnProfile;
    // The caseload list lives in the sidebar for specialists and teachers, so it
    // only earns a panel here for admins and for parents seeing their children.
    const showStudentsPanel = isAdmin || (isParent && viewingOwnProfile);
    const knownLanguageSet = new Set(LANGUAGE_OPTIONS.map(l => l.toLowerCase()));

    const profileInfo = !canViewPrivateContact
        ? [
            { label: "Role", value: user.role, icon: Briefcase },
        ]
        : isParent
                ? [
                    { label: "Email", value: user.email, href: `mailto:${user.email}`, icon: Mail },
                    { label: "Phone", value: user.phone_number ? `${user.phone_number} (${user.is_phone_verified ? "Verified" : "Unverified"})` : "Not provided", href: user.phone_number ? `tel:${user.phone_number}` : undefined, icon: PhoneCall },
                    { label: "Account Status", value: user.is_active === false ? "Inactive" : "Active", icon: ShieldCheck },
                ]
                : [
                    { label: "Email", value: user.email, href: `mailto:${user.email}`, icon: Mail },
                    { label: "Phone", value: user.phone_number ? `${user.phone_number} (${user.is_phone_verified ? "Verified" : "Unverified"})` : "Not provided", href: user.phone_number ? `tel:${user.phone_number}` : undefined, icon: PhoneCall },
                    { label: "Role", value: user.role, icon: Briefcase },
                    { label: "Last Active", value: formatLastSeen(user.last_login), icon: ActivityIcon },
                    { label: "Account Status", value: user.is_active === false ? "Inactive" : "Active", icon: ShieldCheck },
                ];

    const parentActiveCount = assignedStudents.filter(s => ["ENROLLED", "INTEGRATED"].includes(s.status)).length;
    const parentPendingCount = assignedStudents.filter(s => ["PENDING_ASSESSMENT", "ASSESSMENT_SCHEDULED", "ASSESSED"].includes(s.status)).length;

    const statCards = canViewOperationalDetails
        ? isParent
            ? [
                { label: "Linked Children", value: studentCount, note: "total connected children", tone: "primary" as SemanticTone },
                { label: "Enrolled", value: parentActiveCount, note: "actively enrolled children", tone: "success" as SemanticTone },
                { label: "Needs Review", value: parentPendingCount, note: "pending or in assessment", tone: "warning" as SemanticTone },
              ]
            : [
                { label: "Caseload", value: studentCount, note: "total assigned students", tone: "primary" as SemanticTone },
                { label: "Active", value: activeCount, note: "enrolled students", tone: "success" as SemanticTone },
                { label: "Needs Follow-up", value: pendingCount + assessedCount, note: "pending or assessed", tone: "warning" as SemanticTone },
              ]
        : [];

    return (
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 md:px-0">
            {viewerIsParent && !hasSeenProfileExplainer && (
                <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-card rounded-[24px] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300 border border-white/20">
                            <div className="p-8 text-center relative">
                                <div className="absolute top-4 right-4 text-faint hover:text-muted cursor-pointer transition-colors p-1" onClick={() => { setHasSeenProfileExplainer(true); if (typeof window !== "undefined") window.localStorage.setItem("arase:seen-profile-explainer", "true"); }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </div>
                                
                                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-indigo-100">
                                    <User className="w-6 h-6 text-indigo-600" strokeWidth={2} />
                                </div>
                                <h2 className="text-xl font-extrabold text-fg mb-4 tracking-tight">Welcome to your Profile!</h2>
                                
                                <p className="text-muted text-[15px] leading-relaxed mb-8">
                                    This is where you manage your account settings, notification preferences, and contact information. 
                                    <br/><br/>
                                    <strong className="text-fg font-bold">Keeping your details up to date ensures you never miss an important update regarding your child's progress or upcoming assessments.</strong>
                                </p>
                                
                                <button
                                    onClick={() => {
                                        setHasSeenProfileExplainer(true);
                                        if (typeof window !== "undefined") {
                                            window.localStorage.setItem("arase:seen-profile-explainer", "true");
                                        }
                                    }}
                                    className="w-full py-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl transition-colors shadow-sm text-[15px]"
                                >
                                    Got it!
                                </button>
                            </div>
                    </div>
                </div>
            )}
            {/* Identity banner */}
            <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
                {/* The whole header shares one tinted surface, so the only rule in
                    the card is the real border above the stat strip. */}
                <div className="bg-accent-soft px-6 py-6 md:px-7">
                    {isAdmin && !isParent && (
                        <div className="mb-6 flex flex-wrap justify-end gap-2">
                            <Link
                                href={`/users/${user.id}/activity`}
                                className="inline-flex items-center gap-2 rounded-lg border border-accent-border bg-card/70 px-3 py-1.5 text-xs font-bold text-fg no-underline transition-colors hover:bg-card"
                            >
                                <ActivityIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                View Activity
                            </Link>
                            {user.email && (
                                <a
                                    href={`mailto:${user.email}`}
                                    className="inline-flex items-center gap-2 rounded-lg border border-accent-border bg-card/70 px-3 py-1.5 text-xs font-bold text-fg no-underline transition-colors hover:bg-card"
                                >
                                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                                    Email User
                                </a>
                            )}
                        </div>
                    )}
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-card bg-card text-2xl font-extrabold text-accent-text shadow-sm">
                            {initials}
                        </div>
                        <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="m-0 text-2xl font-extrabold leading-tight text-fg">
                                    {displayName}
                                </h1>
                                <span className="rounded-full border border-accent-border bg-card px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-accent-text">
                                    {role}
                                </span>
                                {canViewOperationalDetails && (
                                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${semanticToneClass(user.is_active === false ? "danger" : "success")}`}>
                                        {user.is_active === false ? "Inactive" : "Active"}
                                    </span>
                                )}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-semibold text-muted">
                                {canViewPrivateContact && user.email && (
                                    <a
                                        href={`mailto:${user.email}`}
                                        className="inline-flex items-center gap-1.5 text-muted no-underline transition-colors hover:text-indigo-600"
                                    >
                                        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                                        {user.email}
                                    </a>
                                )}
                                {canViewPrivateContact && user.phone_number && (
                                    <span className="inline-flex items-center gap-1.5">
                                        <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                                        {user.phone_number}
                                    </span>
                                )}
                                {canViewOperationalDetails && (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                        {formatLastSeen(user.last_login)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <p className="mt-4 text-sm leading-relaxed text-muted">
                        {getRoleSummary(role)}
                    </p>

                    {!isParent && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-border bg-card px-3 py-1 text-xs font-semibold text-accent-text">
                                <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                                {(user.specialties && user.specialties.length > 0)
                                    ? user.specialties.join(", ")
                                    : (user.specialty || "Specialty not set")}
                            </span>
                        </div>
                    )}
                </div>

                {statCards.length > 0 && (
                    <div className="grid grid-cols-1 divide-y divide-line border-t border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                        {statCards.map(card => (
                            <div key={card.label} className="px-6 py-4 md:px-7">
                                <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted">{card.label}</p>
                                <p className={`m-0 mt-1.5 text-3xl font-extrabold leading-none ${STAT_VALUE_TONE_CLASS[card.tone] || "text-fg"}`}>
                                    {card.value}
                                </p>
                                <p className="m-0 mt-1.5 text-xs text-muted">{card.note}</p>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Pending Invitation Alert (for Admins viewing a parent) */}
            {isAdmin && isParent && pendingInvitation && (
                <div className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${semanticToneClass("warning")}`}>
                    <div>
                        <p className="m-0 text-sm font-extrabold text-warning">
                            Pending Account Invitation
                        </p>
                        <p className="mt-1 text-sm text-fg">
                            This parent has been invited but has not registered their account yet. Invitation code is: <code className="bg-card px-1.5 py-0.5 rounded border text-xs font-mono">{pendingInvitation.token}</code>
                        </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button
                            type="button"
                            disabled={resendingInviteId !== null}
                            onClick={() => handleResendInvitation(pendingInvitation.id)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-warning-line bg-card px-3.5 py-2 text-xs font-bold text-warning hover:bg-warning-solid hover:text-white transition-colors duration-200"
                        >
                            {resendingInviteId === pendingInvitation.id ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Resending...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    Resend Invite
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            disabled={revokingInviteId !== null}
                            onClick={() => handleRevokeInvitation(pendingInvitation.id)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-card px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-colors duration-200"
                        >
                            {revokingInviteId === pendingInvitation.id ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Revoking...
                                </>
                            ) : (
                                <>
                                    <X className="h-3.5 w-3.5" />
                                    Revoke Invite
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Onboarding callout */}
            {role === "SPECIALIST" && onboardingIncomplete && canViewOperationalDetails && (
                <div className={`flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${semanticToneClass("warning")}`}>
                    <div>
                        <p className="m-0 text-sm font-extrabold">Complete your profile setup</p>
                        <p className="mt-1 text-sm">{specialistOnboardingMessage(user.specialist_onboarding_missing || authUser?.specialist_onboarding_missing)}</p>
                    </div>
                    <Link
                        href="/specialist-onboarding"
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-warning-solid px-4 py-2 text-sm font-bold text-white no-underline shadow-sm hover:bg-warning-solid"
                    >
                        Finish setup
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                </div>
            )}

            {/* Main grid */}
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
                <div className="flex flex-col gap-6">
                    {/* A parent looking at someone else's profile has every contact and
                        account field stripped, leaving a card that promises "identity,
                        contact details and account state" and shows only the role —
                        which the badge beside the name already says. */}
                    {!isParentViewingOther && (
                    <SectionCard>
                        <SectionHeader
                            title={isSelfServiceView || isParent ? "Your Information" : "Profile Information"}
                            description={
                                isSelfServiceView
                                    ? "Your name is yours to change. Contact an admin to update your email or phone."
                                    : isParent
                                        ? "Your contact details and account status."
                                        : "Identity, contact details, and account state."
                            }
                            action={
                                canEditIdentity && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isEditingProfile) {
                                                setEditFirstName(user.first_name || "");
                                                setEditLastName(user.last_name || "");
                                                setEditEmail(user.email || "");
                                                setEditPhoneNumber(user.phone_number || "");
                                                setEditIsPhoneVerified(!!user.is_phone_verified);
                                                setEditIsActive(user.is_active !== false);
                                                setProfileError("");
                                            }
                                            setIsEditingProfile(!isEditingProfile);
                                        }}
                                        className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-fg transition-colors hover:bg-app"
                                    >
                                        {isEditingProfile ? "Cancel" : "Edit"}
                                    </button>
                                )
                            }
                        />
                        {isEditingProfile ? (
                            <div className="flex flex-col gap-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wide text-muted mb-1">First Name</label>
                                        <input
                                            type="text"
                                            value={editFirstName}
                                            onChange={e => setEditFirstName(e.target.value)}
                                            className={inputCls}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wide text-muted mb-1">Last Name</label>
                                        <input
                                            type="text"
                                            value={editLastName}
                                            onChange={e => setEditLastName(e.target.value)}
                                            className={inputCls}
                                        />
                                    </div>
                                </div>
                                {isAdmin && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wide text-muted mb-1">Email</label>
                                            <input
                                                type="email"
                                                value={editEmail}
                                                onChange={e => setEditEmail(e.target.value)}
                                                className={inputCls}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wide text-muted mb-1">Phone Number</label>
                                            <input
                                                type="text"
                                                value={editPhoneNumber}
                                                onChange={e => setEditPhoneNumber(e.target.value)}
                                                className={inputCls}
                                            />
                                        </div>
                                        <div className="flex flex-wrap gap-4 items-center justify-between py-3 border-t border-b border-line my-1">
                                            <label className="flex items-center gap-2 text-sm font-semibold text-fg cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={editIsPhoneVerified}
                                                    onChange={e => setEditIsPhoneVerified(e.target.checked)}
                                                    className="rounded border-line text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                                />
                                                Phone Verified
                                            </label>
                                            <label className="flex items-center gap-2 text-sm font-semibold text-fg cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={editIsActive}
                                                    onChange={e => setEditIsActive(e.target.checked)}
                                                    className="rounded border-line text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                                />
                                                Account Active
                                            </label>
                                        </div>
                                    </>
                                )}
                                {profileError && (
                                    <p className="m-0 text-xs font-medium text-danger">{profileError}</p>
                                )}
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        disabled={savingProfile}
                                        onClick={handleSaveProfile}
                                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {savingProfile ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                                Saving...
                                            </>
                                        ) : (
                                            "Save Changes"
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsEditingProfile(false);
                                            setEditFirstName(user.first_name || "");
                                            setEditLastName(user.last_name || "");
                                            setEditEmail(user.email || "");
                                            setEditPhoneNumber(user.phone_number || "");
                                            setEditIsPhoneVerified(!!user.is_phone_verified);
                                            setEditIsActive(user.is_active !== false);
                                            setProfileError("");
                                        }}
                                        className="flex-1 rounded-xl border border-line px-5 py-3 text-sm font-bold text-fg transition-colors hover:bg-app"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col divide-y divide-line">
                                {profileInfo.map(item => {
                                    const Icon = item.icon;
                                    return (
                                        <div key={item.label} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                                            <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted">
                                                {Icon && <Icon className="h-4 w-4 text-faint" aria-hidden="true" />}
                                                {item.label}
                                            </span>
                                            {item.href ? (
                                                <a href={item.href} className="break-all text-right text-sm font-bold text-indigo-600 no-underline hover:underline">
                                                    {item.value}
                                                </a>
                                            ) : (
                                                <span className="text-right text-sm font-bold text-fg">{item.value}</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </SectionCard>
                    )}

                    {/* On your own profile this only repeats the banner, Profile
                        Information, and the languages card below it. */}
                    {!isParent && !isSelfServiceView && (
                        <SectionCard>
                            <SectionHeader
                                title={isParentViewingOther ? "About this specialist" : "Verification & Role Context"}
                                description={isParentViewingOther ? "Who this specialist is and how they can support your child." : "Important account context at a glance."}
                            />
                            <div className="flex flex-col divide-y divide-line">
                                {canViewPrivateContact && (
                                    <div className="py-4 first:pt-0 last:pb-0">
                                        <p className="m-0 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
                                            <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                                            Phone Verification
                                        </p>
                                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                            <span className={`text-sm font-bold ${user.phone_number ? "text-fg" : "text-muted"}`}>
                                                {user.phone_number || "No phone number on file"}
                                            </span>
                                            {/* A phone number is optional, so "not verified" only
                                                makes sense once there is one to verify. */}
                                            {user.phone_number ? (
                                                <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${semanticToneClass(user.is_phone_verified ? "success" : "warning")}`}>
                                                    {user.is_phone_verified ? "Verified" : "Not verified"}
                                                </span>
                                            ) : (
                                                <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${semanticToneClass("neutral")}`}>
                                                    Optional
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="py-4 first:pt-0 last:pb-0">
                                    <p className="m-0 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
                                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                        {role === "TEACHER" ? "Grade Level" : "Area of Practice"}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {role === "TEACHER" ? (
                                            gradeLevel ? (
                                                <span className={profileBadgeClass("primary")}>
                                                    {gradeLevel}
                                                </span>
                                            ) : (
                                                <span className="text-sm italic text-faint">Not configured yet</span>
                                            )
                                        ) : user.specialties && user.specialties.length > 0 ? (
                                            user.specialties.map(s => (
                                                <span key={s} className={profileBadgeClass("primary")}>
                                                    {s}
                                                </span>
                                            ))
                                        ) : user.specialty ? (
                                            <span className={profileBadgeClass("primary")}>
                                                {user.specialty}
                                            </span>
                                        ) : (
                                            <span className="text-sm italic text-faint">Not configured yet</span>
                                        )}
                                    </div>
                                </div>

                                {(role === "SPECIALIST" || role === "TEACHER") && (
                                    <div className="py-4 first:pt-0 last:pb-0">
                                        <p className="m-0 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
                                            <Languages className="h-3.5 w-3.5" aria-hidden="true" />
                                            Session Languages
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {languages.length > 0 ? (
                                                languages.map(l => (
                                                    <span key={l} className={profileBadgeClass("success")}>
                                                        {l}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-sm italic text-faint">Not configured yet</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </SectionCard>
                    )}

                    {canEditLanguages && (
                        <SectionCard>
                            <SectionHeader
                                title="Session Languages"
                                description={
                                    isSelfServiceView
                                        ? "Languages you can comfortably use with parents and children."
                                        : `Languages this ${role === "TEACHER" ? "teacher" : "specialist"} can comfortably use with parents and children.`
                                }
                                action={
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLanguageError("");
                                            setIsEditingLanguages(current => !current);
                                            setLanguages(initialLanguages(user));
                                            setLanguageOther("");
                                        }}
                                        className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-fg transition-colors hover:bg-app"
                                    >
                                        {isEditingLanguages ? "Close" : "Edit"}
                                    </button>
                                }
                            />
                            {isEditingLanguages ? (
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-wrap gap-2.5">
                                        {LANGUAGE_OPTIONS.map(option => {
                                            const checked = languages.some(l => l.toLowerCase() === option.toLowerCase());
                                            return (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    onClick={() => {
                                                        setLanguages(prev => normalizeLanguages(
                                                            checked
                                                                ? prev.filter(l => l.toLowerCase() !== option.toLowerCase())
                                                                : [...prev, option],
                                                        ));
                                                    }}
                                                    aria-pressed={checked}
                                                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${checked
                                                        ? "border-indigo-400 bg-indigo-50 text-indigo-800 shadow-[0_2px_10px_rgba(99,102,241,0.12)]"
                                                        : "border-line bg-card text-muted hover:border-line hover:bg-app hover:shadow-sm"
                                                        }`}
                                                >
                                                    {checked && <Check className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />}
                                                    <span className={checked ? "font-bold" : "font-medium"}>{option}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="flex flex-col gap-2 sm:flex-row">
                                        <input
                                            type="text"
                                            value={languageOther}
                                            onChange={e => setLanguageOther(e.target.value)}
                                            placeholder="Other language"
                                            className={inputCls}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setLanguages(prev => normalizeLanguages([...prev, languageOther]));
                                                setLanguageOther("");
                                            }}
                                            disabled={!languageOther.trim()}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg transition-colors hover:bg-app disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <Plus className="h-4 w-4" aria-hidden="true" />
                                            Add
                                        </button>
                                    </div>

                                    {languages.some(l => !knownLanguageSet.has(l.toLowerCase())) && (
                                        <div className="flex flex-wrap gap-2">
                                            {languages
                                                .filter(l => !knownLanguageSet.has(l.toLowerCase()))
                                                .map(language => (
                                                    <span key={language} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-app py-1 pl-3 pr-1 text-xs font-semibold text-fg">
                                                        {language}
                                                        <button
                                                            type="button"
                                                            onClick={() => setLanguages(prev => prev.filter(l => l !== language))}
                                                            aria-label={`Remove ${language}`}
                                                            className="flex h-5 w-5 items-center justify-center rounded-full text-faint hover:bg-subtle-soft hover:text-fg"
                                                        >
                                                            <X className="h-3 w-3" aria-hidden="true" />
                                                        </button>
                                                    </span>
                                                ))}
                                        </div>
                                    )}

                                    {languageError && (
                                        <p className="m-0 text-xs font-medium text-danger">{languageError}</p>
                                    )}

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            disabled={savingLanguages}
                                            onClick={async () => {
                                                setSavingLanguages(true);
                                                setLanguageError("");
                                                try {
                                                    const nextLanguages = normalizeLanguages([...languages, languageOther]);
                                                    const res = await api.patch(`/api/users/${id}/`, { languages: nextLanguages });
                                                    profileCache.delete(cacheKey);
                                                    setUser(prev => prev ? { ...prev, languages: res.data?.languages ?? nextLanguages } : prev);
                                                    setLanguages(res.data?.languages ?? nextLanguages);
                                                    setLanguageOther("");
                                                    setIsEditingLanguages(false);
                                                } catch (err: any) {
                                                    setLanguageError(err.response?.data?.languages || err.response?.data?.detail || "Could not save languages. Please try again.");
                                                } finally {
                                                    setSavingLanguages(false);
                                                }
                                            }}
                                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {savingLanguages ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                                    Saving...
                                                </>
                                            ) : (
                                                "Save Languages"
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsEditingLanguages(false);
                                                setLanguages(initialLanguages(user));
                                                setLanguageOther("");
                                                setLanguageError("");
                                            }}
                                            className="flex-1 rounded-xl border border-line px-5 py-3 text-sm font-bold text-fg transition-colors hover:bg-app"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {languages.length > 0 ? (
                                        languages.map(language => (
                                            <span key={language} className={profileBadgeClass("success")}>
                                                {language}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-sm italic text-faint">No session languages configured yet.</span>
                                    )}
                                </div>
                            )}
                        </SectionCard>
                    )}

                    {isAdmin && role === "SPECIALIST" && (
                        <SectionCard>
                            <SectionHeader
                                title="Edit Specialties"
                                description="A specialist may hold one or more disciplines. Each one unlocks the matching section in assessment and tracker forms."
                                action={
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSpecialtyError("");
                                            setIsEditingSpecialty(current => !current);
                                            setSpecialties(initialSpecialties(user));
                                        }}
                                        className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-fg transition-colors hover:bg-app"
                                    >
                                        {isEditingSpecialty ? "Close" : "Edit"}
                                    </button>
                                }
                            />

                            {pendingSpecialtyRequest && (
                                <div className={`mb-5 rounded-2xl border p-4 ${semanticToneClass("warning")}`}>
                                    <div className="flex items-start gap-3">
                                        <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                                        <div className="min-w-0 flex-1">
                                            <p className="m-0 text-sm font-extrabold">
                                                {pendingSpecialtyRequest.specialist_name} requested a change
                                            </p>
                                            <p className="mt-1 text-sm">
                                                Nothing is applied until you approve. Approving sets their specialties to
                                                the requested list below.
                                            </p>

                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {pendingSpecialtyRequest.added.map(specialty => (
                                                    <span
                                                        key={`add-${specialty}`}
                                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${semanticToneClass("success")}`}
                                                    >
                                                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                                        Add {specialty}
                                                    </span>
                                                ))}
                                                {pendingSpecialtyRequest.removed.map(specialty => (
                                                    <span
                                                        key={`remove-${specialty}`}
                                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${semanticToneClass("danger")}`}
                                                    >
                                                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                                                        Remove {specialty}
                                                    </span>
                                                ))}
                                            </div>

                                            <p className="mt-3 text-xs font-semibold uppercase tracking-wide opacity-80">
                                                Resulting specialties
                                            </p>
                                            <p className="mt-1 text-sm font-bold">
                                                {pendingSpecialtyRequest.requested_specialties.join(", ")}
                                            </p>

                                            {pendingSpecialtyRequest.note && (
                                                <p className="mt-3 text-sm italic">"{pendingSpecialtyRequest.note}"</p>
                                            )}

                                            <textarea
                                                value={specialtyRequestNote}
                                                onChange={event => setSpecialtyRequestNote(event.target.value)}
                                                rows={2}
                                                placeholder="Optional reply to the specialist..."
                                                className="mt-3 w-full rounded-xl border border-line bg-card px-4 py-3 text-sm font-medium text-fg placeholder:text-faint focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
                                            />

                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    disabled={reviewingRequest !== null}
                                                    onClick={() => reviewSpecialtyRequest("approve")}
                                                    className="inline-flex items-center gap-2 rounded-xl bg-success-solid px-4 py-2 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {reviewingRequest === "approve" ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                                    ) : (
                                                        <Check className="h-4 w-4" aria-hidden="true" />
                                                    )}
                                                    Approve
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={reviewingRequest !== null}
                                                    onClick={() => reviewSpecialtyRequest("reject")}
                                                    className="inline-flex items-center gap-2 rounded-xl border border-current px-4 py-2 text-sm font-bold transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {reviewingRequest === "reject" ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                                    ) : (
                                                        <X className="h-4 w-4" aria-hidden="true" />
                                                    )}
                                                    Decline
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {isEditingSpecialty ? (
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-wrap gap-2.5">
                                        {SPECIALIST_SPECIALTIES.map(option => {
                                            const checked = specialties.includes(option);
                                            return (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    onClick={() => {
                                                        setSpecialties(prev => checked ? prev.filter(s => s !== option) : [...prev, option]);
                                                    }}
                                                    aria-pressed={checked}
                                                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${checked
                                                        ? "border-indigo-400 bg-indigo-50 text-indigo-800 shadow-[0_2px_10px_rgba(99,102,241,0.12)]"
                                                        : "border-line bg-card text-muted hover:border-line hover:bg-app hover:shadow-sm"
                                                        }`}
                                                >
                                                    {checked && <Check className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />}
                                                    <span className={checked ? "font-bold" : "font-medium"}>{option}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {specialtyError && (
                                        <p className="m-0 text-xs font-medium text-danger">{specialtyError}</p>
                                    )}
                                    <div className="flex gap-2">
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
                                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {savingSpecialty ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                                    Saving...
                                                </>
                                            ) : (
                                                "Save Specialties"
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsEditingSpecialty(false);
                                                setSpecialties(initialSpecialties(user));
                                                setSpecialtyError("");
                                            }}
                                            className="flex-1 rounded-xl border border-line px-5 py-3 text-sm font-bold text-fg transition-colors hover:bg-app"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {specialties.length > 0 ? (
                                        specialties.map(s => (
                                            <span key={s} className={profileBadgeClass("primary")}>
                                                {s}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-sm italic text-faint">No specialty configured yet.</span>
                                    )}
                                </div>
                            )}
                        </SectionCard>
                    )}

                    {isAdmin && role === "TEACHER" && (
                        <SectionCard>
                            <SectionHeader
                                title="Edit Grade Level"
                                description="The grade this teacher handles. Students in a matching grade are recommended to them during assignment."
                                action={
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setGradeLevelError("");
                                            setIsEditingGradeLevel(current => !current);
                                            setGradeLevel(initialGradeLevel(user));
                                        }}
                                        className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-fg transition-colors hover:bg-app"
                                    >
                                        {isEditingGradeLevel ? "Close" : "Edit"}
                                    </button>
                                }
                            />

                            {isEditingGradeLevel ? (
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-wrap gap-2.5">
                                        {GRADE_LEVELS.map(option => {
                                            const checked = gradeLevel === option;
                                            return (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    onClick={() => {
                                                        setGradeLevel(checked ? "" : option);
                                                    }}
                                                    aria-pressed={checked}
                                                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${checked
                                                        ? "border-indigo-400 bg-indigo-50 text-indigo-800 shadow-[0_2px_10px_rgba(99,102,241,0.12)]"
                                                        : "border-line bg-card text-muted hover:border-line hover:bg-app hover:shadow-sm"
                                                        }`}
                                                >
                                                    {checked && <Check className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />}
                                                    <span className={checked ? "font-bold" : "font-medium"}>{option}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {gradeLevelError && (
                                        <p className="m-0 text-xs font-medium text-danger">{gradeLevelError}</p>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            disabled={savingGradeLevel}
                                            onClick={async () => {
                                                setSavingGradeLevel(true);
                                                setGradeLevelError("");
                                                try {
                                                    const res = await api.patch(`/api/users/${id}/`, { grade_level: gradeLevel });
                                                    profileCache.delete(cacheKey);
                                                    setUser(prev => prev ? {
                                                        ...prev,
                                                        grade_level: res.data?.grade_level ?? gradeLevel,
                                                    } : prev);
                                                    setGradeLevel((res.data?.grade_level ?? gradeLevel) as GradeLevel | "");
                                                    setIsEditingGradeLevel(false);
                                                } catch (err: any) {
                                                    setGradeLevelError(err.response?.data?.grade_level || err.response?.data?.detail || "Could not save the grade level. Please try again.");
                                                } finally {
                                                    setSavingGradeLevel(false);
                                                }
                                            }}
                                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {savingGradeLevel ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                                    Saving...
                                                </>
                                            ) : (
                                                "Save Grade Level"
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsEditingGradeLevel(false);
                                                setGradeLevel(initialGradeLevel(user));
                                                setGradeLevelError("");
                                            }}
                                            className="flex-1 rounded-xl border border-line px-5 py-3 text-sm font-bold text-fg transition-colors hover:bg-app"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {gradeLevel ? (
                                        <span className={profileBadgeClass("primary")}>
                                            {gradeLevel}
                                        </span>
                                    ) : (
                                        <span className="text-sm italic text-faint">No grade level configured yet.</span>
                                    )}
                                </div>
                            )}
                        </SectionCard>
                    )}

                    {!isAdmin && role === "TEACHER" && viewingOwnProfile && (
                        <SectionCard>
                            <SectionHeader
                                title="My Grade Level"
                                description="Admin manages this. If it looks wrong, ask them to update it."
                            />
                            <div className="flex flex-wrap gap-2">
                                {gradeLevel ? (
                                    <span className={profileBadgeClass("primary")}>
                                        {gradeLevel}
                                    </span>
                                ) : (
                                    <span className="text-sm italic text-faint">Admin hasn&apos;t assigned your grade level yet.</span>
                                )}
                            </div>
                        </SectionCard>
                    )}

                    {!isAdmin && role === "SPECIALIST" && viewingOwnProfile && (
                        <SectionCard>
                            <SectionHeader
                                title="My Specialties"
                                description="Admin manages these. If something is missing or shouldn't be there, ask them to add or remove it."
                                action={
                                    !pendingSpecialtyRequest ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsRequestingSpecialty(current => !current);
                                                setRequestedSpecialties(specialties);
                                                setOwnRequestNote("");
                                            }}
                                            className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-fg transition-colors hover:bg-app"
                                        >
                                            {isRequestingSpecialty ? "Cancel" : "Request a change"}
                                        </button>
                                    ) : undefined
                                }
                            />

                            <div className="mb-4 flex flex-wrap gap-2">
                                {specialties.length > 0 ? (
                                    specialties.map(s => (
                                        <span key={s} className={profileBadgeClass("primary")}>
                                            {s}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-sm italic text-faint">
                                        Admin hasn&apos;t assigned your specialties yet.
                                    </span>
                                )}
                            </div>

                            {pendingSpecialtyRequest ? (
                                <div className={`rounded-2xl border p-4 ${semanticToneClass("warning")}`}>
                                    <div className="flex items-start gap-3">
                                        <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                                        <div className="min-w-0 flex-1">
                                            <p className="m-0 text-sm font-extrabold">Waiting for admin approval</p>
                                            <p className="mt-1 text-sm">
                                                Your specialties stay as they are until an admin approves this.
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {pendingSpecialtyRequest.added.map(s => (
                                                    <span
                                                        key={`add-${s}`}
                                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${semanticToneClass("success")}`}
                                                    >
                                                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                                        Add {s}
                                                    </span>
                                                ))}
                                                {pendingSpecialtyRequest.removed.map(s => (
                                                    <span
                                                        key={`remove-${s}`}
                                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${semanticToneClass("danger")}`}
                                                    >
                                                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                                                        Remove {s}
                                                    </span>
                                                ))}
                                            </div>
                                            {pendingSpecialtyRequest.note && (
                                                <p className="mt-3 text-sm italic">&quot;{pendingSpecialtyRequest.note}&quot;</p>
                                            )}
                                            <button
                                                type="button"
                                                disabled={withdrawingOwnRequest}
                                                onClick={withdrawOwnSpecialtyRequest}
                                                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-current px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {withdrawingOwnRequest ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                                ) : (
                                                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                                                )}
                                                Withdraw request
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : isRequestingSpecialty ? (
                                <div className="flex flex-col gap-4 border-t border-line pt-4">
                                    <p className="m-0 text-sm text-muted">
                                        Tick every discipline you practise. Untick anything assigned by mistake.
                                    </p>
                                    <div className="flex flex-wrap gap-2.5">
                                        {SPECIALIST_SPECIALTIES.map(option => {
                                            const checked = requestedSpecialties.includes(option);
                                            return (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    onClick={() => setRequestedSpecialties(prev =>
                                                        checked ? prev.filter(s => s !== option) : [...prev, option]
                                                    )}
                                                    aria-pressed={checked}
                                                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${checked
                                                        ? "border-indigo-400 bg-indigo-50 text-indigo-800 shadow-[0_2px_10px_rgba(99,102,241,0.12)]"
                                                        : "border-line bg-card text-muted hover:border-line hover:bg-app hover:shadow-sm"
                                                        }`}
                                                >
                                                    {checked && <Check className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />}
                                                    <span className={checked ? "font-bold" : "font-medium"}>{option}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {ownRequestHasChange && (
                                        <div className="rounded-xl border border-line bg-app/60 p-3">
                                            <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted">
                                                Admin will be asked to
                                            </p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {ownRequestAdded.map(s => (
                                                    <span
                                                        key={`add-${s}`}
                                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${semanticToneClass("success")}`}
                                                    >
                                                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                                        Add {s}
                                                    </span>
                                                ))}
                                                {ownRequestRemoved.map(s => (
                                                    <span
                                                        key={`remove-${s}`}
                                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${semanticToneClass("danger")}`}
                                                    >
                                                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                                                        Remove {s}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <textarea
                                        value={ownRequestNote}
                                        onChange={event => setOwnRequestNote(event.target.value)}
                                        rows={3}
                                        placeholder="Briefly explain what should be changed."
                                        className={inputCls}
                                    />

                                    <div>
                                        <button
                                            type="button"
                                            disabled={sendingOwnRequest || !ownRequestHasChange || requestedSpecialties.length === 0}
                                            onClick={sendOwnSpecialtyRequest}
                                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {sendingOwnRequest ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                                    Sending...
                                                </>
                                            ) : (
                                                "Send request"
                                            )}
                                        </button>
                                        {requestedSpecialties.length === 0 && (
                                            <p className="mt-2 text-xs font-medium text-danger">
                                                Keep at least one specialty selected.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ) : null}
                        </SectionCard>
                    )}
                </div>

                <div className="flex flex-col gap-4">
                    {showStudentsPanel && (
                        <SectionCard variant="quiet">
                            <SectionHeader
                                title={isParent ? "Children" : "Assigned Students"}
                                description={isParent ? "Children connected to this account." : "Students this user is currently responsible for supporting."}
                                action={
                                    isAdmin ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (isLinkingStudent) {
                                                    setIsLinkingStudent(false);
                                                    setSelectedStudentId("");
                                                } else {
                                                    handleStartLinking();
                                                }
                                            }}
                                            className="rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-fg transition-colors hover:bg-app flex items-center gap-1.5"
                                        >
                                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                            {isLinkingStudent ? "Cancel" : isParent ? "Add Child" : "Assign Student"}
                                        </button>
                                    ) : !isParent ? (
                                        <span className="inline-flex rounded-full border border-line bg-app px-3 py-1 text-xs font-bold text-muted">
                                            {activeCount} Active · {pendingCount} Pending · {assessedCount} Assessed
                                        </span>
                                    ) : undefined
                                }
                            />

                            {isLinkingStudent && (
                                <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/20 p-4">
                                    <h3 className="m-0 text-sm font-bold text-fg mb-3">
                                        {isParent ? "Link a child to this parent account" : "Assign a student to this user"}
                                    </h3>
                                    {loadingStudents ? (
                                        <div className="flex items-center gap-2 text-xs text-muted py-2">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Loading student list...
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-muted uppercase tracking-wide">Select Student</label>
                                                <CustomSelect
                                                    ariaLabel="Select student"
                                                    placeholder="Choose a student"
                                                    value={selectedStudentId ? String(selectedStudentId) : ""}
                                                    onChange={(v) => {
                                                        setSelectedStudentId(v ? Number(v) : "");
                                                        setLinkingError("");
                                                    }}
                                                    options={allStudents
                                                        .filter(student => !assignedStudents.some(s => s.id === student.id))
                                                        .map(student => ({
                                                            value: String(student.id),
                                                            label: `${student.first_name} ${student.last_name} (Grade ${student.grade || "TBD"})`,
                                                        }))}
                                                />
                                            </div>
                                            {linkingError && (
                                                <p className="m-0 text-xs font-medium text-danger">{linkingError}</p>
                                            )}
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    disabled={linkingLoading || !selectedStudentId}
                                                    onClick={handleLinkStudent}
                                                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {linkingLoading ? (
                                                        <>
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                            Linking...
                                                        </>
                                                    ) : (
                                                        "Confirm Link"
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsLinkingStudent(false);
                                                        setSelectedStudentId("");
                                                        setLinkingError("");
                                                    }}
                                                    className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-bold text-fg transition-colors hover:bg-app"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {studentCount === 0 ? (
                                <div className="flex flex-col items-center gap-2 rounded-2xl bg-app py-10 text-center">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-faint shadow-sm">
                                        <Users className="h-5 w-5" aria-hidden="true" />
                                    </div>
                                    <p className="m-0 text-sm font-bold text-fg">
                                        {isParent ? "No children linked yet" : "No students assigned yet"}
                                    </p>
                                    <p className="m-0 max-w-sm text-xs text-muted">
                                        {isParent
                                            ? "Once your child is added by the administrator, their profile will appear here."
                                            : "This profile will become more useful once students are linked to the account."}
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {[...assignedStudents].sort((a, b) => b.id - a.id).map(student => {
                                        const statusCls = statusColorClass(student.status);
                                        return (
                                            <div
                                                key={student.id}
                                                className="group flex items-center justify-between gap-3 rounded-xl bg-app p-3 no-underline transition-colors hover:bg-indigo-50/60"
                                            >
                                                <Link
                                                    href={`/students/${student.id}`}
                                                    className="flex-1 no-underline group-hover:text-indigo-700"
                                                >
                                                    <div>
                                                        <p className="m-0 text-sm font-bold text-fg group-hover:text-indigo-700 transition-colors duration-200">
                                                            {student.first_name} {student.last_name}
                                                        </p>
                                                        <p className="m-0 text-xs text-muted">Grade: {student.grade || "TBD"}</p>
                                                    </div>
                                                </Link>
                                                <div className="flex items-center gap-3">
                                                    <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wide ${statusCls}`}>
                                                        {student.status?.replace(/_/g, " ")}
                                                    </span>
                                                    {isAdmin && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleUnlinkStudent(student.id);
                                                            }}
                                                            title="Unlink Child"
                                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-faint hover:bg-red-50 hover:text-red-600 transition-colors duration-200 border border-transparent hover:border-red-200"
                                                        >
                                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </SectionCard>
                    )}

                    {isCrossRoleParentSpecialist ? (
                        <SectionCard variant="quiet">
                            <SectionHeader
                                title="Communication"
                                description="All messages go through the system to keep records and protect both parties."
                            />
                            <div className={`flex items-start gap-3 rounded-xl border p-4 ${semanticToneClass("primary")}`}>
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm">
                                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                                </div>
                                <div>
                                    <p className="m-0 text-sm font-extrabold">
                                        Direct contact is not available
                                    </p>
                                    <p className="mt-1 text-sm">
                                        In-app messaging will be available soon. Until then, coordinate through your admin or scheduled session.
                                    </p>
                                </div>
                            </div>
                        </SectionCard>
                    ) : (
                        <SectionCard variant="quiet">
                            <SectionHeader
                                title={isAdmin ? "Next Best Actions" : "Quick Links"}
                                description={
                                    isAdmin
                                        ? "Quick paths for reviewing this account and continuing work."
                                        : "Helpful shortcuts for you."
                                }
                            />
                            <div className="flex flex-col gap-2">
                                {isParent ? (
                                    <>
                                        <ActionRow href="/dashboard" title="Go to Dashboard" copy="See your children and any pending tasks at a glance." icon={Sparkles} />
                                        {studentCount > 0 && (
                                            <ActionRow
                                                href={`/students/${assignedStudents[0].id}`}
                                                title={`View ${assignedStudents[0].first_name}'s Profile`}
                                                copy="Check progress, status, and available actions for your child."
                                                icon={Users}
                                            />
                                        )}
                                    </>
                                ) : isSelfServiceView ? (
                                    <>
                                        <ActionRow href="/workspace" title="Go to Workspace" copy="Pick up your active sessions, drafts, and reports." icon={Sparkles} />
                                        <ActionRow href="/dashboard" title="My Students" copy="See the students currently on your caseload." icon={Users} />
                                        {canEditLanguages && (
                                            <ActionRow
                                                onClick={() => {
                                                    setLanguageError("");
                                                    setLanguages(initialLanguages(user));
                                                    setLanguageOther("");
                                                    setIsEditingLanguages(true);
                                                }}
                                                title="Update Session Languages"
                                                copy="Change the languages you can run sessions in."
                                                icon={Languages}
                                            />
                                        )}
                                    </>
                                ) : isAdmin ? (
                                    <>
                                        <ActionRow
                                            href={`/users/${user.id}/activity`}
                                            title="Review Activity Log"
                                            copy="See recent account events and history for this user."
                                            icon={ActivityIcon}
                                        />
                                        {studentCount > 0 && (
                                            <ActionRow
                                                href={`/students/${assignedStudents[0].id}`}
                                                title="Open Latest Student"
                                                copy="Jump into the most recently listed student on this profile."
                                                icon={Users}
                                            />
                                        )}
                                        {user.email && (
                                            <ActionRow
                                                href={`mailto:${user.email}`}
                                                title="Contact User"
                                                copy="Send an email directly from the profile page."
                                                icon={Mail}
                                                external
                                            />
                                        )}
                                    </>
                                ) : (
                                    <p className="m-0 rounded-xl bg-app p-3 text-sm text-muted">
                                        This profile is limited to public information.
                                    </p>
                                )}
                            </div>
                        </SectionCard>
                    )}

                    {isAdmin && (
                        <section className={`rounded-2xl border p-6 md:p-7 ${semanticToneClass("warning")}`}>
                            <SectionHeader
                                title="Admin Tools"
                                description="Higher-impact actions belong here once they are wired up."
                            />
                            <div className="flex flex-col gap-3">
                                <p className="m-0 text-sm">
                                    This section is intentionally limited to real tools. Reset-password and deactivate controls should be added only after the backend action is implemented.
                                </p>
                                <Link
                                    href={`/users/${user.id}/activity`}
                                    className="inline-flex w-fit items-center gap-2 rounded-xl border border-warning-line bg-card px-4 py-2 text-sm font-bold text-warning no-underline transition-colors hover:border-warning-line hover:bg-warning-soft"
                                >
                                    Open Audit Trail
                                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </Link>
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}

function ActionRow({
    href,
    onClick,
    title,
    copy,
    icon: Icon,
    external,
}: {
    href?: string;
    onClick?: () => void;
    title: string;
    copy: string;
    icon: LucideIcon;
    external?: boolean;
}) {
    const content = (
        <>
            <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${semanticToneClass("primary")}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                    <p className="m-0 text-sm font-bold text-fg">{title}</p>
                    <p className="mt-0.5 text-xs text-muted">{copy}</p>
                </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
        </>
    );

    const cls = "flex items-center justify-between gap-3 rounded-xl bg-app p-3 no-underline transition-colors hover:bg-indigo-50/60";

    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={`${cls} w-full text-left`}>
                {content}
            </button>
        );
    }
    if (!href) return null;
    if (external) {
        return (
            <a href={href} className={cls}>
                {content}
            </a>
        );
    }
    return (
        <Link href={href} className={cls}>
            {content}
        </Link>
    );
}
