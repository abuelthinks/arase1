"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

// Import components
import { ParentFormContent } from "@/app/parent-onboarding/page";
import { FormEntryContent } from "@/app/forms/[type]/page";

const TABS = [
    { id: "parent_assessment", label: "Parent Assessment", formType: null },
    { id: "multi_assessment", label: "Specialist Assessment", formType: "multidisciplinary-assessment" },
    { id: "parent_tracker", label: "Parent Progress", formType: "parent-tracker" },
    { id: "multi_tracker", label: "Specialist Progress", formType: "multidisciplinary-tracker" },
    { id: "sped_tracker", label: "Teacher Progress", formType: "sped-tracker" }
];

export default function UnifiedFormsViewer() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    
    const studentId = params?.id as string;
    
    // Read the active tab from URL or fallback
    const defaultTab = searchParams.get("tab") || "parent_assessment";
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [studentName, setStudentName] = useState("");
    const [formStatuses, setFormStatuses] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const visibleTabs = user?.role === "PARENT"
        ? TABS.filter(tab => ["parent_assessment", "parent_tracker"].includes(tab.id))
        : user?.role === "TEACHER"
            ? TABS.filter(tab => tab.id === "sped_tracker")
            : TABS;

    useEffect(() => {
        if (!studentId) return;
        
        api.get(`/api/students/${studentId}/profile/`)
            .then(res => {
                const data = res.data;
                setStudentName(`${data.student.first_name} ${data.student.last_name}`);
                setFormStatuses(data.form_statuses);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load profile for forms viewer", err);
                setLoading(false);
            });
    }, [studentId]);

    const handleTabChange = (tabId: string) => {
        setActiveTab(tabId);
        // Build new URL
        const url = new URL(window.location.href);
        url.searchParams.set("tab", tabId);
        router.push(url.pathname + url.search);
    };

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Loading forms...</div>;
    }

    if (!formStatuses) {
        return <div className="p-8 text-center text-red-500">Failed to load student data.</div>;
    }

    const resolvedActiveTab = visibleTabs.some(tab => tab.id === activeTab)
        ? activeTab
        : visibleTabs[0]?.id || "parent_assessment";
    const currentTabConf = visibleTabs.find(t => t.id === resolvedActiveTab);
    const currentStatus = formStatuses[resolvedActiveTab];

    return (
        <ProtectedRoute allowedRoles={["ADMIN", "SPECIALIST", "TEACHER", "PARENT"]}>
            <div className="max-w-6xl mx-auto pb-16 px-4">
                
                <div className="flex items-end gap-1 mb-4 border-b border-slate-300 px-2 mt-4 md:mt-0">
                    <button 
                        className="px-6 py-2.5 text-sm font-bold border-b-2 border-indigo-600 text-indigo-700 transition-colors"
                    >
                        <svg className="w-4 h-4 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Input Forms
                    </button>
                    <button 
                        onClick={() => router.push(`/students/${studentId}/reports`)}
                        className="px-6 py-2.5 text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
                    >
                        <svg className="w-4 h-4 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                        Reports & Documents
                    </button>
                </div>

                {/* Unified Card */}
                <div className="bg-white rounded-xl border border-slate-300 shadow-sm h-[85vh] min-h-[600px] flex flex-col md:flex-row overflow-hidden">
                    
                    {/* Left Sidebar */}
                    <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                        {/* Sidebar Header */}
                        <div className="p-6 border-b border-slate-200 flex flex-col gap-4">
                            <div>
                                <h1 className="text-xl font-bold text-slate-900 m-0 truncate" title={studentName}>{studentName}</h1>
                                <p className="text-xs text-slate-400 mt-1 mb-0 uppercase tracking-wider font-semibold">Data Collection</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button 
                                    onClick={() => router.push(`/students/${studentId}`)}
                                    className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 whitespace-nowrap"
                                >
                                    View Profile
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Navigation Menu */}
                        <div className="flex-1 overflow-y-auto py-5 custom-scrollbar">
                            
                            <div className="px-4 mb-4">
                                <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Assessments</p>
                                <div className="flex flex-col gap-1">
                                    {visibleTabs.filter(tab => ["parent_assessment", "multi_assessment"].includes(tab.id)).map((tab) => {
                                        const isSub = formStatuses[tab.id]?.submitted;
                                        const isActive = resolvedActiveTab === tab.id;
                                        return (
                                            <button 
                                                key={tab.id}
                                                onClick={() => handleTabChange(tab.id)}
                                                className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-indigo-50 border-indigo-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}
                                            >
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
                                    {visibleTabs.filter(tab => ["parent_tracker", "multi_tracker", "sped_tracker"].includes(tab.id)).map((tab) => {
                                        const isSub = formStatuses[tab.id]?.submitted;
                                        const isActive = resolvedActiveTab === tab.id;
                                        return (
                                            <button 
                                                key={tab.id}
                                                onClick={() => handleTabChange(tab.id)}
                                                className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-emerald-50 border-emerald-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}
                                            >
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

                    {/* Right Content Area */}
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
                                {resolvedActiveTab === "parent_assessment" ? (
                                    <ParentFormContent 
                                        propMode="view" 
                                        propHideNavigation={true}
                                        propStudentId={studentId} 
                                        propSubmissionId={currentStatus.id?.toString()} 
                                    />
                                ) : (
                                    <FormEntryContent 
                                        propType={currentTabConf?.formType as string}
                                        propMode="view"
                                        propHideNavigation={true}
                                        propStudentId={studentId}
                                        propSubmissionId={currentStatus.id?.toString()}
                                    />
                                )}
                            </div>
                        )}
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
