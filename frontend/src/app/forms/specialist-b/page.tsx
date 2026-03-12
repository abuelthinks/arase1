"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";

import api from "@/lib/api";

function SpecialistBFormContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const studentId = searchParams.get("studentId");
    const isViewMode = searchParams.get("mode") === "view";
    const submissionId = searchParams.get("submissionId");

    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    const [reportCycleId, setReportCycleId] = useState("1"); // Auto-detect later

    // Form schema matching "Specialist Input B.txt"
    const [formData, setFormData] = useState({
        child_information: {
            age: "",
            level: "",
            date: new Date().toISOString().split('T')[0]
        },
        service_overview: {
            sessions_attended: "0",
            type_of_special_needs: "",
            services_provided_this_week: [] as string[],
            other_services: ""
        },
        weekly_goals: [
            { id: 1, goal: "", objective: "", progress: "" },
            { id: 2, goal: "", objective: "", progress: "" },
            { id: 3, goal: "", objective: "", progress: "" }
        ],
        detailed_progress: {
            strengths_observed: "",
            areas_for_improvement: "",
            therapists_comments: ""
        }
    });

    const SERVICES = [
        "Occupational Therapy",
        "Speech and Language Therapy",
        "Physical Therapy",
        "Behavioral Therapy",
        "Academic Support"
    ];

    const handleServiceToggle = (service: string) => {
        setFormData(prev => {
            const current = prev.service_overview.services_provided_this_week;
            const updated = current.includes(service)
                ? current.filter(s => s !== service)
                : [...current, service];

            return {
                ...prev,
                service_overview: { ...prev.service_overview, services_provided_this_week: updated }
            };
        });
    };

    const handleNestedChange = (section: keyof typeof formData, field: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            [section]: {
                ...prev[section as any],
                [field]: value
            }
        }));
    };

    const handleGoalChange = (index: number, field: string, value: string) => {
        setFormData(prev => {
            const newGoals = [...prev.weekly_goals];
            newGoals[index] = { ...newGoals[index], [field]: value };
            return { ...prev, weekly_goals: newGoals };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccessMsg("");
        setErrorMsg("");

        try {
            await api.post("/api/inputs/specialist-b/", {
                student: parseInt(studentId || "0"),
                report_cycle: parseInt(reportCycleId),
                form_data: formData
            });
            setSuccessMsg("Weekly Progress Report submitted successfully!");
            setTimeout(() => router.push(`/students/${studentId}`), 1500);
        } catch (err: any) {
            setErrorMsg("Failed to submit form.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isViewMode && submissionId) {
            api.get(`/api/inputs/specialist-b/${submissionId}/`)
                .then(res => {
                    if (res.data.form_data) {
                        setFormData(res.data.form_data);
                    }
                })
                .catch(err => console.error("Failed to fetch submission:", err));
        } else if (studentId) {
            api.get(`/api/students/${studentId}/profile/`)
                .then(res => {
                    if (res.data.active_cycle) {
                        setReportCycleId(res.data.active_cycle.id.toString());
                    }
                })
                .catch(err => console.error(err));
        }
    }, [isViewMode, submissionId, studentId]);

    if (!studentId && !isViewMode) return <div className="p-8 text-center text-slate-500">Missing student context. Return to dashboard.</div>;

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-slate-50 py-12 px-4">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-white rounded-2xl shadow-sm border p-8">

                        <div className="flex justify-between items-center mb-8 border-b pb-4">
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900">
                                    {isViewMode ? "Weekly Progress Report (Specialist B) - Read Only" : "Weekly Progress Report (Specialist B)"}
                                </h1>
                                <p className="text-slate-500 mt-1">
                                    {isViewMode ? "This is a past submission and cannot be edited." : "Document weekly therapy goals, session details, and specific progress measures."}
                                </p>
                            </div>
                        </div>

                        {successMsg && <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-medium">✨ {successMsg}</div>}
                        {errorMsg && <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg">{errorMsg}</div>}

                        <form onSubmit={handleSubmit} className="space-y-10">
                            <fieldset disabled={isViewMode} className="space-y-10 data-[disabled=true]:opacity-90 group/fieldset">

                                {/* Meta Info */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-6 rounded-xl border">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Age</label>
                                        <input type="text" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                            value={formData.child_information.age} onChange={e => handleNestedChange('child_information', 'age', e.target.value)} required />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Level</label>
                                        <input type="text" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                            value={formData.child_information.level} onChange={e => handleNestedChange('child_information', 'level', e.target.value)} required />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Date</label>
                                        <input type="date" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                            value={formData.child_information.date} onChange={e => handleNestedChange('child_information', 'date', e.target.value)} required />
                                    </div>
                                </div>

                                {/* Service Overview */}
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <span className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span> Service Overview
                                    </h3>
                                    <div className="bg-white border rounded-xl p-6 space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Sessions Attended This Week</label>
                                                <input type="number" min="0" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                    value={formData.service_overview.sessions_attended} onChange={e => handleNestedChange('service_overview', 'sessions_attended', e.target.value)} required />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Type of Special Needs</label>
                                                <input type="text" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                    value={formData.service_overview.type_of_special_needs} onChange={e => handleNestedChange('service_overview', 'type_of_special_needs', e.target.value)} />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-3">Services Provided This Week</label>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {SERVICES.map(service => (
                                                    <label key={service} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition">
                                                        <input type="checkbox" className="w-5 h-5 text-blue-600 rounded"
                                                            checked={formData.service_overview.services_provided_this_week.includes(service)}
                                                            onChange={() => handleServiceToggle(service)} />
                                                        <span className="text-slate-700 font-medium">{service}</span>
                                                    </label>
                                                ))}
                                                <div className="sm:col-span-2 mt-2">
                                                    <input type="text" placeholder="Other Services..." className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                        value={formData.service_overview.other_services} onChange={e => handleNestedChange('service_overview', 'other_services', e.target.value)} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Weekly Goals */}
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <span className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span> Weekly Goals and Objectives
                                    </h3>
                                    <div className="space-y-6">
                                        {formData.weekly_goals.map((goal, index) => (
                                            <div key={goal.id} className="bg-white border rounded-xl p-6 relative">
                                                <div className="absolute top-0 right-0 bg-blue-50 text-blue-600 font-bold px-4 py-1 rounded-bl-xl rounded-tr-xl text-sm border-b border-l">
                                                    Goal {goal.id}
                                                </div>
                                                <div className="space-y-4 pt-4">
                                                    <div>
                                                        <label className="block text-sm font-bold text-slate-700 mb-2">Goal Description</label>
                                                        <input type="text" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                            value={goal.goal} onChange={e => handleGoalChange(index, 'goal', e.target.value)} placeholder={`State goal ${goal.id}...`} />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-bold text-slate-700 mb-2">Objective (Measurement)</label>
                                                        <textarea className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                            value={goal.objective} onChange={e => handleGoalChange(index, 'objective', e.target.value)} placeholder="How will this be measured?" rows={2} />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-bold text-slate-700 mb-2">Progress This Week</label>
                                                        <textarea className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-blue-50"
                                                            value={goal.progress} onChange={e => handleGoalChange(index, 'progress', e.target.value)} placeholder="Detail the child's progress towards this specific goal..." rows={3} />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Summary */}
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <span className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center text-sm">3</span> Detailed Progress Summary
                                    </h3>
                                    <div className="space-y-6 bg-white border rounded-xl p-6">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">Strengths Observed This Week</label>
                                            <textarea className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[100px]"
                                                value={formData.detailed_progress.strengths_observed} onChange={e => handleNestedChange('detailed_progress', 'strengths_observed', e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">Areas for Improvement This Week</label>
                                            <textarea className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[100px]"
                                                value={formData.detailed_progress.areas_for_improvement} onChange={e => handleNestedChange('detailed_progress', 'areas_for_improvement', e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">Overall Therapist's Comments</label>
                                            <textarea className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[120px] bg-slate-50"
                                                value={formData.detailed_progress.therapists_comments} onChange={e => handleNestedChange('detailed_progress', 'therapists_comments', e.target.value)} />
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-slate-200" />
                            </fieldset>

                            <div className="flex justify-end gap-4">
                                <button type="button" onClick={() => router.push(`/students/${studentId}`)} className="px-6 py-3 font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition">
                                    {isViewMode ? "Back to Profile" : "Cancel"}
                                </button>
                                {!isViewMode && (
                                    <button type="submit" disabled={loading} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-md transition disabled:opacity-50 flex items-center gap-2">
                                        {loading ? "Submitting..." : "Submit Weekly Progress"}
                                    </button>
                                )}
                            </div>

                        </form>
                    </div>
                </div>
            </div>
        </ProtectedRoute>
    );
}

export default function SpecialistBInputPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading form...</div>}>
            <SpecialistBFormContent />
        </Suspense>
    );
}
