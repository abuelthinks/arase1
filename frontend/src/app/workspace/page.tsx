"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

// Inputs
import { ParentFormContent } from "@/app/parent-onboarding/page";
import { FormEntryContent } from "@/app/forms/[type]/page";

// Outputs
import { IEPViewerContent } from "@/app/admin/iep/page";
import { MonthlyReportContent } from "@/app/admin/monthly-report/page";
import { AdminReportsContent } from "@/app/admin/reports/page";
import { StudentProfileContent } from "@/app/students/[id]/page";

const TABS = [
    { id: "parent_assessment", label: "Parent Assessment", formType: null },
    { id: "multi_assessment", label: "Specialist Assessment", formType: "multidisciplinary-assessment" },
    { id: "parent_tracker", label: "Parent Progress", formType: "parent-tracker" },
    { id: "multi_tracker", label: "Specialist Progress", formType: "multidisciplinary-tracker" },
    { id: "sped_tracker", label: "Teacher Progress", formType: "sped-tracker" }
];

function UnifiedWorkspaceContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    
    // -- Global State --
    const studentId = searchParams.get("studentId");
    const [allStudents, setAllStudents] = useState<any[]>([]);
    const [studentSearch, setStudentSearch] = useState("");
    const [studentName, setStudentName] = useState("");
    const [studentStatus, setStudentStatus] = useState("");
    const [loading, setLoading] = useState(true);

    // -- Forms State --
    const [formStatuses, setFormStatuses] = useState<any>(null);
    const activeFormTab = searchParams.get("tab") || "parent_assessment";
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    
    // -- Reports State --
    const [docs, setDocs] = useState<any[]>([]);
    const activeReportView = searchParams.get("view") || "generator";
    const activeDocId = searchParams.get("docId");

    // -- Team State --
    const [assignedStaff, setAssignedStaff] = useState<any[]>([]);
    const [staffList, setStaffList] = useState<any[]>([]);
    const [assigning, setAssigning] = useState<number | null>(null);
    const activeTeamRole = searchParams.get("teamRole") || "SPECIALIST";

    // -- Master Tab Switcher --
    const workspace = searchParams.get("workspace") || "forms";

    useEffect(() => {
        api.get("/api/students/").then(res => {
            setAllStudents(res.data);
            
            // If no student is explicitly active but we have students, automatically redirect to first
            if (!studentId && res.data.length > 0) {
                const url = new URL(window.location.href);
                url.searchParams.set("studentId", res.data[0].id.toString());
                router.replace(url.pathname + url.search);
            } else if (!studentId && res.data.length === 0) {
                setLoading(false); // Finished loading but no students exist
            }
        }).catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, [studentId, router]);

    useEffect(() => {
        if (!studentId) return; // Prevent fetch if no student is active
        
        api.get(`/api/students/${studentId}/profile/`)
            .then(res => {
                const data = res.data;
                setStudentName(`${data.student.first_name} ${data.student.last_name}`);
                setStudentStatus(data.student.status);
                setFormStatuses(data.form_statuses);
                setAssignedStaff(data.assigned_staff || []);
                
                const generatedDocs = data.generated_documents?.filter((d: any) => d.has_iep_data) || [];
                generatedDocs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                setDocs(generatedDocs);
                
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load profile for workspace", err);
                setLoading(false);
            });
    }, [studentId]);

    useEffect(() => {
        if (!studentId || user?.role !== "ADMIN") return;
        api.get(`/api/staff/?student_id=${studentId}`).then(res => setStaffList(res.data)).catch(console.error);
    }, [studentId, user?.role]);

    // -- Handlers --
    const handleAssign = async (type: "specialist" | "teacher", staffId: number) => {
        setAssigning(staffId);
        try {
            const endpoint = type === "specialist" ? "assign-specialist" : "assign-teacher";
            const payload = type === "specialist" ? { specialist_id: staffId } : { teacher_id: staffId };
            await api.post(`/api/students/${studentId}/${endpoint}/`, payload);
            const profileRes = await api.get(`/api/students/${studentId}/profile/`);
            setAssignedStaff(profileRes.data.assigned_staff || []);
        } catch (err: any) {
            alert(err.response?.data?.error || "Assignment failed.");
        } finally {
            setAssigning(null);
        }
    };

    const setWorkspace = (newWorkspace: string) => {
        const url = new URL(window.location.href);
        url.searchParams.set("workspace", newWorkspace);
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

    if (loading) {
        return <div className="p-8 h-full flex items-center justify-center text-slate-500">Loading workspace...</div>;
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
    
    // 1. FORMS WORKSPACE RENDERER
    const renderFormsWorkspace = () => {
        const currentTabConf = TABS.find(t => t.id === activeFormTab);
        const currentStatus = formStatuses[activeFormTab];

        return (
            <>
                <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                    <div className="p-6 border-b border-slate-200 flex flex-col gap-4">
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 m-0 truncate" title={studentName}>{studentName}</h1>
                            <p className="text-xs text-slate-400 mt-1 mb-0 uppercase tracking-wider font-semibold">Data Collection</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => router.push(`/students/${studentId}`)} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 whitespace-nowrap">
                                View Profile
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto py-5 custom-scrollbar">
                        <div className="px-4 mb-4">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Assessments</p>
                            <div className="flex flex-col gap-1">
                                {TABS.slice(0, 2).map((tab) => {
                                    const isSub = formStatuses[tab.id]?.submitted;
                                    const isActive = activeFormTab === tab.id;
                                    return (
                                        <button key={tab.id} onClick={() => handleFormTabChange(tab.id)} className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-indigo-50 border-indigo-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}>
                                            {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                            <span className={`text-sm font-bold truncate ${isActive ? 'text-indigo-800' : 'text-slate-700'}`}>{tab.label}</span>
                                            {isSub && <svg className="w-4 h-4 text-emerald-500 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="px-4 pb-4">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Progress Trackers</p>
                            <div className="flex flex-col gap-1">
                                {TABS.slice(2).map((tab) => {
                                    const isSub = formStatuses[tab.id]?.submitted;
                                    const isActive = activeFormTab === tab.id;
                                    return (
                                        <button key={tab.id} onClick={() => handleFormTabChange(tab.id)} className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-emerald-50 border-emerald-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}>
                                            {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-emerald-500 rounded-r"></div>}
                                            <span className={`text-sm font-bold truncate ${isActive ? 'text-emerald-800' : 'text-slate-700'}`}>{tab.label}</span>
                                            {isSub && <svg className="w-4 h-4 text-emerald-500 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-white relative overflow-y-auto">
                    {!currentStatus?.submitted ? (
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
            </>
        );
    };

    // 2. REPORTS WORKSPACE RENDERER
    const renderReportsWorkspace = () => {
        const isGenerator = activeReportView === "generator";
        const iepDocs = docs.filter(d => d.type === "IEP");
        const monthlyDocs = docs.filter(d => d.type === "MONTHLY");

        return (
            <>
                <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                    <div className="p-6 border-b border-slate-200 flex flex-col gap-4">
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 m-0 truncate" title={studentName}>{studentName}</h1>
                            <p className="text-xs text-slate-400 mt-1 mb-0 uppercase tracking-wider font-semibold">Reports & Outputs</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto py-5 custom-scrollbar">
                        <div className="px-6 mb-8">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3">Actions</p>
                            <button onClick={() => handleReportMenuChange("generator")} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm border ${isGenerator ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'}`}>
                                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                Report Generator
                            </button>
                        </div>

                        <div className="px-4 mb-8">
                            <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">IEP Documents</p>
                            {iepDocs.length === 0 ? (
                                <p className="text-xs text-slate-400 italic px-2">No IEPs generated yet.</p>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    {iepDocs.map((doc, idx) => {
                                        const isActive = activeReportView === "iep" && activeDocId === doc.id.toString();
                                        const isLatest = idx === 0;
                                        return (
                                            <button key={doc.id} onClick={() => handleReportMenuChange("iep", doc.id.toString())} className={`w-full flex flex-col text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-indigo-50 border-indigo-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}>
                                                {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r"></div>}
                                                <div className="flex justify-between items-center w-full">
                                                    <span className={`text-sm font-bold truncate ${isActive ? 'text-indigo-800' : 'text-slate-700'}`}>IEP Master</span>
                                                    {isLatest && <span className="text-[0.6rem] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded ml-2 shrink-0">Current</span>}
                                                </div>
                                                <span className="text-xs text-slate-500 truncate mt-0.5">{new Date(doc.created_at).toLocaleDateString()}</span>
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
                                        const isActive = activeReportView === "monthly" && activeDocId === doc.id.toString();
                                        const isLatest = idx === 0;
                                        return (
                                            <button key={doc.id} onClick={() => handleReportMenuChange("monthly", doc.id.toString())} className={`w-full flex flex-col text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-emerald-50 border-emerald-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}>
                                                {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-emerald-500 rounded-r"></div>}
                                                <div className="flex justify-between items-center w-full">
                                                    <span className={`text-sm font-bold truncate ${isActive ? 'text-emerald-800' : 'text-slate-700'}`}>Progress Report</span>
                                                    {isLatest && <span className="text-[0.6rem] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded ml-2 shrink-0">Latest</span>}
                                                </div>
                                                <span className="text-xs text-slate-500 truncate mt-0.5">{new Date(doc.created_at).toLocaleDateString()}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-white relative overflow-y-auto">
                    {activeReportView === "generator" && (
                        <AdminReportsContent propStudentId={studentId as string} propHideNavigation={true} />
                    )}
                    {activeReportView === "iep" && activeDocId && (
                        <IEPViewerContent propId={activeDocId} propHideNavigation={true} />
                    )}
                    {activeReportView === "monthly" && activeDocId && (
                        <MonthlyReportContent propId={activeDocId} propHideNavigation={true} />
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
        const assignedIds = assignedStaff.filter(s => s.role === activeTeamRole).map(s => s.id);
        
        const isLocked = activeTeamRole === "SPECIALIST" 
            ? !formStatuses?.parent_assessment?.submitted 
            : studentStatus !== "Enrolled";

        const lockReason = activeTeamRole === "SPECIALIST"
            ? "Waiting on Parent Input"
            : "Waiting for Enrollment";

        return (
            <>
                <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                    <div className="p-6 border-b border-slate-200 flex flex-col gap-4">
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 m-0 truncate" title={studentName}>{studentName}</h1>
                            <p className="text-xs text-slate-400 mt-1 mb-0 uppercase tracking-wider font-semibold">Staff Assignment</p>
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
                        <h2 className="text-xl font-bold text-slate-900">{isSpecialist ? "Available Specialists" : "Available Teachers"}</h2>
                        <p className="text-sm text-slate-500 mt-1">Select staff members to assign to this student's caseload.</p>
                        
                        {isLocked && (
                            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                                <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                <div>
                                    <p className="text-sm font-bold text-red-800">Assignment Locked</p>
                                    <p className="text-xs text-red-700 mt-0.5">{lockReason}. Staff cannot be assigned until prerequisite conditions are met.</p>
                                </div>
                            </div>
                        )}
                    </div>

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
                                            <p className={`text-md font-bold truncate ${alreadyAssigned ? "text-green-800" : "text-slate-800"}`}>
                                                {s.first_name || s.last_name ? `${s.first_name} ${s.last_name}`.trim() : s.username}
                                            </p>
                                            {s.recommended && (
                                                <span className="text-[0.65rem] font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
                                                    ⭐ Match
                                                </span>
                                            )}
                                        </div>
                                        {s.specialty && (
                                            <p className="text-xs text-indigo-600 font-bold mb-1 truncate">{s.specialty}</p>
                                        )}
                                        <p className="text-[0.7rem] font-medium text-slate-500 uppercase tracking-widest">
                                            {s.caseload} student{s.caseload !== 1 ? "s" : ""}
                                        </p>
                                    </div>
                                    
                                    <button 
                                        onClick={() => !alreadyAssigned && !isLoading && !isLocked && handleAssign(isSpecialist ? "specialist" : "teacher", s.id)}
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

    const filteredStudents = allStudents.filter(s => {
        const query = studentSearch.toLowerCase();
        return (s.first_name + " " + s.last_name).toLowerCase().includes(query) || s.status?.toLowerCase().includes(query);
    });

    return (
        <ProtectedRoute allowedRoles={["ADMIN", "SPECIALIST", "TEACHER", "PARENT"]}>
            <div className="flex h-full w-full overflow-hidden relative">
                {/* Student List Sidebar — fixed secondary sidebar */}
                <div className={`hidden md:flex flex-col bg-white border-r border-slate-200 shrink-0 h-full overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 border-r-0' : 'w-56'}`}>
                    <div className="p-4 border-b border-slate-200 shrink-0 w-56">
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
                                    const dotColor: Record<string, string> = { ENROLLED: "#22c55e", ASSESSED: "#3b82f6", PENDING_ASSESSMENT: "#f59e0b", ARCHIVED: "#94a3b8", OBSERVATION_PENDING: "#8b5cf6" };
                                    const dot = dotColor[s.status?.toUpperCase()] || "#cbd5e1";
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => !isCurrent && router.push(`/workspace?studentId=${s.id}&workspace=${workspace}`)}
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

                {/* Floating Toggle Button (Outside hidden overflow containers) */}
                <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className={`hidden md:flex absolute top-[1.35rem] z-[50] items-center justify-center bg-white border border-slate-200 shadow-sm rounded-full w-6 h-6 text-slate-400 hover:text-indigo-600 hover:border-indigo-400 transition-all duration-300 ${isSidebarCollapsed ? 'left-2' : 'left-[calc(14rem-12px)]'}`}
                    aria-label="Toggle Student List"
                >
                    {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>

                {/* Main Workspace Area */}
                <div className="flex-1 flex flex-col min-w-0 h-full relative z-10 bg-slate-50 md:bg-white overflow-hidden">
                    <div className="px-4 md:px-8 pt-4 md:pt-6 flex-1 flex flex-col min-h-0">
                        {/* Master Tab Bar */}
                        <div className="flex items-end gap-1 mb-4 border-b border-slate-300 px-2 mt-4 md:mt-0 shrink-0">
                            <button onClick={() => setWorkspace("forms")} className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors ${workspace === "forms" ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}>
                                <svg className="w-4 h-4 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Input Forms
                            </button>
                            <button onClick={() => setWorkspace("reports")} className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors ${workspace === "reports" ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}>
                                <svg className="w-4 h-4 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                                Reports & Documents
                            </button>
                            {user?.role === "ADMIN" && (
                                <button onClick={() => setWorkspace("team")} className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors ${workspace === "team" ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}>
                                    <svg className="w-4 h-4 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                    Assign Team
                                </button>
                            )}
                            <button onClick={() => setWorkspace("profile")} className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors ml-auto ${workspace === "profile" ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}>
                                <svg className="w-4 h-4 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                View Profile
                            </button>
                        </div>

                        {/* Unified Card Container */}
                        <div className="bg-white rounded-xl border border-slate-300 shadow-sm flex-1 mb-4 flex flex-col md:flex-row overflow-hidden min-h-0">
                            {workspace === "forms" ? renderFormsWorkspace() : workspace === "reports" ? renderReportsWorkspace() : workspace === "team" ? renderTeamWorkspace() : renderProfileWorkspace()}
                        </div>
                    </div>
                </div>

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
        <Suspense fallback={<div className="p-8 h-full flex items-center justify-center font-medium text-slate-500">Loading master workspace...</div>}>
            <UnifiedWorkspaceContent />
        </Suspense>
    );
}
