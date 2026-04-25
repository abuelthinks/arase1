"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Search } from "lucide-react";
import { specialtyShortLabel, userSpecialtyList } from "@/lib/sectionOwners";
import { SPECIALIST_SPECIALTIES } from "@/lib/specialties";
import { toast } from "sonner";

// Inputs
import { ParentFormContent } from "@/app/parent-onboarding/page";
import { FormEntryContent } from "@/app/forms/[type]/page";

// Outputs
import { IEPViewerContent } from "@/app/admin/iep/page";
import { MonthlyReportContent } from "@/app/admin/monthly-report/page";
import { AdminReportsContent } from "@/app/admin/reports/page";
import { StudentProfileContent } from "@/app/students/[id]/page";

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

function UnifiedWorkspaceContent() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    
    const studentId = params?.id as string;
    // -- Global State --
    const [allStudents, setAllStudents] = useState<any[]>([]);
    const [studentSearch, setStudentSearch] = useState("");
    const [studentName, setStudentName] = useState("");
    const [studentStatus, setStudentStatus] = useState("");
    const [studentDetails, setStudentDetails] = useState<any>(null);
    const showStudentSidebar = user?.role !== "PARENT";
    const [loading, setLoading] = useState(true);
    const [profileRefreshKey, setProfileRefreshKey] = useState(0);

    // -- Forms State --
    const [formStatuses, setFormStatuses] = useState<any>(null);
    const requestedFormTab = searchParams.get("tab");
    const visibleFormTabs = user?.role === "PARENT"
        ? TABS.filter(tab => ["parent_assessment", "parent_tracker"].includes(tab.id))
        : user?.role === "TEACHER"
            ? TABS.filter(tab => tab.id === "sped_tracker")
            : TABS;
    const activeFormTab = user?.role === "PARENT"
        ? (["parent_assessment", "parent_tracker"].includes(requestedFormTab || "") ? requestedFormTab! : "parent_assessment")
        : user?.role === "TEACHER"
            ? (requestedFormTab === "sped_tracker" ? requestedFormTab : "sped_tracker")
            : requestedFormTab || "parent_assessment";
    
    // -- Reports State --
    const [docs, setDocs] = useState<any[]>([]);
    const activeReportView = searchParams.get("view") || "generator";
    const activeDocId = searchParams.get("docId");

    // -- Team State --
    const [assignedStaff, setAssignedStaff] = useState<any[]>([]);
    const [staffList, setStaffList] = useState<any[]>([]);
    const [assigning, setAssigning] = useState<number | null>(null);
    const [specialistSearch, setSpecialistSearch] = useState("");
    const [sendingParentReminder, setSendingParentReminder] = useState(false);
    const [showEnrollConfirm, setShowEnrollConfirm] = useState(false);
    const [enrollingStudent, setEnrollingStudent] = useState(false);
    const activeTeamRole = searchParams.get("teamRole") || "SPECIALIST";
    const normalizedStudentStatus = studentStatus?.toUpperCase();

    // -- Master Tab Switcher --
    // Tracks whether we are rendering the forms workspace or reports workspace
    const workspace = searchParams.get("workspace") || (user?.role === "ADMIN" ? "overview" : "forms");


    useEffect(() => {
        api.get("/api/students/").then(res => setAllStudents(res.data)).catch(console.error);
    }, []);

    useEffect(() => {
        if (!studentId) return;
        
        api.get(`/api/students/${studentId}/profile/`)
            .then(res => {
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
            .catch(err => {
                console.error("Failed to load profile for workspace", err);
                setLoading(false);
            });
    }, [studentId, profileRefreshKey]);

    useEffect(() => {
        if (!studentId || user?.role !== "ADMIN") return;
        api.get(`/api/staff/?student_id=${studentId}`).then(res => setStaffList(res.data)).catch(console.error);
    }, [studentId, user?.role]);

    // -- Handlers --
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

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Loading workspace...</div>;
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
        const actions: { title: string; label: string; onClick: () => void; tone?: "warning" | "positive" }[] = [];

        if (!formStatuses?.parent_assessment?.submitted) {
            actions.push({ title: "Parent assessment missing", label: sendingParentReminder ? "Sending..." : "Remind", onClick: handleParentAssessmentReminder, tone: "warning" });
        }
        if (formStatuses?.parent_assessment?.submitted && specialists.length === 0) {
            actions.push({ title: "Assign specialist", label: "Open Team", onClick: () => handleTeamMenuChange("SPECIALIST") });
        }
        if (normalizedStudentStatus === "ASSESSED") {
            actions.push({ title: `Enroll ${compactStudentName()}?`, label: "Enroll", onClick: () => setShowEnrollConfirm(true), tone: "positive" });
        }
        if (["ASSESSED", "ENROLLED"].includes(normalizedStudentStatus || "") && !latestIep) {
            actions.push({ title: "Generate IEP", label: "Open Reports", onClick: () => handleReportMenuChange("generator") });
        }
        if (canGenerateMonthlyReport) {
            actions.push({ title: "Generate Monthly Progress Report", label: "Open Reports", onClick: () => handleReportMenuChange("generator"), tone: "positive" });
        }
        if (normalizedStudentStatus === "ENROLLED" && teachers.length === 0) {
            actions.push({ title: "Assign teacher", label: "Open Team", onClick: () => handleTeamMenuChange("TEACHER"), tone: "warning" });
        }
        if (normalizedStudentStatus === "ENROLLED" && pendingTrackers.length > 0) {
            actions.push({ title: `${pendingTrackers.length} tracker${pendingTrackers.length === 1 ? "" : "s"} pending`, label: "Open Forms", onClick: () => setWorkspace("forms") });
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

        return (
            <>
                <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                    <div className="p-6 border-b border-slate-200 flex flex-col gap-1">
                        <h1 className="text-xl font-bold text-slate-900 m-0 truncate" title={studentName}>{studentName}</h1>
                        {studentStatus && (
                            <span style={{
                                fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
                                padding: "2px 8px", borderRadius: "999px", width: "fit-content",
                                background: STATUS_COLORS[studentStatus?.toUpperCase()]?.bg || "#f1f5f9",
                                color: STATUS_COLORS[studentStatus?.toUpperCase()]?.color || "#475569"
                            }}>
                                {STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus}
                            </span>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto py-5 custom-scrollbar">
                        <div className="px-4">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Admin Overview</p>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-lg border border-slate-200 bg-white p-3">
                                    <p className="text-lg font-bold text-slate-900">{actions.length}</p>
                                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">Actions</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-3">
                                    <p className="text-lg font-bold text-slate-900">{submittedForms}/5</p>
                                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">Forms</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-3">
                                    <p className="text-lg font-bold text-slate-900">{docs.length}</p>
                                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">Docs</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-3">
                                    <p className="text-lg font-bold text-slate-900">{assignedStaff.length}</p>
                                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">Team</p>
                                </div>
                            </div>
                            <button onClick={() => router.push(`/students/${studentId}`)} className="mt-4 w-full rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50">
                                Open Full Profile
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-white relative overflow-y-auto p-5 md:p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <section className="rounded-xl border border-slate-200 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-base font-bold text-slate-900">Action Queue</h2>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{actions.length} active</span>
                            </div>
                            {actions.length === 0 ? (
                                <p className="text-sm text-slate-500">No urgent admin follow-ups.</p>
                            ) : (
                                <div className="flex flex-col gap-1.5">
                                    {actions.map(action => (
                                        <div key={action.title} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${action.tone === "warning" ? "border-amber-200 bg-amber-50" : action.tone === "positive" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                                            <p className="text-sm font-bold text-slate-800">{action.title}</p>
                                            <button onClick={action.onClick} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                                                {action.label}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="rounded-xl border border-slate-200 p-4">
                            <h2 className="text-base font-bold text-slate-900 mb-3">Student Snapshot</h2>
                            <div className="grid grid-cols-1 gap-2">
                                {profileRows.map(row => (
                                    <div key={row.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
                                        <span className="text-sm font-semibold text-slate-500">{row.label}</span>
                                        <span className="text-sm font-bold text-slate-800 text-right">{row.value}</span>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-xl border border-slate-200 p-4 lg:col-span-2">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-base font-bold text-slate-900">Recent Activity</h2>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{recentActivity.length} recorded</span>
                            </div>
                            {recentActivity.length === 0 ? (
                                <p className="text-sm text-slate-500">No recorded form or document activity yet.</p>
                            ) : (
                                <div className="max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                                        {recentActivity.map((item: any) => (
                                            <div key={item.id} className="flex items-center gap-3 bg-white px-3 py-2.5 hover:bg-slate-50">
                                                <span className={`h-2 w-2 shrink-0 rounded-full ${item.tone === "document" ? "bg-indigo-500" : "bg-emerald-500"}`} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="m-0 truncate text-sm font-bold text-slate-800">{item.title}</p>
                                                    <p className="m-0 truncate text-xs font-semibold text-slate-500">{item.meta}</p>
                                                </div>
                                                <span className="shrink-0 text-xs font-semibold text-slate-400">{formatActivityTime(item.timestamp)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="rounded-xl border border-slate-200 p-4">
                            <h2 className="text-base font-bold text-slate-900 mb-3">Parent</h2>
                            <div className="grid grid-cols-1 gap-2">
                                {parentRows.map(row => (
                                    <div key={row.label} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                                        <span className="text-sm font-semibold text-slate-500">{row.label}</span>
                                        {row.href ? (
                                            <a href={row.href} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 truncate">{row.value}</a>
                                        ) : (
                                            <span className="text-sm font-bold text-slate-800 text-right truncate">{row.value}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-xl border border-slate-200 p-4">
                            <h2 className="text-base font-bold text-slate-900 mb-3">Team & Documents</h2>
                            <div className="grid grid-cols-1 gap-2">
                                <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                                    <span className="text-sm font-semibold text-slate-500">Specialists</span>
                                    <span className="text-sm font-bold text-slate-800 text-right truncate">{staffNames(specialists)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                                    <span className="text-sm font-semibold text-slate-500">Teachers</span>
                                    <span className="text-sm font-bold text-slate-800 text-right truncate">{staffNames(teachers)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                                    <span className="text-sm font-semibold text-slate-500">Latest document</span>
                                    <span className="text-sm font-bold text-slate-800 text-right">{latestDoc ? `${latestDoc.type} ${formatDocumentDateTime(latestDoc.created_at)}` : "None"}</span>
                                </div>
                            </div>
                        </section>
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
        const isSpecialistProgressLocked = user?.role === "SPECIALIST" && activeFormTab === "multi_tracker" && !isStudentEnrolled;
        const isTeacherProgressLocked = user?.role === "TEACHER" && activeFormTab === "sped_tracker" && !isStudentEnrolled;
        const canCreateCurrentForm =
            !isAdminAssessmentLocked && !isAdminProgressLocked && !isSpecialistProgressLocked && !isTeacherProgressLocked && !currentStatus?.submitted && (
                (user?.role === "SPECIALIST" && ["multi_assessment", "multi_tracker"].includes(activeFormTab)) ||
                (user?.role === "TEACHER" && activeFormTab === "sped_tracker") ||
                (user?.role === "PARENT" && ["parent_assessment", "parent_tracker"].includes(activeFormTab))
            );

        return (
            <>
                <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                    <div className="p-6 border-b border-slate-200 flex flex-col gap-1">
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 m-0 truncate" title={studentName}>{studentName}</h1>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {studentStatus && (
                                <span style={{
                                    fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
                                    padding: "2px 8px", borderRadius: "999px",
                                    background: STATUS_COLORS[studentStatus?.toUpperCase()]?.bg || "#f1f5f9",
                                    color: STATUS_COLORS[studentStatus?.toUpperCase()]?.color || "#475569"
                                }}>
                                    {STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto py-5 custom-scrollbar">
                        {assessmentTabs.length > 0 && (
                            <div className="px-4 mb-4">
                                <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Assessments</p>
                                <div className="flex flex-col gap-1">
                                    {assessmentTabs.map((tab) => {
                                        const isSub = formStatuses[tab.id]?.submitted;
                                        const isActive = activeFormTab === tab.id;
                                        const isLocked = user?.role === "ADMIN" && !isSub;
                                        return (
                                            <button key={tab.id} onClick={() => !isLocked && handleFormTabChange(tab.id)} disabled={isLocked} title={isLocked ? "Available after submission" : undefined} className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg transition-all border ${isLocked ? 'border-transparent text-slate-400 cursor-not-allowed opacity-70' : isActive ? 'bg-indigo-50 border-indigo-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}>
                                                {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                                <span className={`text-sm font-bold truncate ${isLocked ? 'text-slate-400' : isActive ? 'text-indigo-800' : 'text-slate-700'}`}>{tab.label}</span>
                                                {isLocked ? (
                                                    <svg className="w-4 h-4 text-slate-400 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                                ) : isSub && <svg className="w-4 h-4 text-emerald-500 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="px-4 pb-4">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Progress Trackers</p>
                            <div className="flex flex-col gap-1">
                                {progressTabs.map((tab) => {
                                    const isSub = formStatuses[tab.id]?.submitted;
                                    const isActive = activeFormTab === tab.id;
                                    const isLocked = (user?.role === "ADMIN" && !isStudentEnrolled) || (["SPECIALIST", "TEACHER"].includes(user?.role || "") && !isStudentEnrolled);
                                    return (
                                        <button key={tab.id} onClick={() => !isLocked && handleFormTabChange(tab.id)} disabled={isLocked} title={isLocked ? "Available after enrollment" : undefined} className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg transition-all border ${isLocked ? 'border-transparent text-slate-400 cursor-not-allowed opacity-70' : isActive ? 'bg-emerald-50 border-emerald-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}>
                                            {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-emerald-500 rounded-r"></div>}
                                            <span className={`text-sm font-bold truncate ${isLocked ? 'text-slate-400' : isActive ? 'text-emerald-800' : 'text-slate-700'}`}>{tab.label}</span>
                                            {isLocked ? (
                                                <svg className="w-4 h-4 text-slate-400 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                            ) : isSub && <svg className="w-4 h-4 text-emerald-500 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-white relative overflow-y-auto">
                    {isAdminAssessmentLocked ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-1">Assessment Locked</h3>
                            <p className="text-sm text-slate-500 max-w-sm">This assessment will be available for admin review after it is submitted.</p>
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
                    ) : canCreateCurrentForm ? (
                        <div className="w-full">
                            {activeFormTab === "parent_assessment" ? (
                                <ParentFormContent propHideNavigation={true} propStudentId={studentId} propOnSubmitted={handleEmbeddedFormSubmitted} />
                            ) : (
                                <FormEntryContent propType={currentTabConf?.formType as string} propHideNavigation={true} propStudentId={studentId} propOnSubmitted={handleEmbeddedFormSubmitted} />
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
                                <ParentFormContent propMode="view" propHideNavigation={true} propStudentId={studentId} propSubmissionId={currentStatus.id?.toString()} />
                            ) : (
                                <FormEntryContent propType={currentTabConf?.formType as string} propMode="view" propHideNavigation={true} propStudentId={studentId} propSubmissionId={currentStatus.id?.toString()} />
                            )}
                        </div>
                    )}
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

        return (
            <>
                <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                    <div className="p-6 border-b border-slate-200 flex flex-col gap-1">
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 m-0 truncate" title={studentName}>{studentName}</h1>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {studentStatus && (
                                <span style={{
                                    fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
                                    padding: "2px 8px", borderRadius: "999px",
                                    background: STATUS_COLORS[studentStatus?.toUpperCase()]?.bg || "#f1f5f9",
                                    color: STATUS_COLORS[studentStatus?.toUpperCase()]?.color || "#475569"
                                }}>
                                    {STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto py-5 custom-scrollbar">
                        {user?.role === "ADMIN" && (
                            <div className="px-6 mb-8">
                                <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3">Actions</p>
                                <button onClick={() => handleReportMenuChange("generator")} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm border ${isGenerator ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'}`}>
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                    Report Generator
                                </button>
                            </div>
                        )}

                        <div className="px-4 mb-8">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">IEP Documents</p>
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
                                                    <span className={`text-sm font-bold truncate ${isActive ? 'text-indigo-800' : 'text-slate-700'}`}>IEP Master</span>
                                                    {isLatest && <span className="text-[0.6rem] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded ml-2 shrink-0">Current</span>}
                                                </div>
                                                <span className="text-xs text-slate-500 truncate mt-0.5">{formatDocumentDateTime(doc.created_at)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="px-4 pb-4">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Monthly Progress</p>
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
                                                    <span className={`text-sm font-bold truncate ${isActive ? 'text-emerald-800' : 'text-slate-700'}`}>Progress Report</span>
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

                <div className="flex-1 bg-white relative overflow-y-auto">
                    {isGenerator && (
                        <AdminReportsContent propStudentId={studentId} propHideNavigation={true} propWorkspacePath={`/students/${studentId}/workspace`} />
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
        const normalizedSpecialistSearch = specialistSearch.trim().toLowerCase();
        const assignedSpecialistBySpecialty: Record<string, any> = {};
        if (isSpecialist) {
            assignedRoleStaff.forEach(staff => {
                getStaffSpecialties(staff).forEach((specialty) => {
                    if (!specialty) return;
                    if (!assignedSpecialistBySpecialty[specialty]) {
                        assignedSpecialistBySpecialty[specialty] = staff;
                    }
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
                    .filter((staff) => {
                        if (!normalizedSpecialistSearch) return true;
                        return getStaffName(staff).toLowerCase().includes(normalizedSpecialistSearch);
                    })
                    .sort((a, b) => {
                        const aAssigned = assignedForSpecialty?.id === a.id ? 0 : 1;
                        const bAssigned = assignedForSpecialty?.id === b.id ? 0 : 1;
                        if (aAssigned !== bAssigned) return aAssigned - bAssigned;

                        const aRecommended = a.recommended ? 0 : 1;
                        const bRecommended = b.recommended ? 0 : 1;
                        if (aRecommended !== bRecommended) return aRecommended - bRecommended;

                        const aCaseload = typeof a.caseload === "number" ? a.caseload : Number.MAX_SAFE_INTEGER;
                        const bCaseload = typeof b.caseload === "number" ? b.caseload : Number.MAX_SAFE_INTEGER;
                        if (aCaseload !== bCaseload) return aCaseload - bCaseload;

                        return getStaffName(a).localeCompare(getStaffName(b));
                    });

                return {
                    specialty,
                    assignedForSpecialty,
                    candidates,
                };
            })
            : [];

        return (
            <>
                <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                    <div className="p-6 border-b border-slate-200 flex flex-col gap-1">
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 m-0 truncate" title={studentName}>{studentName}</h1>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {studentStatus && (
                                <span style={{
                                    fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
                                    padding: "2px 8px", borderRadius: "999px",
                                    background: STATUS_COLORS[studentStatus?.toUpperCase()]?.bg || "#f1f5f9",
                                    color: STATUS_COLORS[studentStatus?.toUpperCase()]?.color || "#475569"
                                }}>
                                    {STATUS_COLORS[studentStatus?.toUpperCase()]?.label || studentStatus}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto py-5 custom-scrollbar">
                        <div className="px-4">
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

                <div className="flex-1 bg-white relative overflow-y-auto p-6 md:p-8">
                    <div className="mb-6 mb-8 border-b border-slate-200 pb-4">
                        <h2 className="text-xl font-bold text-slate-900">{isSpecialist ? "Assign Specialists by Discipline" : "Available Teachers"}</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            {isSpecialist
                                ? "Pick one specialist for each required discipline. Multi-specialty staff appear in every group they can cover."
                                : "Select staff members to assign to this student's caseload."}
                        </p>
                        
                        {isLocked && (
                            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
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
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div className="max-w-md">
                                    <div className="relative">
                                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search specialists by name..."
                                            value={specialistSearch}
                                            onChange={(e) => setSpecialistSearch(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                                    {SPECIALIST_SPECIALTIES.map((specialty) => {
                                        const assignedForSpecialty = assignedSpecialistBySpecialty[specialty];
                                        const isCovered = Boolean(assignedForSpecialty);
                                        return (
                                            <div
                                                key={specialty}
                                                className={`rounded-xl border px-4 py-3 ${
                                                    isCovered
                                                        ? "border-indigo-200 bg-indigo-50"
                                                        : "border-slate-200 bg-slate-50"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-xs font-extrabold uppercase tracking-wider ${isCovered ? "text-indigo-700" : "text-slate-500"}`}>
                                                        {specialtyShortLabel(specialty as any)}
                                                    </span>
                                                    <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${
                                                        isCovered ? "bg-white text-indigo-700" : "bg-white text-slate-500"
                                                    }`}>
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
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                {specialtyGroups.map(({ specialty, assignedForSpecialty, candidates }) => (
                                    <section key={specialty} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                                        <div className="border-b border-slate-100 px-4 py-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h3 className="m-0 text-base font-bold text-slate-900">{specialty}</h3>
                                                        <span className={`rounded-full px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-wider ${
                                                            assignedForSpecialty
                                                                ? "bg-indigo-100 text-indigo-700"
                                                                : "bg-slate-100 text-slate-500"
                                                        }`}>
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
                                                const isDisabled = isLoading || isLocked || (!!assignedForSpecialty && !isAssignedForThisSpecialty);

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
                                                                    {staff.recommended && (
                                                                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-amber-800">
                                                                            Match
                                                                        </span>
                                                                    )}
                                                                    {alreadyAssigned && !isAssignedForThisSpecialty && (
                                                                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-emerald-800">
                                                                            On Team
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                                    <span
                                                                        title={specialty}
                                                                        className="rounded-full border border-indigo-200 bg-indigo-600 px-2.5 py-1 text-[0.65rem] font-bold text-white"
                                                                    >
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

                                                                <p className="mt-3 text-[0.7rem] font-medium uppercase tracking-widest text-slate-500">
                                                                    {staff.caseload} student{staff.caseload !== 1 ? "s" : ""}
                                                                </p>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() => !isDisabled && !isAssignedForThisSpecialty && handleAssign("specialist", staff.id, nextSpecialties)}
                                                                disabled={isDisabled || isAssignedForThisSpecialty}
                                                                title={
                                                                    isAssignedForThisSpecialty
                                                                        ? `${staffName} is assigned for ${specialty}`
                                                                        : assignedForSpecialty
                                                                            ? `${specialty} is already covered`
                                                                            : `Assign ${staffName} to ${specialty}`
                                                                }
                                                                className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                                                                    isAssignedForThisSpecialty
                                                                        ? "bg-indigo-100 text-indigo-700"
                                                                        : isDisabled
                                                                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                                                            : "bg-slate-100 text-slate-600 hover:bg-indigo-600 hover:text-white"
                                                                }`}
                                                            >
                                                                {isLoading ? (
                                                                    <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                                ) : isAssignedForThisSpecialty ? (
                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                                                ) : (
                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
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
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {list.length === 0 ? (
                            <p className="text-sm text-slate-500 italic col-span-full">No staff members found.</p>
                        ) : list.map(s => {
                            const alreadyAssigned = assignedIds.includes(s.id);
                            const isLoading = assigning === s.id;
                            const isButtonDisabled = isLoading || (!alreadyAssigned && isLocked);

                            return (
                                <div key={s.id} className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                                    alreadyAssigned ? "border-green-500 bg-green-50" : "border-slate-200 bg-white"
                                }`}>
                                    <div className="min-w-0 pr-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className={`text-md font-bold truncate ${alreadyAssigned ? "text-green-800" : "text-slate-800"}`}>{getStaffName(s)}</p>
                                            {s.recommended && (
                                                <span className="text-[0.65rem] font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
                                                    ⭐ Match
                                                </span>
                                            )}
                                        </div>
                                        {!isSpecialist && s.specialty && (
                                            <p className="text-xs text-indigo-600 font-bold mb-1 truncate">{s.specialty}</p>
                                        )}
                                        <p className="text-[0.7rem] font-medium text-slate-500 uppercase tracking-widest">
                                            {s.caseload} student{s.caseload !== 1 ? "s" : ""}
                                        </p>
                                    </div>
                                    
                                    <button 
                                        onClick={() => !alreadyAssigned && !isLoading && !isLocked && handleAssign("teacher", s.id)}
                                        disabled={isButtonDisabled}
                                        className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-full transition-all ${
                                            alreadyAssigned ? 'bg-green-100 text-green-700' : 
                                            isButtonDisabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60' : 'bg-slate-100 text-slate-600 hover:bg-indigo-600 hover:text-white'
                                        }`}
                                    >
                                        {isLoading ? (
                                            <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        ) : alreadyAssigned ? (
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                        ) : (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    )}
                </div>
            </>
        );
    };

    // 4. PROFILE WORKSPACE RENDERER
    const renderProfileWorkspace = () => {
        return (
            <div className="w-full flex-1 overflow-y-auto">
                <StudentProfileContent propStudentId={studentId} propHideNavigation={true} propEmbedded={true} />
            </div>
        );
    }

    const filteredStudents = [...allStudents].sort((a, b) => {
        const aRecent = a.recent_activity_at ? new Date(a.recent_activity_at).getTime() : 0;
        const bRecent = b.recent_activity_at ? new Date(b.recent_activity_at).getTime() : 0;
        if (aRecent !== bRecent) return bRecent - aRecent;
        const aName = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase();
        const bName = `${b.first_name || ""} ${b.last_name || ""}`.trim().toLowerCase();
        return aName.localeCompare(bName);
    }).filter(s => {
        const query = studentSearch.toLowerCase();
        return (s.first_name + " " + s.last_name).toLowerCase().includes(query) || s.status?.toLowerCase().includes(query);
    });

    return (
        <ProtectedRoute allowedRoles={["ADMIN", "SPECIALIST", "TEACHER", "PARENT"]}>
            <div className="flex h-full w-full overflow-hidden">
                {showStudentSidebar && (
                    <div className="hidden md:flex flex-col w-56 bg-white border-r border-slate-200 shrink-0 h-full">
                        <div className="p-4 border-b border-slate-200">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-2">Students</p>
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={studentSearch}
                                    onChange={(e) => setStudentSearch(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
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
                                        return (
                                            <button
                                                key={s.id}
                                                onClick={() => !isCurrent && router.push(`/students/${s.id}/workspace?workspace=${workspace}`)}
                                                className={`w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg transition-all mb-0.5 ${
                                                    isCurrent ? 'bg-indigo-50 border border-indigo-200 shadow-sm' : 'border border-transparent hover:bg-slate-50'
                                                }`}
                                                style={{ cursor: isCurrent ? 'default' : 'pointer' }}
                                            >
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[0.6rem] font-bold shrink-0 ${isCurrent ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 text-slate-500'}`}>
                                                    {s.first_name?.[0]}{s.last_name?.[0]}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <span className={`text-xs font-semibold block truncate ${isCurrent ? 'text-indigo-800' : 'text-slate-700'}`}>
                                                        {s.first_name} {s.last_name}
                                                    </span>
                                                </div>
                                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} title={s.status?.replace(/_/g, ' ')}></span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                        <div className="p-3 border-t border-slate-200 bg-slate-50">
                            <p className="text-[0.6rem] text-slate-400 text-center">{allStudents.length} students total</p>
                        </div>
                    </div>
                )}

                {/* Main Workspace Area */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-full">
                    <div className="px-4 md:px-8 pt-2 md:pt-3 flex-1 flex flex-col min-h-0">
                        {/* Master Tab Bar */}
                        <div className="flex items-end gap-1 mb-2 border-b border-slate-300 px-2 shrink-0">
                            {user?.role === "ADMIN" && (
                                <button onClick={() => setWorkspace("overview")} className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors ${workspace === "overview" ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}>
                                    Overview
                                </button>
                            )}
                            <button onClick={() => setWorkspace("forms")} className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors ${workspace === "forms" ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}>
                                <svg className="w-4 h-4 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Forms
                            </button>
                            <button onClick={() => setWorkspace("reports")} className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors ${workspace === "reports" ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}>
                                <svg className="w-4 h-4 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                                Reports
                            </button>
                            {user?.role === "ADMIN" && (
                                <button onClick={() => setWorkspace("team")} className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors ${workspace === "team" ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}>
                                    <svg className="w-4 h-4 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                    Team
                                </button>
                            )}
                        </div>

                        {/* Unified Card Container */}
                        <div className="bg-white rounded-xl border border-slate-300 shadow-sm flex-1 mb-2 flex flex-col md:flex-row overflow-hidden min-h-0">
                            {workspace === "overview" && user?.role === "ADMIN" ? renderOverviewWorkspace() : workspace === "forms" ? renderFormsWorkspace() : workspace === "reports" ? renderReportsWorkspace() : workspace === "team" ? renderTeamWorkspace() : renderProfileWorkspace()}
                        </div>
                    </div>
                </div>

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
        </ProtectedRoute>
    );
}

export default function UnifiedWorkspacePage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading master workspace...</div>}>
            <UnifiedWorkspaceContent />
        </Suspense>
    );
}
