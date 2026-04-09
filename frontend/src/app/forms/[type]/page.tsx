"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
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
                <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>{title}</h2>
            </div>
            <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {children}
            </div>
        </div>
    );
}

function FieldLabel({ label }: { label: string }) {
    return (
        <p style={{ fontSize: "1rem", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
            {label}
        </p>
    );
}

function TextInput({ value, onChange, placeholder, type = "text", min, max }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; min?: number; max?: number }) {
    return (
        <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            min={min}
            max={max}
            style={{
                width: "100%", borderRadius: "8px", border: "1px solid #e2e8f0",
                padding: "11px 14px", fontSize: "1rem",
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
                padding: "12px 14px", fontSize: "1rem", resize: "vertical",
                color: "#0f172a", background: "white",
                boxSizing: "border-box",
            }}
        />
    );
}

function CheckboxItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
    return (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "1rem", cursor: "pointer", color: "#0f172a", userSelect: "none" }}>
            <input type="checkbox" checked={checked} onChange={onChange}
                style={{ width: 18, height: 18, accentColor: "#4f46e5", cursor: "pointer" }} />
            {label}
        </label>
    );
}

function RadioGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
    return (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {options.map(opt => (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "1rem", color: "#0f172a" }}>
                    <input type="radio" checked={value === opt} onChange={() => onChange(opt)}
                        style={{ width: 18, height: 18, accentColor: "#4f46e5", cursor: "pointer" }} />
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
    const { user } = useAuth();

    const formType = (params?.type as string) || "unknown";
    const studentId = searchParams.get("studentId");

    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [reportCycleId, setReportCycleId] = useState("1");
    const [schema, setSchema] = useState<any>(null);
    const [formData, setFormData] = useState<any>({});
    const [studentProfile, setStudentProfile] = useState<any>(null);
    const [showDescriptions, setShowDescriptions] = useState<Record<string, boolean>>({});

    const toggleDescription = (fieldId: string) => {
        setShowDescriptions(prev => ({ ...prev, [fieldId]: !prev[fieldId] }));
    };

    const isViewMode = searchParams.get("mode") === "view";
    const formIdStr = searchParams.get("submissionId") || searchParams.get("formId");

    // For Translation Toggle
    const [fullSubmission, setFullSubmission] = useState<any>(null);
    const [isTranslated, setIsTranslated] = useState(false);
    const hasTranslation = fullSubmission && fullSubmission.translated_data && Object.keys(fullSubmission.translated_data).length > 0 && fullSubmission.original_language && !['en', 'english'].includes(fullSubmission.original_language.toLowerCase());

    const getDraftKey = () => `draft_${formType}_${studentId}`;

    useEffect(() => {
        let isMounted = true;
        const loadForm = async () => {
            const loadedSchema = schemaMap[formType];
            if (!loadedSchema) return;

            let finalSchema = JSON.parse(JSON.stringify(loadedSchema));
            let activeIepData: any = null;
            let profileData: any = null;

            if (studentId) {
                try {
                    const res = await api.get(`/api/students/${studentId}/profile/`);
                    profileData = res.data;
                    setStudentProfile(profileData);
                    
                    if (isMounted) {
                        if (profileData.active_cycle?.id) {
                            setReportCycleId(String(profileData.active_cycle.id));
                        }
                        
                        // Check for latest IEP
                        const iepDoc = profileData.generated_documents?.find((d: any) => d.type === 'IEP' && d.has_iep_data);
                        if (iepDoc) {
                            const iepRes = await api.get(`/api/iep/${iepDoc.id}/`);
                            activeIepData = iepRes.data?.iep_data;
                        }
                    }
                } catch (e) {
                    console.error("Failed to load profile/IEP data:", e);
                }
            }

            // Inject dynamic IEP goals if available
            if (activeIepData && activeIepData.section5_ltg && activeIepData.section5_ltg.length > 0) {
                finalSchema.sections.forEach((sec: any) => {
                    // Identify sections related to goals strictly per form to avoid overwriting wrong sections (like Section E in SPED tracker)
                    const isMultiGoal = formType === 'multidisciplinary-tracker' && sec.id === 'section_e';
                    const isSpedGoal = formType === 'sped-tracker' && sec.id === 'section_h';
                    const isTitleMatch = sec.title?.toLowerCase().includes('goal achievement');
                    
                    const isGoalSection = isMultiGoal || isSpedGoal || isTitleMatch;
                    
                    if (isGoalSection) {
                        const dynamicFields: any[] = [];
                        activeIepData.section5_ltg.forEach((goal: any, idx: number) => {
                            // Strip boilerplate "By the end of the IEP period, [Name] will " text to make it concise
                            let shortGoal = goal.goal || "";
                            shortGoal = shortGoal.replace(/^By the end of (the )?(IEP |reporting )?period, .*? will /gi, '');
                            // Capitalize first letter
                            if (shortGoal) {
                                shortGoal = shortGoal.charAt(0).toUpperCase() + shortGoal.slice(1);
                            }
                            
                            const domainLabel = goal.domain ? ` (${goal.domain})` : "";
                            const goalIdLabel = goal.id || `Goal ${idx + 1}`;

                            dynamicFields.push({
                                id: `dynamic_goal_${idx + 1}`,
                                label: `${goalIdLabel}${domainLabel}`,
                                description: shortGoal,  // Put long text in normal description instead of bold uppercase label
                                type: "radio",
                                options: [
                                    "1 - None",
                                    "2 - Minimal",
                                    "3 - Expected",
                                    "4 - More",
                                    "5 - Achieved"
                                ]
                            });
                        });
                        
                        // Preserve the comments/statement fields at the end if they exist
                        const commentsField = sec.fields?.find((f: any) => f.id === 'gas_comments' || f.id === 'parent_goal_statement');
                        // Always provide a comments generic field if none exists, else preserve the schema's with a simplified label
                        if (commentsField) {
                            dynamicFields.push({
                                ...commentsField,
                                label: "Comments"
                            });
                        } else {
                            dynamicFields.push({
                                id: 'goal_comments',
                                label: 'Comments',
                                type: 'textarea'
                            });
                        }
                        
                        // Modify section title to indicate these are IEP goals, preserving "SECTION X"
                        const prefixMatch = sec.title?.match(/^(SECTION [A-Z])\s*—/i);
                        const prefix = prefixMatch ? `${prefixMatch[1]} — ` : "";
                        sec.title = `${prefix}GOAL ACHIEVEMENT (from IEP)`;
                        sec.fields = dynamicFields;
                    }
                });
            }

            if (!isMounted) return;
            setSchema(finalSchema);

            // Initialize form data based on the potentially modified schema
            const initialData: any = {};
            finalSchema.sections?.forEach((sec: any) => {
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

            let mergedData = { ...initialData };

            if (isViewMode && formIdStr) {
                // If viewing a previous submission
                try {
                    const res = await api.get(`/api/inputs/${formType}/${formIdStr}/`);
                    setFullSubmission(res.data);
                    const savedData = res.data.form_data?.v2 || res.data.form_data || {};
                    
                    // Detect if savedData is from older flat structure
                    const isFlat = !Object.keys(savedData).some(k => k.startsWith("section_"));
                    if (isFlat) {
                        finalSchema.sections?.forEach((sec: any) => {
                            sec.fields?.forEach((f: any) => {
                                if (savedData[f.id] !== undefined) {
                                    mergedData[sec.id][f.id] = savedData[f.id];
                                }
                            });
                        });
                    } else {
                        Object.keys(savedData).forEach(secKey => {
                            if (mergedData[secKey]) {
                                mergedData[secKey] = { ...mergedData[secKey], ...savedData[secKey] };
                            }
                        });
                    }
                } catch (err) {
                    console.error("Failed to load submission:", err);
                    setErrorMsg("Failed to load the form submission.");
                }
            } else {
                // Try to load auto-saved draft
                try {
                    const draftKey = `draft_${formType}_${studentId}`;
                    const saved = localStorage.getItem(draftKey);
                    if (saved) {
                        const parsedData = JSON.parse(saved);
                        Object.keys(parsedData).forEach(secKey => {
                            if (mergedData[secKey]) {
                                mergedData[secKey] = { ...mergedData[secKey], ...parsedData[secKey] };
                            }
                        });
                    }
                } catch (err) {
                    console.error("Failed to load draft:", err);
                }
            }

            // Auto-detect report cycle and fill section_a fields if NOT viewing a historical submission
            if (!isViewMode && profileData && mergedData.section_a) {
                const newSectionA = { ...mergedData.section_a };
                const sName = `${profileData.student.first_name} ${profileData.student.last_name}`;
                if ('student_name' in newSectionA) newSectionA.student_name = sName;
                if ('child_name' in newSectionA) newSectionA.child_name = sName;
                if ('date_of_birth' in newSectionA && profileData.student.date_of_birth) {
                    newSectionA.date_of_birth = profileData.student.date_of_birth;
                }
                if ('grade_level' in newSectionA && profileData.student.grade) {
                    newSectionA.grade_level = profileData.student.grade;
                }
                if ('class_level' in newSectionA && profileData.student.grade) {
                    newSectionA.class_level = profileData.student.grade;
                }
                if ('sped_teacher' in newSectionA && user) {
                    const teacherName = [user.first_name, user.last_name].filter(Boolean).join(" ");
                    newSectionA.sped_teacher = teacherName || user.username || "";
                }
                if ('therapist_name' in newSectionA && user) {
                    const therapistName = [user.first_name, user.last_name].filter(Boolean).join(" ");
                    newSectionA.therapist_name = therapistName || user.username || "";
                }
                if ('date_of_assessment' in newSectionA) {
                    newSectionA.date_of_assessment = new Date().toISOString().split('T')[0];
                }
                if ('date' in newSectionA) {
                    newSectionA.date = new Date().toISOString().split('T')[0];
                }
                mergedData.section_a = newSectionA;
            }

            // Cross-Form Data Merger (Auto-fill from Parent Assessment)
            if (!isViewMode) {
                try {
                    const parentRes = await api.get('/api/inputs/parent-assessment/');
                    // Find latest submission for this student
                    const pForm = parentRes.data.find((f: any) => parseInt(f.student) === parseInt(studentId || "0"));
                    if (pForm) {
                        const pData = pForm.form_data?.v2 || pForm.form_data;
                        if (pData) {
                            const hasPrimaryLanguage = finalSchema.sections.some((s: any) => s.fields?.some((f: any) => f.id === 'primary_language'));
                            if (hasPrimaryLanguage) {
                                const langSec = finalSchema.sections.find((s: any) => s.fields?.some((f: any) => f.id === 'primary_language'));
                                if (langSec && (!mergedData[langSec.id] || !mergedData[langSec.id]['primary_language'])) {
                                    const langs = Array.isArray(pData.primary_language) 
                                        ? pData.primary_language 
                                        : (pData.primary_language ? [pData.primary_language] : []);
                                    const otherLang = pData.primary_language_other;
                                    const langStr = [...langs, otherLang].filter(Boolean).join(", ");
                                    if (langStr) {
                                        if (!mergedData[langSec.id]) mergedData[langSec.id] = {};
                                        mergedData[langSec.id]['primary_language'] = langStr;
                                    }
                                }
                            }
                            
                            // Map additional fields here in the future if overlapping schemas are added
                        }
                    }
                } catch (err) {
                    console.log("Could not auto-fill cross-form data from parent assessment", err);
                }
            }

            setFormData(mergedData);
        };

        loadForm();
        
        return () => { isMounted = false; };
    }, [formType, studentId, user, isViewMode, formIdStr]);

    useEffect(() => {
        if (isViewMode && fullSubmission && schema) {
            const sourceData = (isTranslated && fullSubmission.translated_data) ? fullSubmission.translated_data : fullSubmission.form_data;
            const savedData = sourceData?.v2 || sourceData || {};
            
            // Re-run the merge logic for view mode
            const initialData: any = {};
            schema.sections?.forEach((sec: any) => {
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

            let mergedData = { ...initialData };
            const isFlat = !Object.keys(savedData).some(k => k.startsWith("section_"));
            if (isFlat) {
                schema.sections?.forEach((sec: any) => {
                    sec.fields?.forEach((f: any) => {
                        if (savedData[f.id] !== undefined) {
                            mergedData[sec.id][f.id] = savedData[f.id];
                        }
                    });
                });
            } else {
                Object.keys(savedData).forEach(secKey => {
                    if (mergedData[secKey]) {
                        mergedData[secKey] = { ...mergedData[secKey], ...savedData[secKey] };
                    }
                });
            }
            setFormData(mergedData);
        }
    }, [isTranslated, fullSubmission, schema, isViewMode]);

    // Auto-save effect
    useEffect(() => {
        if (isViewMode) return; // Do not auto-save if merely viewing an old submission
        if (!formData || Object.keys(formData).length === 0 || !studentId || !formType) return;
        
        // Use a timeout to debounce the saving slightly
        const timeoutId = setTimeout(() => {
            try {
                const draftKey = getDraftKey();
                localStorage.setItem(draftKey, JSON.stringify(formData));
            } catch (err) {
                console.error("Failed to auto-save draft:", err);
            }
        }, 1000); // 1s debounce

        return () => clearTimeout(timeoutId);
    }, [formData, studentId, formType]);

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
            
            // Clear draft upon successful submission
            try {
                localStorage.removeItem(getDraftKey());
            } catch (e) {
                console.error("Failed to clear draft:", e);
            }

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
            <div style={{ maxWidth: "1024px", margin: "0 auto", padding: "2rem 1rem 3rem" }}>
                {/* Breadcrumb Nav */}
                {studentProfile && (
                    <div className="hidden md:flex" style={{ 
                        marginBottom: "2rem", 
                        justifyContent: "space-between", 
                        alignItems: "center", 
                        background: "white", 
                        padding: "12px 20px", 
                        borderRadius: "12px", 
                        border: "1px solid var(--border-light)", 
                        boxShadow: "0 1px 3px rgba(0,0,0,0.02)" 
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <button type="button" onClick={() => router.back()}
                                style={{ 
                                    background: "#f8fafc", 
                                    border: "1px solid #e2e8f0", 
                                    padding: "6px 12px", 
                                    borderRadius: "6px", 
                                    cursor: "pointer", 
                                    display: "inline-flex", 
                                    alignItems: "center", 
                                    gap: "6px", 
                                    color: "#475569", 
                                    fontWeight: 600, 
                                    fontSize: "0.85rem", 
                                    transition: "all 0.2s" 
                                }}
                                className="hover:bg-slate-200"
                            >
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                Back
                            </button>
                            <span style={{ color: "#cbd5e1" }}>/</span>
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Students</span>
                            <span style={{ color: "#cbd5e1" }}>/</span>
                            <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "0.95rem" }}>
                                {studentProfile.student.first_name} {studentProfile.student.last_name}
                            </span>
                        </div>
                        
                        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ 
                                display: "inline-block", 
                                width: "8px", 
                                height: "8px", 
                                borderRadius: "50%", 
                                background: studentProfile.student.status === "Enrolled" ? "#22c55e" : "#f59e0b",
                                boxShadow: `0 0 0 2px ${studentProfile.student.status === "Enrolled" ? "#dcfce7" : "#fef3c7"}`
                            }}></span>
                            Status: {studentProfile.student.status}
                        </div>
                    </div>
                )}
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <div>
                        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>{schema.title}</h1>
                        <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "4px" }}>Fill out each section below.</p>
                    </div>
                    {isViewMode && hasTranslation && (
                        <div style={{ display: "flex", gap: "4px", background: "#f8fafc", padding: "4px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                            <button
                                type="button"
                                onClick={() => setIsTranslated(false)}
                                style={{
                                    padding: "6px 12px", borderRadius: "6px", fontSize: "0.85rem", fontWeight: !isTranslated ? 700 : 500,
                                    color: !isTranslated ? "#0f172a" : "#64748b", background: !isTranslated ? "white" : "transparent",
                                    boxShadow: !isTranslated ? "0 1px 2px rgba(0,0,0,0.05)" : "none", border: "none", cursor: "pointer", transition: "all 0.2s"
                                }}
                            >
                                Original
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsTranslated(true)}
                                style={{
                                    padding: "6px 12px", borderRadius: "6px", fontSize: "0.85rem", fontWeight: isTranslated ? 700 : 500,
                                    color: isTranslated ? "#4f46e5" : "#64748b", background: isTranslated ? "white" : "transparent",
                                    boxShadow: isTranslated ? "0 1px 2px rgba(0,0,0,0.05)" : "none", border: "none", cursor: "pointer", transition: "all 0.2s"
                                }}
                            >
                                English (AI) ✨
                            </button>
                        </div>
                    )}
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

                {/* Previous Recommendations Banner (for Trackers) */}
                {formType.includes('tracker') && studentProfile?.previous_recommendations && (
                    <div style={{ 
                        background: "#fffbeb", 
                        borderRadius: "14px", 
                        padding: "1.5rem", 
                        border: "1px solid #fde68a", 
                        marginBottom: "2rem",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                            <div style={{ background: "#fef3c7", padding: "8px", borderRadius: "8px", color: "#92400e" }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                            </div>
                            <div>
                                <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#92400e", margin: 0 }}>
                                    Context: Carried Forward from {studentProfile.previous_recommendations.report_period}
                                </h3>
                                <p style={{ fontSize: "0.8rem", color: "#b45309", margin: "2px 0 0" }}>
                                    Use these previous focus areas to guide your monthly progress evaluation.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {studentProfile.previous_recommendations.focus_areas?.length > 0 && (
                                <div>
                                    <h4 style={{ fontSize: "0.75rem", fontWeight: 800, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                                        🎯 Last Month's Focus Areas
                                    </h4>
                                    <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem", color: "#b45309", display: "flex", flexDirection: "column", gap: "4px" }}>
                                        {studentProfile.previous_recommendations.focus_areas.map((f: string, i: number) => <li key={i}>{f}</li>)}
                                    </ul>
                                </div>
                            )}
                            {studentProfile.previous_recommendations.recommendations?.length > 0 && (
                                <div>
                                    <h4 style={{ fontSize: "0.75rem", fontWeight: 800, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                                        📋 Active Recommendations
                                    </h4>
                                    <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem", color: "#b45309", display: "flex", flexDirection: "column", gap: "4px" }}>
                                        {studentProfile.previous_recommendations.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <fieldset disabled={isViewMode} style={{ border: "none", padding: 0, margin: 0 }}>
                        {/* Dynamic sections from schema */}
                        {schema.sections?.map((section: any) => (
                            <SectionCard key={section.id} title={section.title}>
                                {section.fields?.map((field: any) => {
                                    const currentValue = formData[section.id]?.[field.id];

                                    return (
                                        <div key={field.id}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                                                <FieldLabel label={field.label} />
                                                {field.description && (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleDescription(field.id)}
                                                        style={{
                                                            background: "none", border: "none", padding: "2px 6px",
                                                            fontSize: "0.75rem", color: "#6366f1", fontWeight: 600,
                                                            cursor: "pointer", borderRadius: "4px",
                                                            textDecoration: "underline"
                                                        }}
                                                    >
                                                        {showDescriptions[field.id] ? "Hide details" : "Show details"}
                                                    </button>
                                                )}
                                            </div>

                                            {field.description && showDescriptions[field.id] && (
                                                <p style={{ fontSize: "0.875rem", color: "#475569", marginBottom: "12px", marginTop: "0", lineHeight: "1.4" }}>
                                                    {field.description}
                                                </p>
                                            )}

                                            {(field.type === "text" || field.type === "number" || field.type === "date") && (
                                                <TextInput type={field.type} value={currentValue || ""} min={field.min} max={field.max} onChange={v => handleChange(section.id, field.id, v)} />
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
                    </fieldset>

                    {/* Submit */}
                    {!isViewMode && (
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
                    )}
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
