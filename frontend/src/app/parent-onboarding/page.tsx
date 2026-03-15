"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import Link from "next/link";
import api from "@/lib/api";

// ── helpers ──────────────────────────────────────────────────────────────────

const Cb = ({
    label,
    checked,
    onChange,
    disabled,
}: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) => (
    <label className={`flex items-center gap-2 text-sm cursor-pointer select-none ${disabled ? "text-slate-400" : "text-slate-700"}`}>
        <input
            type="checkbox"
            checked={checked}
            onChange={e => onChange(e.target.checked)}
            disabled={disabled}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        {label}
    </label>
);

const toggle = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];

const SectionHeader = ({ title }: { title: string }) => (
    <h2 className="text-lg font-bold text-slate-800 border-b-2 border-blue-100 pb-2 mb-5">{title}</h2>
);

const Field = ({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) => (
    <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-slate-700">
            {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {children}
    </div>
);

const inputCls = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white disabled:bg-slate-50 disabled:text-slate-500";
const milestoneCls = "flex flex-wrap gap-3";

// ── initial state factory ─────────────────────────────────────────────────────

const initState = () => ({
    // Section A
    first_name: "", last_name: "", date_of_birth: "", gender: "",
    grade: "",
    parent_name: "", phone: "", email: "",
    primary_language: [] as string[], primary_language_other: "",
    medical_alerts: "", medical_alerts_detail: "",
    known_conditions: [] as string[], known_conditions_other: "",

    // Section B – milestones
    milestone_sitting: "", milestone_crawling: "", milestone_walking: "",
    milestone_first_words: "", milestone_phrases: "",
    previous_services: [] as string[],
    areas_of_concern: [] as string[], areas_of_concern_other: "",

    // Section C – parent input
    primary_concerns: [] as string[],
    goals_for_child: [] as string[], goals_other: "",
    strategies_home: [] as string[], strategies_other: "",

    // Section D – behaviour
    difficulties: [] as string[],
    triggers: [] as string[],
    calming_strategies: [] as string[],
    communication: [] as string[],
    social_interaction: [] as string[],
    comfort_setting: [] as string[],

    // Section E – sensory & physical
    sensitivities: [] as string[],
    motor_needs: [] as string[],
    physical_accommodations: "", physical_accommodations_detail: "",

    // Section F – goals
    goals_this_year: [] as string[], goals_this_year_other: "",
    goals_3_5_years: [] as string[], goals_3_5_years_other: "",

    // Section G – home environment
    home_strategies: [] as string[],
    support_needed: [] as string[], support_needed_other: "",

    // Section H – strengths
    strengths: [] as string[], strengths_other: "",

    // Section I – daily living
    eating: "", dressing: "", toilet: "", sleep: "",
    other_notes: "",
});

type FormState = ReturnType<typeof initState>;

// ── main component ────────────────────────────────────────────────────────────

function ParentFormContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isViewMode = searchParams.get("mode") === "view";
    const submissionId = searchParams.get("submissionId");
    const studentIdParam = searchParams.get("studentId");
    const draftKey = studentIdParam ? `parent_form_draft_v2_${studentIdParam}` : null;

    const [form, setForm] = useState<FormState>(initState());
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // ── setters ──────────────────────────────────────────────────────────────

    const set = (key: keyof FormState) => (val: any) =>
        setForm(prev => ({ ...prev, [key]: val }));

    const setArr = (key: keyof FormState) => (val: string) =>
        setForm(prev => ({ ...prev, [key]: toggle((prev[key] as string[]), val) }));

    const checked = (key: keyof FormState, val: string) =>
        ((form[key] as string[]) ?? []).includes(val);

    // ── lifecycle ─────────────────────────────────────────────────────────────

    useEffect(() => {
        if (isViewMode && submissionId) {
            api.get(`/api/inputs/parent-assessment/${submissionId}/`)
                .then(res => {
                    const fd = res.data.form_data;
                    if (!fd) return;
                    // New v2 format
                    if (fd.v2) {
                        setForm(fd.v2);
                    } else {
                        // Legacy format — map old fields into new state shape as best we can
                        setForm(prev => ({
                            ...prev,
                            first_name: fd.background?.first_name || "",
                            last_name: fd.background?.last_name || "",
                            date_of_birth: fd.background?.date_of_birth || "",
                            grade: fd.background?.grade || "",
                            parent_name: fd.background?.parent_guardian_name || "",
                            primary_language: fd.background?.primary_language ? [fd.background.primary_language] : [],
                            medical_alerts: fd.background?.medical_alerts || "",
                        }));
                    }
                })
                .catch(console.error);
            return;
        }

        // Restore draft first
        const draft = draftKey ? localStorage.getItem(draftKey) : null;
        if (draft) {
            try { setForm(JSON.parse(draft)); } catch {}
        }

        // Prefill from admin-registered student data
        if (studentIdParam) {
            api.get(`/api/students/${studentIdParam}/`)
                .then(res => {
                    const s = res.data;
                    setForm(prev => ({
                        ...prev,
                        first_name:    prev.first_name    || s.first_name    || "",
                        last_name:     prev.last_name     || s.last_name     || "",
                        date_of_birth: prev.date_of_birth || s.date_of_birth || "",
                        grade:         prev.grade         || (s.grade !== "TBD" ? s.grade : "") || "",
                    }));
                })
                .catch(() => {});
        }
    }, [isViewMode, submissionId]);

    const saveDraft = () => {
        if (draftKey) localStorage.setItem(draftKey, JSON.stringify(form));
    };

    const handleSaveAndBack = () => {
        saveDraft();
        router.push(studentIdParam ? `/students/${studentIdParam}` : "/dashboard");
    };

    const handleSubmit = async () => {
        if (!form.first_name || !form.last_name || !form.date_of_birth) {
            setErrorMsg("Please fill in the child's First Name, Last Name and Date of Birth.");
            window.scrollTo(0, 0);
            return;
        }
        setLoading(true);
        setErrorMsg("");
        try {
            const payload = {
                student: { first_name: form.first_name, last_name: form.last_name, date_of_birth: form.date_of_birth, grade: form.grade },
                form_data: { v2: form },
                ...(studentIdParam ? { student_id: studentIdParam } : {}),
            };
            await api.post("/api/students/onboard/", payload);
            if (draftKey) localStorage.removeItem(draftKey);
            router.push(studentIdParam ? `/students/${studentIdParam}` : "/dashboard");
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Submission failed. Please try again.");
            setLoading(false);
        }
    };

    const dis = isViewMode;

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <ProtectedRoute allowedRoles={isViewMode ? undefined : ["PARENT"]}>
            <div className="max-w-3xl mx-auto">
                {/* Breadcrumb Nav */}
                <div className="mb-6 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => router.back()}
                        className="inline-flex items-center gap-1.5 text-slate-500 hover:text-blue-600 font-semibold text-sm transition-colors cursor-pointer"
                    >
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back to Student Profile
                    </button>
                    <span className="text-slate-300">›</span>
                    <span className="text-slate-900 font-semibold text-sm">
                        Parent Assessment
                    </span>
                </div>

                {/* Top bar */}
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">
                            {isViewMode ? "Parent Input Form — Read Only" : "Parent Assessment Form"}
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {isViewMode ? "Past submission — read only." : "THERUNI Unified Parent Assessment Checklist"}
                        </p>
                    </div>
                    {!isViewMode && (
                        <button
                            onClick={handleSaveAndBack}
                            className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600 px-4 py-2 rounded-lg border border-slate-200 hover:border-blue-300 bg-white transition"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Save Draft & Back
                        </button>
                    )}
                </div>

                {errorMsg && (
                    <div className="mb-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{errorMsg}</div>
                )}

                <fieldset disabled={dis} className="space-y-10">

                    {/* ── SECTION A ─────────────────────────────────────────── */}
                    <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
                        <SectionHeader title="Section A — Background Information" />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <Field label="Child's First Name" required>
                                <input type="text" className={inputCls} value={form.first_name} onChange={e => set("first_name")(e.target.value)} />
                            </Field>
                            <Field label="Child's Last Name" required>
                                <input type="text" className={inputCls} value={form.last_name} onChange={e => set("last_name")(e.target.value)} />
                            </Field>
                            <Field label="Date of Birth" required>
                                <input type="date" className={inputCls} value={form.date_of_birth} onChange={e => set("date_of_birth")(e.target.value)} />
                            </Field>
                            <Field label="Gender">
                                <div className="flex flex-wrap gap-3 pt-1">
                                    {["Male", "Female", "Prefer not to say"].map(g => (
                                        <Cb key={g} label={g} checked={form.gender === g} onChange={() => set("gender")(form.gender === g ? "" : g)} disabled={dis} />
                                    ))}
                                </div>
                            </Field>
                        </div>

                        <Field label="Grade / Level">
                            <div className="flex flex-wrap gap-3">
                                {["Nursery/Early Years", "Pre-K/Kinder", "Primary", "Not yet in school"].map(g => (
                                    <Cb key={g} label={g} checked={form.grade === g} onChange={() => set("grade")(form.grade === g ? "" : g)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <Field label="Parent/Guardian Name">
                                <input type="text" className={inputCls} value={form.parent_name} onChange={e => set("parent_name")(e.target.value)} />
                            </Field>
                            <Field label="Phone">
                                <input type="text" className={inputCls} value={form.phone} onChange={e => set("phone")(e.target.value)} />
                            </Field>
                            <Field label="Email">
                                <input type="email" className={inputCls} value={form.email} onChange={e => set("email")(e.target.value)} />
                            </Field>
                        </div>

                        <Field label="Primary Language(s)">
                            <div className="flex flex-wrap gap-3">
                                {["English", "Arabic", "Tagalog", "Urdu", "Hindi"].map(l => (
                                    <Cb key={l} label={l} checked={checked("primary_language", l)} onChange={() => setArr("primary_language")(l)} disabled={dis} />
                                ))}
                                <Cb label="Other:" checked={checked("primary_language", "Other")} onChange={() => setArr("primary_language")("Other")} disabled={dis} />
                                {checked("primary_language", "Other") && (
                                    <input className={`${inputCls} w-40`} placeholder="Specify…" value={form.primary_language_other} onChange={e => set("primary_language_other")(e.target.value)} disabled={dis} />
                                )}
                            </div>
                        </Field>

                        <Field label="Medical Alerts / Medications">
                            <div className="flex gap-3 mb-2">
                                <Cb label="None" checked={form.medical_alerts === "None"} onChange={() => set("medical_alerts")(form.medical_alerts === "None" ? "" : "None")} disabled={dis} />
                                <Cb label="Yes (specify):" checked={form.medical_alerts === "Yes"} onChange={() => set("medical_alerts")(form.medical_alerts === "Yes" ? "" : "Yes")} disabled={dis} />
                            </div>
                            {form.medical_alerts === "Yes" && (
                                <input className={inputCls} placeholder="Medication/alert details…" value={form.medical_alerts_detail} onChange={e => set("medical_alerts_detail")(e.target.value)} disabled={dis} />
                            )}
                        </Field>

                        <Field label="Optional — Known Conditions">
                            <div className="flex flex-wrap gap-3">
                                {["Autism", "Speech Delay", "ADHD", "Learning Difficulty", "Developmental Delay", "Sensory Difficulty", "Not sure"].map(c => (
                                    <Cb key={c} label={c} checked={checked("known_conditions", c)} onChange={() => setArr("known_conditions")(c)} disabled={dis} />
                                ))}
                                <Cb label="Other:" checked={checked("known_conditions", "Other")} onChange={() => setArr("known_conditions")("Other")} disabled={dis} />
                                {checked("known_conditions", "Other") && (
                                    <input className={`${inputCls} w-48`} placeholder="Specify…" value={form.known_conditions_other} onChange={e => set("known_conditions_other")(e.target.value)} disabled={dis} />
                                )}
                            </div>
                        </Field>
                    </section>

                    {/* ── SECTION B ─────────────────────────────────────────── */}
                    <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
                        <SectionHeader title="Section B — Developmental History" />

                        <div className="space-y-3">
                            <p className="text-sm font-semibold text-slate-700">Developmental Milestones</p>
                            {[
                                { label: "Sitting",           key: "milestone_sitting" as keyof FormState,     opts: ["Early", "Typical", "Late"] },
                                { label: "Crawling",          key: "milestone_crawling" as keyof FormState,    opts: ["Early", "Typical", "Late", "Did not crawl"] },
                                { label: "Walking",           key: "milestone_walking" as keyof FormState,     opts: ["Early", "Typical", "Late"] },
                                { label: "First Words",       key: "milestone_first_words" as keyof FormState, opts: ["Early", "Typical", "Late"] },
                                { label: "Phrases/Sentences", key: "milestone_phrases" as keyof FormState,     opts: ["Early", "Typical", "Late"] },
                            ].map(({ label, key, opts }) => (
                                <div key={label} className="flex flex-wrap items-center gap-x-6 gap-y-1">
                                    <span className="text-sm text-slate-600 w-36 shrink-0">{label}</span>
                                    <div className={milestoneCls}>
                                        {opts.map(o => (
                                            <Cb key={o} label={o} checked={form[key] === o} onChange={() => set(key)(form[key] === o ? "" : o)} disabled={dis} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Field label="Previous Services">
                            <div className="flex flex-wrap gap-3">
                                {["Schooling before", "Speech Therapy", "Occupational Therapy", "Behavioral Therapy"].map(s => (
                                    <Cb key={s} label={s} checked={checked("previous_services", s)} onChange={() => setArr("previous_services")(s)} disabled={dis} />
                                ))}
                                <Cb label="IEP before" checked={checked("previous_services", "IEP before")} onChange={() => setArr("previous_services")("IEP before")} disabled={dis} />
                            </div>
                        </Field>

                        <Field label="Areas of Concern">
                            <div className="flex flex-wrap gap-3">
                                {["Communication", "Learning", "Motor Skills", "Social", "Behavior", "Emotions", "Sensory", "Daily Living", "Safety", "Not sure"].map(c => (
                                    <Cb key={c} label={c} checked={checked("areas_of_concern", c)} onChange={() => setArr("areas_of_concern")(c)} disabled={dis} />
                                ))}
                            </div>
                            {checked("areas_of_concern", "Other") && (
                                <input className={`${inputCls} mt-2 w-full`} placeholder="Other concern…" value={form.areas_of_concern_other} onChange={e => set("areas_of_concern_other")(e.target.value)} disabled={dis} />
                            )}
                        </Field>
                    </section>

                    {/* ── SECTION C ─────────────────────────────────────────── */}
                    <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
                        <SectionHeader title="Section C — Parent Input" />

                        <Field label="Primary Concerns">
                            <div className="flex flex-wrap gap-3">
                                {["Speech", "Behavior", "Learning", "Social", "Sensory", "Motor", "Eating/Sleeping", "Safety", "Not sure"].map(c => (
                                    <Cb key={c} label={c} checked={checked("primary_concerns", c)} onChange={() => setArr("primary_concerns")(c)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Goals for My Child">
                            <div className="flex flex-wrap gap-3">
                                {["Communicate better", "Improve behavior", "Learn faster", "Improve social skills", "Be independent", "School readiness", "Motor improvements"].map(g => (
                                    <Cb key={g} label={g} checked={checked("goals_for_child", g)} onChange={() => setArr("goals_for_child")(g)} disabled={dis} />
                                ))}
                                <Cb label="Other:" checked={checked("goals_for_child", "Other")} onChange={() => setArr("goals_for_child")("Other")} disabled={dis} />
                                {checked("goals_for_child", "Other") && (
                                    <input className={`${inputCls} w-48`} placeholder="Specify…" value={form.goals_other} onChange={e => set("goals_other")(e.target.value)} disabled={dis} />
                                )}
                            </div>
                        </Field>

                        <Field label="Strategies Used at Home">
                            <div className="flex flex-wrap gap-3">
                                {["Schedules", "Routines", "Visual aids", "Rewards", "Quiet time", "Sensory tools", "Not sure"].map(s => (
                                    <Cb key={s} label={s} checked={checked("strategies_home", s)} onChange={() => setArr("strategies_home")(s)} disabled={dis} />
                                ))}
                                <Cb label="Other:" checked={checked("strategies_home", "Other")} onChange={() => setArr("strategies_home")("Other")} disabled={dis} />
                                {checked("strategies_home", "Other") && (
                                    <input className={`${inputCls} w-48`} placeholder="Specify…" value={form.strategies_other} onChange={e => set("strategies_other")(e.target.value)} disabled={dis} />
                                )}
                            </div>
                        </Field>
                    </section>

                    {/* ── SECTION D ─────────────────────────────────────────── */}
                    <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
                        <SectionHeader title="Section D — Behavior & Social Interaction" />

                        <Field label="Difficulties">
                            <div className="flex flex-wrap gap-3">
                                {["Transitions", "Waiting", "Focus", "Rules", "Playing with others", "Sharing", "Emotions", "Staying calm", "Not sure"].map(d => (
                                    <Cb key={d} label={d} checked={checked("difficulties", d)} onChange={() => setArr("difficulties")(d)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Triggers">
                            <div className="flex flex-wrap gap-3">
                                {["Loud sounds", "Lights", "Being told no", "Changes", "Crowds", "Sharing", "Not sure"].map(t => (
                                    <Cb key={t} label={t} checked={checked("triggers", t)} onChange={() => setArr("triggers")(t)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Calming Strategies">
                            <div className="flex flex-wrap gap-3">
                                {["Deep breathing", "Sensory tools", "Quiet space", "Hugs", "Distraction", "Tablet/music", "Not sure"].map(c => (
                                    <Cb key={c} label={c} checked={checked("calming_strategies", c)} onChange={() => setArr("calming_strategies")(c)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Communication">
                            <div className="flex flex-wrap gap-3">
                                {["Words", "Short phrases", "Sentences", "Gestures", "Sounds", "Not speaking"].map(c => (
                                    <Cb key={c} label={c} checked={checked("communication", c)} onChange={() => setArr("communication")(c)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Social Interaction">
                            <div className="flex flex-wrap gap-3">
                                {["Eye contact", "Responds to name", "Plays alone", "Plays with others", "Avoids interaction", "Prefers adults", "Overwhelmed in groups"].map(s => (
                                    <Cb key={s} label={s} checked={checked("social_interaction", s)} onChange={() => setArr("social_interaction")(s)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Comfort Setting">
                            <div className="flex flex-wrap gap-3">
                                {["Structured", "Unstructured", "One-on-one", "Small groups", "Not sure"].map(c => (
                                    <Cb key={c} label={c} checked={checked("comfort_setting", c)} onChange={() => setArr("comfort_setting")(c)} disabled={dis} />
                                ))}
                            </div>
                        </Field>
                    </section>

                    {/* ── SECTION E ─────────────────────────────────────────── */}
                    <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
                        <SectionHeader title="Section E — Sensory & Physical Needs" />

                        <Field label="Sensory Sensitivities">
                            <div className="flex flex-wrap gap-3">
                                {["Sounds", "Lights", "Textures", "Food textures", "Crowds", "Movement", "Water", "Touch", "Smells", "None"].map(s => (
                                    <Cb key={s} label={s} checked={checked("sensitivities", s)} onChange={() => setArr("sensitivities")(s)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Motor Needs">
                            <div className="flex flex-wrap gap-3">
                                {["Fine motor difficulty", "Gross motor difficulty", "Weakness", "Easily tired", "None"].map(m => (
                                    <Cb key={m} label={m} checked={checked("motor_needs", m)} onChange={() => setArr("motor_needs")(m)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Physical Accommodations Needed">
                            <div className="flex gap-3 mb-2">
                                <Cb label="No" checked={form.physical_accommodations === "No"} onChange={() => set("physical_accommodations")(form.physical_accommodations === "No" ? "" : "No")} disabled={dis} />
                                <Cb label="Yes" checked={form.physical_accommodations === "Yes"} onChange={() => set("physical_accommodations")(form.physical_accommodations === "Yes" ? "" : "Yes")} disabled={dis} />
                            </div>
                            {form.physical_accommodations === "Yes" && (
                                <input className={inputCls} placeholder="Describe accommodation…" value={form.physical_accommodations_detail} onChange={e => set("physical_accommodations_detail")(e.target.value)} disabled={dis} />
                            )}
                        </Field>
                    </section>

                    {/* ── SECTION F ─────────────────────────────────────────── */}
                    <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
                        <SectionHeader title="Section F — Goals & Expectations" />

                        <Field label="Goals for This Year">
                            <div className="flex flex-wrap gap-3">
                                {["Academic", "Speech", "Social", "Emotional", "Behavior", "Independence", "Motor"].map(g => (
                                    <Cb key={g} label={g} checked={checked("goals_this_year", g)} onChange={() => setArr("goals_this_year")(g)} disabled={dis} />
                                ))}
                                <Cb label="Other:" checked={checked("goals_this_year", "Other")} onChange={() => setArr("goals_this_year")("Other")} disabled={dis} />
                                {checked("goals_this_year", "Other") && (
                                    <input className={`${inputCls} w-48`} placeholder="Specify…" value={form.goals_this_year_other} onChange={e => set("goals_this_year_other")(e.target.value)} disabled={dis} />
                                )}
                            </div>
                        </Field>

                        <Field label="Goals for Next 3–5 Years">
                            <div className="flex flex-wrap gap-3">
                                {["Independence", "Communication", "Behavior", "School readiness", "Friendships", "Learning", "Not sure"].map(g => (
                                    <Cb key={g} label={g} checked={checked("goals_3_5_years", g)} onChange={() => setArr("goals_3_5_years")(g)} disabled={dis} />
                                ))}
                                <Cb label="Other:" checked={checked("goals_3_5_years", "Other")} onChange={() => setArr("goals_3_5_years")("Other")} disabled={dis} />
                                {checked("goals_3_5_years", "Other") && (
                                    <input className={`${inputCls} w-48`} placeholder="Specify…" value={form.goals_3_5_years_other} onChange={e => set("goals_3_5_years_other")(e.target.value)} disabled={dis} />
                                )}
                            </div>
                        </Field>
                    </section>

                    {/* ── SECTION G ─────────────────────────────────────────── */}
                    <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
                        <SectionHeader title="Section G — Home Environment & Support" />

                        <Field label="Home Strategies">
                            <div className="flex flex-wrap gap-3">
                                {["Schedules", "Rewards", "Visual supports", "Rules", "Calm corner", "Sensory play", "Outdoor time", "Not sure"].map(s => (
                                    <Cb key={s} label={s} checked={checked("home_strategies", s)} onChange={() => setArr("home_strategies")(s)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Support Needed from School">
                            <div className="flex flex-wrap gap-3">
                                {["Home activities", "Behavior guidance", "Speech guidance", "Routines help", "Social skills support", "Parent support"].map(s => (
                                    <Cb key={s} label={s} checked={checked("support_needed", s)} onChange={() => setArr("support_needed")(s)} disabled={dis} />
                                ))}
                                <Cb label="Other:" checked={checked("support_needed", "Other")} onChange={() => setArr("support_needed")("Other")} disabled={dis} />
                                {checked("support_needed", "Other") && (
                                    <input className={`${inputCls} w-48`} placeholder="Specify…" value={form.support_needed_other} onChange={e => set("support_needed_other")(e.target.value)} disabled={dis} />
                                )}
                            </div>
                        </Field>
                    </section>

                    {/* ── SECTION H ─────────────────────────────────────────── */}
                    <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
                        <SectionHeader title="Section H — Child Strengths" />

                        <Field label="My Child's Strengths">
                            <div className="flex flex-wrap gap-3">
                                {["Friendly", "Curious", "Good memory", "Loves routines", "Creative", "Enjoys music", "Enjoys numbers", "Helpful", "Hardworking", "Fast learner"].map(s => (
                                    <Cb key={s} label={s} checked={checked("strengths", s)} onChange={() => setArr("strengths")(s)} disabled={dis} />
                                ))}
                                <Cb label="Other:" checked={checked("strengths", "Other")} onChange={() => setArr("strengths")("Other")} disabled={dis} />
                                {checked("strengths", "Other") && (
                                    <input className={`${inputCls} w-48`} placeholder="Specify…" value={form.strengths_other} onChange={e => set("strengths_other")(e.target.value)} disabled={dis} />
                                )}
                            </div>
                        </Field>
                    </section>

                    {/* ── SECTION I ─────────────────────────────────────────── */}
                    <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
                        <SectionHeader title="Section I — Daily Living Skills" />

                        {[
                            { label: "Eating",   key: "eating" as keyof FormState,   opts: ["Eats independently", "Needs some help", "Needs full help"] },
                            { label: "Dressing", key: "dressing" as keyof FormState, opts: ["Dresses independently", "Needs some help", "Needs full help"] },
                            { label: "Toilet",   key: "toilet" as keyof FormState,   opts: ["Fully trained", "Needs reminders", "Needs help", "Uses diapers"] },
                            { label: "Sleep",    key: "sleep" as keyof FormState,    opts: ["Sleeps well", "Difficulty falling asleep", "Wakes often"] },
                        ].map(({ label, key, opts }) => (
                            <Field key={label} label={label}>
                                <div className="flex flex-wrap gap-3">
                                    {opts.map(o => (
                                        <Cb key={o} label={o} checked={form[key] === o} onChange={() => set(key)(form[key] === o ? "" : o)} disabled={dis} />
                                    ))}
                                </div>
                            </Field>
                        ))}

                        <Field label="Other Notes">
                            <textarea
                                rows={3}
                                className={`${inputCls} resize-none`}
                                placeholder="Any additional notes…"
                                value={form.other_notes}
                                onChange={e => set("other_notes")(e.target.value)}
                                disabled={dis}
                            />
                        </Field>
                    </section>

                </fieldset>

                {/* ── Footer ──────────────────────────────────────────────── */}
                {!isViewMode && (
                    <div className="flex justify-between items-center mt-6 pb-8">
                        <button
                            onClick={handleSaveAndBack}
                            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 transition"
                        >
                            ← Save & back
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow transition disabled:opacity-60"
                        >
                            {loading ? "Submitting…" : "Submit Assessment Form"}
                        </button>
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
}

export default function ParentOnboardingWizard() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading form…</div>}>
            <ParentFormContent />
        </Suspense>
    );
}
