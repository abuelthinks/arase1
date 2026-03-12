"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";

function PreviewReportContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const studentId = searchParams.get("studentId");
    const reportCycleId = searchParams.get("cycleId");
    const docType = searchParams.get("docType");

    const [loading, setLoading] = useState(true);
    const [draftData, setDraftData] = useState<any>(null);
    const [errorMsg, setErrorMsg] = useState("");
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        if (studentId && reportCycleId && docType) {
            api.post("/api/generate-report-draft/", {
                student_id: parseInt(studentId),
                report_cycle_id: parseInt(reportCycleId),
                document_type: docType
            })
                .then(res => {
                    setDraftData(res.data.draft_data);
                })
                .catch(err => {
                    setErrorMsg(err.response?.data?.error || "Failed to load draft.");
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    }, [studentId, reportCycleId, docType]);

    const handleFieldChange = (sectionIdx: number, fieldIdx: number, newValue: string) => {
        const newData = { ...draftData };
        newData.sections[sectionIdx].fields[fieldIdx].value = newValue;
        setDraftData(newData);
    };

    const handleGenerateFinal = async () => {
        setGenerating(true);
        try {
            const res = await api.post("/api/generate-report-final/", {
                student_id: parseInt(studentId as string),
                report_cycle_id: parseInt(reportCycleId as string),
                document_type: docType,
                draft_data: draftData
            });
            window.open(res.data.file_url.replace('127.0.0.1', 'localhost'), "_blank");
            router.push(`/students/${studentId}`);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Failed to generate final report.");
            setGenerating(false);
        }
    };

    if (!studentId || !reportCycleId || !docType) {
        return <div className="p-8 text-center text-slate-500">Missing parameters.</div>;
    }

    return (
        <ProtectedRoute allowedRoles={["ADMIN"]}>
            <div className="min-h-screen bg-slate-50 py-12 px-4">
                <div className="max-w-4xl mx-auto">

                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-slate-800 mb-2 font-medium">← Back to Generator</button>
                            <h1 className="text-3xl font-bold text-slate-900">Preview & Edit Document</h1>
                            <p className="text-slate-500 mt-1">Review the AI-generated and extracted text before finalizing the PDF.</p>
                        </div>
                        <button
                            onClick={handleGenerateFinal}
                            disabled={generating || loading || !draftData}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition disabled:opacity-50"
                        >
                            {generating ? "Generating..." : "Confirm & Download PDF"}
                        </button>
                    </div>

                    {errorMsg && <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg">{errorMsg}</div>}

                    {loading ? (
                        <div className="p-12 text-center text-slate-500 bg-white rounded-2xl shadow-sm border">
                            <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Extracting data and drafting AI components...
                        </div>
                    ) : draftData && (
                        <div className="bg-white rounded-2xl shadow-sm border p-8 space-y-8">
                            <div className="border-b pb-6 text-center">
                                <h2 className="text-2xl font-bold uppercase tracking-wider text-slate-800">{draftData.title}</h2>
                            </div>

                            {draftData.sections.map((section: any, sectionIdx: number) => (
                                <div key={section.id} className="space-y-4">
                                    <h3 className="text-xl font-bold text-slate-800 border-b pb-2">{section.title}</h3>
                                    {section.description && <p className="text-sm text-slate-500 mb-2">{section.description}</p>}

                                    {section.type === 'fields' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {section.fields.map((field: any, fieldIdx: number) => (
                                                <div
                                                    key={field.name}
                                                    className={`form-group ${field.type === 'textarea' ? 'col-span-1 md:col-span-2' : ''}`}
                                                >
                                                    <label className="block text-sm font-bold text-slate-700 mb-2">{field.label}</label>

                                                    {field.type === 'textarea' ? (
                                                        <textarea
                                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[120px] bg-slate-50 font-medium text-slate-700"
                                                            value={field.value}
                                                            onChange={(e) => handleFieldChange(sectionIdx, fieldIdx, e.target.value)}
                                                        />
                                                    ) : field.type === 'select' ? (
                                                        <select
                                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50 font-medium text-slate-700"
                                                            value={field.value}
                                                            onChange={(e) => handleFieldChange(sectionIdx, fieldIdx, e.target.value)}
                                                        >
                                                            {field.options.map((opt: string) => (
                                                                <option key={opt} value={opt}>{opt || "None"}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50 font-medium text-slate-700"
                                                            value={field.value}
                                                            onChange={(e) => handleFieldChange(sectionIdx, fieldIdx, e.target.value)}
                                                        />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {section.type === 'tables' && (
                                        <div className="space-y-6">
                                            {section.tables.map((table: any, tableIdx: number) => (
                                                <div key={tableIdx} className="overflow-x-auto border rounded-xl shadow-sm">
                                                    <table className="w-full text-sm text-left">
                                                        <thead className="text-xs text-slate-500 uppercase bg-slate-100">
                                                            <tr>
                                                                {table.rows[0].map((header: string, i: number) => (
                                                                    <th key={i} className="px-4 py-3">{header}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {table.rows.slice(1).map((row: string[], rowIdx: number) => (
                                                                <tr key={rowIdx} className="border-b bg-white">
                                                                    <td className="px-4 py-3 font-medium text-slate-900 border-r bg-slate-50">{row[0]}</td>
                                                                    {row.slice(1).map((cell: string, cellIdx: number) => (
                                                                        <td key={cellIdx} className="px-4 py-3 text-center">
                                                                            {cell === "X" ? <span className="inline-flex w-5 h-5 bg-blue-100 text-blue-600 rounded-full items-center justify-center font-bold text-xs">✓</span> : ""}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}

export default function PreviewReportPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading Preview...</div>}>
            <PreviewReportContent />
        </Suspense>
    );
}
