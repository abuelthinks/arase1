"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";

// Import all JSON schemas
import parent_assessment from "@/config/forms/parentAssessmentSchema.json";
import multidisciplinary_assessment from "@/config/forms/multidisciplinaryAssessmentSchema.json";
import sped_assessment from "@/config/forms/spedAssessmentSchema.json";
import parent_tracker from "@/config/forms/parentProgressTrackerSchema.json";
import multidisciplinary_tracker from "@/config/forms/multidisciplinaryProgressTrackerSchema.json";
import sped_tracker from "@/config/forms/spedProgressTrackerSchema.json";

const schemaMap: Record<string, any> = {
    "parent-assessment": parent_assessment,
    "multidisciplinary-assessment": multidisciplinary_assessment,
    "sped-assessment": sped_assessment,
    "parent-tracker": parent_tracker,
    "multidisciplinary-tracker": multidisciplinary_tracker,
    "sped-tracker": sped_tracker,
};

/* ─── Shared UI Components ─────────────────────────────────────────────────── */

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "1.25rem" }}>
            <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>{title}</h2>
            </div>
            <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {children}
            </div>
        </div>
    );
}

function FieldLabel({ label }: { label: string }) {
    return (
        <p style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "#6366f1", marginBottom: "8px" }}>
            {label}
        </p>
    );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
    return (
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{
                width: "100%", borderRadius: "8px", border: "1px solid #e2e8f0",
                padding: "9px 12px", fontSize: "0.875rem",
                color: "#0f172a", background: "white",
                boxSizing: "border-box",
            }}
        />
    );
}

function TextAreaInput({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
    return (
        <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            style={{
                width: "100%", borderRadius: "8px", border: "1px solid #e2e8f0",
                padding: "10px 12px", fontSize: "0.875rem", resize: "vertical",
                color: "#0f172a", background: "white",
                boxSizing: "border-box",
            }}
        />
    );
}

function CheckboxItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
    return (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem", cursor: "pointer", color: "#0f172a", userSelect: "none" }}>
            <input type="checkbox" checked={checked} onChange={onChange}
                style={{ width: 16, height: 16, accentColor: "#4f46e5", cursor: "pointer" }} />
            {label}
        </label>
    );
}

function RadioGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
    return (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {options.map(opt => (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.9rem", color: "#0f172a" }}>
                    <input type="radio" checked={value === opt} onChange={() => onChange(opt)}
                        style={{ width: 16, height: 16, accentColor: "#4f46e5" }} />
                    {opt}
                </label>
            ))}
        </div>
    );
}

/* ─── Main Component ───────────────────────────────────────────────────────── */

function FormEntryContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();

    const formType = (params?.type as string) || "unknown";
    const studentId = searchParams.get("studentId");

    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [reportCycleId, setReportCycleId] = useState("1");
    const [schema, setSchema] = useState<any>(null);
    const [formData, setFormData] = useState<any>({});

    useEffect(() => {
        const loadedSchema = schemaMap[formType];
        if (loadedSchema) {
            setSchema(loadedSchema);
            const initialData: any = {};
            loadedSchema.sections?.forEach((sec: any) => {
                initialData[sec.id] = {};
                sec.fields?.forEach((f: any) => {
                    if (f.type === "checkbox_group") {
                        initialData[sec.id][f.id] = [];
                    } else if (f.type === "grid") {
                        initialData[sec.id][f.id] = {};
                    } else {
                        initialData[sec.id][f.id] = "";
                    }
                });
            });
            setFormData(initialData);
        }
        // Auto-detect report cycle
        if (studentId) {
            api.get(`/api/students/${studentId}/profile/`)
                .then(res => {
                    if (res.data.active_cycle?.id) {
                        setReportCycleId(String(res.data.active_cycle.id));
                    }
                })
                .catch(console.error);
        }
    }, [formType, studentId]);

    const handleChange = (sectionId: string, fieldId: string, value: any, isCheckboxArray = false) => {
        setFormData((prev: any) => {
            const currentSection = prev[sectionId] || {};
            if (isCheckboxArray) {
                const currentArr = currentSection[fieldId] || [];
                const newArr = currentArr.includes(value)
                    ? currentArr.filter((item: string) => item !== value)
                    : [...currentArr, value];
                return { ...prev, [sectionId]: { ...currentSection, [fieldId]: newArr } };
            }
            return { ...prev, [sectionId]: { ...currentSection, [fieldId]: value } };
        });
    };

    const handleGridChange = (sectionId: string, fieldId: string, rowKey: string, value: any) => {
        setFormData((prev: any) => {
            const currentSection = prev[sectionId] || {};
            const currentGrid = currentSection[fieldId] || {};
            return {
                ...prev,
                [sectionId]: {
                    ...currentSection,
                    [fieldId]: { ...currentGrid, [rowKey]: value }
                }
            };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccessMsg("");
        setErrorMsg("");

        if (!schema) {
            setErrorMsg("Invalid form schema.");
            setLoading(false);
            return;
        }

        try {
            await api.post(`/api/inputs/${formType}/`, {
                student: parseInt(studentId || "0"),
                report_cycle: parseInt(reportCycleId),
                form_data: formData
            });
            setSuccessMsg("Form successfully submitted!");
            setTimeout(() => router.push("/dashboard"), 2000);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Failed to submit form. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    if (!studentId) return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Missing student context. Return to dashboard.</div>;
    if (!schema) return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Loading form…</div>;

    return (
        <ProtectedRoute>
            <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2rem 1rem 3rem" }}>
                {/* Breadcrumb Nav */}
                <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "8px" }}>
                    <button type="button" onClick={() => router.back()}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", color: "#64748b", textDecoration: "none", fontWeight: 600, fontSize: "0.9rem" }}
                        onMouseOver={(e) => e.currentTarget.style.color = "#2563eb"}
                        onMouseOut={(e) => e.currentTarget.style.color = "#64748b"}
                    >
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back to Student Profile
                    </button>
                    <span style={{ color: "#cbd5e1" }}>›</span>
                    <span style={{ color: "#0f172a", fontWeight: 600, fontSize: "0.9rem" }}>
                        {schema.title}
                    </span>
                </div>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <div>
                        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>{schema.title}</h1>
                        <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "4px" }}>Fill out each section below.</p>
                    </div>
                </div>

                {/* Alerts */}
                {successMsg && (
                    <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#d1fae5", color: "#065f46", border: "1px solid #a7f3d0", marginBottom: "1rem", fontWeight: 600 }}>
                        ✓ {successMsg}
                    </div>
                )}
                {errorMsg && (
                    <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", marginBottom: "1rem" }}>
                        {errorMsg}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    {/* Dynamic sections from schema */}
                    {schema.sections?.map((section: any) => (
                        <SectionCard key={section.id} title={section.title}>
                            {section.fields?.map((field: any) => {
                                const currentValue = formData[section.id]?.[field.id];

                                return (
                                    <div key={field.id}>
                                        <FieldLabel label={field.label} />

                                        {field.type === "text" && (
                                            <TextInput value={currentValue || ""} onChange={v => handleChange(section.id, field.id, v)} />
                                        )}

                                        {field.type === "textarea" && (
                                            <TextAreaInput value={currentValue || ""} onChange={v => handleChange(section.id, field.id, v)} />
                                        )}

                                        {field.type === "radio" && (
                                            <RadioGroup options={field.options || []} value={currentValue || ""} onChange={v => handleChange(section.id, field.id, v)} />
                                        )}

                                        {field.type === "checkbox_group" && (
                                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                                {field.options?.map((opt: string) => (
                                                    <CheckboxItem key={opt} label={opt}
                                                        checked={(currentValue || []).includes(opt)}
                                                        onChange={() => handleChange(section.id, field.id, opt, true)} />
                                                ))}
                                            </div>
                                        )}

                                        {field.type === "grid" && (
                                            <div style={{ overflowX: "auto" }}>
                                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                                                    <thead>
                                                        <tr>
                                                            <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, color: "#475569" }}>Skill / Item</th>
                                                            {field.columns?.map((col: string) => (
                                                                <th key={col} style={{ padding: "10px 12px", textAlign: "center", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, color: "#475569" }}>{col}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {field.rows?.map((row: string) => (
                                                            <tr key={row} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                                <td style={{ padding: "10px 12px", color: "#0f172a", fontWeight: 500 }}>{row}</td>
                                                                {field.columns?.map((col: string) => (
                                                                    <td key={col} style={{ padding: "10px 12px", textAlign: "center" }}>
                                                                        <input
                                                                            type="radio"
                                                                            name={`${field.id}_${row}`}
                                                                            checked={(currentValue && currentValue[row]) === col}
                                                                            onChange={() => handleGridChange(section.id, field.id, row, col)}
                                                                            style={{ width: 16, height: 16, accentColor: "#4f46e5" }}
                                                                        />
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </SectionCard>
                    ))}

                    {/* Submit */}
                    <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                        <button type="button" onClick={() => router.push("/dashboard")}
                            style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", color: "#475569", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" }}>
                            Cancel
                        </button>
                        <button type="submit" disabled={loading}
                            style={{ padding: "10px 24px", borderRadius: "8px", border: "none", background: loading ? "#a5b4fc" : "#4f46e5", color: "white", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>
                            {loading ? "Submitting…" : "Submit Form"}
                        </button>
                    </div>
                </form>
            </div>
        </ProtectedRoute>
    );
}

export default function FormEntryPage() {
    return (
        <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>Loading form…</div>}>
            <FormEntryContent />
        </Suspense>
    );
}
