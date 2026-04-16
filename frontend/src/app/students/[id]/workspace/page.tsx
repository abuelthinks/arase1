"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// Inputs
import { ParentFormContent } from "@/app/parent-onboarding/page";
import { FormEntryContent } from "@/app/forms/[type]/page";

// Outputs
import { IEPViewerContent } from "@/app/admin/iep/page";
import { MonthlyReportContent } from "@/app/admin/monthly-report/page";
import { AdminReportsContent } from "@/app/admin/reports/page";

const TABS = [
    { id: "parent_assessment", label: "Parent Assessment", formType: null },
    { id: "multi_assessment", label: "Specialist Assessment", formType: "multidisciplinary-assessment" },
    { id: "parent_tracker", label: "Parent Progress", formType: "parent-tracker" },
    { id: "multi_tracker", label: "Specialist Progress", formType: "multidisciplinary-tracker" },
    { id: "sped_tracker", label: "Teacher Progress", formType: "sped-tracker" }
];

function UnifiedWorkspaceContent() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    
    const studentId = params?.id as string;
    
    // -- Global State --
    const [studentName, setStudentName] = useState("");
    const [loading, setLoading] = useState(true);
    
    // -- Forms State --
    const [formStatuses, setFormStatuses] = useState<any>(null);
    const activeFormTab = searchParams.get("tab") || "parent_assessment";
    
    // -- Reports State --
    const [docs, setDocs] = useState<any[]>([]);
    const activeReportView = searchParams.get("view") || "generator";
    const activeDocId = searchParams.get("docId");

    // -- Master Tab Switcher --
    // Tracks whether we are rendering the forms workspace or reports workspace
    const workspace = searchParams.get("workspace") || "forms";

    useEffect(() => {
        if (!studentId) return;
        
        api.get(`/api/students/${studentId}/profile/`)
            .then(res => {
                const data = res.data;
                setStudentName(`${data.student.first_name} ${data.student.last_name}`);
                setFormStatuses(data.form_statuses);
                
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

    // -- Navigation Helpers --
    const setWorkspace = (newWorkspace: "forms" | "reports") => {
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

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Loading workspace...</div>;
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
                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => router.push(`/students/${studentId}`)} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 whitespace-nowrap">
                                View Profile
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                            </button>
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
                        <AdminReportsContent propStudentId={studentId} propHideNavigation={true} />
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

    return (
        <ProtectedRoute allowedRoles={["ADMIN", "SPECIALIST", "TEACHER", "PARENT"]}>
            <div className="max-w-7xl mx-auto pb-16 px-4 pt-4 md:pt-6">
                
                {/* Master Tab Bar */}
                <div className="flex items-end gap-1 mb-4 border-b border-slate-300 px-2 mt-4 md:mt-0">
                    <button 
                        onClick={() => setWorkspace("forms")}
                        className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors ${
                            workspace === "forms" 
                            ? 'border-indigo-600 text-indigo-700' 
                            : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                        }`}
                    >
                        <svg className="w-4 h-4 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Input Forms
                    </button>
                    <button 
                        onClick={() => setWorkspace("reports")}
                        className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors ${
                            workspace === "reports" 
                            ? 'border-indigo-600 text-indigo-700' 
                            : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                        }`}
                    >
                        <svg className="w-4 h-4 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                        Reports & Documents
                    </button>
                </div>

                {/* Unified Card Container */}
                <div className="bg-white rounded-xl border border-slate-300 shadow-sm h-[85vh] min-h-[600px] flex flex-col md:flex-row overflow-hidden">
                    {workspace === "forms" ? renderFormsWorkspace() : renderReportsWorkspace()}
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
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading master workspace...</div>}>
            <UnifiedWorkspaceContent />
        </Suspense>
    );
}
