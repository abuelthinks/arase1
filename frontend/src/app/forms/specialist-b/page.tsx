"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/* ─── Shared UI Components ─────────────────────────────────────────────────── */

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "1.25rem" }}>
            <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border-light)", background: "#f8fafc" }}>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</h2>
                {subtitle && <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: "2px 0 0" }}>{subtitle}</p>}
            </div>
            <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {children}
            </div>
        </div>
    );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p style={{ fontSize: "0.9rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--accent-primary)", marginBottom: "8px" }}>{label}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>{children}</div>
        </div>
    );
}

function CheckboxItem({ label, checked, onChange, readOnly }: { label: string; checked: boolean; onChange: () => void; readOnly?: boolean }) {
    return (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "1rem", cursor: readOnly ? "default" : "pointer", color: "var(--text-primary)", userSelect: "none" }}>
            <input type="checkbox" checked={checked} onChange={readOnly ? undefined : onChange} readOnly={readOnly} style={{ width: 18, height: 18, accentColor: "#4f46e5", cursor: readOnly ? "default" : "pointer" }} />
            {label}
        </label>
    );
}

function RadioItem({ label, checked, onChange, readOnly }: { label: string; checked: boolean; onChange: () => void; readOnly?: boolean }) {
    return (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem", cursor: readOnly ? "default" : "pointer", color: "#0f172a", userSelect: "none" }}>
            <input type="radio" checked={checked} onChange={readOnly ? undefined : onChange} readOnly={readOnly}
                style={{ width: 16, height: 16, accentColor: "#4f46e5", cursor: readOnly ? "default" : "pointer" }} />
            {label}
        </label>
    );
}

function TextInput({ value, onChange, placeholder, readOnly, type = "text" }: { value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean; type?: string }) {
    return (
        <input
            type={type}
            value={value}
            onChange={onChange ? e => onChange(e.target.value) : undefined}
            readOnly={readOnly}
            placeholder={placeholder}
            style={{
                width: "100%", borderRadius: "8px", border: "1px solid #e2e8f0",
                padding: "9px 12px", fontSize: "0.875rem",
                color: "#0f172a", background: readOnly ? "#f8fafc" : "white",
                boxSizing: "border-box",
            }}
        />
    );
}

function TextArea({ value, onChange, placeholder, readOnly, rows = 3 }: { value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean; rows?: number }) {
    return (
        <textarea
            value={value}
            onChange={onChange ? e => onChange(e.target.value) : undefined}
            readOnly={readOnly}
            placeholder={placeholder}
            rows={rows}
            style={{
                width: "100%", borderRadius: "8px", border: "1px solid #e2e8f0",
                padding: "11px 14px", fontSize: "1rem", resize: "vertical",
                color: "var(--text-primary)", background: readOnly ? "#f8fafc" : "white",
                boxSizing: "border-box"
            }}
        />
    );
}

/* ─── Main Component ───────────────────────────────────────────────────────── */

function SpecialistBFormContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const studentId = searchParams.get("studentId");
    const isViewMode = searchParams.get("mode") === "view";
    const submissionId = searchParams.get("submissionId");

    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [reportCycleId, setReportCycleId] = useState("1");
    const [studentProfile, setStudentProfile] = useState<any>(null);
    const [studentName, setStudentName] = useState("");

    const { user } = useAuth();
    const [formData, setFormData] = useState({
        section_a: { date: new Date().toISOString().split('T')[0], therapist_name: "", discipline: "", session_type: "", sessions_completed: "0" },
        section_b: { attendance: "", participation_level: "", notes: "" },
        section_c: { slp_goals: [] as string[], slp_notes: "", ot_goals: [] as string[], ot_notes: "", pt_goals: [] as string[], pt_notes: "", psych_goals: [] as string[], psych_notes: "", sped_goals: [] as string[], sped_notes: "" },
        section_d: { independent_skills: "", behavior_interaction: "", sensory_motor: "", communication_adults: "", notes: "" },
        section_e: { goal_1: "", goal_2: "", goal_3: "", goal_4: "", comments: "" },
        section_f: { therapy_recommendations: [] as string[], home_strategies: [] as string[], therapist_suggested_activities: "" }
    });

    const getDraftKey = () => `draft_specialist-b_${studentId}`;

    // Load Draft from LocalStorage
    useEffect(() => {
        if (!isViewMode && studentId) {
            try {
                const saved = localStorage.getItem(getDraftKey());
                if (saved) {
                    const parsed = JSON.parse(saved);
                    setFormData(prev => ({
                         section_a: { ...prev.section_a, ...(parsed.section_a || {}) },
                         section_b: { ...prev.section_b, ...(parsed.section_b || {}) },
                         section_c: { ...prev.section_c, ...(parsed.section_c || {}) },
                         section_d: { ...prev.section_d, ...(parsed.section_d || {}) },
                         section_e: { ...prev.section_e, ...(parsed.section_e || {}) },
                         section_f: { ...prev.section_f, ...(parsed.section_f || {}) }
                    }));
                }
            } catch (err) {
                console.error("Failed to load draft:", err);
            }
        }
    }, [isViewMode, studentId]);

    const OPTIONS = {
        discipline: ["Speech-Language Pathology", "Occupational Therapy", "Physical Therapy", "Psychology / Behavioral", "SPED / Educational", "Shadow Teacher"],
        session_type: ["Online", "Onsite"],
        attendance: ["Present", "Late", "Absent", "Rescheduled"],
        participation: ["Fully engaged", "Needed minimal cues", "Needed moderate prompts", "Needed full assistance", "Refused tasks", "Limited engagement", "Easily distracted", "Overstimulated", "Fatigued"],
        slp_goals: ["Increased verbal output", "Improved receptive skills", "Better articulation", "Improved social communication", "Used AAC/Picture cards", "No improvement", "Regression noted"],
        ot_goals: ["Improved hand strength", "Better pencil grasp", "Improved scissor skills", "Followed sensory strategies", "Reduced sensory overload", "Increased independence in ADLs", "No improvement", "Regression noted"],
        pt_goals: ["Improved balance", "Stronger core strength", "Better coordination", "Improved gait", "Increased endurance", "No improvement", "Regression observed"],
        psych_goals: ["Reduced tantrums", "Improved coping strategies", "Better attention", "Less impulsivity", "Improved emotional expression", "Better transitions", "No improvement", "Regression observed"],
        sped_goals: ["Improved focus", "Better task completion", "Improved literacy skills", "Improved numeracy skills", "Followed classroom routines", "Better peer interaction", "No improvement", "Regression noted"],
        independent_skills: ["Improved", "Slight improvement", "No change", "Declined"],
        behavior_interaction: ["Cooperative", "Needs support", "Resistant", "Aggressive", "Withdrawn"],
        sensory_motor: ["Calm", "Hyperactive", "Sensory seeking", "Sensory avoidant", "Easily overwhelmed"],
        communication_adults: ["Responds", "Initiates", "Minimal interaction", "No interaction"],
        gas_scale: ["1 – No progress", "2 – Minimal progress", "3 – Expected progress", "4 – More than expected", "5 – Goal achieved"],
        therapy_recs: ["Continue same plan", "Increase frequency", "Reduce frequency", "Add new goals", "Parent training needed", "Referral to another discipline", "Request formal evaluation"],
        home_strategies: ["Speech exercises", "Sensory activities", "Fine motor tasks", "Gross motor tasks", "Behavior strategies", "Academic tasks", "Routine-building activities"],
    };

    const ro = isViewMode;

    const handleNestedChange = (section: keyof typeof formData, field: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            [section]: { ...(prev[section] as any), [field]: value }
        }));
    };

    const handleArrayToggle = (section: keyof typeof formData, field: string, value: string) => {
        setFormData(prev => {
            const currentArr = (prev[section] as any)[field] as string[];
            const updated = currentArr.includes(value) ? currentArr.filter(item => item !== value) : [...currentArr, value];
            return { ...prev, [section]: { ...(prev[section] as any), [field]: updated } };
        });
    };

    // Auto-save effect
    useEffect(() => {
        if (isViewMode || !studentId) return;
        
        const timeoutId = setTimeout(() => {
            try {
                localStorage.setItem(getDraftKey(), JSON.stringify(formData));
            } catch (err) {
                console.error("Failed to save draft:", err);
            }
        }, 1000);
        return () => clearTimeout(timeoutId);
    }, [formData, studentId, isViewMode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccessMsg("");
        setErrorMsg("");

        try {
            await api.post("/api/inputs/multidisciplinary-tracker/", {
                student: parseInt(studentId || "0"),
                report_cycle: parseInt(reportCycleId),
                form_data: formData
            });
            
            // Clear draft upon successful submission
            try { localStorage.removeItem(getDraftKey()); } catch(e) {}

            setSuccessMsg("Weekly Progress Report submitted successfully!");
            setTimeout(() => router.push(`/students/${studentId}`), 1500);
        } catch (err: any) {
            setErrorMsg("Failed to submit form.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (studentId) {
            api.get(`/api/students/${studentId}/profile/`)
                .then(res => {
                    if (!isViewMode && res.data?.student?.status !== "Enrolled") {
                        alert("This progress tracking form is locked until the student is formally enrolled.");
                        router.push(`/students/${studentId}`);
                        return;
                    }
                    setStudentProfile(res.data);
                    if (res.data.student) setStudentName(`${res.data.student.first_name} ${res.data.student.last_name}`.trim());
                    if (!isViewMode && res.data.active_cycle) setReportCycleId(res.data.active_cycle.id.toString());
                    
                    // Auto-fill therapist name from logged in user
                    if (!isViewMode && user && !formData.section_a.therapist_name) {
                        const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
                        handleNestedChange('section_a', 'therapist_name', name || user.username || "");
                    }
                })
                .catch(err => console.error(err));
        }

        if (isViewMode && submissionId) {
            api.get(`/api/inputs/multidisciplinary-tracker/${submissionId}/`)
                .then(res => {
                    if (res.data.form_data) {
                        setFormData(prev => ({ ...prev, ...res.data.form_data }));
                    }
                })
                .catch(err => console.error("Failed to fetch submission:", err));
        }
    }, [isViewMode, submissionId, studentId]);

    if (!studentId && !isViewMode) return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Missing student context. Return to dashboard.</div>;

    return (
        <div style={{ maxWidth: "1024px", margin: "0 auto", padding: "2rem 1rem 3rem" }}>
            {/* Breadcrumb Nav */}
            {studentProfile && (
                <div style={{ 
                    marginBottom: "2rem", 
                    display: "flex", 
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
            <div style={{ marginBottom: "1.5rem" }}>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                    Weekly Progress Report {studentName && `for ${studentName}`}
                    {ro && <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginLeft: "8px" }}>— Read Only</span>}
                </h1>
                <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "4px" }}>
                    {ro ? "Past submission — read only." : "Document weekly therapy goals, session details, and progress measures."}
                </p>
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
                {/* Section A */}
                <SectionCard title="Section A — General Information">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                            <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Child Name</p>
                            <TextInput value={studentName} readOnly={true} />
                        </div>
                        <div>
                            <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Date</p>
                            <TextInput type="date" value={formData.section_a.date} onChange={ro ? undefined : v => handleNestedChange('section_a', 'date', v)} readOnly={ro} />
                        </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px", marginTop: "12px" }}>
                        <div>
                            <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Therapist Name</p>
                            <TextInput value={formData.section_a.therapist_name} onChange={ro ? undefined : v => handleNestedChange('section_a', 'therapist_name', v)} readOnly={ro} />
                        </div>
                    </div>

                    <FieldGroup label="Discipline">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                            {OPTIONS.discipline.map(opt => (
                                <RadioItem key={opt} label={opt} checked={formData.section_a.discipline === opt} onChange={() => handleNestedChange('section_a', 'discipline', opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup>

                    <FieldGroup label="Session Type">
                        <div style={{ display: "flex", gap: "16px" }}>
                            {OPTIONS.session_type.map(opt => (
                                <RadioItem key={opt} label={opt} checked={formData.section_a.session_type === opt} onChange={() => handleNestedChange('section_a', 'session_type', opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup>

                    <div>
                        <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Number of sessions completed this period</p>
                        <TextInput type="number" value={formData.section_a.sessions_completed} onChange={ro ? undefined : v => handleNestedChange('section_a', 'sessions_completed', v)} readOnly={ro} />
                    </div>
                </SectionCard>

                {/* Section B */}
                <SectionCard title="Section B — Session Attendance & Participation">
                    <FieldGroup label="B1. Attendance">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                            {OPTIONS.attendance.map(opt => (
                                <RadioItem key={opt} label={opt} checked={formData.section_b.attendance === opt} onChange={() => handleNestedChange('section_b', 'attendance', opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup>
                    <FieldGroup label="B2. Participation Level">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                            {OPTIONS.participation.map(opt => (
                                <RadioItem key={opt} label={opt} checked={formData.section_b.participation_level === opt} onChange={() => handleNestedChange('section_b', 'participation_level', opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup>
                    <FieldGroup label="Notes">
                        <TextArea value={formData.section_b.notes} onChange={ro ? undefined : v => handleNestedChange('section_b', 'notes', v)} readOnly={ro} />
                    </FieldGroup>
                </SectionCard>

                {/* Section C */}
                <SectionCard title="Section C — Goal-Based Progress Tracking" subtitle="(Therapist selects the goals relevant to their discipline)">
                    {/* C1 */}
                    <FieldGroup label="C1. Communication (SLP)">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.slp_goals.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={formData.section_c.slp_goals.includes(opt)} onChange={() => handleArrayToggle('section_c', 'slp_goals', opt)} readOnly={ro} />
                            ))}
                        </div>
                        <div style={{ marginTop: "8px" }}><TextArea placeholder="SLP Notes..." value={formData.section_c.slp_notes} onChange={ro ? undefined : v => handleNestedChange('section_c', 'slp_notes', v)} readOnly={ro} /></div>
                    </FieldGroup>

                    {/* C2 */}
                    <div style={{ marginTop: "1.5rem" }}><FieldGroup label="C2. Fine Motor / Sensory / ADLs (OT)">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.ot_goals.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={formData.section_c.ot_goals.includes(opt)} onChange={() => handleArrayToggle('section_c', 'ot_goals', opt)} readOnly={ro} />
                            ))}
                        </div>
                        <div style={{ marginTop: "8px" }}><TextArea placeholder="OT Notes..." value={formData.section_c.ot_notes} onChange={ro ? undefined : v => handleNestedChange('section_c', 'ot_notes', v)} readOnly={ro} /></div>
                    </FieldGroup></div>

                    {/* C3 */}
                    <div style={{ marginTop: "1.5rem" }}><FieldGroup label="C3. Gross Motor / Gait / Coordination (PT)">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.pt_goals.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={formData.section_c.pt_goals.includes(opt)} onChange={() => handleArrayToggle('section_c', 'pt_goals', opt)} readOnly={ro} />
                            ))}
                        </div>
                        <div style={{ marginTop: "8px" }}><TextArea placeholder="PT Notes..." value={formData.section_c.pt_notes} onChange={ro ? undefined : v => handleNestedChange('section_c', 'pt_notes', v)} readOnly={ro} /></div>
                    </FieldGroup></div>

                    {/* C4 */}
                    <div style={{ marginTop: "1.5rem" }}><FieldGroup label="C4. Behavior / Emotional Regulation (Psych)">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.psych_goals.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={formData.section_c.psych_goals.includes(opt)} onChange={() => handleArrayToggle('section_c', 'psych_goals', opt)} readOnly={ro} />
                            ))}
                        </div>
                        <div style={{ marginTop: "8px" }}><TextArea placeholder="Psych Notes..." value={formData.section_c.psych_notes} onChange={ro ? undefined : v => handleNestedChange('section_c', 'psych_notes', v)} readOnly={ro} /></div>
                    </FieldGroup></div>

                    {/* C5 */}
                    <div style={{ marginTop: "1.5rem" }}><FieldGroup label="C5. Academic / Learning Behavior (SPED)">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.sped_goals.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={formData.section_c.sped_goals.includes(opt)} onChange={() => handleArrayToggle('section_c', 'sped_goals', opt)} readOnly={ro} />
                            ))}
                        </div>
                        <div style={{ marginTop: "8px" }}><TextArea placeholder="SPED Notes..." value={formData.section_c.sped_notes} onChange={ro ? undefined : v => handleNestedChange('section_c', 'sped_notes', v)} readOnly={ro} /></div>
                    </FieldGroup></div>
                </SectionCard>

                {/* Section D */}
                <SectionCard title="Section D — Functional Observations">
                    <FieldGroup label="D1. Independent Skills">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                            {OPTIONS.independent_skills.map(opt => (
                                <RadioItem key={opt} label={opt} checked={formData.section_d.independent_skills === opt} onChange={() => handleNestedChange('section_d', 'independent_skills', opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup>

                    <div style={{ marginTop: "1.5rem" }}><FieldGroup label="D2. Behavior Interaction with Therapist">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                            {OPTIONS.behavior_interaction.map(opt => (
                                <RadioItem key={opt} label={opt} checked={formData.section_d.behavior_interaction === opt} onChange={() => handleNestedChange('section_d', 'behavior_interaction', opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup></div>

                    <div style={{ marginTop: "1.5rem" }}><FieldGroup label="D3. Sensory / Motor Regulation">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                            {OPTIONS.sensory_motor.map(opt => (
                                <RadioItem key={opt} label={opt} checked={formData.section_d.sensory_motor === opt} onChange={() => handleNestedChange('section_d', 'sensory_motor', opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup></div>

                    <div style={{ marginTop: "1.5rem" }}><FieldGroup label="D4. Communication With Adults">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                            {OPTIONS.communication_adults.map(opt => (
                                <RadioItem key={opt} label={opt} checked={formData.section_d.communication_adults === opt} onChange={() => handleNestedChange('section_d', 'communication_adults', opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup></div>

                    <div style={{ marginTop: "1.5rem" }}><FieldGroup label="Notes">
                        <TextArea value={formData.section_d.notes} onChange={ro ? undefined : v => handleNestedChange('section_d', 'notes', v)} readOnly={ro} />
                    </FieldGroup></div>
                </SectionCard>

                {/* Section E */}
                <SectionCard title="Section E — Goal Achievement Rating (GAS)" subtitle="(Simple therapist rating for AI calibration)">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
                        {['goal_1', 'goal_2', 'goal_3', 'goal_4'].map((g, i) => (
                            <div key={g} style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                                <p style={{ fontSize: "0.85rem", fontWeight: 700, margin: "0 0 10px 0", color: "#1e293b" }}>Goal {i + 1}</p>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                                    {OPTIONS.gas_scale.map(opt => (
                                        <RadioItem key={opt} label={opt} checked={(formData.section_e as any)[g] === opt} onChange={() => handleNestedChange('section_e', g, opt)} readOnly={ro} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: "1.5rem" }}>
                        <FieldGroup label="Comments">
                            <TextArea value={formData.section_e.comments} onChange={ro ? undefined : v => handleNestedChange('section_e', 'comments', v)} readOnly={ro} />
                        </FieldGroup>
                    </div>
                </SectionCard>

                {/* Section F */}
                <SectionCard title="Section F — Recommended Next Steps (Therapist Input)">
                    <FieldGroup label="F1. Therapy Recommendations">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.therapy_recs.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={formData.section_f.therapy_recommendations.includes(opt)} onChange={() => handleArrayToggle('section_f', 'therapy_recommendations', opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup>

                    <div style={{ marginTop: "1.5rem" }}><FieldGroup label="F2. Home Strategies">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.home_strategies.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={formData.section_f.home_strategies.includes(opt)} onChange={() => handleArrayToggle('section_f', 'home_strategies', opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup></div>

                    <div style={{ marginTop: "1.5rem" }}><FieldGroup label="Therapist Suggested Activities">
                        <TextArea value={formData.section_f.therapist_suggested_activities} onChange={ro ? undefined : v => handleNestedChange('section_f', 'therapist_suggested_activities', v)} readOnly={ro} />
                    </FieldGroup></div>
                </SectionCard>

                {/* Submit */}
                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                    <button type="button" onClick={() => router.push(`/students/${studentId}`)}
                        style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", color: "#475569", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" }}>
                        {ro ? "Back to Profile" : "Cancel"}
                    </button>
                    {!ro && (
                        <button type="submit" disabled={loading}
                            style={{ padding: "10px 24px", borderRadius: "8px", border: "none", background: loading ? "#a5b4fc" : "#4f46e5", color: "white", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>
                            {loading ? "Submitting…" : "Submit Weekly Progress"}
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}

export default function SpecialistBInputPage() {
    return (
        <ProtectedRoute>
            <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>Loading form…</div>}>
                <SpecialistBFormContent />
            </Suspense>
        </ProtectedRoute>
    );
}
