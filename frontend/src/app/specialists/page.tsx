"use client";

import { useEffect, useState, Suspense } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getPractitionerTitle } from "@/lib/specialties";

interface Specialist {
    id: number;
    first_name: string;
    last_name: string;
    specialty: string;
}

interface SpecialistPreference {
    id: number;
    student: number;
    specialty: string;
    specialist: number;
    specialist_name: string;
}

interface Student {
    id: number;
    first_name: string;
    last_name: string;
}

/**
 * Custom select component to avoid native <select> overlapping issues
 * and maintain consistent application styling.
 */
function CustomSelect({
    options,
    value,
    onChange,
    placeholder
}: {
    options: { id: number | ""; label: string }[];
    value: number | "";
    onChange: (val: number | "") => void;
    placeholder: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedOption = options.find(o => o.id === value);

    return (
        <div className="relative flex-1">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full text-left bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 hover:border-slate-300 transition-colors flex items-center justify-between"
            >
                <span className={!selectedOption ? "text-slate-500" : ""}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <>
                    {/* Transparent overlay to catch clicks outside */}
                    <div 
                        className="fixed inset-0 z-10" 
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(false);
                        }} 
                    />
                    
                    {/* Dropdown Menu */}
                    <div className="absolute z-20 w-full mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 max-h-60 overflow-auto">
                        {options.map((opt) => (
                            <button
                                key={opt.id === "" ? "empty" : opt.id}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange(opt.id);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                    value === opt.id
                                        ? "bg-indigo-50 text-indigo-700 font-semibold"
                                        : "text-slate-700 hover:bg-slate-50"
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function SpecialistsContent() {
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const studentId = searchParams.get("studentId");

    const [specialists, setSpecialists] = useState<Specialist[]>([]);
    const [preferences, setPreferences] = useState<SpecialistPreference[]>([]);
    const [student, setStudent] = useState<Student | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selections, setSelections] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!studentId || !user) return;

        const fetchData = async () => {
            try {
                const studentRes = await api.get(`/api/students/${studentId}/`);
                setStudent(studentRes.data);

                const specRes = await api.get("/api/specialists/");
                setSpecialists(specRes.data);

                const prefRes = await api.get(`/api/specialist-preferences/?student_id=${studentId}`);
                setPreferences(prefRes.data);

                const initialSelections: Record<string, number> = {};
                prefRes.data.forEach((pref: SpecialistPreference) => {
                    initialSelections[pref.specialty] = pref.specialist;
                });
                setSelections(initialSelections);
            } catch (err) {
                console.error("Failed to load data", err);
                alert("Failed to load specialist data.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [studentId, user]);

    const groupedSpecialists = specialists.reduce((acc, current) => {
        const specialty = current.specialty || "Other";
        if (!acc[specialty]) acc[specialty] = [];
        acc[specialty].push(current);
        return acc;
    }, {} as Record<string, Specialist[]>);

    const handleSave = async () => {
        if (!studentId) return;
        setSaving(true);
        try {
            await Promise.all(
                preferences.map(p => api.delete(`/api/specialist-preferences/${p.id}/`))
            );

            const newPrefs = [];
            for (const [specialty, specId] of Object.entries(selections)) {
                if (specId) {
                    const res = await api.post("/api/specialist-preferences/", {
                        student: Number(studentId),
                        specialty,
                        specialist: specId
                    });
                    newPrefs.push(res.data);
                }
            }

            setPreferences(newPrefs);
            alert("Preferences saved successfully!");
            router.push("/dashboard");
        } catch (error) {
            console.error(error);
            alert("Failed to save preferences.");
        } finally {
            setSaving(false);
        }
    };

    const childName = student?.first_name || "your child";
    const specialtyEntries = Object.entries(groupedSpecialists);
    const totalSpecialties = specialtyEntries.length;
    const selectedCount = Object.values(selections).filter(Boolean).length;

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Loading...</div>;
    }

    if (!student) {
        return <div className="p-8 text-center text-red-500">Student not found.</div>;
    }

    return (
        <div className="max-w-2xl mx-auto py-6 md:py-10 px-4">
            {/* Header */}
            <div className="flex items-start gap-3 mb-6">
                <Link href="/dashboard" className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors mt-1 shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </Link>
                <div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                        Who should work with {childName}?
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Tell us if you have a preference — it&apos;s completely optional.
                    </p>
                </div>
            </div>

            {/* Info callout */}
            <div className="flex items-start gap-3 p-3.5 rounded-lg border border-blue-100 mb-6" style={{ background: "#f8fbff" }}>
                <span className="text-base leading-none mt-0.5">💡</span>
                <p className="text-xs text-blue-800 leading-relaxed m-0">
                    <span className="font-semibold">No pressure!</span>{" "}
                    If you leave any specialty on &ldquo;Let us decide,&rdquo; our team will match {childName} with the best available specialist. You can update these anytime.
                </p>
            </div>

            {/* Main card - Reverted back to unified container with divide-y */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                <div className="divide-y divide-slate-100">
                    {totalSpecialties === 0 ? (
                        <p className="text-center text-slate-400 italic py-10 text-sm">No specialists are available right now.</p>
                    ) : (
                        specialtyEntries.map(([specialty, list]) => {
                            const currentSelection = selections[specialty];
                            const selectedSpec = currentSelection ? list.find(s => s.id === currentSelection) : null;
                            const practitionerTitle = getPractitionerTitle(specialty);

                            // Format options for CustomSelect
                            const selectOptions = [
                                { id: "", label: "✨ Let us decide" },
                                ...list.map(s => ({
                                    id: s.id,
                                    label: `${s.first_name} ${s.last_name}`
                                }))
                            ];

                            return (
                                <div key={specialty} className="px-5 md:px-6 py-5">
                                    {/* Specialty heading combining field dot and practitioner title */}
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block"></span>
                                        {practitionerTitle}
                                    </label>

                                    {/* Custom Dropdown + View Profile */}
                                    <div className="flex items-center gap-3">
                                        <CustomSelect 
                                            options={selectOptions as { id: number | ""; label: string }[]}
                                            value={currentSelection || ""}
                                            placeholder="✨ Let us decide"
                                            onChange={(val) => {
                                                if (val === "") {
                                                    setSelections(prev => {
                                                        const next = { ...prev };
                                                        delete next[specialty];
                                                        return next;
                                                    });
                                                } else {
                                                    setSelections(prev => ({ ...prev, [specialty]: Number(val) }));
                                                }
                                            }}
                                        />

                                        {selectedSpec && (
                                            <Link
                                                href={`/users/${selectedSpec.id}`}
                                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors whitespace-nowrap no-underline shrink-0 px-2 py-1 bg-indigo-50 rounded-md hover:bg-indigo-100"
                                            >
                                                View Profile &rarr;
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Save footer */}
                {totalSpecialties > 0 && (
                    <div className="px-5 md:px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                        <span className="text-xs text-slate-400">
                            {selectedCount} of {totalSpecialties} preference{totalSpecialties !== 1 ? "s" : ""} set
                        </span>
                        <div className="flex gap-2">
                            <button
                                disabled={saving}
                                onClick={() => router.push("/dashboard")}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={saving}
                                onClick={handleSave}
                                className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                            >
                                {saving ? "Saving..." : "Save Preferences"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function SpecialistsPage() {
    return (
        <ProtectedRoute>
            <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading...</div>}>
                <SpecialistsContent />
            </Suspense>
        </ProtectedRoute>
    );
}
