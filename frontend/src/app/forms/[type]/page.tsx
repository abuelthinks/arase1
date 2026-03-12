"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";

import api from "@/lib/api";
import { Suspense } from "react";

// Import all JSON schemas statically
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

function FormEntryContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();

    const formType = (params?.type as string) || "unknown";
    const studentId = searchParams.get("studentId");

    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    const [reportCycleId, setReportCycleId] = useState("1"); // MVP Default

    // The parsed form schema and dynamically bound nested state
    const [schema, setSchema] = useState<any>(null);
    const [formData, setFormData] = useState<any>({});

    useEffect(() => {
        const loadedSchema = schemaMap[formType];
        if (loadedSchema) {
            setSchema(loadedSchema);
            // Initialize empty form state keys based on section structures
            const initialData: any = {};
            loadedSchema.sections?.forEach((sec: any) => {
                initialData[sec.id] = {};
                sec.fields?.forEach((f: any) => {
                    if (f.type === "checkbox_group") {
                        initialData[sec.id][f.id] = [];
                    } else if (f.type === "grid") {
                        initialData[sec.id][f.id] = {}; // Nested dict
                    } else {
                        initialData[sec.id][f.id] = "";
                    }
                });
            });
            setFormData(initialData);
        }
    }, [formType]);

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
    }

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

        const endpoint = `/api/inputs/${formType}/`;
        const payload = {
            student: parseInt(studentId || "0"),
            report_cycle: parseInt(reportCycleId),
            form_data: formData
        };

        try {
            await api.post(endpoint, payload);
            setSuccessMsg("Form successfully submitted!");
            setTimeout(() => router.push("/dashboard"), 2000);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Failed to submit form. Please verify the URL and input values.");
        } finally {
            setLoading(false);
        }
    };

    if (!studentId) {
        return <div className="container mt-4"><p>Missing student context. Please return to dashboard.</p></div>;
    }

    if (!schema) {
        return <div className="container mt-4"><p>Loading or Invalid Form Type...</p></div>;
    }

    return (
        <ProtectedRoute>
            <div className="container" style={{ padding: "3rem 1.5rem" }}>
                <div className="glass-panel" style={{ padding: "2.5rem", maxWidth: "900px", margin: "0 auto" }}>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <h1 style={{ fontSize: "1.8rem", color: "var(--accent-primary)" }}>{schema.title}</h1>
                        <button type="button" onClick={() => router.push("/dashboard")} className="btn-secondary">Back</button>
                    </div>

                    {successMsg && <div style={{ backgroundColor: "#d1fae5", color: "var(--success)", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem" }}>{successMsg}</div>}
                    {errorMsg && <div style={{ backgroundColor: "#fee2e2", color: "var(--danger)", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem" }}>{errorMsg}</div>}

                    <form onSubmit={handleSubmit}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2rem" }}>
                            <div className="form-group">
                                <label className="form-label">Student ID Override</label>
                                <input type="text" className="form-input" value={studentId} disabled />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Report Cycle ID</label>
                                <input type="number" className="form-input" value={reportCycleId} onChange={e => setReportCycleId(e.target.value)} required />
                            </div>
                        </div>

                        {schema.sections?.map((section: any) => (
                            <div key={section.id} style={{ marginBottom: "2.5rem", padding: "1.5rem", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                                <h3 style={{ fontSize: "1.3rem", color: "#1e293b", marginBottom: "1.2rem", borderBottom: "2px solid #cbd5e1", paddingBottom: "0.5rem" }}>
                                    {section.title}
                                </h3>

                                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                                    {section.fields?.map((field: any) => {
                                        const currentValue = formData[section.id]?.[field.id];

                                        return (
                                            <div key={field.id} className="form-group" style={{ marginBottom: "0" }}>
                                                <label className="form-label" style={{ fontWeight: 600, fontSize: "1rem" }}>{field.label}</label>

                                                {field.type === "text" && (
                                                    <input type="text" className="form-input" value={currentValue || ""} onChange={(e) => handleChange(section.id, field.id, e.target.value)} />
                                                )}

                                                {field.type === "textarea" && (
                                                    <textarea className="form-input" rows={3} value={currentValue || ""} onChange={(e) => handleChange(section.id, field.id, e.target.value)} />
                                                )}

                                                {field.type === "radio" && (
                                                    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                                                        {field.options?.map((opt: string) => (
                                                            <label key={opt} style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                                                                <input type="radio" name={field.id} value={opt} checked={currentValue === opt} onChange={(e) => handleChange(section.id, field.id, e.target.value)} />
                                                                <span>{opt}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}

                                                {field.type === "checkbox_group" && (
                                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.8rem", marginTop: "0.5rem" }}>
                                                        {field.options?.map((opt: string) => (
                                                            <label key={opt} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer" }}>
                                                                <input type="checkbox" style={{ marginTop: "0.3rem" }} checked={(currentValue || []).includes(opt)} onChange={() => handleChange(section.id, field.id, opt, true)} />
                                                                <span style={{ lineHeight: "1.4" }}>{opt}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}

                                                {field.type === "grid" && (
                                                    <div style={{ overflowX: "auto", marginTop: "0.8rem" }}>
                                                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
                                                            <thead>
                                                                <tr style={{ backgroundColor: "#e2e8f0" }}>
                                                                    <th style={{ padding: "0.8rem", textAlign: "left", border: "1px solid #cbd5e1" }}>Skill / Item</th>
                                                                    {field.columns?.map((col: string) => (
                                                                        <th key={col} style={{ padding: "0.8rem", textAlign: "center", border: "1px solid #cbd5e1" }}>{col}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {field.rows?.map((row: string) => (
                                                                    <tr key={row}>
                                                                        <td style={{ padding: "0.8rem", border: "1px solid #cbd5e1", backgroundColor: "#fff" }}>{row}</td>
                                                                        {field.columns?.map((col: string) => (
                                                                            <td key={col} style={{ padding: "0.8rem", textAlign: "center", border: "1px solid #cbd5e1", backgroundColor: "#fff" }}>
                                                                                <input
                                                                                    type="radio"
                                                                                    name={`${field.id}_${row}`}
                                                                                    checked={(currentValue && currentValue[row]) === col}
                                                                                    onChange={() => handleGridChange(section.id, field.id, row, col)}
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
                                </div>
                            </div>
                        ))}

                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
                            <button type="submit" className="btn-primary" style={{ padding: "14px 2rem", fontSize: "1.1rem" }} disabled={loading}>
                                {loading ? "Saving Records..." : "Submit Form Payload"}
                            </button>
                        </div>
                    </form>
                </div>
                </div>
        </ProtectedRoute>
    );
}

export default function FormEntryPage() {
    return (
        <Suspense fallback={<div className="container mt-4"><p>Loading form engine...</p></div>}>
            <FormEntryContent />
        </Suspense>
    );
}
