"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
    Search, ChevronLeft, ChevronRight,
    UserPlus, FileText, Mail, ClipboardList, Calendar, GraduationCap,
    Users, FolderOpen, FileCheck2, Plus, ChevronRight as Chev,
    Sparkles, AlertCircle, CheckCircle2, Lock, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import { SPECIALIST_SPECIALTIES } from "@/lib/specialties";
import { specialtyShortLabel, userSpecialtyList } from "@/lib/sectionOwners";
import { isSpecialistOnboardingIncomplete, specialistOnboardingMessage } from "@/lib/specialist-onboarding";

// Inputs
import { ParentFormContent } from "@/app/parent-onboarding/page";
import { FormEntryContent } from "@/app/forms/[type]/page";

// Outputs
import { IEPViewerContent } from "@/app/admin/iep/page";
import { MonthlyReportContent } from "@/app/admin/monthly-report/page";
import { StudentProfileContent } from "@/app/students/[id]/page";
import { AdminReportsContent } from "@/app/admin/reports/page";

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    "PENDING_ASSESSMENT":    { bg: "#fce7f3", color: "#9d174d", label: "Pending Assessment" },
    "PENDING ASSESSMENT":    { bg: "#fce7f3", color: "#9d174d", label: "Pending Assessment" },
    "ASSESSMENT_SCHEDULED": { bg: "#fef3c7", color: "#92400e", label: "Assessment Scheduled" },
    "ASSESSMENT SCHEDULED": { bg: "#fef3c7", color: "#92400e", label: "Assessment Scheduled" },
    "ASSESSED":     { bg: "#dbeafe", color: "#1e40af", label: "Assessed" },
    "ASSESSED (AWAITING ENROLLMENT)": { bg: "#dbeafe", color: "#1e40af", label: "Assessed" },
    "ENROLLED":     { bg: "#dcfce7", color: "#14532d", label: "Enrolled" },
    "ARCHIVED":   { bg: "#f1f5f9", color: "#64748b", label: "Archived" },
};

const TABS = [
    { id: "parent_assessment", label: "Parent Assessment", formType: null },
    { id: "multi_assessment", label: "Specialist Assessment", formType: "multidisciplinary-assessment" },
    { id: "sped_assessment", label: "Teacher Assessment", formType: "sped-assessment" },
    { id: "parent_tracker", label: "Parent Progress", formType: "parent-tracker" },
    { id: "multi_tracker", label: "Specialist Progress", formType: "multidisciplinary-tracker" },
    { id: "sped_tracker", label: "Teacher Progress", formType: "sped-tracker" }
];

type StudentSidebarSort = "recent" | "az";

type WorkspaceMemory = {
    studentId?: string;
    workspace?: string;
    tab?: string;
    view?: string;
    docId?: string;
    teamRole?: string;
};

const formatDocumentDateTime = (value?: string | null) => {
    if (!value) return "";
    return new Date(value).toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
};

const getStaffName = (staff: any) =>
    (staff?.first_name || staff?.last_name)
        ? `${staff.first_name || ""} ${staff.last_name || ""}`.trim()
        : staff?.email || "Unknown Staff";

const getStaffSpecialties = (staff: any): string[] => userSpecialtyList(staff?.specialties, staff?.specialty);

const toDateTimeLocalValue = (value: Date) => {
    const offsetMs = value.getTimezoneOffset() * 60000;
    return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
};

const defaultSlotStart = () => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return toDateTimeLocalValue(next);
};

const defaultSlotEnd = () => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(10, 0, 0, 0);
    return toDateTimeLocalValue(next);
};

