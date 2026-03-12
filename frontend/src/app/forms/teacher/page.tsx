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
                style={{ width: 16, height: 16, accentColor: "#0ea5e9", cursor: readOnly ? "default" : "pointer" }} />
            {label}
        </label>
    );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div style={{ background: "white", borderRadius: "14px", border: "1px solid var(--border-light)", overflow: "hidden", marginBottom: "1.25rem" }}>
            <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border-light)", background: "#f0f9ff" }}>
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
            <p style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "#0ea5e9", marginBottom: "8px" }}>{label}</p>
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

function TextInput({ value, onChange, placeholder, readOnly }: { value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean }) {
    return (
        <input
            type="text"
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
        // Section A (some auto-filled, teacher fills teacher name + date)
        a_student_name: "",
        a_date_of_birth: "",
        a_grade: "",
        a_teacher_name: "",
        a_date_of_assessment: "",
        a_primary_language: "",
        // Section B
        b1_observation_context: [] as string[],
        b2_general_behavior: [] as string[],
        b2_notes: "",
        // Section C
        c1_literacy: [] as string[],
        c1_notes: "",
        c2_numeracy: [] as string[],
        c2_notes: "",
        c3_pre_academic: [] as string[],
        c3_notes: "",
        // Section D
        d1_attention: [] as string[],
        d1_notes: "",
        d2_task_completion: [] as string[],
        d2_notes: "",
        // Section E
        e1_social_skills: [] as string[],
        e1_notes: "",
        e2_play_skills: [] as string[],
        e2_notes: "",
        // Section F
        f1_behavior_patterns: [] as string[],
        f1_notes: "",
        f2_emotional_regulation: [] as string[],
        f2_notes: "",
        // Section G
        g1_learning_style: [] as string[],
        g2_classroom_supports: [] as string[],
        g2_notes: "",
        // Section H
        h_modifications: [] as string[],
        h_notes: "",
        // Section I
        i1_summary: "",
        i2_strengths: [] as string[],
        i3_priority_needs: [] as string[],
        i4_frequency: [] as string[],
        i5_next_steps: [] as string[],
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
                    const { student, active_cycle } = res.data;
                    if (active_cycle?.id) setReportCycleId(String(active_cycle.id));
                    setForm(prev => ({
                        ...prev,
                        a_student_name: `${student.first_name} ${student.last_name}`.trim(),
                        a_date_of_birth: student.date_of_birth || "",
                        a_grade: student.grade || "",
                        a_date_of_assessment: new Date().toISOString().slice(0, 10),
                    }));
                })
                .catch(console.error);
        }
    }, [studentId, isViewMode, submissionId]);

    const set = (key: keyof FormState, val: any) => setForm(prev => ({ ...prev, [key]: val }));
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

    return (
        <div style={{ maxWidth: "860px", margin: "0 auto", paddingBottom: "3rem" }}>
            {/* Header */}
            <div style={{ marginBottom: "1.5rem" }}>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
                    SPED / Educational Assessment Form{ro && <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginLeft: "8px" }}>— Read Only</span>}
                </h1>
                {ro && <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px" }}>Past submission — read only.</p>}
            </div>

            {/* SECTION A: Student Information */}
            <SectionCard title="Section A — Student Information" subtitle="Student details auto-filled from profile. Complete teacher name and assessment date.">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    {[
                        ["Student Name", "a_student_name", "Full name"],
                        ["Date of Birth", "a_date_of_birth", "dd/mm/yyyy"],
                        ["Grade / Level", "a_grade", "e.g. Pre-K"],
                        ["Teacher / SPED Teacher", "a_teacher_name", "Your name"],
                        ["Date of Assessment", "a_date_of_assessment", "dd/mm/yyyy"],
                        ["Primary Language", "a_primary_language", "e.g. English"],
                    ].map(([label, key, placeholder]) => (
                        <div key={key}>
                            <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>{label}</p>
                            <TextInput
                                value={form[key as keyof FormState] as string}
                                onChange={ro || ["a_student_name","a_date_of_birth","a_grade"].includes(key) ? undefined : v => set(key as keyof FormState, v)}
                                placeholder={placeholder}
                                readOnly={ro || ["a_student_name","a_date_of_birth","a_grade"].includes(key)}
                            />
                        </div>
                    ))}
                </div>
            </SectionCard>

            {/* SECTION B: Classroom Observation */}
            <SectionCard title="Section B — Classroom Observation Summary" subtitle="Completed by SPED teacher or shadow teacher.">
                <FieldGroup label="B1. Observation Context">
                    {["Circle time", "Free play", "Lesson time", "Table task", "Outdoor play", "Transitions", "Meal/snack time"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.b1_observation_context.includes(item)} readOnly={ro}
                            onChange={() => tog("b1_observation_context", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="B2. General Behavior During Observation">
                    {["Calm", "Engaged", "Distracted", "Fidgety", "Hyperactive", "Withdrawn", "Anxious", "Requires prompting", "Needs 1:1 support", "Works independently"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.b2_general_behavior.includes(item)} readOnly={ro}
                            onChange={() => tog("b2_general_behavior", item)} />
                    ))}
                    <TextArea value={form.b2_notes} onChange={ro ? undefined : v => set("b2_notes", v)} placeholder="Observation notes…" readOnly={ro} />
                </FieldGroup>
            </SectionCard>

            {/* SECTION C: Academic Skills */}
            <SectionCard title="Section C — Academic Skills Screening">
                <FieldGroup label="C1. Literacy">
                    {["Recognizes alphabet", "Recognizes letter sounds", "Matches letters to objects/sounds", "Reads CVC words", "Reads simple sentences",
                      "Unable to read", "Struggles with phonics", "Struggles with blending", "Difficulty writing letters", "Writes name independently"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.c1_literacy.includes(item)} readOnly={ro}
                            onChange={() => tog("c1_literacy", item)} />
                    ))}
                    <TextArea value={form.c1_notes} onChange={ro ? undefined : v => set("c1_notes", v)} placeholder="Literacy notes…" readOnly={ro} rows={2} />
                </FieldGroup>
                <FieldGroup label="C2. Numeracy">
                    {["Recognizes numbers (1–10)", "Recognizes numbers (1–20)", "Counts accurately", "Understands quantity", "Matches number to quantity",
                      "Basic addition", "Basic subtraction", "Difficulty understanding number concepts"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.c2_numeracy.includes(item)} readOnly={ro}
                            onChange={() => tog("c2_numeracy", item)} />
                    ))}
                    <TextArea value={form.c2_notes} onChange={ro ? undefined : v => set("c2_notes", v)} placeholder="Numeracy notes…" readOnly={ro} rows={2} />
                </FieldGroup>
                <FieldGroup label="C3. Pre-Academic Skills">
                    {["Coloring within shapes", "Tracing lines and shapes", "Sorting by shape/color/size", "Matching pictures",
                      "Completing patterns", "Puzzle skills", "Needs support with pre-academic tasks"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.c3_pre_academic.includes(item)} readOnly={ro}
                            onChange={() => tog("c3_pre_academic", item)} />
                    ))}
                    <TextArea value={form.c3_notes} onChange={ro ? undefined : v => set("c3_notes", v)} placeholder="Pre-academic notes…" readOnly={ro} rows={2} />
                </FieldGroup>
            </SectionCard>

            {/* SECTION D: Learning Behaviours */}
            <SectionCard title="Section D — Learning Behaviors">
                <FieldGroup label="D1. Attention & Focus">
                    {["Listens to instruction", "Sustains attention (2–5 mins)", "Easily distracted", "Needs constant redirection",
                      "Leaves seat frequently", "Requires movement breaks", "Attends better with visuals", "Shows good focus during preferred tasks"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.d1_attention.includes(item)} readOnly={ro}
                            onChange={() => tog("d1_attention", item)} />
                    ))}
                    <TextArea value={form.d1_notes} onChange={ro ? undefined : v => set("d1_notes", v)} placeholder="Attention notes…" readOnly={ro} rows={2} />
                </FieldGroup>
                <FieldGroup label="D2. Task Completion">
                    {["Completes tasks independently", "Completes with minimal cues", "Needs moderate support", "Needs 1:1 assistance",
                      "Refuses tasks", "Gives up easily", "Needs frequent breaks"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.d2_task_completion.includes(item)} readOnly={ro}
                            onChange={() => tog("d2_task_completion", item)} />
                    ))}
                    <TextArea value={form.d2_notes} onChange={ro ? undefined : v => set("d2_notes", v)} placeholder="Task completion notes…" readOnly={ro} rows={2} />
                </FieldGroup>
            </SectionCard>

            {/* SECTION E: Social & Peer Interaction */}
            <SectionCard title="Section E — Social & Peer Interaction">
                <FieldGroup label="E1. Social Skills">
                    {["Responds when called", "Greets peers/adults", "Initiates interaction", "Joins group activities",
                      "Maintains conversation (age-appropriate)", "Avoids peers", "Prefers solitary play", "Parallel play only",
                      "Limited interaction", "Conflict with peers (hitting, pushing, etc.)"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.e1_social_skills.includes(item)} readOnly={ro}
                            onChange={() => tog("e1_social_skills", item)} />
                    ))}
                    <TextArea value={form.e1_notes} onChange={ro ? undefined : v => set("e1_notes", v)} placeholder="Social skills notes…" readOnly={ro} rows={2} />
                </FieldGroup>
                <FieldGroup label="E2. Play Skills">
                    {["Pretend play", "Cooperative play", "Turn-taking", "Follows play routines", "Plays imaginatively",
                      "Engages only in repetitive play", "Difficulty sharing", "Difficulty following play rules"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.e2_play_skills.includes(item)} readOnly={ro}
                            onChange={() => tog("e2_play_skills", item)} />
                    ))}
                    <TextArea value={form.e2_notes} onChange={ro ? undefined : v => set("e2_notes", v)} placeholder="Play skills notes…" readOnly={ro} rows={2} />
                </FieldGroup>
            </SectionCard>

            {/* SECTION F: Behavioral Observation */}
            <SectionCard title="Section F — Behavioral Observation">
                <FieldGroup label="F1. Behavior Patterns">
                    {["Cooperative", "Easily frustrated", "Has tantrums/meltdowns", "Aggressive behaviors",
                      "Self-stimulatory behaviors", "Non-compliant", "Sensitive to correction", "Needs predictable routines"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.f1_behavior_patterns.includes(item)} readOnly={ro}
                            onChange={() => tog("f1_behavior_patterns", item)} />
                    ))}
                    <TextArea value={form.f1_notes} onChange={ro ? undefined : v => set("f1_notes", v)} placeholder="Behavior pattern notes…" readOnly={ro} rows={2} />
                </FieldGroup>
                <FieldGroup label="F2. Emotional Regulation">
                    {["Identifies feelings", "Calms with support", "Uses coping tools", "Sudden mood shifts",
                      "Anxiety or fear responses", "Withdraws when overwhelmed", "Overreacts to changes", "Difficulty waiting"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.f2_emotional_regulation.includes(item)} readOnly={ro}
                            onChange={() => tog("f2_emotional_regulation", item)} />
                    ))}
                    <TextArea value={form.f2_notes} onChange={ro ? undefined : v => set("f2_notes", v)} placeholder="Emotional regulation notes…" readOnly={ro} rows={2} />
                </FieldGroup>
            </SectionCard>

            {/* SECTION G: Learning Style & Support Needs */}
            <SectionCard title="Section G — Learning Style & Support Needs">
                <FieldGroup label="G1. Learning Style">
                    {["Visual learner", "Auditory learner", "Kinesthetic learner", "Hands-on learner", "Technology-assisted learner"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.g1_learning_style.includes(item)} readOnly={ro}
                            onChange={() => tog("g1_learning_style", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="G2. Classroom Supports Needed">
                    {["Visual schedule", "Task breakdowns", "First–Then board", "Behavior chart", "Sensory break",
                      "1:1 shadow teacher", "Small-group instruction", "Modified lesson materials", "Extended time", "Reduced workload"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.g2_classroom_supports.includes(item)} readOnly={ro}
                            onChange={() => tog("g2_classroom_supports", item)} />
                    ))}
                    <TextArea value={form.g2_notes} onChange={ro ? undefined : v => set("g2_notes", v)} placeholder="Support notes…" readOnly={ro} rows={2} />
                </FieldGroup>
            </SectionCard>

            {/* SECTION H: Academic Modifications */}
            <SectionCard title="Section H — Academic Modifications / Accommodations">
                {["Simplified instructions", "Extra processing time", "Preferential seating", "Reduced distractions", "Modified worksheets",
                  "Use of pictures/symbols", "Assistive technology", "Visual timers", "Quiet corner", "Behavior reinforcement plan"].map(item => (
                    <CheckboxItem key={item} label={item} checked={form.h_modifications.includes(item)} readOnly={ro}
                        onChange={() => tog("h_modifications", item)} />
                ))}
                <TextArea value={form.h_notes} onChange={ro ? undefined : v => set("h_notes", v)} placeholder="Modifications notes…" readOnly={ro} rows={2} />
            </SectionCard>

            {/* SECTION I: Summary & Recommendations */}
            <SectionCard title="Section I — SPED Teacher Summary & Recommendations">
                <FieldGroup label="I1. Summary of Findings">
                    <TextArea value={form.i1_summary} onChange={ro ? undefined : v => set("i1_summary", v)}
                        placeholder="Summarize key findings from the assessment…" readOnly={ro} rows={5} />
                </FieldGroup>
                <FieldGroup label="I2. Strengths">
                    {["Socially motivated", "Eager to learn", "Visual learner", "Strong memory", "Creative", "Follows routines well"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.i2_strengths.includes(item)} readOnly={ro}
                            onChange={() => tog("i2_strengths", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="I3. Priority Needs">
                    {["Reading intervention", "Phonics development", "Math foundations", "Writing readiness",
                      "Behavior support", "Classroom inclusion support", "Emotional regulation", "Shadow teacher support"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.i3_priority_needs.includes(item)} readOnly={ro}
                            onChange={() => tog("i3_priority_needs", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="I4. Recommended SPED Intervention Frequency">
                    {["1× weekly", "2× weekly", "3× weekly", "Daily support", "Modified curriculum program",
                      "Inclusion with accommodations", "Home-based learning plan"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.i4_frequency.includes(item)} readOnly={ro}
                            onChange={() => tog("i4_frequency", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="I5. Next Steps">
                    {["Begin SPED program", "Develop IEP (Theruni Premium)", "Conduct formal academic testing",
                      "Parent conference", "Collaboration with SLP/OT/PT/Psych", "Provide home strategies"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.i5_next_steps.includes(item)} readOnly={ro}
                            onChange={() => tog("i5_next_steps", item)} />
                    ))}
                </FieldGroup>
            </SectionCard>

            {/* Feedback */}
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

            {!ro && (
                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                    <button onClick={() => router.back()}
                        style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "white", color: "var(--text-secondary)", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" }}>
                        Cancel
                    </button>
                    <button onClick={handleSubmit} disabled={loading}
                        style={{ padding: "10px 24px", borderRadius: "8px", border: "none", background: loading ? "#7dd3fc" : "#0ea5e9", color: "white", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>
                        {loading ? "Submitting…" : "Submit Assessment"}
                    </button>
                </div>
            )}
        </div>
    );
}

export default function TeacherForm() {
    return (
        <ProtectedRoute>
            <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>Loading form…</div>}>
                <TeacherFormContent />
            </Suspense>
        </ProtectedRoute>
    );
}
