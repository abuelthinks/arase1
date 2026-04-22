"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
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
    <label 
        className={`
            flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer select-none transition-all duration-200
            ${disabled ? "opacity-60 cursor-not-allowed" : "hover:-translate-y-0.5 hover:shadow-sm"}
            ${checked 
                ? "bg-indigo-50 border-indigo-400 text-indigo-800 shadow-[0_2px_10px_rgba(99,102,241,0.12)]" 
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"}
        `}
    >
        <input
            type="checkbox"
            checked={checked}
            onChange={e => onChange(e.target.checked)}
            disabled={disabled}
            className="hidden" // hide native checkbox to use beautiful pills instead
        />
        {checked && (
            <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
        )}
        <span className={`${checked ? 'font-bold' : 'font-medium'}`} style={{ fontSize: "var(--form-control-font-size)", lineHeight: "var(--form-line-height)" }}>{label}</span>
    </label>
);

const toggle = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];

const SectionHeader = ({ title, description }: { title: string, description?: string }) => (
    <div className="border-b border-indigo-100/60 pb-4 mb-7">
        <h2 className="font-bold bg-gradient-to-r from-blue-700 to-indigo-500 bg-clip-text text-transparent" style={{ fontSize: "var(--form-section-title-size)", lineHeight: 1.35 }}>
            {title}
        </h2>
        {description && <p className="font-medium text-slate-500 mt-1.5" style={{ fontSize: "var(--form-helper-font-size)", lineHeight: "var(--form-line-height)" }}>{description}</p>}
    </div>
);

