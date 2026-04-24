"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { LANGUAGE_OPTIONS, normalizeLanguages } from "@/lib/languages";
import { SPECIALIST_SPECIALTIES, type SpecialistSpecialty } from "@/lib/specialties";
import { isSpecialistOnboardingIncomplete, specialistOnboardingMessage } from "@/lib/specialist-onboarding";
import type { LucideIcon } from "lucide-react";
import {
    ActivityIcon,
    ArrowLeft,
    ArrowRight,
    BadgeCheck,
    Briefcase,
    Check,
    ChevronRight,
    Languages,
    Loader2,
    Mail,
    PhoneCall,
    Plus,
    ShieldCheck,
    Sparkles,
    Users,
    X,
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
    username: string;
    email: string;
    role: string;
    first_name: string;
    last_name: string;
    specialty: SpecialistSpecialty | "";
    specialties?: SpecialistSpecialty[];
    languages?: string[];
    phone_number?: string;
    is_phone_verified?: boolean;
    specialist_onboarding_complete?: boolean;
    specialist_onboarding_missing?: string[];
    assigned_students_count: number;
    assigned_students: AssignedStudent[];
    last_login?: string;
}

const inputCls =
    "w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm font-medium text-slate-800 placeholder:text-slate-400 transition-all hover:bg-white focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/15";

