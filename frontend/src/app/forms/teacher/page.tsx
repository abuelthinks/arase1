"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";

// ─── Shared UI ───────────────────────────────────────────────────────────────

function CheckboxItem({ label, checked, onChange, readOnly }: { label: string; checked: boolean; onChange: () => void; readOnly?: boolean }) {
    return (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem", cursor: readOnly ? "default" : "pointer", color: "var(--text-primary)", userSelect: "none" }}>
            <input type="checkbox" checked={checked} onChange={readOnly ? undefined : onChange} readOnly={readOnly}
                style={{ width: 16, height: 16, accentColor: "#4f46e5", cursor: readOnly ? "default" : "pointer" }} />
            {label}
        </label>
    );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div style={{ background: "white", borderRadius: "14px", border: "1px solid var(--border-light)", overflow: "hidden", marginBottom: "1.25rem" }}>
            <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border-light)", background: "#f8fafc" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</h2>
                {subtitle && <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "2px 0 0" }}>{subtitle}</p>}
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
            <p style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "#4f46e5", marginBottom: "8px" }}>{label}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>{children}</div>
        </div>
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
                padding: "10px 12px", fontSize: "0.875rem", resize: "vertical",
                color: "var(--text-primary)", background: readOnly ? "#f8fafc" : "white",
                boxSizing: "border-box"
            }}
        />
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
                color: "var(--text-primary)", background: readOnly ? "#f8fafc" : "white",
                boxSizing: "border-box"
            }}
        />
    );
}

// ─── Form state ──────────────────────────────────────────────────────────────

function defaultForm() {
    return {
        // Section A
        student_name: "",
        date: "",
        sped_teacher: "",
        shadow_teacher: "",
        week_month_tracking: "",
        class_level: "",
        
        // Section B
        b1_attendance: [] as string[],
        b2_participation: [] as string[],
        b_notes: "",

        // Section C
        c1_literacy: [] as string[],
        c1_notes: "",
        c2_numeracy: [] as string[],
        c2_notes: "",
        c3_pre_academic: [] as string[],
        c3_notes: "",

        // Section D
        d1_focus: [] as string[],
        d2_task_completion: [] as string[],
        d_notes: "",

        // Section E
        e1_peer_interaction: [] as string[],
        e2_social_skills: [] as string[],
        e_notes: "",

        // Section F
        f1_behavior: [] as string[],
        f2_emotional_regulation: [] as string[],
        f_notes: "",

        // Section G
        g1_independence: [] as string[],
        g2_life_skills: [] as string[],
        g_notes: "",

        // Section H (GAS)
        h_goal_1: "",
        h_goal_2: "",
        h_goal_3: "",
        h_goal_4: "",
        h_comments: "",

        // Section I
        i1_classroom_recs: [] as string[],
        i2_home_support_recs: [] as string[],
        i_notes: ""
    };
}

type FormState = ReturnType<typeof defaultForm>;

function toggle(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}

// ─── Main ────────────────────────────────────────────────────────────────────

function TeacherFormContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const studentId = searchParams.get("studentId");
    const isViewMode = searchParams.get("mode") === "view";
    const submissionId = searchParams.get("submissionId");

    const [form, setForm] = useState<FormState>(defaultForm());
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [reportCycleId, setReportCycleId] = useState("1");
    const [studentProfile, setStudentProfile] = useState<any>(null);

    // Load existing submission (view mode) or auto-fill student info (fill mode)
    useEffect(() => {
        if (isViewMode && submissionId) {
            api.get(`/api/inputs/sped-assessment/${submissionId}/`)
                .then(res => {
                    const fd = res.data.form_data;
                    if (fd?.v2) setForm(fd.v2);
                })
                .catch(console.error);
            return;
        }
        if (studentId) {
            api.get(`/api/students/${studentId}/profile/`)
                .then(res => {
                    if (!isViewMode && res.data?.student?.status !== "Enrolled") {
                        alert("This progress tracking form is locked until the student is formally enrolled.");
                        router.push(`/students/${studentId}`);
                        return;
                    }

                    const { student, active_cycle } = res.data;
                    setStudentProfile(res.data);
                    if (active_cycle?.id) setReportCycleId(String(active_cycle.id));
                    setForm(prev => ({
                        ...prev,
                        student_name: `${student.first_name} ${student.last_name}`.trim(),
                        date: new Date().toISOString().slice(0, 10),
                    }));
                })
                .catch(console.error);
        }
    }, [studentId, isViewMode, submissionId]);

    const set = (key: keyof FormState, val: string) => setForm(prev => ({ ...prev, [key]: val }));
    const tog = (key: keyof FormState, val: string) => setForm(prev => ({ ...prev, [key]: toggle(prev[key] as string[], val) }));

    const handleSubmit = async () => {
        if (!studentId) { setErrorMsg("No student selected."); return; }
        setLoading(true); setErrorMsg(""); setSuccessMsg("");
        try {
            await api.post("/api/inputs/sped-assessment/", {
                student: studentId,
                report_cycle: reportCycleId,
                form_data: { v2: form },
            });
            setSuccessMsg("Assessment submitted successfully!");
            setTimeout(() => router.back(), 1500);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.detail || "Submission failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const ro = isViewMode;

    const OPTIONS = {
        b1: ["Attended all sessions", "Partial attendance", "Absent", "Required shadow teacher support", "Independent participation"],
        b2: ["Fully engaged", "Engaged with minimal cues", "Needed moderate prompting", "Required full support", "Distracted easily", "Refused tasks"],
        c1: ["Letter recognition", "Letter sounds", "Sight words", "Blending CVC words", "Reading simple sentences", "Writing name", "Writing letters", "Difficulty retaining concepts", "Regression observed", "Improvement observed"],
        c2: ["Number recognition (1–10)", "Number recognition (11–20)", "Counting", "Matching number to quantity", "Basic addition", "Basic subtraction", "Sequencing numbers", "Difficulty understanding number concepts", "Improvement observed"],
        c3: ["Coloring", "Tracing", "Matching", "Sorting", "Patterning", "Puzzle completion", "Needs support with fine motor tasks", "Notable improvement", "Regression observed"],
        d1: ["Attentive", "Easily distracted", "Requires constant redirection", "Leaves seat often", "Sustains attention 2–5 minutes", "Sustains attention 5–10 minutes", "Focus improved"],
        d2: ["Independent", "Minimal prompts", "Moderate prompts", "Full assistance needed", "Incomplete tasks", "Refusal to work", "Significant improvement"],
        e1: ["Plays cooperatively", "Parallel play", "Initiates play", "Responds when approached", "Avoids peers", "Conflict with peers", "Aggressive behavior", "Improvement in social play"],
        e2: ["Takes turns", "Shares materials", "Engages in group activities", "Follows social rules", "Difficulty waiting", "Improved social awareness"],
        f1: ["Cooperative", "Easily frustrated", "Tantrums", "Emotional outbursts", "Non-compliant", "Sensory-seeking behaviors (running, tapping, etc.)", "Sensory-avoidance behaviors (covering ears, avoiding textures)"],
        f2: ["Calms independently", "Needs verbal cues to calm", "Needs sensory break", "Needs physical assistance", "Quickly overstimulated", "Improved regulation"],
        g1: ["Follows classroom schedule", "Transitions smoothly", "Needs visual schedule", "Needs First–Then board", "Needs constant prompting", "Uses coping strategies", "Improvement noted"],
        g2: ["Toilets independently", "Needs assistance toileting", "Uses utensils during snack", "Cleans up after activities", "Manages belongings", "Improvement noted"],
        gas: ["1 – No progress", "2 – Minimal progress", "3 – Expected progress", "4 – More than expected", "5 – Goal achieved"],
        i1: ["Continue same strategies", "Modify instructional materials", "Increase hands-on activities", "Provide additional visual aids", "Provide sensory supports", "Increase shadow teacher hours", "Recommend behavior plan", "Recommend literacy support", "Recommend numeracy support"],
        i2: ["Reading practice", "Math drills", "Sensory activities", "Fine motor practice", "Behavior strategies", "Social play activities", "Routine training"]
    };

    return (
        <div style={{ maxWidth: "860px", margin: "0 auto", paddingBottom: "3rem" }}>
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
                <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                    SPED Progress Tracking Form (Teacher Version){ro && <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginLeft: "8px" }}>— Read Only</span>}
                </h1>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                    {ro ? "Past submission — read only." : "Standalone for SPED classroom monitoring & IEP updates."}
                </p>
            </div>

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

            {/* SECTION A */}
            <SectionCard title="Section A — General Information">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <FieldGroup label="Student Name">
                        <TextInput value={form.student_name} readOnly={true} />
                    </FieldGroup>
                    <FieldGroup label="Date">
                        <TextInput type="date" value={form.date} onChange={ro ? undefined : v => set("date", v)} readOnly={ro} />
                    </FieldGroup>
                    <FieldGroup label="SPED Teacher / Inclusion Teacher">
                        <TextInput value={form.sped_teacher} onChange={ro ? undefined : v => set("sped_teacher", v)} readOnly={ro} />
                    </FieldGroup>
                    <FieldGroup label="Shadow Teacher (if any)">
                        <TextInput value={form.shadow_teacher} onChange={ro ? undefined : v => set("shadow_teacher", v)} readOnly={ro} />
                    </FieldGroup>
                    <FieldGroup label="Week / Month of Tracking">
                        <TextInput value={form.week_month_tracking} onChange={ro ? undefined : v => set("week_month_tracking", v)} readOnly={ro} />
                    </FieldGroup>
                    <FieldGroup label="Class/Level">
                        <TextInput value={form.class_level} onChange={ro ? undefined : v => set("class_level", v)} readOnly={ro} />
                    </FieldGroup>
                </div>
            </SectionCard>

            {/* SECTION B */}
            <SectionCard title="Section B — Classroom Participation">
                <FieldGroup label="B1. Attendance & Participation">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {OPTIONS.b1.map(opt => (
                            <CheckboxItem key={opt} label={opt} checked={form.b1_attendance.includes(opt)} onChange={() => tog("b1_attendance", opt)} readOnly={ro} />
                        ))}
                    </div>
                </FieldGroup>
                <div style={{ paddingTop: "12px" }}>
                    <FieldGroup label="B2. Engagement During Lessons">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.b2.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={form.b2_participation.includes(opt)} onChange={() => tog("b2_participation", opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup>
                </div>
                <div style={{ paddingTop: "12px" }}>
                    <FieldGroup label="Notes">
                        <TextArea value={form.b_notes} onChange={ro ? undefined : v => set("b_notes", v)} readOnly={ro} />
                    </FieldGroup>
                </div>
            </SectionCard>

            {/* SECTION C */}
            <SectionCard title="Section C — Academic Progress">
                <FieldGroup label="C1. Literacy">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {OPTIONS.c1.map(opt => (
                            <CheckboxItem key={opt} label={opt} checked={form.c1_literacy.includes(opt)} onChange={() => tog("c1_literacy", opt)} readOnly={ro} />
                        ))}
                    </div>
                    <div style={{ marginTop: "8px" }}><TextArea placeholder="Teacher Notes..." value={form.c1_notes} onChange={ro ? undefined : v => set("c1_notes", v)} readOnly={ro} /></div>
                </FieldGroup>

                <div style={{ paddingTop: "12px", borderTop: "1px dashed #e2e8f0" }}>
                    <FieldGroup label="C2. Numeracy">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.c2.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={form.c2_numeracy.includes(opt)} onChange={() => tog("c2_numeracy", opt)} readOnly={ro} />
                            ))}
                        </div>
                        <div style={{ marginTop: "8px" }}><TextArea placeholder="Teacher Notes..." value={form.c2_notes} onChange={ro ? undefined : v => set("c2_notes", v)} readOnly={ro} /></div>
                    </FieldGroup>
                </div>

                <div style={{ paddingTop: "12px", borderTop: "1px dashed #e2e8f0" }}>
                    <FieldGroup label="C3. Pre-Academic Skills">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.c3.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={form.c3_pre_academic.includes(opt)} onChange={() => tog("c3_pre_academic", opt)} readOnly={ro} />
                            ))}
                        </div>
                        <div style={{ marginTop: "8px" }}><TextArea placeholder="Teacher Notes..." value={form.c3_notes} onChange={ro ? undefined : v => set("c3_notes", v)} readOnly={ro} /></div>
                    </FieldGroup>
                </div>
            </SectionCard>

            {/* SECTION D */}
            <SectionCard title="Section D — Learning Behaviors">
                <FieldGroup label="D1. Focus & Attention">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {OPTIONS.d1.map(opt => (
                            <CheckboxItem key={opt} label={opt} checked={form.d1_focus.includes(opt)} onChange={() => tog("d1_focus", opt)} readOnly={ro} />
                        ))}
                    </div>
                </FieldGroup>
                <div style={{ paddingTop: "12px" }}>
                    <FieldGroup label="D2. Task Completion">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.d2.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={form.d2_task_completion.includes(opt)} onChange={() => tog("d2_task_completion", opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup>
                </div>
                <div style={{ paddingTop: "12px" }}>
                    <FieldGroup label="Teacher Notes">
                        <TextArea value={form.d_notes} onChange={ro ? undefined : v => set("d_notes", v)} readOnly={ro} />
                    </FieldGroup>
                </div>
            </SectionCard>

            {/* SECTION E */}
            <SectionCard title="Section E — Social Skills & Peer Interaction">
                <FieldGroup label="E1. Peer Interaction">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {OPTIONS.e1.map(opt => (
                            <CheckboxItem key={opt} label={opt} checked={form.e1_peer_interaction.includes(opt)} onChange={() => tog("e1_peer_interaction", opt)} readOnly={ro} />
                        ))}
                    </div>
                </FieldGroup>
                <div style={{ paddingTop: "12px" }}>
                    <FieldGroup label="E2. Functional Social Skills">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.e2.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={form.e2_social_skills.includes(opt)} onChange={() => tog("e2_social_skills", opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup>
                </div>
                <div style={{ paddingTop: "12px" }}>
                    <FieldGroup label="Teacher Notes">
                        <TextArea value={form.e_notes} onChange={ro ? undefined : v => set("e_notes", v)} readOnly={ro} />
                    </FieldGroup>
                </div>
            </SectionCard>

            {/* SECTION F */}
            <SectionCard title="Section F — Behavior & Emotional Regulation">
                <FieldGroup label="F1. Behavior Throughout the Week">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {OPTIONS.f1.map(opt => (
                            <CheckboxItem key={opt} label={opt} checked={form.f1_behavior.includes(opt)} onChange={() => tog("f1_behavior", opt)} readOnly={ro} />
                        ))}
                    </div>
                </FieldGroup>
                <div style={{ paddingTop: "12px" }}>
                    <FieldGroup label="F2. Emotional Regulation">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.f2.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={form.f2_emotional_regulation.includes(opt)} onChange={() => tog("f2_emotional_regulation", opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup>
                </div>
                <div style={{ paddingTop: "12px" }}>
                    <FieldGroup label="Teacher Notes">
                        <TextArea value={form.f_notes} onChange={ro ? undefined : v => set("f_notes", v)} readOnly={ro} />
                    </FieldGroup>
                </div>
            </SectionCard>

            {/* SECTION G */}
            <SectionCard title="Section G — Independence & Adaptive Skills">
                <FieldGroup label="G1. Independence in School Routines">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {OPTIONS.g1.map(opt => (
                            <CheckboxItem key={opt} label={opt} checked={form.g1_independence.includes(opt)} onChange={() => tog("g1_independence", opt)} readOnly={ro} />
                        ))}
                    </div>
                </FieldGroup>
                <div style={{ paddingTop: "12px" }}>
                    <FieldGroup label="G2. Life Skills (School Setting)">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.g2.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={form.g2_life_skills.includes(opt)} onChange={() => tog("g2_life_skills", opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup>
                </div>
                <div style={{ paddingTop: "12px" }}>
                    <FieldGroup label="Teacher Notes">
                        <TextArea value={form.g_notes} onChange={ro ? undefined : v => set("g_notes", v)} readOnly={ro} />
                    </FieldGroup>
                </div>
            </SectionCard>

            {/* SECTION H */}
            <SectionCard title="Section H — Goal Achievement (for IEP & AI)">
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
                    {['1', '2', '3', '4'].map((g, i) => (
                        <div key={g} style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                            <p style={{ fontSize: "0.85rem", fontWeight: 700, margin: "0 0 10px 0", color: "#1e293b" }}>Goal {g} Progress</p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                                {OPTIONS.gas.map(opt => (
                                    <label key={opt} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" }}>
                                        <input type="radio" checked={(form as any)[`h_goal_${g}`] === opt} onChange={() => ro ? undefined : set(`h_goal_${g}` as keyof FormState, opt)} disabled={ro} style={{ accentColor: "#4f46e5" }} />
                                        {opt}
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                    <div style={{ marginTop: "12px" }}>
                        <FieldGroup label="Comments">
                            <TextArea value={form.h_comments} onChange={ro ? undefined : v => set("h_comments", v)} readOnly={ro} rows={3} />
                        </FieldGroup>
                    </div>
                </div>
            </SectionCard>

            {/* SECTION I */}
            <SectionCard title="Section I — SPED Teacher Recommendations">
                <FieldGroup label="I1. Classroom Recommendations">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {OPTIONS.i1.map(opt => (
                            <CheckboxItem key={opt} label={opt} checked={form.i1_classroom_recs.includes(opt)} onChange={() => tog("i1_classroom_recs", opt)} readOnly={ro} />
                        ))}
                    </div>
                </FieldGroup>
                <div style={{ paddingTop: "12px" }}>
                    <FieldGroup label="I2. Home Support Recommendations">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {OPTIONS.i2.map(opt => (
                                <CheckboxItem key={opt} label={opt} checked={form.i2_home_support_recs.includes(opt)} onChange={() => tog("i2_home_support_recs", opt)} readOnly={ro} />
                            ))}
                        </div>
                    </FieldGroup>
                </div>
                <div style={{ paddingTop: "12px" }}>
                    <FieldGroup label="Teacher Notes">
                        <TextArea value={form.i_notes} onChange={ro ? undefined : v => set("i_notes", v)} readOnly={ro} />
                    </FieldGroup>
                </div>
            </SectionCard>

            {/* Form Footer */}
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => router.back()}
                    style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", color: "#475569", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" }}>
                    {ro ? "Back to Profile" : "Cancel"}
                </button>
                {!ro && (
                    <button onClick={handleSubmit} disabled={loading}
                        style={{ padding: "10px 24px", borderRadius: "8px", border: "none", background: loading ? "#a5b4fc" : "#4f46e5", color: "white", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>
                        {loading ? "Submitting…" : "Submit Assessment"}
                    </button>
                )}
            </div>
        </div>
    );
}

export default function TeacherInputPage() {
    return (
        <ProtectedRoute>
            <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>Loading Editor...</div>}>
                <TeacherFormContent />
            </Suspense>
        </ProtectedRoute>
    );
}
