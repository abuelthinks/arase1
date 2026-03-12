"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";

// ─── Shared helpers ────────────────────────────────────────────────────────────

function CheckboxItem({ label, checked, onChange, readOnly }: { label: string; checked: boolean; onChange: () => void; readOnly?: boolean }) {
    return (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem", cursor: readOnly ? "default" : "pointer", color: "var(--text-primary)", userSelect: "none" }}>
            <input type="checkbox" checked={checked} onChange={readOnly ? undefined : onChange} readOnly={readOnly} style={{ width: 16, height: 16, accentColor: "#4f46e5", cursor: readOnly ? "default" : "pointer" }} />
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
            <p style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "#6366f1", marginBottom: "8px" }}>{label}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>{children}</div>
        </div>
    );
}

function TextArea({ value, onChange, placeholder, readOnly }: { value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean }) {
    return (
        <textarea
            value={value}
            onChange={onChange ? e => onChange(e.target.value) : undefined}
            readOnly={readOnly}
            placeholder={placeholder}
            rows={3}
            style={{
                width: "100%", borderRadius: "8px", border: "1px solid #e2e8f0",
                padding: "10px 12px", fontSize: "0.875rem", resize: "vertical",
                color: "var(--text-primary)", background: readOnly ? "#f8fafc" : "white",
                boxSizing: "border-box"
            }}
        />
    );
}

// ─── Default form state ─────────────────────────────────────────────────────

function defaultForm() {
    return {
        // Section A
        a2_verification: "" as "matches" | "corrections" | "",
        a2_correction_notes: "",
        a3_reports_reviewed: [] as string[],
        a3_notes: "",
        // Section B
        b1_milestones: [] as string[],
        b2_developmental_concerns: [] as string[],
        // Section C – SLP
        c1_expressive: [] as string[],
        c2_receptive: [] as string[],
        c3_articulation: [] as string[],
        c4_pragmatics: [] as string[],
        c_notes: "",
        // Section D – OT
        d1_fine_motor: [] as string[],
        d2_sensory: [] as string[],
        d3_adls: [] as string[],
        d4_regulation: [] as string[],
        d_notes: "",
        // Section E – PT
        e1_gross_motor: [] as string[],
        e2_strength: [] as string[],
        e3_posture: [] as string[],
        e4_motor_planning: [] as string[],
        e_notes: "",
        // Section F – Psychology
        f1_behavior: [] as string[],
        f2_emotional: [] as string[],
        f3_cognitive: [] as string[],
        f4_autism: [] as string[],
        f_notes: "",
        // Section G – Summary
        g1_slp_summary: "",
        g1_ot_summary: "",
        g1_pt_summary: "",
        g1_psych_summary: "",
        g2_strengths: [] as string[],
        g3_needs: [] as string[],
        g4_frequency: [] as string[],
        g5_follow_up: [] as string[],
    };
}

type FormState = ReturnType<typeof defaultForm>;

function toggle(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}

// ─── Main component ──────────────────────────────────────────────────────────

function SpecialistAFormContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const studentId = searchParams.get("studentId");
    const isViewMode = searchParams.get("mode") === "view";
    const submissionId = searchParams.get("submissionId");

    const [form, setForm] = useState<FormState>(defaultForm());
    const [parentInfo, setParentInfo] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [reportCycleId, setReportCycleId] = useState("1");

    // Load existing submission in view mode
    useEffect(() => {
        if (isViewMode && submissionId) {
            api.get(`/api/inputs/multidisciplinary-assessment/${submissionId}/`)
                .then(res => {
                    const fd = res.data.form_data;
                    if (fd?.v2) setForm(fd.v2);
                })
                .catch(console.error);
        }
        // Always load student profile to get parent info for Section A1
        // (needed in both fill mode and view mode)
        if (studentId) {
            api.get(`/api/students/${studentId}/profile/`)
                .then(res => {
                    if (!isViewMode && res.data.active_cycle?.id) {
                        setReportCycleId(String(res.data.active_cycle.id));
                    }
                    // Pull parent-provided info to display in Section A1
                    const pa = res.data.form_statuses?.parent_assessment;
                    if (pa?.submitted && pa.id) {
                        api.get(`/api/inputs/parent-assessment/${pa.id}/`).then(r => {
                            const pfd = r.data.form_data;
                            setParentInfo(pfd?.v2 ?? pfd ?? {});
                        });
                    }
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
            await api.post("/api/inputs/multidisciplinary-assessment/", {
                student: studentId,
                report_cycle: reportCycleId,
                form_data: { v2: form }
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
                    Multidisciplinary Assessment Form {ro && <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginLeft: "8px" }}>— Read Only</span>}
                </h1>
                {ro && <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px" }}>Past submission — read only.</p>}
            </div>

            {/* SECTION A: Background */}
            <SectionCard title="Section A — Background (Parent Input + Therapist Verification)" subtitle="A1 is auto-filled from parent submission. Complete A2 and A3.">
                {/* A1 Read-only parent info */}
                <FieldGroup label="A1. Parent-Provided Information (Auto-filled)">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        {[
                            ["Child Name", `${parentInfo.first_name || ""} ${parentInfo.last_name || ""}`.trim() || "—"],
                            ["Date of Birth", parentInfo.date_of_birth || "—"],
                            ["Gender", parentInfo.gender || "—"],
                            ["Grade/Level", parentInfo.grade || "—"],
                            ["Primary Language", (parentInfo.primary_language || []).join(", ") || "—"],
                            ["Medical Alerts", parentInfo.medical_alerts || "—"],
                            ["Known Diagnoses", (parentInfo.known_conditions || []).join(", ") || "—"],
                        ].map(([label, value]) => (
                            <div key={label} style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", margin: "0 0 2px" }}>{label}</p>
                                <p style={{ fontSize: "0.875rem", color: "var(--text-primary)", margin: 0, fontWeight: 500 }}>{value}</p>
                            </div>
                        ))}
                    </div>
                    {parentInfo.primary_concerns && (
                        <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                            <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", margin: "0 0 2px" }}>Parent Concerns</p>
                            <p style={{ fontSize: "0.875rem", color: "var(--text-primary)", margin: 0 }}>{(parentInfo.primary_concerns || []).join(", ") || "—"}</p>
                        </div>
                    )}
                    {parentInfo.primary_goals && (
                        <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                            <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", margin: "0 0 2px" }}>Parent Goals</p>
                            <p style={{ fontSize: "0.875rem", color: "var(--text-primary)", margin: 0 }}>{parentInfo.primary_goals || "—"}</p>
                        </div>
                    )}
                </FieldGroup>

                <FieldGroup label="A2. Therapist Verification">
                    {[["matches", "Matches parent input"], ["corrections", "Corrections needed"]].map(([val, label]) => (
                        <CheckboxItem key={val} label={label} checked={form.a2_verification === val} readOnly={ro}
                            onChange={() => set("a2_verification", form.a2_verification === val ? "" : val)} />
                    ))}
                    <TextArea value={form.a2_correction_notes} onChange={ro ? undefined : v => set("a2_correction_notes", v)} placeholder="Correction notes…" readOnly={ro} />
                </FieldGroup>

                <FieldGroup label="A3. Additional Clinical Notes">
                    {["Medical reports reviewed", "Previous therapy reports reviewed", "School reports reviewed"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.a3_reports_reviewed.includes(item)} readOnly={ro}
                            onChange={() => tog("a3_reports_reviewed", item)} />
                    ))}
                    <TextArea value={form.a3_notes} onChange={ro ? undefined : v => set("a3_notes", v)} placeholder="Notes…" readOnly={ro} />
                </FieldGroup>
            </SectionCard>

            {/* SECTION B: Developmental Screening */}
            <SectionCard title="Section B — Developmental Screening">
                <FieldGroup label="B1. Developmental Milestones Achieved">
                    {["Sat independently", "Crawled", "Walked", "First words", "Combined words", "Toilet trained", "Feeding independently"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.b1_milestones.includes(item)} readOnly={ro}
                            onChange={() => tog("b1_milestones", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="B2. Observed Developmental Concerns">
                    {["Delayed speech", "Motor concerns", "Sensory issues", "Emotional regulation issues", "Behavioral concerns", "Social challenges", "Repetitive behaviors"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.b2_developmental_concerns.includes(item)} readOnly={ro}
                            onChange={() => tog("b2_developmental_concerns", item)} />
                    ))}
                </FieldGroup>
            </SectionCard>

            {/* SECTION C: SLP */}
            <SectionCard title="Section C — Speech & Language Pathology (SLP) Assessment">
                <FieldGroup label="C1. Expressive Language">
                    {["Babbling", "Single words", "Phrases", "Full sentences", "Limited vocabulary", "Echolalia", "Age-appropriate"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.c1_expressive.includes(item)} readOnly={ro}
                            onChange={() => tog("c1_expressive", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="C2. Receptive Language">
                    {["Responds to name", "Follows 1-step instructions", "Follows 2-step instructions", "Understands WH questions", "Limited comprehension"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.c2_receptive.includes(item)} readOnly={ro}
                            onChange={() => tog("c2_receptive", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="C3. Speech Sound / Articulation">
                    {["Clear", "Substitutions", "Omissions", "Lisp", "Stuttering"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.c3_articulation.includes(item)} readOnly={ro}
                            onChange={() => tog("c3_articulation", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="C4. Pragmatics / Social Communication">
                    {["Eye contact", "Turn-taking", "Joint attention"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.c4_pragmatics.includes(item)} readOnly={ro}
                            onChange={() => tog("c4_pragmatics", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="SLP Notes">
                    <TextArea value={form.c_notes} onChange={ro ? undefined : v => set("c_notes", v)} placeholder="SLP clinical notes…" readOnly={ro} />
                </FieldGroup>
            </SectionCard>

            {/* SECTION D: OT */}
            <SectionCard title="Section D — Occupational Therapy (OT) Assessment">
                <FieldGroup label="D1. Fine Motor Skills">
                    {["Pencil grasp", "Hand dominance", "Manipulates small objects", "Hand strength concerns"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.d1_fine_motor.includes(item)} readOnly={ro}
                            onChange={() => tog("d1_fine_motor", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="D2. Sensory Processing">
                    {["Auditory sensitivity", "Tactile sensitivity", "Seeks movement", "Avoids textures"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.d2_sensory.includes(item)} readOnly={ro}
                            onChange={() => tog("d2_sensory", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="D3. Activities of Daily Living (ADLs)">
                    {["Feeding independence", "Dressing", "Grooming", "Toileting"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.d3_adls.includes(item)} readOnly={ro}
                            onChange={() => tog("d3_adls", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="D4. Emotional / Self-Regulation">
                    {["Identifies feelings", "Uses calming strategies", "Impulsive behavior"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.d4_regulation.includes(item)} readOnly={ro}
                            onChange={() => tog("d4_regulation", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="OT Notes">
                    <TextArea value={form.d_notes} onChange={ro ? undefined : v => set("d_notes", v)} placeholder="OT clinical notes…" readOnly={ro} />
                </FieldGroup>
            </SectionCard>

            {/* SECTION E: PT */}
            <SectionCard title="Section E — Physical Therapy (PT) Assessment">
                <FieldGroup label="E1. Gross Motor Skills">
                    {["Sitting balance", "Walking gait", "Running", "Jumping"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.e1_gross_motor.includes(item)} readOnly={ro}
                            onChange={() => tog("e1_gross_motor", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="E2. Strength & Endurance">
                    {["Core weakness", "Tires easily", "Difficulty with stairs"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.e2_strength.includes(item)} readOnly={ro}
                            onChange={() => tog("e2_strength", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="E3. Posture & Alignment">
                    {["Toe-walking", "Flat feet", "Poor posture"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.e3_posture.includes(item)} readOnly={ro}
                            onChange={() => tog("e3_posture", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="E4. Motor Planning & Coordination">
                    {["Difficulty imitating movements", "Clumsy", "Poor coordination"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.e4_motor_planning.includes(item)} readOnly={ro}
                            onChange={() => tog("e4_motor_planning", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="PT Notes">
                    <TextArea value={form.e_notes} onChange={ro ? undefined : v => set("e_notes", v)} placeholder="PT clinical notes…" readOnly={ro} />
                </FieldGroup>
            </SectionCard>

            {/* SECTION F: Psychology */}
            <SectionCard title="Section F — Psychology / Behavioral Assessment">
                <FieldGroup label="F1. Behavioral Observations">
                    {["Inattentive", "Hyperactive", "Impulsive", "Withdrawn", "Aggressive"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.f1_behavior.includes(item)} readOnly={ro}
                            onChange={() => tog("f1_behavior", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="F2. Emotional Functioning">
                    {["Anxiety", "Mood changes", "Easily overwhelmed"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.f2_emotional.includes(item)} readOnly={ro}
                            onChange={() => tog("f2_emotional", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="F3. Cognitive / Play Skills Screening">
                    {["Memory", "Problem-solving", "Academic readiness"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.f3_cognitive.includes(item)} readOnly={ro}
                            onChange={() => tog("f3_cognitive", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="F4. Autism Characteristics Screening">
                    {["Reduced eye contact", "Repetitive behaviors", "Restricted interests"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.f4_autism.includes(item)} readOnly={ro}
                            onChange={() => tog("f4_autism", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="Psychologist Notes">
                    <TextArea value={form.f_notes} onChange={ro ? undefined : v => set("f_notes", v)} placeholder="Psychology clinical notes…" readOnly={ro} />
                </FieldGroup>
            </SectionCard>

            {/* SECTION G: Summary */}
            <SectionCard title="Section G — Multidisciplinary Summary & Recommendations">
                <FieldGroup label="G1. Discipline Summaries">
                    {[
                        ["SLP Summary", "g1_slp_summary", "Speech & Language observations and conclusions…"],
                        ["OT Summary", "g1_ot_summary", "Occupational Therapy observations and conclusions…"],
                        ["PT Summary", "g1_pt_summary", "Physical Therapy observations and conclusions…"],
                        ["Psych Summary", "g1_psych_summary", "Psychology observations and conclusions…"],
                    ].map(([label, key, placeholder]) => (
                        <div key={key}>
                            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>{label}</p>
                            <TextArea value={form[key as keyof FormState] as string} onChange={ro ? undefined : v => set(key as keyof FormState, v)} placeholder={placeholder} readOnly={ro} />
                        </div>
                    ))}
                </FieldGroup>
                <FieldGroup label="G2. Unified Strengths">
                    {["Visual learner", "Good memory", "Cooperative", "Motivated"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.g2_strengths.includes(item)} readOnly={ro}
                            onChange={() => tog("g2_strengths", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="G3. Unified Needs">
                    {["Speech therapy", "Occupational therapy", "Physical therapy", "Behavioral intervention"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.g3_needs.includes(item)} readOnly={ro}
                            onChange={() => tog("g3_needs", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="G4. Recommended Therapy Frequency">
                    {["1× weekly", "2× weekly", "3× weekly", "Intensive program"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.g4_frequency.includes(item)} readOnly={ro}
                            onChange={() => tog("g4_frequency", item)} />
                    ))}
                </FieldGroup>
                <FieldGroup label="G5. Follow-Up Plan">
                    {["Start intervention", "Monthly monitoring", "Provide home activities", "Refer to specialist"].map(item => (
                        <CheckboxItem key={item} label={item} checked={form.g5_follow_up.includes(item)} readOnly={ro}
                            onChange={() => tog("g5_follow_up", item)} />
                    ))}
                </FieldGroup>
            </SectionCard>

            {/* Messages & Submit */}
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
                        style={{ padding: "10px 24px", borderRadius: "8px", border: "none", background: loading ? "#a5b4fc" : "#4f46e5", color: "white", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>
                        {loading ? "Submitting…" : "Submit Assessment"}
                    </button>
                </div>
            )}
        </div>
    );
}

export default function SpecialistAForm() {
    return (
        <ProtectedRoute>
            <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>Loading form…</div>}>
                <SpecialistAFormContent />
            </Suspense>
        </ProtectedRoute>
    );
}