const statusStyles: Record<string, string> = {
    PENDING_ASSESSMENT: "bg-pink-50 text-pink-700 border-pink-100",
    ASSESSMENT_SCHEDULED: "bg-amber-50 text-amber-700 border-amber-100",
    ASSESSED: "bg-blue-50 text-blue-700 border-blue-100",
    ENROLLED: "bg-emerald-50 text-emerald-700 border-emerald-100",
    ARCHIVED: "bg-slate-50 text-slate-500 border-slate-200",
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

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <section className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-7 ${className}`}>
            {children}
        </section>
    );
}

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
        <div className="mb-5 flex flex-col gap-3 border-b border-indigo-100/60 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <h2 className="m-0 text-lg font-extrabold text-slate-900">{title}</h2>
                {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
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
    const [languages, setLanguages] = useState<string[]>([]);
    const [languageOther, setLanguageOther] = useState("");
    const [savingLanguages, setSavingLanguages] = useState(false);
    const [languageError, setLanguageError] = useState("");
    const [isEditingLanguages, setIsEditingLanguages] = useState(false);

    const initialSpecialties = (raw: UserData): SpecialistSpecialty[] => {
        if (Array.isArray(raw.specialties) && raw.specialties.length > 0) {
            return raw.specialties as SpecialistSpecialty[];
        }
        return raw.specialty ? [raw.specialty as SpecialistSpecialty] : [];
    };

    const initialLanguages = (raw: UserData): string[] =>
        normalizeLanguages(Array.isArray(raw.languages) ? raw.languages : []);

    const isAdmin = authUser?.role === "ADMIN";
    const onboardingIncomplete = isSpecialistOnboardingIncomplete(user ?? authUser);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await api.get(`/api/users/${id}/`);
                profileCache.set(cacheKey, res.data);
                setUser(res.data);
                setSpecialties(initialSpecialties(res.data));
                setLanguages(initialLanguages(res.data));
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
        return (
            <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading profile...
            </div>
        );
    }

    if (error) {
        return <div className="p-12 text-center text-sm text-red-600">{error}</div>;
    }

    if (!user) {
        return <div className="p-12 text-center text-sm text-slate-500">User not found.</div>;
    }

    const displayName = user.first_name || user.last_name
        ? `${user.first_name} ${user.last_name}`.trim()
        : user.username;
    const initials = displayName.split(" ").map(word => word[0]).join("").toUpperCase().slice(0, 2);
    const role = user.role?.toUpperCase() || "UNKNOWN";

    const assignedStudents = Array.isArray(user.assigned_students) ? user.assigned_students : [];
    const studentCount = assignedStudents.length;
    const activeCount = assignedStudents.filter(s => s.status === "ENROLLED").length;
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
    const canEditLanguages = role === "SPECIALIST" && (isAdmin || authUser?.user_id === user.id);
    const knownLanguageSet = new Set(LANGUAGE_OPTIONS.map(l => l.toLowerCase()));

    const profileInfo = isCrossRoleParentSpecialist
        ? [
            { label: "Role", value: user.role, icon: Briefcase },
        ]
        : isParentViewingOther
            ? [
                { label: "Email", value: user.email, href: `mailto:${user.email}`, icon: Mail },
                { label: "Phone", value: user.phone_number || "Not provided", href: user.phone_number ? `tel:${user.phone_number}` : undefined, icon: PhoneCall },
                { label: "Role", value: user.role, icon: Briefcase },
            ]
            : isParent
                ? [
                    { label: "Email", value: user.email, href: `mailto:${user.email}`, icon: Mail },
                    { label: "Phone", value: user.phone_number || "Not provided", href: user.phone_number ? `tel:${user.phone_number}` : undefined, icon: PhoneCall },
                    { label: "Account Status", value: "Active", icon: ShieldCheck },
                ]
                : [
                    { label: "Email", value: user.email, href: `mailto:${user.email}`, icon: Mail },
                    { label: "Username", value: user.username !== user.email ? `@${user.username}` : "Same as email" },
                    { label: "Phone", value: user.phone_number || "Not provided", href: user.phone_number ? `tel:${user.phone_number}` : undefined, icon: PhoneCall },
                    { label: "Role", value: user.role, icon: Briefcase },
                    { label: "Last Active", value: formatLastSeen(user.last_login), icon: ActivityIcon },
                    { label: "Account Status", value: "Active", icon: ShieldCheck },
                ];

    const statCards = !isParent && !isParentViewingOther
        ? [
            { label: "Caseload", value: studentCount, note: "total assigned students", accent: "from-indigo-500 to-blue-600" },
            { label: "Active", value: activeCount, note: "enrolled students", accent: "from-emerald-500 to-teal-600" },
            { label: "Needs Follow-up", value: pendingCount + assessedCount, note: "pending or assessed", accent: "from-amber-500 to-orange-600" },
        ]
        : [];

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 md:px-0">

            {/* Hero */}
            <SectionCard>
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        Back
                    </button>
                    {!isParent && !isParentViewingOther && (
                        <div className="flex flex-wrap gap-2">
                            <Link
                                href={`/users/${user.id}/activity`}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 no-underline transition-colors hover:bg-slate-50"
                            >
                                <ActivityIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                View Activity
                            </Link>
                            {user.email && (
                                <a
                                    href={`mailto:${user.email}`}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 no-underline transition-colors hover:bg-slate-50"
                                >
                                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                                    Email User
                                </a>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-start gap-5 sm:flex-row">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-2xl font-extrabold text-white shadow-md shadow-indigo-200">
                        {initials}
                    </div>
                    <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="m-0 bg-gradient-to-r from-blue-700 to-indigo-500 bg-clip-text text-2xl font-extrabold leading-tight text-transparent">
                                {displayName}
                            </h1>
                            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-indigo-700">
                                {role}
                            </span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-slate-500">
                            {getRoleSummary(role)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {!isCrossRoleParentSpecialist && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                                    <Mail className="h-3 w-3" aria-hidden="true" />
                                    {user.email}
                                </span>
                            )}
                            {!isCrossRoleParentSpecialist && user.phone_number && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                                    <PhoneCall className="h-3 w-3" aria-hidden="true" />
                                    {user.phone_number}
                                </span>
                            )}
                            {!isParent && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                                    <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                                    {(user.specialties && user.specialties.length > 0)
                                        ? user.specialties.join(", ")
                                        : (user.specialty || "Specialty not set")}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </SectionCard>

            {/* Stats */}
            {statCards.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {statCards.map(card => (
                        <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${card.accent} text-lg font-extrabold text-white shadow-md`}>
                                {card.value}
                            </div>
                            <p className="m-0 text-xs font-bold uppercase tracking-wide text-slate-500">{card.label}</p>
                            <p className="mt-1 text-sm text-slate-500">{card.note}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Onboarding callout */}
            {role === "SPECIALIST" && onboardingIncomplete && (
                <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="m-0 text-sm font-extrabold text-amber-900">Complete your profile setup</p>
                        <p className="mt-1 text-sm text-amber-800">{specialistOnboardingMessage(user.specialist_onboarding_missing || authUser?.specialist_onboarding_missing)}</p>
                    </div>
                    <Link
                        href="/specialist-onboarding"
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white no-underline shadow-sm hover:bg-amber-700"
                    >
                        Finish setup
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                </div>
            )}

            {/* Main grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="flex flex-col gap-6">
                    <SectionCard>
                        <SectionHeader
                            title={isParent ? "Your Information" : "Profile Information"}
                            description={isParent ? "Your contact details and account status." : "Identity, contact details, and account state."}
                        />
                        <div className="flex flex-col gap-2">
                            {profileInfo.map(item => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50">
                                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500">
                                            {Icon && <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />}
                                            {item.label}
                                        </span>
                                        {item.href ? (
                                            <a href={item.href} className="break-all text-right text-sm font-bold text-indigo-600 no-underline hover:underline">
                                                {item.value}
                                            </a>
                                        ) : (
                                            <span className="text-right text-sm font-bold text-slate-900">{item.value}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </SectionCard>

                    {!isParent && (
                        <SectionCard>
                            <SectionHeader
                                title={isParentViewingOther ? "About this specialist" : "Verification & Role Context"}
                                description={isParentViewingOther ? "Who this specialist is and how they can support your child." : "Important account context at a glance."}
                            />
                            <div className="flex flex-col gap-3">
                                {!isParentViewingOther && (
                                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4">
                                        <p className="m-0 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                            <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                                            Phone Verification
                                        </p>
                                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-sm font-bold text-slate-900">
                                                {user.phone_number || "No phone number on file"}
                                            </span>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${user.is_phone_verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                                                {user.is_phone_verified ? "Verified" : "Not verified"}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4">
                                    <p className="m-0 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                        Area of Practice
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {user.specialties && user.specialties.length > 0 ? (
                                            user.specialties.map(s => (
                                                <span key={s} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                                                    {s}
                                                </span>
                                            ))
                                        ) : user.specialty ? (
                                            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                                                {user.specialty}
                                            </span>
                                        ) : (
                                            <span className="text-sm italic text-slate-400">Not configured yet</span>
                                        )}
                                    </div>
                                </div>

                                {role === "SPECIALIST" && (
                                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4">
                                        <p className="m-0 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                            <Languages className="h-3.5 w-3.5" aria-hidden="true" />
                                            Session Languages
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {languages.length > 0 ? (
                                                languages.map(l => (
                                                    <span key={l} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                                        {l}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-sm italic text-slate-400">Not configured yet</span>
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
                                title="Edit Session Languages"
                                description="Languages this specialist can comfortably use with parents and children."
                                action={
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLanguageError("");
                                            setIsEditingLanguages(current => !current);
                                            setLanguages(initialLanguages(user));
                                            setLanguageOther("");
                                        }}
                                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
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
                                                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${checked
                                                        ? "border-indigo-400 bg-indigo-50 text-indigo-800 shadow-[0_2px_10px_rgba(99,102,241,0.12)]"
                                                        : "border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm"
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
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                                                    <span key={language} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1 text-xs font-semibold text-slate-700">
                                                        {language}
                                                        <button
                                                            type="button"
                                                            onClick={() => setLanguages(prev => prev.filter(l => l !== language))}
                                                            aria-label={`Remove ${language}`}
                                                            className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                                                        >
                                                            <X className="h-3 w-3" aria-hidden="true" />
                                                        </button>
                                                    </span>
                                                ))}
                                        </div>
                                    )}

                                    {languageError && (
                                        <p className="m-0 text-xs font-medium text-red-600">{languageError}</p>
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
                                            className="flex-1 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {languages.length > 0 ? (
                                        languages.map(language => (
                                            <span key={language} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                                {language}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-sm italic text-slate-400">No session languages configured yet.</span>
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
                                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
                                    >
                                        {isEditingSpecialty ? "Close" : "Edit"}
                                    </button>
                                }
                            />
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
                                                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${checked
                                                        ? "border-indigo-400 bg-indigo-50 text-indigo-800 shadow-[0_2px_10px_rgba(99,102,241,0.12)]"
                                                        : "border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm"
                                                        }`}
                                                >
                                                    {checked && <Check className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />}
                                                    <span className={checked ? "font-bold" : "font-medium"}>{option}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {specialtyError && (
                                        <p className="m-0 text-xs font-medium text-red-600">{specialtyError}</p>
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
                                            className="flex-1 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {specialties.length > 0 ? (
                                        specialties.map(s => (
                                            <span key={s} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                                                {s}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-sm italic text-slate-400">No specialty configured yet.</span>
                                    )}
                                </div>
                            )}
                        </SectionCard>
                    )}
                </div>

                <div className="flex flex-col gap-6">
                    {!isParentViewingOther && (
                        <SectionCard>
                            <SectionHeader
                                title={isParent ? "Children" : "Assigned Students"}
                                description={isParent ? "Children connected to this account." : "Students this user is currently responsible for supporting."}
                                action={!isParent ? (
                                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                                        {activeCount} Active · {pendingCount} Pending · {assessedCount} Assessed
                                    </span>
                                ) : undefined}
                            />

                            {studentCount === 0 ? (
                                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 py-10 text-center">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
                                        <Users className="h-5 w-5" aria-hidden="true" />
                                    </div>
                                    <p className="m-0 text-sm font-bold text-slate-700">
                                        {isParent ? "No children linked yet" : "No students assigned yet"}
                                    </p>
                                    <p className="m-0 max-w-sm text-xs text-slate-500">
                                        {isParent
                                            ? "Once your child is added by the administrator, their profile will appear here."
                                            : "This profile will become more useful once students are linked to the account."}
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {[...assignedStudents].sort((a, b) => b.id - a.id).map(student => {
                                        const statusCls = statusStyles[student.status?.toUpperCase()] ?? "bg-slate-50 text-slate-500 border-slate-200";
                                        return (
                                            <Link
                                                key={student.id}
                                                href={`/students/${student.id}`}
                                                className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 no-underline transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
                                            >
                                                <div>
                                                    <p className="m-0 text-sm font-bold text-slate-900 group-hover:text-indigo-700">
                                                        {student.first_name} {student.last_name}
                                                    </p>
                                                    <p className="m-0 text-xs text-slate-500">Grade: {student.grade || "TBD"}</p>
                                                </div>
                                                <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wide ${statusCls}`}>
                                                    {student.status?.replace(/_/g, " ")}
                                                </span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </SectionCard>
                    )}

                    {isCrossRoleParentSpecialist ? (
                        <SectionCard>
                            <SectionHeader
                                title="Communication"
                                description="All messages go through the system to keep records and protect both parties."
                            />
                            <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
                                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                                </div>
                                <div>
                                    <p className="m-0 text-sm font-extrabold text-indigo-950">
                                        Direct contact is not available
                                    </p>
                                    <p className="mt-1 text-sm text-indigo-800">
                                        In-app messaging will be available soon. Until then, coordinate through your admin or scheduled session.
                                    </p>
                                </div>
                            </div>
                        </SectionCard>
                    ) : (
                        <SectionCard>
                            <SectionHeader
                                title={isParent ? "Quick Links" : "Next Best Actions"}
                                description={isParent ? "Helpful shortcuts for you." : "Quick paths for reviewing this account and continuing work."}
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
                                ) : (
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
                                )}
                            </div>
                        </SectionCard>
                    )}

                    {isAdmin && (
                        <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-6 md:p-7">
                            <SectionHeader
                                title="Admin Tools"
                                description="Higher-impact actions belong here once they are wired up."
                            />
                            <div className="flex flex-col gap-3">
                                <p className="m-0 text-sm text-orange-900">
                                    This section is intentionally limited to real tools. Reset-password and deactivate controls should be added only after the backend action is implemented.
                                </p>
                                <Link
                                    href={`/users/${user.id}/activity`}
                                    className="inline-flex w-fit items-center gap-2 rounded-xl border border-orange-300 bg-white px-4 py-2 text-sm font-bold text-orange-800 no-underline transition-colors hover:bg-orange-100"
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
    title,
    copy,
    icon: Icon,
    external,
}: {
    href: string;
    title: string;
    copy: string;
    icon: LucideIcon;
    external?: boolean;
}) {
    const content = (
        <>
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                    <p className="m-0 text-sm font-bold text-slate-900">{title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{copy}</p>
                </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </>
    );

    const cls = "flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 no-underline transition-colors hover:border-indigo-200 hover:bg-indigo-50/30";

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
