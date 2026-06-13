"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { semanticToneClass, type SemanticTone } from "@/lib/role-colors";

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
            flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer select-none transition-colors duration-200
            ${disabled ? "opacity-60 cursor-not-allowed" : "hover:shadow-sm"}
            ${checked 
                ? "bg-indigo-50 border-indigo-400 text-indigo-800 shadow-[0_2px_10px_rgba(99,102,241,0.12)]" 
                : "bg-card border-line text-muted hover:border-line hover:bg-app"}
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

const toggle = (arr: string[], val: string) => {
    const exclusive = ["None", "Not sure", "N/A"];
    if (exclusive.includes(val)) {
        return arr.includes(val) ? [] : [val];
    }
    const nextArr = arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
    return nextArr.filter(v => !exclusive.includes(v));
};

const SectionHeader = ({ title, description }: { title: string, description?: string }) => (
    <div className="border-b border-line pb-4 mb-7">
        <h2 className="font-bold text-fg" style={{ fontSize: "var(--form-section-title-size)", lineHeight: 1.35 }}>
            {title}
        </h2>
        {description && <p className="font-medium text-muted mt-1.5" style={{ fontSize: "var(--form-helper-font-size)", lineHeight: "var(--form-line-height)" }}>{description}</p>}
    </div>
);

const Field = ({ label, children, required, isInvalid }: { label: string; children: React.ReactNode; required?: boolean; isInvalid?: boolean }) => (
    <div className={`space-y-2 p-3 -m-3 rounded-2xl border transition-colors duration-200 ${isInvalid ? 'bg-red-50/70 border-red-200 shadow-[0_2px_10px_rgba(239,68,68,0.04)]' : 'border-transparent'}`} data-invalid={isInvalid ? "true" : "false"}>
        <label className="block text-fg font-semibold" style={{ fontSize: "var(--form-field-label-size)", lineHeight: "var(--form-line-height)" }}>
            {label}{required && <span className="text-pink-500 ml-1 opacity-80">*</span>}
        </label>
        {children}
        {isInvalid && (
            <p className="text-xs font-semibold text-red-500 mt-1">
                * This field is required
            </p>
        )}
    </div>
);

const inputCls = "w-full px-4 py-3 border border-line rounded-xl text-[var(--form-control-font-size)] leading-[var(--form-line-height)] focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-400 outline-none bg-app/50 hover:bg-card transition-colors disabled:bg-app disabled:text-faint font-medium text-fg placeholder:text-faint placeholder:font-normal";
const formBannerClass = (tone: SemanticTone) =>
    `rounded-md border p-3 flex items-center justify-between gap-3 ${semanticToneClass(tone)}`;
const milestoneCls = "flex flex-wrap gap-2.5";
const INVITATION_PLACEHOLDER_FIRST_NAME = "Pending";
const INVITATION_PLACEHOLDER_LAST_NAME = "Student";
const INVITATION_PLACEHOLDER_DOB = "2000-01-01";

type StudentPrefill = {
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    grade?: string;
    gender?: string;
};

const isInvitationPlaceholderStudent = (student: StudentPrefill) =>
    (student.first_name || "").trim().toLowerCase() === INVITATION_PLACEHOLDER_FIRST_NAME.toLowerCase()
    && (student.last_name || "").trim().toLowerCase() === INVITATION_PLACEHOLDER_LAST_NAME.toLowerCase()
    && (!student.date_of_birth || student.date_of_birth === INVITATION_PLACEHOLDER_DOB);

const cleanStudentPrefill = (student: StudentPrefill) => {
    if (isInvitationPlaceholderStudent(student)) {
        return {
            first_name: "",
            last_name: "",
            date_of_birth: "",
            grade: "",
            gender: "",
        };
    }

    return {
        first_name: student.first_name || "",
        last_name: student.last_name || "",
        date_of_birth: student.date_of_birth === INVITATION_PLACEHOLDER_DOB ? "" : student.date_of_birth || "",
        grade: student.grade && student.grade !== "TBD" ? student.grade : "",
        gender: student.gender || "",
    };
};

const cleanDraftStudentFields = <T extends StudentPrefill>(draft: T): T => {
    if (!isInvitationPlaceholderStudent(draft)) return draft;

    return {
        ...draft,
        first_name: "",
        last_name: "",
        date_of_birth: "",
        grade: "",
        gender: "",
    };
};

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

