"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";

import { IEPViewerContent } from "@/app/admin/iep/page";
import { MonthlyReportContent } from "@/app/admin/monthly-report/page";
import { AdminReportsContent } from "@/app/admin/reports/page";

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

function UnifiedReportsViewer() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const studentId = params?.id as string;
    
    const [studentName, setStudentName] = useState("");
    const [docs, setDocs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const activeView = searchParams.get("view") || "generator";
    const activeDocId = searchParams.get("docId");

    useEffect(() => {
        if (!studentId) return;
        
        api.get(`/api/students/${studentId}/profile/`)
            .then(res => {
                const data = res.data;
                setStudentName(`${data.student.first_name} ${data.student.last_name}`);
                
                const generatedDocs = data.generated_documents?.filter((d: any) => d.has_iep_data) || [];
                // Sort docs descending by created_at
                generatedDocs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                setDocs(generatedDocs);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load profile for reports viewer", err);
                setLoading(false);
            });
    }, [studentId]);

    const handleMenuClick = (view: string, docId?: string) => {
        const url = new URL(window.location.href);
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

    const isGenerator = activeView === "generator";
    const iepDocs = docs.filter(d => d.type === "IEP");
    const monthlyDocs = docs.filter(d => d.type === "MONTHLY");

    return (
        <ProtectedRoute allowedRoles={["ADMIN", "SPECIALIST", "TEACHER", "PARENT"]}>
            <div className="max-w-7xl mx-auto pb-16 px-4 pt-4 md:pt-6">
                
                <div className="flex items-end gap-1 mb-4 border-b border-slate-300 px-2 mt-4 md:mt-0">
                    <button 
                        onClick={() => router.push(`/students/${studentId}/forms`)}
                        className="px-6 py-2.5 text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
                    >
                        <svg className="w-4 h-4 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Input Forms
                    </button>
                    <button 
                        className="px-6 py-2.5 text-sm font-bold border-b-2 border-indigo-600 text-indigo-700 transition-colors"
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
                        <div className="p-6 border-b border-slate-200">
                            <h1 className="text-xl font-bold text-slate-900 m-0 truncate" title={studentName}>{studentName}</h1>
                            <p className="text-xs text-slate-400 mt-1 mb-0 uppercase tracking-wider font-semibold">Reports Workspace</p>
                        </div>

                        {/* Navigation Menu */}
                        <div className="flex-1 overflow-y-auto py-5 custom-scrollbar">
                            
                            {/* Actions Group */}
                            <div className="px-6 mb-8">
                                <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3">Actions</p>
                                <button 
                                    onClick={() => handleMenuClick("generator")}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm border ${isGenerator ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'}`}
                                >
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                    Report Generator
                                </button>
                            </div>

                            {/* Documents Group: IEPs */}
                            <div className="px-4 mb-8">
                                <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">IEP Documents</p>
                                {iepDocs.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic px-2">No IEPs generated yet.</p>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        {iepDocs.map((doc, idx) => {
                                            const isActive = activeView === "iep" && activeDocId === doc.id.toString();
                                            const isLatest = idx === 0;
                                            return (
                                                <button 
                                                    key={doc.id}
                                                    onClick={() => handleMenuClick("iep", doc.id.toString())}
                                                    className={`w-full flex flex-col text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-indigo-50 border-indigo-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}
                                                >
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

                            {/* Documents Group: Monthly Reports */}
                            <div className="px-4 pb-4">
                                <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Monthly Progress</p>
                                {monthlyDocs.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic px-2">No monthly reports yet.</p>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        {monthlyDocs.map((doc, idx) => {
                                            const isActive = activeView === "monthly" && activeDocId === doc.id.toString();
                                            const isLatest = idx === 0;
                                            return (
                                                <button 
                                                    key={doc.id}
                                                    onClick={() => handleMenuClick("monthly", doc.id.toString())}
                                                    className={`w-full flex flex-col text-left px-4 py-3 rounded-lg transition-all border ${isActive ? 'bg-emerald-50 border-emerald-200 shadow-sm relative' : 'border-transparent hover:bg-slate-100'}`}
                                                >
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

                    {/* Right Content Area */}
                    <div className="flex-1 bg-white relative overflow-y-auto">
                        {activeView === "generator" && (
                            <AdminReportsContent propStudentId={studentId} propHideNavigation={true} />
                        )}
                        {activeView === "iep" && activeDocId && (
                            <IEPViewerContent propId={activeDocId} propHideNavigation={true} />
                        )}
                        {activeView === "monthly" && activeDocId && (
                            <MonthlyReportContent propId={activeDocId} propHideNavigation={true} />
                        )}
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
        </ProtectedRoute>
    );
}

export default function UnifiedReportsPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading reports workspace...</div>}>
            <UnifiedReportsViewer />
        </Suspense>
    );
}