function AssessmentSchedulingPanel({
    user,
    studentId,
    compact = false,
    onChanged,
}: {
    user: any;
    studentId?: string | null;
    compact?: boolean;
    onChanged?: () => void;
}) {
    const [slots, setSlots] = useState<any[]>([]);
    const [appointments, setAppointments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [startAt, setStartAt] = useState(defaultSlotStart);
    const [endAt, setEndAt] = useState(defaultSlotEnd);
    const specialistOnboardingIncomplete = isSpecialistOnboardingIncomplete(user);

    const canManageAvailability = user?.role === "SPECIALIST" && !studentId;
    const canBook = user?.role === "PARENT" && studentId;
    const canManageAppointments = user?.role === "ADMIN";
    const canViewAppointments = user?.role === "SPECIALIST" && studentId;
    const scheduledAppointment = appointments.find(a => a.status === "SCHEDULED");

    const loadSchedule = async () => {
        setLoading(true);
        try {
            const params = studentId ? `?student_id=${encodeURIComponent(studentId)}` : "";
            const [slotRes, apptRes] = await Promise.all([
                api.get(`/api/assessment/availability/${params}`),
                api.get(`/api/assessment/appointments/${params}`),
            ]);
            setSlots(slotRes.data || []);
            setAppointments(apptRes.data || []);
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Could not load assessment schedule.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!user || (user.role !== "SPECIALIST" && !studentId)) return;
        loadSchedule();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.role, studentId]);

    const createSlot = async () => {
        setSaving(true);
        try {
            await api.post("/api/assessment/availability/", {
                start_at: new Date(startAt).toISOString(),
                end_at: new Date(endAt).toISOString(),
                mode: "ONLINE",
                is_active: true,
            });
            toast.success("Availability added.");
            await loadSchedule();
            onChanged?.();
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Could not add availability.");
        } finally {
            setSaving(false);
        }
    };

    const deleteSlot = async (slotId: number) => {
        try {
            await api.delete(`/api/assessment/availability/${slotId}/`);
            toast.success("Availability removed.");
            await loadSchedule();
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Could not remove availability.");
        }
    };

    const bookSlot = async (slotId: number) => {
        if (!studentId) return;
        setSaving(true);
        try {
            await api.post("/api/assessment/appointments/", {
                student: studentId,
                availability_slot: slotId,
            });
            toast.success("Assessment scheduled.");
            await loadSchedule();
            onChanged?.();
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Could not book this slot.");
        } finally {
            setSaving(false);
        }
    };

    const updateAppointmentStatus = async (appointmentId: number, status: string) => {
        try {
            await api.patch(`/api/assessment/appointments/${appointmentId}/`, { status });
            toast.success("Assessment schedule updated.");
            await loadSchedule();
            onChanged?.();
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Could not update appointment.");
        }
    };

    if (!canManageAvailability && !canBook && !canManageAppointments && !canViewAppointments) return null;

    return (
        <section className={`border border-slate-200 bg-white ${compact ? "rounded-lg p-4" : "rounded-xl p-5"} shadow-sm`}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between mb-4">
                <div>
                    <h2 className="text-base font-extrabold text-slate-900 m-0">Assessment Schedule</h2>
                    <p className="text-sm text-slate-500 m-0">
                        {user?.role === "SPECIALIST"
                            ? "Add online slots parents can book."
                            : user?.role === "PARENT"
                                ? "Choose an online assessment slot from assigned specialists."
                                : "Review and manage scheduled assessments."}
                    </p>
                </div>
                {loading && <span className="text-xs font-semibold text-slate-400">Loading...</span>}
            </div>

            {specialistOnboardingIncomplete && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="m-0 text-sm font-semibold text-amber-900">
                        {specialistOnboardingMessage(user?.specialist_onboarding_missing)}
                    </p>
                </div>
            )}

            {canManageAvailability && user?.role === "ADMIN" && (
                <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] sm:grid-cols-2 gap-2 mb-4">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                        Start
                        <input
                            type="datetime-local"
                            value={startAt}
                            onChange={e => setStartAt(e.target.value)}
                            disabled={specialistOnboardingIncomplete}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                        />
                    </label>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                        End
                        <input
                            type="datetime-local"
                            value={endAt}
                            onChange={e => setEndAt(e.target.value)}
                            disabled={specialistOnboardingIncomplete}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={createSlot}
                        disabled={saving || specialistOnboardingIncomplete}
                        className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                    >
                        Add Slot
                    </button>
                </div>
            )}
            {canManageAvailability && user?.role === "SPECIALIST" && (
                <Link
                    href="/schedule"
                    className="mb-4 inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 no-underline transition-colors hover:bg-indigo-50"
                >
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                    Manage availability in My Schedule
                </Link>
            )}

            {scheduledAppointment && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm font-bold text-emerald-900 m-0">
                        Scheduled: {formatDocumentDateTime(scheduledAppointment.start_at)}
                    </p>
                    <p className="text-xs text-emerald-700 m-0">
                        {scheduledAppointment.student_name} with {scheduledAppointment.specialist_name} · Online
                    </p>
                </div>
            )}

            {canBook && !scheduledAppointment && (
                <div className="space-y-2">
                    {slots.length === 0 ? (
                        <p className="text-sm text-slate-500 m-0">No available online slots yet.</p>
                    ) : slots.slice(0, 8).map(slot => (
                        <div key={slot.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm font-bold text-slate-900 m-0">{formatDocumentDateTime(slot.start_at)}</p>
                                <p className="text-xs text-slate-500 m-0">{slot.specialist_name} · Online</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => bookSlot(slot.id)}
                                disabled={saving}
                                className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                            >
                                Book
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {canManageAvailability && user?.role === "ADMIN" && (
                <div className="space-y-2">
                    {slots.length === 0 ? (
                        <p className="text-sm text-slate-500 m-0">No open availability slots.</p>
                    ) : slots.slice(0, 8).map(slot => (
                        <div key={slot.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm font-bold text-slate-900 m-0">{formatDocumentDateTime(slot.start_at)}</p>
                                <p className="text-xs text-slate-500 m-0">{slot.specialist_name} · Online</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => deleteSlot(slot.id)}
                                disabled={specialistOnboardingIncomplete}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-60"
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {user?.role === "ADMIN" && appointments.length === 0 && (
                <p className="text-sm text-slate-500 m-0">No scheduled assessments for this student yet.</p>
            )}

            {(user?.role === "ADMIN" || user?.role === "SPECIALIST") && appointments.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400 m-0">Appointments</p>
                    {appointments.slice(0, 8).map(appointment => (
                        <div key={appointment.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm font-bold text-slate-900 m-0">{formatDocumentDateTime(appointment.start_at)}</p>
                                <p className="text-xs text-slate-500 m-0">{appointment.student_name} with {appointment.specialist_name} · {appointment.status}</p>
                            </div>
                            {canManageAppointments && appointment.status === "SCHEDULED" && (
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => updateAppointmentStatus(appointment.id, "COMPLETED")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Complete</button>
                                    <button type="button" onClick={() => updateAppointmentStatus(appointment.id, "CANCELLED")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Cancel</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

function UnifiedWorkspaceContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const specialistOnboardingIncomplete = isSpecialistOnboardingIncomplete(user);
    
    // -- Global State --
    const studentId = searchParams.get("studentId");
    const [allStudents, setAllStudents] = useState<any[]>([]);
    const [studentSearch, setStudentSearch] = useState("");
    const [studentSort, setStudentSort] = useState<StudentSidebarSort>("recent");
    const [studentStatusFilter, setStudentStatusFilter] = useState("ALL");
    const [studentName, setStudentName] = useState("");
    const [studentStatus, setStudentStatus] = useState("");
    const [studentDetails, setStudentDetails] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [profileRefreshKey, setProfileRefreshKey] = useState(0);
    const [assessmentAppointments, setAssessmentAppointments] = useState<any[]>([]);

    // -- Forms State --
    const [formStatuses, setFormStatuses] = useState<any>(null);
    const requestedFormTab = searchParams.get("tab");
    const visibleFormTabs = user?.role === "PARENT"
        ? TABS.filter(tab => tab.id === "parent_tracker" || tab.id === "parent_assessment")
        : user?.role === "TEACHER"
            ? TABS.filter(tab => tab.id === "sped_tracker")
            : TABS;
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const showStudentSidebar = user?.role !== "PARENT";
    
    // -- Reports State --
    const [docs, setDocs] = useState<any[]>([]);
    const activeReportView = searchParams.get("view") || "generator";
    const activeDocId = searchParams.get("docId");
    const workspaceParam = searchParams.get("workspace");
    const activeViewParam = searchParams.get("view");
    const activeTeamRoleParam = searchParams.get("teamRole");
    const normalizedStudentStatus = studentStatus?.toUpperCase();

    // -- Team State --
    const [assignedStaff, setAssignedStaff] = useState<any[]>([]);
    const [staffList, setStaffList] = useState<any[]>([]);
    const [assigning, setAssigning] = useState<number | null>(null);
    const [unassigningStaff, setUnassigningStaff] = useState<{ id: number, specialty?: string, name?: string, role: string } | null>(null);
    const [isUnassigning, setIsUnassigning] = useState(false);
    const [sendingParentReminder, setSendingParentReminder] = useState(false);
    const [showEnrollConfirm, setShowEnrollConfirm] = useState(false);
    const [enrollingStudent, setEnrollingStudent] = useState(false);
    const [specialistSearch, setSpecialistSearch] = useState("");
    const activeTeamRole = searchParams.get("teamRole") || "SPECIALIST";
    const isAuthorized = Boolean(user);
    const workspaceMemoryKey = user ? `arase:workspace:last:${user.user_id}` : "";
    const hasExplicitWorkspaceState = Boolean(
        studentId ||
        workspaceParam ||
        requestedFormTab ||
        activeViewParam ||
        activeDocId ||
        activeTeamRoleParam
    );

    // -- Master Tab Switcher --
    // Parents can only access the "forms" workspace (ignore any URL tampering)
    const rawWorkspace = workspaceParam || (user?.role === "ADMIN" ? "overview" : "forms");
    const workspace = user?.role === "PARENT" ? "forms" : rawWorkspace;
    const isStudentCurrentlyEnrolled = studentStatus?.toUpperCase() === "ENROLLED";
    const defaultFormTab = user?.role === "PARENT"
        ? (formStatuses?.parent_assessment?.submitted
            ? "parent_tracker"
            : "parent_assessment")
        : user?.role === "TEACHER"
            ? "sped_tracker"
            : user?.role === "SPECIALIST"
                ? formStatuses?.multi_assessment?.submitted && isStudentCurrentlyEnrolled
                    ? "multi_tracker"
                    : "multi_assessment"
                : "parent_assessment";
    const canUseRequestedFormTab = requestedFormTab &&
        visibleFormTabs.some(tab => tab.id === requestedFormTab) &&
        !(user?.role === "SPECIALIST" && requestedFormTab === "multi_tracker" && !isStudentCurrentlyEnrolled) &&
        !(user?.role === "TEACHER" && requestedFormTab === "sped_tracker" && !isStudentCurrentlyEnrolled);
    const activeFormTab = canUseRequestedFormTab
        ? requestedFormTab
        : defaultFormTab;

    useEffect(() => {
        if (user?.role !== "PARENT" || !studentId || typeof window === "undefined") return;
        window.localStorage.setItem("arase:last-parent-student-id", studentId);
    }, [studentId, user?.role]);

    useEffect(() => {
        if (!isAuthorized) {
            setLoading(false);
            return;
        }

        let isActive = true;
        setLoadError(null);
        api.get("/api/students/").then(res => {
            if (!isActive) return;
            const students = res.data;
            setAllStudents(students);

            if (!hasExplicitWorkspaceState && typeof window !== "undefined") {
                const stored = window.localStorage.getItem(workspaceMemoryKey);
                let remembered: WorkspaceMemory | null = null;
                try {
                    remembered = stored ? JSON.parse(stored) as WorkspaceMemory : null;
                } catch {
                    window.localStorage.removeItem(workspaceMemoryKey);
                }
                const rememberedStudentId = remembered?.studentId;
                if (rememberedStudentId && students.some((s: any) => s.id.toString() === rememberedStudentId)) {
                    const url = new URL(window.location.href);
                    url.searchParams.set("studentId", rememberedStudentId);
                    if (user?.role === "ADMIN") {
                        url.searchParams.set("workspace", "overview");
                        url.searchParams.delete("tab");
                        url.searchParams.delete("view");
                        url.searchParams.delete("docId");
                        url.searchParams.delete("teamRole");
                    } else {
                        if (remembered?.workspace) url.searchParams.set("workspace", remembered.workspace);
                        if (remembered?.tab) url.searchParams.set("tab", remembered.tab);
                        if (remembered?.view) url.searchParams.set("view", remembered.view);
                        if (remembered?.docId) url.searchParams.set("docId", remembered.docId);
                        if (remembered?.teamRole) url.searchParams.set("teamRole", remembered.teamRole);
                    }
                    router.replace(url.pathname + url.search);
                    return;
                }
            }
            
            // If no student is explicitly active but we have students, automatically redirect to first
            if (!studentId && students.length > 0) {
                const url = new URL(window.location.href);
                url.searchParams.set("studentId", students[0].id.toString());
                router.replace(url.pathname + url.search);
            } else if (!studentId && students.length === 0) {
                setLoading(false); // Finished loading but no students exist
            }
        }).catch(() => {
            if (!isActive) return;
            setLoadError("Unable to connect to the server. Make sure Django is running on port 8000, then refresh the page.");
            setLoading(false);
        });
        return () => {
            isActive = false;
        };
    }, [studentId, router, isAuthorized, hasExplicitWorkspaceState, workspaceMemoryKey]);

    useEffect(() => {
        if (!isAuthorized || !studentId) return; // Prevent fetch if no student is active
        let isActive = true;
        setLoadError(null);
        
        api.get(`/api/students/${studentId}/profile/`)
            .then(res => {
                if (!isActive) return;
                const data = res.data;
                setStudentName(`${data.student.first_name} ${data.student.last_name}`);
                setStudentStatus(data.student.status);
                setStudentDetails(data.student);
                setFormStatuses(data.form_statuses);
                setAssignedStaff(data.assigned_staff || []);
                
                const generatedDocs = data.generated_documents || [];
                generatedDocs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                setDocs(generatedDocs);
                
                setLoading(false);
            })
            .catch(() => {
                if (!isActive) return;
                setLoadError("Unable to load this student's workspace. Make sure Django is running, then refresh the page.");
                setLoading(false);
            });
        return () => {
            isActive = false;
        };
    }, [studentId, isAuthorized, profileRefreshKey]);

    useEffect(() => {
        if (!isAuthorized || !studentId || !["ADMIN", "SPECIALIST", "PARENT"].includes(user?.role || "")) {
            setAssessmentAppointments([]);
            return;
        }

        let isActive = true;
        api.get(`/api/assessment/appointments/?student_id=${studentId}`)
            .then(res => {
                if (isActive) setAssessmentAppointments(res.data || []);
            })
            .catch(() => {
                if (isActive) setAssessmentAppointments([]);
            });
        return () => {
            isActive = false;
        };
    }, [isAuthorized, studentId, user?.role, profileRefreshKey]);

    useEffect(() => {
        if (!isAuthorized || !studentId || !formStatuses || workspace !== "forms" || requestedFormTab || typeof window === "undefined") {
            return;
        }

        const url = new URL(window.location.href);
        url.searchParams.set("workspace", "forms");
        url.searchParams.set("tab", activeFormTab);
        router.replace(url.pathname + url.search);
    }, [isAuthorized, studentId, formStatuses, workspace, requestedFormTab, activeFormTab, router]);

    useEffect(() => {
        if (!isAuthorized || !studentId || !formStatuses || !workspaceMemoryKey || typeof window === "undefined") {
            return;
        }

        const memory: WorkspaceMemory = {
            studentId,
            workspace,
        };

        if (workspace === "forms") {
            memory.tab = activeFormTab;
        }
        if (workspace === "reports") {
            memory.view = activeReportView;
            if (activeDocId) memory.docId = activeDocId;
        }
        if (workspace === "team") {
            memory.teamRole = activeTeamRole;
        }

        window.localStorage.setItem(workspaceMemoryKey, JSON.stringify(memory));
    }, [
        isAuthorized,
        studentId,
        formStatuses,
        workspace,
        activeFormTab,
        activeReportView,
        activeDocId,
        activeTeamRole,
        workspaceMemoryKey,
    ]);

    useEffect(() => {
        if (!studentId || user?.role !== "ADMIN") return;
        api.get(`/api/staff/?student_id=${studentId}`).then(res => setStaffList(res.data)).catch(() => {
            setStaffList([]);
        });
    }, [studentId, user?.role]);

    // -- Handlers --
    const confirmUnassign = async () => {
        if (!unassigningStaff || !studentDetails) return;
        setIsUnassigning(true);
        try {
            const res = await api.post(`/api/students/${studentDetails.id}/unassign-staff/`, {
                staff_id: unassigningStaff.id,
                specialty: unassigningStaff.specialty
            });
            if (res.status === 200) {
                toast.success("Staff member removed successfully.");
                setProfileRefreshKey(prev => prev + 1);
            }
        } catch (error: any) {
            console.error("Error unassigning staff:", error);
            toast.error(error.response?.data?.error || "Failed to remove staff member");
        } finally {
            setIsUnassigning(false);
            setUnassigningStaff(null);
        }
    };

    const handleAssign = async (type: "specialist" | "teacher", staffId: number, specialties: string[] = []) => {
        setAssigning(staffId);
        try {
            const endpoint = type === "specialist" ? "assign-specialist" : "assign-teacher";
            const payload = type === "specialist" ? { specialist_id: staffId, specialties } : { teacher_id: staffId };
            await api.post(`/api/students/${studentId}/${endpoint}/`, payload);
            const profileRes = await api.get(`/api/students/${studentId}/profile/`);
            setAssignedStaff(profileRes.data.assigned_staff || []);
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Assignment failed.");
        } finally {
            setAssigning(null);
        }
    };

    const setWorkspace = (newWorkspace: string) => {
        const url = new URL(window.location.href);
        url.searchParams.set("workspace", newWorkspace);
        if (newWorkspace === "reports" && user?.role !== "ADMIN") {
            const latestDoc = docs[0];
            if (latestDoc) {
                url.searchParams.set("view", latestDoc.type === "MONTHLY" ? "monthly" : "iep");
                url.searchParams.set("docId", latestDoc.id.toString());
            } else {
                url.searchParams.set("view", "empty");
                url.searchParams.delete("docId");
            }
        }
        router.push(url.pathname + url.search);
    };

    const handleFormTabChange = (tabId: string) => {
        const url = new URL(window.location.href);
        url.searchParams.set("workspace", "forms");
        url.searchParams.set("tab", tabId);
        router.push(url.pathname + url.search);
    };

    const handleReportMenuChange = (view: string, docId?: string) => {
        const url = new URL(window.location.href);
        url.searchParams.set("workspace", "reports");
        url.searchParams.set("view", view);
        if (docId) {
            url.searchParams.set("docId", docId);
        } else {
            url.searchParams.delete("docId");
        }
        router.push(url.pathname + url.search);
    };

    const handleTeamMenuChange = (role: string) => {
        const url = new URL(window.location.href);
        url.searchParams.set("workspace", "team");
        url.searchParams.set("teamRole", role);
        router.push(url.pathname + url.search);
    };

    const handleParentAssessmentReminder = async () => {
        if (!studentId || sendingParentReminder) return;
        setSendingParentReminder(true);
        try {
            const res = await api.post(`/api/students/${studentId}/parent-assessment-reminder/`);
            toast.success(res.data.message || "Reminder sent.");
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Failed to send reminder.");
        } finally {
            setSendingParentReminder(false);
        }
    };

    const handleEmbeddedFormSubmitted = async (message: string) => {
        toast.success(message);
        setProfileRefreshKey(key => key + 1);
    };

    const handleEnrollStudent = async () => {
        if (!studentId || enrollingStudent) return;
        setEnrollingStudent(true);
        try {
            const res = await api.post(`/api/students/${studentId}/enroll/`);
            const profileRes = await api.get(`/api/students/${studentId}/profile/`);
            const data = profileRes.data;
            setStudentStatus(data.student.status);
            setStudentDetails(data.student);
            setFormStatuses(data.form_statuses);
            setAssignedStaff(data.assigned_staff || []);
            const generatedDocs = data.generated_documents || [];
            generatedDocs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setDocs(generatedDocs);
            setShowEnrollConfirm(false);
            toast.success(res.data.message || "Student enrolled.");
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Failed to enroll student.");
        } finally {
            setEnrollingStudent(false);
        }
    };

    if (!isAuthorized) {
        return null;
    }

    if (loading) {
        return <div className="p-8 h-full flex items-center justify-center text-slate-500">Loading workspace...</div>;
    }

    if (loadError) {
        return (
            <div className="flex w-full h-full items-center justify-center bg-[var(--bg-lighter)]">
                <div className="flex max-w-md flex-col items-center bg-white p-12 rounded-xl shadow-sm border border-slate-200">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
                        <span className="text-2xl font-bold">!</span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Workspace Unavailable</h2>
                    <p className="text-slate-500 text-center">{loadError}</p>
                </div>
            </div>
        );
    }
    
    // Empty State Check
    if (!studentId && allStudents.length === 0) {
        return (
            <div className="flex w-full h-full items-center justify-center bg-[var(--bg-lighter)]">
                <div className="flex flex-col items-center bg-white p-12 rounded-xl shadow-sm border border-slate-200">
                    <svg className="w-16 h-16 text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">No Students Found</h2>
                    <p className="text-slate-500 max-w-sm text-center">Your caseload is currently empty. You must be assigned students before accessing the workspace.</p>
                </div>
            </div>
        );
    }

    if (!formStatuses) {
        return <div className="p-8 text-center text-red-500">Failed to load student data.</div>;
    }

    // -- Sub-renderers for clean structure --

    const formatDate = (value?: string) => {
        if (!value) return "TBD";
        return new Date(value + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    const calculateAge = (value?: string) => {
        if (!value) return "TBD";
        const today = new Date();
        const birthDate = new Date(value + "T00:00:00");
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age -= 1;
        }
        return `${age} years old`;
    };

    const staffNames = (staff: any[]) => {
        if (staff.length === 0) return "None";
        return staff.map(s => `${s.first_name || ""} ${s.last_name || ""}`.trim() || s.email).join(", ");
    };

    const compactStudentName = () => {
        const firstName = studentDetails?.first_name || studentName.split(" ")[0] || "student";
        const lastName = studentDetails?.last_name || studentName.split(" ").slice(1).join(" ");
        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName.length <= 18 || !lastName) return fullName;
        return `${firstName} ${lastName.charAt(0)}.`;
    };

    const formatActivityTime = (value?: string) => {
        if (!value) return "";
        return new Date(value).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    };

    const formatRelativeTime = (value?: string) => {
        if (!value) return "";
        const then = new Date(value).getTime();
        const diffSec = Math.floor((Date.now() - then) / 1000);
        if (diffSec < 60) return "just now";
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h ago`;
        if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} d ago`;
        return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    const submitterLabel = (submittedBy?: { name?: string; role?: string } | null) => {
        if (!submittedBy) return "Submitted";
        const role = submittedBy.role ? submittedBy.role.toLowerCase() : "user";
        return `${submittedBy.name || "User"} • ${role}`;
    };

    const buildRecentActivity = () => {
        const formActivities = TABS
            .map(tab => {
                const status = formStatuses?.[tab.id];
                if (!status?.submitted || !status.submitted_at) return null;
                return {
                    id: `form-${tab.id}-${status.id}`,
                    title: `${tab.label} submitted`,
                    meta: submitterLabel(status.submitted_by),
                    timestamp: status.submitted_at,
                    tone: "form",
                };
            })
            .filter(Boolean);

        const documentActivities = docs
            .filter(doc => doc.created_at)
            .map(doc => ({
                id: `doc-${doc.id}`,
                title: doc.type === "IEP" ? "IEP generated" : "Monthly report generated",
                meta: doc.status ? `${doc.status.toLowerCase()} document` : "Generated document",
                timestamp: doc.created_at,
                tone: "document",
            }));

        // TODO: Replace this derived timeline with a backend audit trail that records every user action.
        return [...formActivities, ...documentActivities]
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 8);
    };

    const buildAdminActions = () => {
        const specialists = assignedStaff.filter(s => s.role === "SPECIALIST");
        const teachers = assignedStaff.filter(s => s.role === "TEACHER");
        const latestIep = docs.find(d => d.type === "IEP");
        const latestMonthlyReport = docs.find(d => d.type === "MONTHLY");
        const trackerTabs = TABS.slice(2);
        const pendingTrackers = trackerTabs.filter(tab => !formStatuses?.[tab.id]?.submitted);
        const allTrackersSubmitted = trackerTabs.every(tab => formStatuses?.[tab.id]?.submitted);
        const canGenerateMonthlyReport = normalizedStudentStatus === "ENROLLED" && allTrackersSubmitted && !latestMonthlyReport;
        const actions: { title: string; label: string; onClick: () => void; tone?: "warning" | "positive"; Icon?: React.ComponentType<{ size?: number; className?: string }> }[] = [];

        if (!formStatuses?.parent_assessment?.submitted) {
            actions.push({ title: "Parent assessment missing", label: sendingParentReminder ? "Sending..." : "Remind", onClick: handleParentAssessmentReminder, tone: "warning", Icon: Mail });
        }
        if (formStatuses?.parent_assessment?.submitted && specialists.length === 0) {
            actions.push({ title: "Assign specialist", label: "Open Team", onClick: () => handleTeamMenuChange("SPECIALIST"), Icon: UserPlus });
        }
        if (normalizedStudentStatus === "ASSESSED") {
            actions.push({ title: `Enroll ${compactStudentName()}?`, label: "Enroll", onClick: () => setShowEnrollConfirm(true), tone: "positive", Icon: CheckCircle2 });
        }
        if (["ASSESSED", "ENROLLED"].includes(normalizedStudentStatus || "") && !latestIep) {
            actions.push({ title: "Generate IEP", label: "Open Reports", onClick: () => handleReportMenuChange("generator"), Icon: FileText });
        }
        if (canGenerateMonthlyReport) {
            actions.push({ title: "Generate Monthly Progress Report", label: "Open Reports", onClick: () => handleReportMenuChange("generator"), tone: "positive", Icon: Sparkles });
        }
        if (normalizedStudentStatus === "ENROLLED" && teachers.length === 0) {
            actions.push({ title: "Assign teacher", label: "Open Team", onClick: () => handleTeamMenuChange("TEACHER"), tone: "warning", Icon: UserPlus });
        }
        if (normalizedStudentStatus === "ENROLLED" && pendingTrackers.length > 0) {
            actions.push({ title: `${pendingTrackers.length} tracker${pendingTrackers.length === 1 ? "" : "s"} pending`, label: "Open Forms", onClick: () => setWorkspace("forms"), Icon: ClipboardList });
        }

        return actions;
    };

    const renderOverviewWorkspace = () => {
        const actions = buildAdminActions();
        const submittedForms = TABS.filter(tab => formStatuses?.[tab.id]?.submitted).length;
        const latestDoc = docs[0];
        const specialists = assignedStaff.filter(s => s.role === "SPECIALIST");
        const teachers = assignedStaff.filter(s => s.role === "TEACHER");
        const recentActivity = buildRecentActivity();
        const profileRows = [
            { label: "Grade", value: studentDetails?.grade || "TBD" },
            { label: "Age", value: calculateAge(studentDetails?.date_of_birth) },
            { label: "DOB", value: formatDate(studentDetails?.date_of_birth) },
            { label: "Forms", value: `${submittedForms}/5 submitted` },
            { label: "Docs", value: docs.length ? `${docs.length} on file` : "None" },
            { label: "Team", value: assignedStaff.length ? `${assignedStaff.length} assigned` : "None" },
        ];
        const parentRows = [
            { label: "Name", value: studentDetails?.parent_guardian_name || "Not provided" },
            { label: "Email", value: studentDetails?.parent_email || "Not provided", href: studentDetails?.parent_email ? `mailto:${studentDetails.parent_email}` : undefined },
            { label: "Phone", value: studentDetails?.parent_phone || "Not provided", href: studentDetails?.parent_phone ? `tel:${studentDetails.parent_phone}` : undefined },
        ];

        const statusInfo = STATUS_COLORS[studentStatus?.toUpperCase()] || { bg: "#f1f5f9", color: "#475569", label: studentStatus };
        const parentInitials = (studentDetails?.parent_guardian_name || "")
            .split(" ").map((p: string) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
        const formsPct = Math.round((submittedForms / 5) * 100);

        return (
            <>
                <div className="w-full md:w-60 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                    <div className="px-5 py-4 border-b border-slate-200">
                        <h1 className="text-xl font-extrabold text-slate-900 m-0 leading-tight tracking-tight" title={studentName}>{studentName}</h1>
                        {studentStatus && (
                            <span style={{
                                display: "inline-block", marginTop: 8,
                                fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px",
                                padding: "3px 9px", borderRadius: "999px",
                                background: STATUS_COLORS[studentStatus?.toUpperCase()]?.bg || "#f1f5f9",
                                color: STATUS_COLORS[studentStatus?.toUpperCase()]?.color || "#475569",
                            }}>
                                {STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto py-4 px-3 custom-scrollbar flex flex-col gap-3">
                        <button onClick={() => router.push(`/students/${studentId}`)} className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 transition-colors flex items-center justify-center gap-2 shadow-sm">
                            <FolderOpen size={14} />
                            Open Full Profile
                        </button>
                        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                            <p className="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Quick links</p>
                            <div className="flex flex-col gap-0.5">
                                <button onClick={() => setWorkspace("forms")} className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-indigo-700 transition-colors">
                                    <span className="flex items-center gap-2"><ClipboardList size={13} /> Forms</span>
                                    <span className="text-[0.65rem] font-bold text-slate-400">{submittedForms}/5</span>
                                </button>
                                <button onClick={() => handleReportMenuChange("history")} className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-indigo-700 transition-colors">
                                    <span className="flex items-center gap-2"><FileText size={13} /> Documents</span>
                                    <span className="text-[0.65rem] font-bold text-slate-400">{docs.length}</span>
                                </button>
                                <button onClick={() => handleTeamMenuChange("SPECIALIST")} className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-indigo-700 transition-colors">
                                    <span className="flex items-center gap-2"><Users size={13} /> Team</span>
                                    <span className="text-[0.65rem] font-bold text-slate-400">{assignedStaff.length}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-white relative flex flex-col overflow-hidden">
                    {tabBar}
                    <div className="flex-1 overflow-y-auto p-5 md:p-6">
                    {/* Header: breadcrumb + name + status chip + horizontal stat strip */}
                    <div className="mb-5">

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-sm">
                            <div className="rounded-lg bg-white px-3 py-2 flex items-center justify-between border border-slate-100">
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400 m-0">Actions</p>
                                    <p className="text-base font-bold text-slate-900 m-0 leading-tight">{actions.length}</p>
                                </div>
                                <AlertCircle size={16} className={actions.length > 0 ? "text-amber-500" : "text-slate-300"} />
                            </div>
                            <button onClick={() => setWorkspace("forms")} className="rounded-lg bg-white px-3 py-2 flex items-center justify-between border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors text-left">
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400 m-0">Forms</p>
                                    <p className="text-base font-bold text-slate-900 m-0 leading-tight">{submittedForms}/5</p>
                                </div>
                                <ClipboardList size={16} className="text-slate-400" />
                            </button>
                            <button onClick={() => handleReportMenuChange("history")} className="rounded-lg bg-white px-3 py-2 flex items-center justify-between border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors text-left">
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400 m-0">Docs</p>
                                    <p className="text-base font-bold text-slate-900 m-0 leading-tight">{docs.length}</p>
                                </div>
                                <FileText size={16} className="text-slate-400" />
                            </button>
                            <button onClick={() => handleTeamMenuChange("SPECIALIST")} className="rounded-lg bg-white px-3 py-2 flex items-center justify-between border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors text-left">
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400 m-0">Team</p>
                                    <p className="text-base font-bold text-slate-900 m-0 leading-tight">{assignedStaff.length}</p>
                                </div>
                                <Users size={16} className="text-slate-400" />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Action Queue */}
                        <section className="rounded-xl border border-slate-200 shadow-sm p-4 lg:col-span-2 bg-white">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
                                    Action Queue
                                </h2>
                                {actions.length > 0 && (
                                    <span className="text-[0.65rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                        {actions.length} active
                                    </span>
                                )}
                            </div>
                            {actions.length === 0 ? (
                                <div className="flex items-center gap-2 text-sm text-slate-500 py-4 px-3 rounded-lg bg-emerald-50 border border-emerald-100">
                                    <CheckCircle2 size={16} className="text-emerald-600" />
                                    All caught up — no urgent admin follow-ups.
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {actions.map(action => {
                                        const Icon = action.Icon || ClipboardList;
                                        const accent =
                                            action.tone === "warning" ? { border: "border-amber-200", bg: "bg-amber-50", stripe: "bg-amber-400", iconBg: "bg-amber-100", iconColor: "text-amber-700", btn: "bg-amber-600 hover:bg-amber-700 text-white" } :
                                            action.tone === "positive" ? { border: "border-emerald-200", bg: "bg-emerald-50", stripe: "bg-emerald-500", iconBg: "bg-emerald-100", iconColor: "text-emerald-700", btn: "bg-emerald-600 hover:bg-emerald-700 text-white" } :
                                                                          { border: "border-indigo-200", bg: "bg-indigo-50/40", stripe: "bg-indigo-500", iconBg: "bg-indigo-100", iconColor: "text-indigo-700", btn: "bg-indigo-600 hover:bg-indigo-700 text-white" };
                                        return (
                                            <div key={action.title} className={`relative flex items-center justify-between gap-3 rounded-lg border ${accent.border} ${accent.bg} pl-4 pr-3 py-2.5 overflow-hidden`}>
                                                <span className={`absolute left-0 top-0 bottom-0 w-1 ${accent.stripe}`} />
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <span className={`w-7 h-7 rounded-md ${accent.iconBg} ${accent.iconColor} flex items-center justify-center shrink-0`}>
                                                        <Icon size={15} />
                                                    </span>
                                                    <p className="text-sm font-bold text-slate-800 m-0 truncate">{action.title}</p>
                                                </div>
                                                <button onClick={action.onClick} className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-md transition-colors ${accent.btn}`}>
                                                    {action.label}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* Student Snapshot */}
                        <section className="rounded-xl border border-slate-200 shadow-sm p-4 bg-white">
                            <h2 className="text-base font-bold text-slate-900 mb-3 m-0">Student Snapshot</h2>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400 m-0">Grade</p>
                                    <p className="text-sm font-bold text-slate-800 m-0">{studentDetails?.grade || "TBD"}</p>
                                </div>
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400 m-0">Age</p>
                                    <p className="text-sm font-bold text-slate-800 m-0">{calculateAge(studentDetails?.date_of_birth)}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400 m-0 flex items-center gap-1.5">
                                        <Calendar size={11} /> Date of Birth
                                    </p>
                                    <p className="text-sm font-bold text-slate-800 m-0">{formatDate(studentDetails?.date_of_birth)}</p>
                                </div>
                            </div>
                            <div className="border-t border-slate-100 pt-3">
                                <button onClick={() => setWorkspace("forms")} className="w-full text-left">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-xs font-bold text-slate-600 m-0">Form completion</p>
                                        <span className="text-xs font-bold text-indigo-600">{submittedForms}/5</span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all" style={{ width: `${formsPct}%` }} />
                                    </div>
                                </button>
                            </div>
                        </section>

                        {/* Recent Activity (timeline) */}
                        <section className="rounded-xl border border-slate-200 shadow-sm p-4 lg:col-span-2 bg-white">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-base font-bold text-slate-900 m-0">Recent Activity</h2>
                                <button onClick={() => handleReportMenuChange("history")} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                                    View all →
                                </button>
                            </div>
                            {recentActivity.length === 0 ? (
                                <p className="text-sm text-slate-500">No recorded form or document activity yet.</p>
                            ) : (
                                <div className="relative max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                                    <span className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" aria-hidden />
                                    <div className="flex flex-col">
                                        {recentActivity.map((item: any) => (
                                            <div key={item.id} className="relative flex items-start gap-3 pl-1 py-2.5 group">
                                                <span className={`relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full ring-2 ring-white ${item.tone === "document" ? "bg-indigo-500" : "bg-emerald-500"}`} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="m-0 truncate text-sm font-bold text-slate-800">{item.title}</p>
                                                    <p className="m-0 truncate text-xs font-semibold text-slate-500">{item.meta}</p>
                                                </div>
                                                <span className="shrink-0 text-xs font-mono font-semibold text-slate-400 mt-0.5" title={formatActivityTime(item.timestamp)}>
                                                    {formatRelativeTime(item.timestamp)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* Parent */}
                        <section className="rounded-xl border border-slate-200 shadow-sm p-4 bg-white">
                            <h2 className="text-base font-bold text-slate-900 mb-3 m-0">Parent</h2>
                            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-100">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                                    {parentInitials}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-800 m-0 truncate">{studentDetails?.parent_guardian_name || "Not provided"}</p>
                                    <p className="text-[0.7rem] font-semibold text-slate-400 m-0">Primary contact</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                {parentRows.slice(1).map(row => (
                                    <div key={row.label} className="flex items-center justify-between gap-3">
                                        <span className="text-xs font-semibold text-slate-500">{row.label}</span>
                                        {row.href ? (
                                            <a href={row.href} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 truncate">{row.value}</a>
                                        ) : (
                                            <span className="text-xs font-bold text-slate-800 truncate">{row.value}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Team & Documents */}
                        <section className="rounded-xl border border-slate-200 shadow-sm p-4 lg:col-span-2 bg-white">
                            <h2 className="text-base font-bold text-slate-900 mb-3 m-0">Team & Documents</h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                                        <Users size={11} /> Specialists
                                    </p>
                                    {specialists.length === 0 ? (
                                        <button onClick={() => handleTeamMenuChange("SPECIALIST")} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                            <Plus size={12} /> Assign specialist
                                        </button>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {specialists.map(sp => {
                                                const specs = (sp.specialties && sp.specialties.length > 0) ? sp.specialties : (sp.specialty ? [sp.specialty] : []);
                                                const initials = `${sp.first_name?.[0] || ""}${sp.last_name?.[0] || ""}`.toUpperCase() || (sp.email?.[0] || "?").toUpperCase();
                                                const fullName = `${sp.first_name || ""} ${sp.last_name || ""}`.trim() || sp.email;
                                                const shortLabel = (s: string) => {
                                                    const v = s.toLowerCase();
                                                    if (v.includes("speech")) return "SLP";
                                                    if (v.includes("occupational")) return "OT";
                                                    if (v.includes("physical")) return "PT";
                                                    if (v.includes("behavior")) return "ABA";
                                                    if (v.includes("developmental")) return "Dev. Psych";
                                                    return s;
                                                };
                                                return (
                                                    <span key={sp.id} className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 pl-1 pr-2.5 py-0.5" title={fullName}>
                                                        <span className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-800 text-[0.6rem] font-bold flex items-center justify-center">{initials}</span>
                                                        <span className="text-[0.7rem] font-bold text-indigo-800 truncate max-w-[8rem]">{fullName}</span>
                                                        {specs.length > 0 && (
                                                            <span className="text-[0.6rem] font-bold text-indigo-600 bg-white px-1 rounded">{shortLabel(specs[0])}</span>
                                                        )}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                                        <GraduationCap size={11} /> Teachers
                                    </p>
                                    {teachers.length === 0 ? (
                                        <button onClick={() => handleTeamMenuChange("TEACHER")} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                            <Plus size={12} /> Assign teacher
                                        </button>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {teachers.map(t => {
                                                const initials = `${t.first_name?.[0] || ""}${t.last_name?.[0] || ""}`.toUpperCase() || (t.email?.[0] || "?").toUpperCase();
                                                const fullName = `${t.first_name || ""} ${t.last_name || ""}`.trim() || t.email;
                                                return (
                                                    <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 pl-1 pr-2.5 py-0.5">
                                                        <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 text-[0.6rem] font-bold flex items-center justify-center">{initials}</span>
                                                        <span className="text-[0.7rem] font-bold text-emerald-800 truncate max-w-[8rem]">{fullName}</span>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                                        <FileCheck2 size={11} /> Latest document
                                    </p>
                                    {!latestDoc ? (
                                        <button onClick={() => handleReportMenuChange("generator")} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                            <Plus size={12} /> Generate document
                                        </button>
                                    ) : (
                                        <button onClick={() => handleReportMenuChange("history")} className="text-left">
                                            <p className="text-sm font-bold text-slate-800 m-0">{latestDoc.type}</p>
                                            <p className="text-[0.7rem] font-semibold text-slate-500 m-0">{formatDocumentDateTime(latestDoc.created_at)}</p>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                    </div>
                </div>
            </>
        );
    };

    // 1. FORMS WORKSPACE RENDERER
    const renderFormsWorkspace = () => {
        const currentTabConf = visibleFormTabs.find(t => t.id === activeFormTab);
        const currentStatus = formStatuses[activeFormTab];
        const isStudentEnrolled = studentStatus?.toUpperCase() === "ENROLLED";
        const assessmentTabs = user?.role === "PARENT"
            ? visibleFormTabs.filter(tab => tab.id === "parent_assessment")
            : user?.role === "TEACHER"
                ? visibleFormTabs.filter(tab => tab.id === "sped_assessment")
                : visibleFormTabs.filter(tab => ["parent_assessment", "multi_assessment", "sped_assessment"].includes(tab.id));
        const progressTabs = user?.role === "PARENT"
            ? visibleFormTabs.filter(tab => tab.id === "parent_tracker")
            : user?.role === "SPECIALIST"
                ? visibleFormTabs.filter(tab => tab.id === "multi_tracker")
                : user?.role === "TEACHER"
                    ? visibleFormTabs.filter(tab => tab.id === "sped_tracker")
                    : visibleFormTabs.filter(tab => ["parent_tracker", "multi_tracker", "sped_tracker"].includes(tab.id));
        const isAdminAssessmentLocked = user?.role === "ADMIN" && ["parent_assessment", "multi_assessment", "sped_assessment"].includes(activeFormTab) && !currentStatus?.submitted;
        const isAdminProgressLocked = user?.role === "ADMIN" && ["parent_tracker", "multi_tracker", "sped_tracker"].includes(activeFormTab) && !isStudentEnrolled;
        const completedAssessmentAppointment = assessmentAppointments.find(appointment => appointment.status === "COMPLETED");
        const scheduledAssessmentAppointment = assessmentAppointments.find(appointment => appointment.status === "SCHEDULED");
        const isSpecialistAssessmentLocked = user?.role === "SPECIALIST" && activeFormTab === "multi_assessment" && !completedAssessmentAppointment;
        const isSpecialistProgressLocked = user?.role === "SPECIALIST" && activeFormTab === "multi_tracker" && !isStudentEnrolled;
        const isTeacherProgressLocked = user?.role === "TEACHER" && activeFormTab === "sped_tracker" && !isStudentEnrolled;
        const isParentProgressLocked = user?.role === "PARENT" && activeFormTab === "parent_tracker" && !isStudentEnrolled;
        const isSpecialistOnboardingLocked = user?.role === "SPECIALIST" && specialistOnboardingIncomplete && ["multi_assessment", "multi_tracker"].includes(activeFormTab);
        const canCreateCurrentForm =
            !isAdminAssessmentLocked && !isAdminProgressLocked && !isSpecialistAssessmentLocked && !isSpecialistProgressLocked && !isTeacherProgressLocked && !isParentProgressLocked && !isSpecialistOnboardingLocked && !currentStatus?.submitted && (
                (user?.role === "SPECIALIST" && ["multi_assessment", "multi_tracker"].includes(activeFormTab)) ||
                (user?.role === "TEACHER" && activeFormTab === "sped_tracker") ||
                (user?.role === "PARENT" && ["parent_tracker"].includes(activeFormTab))
            );

        const currentTabLabel = currentTabConf?.label || "Form";
        const formsStatusInfo = STATUS_COLORS[studentStatus?.toUpperCase()] || { bg: "#f1f5f9", color: "#475569", label: studentStatus };

        return (
            <>
                <div className="w-full md:w-60 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                    <div className="px-5 py-4 border-b border-slate-200">
                        <h1 className="text-xl font-extrabold text-slate-900 m-0 leading-tight tracking-tight" title={studentName}>{studentName}</h1>
                        {studentStatus && (
                            <span style={{
                                display: "inline-block", marginTop: 8,
                                fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px",
                                padding: "3px 9px", borderRadius: "999px",
                                background: STATUS_COLORS[studentStatus?.toUpperCase()]?.bg || "#f1f5f9",
                                color: STATUS_COLORS[studentStatus?.toUpperCase()]?.color || "#475569",
                            }}>
                                {STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                        {assessmentTabs.length > 0 && (
                            <div className="px-3 mb-4">
                                <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">{user?.role === "PARENT" ? "Your Input" : "Assessments"}</p>
                                <div className="flex flex-col gap-1">
                                    {assessmentTabs.map((tab) => {
                                        const isSub = formStatuses[tab.id]?.submitted;
                                        const isActive = activeFormTab === tab.id;
                                        const isLocked = (user?.role === "ADMIN" && !isSub) || (user?.role === "SPECIALIST" && tab.id === "multi_assessment" && isSpecialistAssessmentLocked);
                                        return (
                                            <button key={tab.id} onClick={() => !isLocked && handleFormTabChange(tab.id)} disabled={isLocked} title={isLocked ? user?.role === "SPECIALIST" ? "Available after completed assessment session" : "Available after submission" : undefined} className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg transition-all border ${isLocked ? 'border-transparent text-slate-400 cursor-not-allowed opacity-70' : isActive ? 'bg-indigo-50 border-indigo-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}>
                                                {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                                <span className={`text-sm font-bold truncate ${isLocked ? 'text-slate-400' : isActive ? 'text-indigo-800' : 'text-slate-700'}`}>{user?.role === "PARENT" && tab.id === "parent_assessment" ? "About Your Child" : tab.label}</span>
                                                {isLocked ? (
                                                    <Lock className="w-4 h-4 text-slate-400 shrink-0 ml-2" aria-hidden="true" />
                                                ) : isSub && <Check className="w-4 h-4 text-emerald-500 shrink-0 ml-2" strokeWidth={3} aria-hidden="true" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="px-3 pb-4">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">{user?.role === "PARENT" ? "Monthly Updates" : "Progress Trackers"}</p>
                            <div className="flex flex-col gap-1">
                                {progressTabs.map((tab) => {
                                    const isSub = formStatuses[tab.id]?.submitted;
                                    const isActive = activeFormTab === tab.id;
                                    const isLocked = (user?.role === "ADMIN" && !isStudentEnrolled) || (["SPECIALIST", "TEACHER", "PARENT"].includes(user?.role || "") && !isStudentEnrolled);
                                    return (
                                        <button key={tab.id} onClick={() => !isLocked && handleFormTabChange(tab.id)} disabled={isLocked} title={isLocked ? "Available after enrollment" : undefined} className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg transition-all border ${isLocked ? 'border-transparent text-slate-400 cursor-not-allowed opacity-70' : isActive ? 'bg-emerald-50 border-emerald-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}>
                                            {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-emerald-500 rounded-r"></div>}
                                            <span className={`text-sm font-bold truncate ${isLocked ? 'text-slate-400' : isActive ? 'text-emerald-800' : 'text-slate-700'}`}>{user?.role === "PARENT" && tab.id === "parent_tracker" ? "Home Update" : tab.label}</span>
                                            {isLocked ? (
                                                <Lock className="w-4 h-4 text-slate-400 shrink-0 ml-2" aria-hidden="true" />
                                            ) : isSub && <Check className="w-4 h-4 text-emerald-500 shrink-0 ml-2" strokeWidth={3} aria-hidden="true" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-white relative overflow-y-auto flex flex-col">
                    {tabBar}
                    <div className="flex-1 overflow-y-auto">
                    {specialistOnboardingIncomplete && (
                        <div className="px-5 pt-5 md:px-6 md:pt-6">
                            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="m-0 text-sm font-bold text-amber-950">Complete your profile setup</p>
                                    <p className="m-0 text-sm text-amber-800">{specialistOnboardingMessage(user?.specialist_onboarding_missing)}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => router.push("/specialist-onboarding")}
                                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700"
                                >
                                    Finish setup
                                </button>
                            </div>
                        </div>
                    )}
                    {(user?.role === "SPECIALIST" || user?.role === "ADMIN") && (
                        <div className="p-5 md:p-6 pb-0">
                            <AssessmentSchedulingPanel
                                user={user}
                                studentId={studentId}
                                compact
                                onChanged={() => setProfileRefreshKey(key => key + 1)}
                            />
                        </div>
                    )}
                    {isAdminAssessmentLocked ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-1">Assessment Locked</h3>
                            <p className="text-sm text-slate-500 max-w-sm">This assessment will be available for admin review after it is submitted.</p>
                        </div>
                    ) : isSpecialistAssessmentLocked ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center mb-4 text-indigo-500">
                                <Calendar className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-1">Assessment Not Ready Yet</h3>
                            <p className="text-sm text-slate-500 max-w-md">
                                {scheduledAssessmentAppointment
                                    ? `This form unlocks after the scheduled session on ${formatDocumentDateTime(scheduledAssessmentAppointment.start_at)} is marked complete by admin.`
                                    : "This form unlocks after a parent books an assessment slot and admin marks the session complete."}
                            </p>
                            {!scheduledAssessmentAppointment && (
                                <button
                                    type="button"
                                    onClick={() => router.push("/schedule")}
                                    className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
                                >
                                    Open My Schedule
                                </button>
                            )}
                        </div>
                    ) : isSpecialistOnboardingLocked ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-amber-50 border border-amber-100 rounded-full flex items-center justify-center mb-4 text-amber-500">
                                <Calendar className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-1">Finish profile setup first</h3>
                            <p className="text-sm text-slate-500 max-w-md">{specialistOnboardingMessage(user?.specialist_onboarding_missing)}</p>
                            <button
                                type="button"
                                onClick={() => router.push("/specialist-onboarding")}
                                className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700"
                            >
                                Open setup
                            </button>
                        </div>
                    ) : isAdminProgressLocked ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-1">Progress Locked</h3>
                            <p className="text-sm text-slate-500 max-w-sm">Progress trackers are available after the student is enrolled.</p>
                        </div>
                    ) : isSpecialistProgressLocked || isTeacherProgressLocked ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-1">Progress Locked</h3>
                            <p className="text-sm text-slate-500 max-w-sm">{user?.role === "TEACHER" ? "Teacher progress" : "Specialist progress"} can be submitted after the student is enrolled.</p>
                        </div>
                    ) : isParentProgressLocked ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-1">Nothing to do here yet</h3>
                            <p className="text-sm text-slate-500 max-w-sm">Any progress tracking items will appear here once your child is fully enrolled. If you haven't yet, please fill out the parent assessment from the dashboard.</p>
                        </div>
                    ) : canCreateCurrentForm ? (
                        <div className="w-full">
                            {activeFormTab === "parent_assessment" ? (
                                <ParentFormContent propHideNavigation={true} propStudentId={studentId as string} propOnSubmitted={handleEmbeddedFormSubmitted} />
                            ) : (
                                <FormEntryContent propType={currentTabConf?.formType as string} propHideNavigation={true} propStudentId={studentId as string} propOnSubmitted={handleEmbeddedFormSubmitted} />
                            )}
                        </div>
                    ) : !currentStatus?.submitted ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-1">Form Not Submitted</h3>
                            <p className="text-sm text-slate-500 max-w-sm">No completed submission exists yet for {currentTabConf?.label}.</p>
                        </div>
                    ) : (
                        <div className="w-full">
                            {activeFormTab === "parent_assessment" ? (
                                <ParentFormContent propMode="view" propHideNavigation={true} propStudentId={studentId as string} propSubmissionId={currentStatus.id?.toString()} />
                            ) : (
                                <FormEntryContent propType={currentTabConf?.formType as string} propMode="view" propHideNavigation={true} propStudentId={studentId as string} propSubmissionId={currentStatus.id?.toString()} />
                            )}
                        </div>
                    )}
                    </div>
                </div>
            </>
        );
    };

    // 2. REPORTS WORKSPACE RENDERER
    const renderReportsWorkspace = () => {
        const hasDocs = docs.length > 0;
        const iepDocs = docs.filter(d => d.type === "IEP");
        const monthlyDocs = docs.filter(d => d.type === "MONTHLY");
        const reportView = user?.role === "ADMIN"
            ? activeReportView
            : activeReportView === "generator"
                ? (hasDocs ? (docs[0].type === "MONTHLY" ? "monthly" : "iep") : "empty")
                : activeReportView;
        const selectedDocId = reportView === "iep" || reportView === "monthly"
            ? (activeDocId || docs[0]?.id?.toString())
            : undefined;
        const isGenerator = reportView === "generator";
        const isEmptyState = reportView === "empty";
        const reportsStatusInfo = STATUS_COLORS[studentStatus?.toUpperCase()] || { bg: "#f1f5f9", color: "#475569", label: studentStatus };
        const activeReportLabel = isGenerator
            ? "Report Generator"
            : reportView === "iep"
                ? (user?.role === "PARENT" ? "Current IEP" : "IEP Master")
                : reportView === "monthly"
                    ? (user?.role === "PARENT" ? "Monthly Report" : "Progress Report")
                    : "Reports";

        return (
            <>
                <div className="w-full md:w-60 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                    <div className="px-5 py-4 border-b border-slate-200">
                        <h1 className="text-xl font-extrabold text-slate-900 m-0 leading-tight tracking-tight" title={studentName}>{studentName}</h1>
                        {studentStatus && (
                            <span style={{
                                display: "inline-block", marginTop: 8,
                                fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px",
                                padding: "3px 9px", borderRadius: "999px",
                                background: STATUS_COLORS[studentStatus?.toUpperCase()]?.bg || "#f1f5f9",
                                color: STATUS_COLORS[studentStatus?.toUpperCase()]?.color || "#475569",
                            }}>
                                {STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                        {user?.role === "ADMIN" && (
                            <div className="px-4 mb-6">
                                <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3">Actions</p>
                                <button onClick={() => handleReportMenuChange("generator")} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm border ${isGenerator ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'}`}>
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                    Report Generator
                                </button>
                            </div>
                        )}

                        <div className="px-3 mb-6">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">{user?.role === "PARENT" ? "Learning Plans" : "IEP Documents"}</p>
                            {iepDocs.length === 0 ? (
                                <p className="text-xs text-slate-400 italic px-2">No IEPs generated yet.</p>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    {iepDocs.map((doc, idx) => {
                                        const isActive = reportView === "iep" && selectedDocId === doc.id.toString();
                                        const isLatest = idx === 0;
                                        return (
                                            <button key={doc.id} onClick={() => handleReportMenuChange("iep", doc.id.toString())} className={`w-full flex flex-col text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-indigo-50 border-indigo-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}>
                                                {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                                <div className="flex justify-between items-center w-full">
                                                    <span className={`text-sm font-bold truncate ${isActive ? 'text-indigo-800' : 'text-slate-700'}`}>{user?.role === "PARENT" ? "Current IEP" : "IEP Master"}</span>
                                                    {isLatest && <span className="text-[0.6rem] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded ml-2 shrink-0">Current</span>}
                                                </div>
                                                <span className="text-xs text-slate-500 truncate mt-0.5">{formatDocumentDateTime(doc.created_at)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="px-3 pb-4">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">{user?.role === "PARENT" ? "Monthly Reports" : "Monthly Progress"}</p>
                            {monthlyDocs.length === 0 ? (
                                <p className="text-xs text-slate-400 italic px-2">No monthly reports yet.</p>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    {monthlyDocs.map((doc, idx) => {
                                        const isActive = reportView === "monthly" && selectedDocId === doc.id.toString();
                                        const isLatest = idx === 0;
                                        return (
                                            <button key={doc.id} onClick={() => handleReportMenuChange("monthly", doc.id.toString())} className={`w-full flex flex-col text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-emerald-50 border-emerald-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}>
                                                {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-emerald-500 rounded-r"></div>}
                                                <div className="flex justify-between items-center w-full">
                                                    <span className={`text-sm font-bold truncate ${isActive ? 'text-emerald-800' : 'text-slate-700'}`}>{user?.role === "PARENT" ? "Monthly Report" : "Progress Report"}</span>
                                                    {isLatest && <span className="text-[0.6rem] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded ml-2 shrink-0">Latest</span>}
                                                </div>
                                                <span className="text-xs text-slate-500 truncate mt-0.5">{formatDocumentDateTime(doc.created_at)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-white relative overflow-y-auto flex flex-col">
                    {tabBar}
                    <div className="flex-1 overflow-y-auto">
                        {isGenerator && (
                            <AdminReportsContent propStudentId={studentId as string} propHideNavigation={true} propWorkspacePath="/workspace" />
                        )}
                        {reportView === "iep" && selectedDocId && (
                            <IEPViewerContent propId={selectedDocId} propHideNavigation={true} />
                        )}
                        {reportView === "monthly" && selectedDocId && (
                            <MonthlyReportContent propId={selectedDocId} propHideNavigation={true} />
                        )}
                        {isEmptyState && (
                            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                                <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                                </div>
                                <h3 className="text-lg font-bold text-slate-700 mb-1">No Reports Yet</h3>
                                <p className="text-sm text-slate-500 max-w-sm">There are no reports or documents associated with this student yet.</p>
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    };

    // 3. PARENT UNIFIED WORKSPACE RENDERER
    const renderParentUnifiedWorkspace = () => {
        const isStudentEnrolled = studentStatus?.toUpperCase() === "ENROLLED";
        const trackerStatus = formStatuses?.parent_tracker;
        const assessmentStatus = formStatuses?.parent_assessment;
        const iepDocs = docs.filter(d => d.type === "IEP");
        const monthlyDocs = docs.filter(d => d.type === "MONTHLY");
        
        // Determine which panel is active from URL params
        const viewParam = searchParams.get("view");
        const docIdParam = searchParams.get("docId");
        let parentActivePanel = viewParam === "iep" ? "iep" : viewParam === "monthly" ? "monthly" : viewParam === "tracker" ? "tracker" : viewParam === "assessment" ? "assessment" : null;
        
        if (!parentActivePanel) {
            parentActivePanel = (!isStudentEnrolled && !assessmentStatus?.submitted) ? "assessment" : "tracker";
        }

        const handleParentPanelChange = (panel: string, docId?: string) => {
            const url = new URL(window.location.href);
            url.searchParams.delete("workspace");
            url.searchParams.delete("tab");
            url.searchParams.set("view", panel);
            if (docId) {
                url.searchParams.set("docId", docId);
            } else {
                url.searchParams.delete("docId");
            }
            router.push(url.pathname + url.search);
        };

        // Tracker form rendering logic
        const trackerTabConf = TABS.find(t => t.id === "parent_tracker");
        const isParentTrackerLocked = !isStudentEnrolled;
        const canCreateTracker = isStudentEnrolled && !trackerStatus?.submitted;

        const renderTrackerContent = () => {
            if (isParentTrackerLocked) {
                return (
                    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                        <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                        </div>
                        <h3 className="text-lg font-bold text-slate-700 mb-1">Nothing to do here yet</h3>
                        <p className="text-sm text-slate-500 max-w-sm">Monthly updates will appear here once your child is fully enrolled. If you haven&apos;t yet, please fill out the parent assessment from the dashboard.</p>
                    </div>
                );
            }
            if (canCreateTracker) {
                return (
                    <div className="w-full">
                        <FormEntryContent propType={trackerTabConf?.formType as string} propHideNavigation={true} propStudentId={studentId as string} propOnSubmitted={handleEmbeddedFormSubmitted} />
                    </div>
                );
            }
            if (trackerStatus?.submitted) {
                return (
                    <div className="w-full">
                        <FormEntryContent propType={trackerTabConf?.formType as string} propMode="view" propHideNavigation={true} propStudentId={studentId as string} propSubmissionId={trackerStatus.id?.toString()} />
                    </div>
                );
            }
            return (
                <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                    <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 mb-1">No Update Submitted</h3>
                    <p className="text-sm text-slate-500 max-w-sm">No monthly home update has been submitted for this cycle yet.</p>
                </div>
            );
        };

        // Assessment form rendering logic
        const renderAssessmentContent = () => {
            if (assessmentStatus?.submitted) {
                return (
                    <div className="w-full">
                        <ParentFormContent propMode="view" propHideNavigation={true} propStudentId={studentId as string} propSubmissionId={assessmentStatus.id?.toString()} />
                    </div>
                );
            }
            return (
                <div className="w-full">
                    <ParentFormContent propHideNavigation={true} propStudentId={studentId as string} propOnSubmitted={handleEmbeddedFormSubmitted} />
                </div>
            );
        };

        // Get parent-friendly status label
        const getParentStatusLabel = () => {
            const normalized = studentStatus?.toUpperCase().replace(/ /g, "_");
            if (normalized === "PENDING_ASSESSMENT") return formStatuses?.parent_assessment?.submitted ? "Awaiting Review" : "Action Needed";
            if (normalized === "ASSESSMENT_SCHEDULED") return "Under Evaluation";
            if (normalized === "ASSESSED") return "Evaluation Complete";
            return STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus;
        };

        return (
            <>
                {/* Unified Sidebar */}
                <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-2xl font-extrabold text-slate-900 m-0 leading-tight truncate tracking-tight" title={studentName}>{studentName}</h2>
                        {studentStatus && (
                            <span style={{
                                display: "inline-block", marginTop: 10,
                                fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
                                padding: "4px 10px", borderRadius: "999px",
                                background: STATUS_COLORS[studentStatus?.toUpperCase()]?.bg || "#f1f5f9",
                                color: STATUS_COLORS[studentStatus?.toUpperCase()]?.color || "#475569",
                            }}>
                                {getParentStatusLabel()}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto py-5 custom-scrollbar">
                        {/* Your Input section */}
                        <div className="px-4 mb-6">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Your Input</p>
                            <div className="flex flex-col gap-1">
                                <button
                                    onClick={() => handleParentPanelChange("assessment")}
                                    className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg transition-all border ${parentActivePanel === "assessment" ? 'bg-indigo-50 border-indigo-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}
                                >
                                    {parentActivePanel === "assessment" && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                    <span className={`text-sm font-bold truncate ${parentActivePanel === "assessment" ? 'text-indigo-800' : 'text-slate-700'}`}>About Your Child</span>
                                    {assessmentStatus?.submitted && <Check className="w-4 h-4 text-emerald-500 shrink-0 ml-2" aria-hidden="true" strokeWidth={3} />}
                                </button>
                            </div>
                        </div>

                        {/* Monthly Updates section */}
                        <div className="px-4 mb-6">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Monthly Updates</p>
                            <div className="flex flex-col gap-1">
                                <button
                                    onClick={() => !isParentTrackerLocked && handleParentPanelChange("tracker")}
                                    disabled={isParentTrackerLocked}
                                    title={isParentTrackerLocked ? "Available after enrollment" : undefined}
                                    className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg transition-all border ${isParentTrackerLocked ? 'border-transparent text-slate-400 cursor-not-allowed opacity-70' : parentActivePanel === "tracker" ? 'bg-emerald-50 border-emerald-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}
                                >
                                    {parentActivePanel === "tracker" && !isParentTrackerLocked && <div className="absolute left-0 top-2 bottom-2 w-1 bg-emerald-500 rounded-r"></div>}
                                    <span className={`text-sm font-bold truncate ${isParentTrackerLocked ? 'text-slate-400' : parentActivePanel === "tracker" ? 'text-emerald-800' : 'text-slate-700'}`}>Home Update</span>
                                    {isParentTrackerLocked ? (
                                        <Lock className="w-4 h-4 text-slate-400 shrink-0 ml-2" aria-hidden="true" />
                                    ) : trackerStatus?.submitted && <Check className="w-4 h-4 text-emerald-500 shrink-0 ml-2" aria-hidden="true" strokeWidth={3} />}
                                </button>
                            </div>
                        </div>

                        {/* Learning Plans section */}
                        <div className="px-4 mb-6">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Learning Plans</p>
                            {iepDocs.length === 0 ? (
                                <p className="text-xs text-slate-400 italic px-2">No learning plans generated yet.</p>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    {iepDocs.map((doc, idx) => {
                                        const isActive = parentActivePanel === "iep" && docIdParam === doc.id.toString();
                                        const isLatest = idx === 0;
                                        return (
                                            <button key={doc.id} onClick={() => handleParentPanelChange("iep", doc.id.toString())} className={`w-full flex flex-col text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-indigo-50 border-indigo-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}>
                                                {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                                <div className="flex justify-between items-center w-full">
                                                    <span className={`text-sm font-bold truncate ${isActive ? 'text-indigo-800' : 'text-slate-700'}`}>Current IEP</span>
                                                    {isLatest && <span className="text-[0.6rem] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded ml-2 shrink-0">Current</span>}
                                                </div>
                                                <span className="text-xs text-slate-500 truncate mt-0.5">{formatDocumentDateTime(doc.created_at)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Monthly Reports section */}
                        <div className="px-4 pb-4">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Monthly Reports</p>
                            {monthlyDocs.length === 0 ? (
                                <p className="text-xs text-slate-400 italic px-2">No monthly reports yet.</p>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    {monthlyDocs.map((doc, idx) => {
                                        const isActive = parentActivePanel === "monthly" && docIdParam === doc.id.toString();
                                        const isLatest = idx === 0;
                                        return (
                                            <button key={doc.id} onClick={() => handleParentPanelChange("monthly", doc.id.toString())} className={`w-full flex flex-col text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-emerald-50 border-emerald-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}>
                                                {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-emerald-500 rounded-r"></div>}
                                                <div className="flex justify-between items-center w-full">
                                                    <span className={`text-sm font-bold truncate ${isActive ? 'text-emerald-800' : 'text-slate-700'}`}>Monthly Report</span>
                                                    {isLatest && <span className="text-[0.6rem] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded ml-2 shrink-0">Latest</span>}
                                                </div>
                                                <span className="text-xs text-slate-500 truncate mt-0.5">{formatDocumentDateTime(doc.created_at)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 bg-white relative overflow-y-auto">
                    {studentId && user?.role !== "TEACHER" && (
                        <div className="p-5 md:p-6 pb-0">
                            <AssessmentSchedulingPanel
                                user={user}
                                studentId={studentId}
                                compact
                                onChanged={() => setProfileRefreshKey(key => key + 1)}
                            />
                        </div>
                    )}
                    {parentActivePanel === "assessment" && renderAssessmentContent()}
                    {parentActivePanel === "tracker" && renderTrackerContent()}
                    {parentActivePanel === "iep" && docIdParam && (
                        <IEPViewerContent propId={docIdParam} propHideNavigation={true} />
                    )}
                    {parentActivePanel === "monthly" && docIdParam && (
                        <MonthlyReportContent propId={docIdParam} propHideNavigation={true} />
                    )}
                    {parentActivePanel === "iep" && !docIdParam && iepDocs.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-1">No Learning Plans Yet</h3>
                            <p className="text-sm text-slate-500 max-w-sm">Your child&apos;s individualized learning plan will appear here once it&apos;s been created by the team.</p>
                        </div>
                    )}
                    {parentActivePanel === "monthly" && !docIdParam && monthlyDocs.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-1">No Monthly Reports Yet</h3>
                            <p className="text-sm text-slate-500 max-w-sm">Monthly progress reports will appear here as they are generated by the team.</p>
                        </div>
                    )}
                </div>
            </>
        );
    };

    // 3. TEAM WORKSPACE RENDERER
    const renderTeamWorkspace = () => {
        const isSpecialist = activeTeamRole === "SPECIALIST";
        const isTeacher = activeTeamRole === "TEACHER";
        const list = staffList.filter(s => s.role === activeTeamRole);
        const assignedRoleStaff = assignedStaff.filter(s => s.role === activeTeamRole);
        const assignedIds = assignedRoleStaff.map(s => s.id);
        const searchTerm = specialistSearch.trim().toLowerCase();
        const assignedSpecialistBySpecialty: Record<string, any> = {};

        const studentLangs = Array.isArray(studentDetails?.primary_language) 
            ? studentDetails.primary_language.map((l: string) => l.toUpperCase()) 
            : (studentDetails?.primary_language ? [studentDetails.primary_language.toUpperCase()] : []);

        const renderStaffLanguages = (langs: string[]) => {
            if (!langs || langs.length === 0) return null;
            const visibleLangs = langs.slice(0, 2);
            const hiddenCount = langs.length - 2;

            return (
                <>
                    <span className="text-[0.5rem] text-slate-300">●</span>
                    <p className="m-0 text-[0.7rem] font-medium uppercase tracking-widest text-slate-500 flex flex-wrap items-center gap-1" title={langs.join(", ")}>
                        {visibleLangs.map((lang, idx) => {
                            const isMatch = studentLangs.includes(lang.toUpperCase());
                            return (
                                <span key={idx} className="flex items-center">
                                    <span className={isMatch ? "bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold" : ""}>
                                        {lang}
                                    </span>
                                    {idx < visibleLangs.length - 1 && <span>,</span>}
                                </span>
                            );
                        })}
                        {hiddenCount > 0 && <span>+{hiddenCount}</span>}
                    </p>
                </>
            );
        };

        if (isSpecialist) {
            assignedRoleStaff.forEach((staff) => {
                getStaffSpecialties(staff).forEach((specialty) => {
                    if (!specialty || assignedSpecialistBySpecialty[specialty]) return;
                    assignedSpecialistBySpecialty[specialty] = staff;
                });
            });
        }

        const isLocked = activeTeamRole === "SPECIALIST"
            ? !formStatuses?.parent_assessment?.submitted
            : studentStatus !== "Enrolled";

        const lockReason = activeTeamRole === "SPECIALIST"
            ? "Waiting on Parent Input"
            : "Waiting for Enrollment";

        const specialtyGroups = isSpecialist
            ? SPECIALIST_SPECIALTIES.map((specialty) => {
                const assignedForSpecialty = assignedSpecialistBySpecialty[specialty];
                const candidates = list
                    .filter((staff) => getStaffSpecialties(staff).includes(specialty))
                    .filter((staff) => !searchTerm || getStaffName(staff).toLowerCase().includes(searchTerm))
                    .sort((a, b) => {
                        const aAssigned = assignedForSpecialty?.id === a.id ? 0 : 1;
                        const bAssigned = assignedForSpecialty?.id === b.id ? 0 : 1;
                        if (aAssigned !== bAssigned) return aAssigned - bAssigned;

                        const aRecommended = a.recommended_for?.includes(specialty) ? 0 : 1;
                        const bRecommended = b.recommended_for?.includes(specialty) ? 0 : 1;
                        if (aRecommended !== bRecommended) return aRecommended - bRecommended;

                        const aCaseload = typeof a.caseload === "number" ? a.caseload : Number.MAX_SAFE_INTEGER;
                        const bCaseload = typeof b.caseload === "number" ? b.caseload : Number.MAX_SAFE_INTEGER;
                        if (aCaseload !== bCaseload) return aCaseload - bCaseload;

                        return getStaffName(a).localeCompare(getStaffName(b));
                    });

                return { specialty, assignedForSpecialty, candidates };
            })
            : [];

        return (
            <>
                <div className="w-full md:w-60 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                    <div className="px-5 py-4 border-b border-slate-200">
                        <h1 className="text-xl font-extrabold text-slate-900 m-0 leading-tight tracking-tight" title={studentName}>{studentName}</h1>
                        {studentStatus && (
                            <span style={{
                                display: "inline-block", marginTop: 8,
                                fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px",
                                padding: "3px 9px", borderRadius: "999px",
                                background: STATUS_COLORS[studentStatus?.toUpperCase()]?.bg || "#f1f5f9",
                                color: STATUS_COLORS[studentStatus?.toUpperCase()]?.color || "#475569",
                            }}>
                                {STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                        <div className="px-3">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Clinical Team</p>
                            <div className="flex flex-col gap-1">
                                <button onClick={() => handleTeamMenuChange("SPECIALIST")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all border ${isSpecialist ? 'bg-indigo-50 text-indigo-800 border-indigo-200 shadow-sm relative' : 'border-transparent text-slate-700 hover:bg-slate-100'}`}>
                                    {isSpecialist && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                    <svg className="w-5 h-5 shrink-0 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                    Specialists
                                </button>
                                <button onClick={() => handleTeamMenuChange("TEACHER")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all border ${isTeacher ? 'bg-indigo-50 text-indigo-800 border-indigo-200 shadow-sm relative' : 'border-transparent text-slate-700 hover:bg-slate-100'}`}>
                                    {isTeacher && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                    <svg className="w-5 h-5 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                    Teachers
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-white relative overflow-y-auto flex flex-col">
                    {tabBar}
                    <div className="flex-1 overflow-y-auto p-5 md:p-6">
                        <div className="mb-5">
                            <h2 className="text-lg font-bold text-slate-900 m-0">{isSpecialist ? "Assign Specialists by Discipline" : "Available Teachers"}</h2>
                            <p className="text-sm text-slate-500 mt-1">
                                {isSpecialist
                                    ? "Pick one specialist for each required discipline. Multi-specialty staff appear in every group they can cover."
                                    : "Select staff members to assign to this student's caseload."}
                            </p>

                            {isLocked && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 shadow-sm">
                                    <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                    <div>
                                        <p className="text-sm font-bold text-red-800">Assignment Locked</p>
                                        <p className="text-xs text-red-700 mt-0.5">
                                            {isSpecialist
                                                ? `${lockReason}. Specialty assignments unlock after the Parent Assessment is submitted.`
                                                : `${lockReason}. Staff cannot be assigned until prerequisite conditions are met.`}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {isSpecialist ? (
                            !isLocked && (
                                <div className="space-y-6">
                                    <div className="max-w-md relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                        <input
                                            type="text"
                                            value={specialistSearch}
                                            onChange={(e) => setSpecialistSearch(e.target.value)}
                                            placeholder="Search specialists by name..."
                                            className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                                        {SPECIALIST_SPECIALTIES.map((specialty) => {
                                            const assignedForSpecialty = assignedSpecialistBySpecialty[specialty];
                                            const isCovered = Boolean(assignedForSpecialty);
                                            return (
                                                <div
                                                    key={specialty}
                                                    className={`rounded-xl border px-4 py-3 ${isCovered ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-slate-50"}`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className={`text-xs font-extrabold uppercase tracking-wider ${isCovered ? "text-indigo-700" : "text-slate-500"}`}>
                                                            {specialtyShortLabel(specialty as any)}
                                                        </span>
                                                        <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${isCovered ? "bg-white text-indigo-700" : "bg-white text-slate-500"}`}>
                                                            {isCovered ? "Assigned" : "Open"}
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-sm font-bold text-slate-900 leading-tight">{specialty}</p>
                                                    <p className={`mt-1 text-xs ${isCovered ? "text-indigo-700" : "text-slate-500"}`}>
                                                        {isCovered ? getStaffName(assignedForSpecialty) : "No specialist assigned yet"}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                        {specialtyGroups.map(({ specialty, assignedForSpecialty, candidates }) => (
                                            <section key={specialty} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                                                <div className="border-b border-slate-100 px-4 py-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <h3 className="m-0 text-lg font-bold text-slate-900">{specialty}</h3>
                                                                <span className={`rounded-full px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-wider ${assignedForSpecialty ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                                                                    {assignedForSpecialty ? "Assigned" : "Unassigned"}
                                                                </span>
                                                            </div>
                                                            <p className="mt-1 text-sm text-slate-500">
                                                                {assignedForSpecialty
                                                                    ? `${getStaffName(assignedForSpecialty)} currently covers this discipline.`
                                                                    : "Choose the specialist for this discipline."}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="p-4 space-y-3">
                                                    {candidates.length === 0 ? (
                                                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                                                            <p className="text-sm font-medium text-slate-500">No matching specialists for this specialty.</p>
                                                        </div>
                                                    ) : candidates.map((staff) => {
                                                        const staffName = getStaffName(staff);
                                                        const staffSpecialties = getStaffSpecialties(staff);
                                                        const assignedRecord = assignedRoleStaff.find((assigned) => assigned.id === staff.id);
                                                        const assignedSpecialtiesForStaff = assignedRecord ? getStaffSpecialties(assignedRecord) : [];
                                                        const isAssignedForThisSpecialty = assignedForSpecialty?.id === staff.id;
                                                        const alreadyAssigned = assignedIds.includes(staff.id);
                                                        const isLoading = assigning === staff.id;
                                                        const nextSpecialties = alreadyAssigned
                                                            ? Array.from(new Set([...assignedSpecialtiesForStaff, specialty]))
                                                            : [specialty];
                                                        const isDisabled = isLoading || (!!assignedForSpecialty && !isAssignedForThisSpecialty);

                                                        return (
                                                            <div
                                                                key={`${specialty}-${staff.id}`}
                                                                className={`rounded-xl border p-4 transition-all ${
                                                                    isAssignedForThisSpecialty
                                                                        ? "border-indigo-300 bg-indigo-50"
                                                                        : assignedForSpecialty
                                                                            ? "border-slate-200 bg-slate-50 opacity-75"
                                                                            : "border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm"
                                                                }`}
                                                            >
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                            <p className={`m-0 truncate text-sm font-bold ${isAssignedForThisSpecialty ? "text-indigo-800" : "text-slate-900"}`}>
                                                                                {staffName}
                                                                            </p>
                                                                            {staff.recommended_for?.includes(specialty) && (
                                                                                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-amber-800">
                                                                                    Match
                                                                                </span>
                                                                            )}
                                                                            {staff.preferred_for?.includes(specialty) && (
                                                                                <span className="rounded-full bg-pink-100 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-pink-800">
                                                                                    Parent Pick
                                                                                </span>
                                                                            )}
                                                                            {alreadyAssigned && !isAssignedForThisSpecialty && (
                                                                                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-emerald-800">
                                                                                    On Team
                                                                                </span>
                                                                            )}
                                                                        </div>

                                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                                            <span title={specialty} className="rounded-full border border-indigo-200 bg-indigo-600 px-2.5 py-1 text-[0.65rem] font-bold text-white">
                                                                                {specialtyShortLabel(specialty as any)}
                                                                            </span>
                                                                            {staffSpecialties
                                                                                .filter((staffSpecialty) => staffSpecialty !== specialty)
                                                                                .map((staffSpecialty) => (
                                                                                    <span
                                                                                        key={staffSpecialty}
                                                                                        title={staffSpecialty}
                                                                                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[0.65rem] font-bold text-slate-600"
                                                                                    >
                                                                                        {specialtyShortLabel(staffSpecialty as any)}
                                                                                    </span>
                                                                                ))}
                                                                        </div>

                                                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                                                            <p className="m-0 text-[0.7rem] font-medium uppercase tracking-widest text-slate-500">
                                                                                {staff.caseload} student{staff.caseload !== 1 ? "s" : ""}
                                                                            </p>
                                                                            {renderStaffLanguages(staff.languages)}
                                                                        </div>
                                                                    </div>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (isAssignedForThisSpecialty) {
                                                                                setUnassigningStaff({ id: staff.id, specialty, name: getStaffName(staff), role: "Specialist" });
                                                                            } else if (!isDisabled && !alreadyAssigned) {
                                                                                handleAssign("specialist", staff.id, nextSpecialties);
                                                                            } else if (alreadyAssigned && !isAssignedForThisSpecialty) {
                                                                                handleAssign("specialist", staff.id, nextSpecialties);
                                                                            }
                                                                        }}
                                                                        disabled={isDisabled && !isAssignedForThisSpecialty}
                                                                        title={
                                                                            isAssignedForThisSpecialty
                                                                                ? `Remove ${staffName} from ${specialty}`
                                                                                : assignedForSpecialty
                                                                                    ? `${specialty} is already covered`
                                                                                    : `Assign ${staffName} to ${specialty}`
                                                                        }
                                                                        className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                                                                            isAssignedForThisSpecialty
                                                                                ? "bg-indigo-600 text-white shadow-sm hover:bg-red-600 hover:text-white"
                                                                                : isDisabled
                                                                                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                                                                    : "bg-slate-100 text-slate-600 hover:bg-indigo-600 hover:text-white"
                                                                        }`}
                                                                    >
                                                                        {isLoading ? (
                                                                            <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                                        ) : isAssignedForThisSpecialty ? (
                                                                            <X className="w-5 h-5" />
                                                                        ) : (
                                                                            <Plus className="w-5 h-5" />
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </section>
                                        ))}
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {list.length === 0 ? (
                                    <p className="text-sm text-slate-500 italic col-span-full">No staff members found.</p>
                                ) : list.map((staff) => {
                                    const alreadyAssigned = assignedIds.includes(staff.id);
                                    const isLoading = assigning === staff.id;
                                    const isButtonDisabled = isLoading || (!alreadyAssigned && isLocked);

                                    return (
                                        <div key={staff.id} className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                                            alreadyAssigned ? "border-green-500 bg-green-50" : "border-slate-200 bg-white"
                                        }`}>
                                            <div className="min-w-0 pr-4">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className={`text-md font-bold truncate ${alreadyAssigned ? "text-green-800" : "text-slate-800"}`}>
                                                        {getStaffName(staff)}
                                                    </p>
                                                    {staff.recommended && (
                                                        <span className="text-[0.65rem] font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
                                                            ⭐ Match
                                                        </span>
                                                    )}
                                                </div>
                                                {staff.specialty && (
                                                    <p className="text-xs text-indigo-600 font-bold mb-1 truncate">{staff.specialty}</p>
                                                )}
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="m-0 text-[0.7rem] font-medium text-slate-500 uppercase tracking-widest">
                                                        {staff.caseload} student{staff.caseload !== 1 ? "s" : ""}
                                                    </p>
                                                    {renderStaffLanguages(staff.languages)}
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    if (alreadyAssigned) {
                                                        setUnassigningStaff({ id: staff.id, name: getStaffName(staff), role: "Teacher" });
                                                    } else if (!isButtonDisabled) {
                                                        handleAssign("teacher", staff.id);
                                                    }
                                                }}
                                                disabled={isButtonDisabled && !alreadyAssigned}
                                                title={alreadyAssigned ? `Remove ${getStaffName(staff)}` : `Assign ${getStaffName(staff)}`}
                                                className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-full transition-all ${
                                                    alreadyAssigned
                                                        ? "bg-indigo-600 text-white shadow-sm hover:bg-red-600 hover:text-white"
                                                        : isButtonDisabled
                                                            ? "bg-slate-100 text-slate-400 cursor-not-allowed opacity-60"
                                                            : "bg-slate-100 text-slate-600 hover:bg-indigo-600 hover:text-white"
                                                }`}
                                            >
                                                {isLoading ? (
                                                    <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                ) : alreadyAssigned ? (
                                                    <X className="w-5 h-5" />
                                                ) : (
                                                    <Plus className="w-5 h-5" />
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    };

    // 4. PROFILE WORKSPACE RENDERER
    const renderProfileWorkspace = () => {
        return (
            <div className="w-full flex-1 overflow-y-auto">
                <StudentProfileContent propStudentId={studentId as string} propHideNavigation={true} propEmbedded={true} />
            </div>
        );
    }

    const formatStatusLabel = (status?: string) => {
        if (!status) return "Unknown";
        return STATUS_COLORS[status.toUpperCase()]?.label || status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    };

    const sidebarStatuses = Array.from(
        new Set(allStudents.map(s => s.status).filter(Boolean))
    ).sort((a, b) => formatStatusLabel(a).localeCompare(formatStatusLabel(b)));

    const filteredStudents = [...allStudents].filter(s => {
        const query = studentSearch.trim().toLowerCase();
        const fullName = `${s.first_name || ""} ${s.last_name || ""}`.trim().toLowerCase();
        const matchesSearch = !query || fullName.includes(query) || formatStatusLabel(s.status).toLowerCase().includes(query);
        const matchesStatus = studentStatusFilter === "ALL" || s.status === studentStatusFilter;
        return matchesSearch && matchesStatus;
    }).sort((a, b) => {
        const aName = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase();
        const bName = `${b.first_name || ""} ${b.last_name || ""}`.trim().toLowerCase();

        if (studentSort === "az") {
            return aName.localeCompare(bName);
        }

        const aRecent = a.recent_activity_at ? new Date(a.recent_activity_at).getTime() : 0;
        const bRecent = b.recent_activity_at ? new Date(b.recent_activity_at).getTime() : 0;
        if (aRecent !== bRecent) return bRecent - aRecent;
        return aName.localeCompare(bName);
    });

    const tabBar = user?.role !== "PARENT" ? (
        <div className="flex border-b border-slate-200 shrink-0 bg-white relative z-10">
            <div className="flex-1 px-4 md:px-6 flex items-end gap-1 overflow-x-auto custom-scrollbar pt-1.5">
                {user?.role === "ADMIN" && (
                    <button onClick={() => setWorkspace("overview")} className={`px-5 py-2 text-sm font-bold border-b-2 transition-colors ${workspace === "overview" ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}>
                        Overview
                    </button>
                )}
                <button onClick={() => setWorkspace("forms")} className={`px-5 py-2 text-sm font-bold border-b-2 transition-colors ${workspace === "forms" ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}>
                    <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Forms
                </button>
                <button onClick={() => setWorkspace("reports")} className={`px-5 py-2 text-sm font-bold border-b-2 transition-colors ${workspace === "reports" ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}>
                    <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                    Reports
                </button>
                {user?.role === "ADMIN" && (
                    <button onClick={() => setWorkspace("team")} className={`px-5 py-2 text-sm font-bold border-b-2 transition-colors ${workspace === "team" ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}>
                        <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        Team
                    </button>
                )}
            </div>
        </div>
    ) : null;

    return (
        <div className="flex h-full w-full overflow-hidden relative">
                {showStudentSidebar && (
                    <>
                        {/* Student List Sidebar — fixed secondary sidebar */}
                        <div className={`hidden md:flex flex-col bg-white border-r border-slate-200 shrink-0 h-full overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 border-r-0' : 'w-56'}`}>
                            <div className="p-4 border-b border-slate-200 shrink-0 w-56">
                                <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-2">Students</p>
                                <div className="relative mb-2">
                                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={studentSearch}
                                        onChange={(e) => setStudentSearch(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                </div>
                                <div className="flex gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5 mb-2">
                                    <button
                                        type="button"
                                        title="Sort by latest activity"
                                        onClick={() => setStudentSort("recent")}
                                        className={`h-7 flex-1 rounded px-2 text-[0.65rem] font-bold transition-colors ${studentSort === "recent" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                                    >
                                        Recent
                                    </button>
                                    <button
                                        type="button"
                                        title="Sort alphabetically"
                                        onClick={() => setStudentSort("az")}
                                        className={`h-7 flex-1 rounded px-2 text-[0.65rem] font-bold transition-colors ${studentSort === "az" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                                    >
                                        A-Z
                                    </button>
                                </div>
                                <select
                                    value={studentStatusFilter}
                                    onChange={(e) => setStudentStatusFilter(e.target.value)}
                                    className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[0.7rem] font-semibold text-slate-600 outline-none focus:ring-1 focus:ring-indigo-500"
                                    aria-label="Filter students by status"
                                >
                                    <option value="ALL">All statuses</option>
                                    {sidebarStatuses.map(status => (
                                        <option key={status} value={status}>{formatStatusLabel(status)}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <div className="py-2 px-2">
                                    {filteredStudents.length === 0 ? (
                                        <p className="text-xs text-slate-400 text-center py-4">No students found.</p>
                                    ) : (
                                        filteredStudents.map(s => {
                                            const isCurrent = s.id.toString() === studentId;
                                            const dotColor: Record<string, string> = { ENROLLED: "#16a34a", ASSESSED: "#2563eb", PENDING_ASSESSMENT: "#db2777", ASSESSMENT_SCHEDULED: "#d97706", ARCHIVED: "#94a3b8" };
                                            const dot = dotColor[s.status?.toUpperCase()] || "#cbd5e1";
                                            const statusLabel = STATUS_COLORS[s.status?.toUpperCase()]?.label || s.status?.replace(/_/g, ' ');
                                            return (
                                                <button
                                                    key={s.id}
                                                    onClick={() => !isCurrent && router.push(`/workspace?studentId=${s.id}&workspace=${workspace}`)}
                                                    className={`w-full relative flex items-center gap-2.5 text-left px-3 py-2 rounded-lg transition-all mb-0.5 ${
                                                        isCurrent ? 'bg-indigo-50 border border-indigo-200 shadow-sm pl-4' : 'border border-transparent hover:bg-slate-50'
                                                    }`}
                                                    style={{ cursor: isCurrent ? 'default' : 'pointer' }}
                                                    title={`${s.first_name} ${s.last_name} — ${statusLabel}`}
                                                >
                                                    {isCurrent && (
                                                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-indigo-600" aria-hidden />
                                                    )}
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[0.6rem] font-bold shrink-0 ${isCurrent ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 text-slate-500'}`}>
                                                        {s.first_name?.[0]}{s.last_name?.[0]}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <span className={`text-xs font-semibold block truncate ${isCurrent ? 'text-indigo-800' : 'text-slate-700'}`}>
                                                            {s.first_name} {s.last_name}
                                                        </span>
                                                    </div>
                                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} title={statusLabel}></span>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                            <div className="p-3 border-t border-slate-200 bg-slate-50">
                                <p className="text-[0.6rem] text-slate-400 text-center">{filteredStudents.length} of {allStudents.length} students</p>
                            </div>
                        </div>
                    </>
                )}

                {/* Floating Toggle Button (Outside hidden overflow containers) */}
                {showStudentSidebar && (
                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className={`hidden md:flex absolute top-[1.35rem] z-[50] items-center justify-center bg-white border border-slate-200 shadow-sm rounded-full w-6 h-6 text-slate-400 hover:text-indigo-600 hover:border-indigo-400 transition-all duration-300 ${isSidebarCollapsed ? 'left-2' : 'left-[calc(14rem-12px)]'}`}
                        aria-label="Toggle Student List"
                    >
                        {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </button>
                )}

                {/* Main Workspace Area */}
                <div className="flex-1 flex flex-col min-w-0 h-full relative z-10 bg-slate-50 md:bg-white overflow-hidden">
                    <div className={`pt-2 md:pt-3 pb-2 pr-4 md:pr-8 flex-1 flex flex-col min-h-0 transition-all duration-300 ${isSidebarCollapsed ? 'pl-10 md:pl-14' : 'pl-4 md:pl-8'}`}>
                        {/* Unified Card Container */}
                        <div className="bg-white rounded-xl border border-slate-300 shadow-sm flex-1 flex flex-col overflow-hidden min-h-0">
                            
                            {/* Main Body */}
                            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 relative z-0">
                                {user?.role === "PARENT" ? renderParentUnifiedWorkspace() : workspace === "overview" && user?.role === "ADMIN" ? renderOverviewWorkspace() : workspace === "forms" ? renderFormsWorkspace() : workspace === "reports" ? renderReportsWorkspace() : workspace === "team" ? renderTeamWorkspace() : renderProfileWorkspace()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Unassign Confirmation Modal */}
                {unassigningStaff && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-6">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                        <AlertCircle className="h-6 w-6 text-red-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900">Remove {unassigningStaff.role}?</h3>
                                        <p className="text-sm text-slate-500 mt-1">
                                            Are you sure you want to remove <strong>{unassigningStaff.name}</strong> from this team?
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="flex gap-3 justify-end mt-8">
                                    <button
                                        onClick={() => setUnassigningStaff(null)}
                                        disabled={isUnassigning}
                                        className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmUnassign}
                                        disabled={isUnassigning}
                                        className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isUnassigning ? (
                                            <>
                                                <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                Removing...
                                            </>
                                        ) : (
                                            "Remove Specialist"
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {showEnrollConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 px-4">
                        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <h2 className="mb-2 text-xl font-bold text-slate-900">Enroll {studentName}?</h2>
                            <p className="mb-6 text-sm leading-6 text-slate-500">
                                This will mark the student as enrolled and unlock post-enrollment work such as progress trackers, teacher assignment, IEP, and monthly reporting.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => !enrollingStudent && setShowEnrollConfirm(false)}
                                    disabled={enrollingStudent}
                                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleEnrollStudent}
                                    disabled={enrollingStudent}
                                    className="rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {enrollingStudent ? "Enrolling..." : "Confirm Enrollment"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Custom scrollbar style for this layout */}
                <style dangerouslySetInnerHTML={{__html: `
                    .custom-scrollbar::-webkit-scrollbar {
                        width: 6px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                        background-color: #cbd5e1;
                        border-radius: 20px;
                    }
                `}} />
        </div>
    );
}

export default function UnifiedWorkspacePage() {
    return (
        <Suspense fallback={<div className="p-8 h-full flex items-center justify-center font-medium text-slate-500">Loading master workspace...</div>}>
            <ProtectedRoute allowedRoles={["ADMIN", "SPECIALIST", "TEACHER", "PARENT"]}>
                <UnifiedWorkspaceContent />
            </ProtectedRoute>
        </Suspense>
    );
}