export function ParentFormContent({
    propStudentId,
    propSubmissionId,
    propMode,
    propHideNavigation,
    propOnSubmitted,
    propReportCycleId,
    propSpecialistSubmitted,
    propUnlockAvailable,
    propOnUnlocked,
}: {
    propStudentId?: string;
    propSubmissionId?: string;
    propMode?: string;
    propHideNavigation?: boolean;
    propOnSubmitted?: (message: string) => void | Promise<void>;
    propReportCycleId?: string | number;
    propSpecialistSubmitted?: boolean;
    propUnlockAvailable?: boolean;
    propOnUnlocked?: () => void | Promise<void>;
} = {}) {
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
    const [unlockLoading, setUnlockLoading] = useState(false);
    const totalSteps = 5;
    const isWizardMode = !isViewMode;
    const topRef = useRef<HTMLDivElement>(null);

    const [stepsAttempted, setStepsAttempted] = useState<boolean[]>([false, false, false, false, false]);

    const isFieldEmptyOnboarding = (key: keyof FormState, val: any): boolean => {
        if (Array.isArray(val)) return val.length === 0;
        return !val || String(val).trim() === "";
    };

    const getStepRequiredFields = (step: number): (keyof FormState)[] => {
        switch (step) {
            case 0:
                return ["first_name", "last_name", "date_of_birth", "gender", "grade", "primary_language", "medical_alerts", "parent_name", "phone", "email"];
            case 1:
                return [
                    "milestone_sitting",
                    "milestone_crawling",
                    "milestone_walking",
                    "milestone_first_words",
                    "milestone_phrases",
                    "previous_services",
                    "had_iep_before",
                    "areas_of_concern"
                ];
            case 2:
                return [
                    "difficulties",
                    "triggers",
                    "calming_strategies",
                    "communication",
                    "social_interaction",
                    "comfort_setting",
                    "sensitivities",
                    "motor_needs",
                    "physical_accommodations"
                ];
            case 3:
                return [
                    "home_strategies",
                    "support_needed",
                    "eating",
                    "dressing",
                    "toilet",
                    "sleep"
                ];
            case 4:
                return [
                    "primary_concerns",
                    "goals_for_child",
                    "strategies_home",
                    "goals_this_year",
                    "goals_3_5_years",
                    "strengths"
                ];
            default:
                return [];
        }
    };

    const isFieldInvalid = (key: keyof FormState, step: number) => {
        if (isViewMode) return false;
        if (!stepsAttempted[step]) return false;
        const required = getStepRequiredFields(step);
        if (!required.includes(key)) return false;
        return isFieldEmptyOnboarding(key, form[key]);
    };

    // Diagnostic report upload state
    const [diagnosticFile, setDiagnosticFile] = useState<File | null>(null);
    const [diagnosticUploading, setDiagnosticUploading] = useState(false);
    const [existingDiagnostic, setExistingDiagnostic] = useState<{ id: number; original_filename: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // For Translation Toggle
    const [fullSubmission, setFullSubmission] = useState<any>(null);
    const [isTranslated, setIsTranslated] = useState(false);
    const hasTranslation = fullSubmission && fullSubmission.translated_data && Object.keys(fullSubmission.translated_data).length > 0 && fullSubmission.original_language && !['en', 'english'].includes(fullSubmission.original_language.toLowerCase());
    const reportCycleId = propReportCycleId || fullSubmission?.report_cycle;
    const specialistSubmitted = propUnlockAvailable === false ? true : Boolean(propSpecialistSubmitted);
    const showParentUnlockPanel = isViewMode
        && fullSubmission
        && (user?.role === "ADMIN" || (user?.role === "PARENT" && !specialistSubmitted));

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
            try { setForm(cleanDraftStudentFields(JSON.parse(draft))); } catch {}
        }

        // Prefill from admin-registered student data
        if (studentIdParam) {
            api.get(`/api/students/${studentIdParam}/`)
                .then(res => {
                    const s = cleanStudentPrefill(res.data);
                    setForm(prev => ({
                        ...prev,
                        first_name:    prev.first_name    || s.first_name,
                        last_name:     prev.last_name     || s.last_name,
                        date_of_birth: prev.date_of_birth || s.date_of_birth,
                        grade:         prev.grade         || s.grade,
                        gender:        prev.gender        || s.gender,
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
        // Validate current step
        const required = getStepRequiredFields(currentStep);
        const invalid = required.filter(key => isFieldEmptyOnboarding(key, form[key]));

        if (invalid.length > 0) {
            // Track attempted submit for this step to highlight errors
            setStepsAttempted(prev => {
                const nextArr = [...prev];
                nextArr[currentStep] = true;
                return nextArr;
            });
            
            setErrorMsg("Please complete all required fields on this step to continue.");
            
            // Smooth scroll to the first invalid field on the active page
            setTimeout(() => {
                const firstInvalid = document.querySelector('[data-invalid="true"]');
                if (firstInvalid) {
                    firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 100);
            return;
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

    const requestParentUnlock = async () => {
        if (!studentIdParam || !reportCycleId || unlockLoading) return;
        setUnlockLoading(true);
        setErrorMsg("");
        setSuccessMsg("");
        try {
            await api.post("/api/inputs/parent-assessment/request-unlock/", {
                student_id: studentIdParam,
                report_cycle_id: reportCycleId,
            });
            setFullSubmission((prev: any) => prev ? { ...prev, unlock_requested: true } : prev);
            await propOnUnlocked?.();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Could not request unlock. Please try again.");
        } finally {
            setUnlockLoading(false);
        }
    };

    const adminUnlockParentAssessment = async () => {
        if (!studentIdParam || !reportCycleId || unlockLoading) return;
        setUnlockLoading(true);
        setErrorMsg("");
        setSuccessMsg("");
        try {
            await api.post("/api/inputs/parent-assessment/unlock/", {
                student_id: studentIdParam,
                report_cycle_id: reportCycleId,
            });
            setFullSubmission((prev: any) => prev ? {
                ...prev,
                unlock_requested: false,
                unlocked_at: new Date().toISOString(),
            } : prev);
            await propOnUnlocked?.();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Could not unlock the parent assessment. Please try again.");
        } finally {
            setUnlockLoading(false);
        }
    };

    const handleSubmit = async () => {
        const allSteps = [0, 1, 2, 3, 4];
        let firstInvalidStep = -1;
        
        // Mark all steps as attempted
        setStepsAttempted([true, true, true, true, true]);

        for (const s of allSteps) {
            const required = getStepRequiredFields(s);
            const invalid = required.filter(key => isFieldEmptyOnboarding(key, form[key]));
            if (invalid.length > 0) {
                firstInvalidStep = s;
                break;
            }
        }

        if (firstInvalidStep !== -1) {
            setCurrentStep(firstInvalidStep);
            setErrorMsg("Please complete all required fields before submitting.");
            
            setTimeout(() => {
                const firstInvalid = document.querySelector('[data-invalid="true"]');
                if (firstInvalid) {
                    firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 100);
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
            const res = await api.post("/api/students/onboard/", payload);
            if (draftKey) localStorage.removeItem(draftKey);

            // Upload diagnostic report if file selected
            const resolvedStudentId = studentIdParam || res.data?.student_id;
            if (diagnosticFile && resolvedStudentId) {
                setDiagnosticUploading(true);
                try {
                    const fd = new FormData();
                    fd.append('file', diagnosticFile);
                    fd.append('student', resolvedStudentId.toString());
                    await api.post('/api/inputs/diagnostic-report/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                } catch (diagErr) {
                    console.warn('Diagnostic upload failed:', diagErr);
                }
                setDiagnosticUploading(false);
            }

            const message = "Parent assessment submitted successfully.";
            setSuccessMsg(message);
            await propOnSubmitted?.(message);
            if (propHideNavigation) {
                setLoading(false);
                return;
            }
            setTimeout(() => router.push(studentIdParam ? `/specialists?studentId=${studentIdParam}` : "/dashboard"), 1500);
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
                        <h1 className="text-2xl font-bold text-fg tracking-tight">
                            Parent Assessment Form
                        </h1>
                        <p className="text-sm text-muted mt-0.5">
                            {isViewMode ? "Past submission — read only." : "Help us understand your child's unique needs, strengths, and background."}
                        </p>
                    </div>
                    {isViewMode && hasTranslation && (
                        <div style={{ display: "flex", gap: "4px", background: "var(--bg-primary)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                            <button
                                onClick={() => setIsTranslated(false)}
                                style={{
                                    padding: "6px 12px",
                                    borderRadius: "6px",
                                    fontSize: "0.85rem",
                                    fontWeight: !isTranslated ? 700 : 500,
                                    color: !isTranslated ? "var(--text-primary)" : "var(--text-secondary)",
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
                                    color: isTranslated ? "#4f46e5" : "var(--text-secondary)",
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
                    <div className={`mb-5 rounded-lg border px-4 py-3 text-sm font-semibold ${semanticToneClass("success")}`}>{successMsg}</div>
                )}

                {errorMsg && (
                    <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${semanticToneClass("danger")}`}>{errorMsg}</div>
                )}

                {showParentUnlockPanel && (
                    <div className="mb-5">
                        {user?.role === "ADMIN" ? (
                            (fullSubmission?.unlock_requested || fullSubmission?.unlocked_at) && (
                                <div className={formBannerClass(specialistSubmitted ? "neutral" : fullSubmission?.unlocked_at ? "success" : "warning")}>
                                    <div className="text-sm">
                                        {specialistSubmitted ? (
                                            <span>This form can no longer be unlocked because the specialist assessment has been submitted.</span>
                                        ) : fullSubmission?.unlocked_at ? (
                                            <span>Parent assessment unlocked. The parent has been notified and can now edit and resubmit this assessment.</span>
                                        ) : (
                                            <strong>Unlock requested by parent.</strong>
                                        )}
                                    </div>
                                    {!specialistSubmitted && !fullSubmission?.unlocked_at && (
                                        <button
                                            type="button"
                                            onClick={adminUnlockParentAssessment}
                                            disabled={unlockLoading}
                                            className="shrink-0 rounded-md border border-amber-200 bg-card px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {unlockLoading ? "Unlocking..." : "Unlock Form"}
                                        </button>
                                    )}
                                </div>
                            )
                        ) : (
                            user?.role === "PARENT" && !specialistSubmitted && (
                                <div className={formBannerClass(fullSubmission?.unlocked_at ? "success" : fullSubmission?.unlock_requested ? "success" : "neutral")}>
                                    <div className="text-sm">
                                        {fullSubmission?.unlocked_at ? (
                                            <span>This form has been unlocked. You can edit and resubmit it.</span>
                                        ) : fullSubmission?.unlock_requested ? (
                                            <span>Unlock request sent to admin. You have requested an admin to unlock this form.</span>
                                        ) : (
                                            <span>Need to make changes?</span>
                                        )}
                                    </div>
                                    {!fullSubmission?.unlock_requested && !fullSubmission?.unlocked_at && (
                                        <button
                                            type="button"
                                            onClick={requestParentUnlock}
                                            disabled={unlockLoading}
                                            className="rounded-md border border-line bg-card px-3 py-1.5 text-sm font-semibold text-fg transition-colors hover:border-line hover:bg-app disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {unlockLoading ? "Requesting..." : "Request Unlock"}
                                        </button>
                                    )}
                                </div>
                            )
                        )}
                    </div>
                )}

                <fieldset disabled={dis} className="space-y-10">

                    {isWizardMode && (
                        <div className="mb-2">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-bold uppercase tracking-wide text-indigo-700">Step {currentStep + 1} of {totalSteps}</span>
                                <span className="text-xs font-semibold text-faint">{Math.round(((currentStep + 1) / totalSteps) * 100)}% Completed</span>
                            </div>
                            <div className="w-full bg-subtle-soft/80 h-3 rounded-full overflow-hidden mb-8 shadow-inner border border-line/50">
                                <div className="relative h-full bg-indigo-600 transition-[width] duration-500 ease-out" style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}>
                                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                                </div>
                            </div>
                        </div>
                    )}                    {/* ── STEP 1 (Section A) ─────────────────────────────────────────── */}
                    {(!isWizardMode || currentStep === 0) && !hideBackgroundSection && (
                    <div className="space-y-10 animate-fadeIn">
                        <section className="bg-card rounded-2xl border border-line p-5 sm:p-8 shadow-sm space-y-7 relative overflow-hidden">
                            <SectionHeader title={isViewMode ? "Section A — Let's start with the basics" : "Let's start with the basics"} description="Help us understand your child's basic background details so we can set up their profile." />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Field label="Child's First Name" required isInvalid={isFieldInvalid("first_name", 0)}>
                                <input type="text" className={inputCls} value={form.first_name} onChange={e => set("first_name")(e.target.value)} />
                            </Field>
                            <Field label="Child's Last Name" required isInvalid={isFieldInvalid("last_name", 0)}>
                                <input type="text" className={inputCls} value={form.last_name} onChange={e => set("last_name")(e.target.value)} />
                            </Field>
                            <Field label="Date of Birth" required isInvalid={isFieldInvalid("date_of_birth", 0)}>
                                <input type="date" className={inputCls} value={form.date_of_birth} onChange={e => set("date_of_birth")(e.target.value)} />
                            </Field>
                            <Field label="Gender" required isInvalid={isFieldInvalid("gender", 0)}>
                                <div className="flex flex-wrap gap-3 pt-1">
                                    {["Male", "Female", "Prefer not to say"].map(g => (
                                        <Cb key={g} label={g} checked={form.gender === g} onChange={() => set("gender")(form.gender === g ? "" : g)} disabled={dis} />
                                    ))}
                                </div>
                            </Field>
                        </div>

                        <Field label="Grade / Level" required isInvalid={isFieldInvalid("grade", 0)}>
                            <div className="flex flex-wrap gap-3">
                                {["Nursery/Early Years", "Pre-K/Kinder", "Primary", "Not yet in school"].map(g => (
                                    <Cb key={g} label={g} checked={form.grade === g} onChange={() => set("grade")(form.grade === g ? "" : g)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        {canViewPII && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <Field label="Parent/Guardian Name" required isInvalid={isFieldInvalid("parent_name", 0)}>
                                    <input type="text" className={inputCls} value={form.parent_name} onChange={e => set("parent_name")(e.target.value)} />
                                </Field>
                                <Field label="Phone" required isInvalid={isFieldInvalid("phone", 0)}>
                                    <input type="text" className={inputCls} value={form.phone} onChange={e => set("phone")(e.target.value)} />
                                </Field>
                                <Field label="Email" required isInvalid={isFieldInvalid("email", 0)}>
                                    <input type="email" className={inputCls} value={form.email} onChange={e => set("email")(e.target.value)} />
                                </Field>
                            </div>
                        )}

                        <Field label="Primary Language(s)" required isInvalid={isFieldInvalid("primary_language", 0)}>
                            <div className="flex flex-wrap gap-3">
                                {["English", "Arabic", "Japanese", "Tagalog", "Urdu", "Hindi"].map(l => (
                                    <Cb key={l} label={l} checked={checked("primary_language", l)} onChange={() => setArr("primary_language")(l)} disabled={dis} />
                                ))}
                                <Cb label="Other:" checked={checked("primary_language", "Other")} onChange={() => setArr("primary_language")("Other")} disabled={dis} />
                                {checked("primary_language", "Other") && (
                                    <input className={`${inputCls} w-40`} placeholder="Specify…" value={form.primary_language_other} onChange={e => set("primary_language_other")(e.target.value)} disabled={dis} />
                                )}
                            </div>
                        </Field>

                        <Field label="Medical Alerts / Medications" required isInvalid={isFieldInvalid("medical_alerts", 0)}>
                            <div className="flex gap-3 mb-2">
                                {["None", "Yes"].map(val => (
                                    <Cb key={val} label={val === "Yes" ? "Yes (specify):" : val} checked={form.medical_alerts === val} onChange={() => set("medical_alerts")(form.medical_alerts === val ? "" : val)} disabled={dis} />
                                ))}
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
                        <section className="bg-card rounded-2xl border border-line p-5 sm:p-8 shadow-sm space-y-7 relative overflow-hidden">
                            <SectionHeader title={isViewMode ? "Section B — Your child's milestones & history" : "Your child's milestones & history"} description="Share a snapshot of your child's developmental milestones and past services." />

                        <div className="space-y-4">
                            <p className="text-sm font-semibold text-fg">Developmental Milestones</p>
                            {[
                                { label: "Sitting",           key: "milestone_sitting" as keyof FormState,     opts: ["Early", "Typical", "Late"] },
                                { label: "Crawling",          key: "milestone_crawling" as keyof FormState,    opts: ["Early", "Typical", "Late", "Did not crawl"] },
                                { label: "Walking",           key: "milestone_walking" as keyof FormState,     opts: ["Early", "Typical", "Late"] },
                                { label: "First Words",       key: "milestone_first_words" as keyof FormState, opts: ["Early", "Typical", "Late"] },
                                { label: "Phrases/Sentences", key: "milestone_phrases" as keyof FormState,     opts: ["Early", "Typical", "Late"] },
                            ].map(({ label, key, opts }) => (
                                <Field key={label} label={label} required isInvalid={isFieldInvalid(key, 1)}>
                                    <div className={milestoneCls}>
                                        {opts.map(o => (
                                            <Cb key={o} label={o} checked={form[key] === o} onChange={() => set(key)(form[key] === o ? "" : o)} disabled={dis} />
                                        ))}
                                    </div>
                                </Field>
                            ))}
                        </div>

                        <Field label="Previous Services" required isInvalid={isFieldInvalid("previous_services", 1)}>
                            <div className="flex flex-wrap gap-3">
                                {["Schooling before", "Speech Therapy", "Occupational Therapy", "Behavioral Therapy"].map(s => (
                                    <Cb key={s} label={s} checked={checked("previous_services", s)} onChange={() => setArr("previous_services")(s)} disabled={dis} />
                                ))}
                                <Cb label="None" checked={checked("previous_services", "None")} onChange={() => setArr("previous_services")("None")} disabled={dis} />
                                <Cb label="Not sure" checked={checked("previous_services", "Not sure")} onChange={() => setArr("previous_services")("Not sure")} disabled={dis} />
                            </div>
                        </Field>

                        <Field label="Has your child had an Individualized Education Program (IEP) before?" required isInvalid={isFieldInvalid("had_iep_before", 1)}>
                            <div className="flex gap-4 pt-1 mb-2">
                                <Cb label="No" checked={form.had_iep_before === "No"} onChange={() => set("had_iep_before")(form.had_iep_before === "No" ? "" : "No")} disabled={dis} />
                                <Cb label="Yes" checked={form.had_iep_before === "Yes"} onChange={() => set("had_iep_before")(form.had_iep_before === "Yes" ? "" : "Yes")} disabled={dis} />
                            </div>
                            {form.had_iep_before === "Yes" && (
                                <input className={inputCls} placeholder="Please briefly provide details (e.g., date or school)..." value={form.iep_details} onChange={e => set("iep_details")(e.target.value)} disabled={dis} />
                            )}
                        </Field>

                        <Field label="Areas of Concern" required isInvalid={isFieldInvalid("areas_of_concern", 1)}>
                            <div className="flex flex-wrap gap-3">
                                {["Communication", "Learning", "Motor Skills", "Social", "Behavior", "Emotions", "Sensory", "Daily Living", "Safety", "None", "Not sure"].map(c => (
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
                    <section className="bg-card rounded-2xl border border-line p-5 sm:p-8 shadow-sm space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section C — Your Goals & Concerns" : "Your Goals & Concerns"} description="Tell us what you want to focus on and your main worries." />

                        <Field label="Primary Concerns" required isInvalid={isFieldInvalid("primary_concerns", 4)}>
                            <div className="flex flex-wrap gap-3">
                                {["Speech", "Behavior", "Learning", "Social", "Sensory", "Motor", "Eating/Sleeping", "Safety", "None", "Not sure"].map(c => (
                                    <Cb key={c} label={c} checked={checked("primary_concerns", c)} onChange={() => setArr("primary_concerns")(c)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Goals for My Child" required isInvalid={isFieldInvalid("goals_for_child", 4)}>
                            <div className="flex flex-wrap gap-3">
                                {["Communicate better", "Improve behavior", "Learn faster", "Improve social skills", "Be independent", "School readiness", "Motor improvements", "Not sure"].map(g => (
                                    <Cb key={g} label={g} checked={checked("goals_for_child", g)} onChange={() => setArr("goals_for_child")(g)} disabled={dis} />
                                ))}
                                <Cb label="Other:" checked={checked("goals_for_child", "Other")} onChange={() => setArr("goals_for_child")("Other")} disabled={dis} />
                                {checked("goals_for_child", "Other") && (
                                    <input className={`${inputCls} w-48`} placeholder="Specify…" value={form.goals_other} onChange={e => set("goals_other")(e.target.value)} disabled={dis} />
                                )}
                            </div>
                        </Field>

                        <Field label="Strategies Used at Home" required isInvalid={isFieldInvalid("strategies_home", 4)}>
                            <div className="flex flex-wrap gap-3">
                                {["Schedules", "Routines", "Visual aids", "Rewards", "Quiet time", "Sensory tools", "None", "Not sure"].map(s => (
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
                    <section className="bg-card rounded-2xl border border-line p-5 sm:p-8 shadow-sm space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section D — How does your child interact with the world?" : "How does your child interact with the world?"} description="Help us understand what triggers them and how they relate to others." />

                        <Field label="Difficulties" required isInvalid={isFieldInvalid("difficulties", 2)}>
                            <div className="flex flex-wrap gap-3">
                                {["Transitions", "Waiting", "Focus", "Rules", "Playing with others", "Sharing", "Emotions", "Staying calm", "None", "Not sure"].map(d => (
                                    <Cb key={d} label={d} checked={checked("difficulties", d)} onChange={() => setArr("difficulties")(d)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Triggers" required isInvalid={isFieldInvalid("triggers", 2)}>
                            <div className="flex flex-wrap gap-3">
                                {["Loud sounds", "Lights", "Being told no", "Changes", "Crowds", "Sharing", "None", "Not sure"].map(t => (
                                    <Cb key={t} label={t} checked={checked("triggers", t)} onChange={() => setArr("triggers")(t)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Calming Strategies" required isInvalid={isFieldInvalid("calming_strategies", 2)}>
                            <div className="flex flex-wrap gap-3">
                                {["Deep breathing", "Sensory tools", "Quiet space", "Hugs", "Distraction", "Tablet/music", "None", "Not sure"].map(c => (
                                    <Cb key={c} label={c} checked={checked("calming_strategies", c)} onChange={() => setArr("calming_strategies")(c)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Communication" required isInvalid={isFieldInvalid("communication", 2)}>
                            <div className="flex flex-wrap gap-3">
                                {["Words", "Short phrases", "Sentences", "Gestures", "Sounds", "Not speaking"].map(c => (
                                    <Cb key={c} label={c} checked={checked("communication", c)} onChange={() => setArr("communication")(c)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Social Interaction" required isInvalid={isFieldInvalid("social_interaction", 2)}>
                            <div className="flex flex-wrap gap-3">
                                {["Eye contact", "Responds to name", "Plays alone", "Plays with others", "Avoids interaction", "Prefers adults", "Overwhelmed in groups", "Not sure"].map(s => (
                                    <Cb key={s} label={s} checked={checked("social_interaction", s)} onChange={() => setArr("social_interaction")(s)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Comfort Setting" required isInvalid={isFieldInvalid("comfort_setting", 2)}>
                            <div className="flex flex-wrap gap-3">
                                {["Structured", "Unstructured", "One-on-one", "Small groups", "Not sure"].map(c => (
                                    <Cb key={c} label={c} checked={checked("comfort_setting", c)} onChange={() => setArr("comfort_setting")(c)} disabled={dis} />
                                ))}
                            </div>
                        </Field>
                    </section>

                    <section className="bg-card rounded-2xl border border-line p-5 sm:p-8 shadow-sm space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section E — Sensory & Physical Needs" : "Sensory & Physical Needs"} description="Let us know their physical needs and any sensory sensitivities we should accommodate." />

                        <Field label="Sensory Sensitivities" required isInvalid={isFieldInvalid("sensitivities", 2)}>
                            <div className="flex flex-wrap gap-3">
                                {["Sounds", "Lights", "Textures", "Food textures", "Crowds", "Movement", "Water", "Touch", "Smells", "None", "Not sure"].map(s => (
                                    <Cb key={s} label={s} checked={checked("sensitivities", s)} onChange={() => setArr("sensitivities")(s)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Motor Needs" required isInvalid={isFieldInvalid("motor_needs", 2)}>
                            <div className="flex flex-wrap gap-3">
                                {["Fine motor difficulty", "Gross motor difficulty", "Weakness", "Easily tired", "None", "Not sure"].map(m => (
                                    <Cb key={m} label={m} checked={checked("motor_needs", m)} onChange={() => setArr("motor_needs")(m)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Physical Accommodations Needed" required isInvalid={isFieldInvalid("physical_accommodations", 2)}>
                            <div className="flex gap-3 mb-2">
                                <Cb label="No" checked={form.physical_accommodations === "No"} onChange={() => set("physical_accommodations")(form.physical_accommodations === "No" ? "" : "No")} disabled={dis} />
                                <Cb label="Yes" checked={form.physical_accommodations === "Yes"} onChange={() => set("physical_accommodations")(form.physical_accommodations === "Yes" ? "" : "Yes")} disabled={dis} />
                                <Cb label="Not sure" checked={form.physical_accommodations === "Not sure"} onChange={() => set("physical_accommodations")(form.physical_accommodations === "Not sure" ? "" : "Not sure")} disabled={dis} />
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
                    <section className="bg-card rounded-2xl border border-line p-5 sm:p-8 shadow-sm space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section F — Goals & Expectations" : "Goals & Expectations"} description="What are your short-term and long-term hopes for your child?" />

                        <Field label="Goals for This Year" required isInvalid={isFieldInvalid("goals_this_year", 4)}>
                            <div className="flex flex-wrap gap-3">
                                {["Academic", "Speech", "Social", "Emotional", "Behavior", "Independence", "Motor", "None", "Not sure"].map(g => (
                                    <Cb key={g} label={g} checked={checked("goals_this_year", g)} onChange={() => setArr("goals_this_year")(g)} disabled={dis} />
                                ))}
                                <Cb label="Other:" checked={checked("goals_this_year", "Other")} onChange={() => setArr("goals_this_year")("Other")} disabled={dis} />
                                {checked("goals_this_year", "Other") && (
                                    <input className={`${inputCls} w-48`} placeholder="Specify…" value={form.goals_this_year_other} onChange={e => set("goals_this_year_other")(e.target.value)} disabled={dis} />
                                )}
                            </div>
                        </Field>

                        <Field label="Goals for Next 3–5 Years" required isInvalid={isFieldInvalid("goals_3_5_years", 4)}>
                            <div className="flex flex-wrap gap-3">
                                {["Independence", "Communication", "Behavior", "School readiness", "Friendships", "Learning", "None", "Not sure"].map(g => (
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
                    <section className="bg-card rounded-2xl border border-line p-5 sm:p-8 shadow-sm space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section G — Routines & Support" : "Routines & Support"} description="Tell us about the structure, routines, and strategies that work for them at home." />

                        <Field label="Home Strategies" required isInvalid={isFieldInvalid("home_strategies", 3)}>
                            <div className="flex flex-wrap gap-3">
                                {["Schedules", "Rewards", "Visual supports", "Rules", "Calm corner", "Sensory play", "Outdoor time", "None", "Not sure"].map(s => (
                                    <Cb key={s} label={s} checked={checked("home_strategies", s)} onChange={() => setArr("home_strategies")(s)} disabled={dis} />
                                ))}
                            </div>
                        </Field>

                        <Field label="Support Needed from School" required isInvalid={isFieldInvalid("support_needed", 3)}>
                            <div className="flex flex-wrap gap-3">
                                {["Home activities", "Behavior guidance", "Speech guidance", "Routines help", "Social skills support", "Parent support", "None", "Not sure"].map(s => (
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
                    <section className="bg-card rounded-2xl border border-line p-5 sm:p-8 shadow-sm space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section H — What makes your child shine?" : "What makes your child shine?"} description="Every child has superpowers! Tell us what your child excels at." />

                        <Field label="My Child's Strengths" required isInvalid={isFieldInvalid("strengths", 4)}>
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

                    {/* ── ADDITIONAL NOTES (Step 5) ─────────────────────────────────────────── */}
                    {(!isWizardMode || currentStep === 4) && (
                    <div className="space-y-10 animate-fadeIn mt-10">
                    <section className="bg-card rounded-2xl border border-line p-5 sm:p-8 shadow-sm space-y-5 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Additional Insights" : "Anything Else We Should Know?"} description="Please share any other insights, background, or information that would help our team better support your child." />
                        <textarea
                            rows={4}
                            className={`${inputCls} resize-none w-full`}
                            placeholder="Share your thoughts here..."
                            value={form.other_notes}
                            onChange={e => set("other_notes")(e.target.value)}
                            disabled={dis}
                        />
                    </section>
                    </div>
                    )}

                    {/* ── DIAGNOSTIC REPORT UPLOAD (Step 5) ────────────────────────────── */}
                    {(!isWizardMode || currentStep === 4) && (
                    <div className="space-y-10 animate-fadeIn">
                    <section className="bg-card rounded-2xl border border-line p-5 sm:p-8 shadow-sm space-y-5 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Diagnostic Report" : "Upload Diagnostic Report (Optional)"} description={isViewMode ? "Uploaded diagnostic document." : "If you have an existing diagnostic report (PDF or Word document), you can upload it here. This helps our team understand your child's clinical background. You can also upload this later from your dashboard."} />

                        {isViewMode ? (
                            existingDiagnostic ? (
                                <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                                    <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    <span className="text-sm font-semibold text-emerald-800">{existingDiagnostic.original_filename}</span>
                                </div>
                            ) : (
                                <p className="text-sm text-faint italic">No diagnostic report uploaded.</p>
                            )
                        ) : (
                            <div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.doc,.docx"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) setDiagnosticFile(file);
                                    }}
                                />
                                {diagnosticFile ? (
                                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <svg className="w-5 h-5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                            <span className="text-sm font-semibold text-indigo-800 truncate">{diagnosticFile.name}</span>
                                            <span className="text-xs text-indigo-500 shrink-0">({(diagnosticFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { setDiagnosticFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                            className="text-xs font-bold text-red-500 hover:text-red-700 transition shrink-0"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ) : existingDiagnostic ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                                            <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            <span className="text-sm font-semibold text-emerald-800">{existingDiagnostic.original_filename}</span>
                                            <span className="text-xs text-emerald-600">(uploaded)</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition"
                                        >
                                            Upload a different file
                                        </button>
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            setIsDragging(false);
                                            const file = e.dataTransfer.files?.[0];
                                            if (file && (file.type === "application/pdf" || file.name.endsWith(".doc") || file.name.endsWith(".docx"))) {
                                                setDiagnosticFile(file);
                                            }
                                        }}
                                        className={`w-full flex flex-col items-center justify-center gap-3 px-6 py-8 border-2 border-dashed rounded-2xl transition-colors cursor-pointer group ${isDragging ? 'border-indigo-500 bg-indigo-50/70 shadow-inner' : 'border-line hover:border-indigo-400 hover:bg-indigo-50/30'}`}
                                    >
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center transition ${isDragging ? 'bg-indigo-200' : 'bg-indigo-100 group-hover:bg-indigo-200'}`}>
                                            <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-bold text-fg">{isDragging ? "Drop your file here" : "Click or drag & drop to upload diagnostic report"}</p>
                                            <p className="text-xs text-faint mt-1">PDF, DOC, or DOCX • Max 20 MB</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                    </div>
                    )}

                    {/* ── SECTION I ─────────────────────────────────────────── */}
                    {(!isWizardMode || currentStep === 3) && (
                    <div className="space-y-10 animate-fadeIn">
                    <section className="bg-card rounded-2xl border border-line p-5 sm:p-8 shadow-sm space-y-7 relative overflow-hidden">
                        <SectionHeader title={isViewMode ? "Section I — Daily Living Skills" : "Daily Living Skills"} description="Help us understand how independent they are with daily self-care tasks." />

                        {[
                            { label: "Eating",   key: "eating" as keyof FormState,   opts: ["Eats independently", "Needs some help", "Needs full help"] },
                            { label: "Dressing", key: "dressing" as keyof FormState, opts: ["Dresses independently", "Needs some help", "Needs full help"] },
                            { label: "Toilet",   key: "toilet" as keyof FormState,   opts: ["Fully trained", "Needs reminders", "Needs help", "Uses diapers"] },
                            { label: "Sleep",    key: "sleep" as keyof FormState,    opts: ["Sleeps well", "Difficulty falling asleep", "Wakes often"] },
                        ].map(({ label, key, opts }) => (
                            <Field key={label} label={label} required isInvalid={isFieldInvalid(key, 3)}>
                                <div className="flex flex-wrap gap-3">
                                    {opts.map(o => (
                                        <Cb key={o} label={o} checked={form[key] === o} onChange={() => set(key)(form[key] === o ? "" : o)} disabled={dis} />
                                    ))}
                                </div>
                            </Field>
                        ))}
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
                                className="text-sm font-bold text-muted hover:text-blue-600 flex items-center gap-2 transition px-4 py-2 rounded-lg bg-app border border-line hover:bg-card hover:border-blue-300"
                            >
                                ← Back
                            </button>
                        ) : (
                            <button
                                onClick={handleSaveAndBack}
                                className="text-sm font-semibold text-faint hover:text-muted flex items-center gap-1 transition"
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
                                    style={{ padding: "12px 32px", fontSize: "0.95rem", borderRadius: "99px", background: loading ? "var(--text-muted)" : "#10b981", borderColor: "transparent", color: "white" }}
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
        <Suspense fallback={<div className="p-8 text-center text-muted">Loading form…</div>}>
            <ParentFormContent />
        </Suspense>
    );
}