const Field = ({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) => (
    <div className="space-y-2">
        <label className="block text-slate-700" style={{ fontSize: "var(--form-field-label-size)", lineHeight: "var(--form-line-height)", fontWeight: 650 }}>
            {label}{required && <span className="text-pink-500 ml-1 opacity-80">*</span>}
        </label>
        {children}
    </div>
);

const inputCls = "w-full px-4 py-3 border border-slate-200 rounded-xl text-[var(--form-control-font-size)] leading-[var(--form-line-height)] focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-400 outline-none bg-slate-50/50 hover:bg-white transition-all disabled:bg-slate-50 disabled:text-slate-400 font-medium text-slate-800 placeholder:text-slate-400 placeholder:font-normal";
const milestoneCls = "flex flex-wrap gap-2.5";

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
    had_iep_before: "", iep_details: "",
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

export function ParentFormContent({ propStudentId, propSubmissionId, propMode, propHideNavigation, propOnSubmitted }: { propStudentId?: string, propSubmissionId?: string, propMode?: string, propHideNavigation?: boolean, propOnSubmitted?: (message: string) => void | Promise<void> } = {}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isViewMode = propMode === "view" || searchParams.get("mode") === "view";
    const submissionId = propSubmissionId || searchParams.get("submissionId");
    const studentIdParam = propStudentId || searchParams.get("studentId");
    const draftKey = studentIdParam ? `parent_form_draft_v2_${studentIdParam}` : null;
    const { user } = useAuth();
    const canViewPII = !isViewMode || user?.role === "ADMIN";
    const hideBackgroundSection = isViewMode && ["SPECIALIST", "TEACHER"].includes(user?.role || "");

    const [form, setForm] = useState<FormState>(initState());
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [currentStep, setCurrentStep] = useState(0);
    const totalSteps = 5;
    const isWizardMode = !isViewMode;
    const topRef = useRef<HTMLDivElement>(null);

    // For Translation Toggle
    const [fullSubmission, setFullSubmission] = useState<any>(null);
    const [isTranslated, setIsTranslated] = useState(false);
    const hasTranslation = fullSubmission && fullSubmission.translated_data && Object.keys(fullSubmission.translated_data).length > 0 && fullSubmission.original_language && !['en', 'english'].includes(fullSubmission.original_language.toLowerCase());

    // ── setters ──────────────────────────────────────────────────────────────

    const set = (key: keyof FormState) => (val: any) =>
        setForm(prev => ({ ...prev, [key]: val }));

    const setArr = (key: keyof FormState) => (val: string) =>
        setForm(prev => ({ ...prev, [key]: toggle((prev[key] as string[]), val) }));

    const checked = (key: keyof FormState, val: string) =>
        ((form[key] as string[]) ?? []).includes(val);

    // ── lifecycle ─────────────────────────────────────────────────────────────

    useEffect(() => {
        if (submissionId) {
            api.get(`/api/inputs/parent-assessment/${submissionId}/`)
                .then(res => {
                    setFullSubmission(res.data);
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
            
            // If we are actively viewing, stop here. But if editing, we might still want to merge in user overrides.
            if (isViewMode) return;
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

        // Prefill parent info from the authenticated user
        if (user && user.role === "PARENT") {
            setForm(prev => ({
                ...prev,
                parent_name: prev.parent_name || [user.first_name, user.last_name].filter(Boolean).join(" ") || "",
                email: prev.email || user.email || "",
                phone: prev.phone || user.phone_number || ""
            }));
        }
    }, [draftKey, isViewMode, submissionId, studentIdParam, user]);

    useEffect(() => {
        if (isViewMode && fullSubmission) {
            const fd = (isTranslated && fullSubmission.translated_data) ? fullSubmission.translated_data : fullSubmission.form_data;
            if (!fd) return;
            if (fd.v2) {
                setForm(fd.v2);
            } else {
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
        }
    }, [isTranslated, fullSubmission, isViewMode]);

    // Auto-save form data periodically
    useEffect(() => {
        if (isViewMode || !draftKey) return;
        
        const timeoutId = setTimeout(() => {
            localStorage.setItem(draftKey, JSON.stringify(form));
        }, 1000);
        
        return () => clearTimeout(timeoutId);
    }, [form, isViewMode, draftKey]);

    const saveDraft = () => {
        if (draftKey) localStorage.setItem(draftKey, JSON.stringify(form));
    };

    const handleSaveAndBack = () => {
        saveDraft();
        router.push(studentIdParam ? `/students/${studentIdParam}` : "/dashboard");
    };

    const handleNext = () => {
        if (currentStep === 0) {
            if (!form.first_name || !form.last_name || !form.date_of_birth || !form.grade) {
                setErrorMsg("Please fill in the child's First Name, Last Name, Date of Birth, and Grade to continue.");
                topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
        }
        setErrorMsg("");
        setCurrentStep(prev => Math.min(prev + 1, totalSteps - 1));
        setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    };

    const handleBackStep = () => {
        setErrorMsg("");
        setCurrentStep(prev => Math.max(prev - 1, 0));
        setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    };

    const handleSubmit = async () => {
        if (!form.first_name || !form.last_name || !form.date_of_birth || !form.grade) {
            setErrorMsg("Please fill in the child's First Name, Last Name, Date of Birth, and Grade.");
            window.scrollTo(0, 0);
            return;
        }
        setLoading(true);
        setErrorMsg("");
        setSuccessMsg("");
        try {
            const payload = {
                student: { first_name: form.first_name, last_name: form.last_name, date_of_birth: form.date_of_birth, grade: form.grade },
                form_data: { v2: form },
                ...(studentIdParam ? { student_id: studentIdParam } : {}),
            };
            await api.post("/api/students/onboard/", payload);
            if (draftKey) localStorage.removeItem(draftKey);
            const message = "Parent assessment submitted successfully.";
            setSuccessMsg(message);
            await propOnSubmitted?.(message);
            if (propHideNavigation) {
                setLoading(false);
                return;
            }
            setTimeout(() => router.push(studentIdParam ? `/students/${studentIdParam}` : "/dashboard"), 1500);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Submission failed. Please try again.");
            setLoading(false);
        }
    };

    const dis = isViewMode;

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <ProtectedRoute allowedRoles={isViewMode ? undefined : ["PARENT"]}>
            <div className="max-w-5xl mx-auto px-4 pt-8 pb-12 relative">
                <div ref={topRef} className="absolute -top-10 left-0 w-full" />
                
                {/* Top bar */}
                <div className="flex flex-col items-start gap-4 mb-5 w-full">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                            Parent Assessment Form
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {isViewMode ? "Past submission — read only." : "Help us understand your child's unique needs, strengths, and background."}
                        </p>
                    </div>
                    {isViewMode && hasTranslation && (
                        <div style={{ display: "flex", gap: "4px", background: "#f8fafc", padding: "4px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                            <button
                                onClick={() => setIsTranslated(false)}
                                style={{
                                    padding: "6px 12px",
                                    borderRadius: "6px",
                                    fontSize: "0.85rem",
                                    fontWeight: !isTranslated ? 700 : 500,
                                    color: !isTranslated ? "#0f172a" : "#64748b",
                                    background: !isTranslated ? "white" : "transparent",
                                    boxShadow: !isTranslated ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                                    border: "none",
                                    cursor: "pointer",
                                    transition: "all 0.2s"
                                }}
                            >
                                Original
                            </button>
                            <button
                                onClick={() => setIsTranslated(true)}
                                style={{
                                    padding: "6px 12px",
                                    borderRadius: "6px",
                                    fontSize: "0.85rem",
                                    fontWeight: isTranslated ? 700 : 500,
                                    color: isTranslated ? "#4f46e5" : "#64748b",
                                    background: isTranslated ? "white" : "transparent",
                                    boxShadow: isTranslated ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                                    border: "none",
                                    cursor: "pointer",
                                    transition: "all 0.2s"
                                }}
                            >
                                English (AI) ✨
                            </button>
                        </div>
                    )}
                </div>

                {successMsg && (
                    <div className="mb-5 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm font-semibold">{successMsg}</div>
                )}

                {errorMsg && (
                    <div className="mb-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{errorMsg}</div>
                )}

                <fieldset disabled={dis} className="space-y-10">

                    {isWizardMode && (
                        <div className="mb-2">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-bold text-blue-600 tracking-wide uppercase">Step {currentStep + 1} of {totalSteps}</span>
                                <span className="text-xs font-semibold text-slate-400">{Math.round(((currentStep + 1) / totalSteps) * 100)}% Completed</span>
                            </div>
                            <div className="w-full bg-slate-100/80 h-3 rounded-full overflow-hidden mb-8 shadow-inner border border-slate-200/50">
                                <div className="bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 h-full transition-all duration-500 ease-out relative" style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}>
                                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                                </div>
                            </div>
                        </div>
                    )}                    {/* ── STEP 1 (Section A) ─────────────────────────────────────────── */}
                    {(!isWizardMode || currentStep === 0) && !hideBackgroundSection && (
                    <div className="space-y-10 animate-fadeIn">
                        <section className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-7 relative overflow-hidden">
                            <SectionHeader title={isViewMode ? "Section A — Let's start with the basics" : "Let's start with the basics"} description="Help us understand your child's basic background details so we can set up their profile." />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

                        <Field label="Grade / Level" required>
                            <div className="flex flex-wrap gap-3">
                                {["Nursery/Early Years", "Pre-K/Kinder", "Primary", "Not yet in school"].map(g => (
                                    <Cb key={g} label={g} checked={form.grade === g} onChange={() => set("grade")(form.grade === g ? "" : g)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        {canViewPII && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                        )}

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
                    </div>
                    )}

                    {/* ── STEP 2 (Section B) ─────────────────────────────────────────── */}
                    {(!isWizardMode || currentStep === 1) && (
                    <div className="space-y-10 animate-fadeIn">
                        <section className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-7 relative overflow-hidden">
                            <SectionHeader title={isViewMode ? "Section B — Your child's milestones & history" : "Your child's milestones & history"} description="Share a snapshot of your child's developmental milestones and past services." />

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
                            </div>
                        </Field>

                        <Field label="Has your child had an Individualized Education Program (IEP) before?">
                            <div className="flex gap-4 pt-1 mb-2">
                                <Cb label="No" checked={form.had_iep_before === "No"} onChange={() => set("had_iep_before")(form.had_iep_before === "No" ? "" : "No")} disabled={dis} />
                                <Cb label="Yes" checked={form.had_iep_before === "Yes"} onChange={() => set("had_iep_before")(form.had_iep_before === "Yes" ? "" : "Yes")} disabled={dis} />
                            </div>
                            {form.had_iep_before === "Yes" && (
                                <input className={inputCls} placeholder="Please briefly provide details (e.g., date or school)..." value={form.iep_details} onChange={e => set("iep_details")(e.target.value)} disabled={dis} />
                            )}
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
                    </div>
                    )}

                    {/* ── STEP 5 (Section C, F, H) ─────────────────────────────────────────── */}
                    {(!isWizardMode || currentStep === 4) && (
                    <div className="space-y-10 animate-fadeIn">
                    <section className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section C — Your Goals & Concerns" : "Your Goals & Concerns"} description="Tell us what you want to focus on and your main worries." />

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
                    </div>
                    )}

                    {/* ── STEP 3 (Sections D & E) ─────────────────────────────────────────── */}
                    {(!isWizardMode || currentStep === 2) && (
                    <div className="space-y-10 animate-fadeIn">
                    <section className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section D — How does your child interact with the world?" : "How does your child interact with the world?"} description="Help us understand what triggers them and how they relate to others." />

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

                    <section className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section E — Sensory & Physical Needs" : "Sensory & Physical Needs"} description="Let us know their physical needs and any sensory sensitivities we should accommodate." />

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
                    </div>
                    )}

                    {/* ── SECTION F ─────────────────────────────────────────── */}
                    {(!isWizardMode || currentStep === 4) && (
                    <div className="space-y-10 animate-fadeIn">
                    <section className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section F — Goals & Expectations" : "Goals & Expectations"} description="What are your short-term and long-term hopes for your child?" />

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
                    </div>
                    )}

                    {/* ── SECTION G ─────────────────────────────────────────── */}
                    {(!isWizardMode || currentStep === 3) && (
                    <div className="space-y-10 animate-fadeIn">
                    <section className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section G — Routines & Support" : "Routines & Support"} description="Tell us about the structure, routines, and strategies that work for them at home." />

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
                    </div>
                    )}

                    {/* ── SECTION H ─────────────────────────────────────────── */}
                    {(!isWizardMode || currentStep === 4) && (
                    <div className="space-y-10 animate-fadeIn">
                    <section className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section H — What makes your child shine?" : "What makes your child shine?"} description="Every child has superpowers! Tell us what your child excels at." />

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
                    </div>
                    )}

                    {/* ── SECTION I ─────────────────────────────────────────── */}
                    {(!isWizardMode || currentStep === 3) && (
                    <div className="space-y-10 animate-fadeIn">
                    <section className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section I — Daily Living Skills" : "Daily Living Skills"} description="Help us understand how independent they are with daily self-care tasks." />

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
                    </div>
                    )}

                </fieldset>

                {/* ── Footer ──────────────────────────────────────────────── */}
                {!isViewMode && (
                    <div className="flex justify-between items-center mt-8 pb-8 pt-4">
                        {isWizardMode && currentStep > 0 ? (
                            <button
                                onClick={handleBackStep}
                                className="text-sm font-bold text-slate-500 hover:text-blue-600 flex items-center gap-2 transition px-4 py-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-white hover:border-blue-300"
                            >
                                ← Back
                            </button>
                        ) : (
                            <button
                                onClick={handleSaveAndBack}
                                className="text-sm font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1 transition"
                            >
                                Save draft & exit
                            </button>
                        )}
                        
                        <div className="flex gap-3">
                            {isWizardMode && currentStep < totalSteps - 1 ? (
                                <button
                                    onClick={handleNext}
                                    className="btn-primary"
                                    style={{ padding: "12px 32px", fontSize: "0.95rem", borderRadius: "99px" }}
                                >
                                    Next Step →
                                </button>
                            ) : (
                                <button
                                    onClick={handleSubmit}
                                    disabled={loading}
                                    className="btn-primary"
                                    style={{ padding: "12px 32px", fontSize: "0.95rem", borderRadius: "99px", background: loading ? "#cbd5e1" : "#10b981", borderColor: "transparent", color: "white" }}
                                >
                                    {loading ? "Submitting…" : "Review & Submit"}
                                </button>
                            )}
                        </div>
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
