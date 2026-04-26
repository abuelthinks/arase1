"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ActivityIcon,
  AlertTriangle,
  Brain,
  Briefcase,
  CalendarCheck,
  CalendarX,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  HandHeart,
  Info,
  Languages,
  Loader2,
  Lock,
  FileText,
  MessageCircleHeart,
  RotateCcw,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { normalizeLanguages } from "@/lib/languages";
import { getPractitionerTitle } from "@/lib/specialties";

interface Specialist {
  id: number;
  first_name: string;
  last_name: string;
  specialty: string;
  specialties?: string[];
  languages?: string[];
  profile_image?: string | null;
}

const AVATAR_GRADIENTS = [
  "from-indigo-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-violet-500 to-purple-600",
  "from-sky-500 to-cyan-600",
];

const avatarGradient = (id: number) => AVATAR_GRADIENTS[id % AVATAR_GRADIENTS.length];

const LANGUAGE_CODES: Record<string, string> = {
  English: "EN",
  Arabic: "AR",
  Tagalog: "TL",
  Urdu: "UR",
  Hindi: "HI",
  Japanese: "JA",
  Spanish: "ES",
  French: "FR",
  Mandarin: "ZH",
  Chinese: "ZH",
};

const languageCode = (lang: string) => LANGUAGE_CODES[lang] || lang.slice(0, 2).toUpperCase();

interface SpecialistPreference {
  id: number;
  student: number;
  specialty: string;
  specialist: number;
  specialist_name: string;
  preferred_slot?: number | null;
}

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  status?: string;
}

interface AvailabilitySlot {
  id: number;
  specialist: number;
  specialist_name: string;
  start_at: string;
  end_at: string;
}

interface ParentAssessment {
  student: number;
  form_data?: {
    v2?: {
      primary_language?: string[];
      primary_language_other?: string;
    };
  };
}

const SPECIALTY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Speech-Language Pathology": MessageCircleHeart,
  "Occupational Therapy": HandHeart,
  "Physical Therapy": ActivityIcon,
  "Applied Behavior Analysis (ABA)": Brain,
  "Developmental Psychology": Sparkles,
};

const specialistName = (specialist: Specialist) => {
  const name = `${specialist.first_name || ""} ${specialist.last_name || ""}`.trim();
  return name || `Specialist #${specialist.id}`;
};

const specialistInitials = (specialist: Specialist) => {
  const first = specialist.first_name?.[0] || "";
  const last = specialist.last_name?.[0] || "";
  return `${first}${last}`.toUpperCase() || "SP";
};

const shortTimeLabel = (value: string) => new Date(value).toLocaleTimeString([], {
  hour: "numeric",
  minute: "2-digit",
});

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const relativeDateLabel = (iso: string) => {
  const target = startOfDay(new Date(iso));
  const today = startOfDay(new Date());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays < 7) {
    return new Date(iso).toLocaleDateString([], { weekday: "long" });
  }
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
};

const groupSlotsByRelativeDay = (slots: AvailabilitySlot[]) => {
  const groups: Record<string, { label: string; sortKey: number; slots: AvailabilitySlot[] }> = {};
  for (const slot of slots) {
    const day = startOfDay(new Date(slot.start_at));
    const key = day.toISOString();
    if (!groups[key]) {
      groups[key] = { label: relativeDateLabel(slot.start_at), sortKey: day.getTime(), slots: [] };
    }
    groups[key].slots.push(slot);
  }
  return Object.values(groups).sort((a, b) => a.sortKey - b.sortKey);
};

function SpecialistsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentId = searchParams.get("studentId");

  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [preferences, setPreferences] = useState<SpecialistPreference[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [formStatuses, setFormStatuses] = useState<any>(null);
  const [assignedStaff, setAssignedStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [slotSelections, setSlotSelections] = useState<Record<string, number>>({});
  const [expandedForBrowsing, setExpandedForBrowsing] = useState<Record<string, boolean>>({});
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [showUnavailable, setShowUnavailable] = useState<Record<string, boolean>>({});
  const [requestedLanguages, setRequestedLanguages] = useState<string[]>([]);

  useEffect(() => {
    if (!studentId || !user) return;

    const fetchData = async () => {
      try {
        const profileRes = await api.get(`/api/students/${studentId}/profile/`);
        setStudent(profileRes.data.student);
        setFormStatuses(profileRes.data.form_statuses);
        setAssignedStaff(profileRes.data.assigned_staff || []);

        const specRes = await api.get("/api/specialists/");
        setSpecialists(specRes.data);

        const availabilityRes = await api.get(`/api/assessment/availability/?student_id=${studentId}&scope=preferences`);
        setAvailabilitySlots(availabilityRes.data || []);

        const prefRes = await api.get(`/api/specialist-preferences/?student_id=${studentId}`);
        setPreferences(prefRes.data);

        try {
          const parentAssessmentRes = await api.get("/api/inputs/parent-assessment/");
          const parentAssessment = (parentAssessmentRes.data || []).find(
            (item: ParentAssessment) => Number(item.student) === Number(studentId),
          );
          const languageData = parentAssessment?.form_data?.v2 || {};
          const baseLanguages: string[] = Array.isArray(languageData.primary_language) ? languageData.primary_language : [];
          const otherLanguage = languageData.primary_language_other ? [languageData.primary_language_other] : [];
          setRequestedLanguages(normalizeLanguages([...baseLanguages.filter(l => l !== "Other"), ...otherLanguage]));
        } catch {
          setRequestedLanguages([]);
        }

        const initialSelections: Record<string, number> = {};
        const initialSlotSelections: Record<string, number> = {};
        const initialExpanded: Record<string, boolean> = {};
        prefRes.data.forEach((pref: SpecialistPreference) => {
          initialSelections[pref.specialty] = pref.specialist;
          initialExpanded[pref.specialty] = true;
          if (pref.preferred_slot) {
            initialSlotSelections[pref.specialty] = pref.preferred_slot;
          }
        });
        setSelections(initialSelections);
        setSlotSelections(initialSlotSelections);
        setExpandedForBrowsing(initialExpanded);
      } catch (err) {
        console.error("Failed to load data", err);
        toast.error("Failed to load specialist data.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [studentId, user]);

  const groupedSpecialists = useMemo(() => {
    return specialists.reduce((acc, current) => {
      const specs = (current.specialties && current.specialties.length > 0)
        ? current.specialties
        : [current.specialty || "Other"];

      for (const specialty of specs) {
        const key = specialty || "Other";
        if (!acc[key]) acc[key] = [];
        acc[key].push(current);
      }

      return acc;
    }, {} as Record<string, Specialist[]>);
  }, [specialists]);

  const slotsBySpecialist = useMemo(() => {
    return availabilitySlots.reduce((acc, slot) => {
      if (!acc[slot.specialist]) acc[slot.specialist] = [];
      acc[slot.specialist].push(slot);
      return acc;
    }, {} as Record<number, AvailabilitySlot[]>);
  }, [availabilitySlots]);

  const languageMatchesRequest = (specialist: Specialist) => {
    if (requestedLanguages.length === 0) return false;
    const specialistLanguages = normalizeLanguages(specialist.languages || []);
    const requested = new Set(requestedLanguages.map(l => l.toLowerCase()));
    return specialistLanguages.some(l => requested.has(l.toLowerCase()));
  };

  const clearPickForSpecialty = (specialty: string) => {
    setSelections(prev => {
      const next = { ...prev };
      delete next[specialty];
      return next;
    });
    setSlotSelections(prev => {
      const next = { ...prev };
      delete next[specialty];
      return next;
    });
  };

  const pickSpecialist = (specialty: string, specialistId: number, slotId?: number) => {
    setSelections(prev => ({ ...prev, [specialty]: specialistId }));
    setSlotSelections(prev => {
      const next = { ...prev };
      if (slotId) next[specialty] = slotId;
      else delete next[specialty];
      return next;
    });
  };

  const handleSave = async () => {
    if (!studentId) return;
    setSaving(true);
    try {
      await Promise.all(preferences.map(p => api.delete(`/api/specialist-preferences/${p.id}/`)));

      const newPrefs = [];
      for (const [specialty, specId] of Object.entries(selections)) {
        if (specId) {
          const res = await api.post("/api/specialist-preferences/", {
            student: Number(studentId),
            specialty,
            specialist: specId,
            preferred_slot: slotSelections[specialty] || null,
          });
          newPrefs.push(res.data);
        }
      }

      setPreferences(newPrefs);
      toast.success("Preferences saved successfully.");
      router.push("/dashboard");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  };

  const childName = student?.first_name || "your child";
  const specialtyEntries = Object.entries(groupedSpecialists);
  const totalSpecialties = specialtyEntries.length;
  const overrideCount = Object.values(selections).filter(Boolean).length;
  const hasOverrides = overrideCount > 0;
  const defaultVisibleCount = 6;

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-0 md:py-12">
        <div className="h-8 w-2/3 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-20 w-full animate-pulse rounded-2xl bg-slate-100" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-40 w-full animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (!student) {
    return <div className="p-8 text-center text-red-500">Student not found.</div>;
  }

  const parentAssessmentSubmitted = formStatuses?.parent_assessment?.submitted;
  const assignedSpecialists = assignedStaff.filter(s => s.role === "SPECIALIST");
  const isTeamFinalized = assignedSpecialists.length > 0 || student?.status === "ENROLLED";

  if (!parentAssessmentSubmitted) {
    return (
      <div className="bg-gradient-to-b from-indigo-50/60 via-white to-white pb-32 min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center mb-6">
          <Lock className="h-8 w-8 text-slate-400" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-3">Assessment Required</h1>
        <p className="text-slate-500 max-w-md mb-8 leading-relaxed">
          Before we can match {childName} with the best specialists, we need you to complete the "About Your Child" form. This helps us understand their unique needs.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          <FileText className="h-4 w-4" />
          Go to Assessment
        </Link>
      </div>
    );
  }

  if (isTeamFinalized) {
    return (
      <div className="bg-gradient-to-b from-indigo-50/60 via-white to-white pb-32 min-h-screen">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-0 md:py-12">
          {/* Header */}
          <div className="flex items-start gap-4">
            <Link
              href="/dashboard"
              aria-label="Back to dashboard"
              className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-200">
                <Users className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h1 className="m-0 bg-gradient-to-r from-blue-700 to-indigo-500 bg-clip-text text-2xl font-extrabold leading-tight tracking-tight text-transparent md:text-3xl">
                  {childName}'s Clinical Team
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Our clinical directors have reviewed your child's needs and finalized their dedicated team of specialists.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {assignedSpecialists.length > 0 ? (
              assignedSpecialists.map((staff, idx) => (
                <div key={idx} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  {staff.profile_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={staff.profile_image} alt="" className="h-14 w-14 rounded-full object-cover shadow-sm" />
                  ) : (
                    <div className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(staff.id)} text-base font-extrabold text-white shadow-sm`}>
                      {staff.first_name?.[0] || ""}{staff.last_name?.[0] || ""}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-slate-900 truncate">
                      {staff.first_name} {staff.last_name}
                    </p>
                    <p className="text-xs font-semibold text-indigo-600 mt-0.5 truncate">
                      {staff.specialty || "Specialist"}
                    </p>
                    {staff.assigned_specialties && staff.assigned_specialties.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {staff.assigned_specialties.map((s: string) => (
                          <span key={s} className="px-2 py-0.5 rounded-md bg-slate-100 text-[0.65rem] font-bold text-slate-600">
                            {getPractitionerTitle(s)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-1 md:col-span-2 rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm italic text-slate-400 shadow-sm">
                No specialists assigned yet.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-indigo-50/60 via-white to-white pb-32">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-0 md:py-12">

        {/* Header */}
        <div className="flex items-start gap-4">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-200">
              <Users className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="m-0 bg-gradient-to-r from-blue-700 to-indigo-500 bg-clip-text text-2xl font-extrabold leading-tight tracking-tight text-transparent md:text-3xl">
                Who should work with {childName}?
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Our team will match {childName} with the best-fit specialist in each area.
                You can override any of these picks below — it's optional.
              </p>
            </div>
          </div>
        </div>

        {/* Positive-state banner */}
        <div
          className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
            hasOverrides
              ? "border-indigo-200 bg-indigo-50/70"
              : "border-emerald-200 bg-emerald-50/70"
          }`}
        >
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            hasOverrides ? "bg-white text-indigo-600" : "bg-white text-emerald-600"
          }`}>
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex-1">
            {hasOverrides ? (
              <>
                <p className="m-0 text-sm font-extrabold text-indigo-950">
                  You've picked {overrideCount} specialist{overrideCount !== 1 ? "s" : ""}.
                </p>
                <p className="mt-1 text-sm text-indigo-800">
                  Our team will match {childName} with the best-fit specialist for the remaining {totalSpecialties - overrideCount} area{totalSpecialties - overrideCount !== 1 ? "s" : ""}.
                </p>
              </>
            ) : (
              <>
                <p className="m-0 text-sm font-extrabold text-emerald-950">
                  {childName} is ready — we'll match her with the best team.
                </p>
                <p className="mt-1 text-sm text-emerald-800">
                  {requestedLanguages.length > 0 ? (
                    <>Specialists who speak <span className="font-bold">{requestedLanguages.join(", ")}</span> and have the soonest availability are prioritized.</>
                  ) : (
                    <>Specialists with the soonest availability are prioritized.</>
                  )}
                </p>
              </>
            )}
          </div>
        </div>

        {totalSpecialties === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm italic text-slate-400 shadow-sm">
            No specialists are available right now.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {specialtyEntries.map(([specialty, list]) => {
              const selectedSpecialistId = selections[specialty];
              const hasPick = Boolean(selectedSpecialistId);
              const isBrowsing = Boolean(expandedForBrowsing[specialty]);
              const practitionerTitle = getPractitionerTitle(specialty);
              const SpecialtyIcon = SPECIALTY_ICONS[specialty] || Briefcase;

              const languageMatchCount = list.filter(languageMatchesRequest).length;
              const allSlots = list.flatMap(sp => slotsBySpecialist[sp.id] || []);
              const earliestSlot = allSlots.sort(
                (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
              )[0];
              const openSlotsCount = allSlots.length;

              const pickedSpecialist = hasPick ? list.find(sp => sp.id === selectedSpecialistId) : null;
              const pickedSlot = slotSelections[specialty]
                ? allSlots.find(s => s.id === slotSelections[specialty])
                : null;

              return (
                <section
                  key={specialty}
                  className={`rounded-2xl border bg-white shadow-sm transition-all ${
                    hasPick ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-200"
                  }`}
                  aria-labelledby={`specialty-heading-${specialty.replace(/\s+/g, "-")}`}
                >
                  {/* Section header — always visible, tight */}
                  <div className="flex items-center justify-between gap-3 border-b border-indigo-100/60 px-4 py-3 md:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        hasPick ? "bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm" : "bg-indigo-50 text-indigo-600"
                      }`}>
                        <SpecialtyIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h2
                          id={`specialty-heading-${specialty.replace(/\s+/g, "-")}`}
                          className="m-0 truncate text-sm font-extrabold text-slate-900 md:text-base"
                        >
                          {practitionerTitle}
                        </h2>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {hasPick ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[0.65rem] font-bold text-indigo-700">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Your pick
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[0.65rem] font-bold text-emerald-700">
                          <Sparkles className="h-3 w-3" aria-hidden="true" />
                          Matching for you
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Summary view */}
                  {!isBrowsing && (
                    <div className="px-5 py-5 md:px-6">
                      {hasPick && pickedSpecialist ? (
                        // User has picked — compact summary with avatar
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-3">
                            {pickedSpecialist.profile_image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={pickedSpecialist.profile_image}
                                alt=""
                                className="h-12 w-12 rounded-full object-cover"
                              />
                            ) : (
                              <div
                                className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(pickedSpecialist.id)} text-sm font-extrabold text-white shadow-sm`}
                                aria-hidden="true"
                              >
                                {specialistInitials(pickedSpecialist)}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="m-0 text-xs font-bold uppercase tracking-wide text-slate-400">Your pick</p>
                              <p className="m-0 truncate text-base font-extrabold text-slate-900">
                                {specialistName(pickedSpecialist)}
                              </p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                                {languageMatchesRequest(pickedSpecialist) && (
                                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                    <Check className="h-3 w-3" aria-hidden="true" />
                                    Language match
                                  </span>
                                )}
                                {pickedSlot ? (
                                  <span className="inline-flex items-center gap-1 font-semibold">
                                    <CalendarCheck className="h-3 w-3 text-indigo-600" aria-hidden="true" />
                                    {relativeDateLabel(pickedSlot.start_at)}, {shortTimeLabel(pickedSlot.start_at)}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-slate-400">
                                    <Clock className="h-3 w-3" aria-hidden="true" />
                                    No time selected
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedForBrowsing(prev => ({ ...prev, [specialty]: true }))}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                            >
                              Change pick
                              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => clearPickForSpecialty(specialty)}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:text-slate-700"
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                              Let us match instead
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Default "let us match" summary — tight, scannable trust signals
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                            <span className="inline-flex items-center gap-1.5 text-slate-700">
                              <Languages className={`h-4 w-4 ${requestedLanguages.length > 0 && languageMatchCount > 0 ? "text-emerald-600" : "text-slate-400"}`} aria-hidden="true" />
                              <span className="font-bold">
                                {requestedLanguages.length > 0
                                  ? languageMatchCount > 0
                                    ? `${languageMatchCount} speak${languageMatchCount === 1 ? "s" : ""} ${requestedLanguages[0]}`
                                    : "No language match"
                                  : `${list.length} available`}
                              </span>
                            </span>
                            <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
                            <span className="inline-flex items-center gap-1.5 text-slate-700">
                              {earliestSlot ? (
                                <CalendarCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                              ) : (
                                <CalendarX className="h-4 w-4 text-slate-400" aria-hidden="true" />
                              )}
                              <span className="font-bold">
                                {earliestSlot
                                  ? `${relativeDateLabel(earliestSlot.start_at)}, ${shortTimeLabel(earliestSlot.start_at)}`
                                  : "No slots yet"}
                              </span>
                            </span>
                            {openSlotsCount > 0 && (
                              <>
                                <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
                                <span className="inline-flex items-center gap-1.5 text-slate-500">
                                  <Clock className="h-4 w-4" aria-hidden="true" />
                                  {openSlotsCount} slot{openSlotsCount !== 1 ? "s" : ""} this week
                                </span>
                              </>
                            )}
                          </div>

                          {/* Avatar stack — hint at real specialists */}
                          <div className="flex items-center gap-3">
                            <div className="flex -space-x-2" aria-hidden="true">
                              {list.slice(0, 4).map(sp => (
                                <div
                                  key={sp.id}
                                  className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(sp.id)} text-[0.65rem] font-extrabold text-white ring-2 ring-white`}
                                  title={specialistName(sp)}
                                >
                                  {specialistInitials(sp)}
                                </div>
                              ))}
                              {list.length > 4 && (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[0.65rem] font-extrabold text-slate-600 ring-2 ring-white">
                                  +{list.length - 4}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setExpandedForBrowsing(prev => ({ ...prev, [specialty]: true }))}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-50"
                            >
                              Browse specialists
                              <ChevronDown className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>

                          {requestedLanguages.length > 0 && languageMatchCount === 0 && (
                            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                              No specialists currently speak {requestedLanguages.join(", ")}. Our team will find the best alternative.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Browsing view */}
                  {isBrowsing && (
                    <div className="px-5 py-5 md:px-6">
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        {list.length > defaultVisibleCount ? (
                          <div className="relative flex-1 sm:max-w-xs">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={searchTerms[specialty] || ""}
                              onChange={e => setSearchTerms(prev => ({ ...prev, [specialty]: e.target.value }))}
                              placeholder="Search specialists"
                              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-3 text-sm text-slate-800 outline-none transition-all hover:bg-white focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/15"
                            />
                          </div>
                        ) : <div />}
                        <button
                          type="button"
                          onClick={() => setExpandedForBrowsing(prev => ({ ...prev, [specialty]: false }))}
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-slate-500 transition-colors hover:text-slate-700"
                        >
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                          Hide list
                        </button>
                      </div>

                      {/* Let us match row — compact form */}
                      <button
                        type="button"
                        onClick={() => clearPickForSpecialty(specialty)}
                        aria-pressed={!hasPick}
                        className={`mb-3 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all focus:outline-none focus:ring-4 focus:ring-emerald-500/20 ${
                          !hasPick
                            ? "border-emerald-300 bg-emerald-50/70"
                            : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            !hasPick ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-200" : "bg-slate-100 text-slate-400"
                          }`}>
                            <Sparkles className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div>
                            <p className={`m-0 text-sm font-extrabold ${!hasPick ? "text-emerald-950" : "text-slate-700"}`}>
                              Let our team match
                            </p>
                            <p className={`m-0 text-xs ${!hasPick ? "text-emerald-800" : "text-slate-500"}`}>
                              Best-fit specialist based on language and availability
                            </p>
                          </div>
                        </div>
                        {!hasPick && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />}
                      </button>

                      {/* Specialist list */}
                      <SpecialistList
                        specialty={specialty}
                        list={list}
                        selectedSpecialistId={selectedSpecialistId}
                        selectedSlotId={slotSelections[specialty]}
                        slotsBySpecialist={slotsBySpecialist}
                        requestedLanguages={requestedLanguages}
                        languageMatchesRequest={languageMatchesRequest}
                        onPick={pickSpecialist}
                        searchTerm={searchTerms[specialty] || ""}
                        showUnavailable={Boolean(showUnavailable[specialty])}
                        onToggleUnavailable={() =>
                          setShowUnavailable(prev => ({ ...prev, [specialty]: !prev[specialty] }))
                        }
                      />
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {/* Helper footnote */}
        <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            You can change any of these picks later from the dashboard. This step is fully optional.
          </span>
        </div>
      </div>

      {/* Sticky footer */}
      {totalSpecialties > 0 && (
        <div className="fixed bottom-[56px] left-0 right-0 z-[1001] border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:bottom-0 md:pl-[180px]">
          <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-xs font-semibold text-slate-500">
                {hasOverrides
                  ? `You've picked ${overrideCount} · Our team will match the remaining ${totalSpecialties - overrideCount}`
                  : `Our team will match all ${totalSpecialties} specialists for ${childName}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                disabled={saving}
                onClick={() => router.push("/dashboard")}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 transition-colors hover:text-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={handleSave}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving...
                  </>
                ) : hasOverrides ? (
                  "Save my preferences"
                ) : (
                  `Looks good, match ${childName}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SpecialistList({
  specialty,
  list,
  selectedSpecialistId,
  selectedSlotId,
  slotsBySpecialist,
  requestedLanguages,
  languageMatchesRequest,
  onPick,
  searchTerm,
  showUnavailable,
  onToggleUnavailable,
}: {
  specialty: string;
  list: Specialist[];
  selectedSpecialistId?: number;
  selectedSlotId?: number;
  slotsBySpecialist: Record<number, AvailabilitySlot[]>;
  requestedLanguages: string[];
  languageMatchesRequest: (specialist: Specialist) => boolean;
  onPick: (specialty: string, specialistId: number, slotId?: number) => void;
  searchTerm: string;
  showUnavailable: boolean;
  onToggleUnavailable: () => void;
}) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const sorted = [...list].sort((a, b) => {
    const aSlots = slotsBySpecialist[a.id] || [];
    const bSlots = slotsBySpecialist[b.id] || [];
    const aHasSlots = aSlots.length > 0;
    const bHasSlots = bSlots.length > 0;
    const aLanguageMatch = languageMatchesRequest(a);
    const bLanguageMatch = languageMatchesRequest(b);

    if (a.id === selectedSpecialistId) return -1;
    if (b.id === selectedSpecialistId) return 1;
    if (aLanguageMatch !== bLanguageMatch) return aLanguageMatch ? -1 : 1;
    if (aHasSlots !== bHasSlots) return aHasSlots ? -1 : 1;

    const aEarliest = aSlots.length > 0 ? new Date(aSlots[0].start_at).getTime() : Number.POSITIVE_INFINITY;
    const bEarliest = bSlots.length > 0 ? new Date(bSlots[0].start_at).getTime() : Number.POSITIVE_INFINITY;
    if (aEarliest !== bEarliest) return aEarliest - bEarliest;

    return specialistName(a).localeCompare(specialistName(b));
  });

  const filtered = sorted.filter(sp => {
    if (!normalizedSearch) return true;
    const specs = (sp.specialties && sp.specialties.length > 0) ? sp.specialties : [sp.specialty];
    const languages = normalizeLanguages(sp.languages || []);
    const haystack = `${specialistName(sp)} ${specs.join(" ")} ${languages.join(" ")}`.toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  const withSlots = filtered.filter(sp => (slotsBySpecialist[sp.id] || []).length > 0);
  const withoutSlots = filtered.filter(sp => (slotsBySpecialist[sp.id] || []).length === 0);

  if (filtered.length === 0) {
    return (
      <p className="m-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        No specialists match your search.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {withSlots.map(sp => (
        <SpecialistCard
          key={sp.id}
          specialty={specialty}
          specialist={sp}
          slots={slotsBySpecialist[sp.id] || []}
          isSelected={selectedSpecialistId === sp.id}
          selectedSlotId={selectedSlotId}
          requestedLanguages={requestedLanguages}
          languageMatch={languageMatchesRequest(sp)}
          onPick={onPick}
        />
      ))}

      {withoutSlots.length > 0 && (
        <>
          <button
            type="button"
            onClick={onToggleUnavailable}
            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            {showUnavailable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showUnavailable
              ? "Hide specialists without open slots"
              : `Show ${withoutSlots.length} specialist${withoutSlots.length !== 1 ? "s" : ""} without open slots`}
          </button>
          {showUnavailable && withoutSlots.map(sp => (
            <SpecialistCard
              key={sp.id}
              specialty={specialty}
              specialist={sp}
              slots={[]}
              isSelected={selectedSpecialistId === sp.id}
              selectedSlotId={selectedSlotId}
              requestedLanguages={requestedLanguages}
              languageMatch={languageMatchesRequest(sp)}
              onPick={onPick}
              dimmed
            />
          ))}
        </>
      )}
    </div>
  );
}

function SpecialistCard({
  specialty,
  specialist,
  slots,
  isSelected,
  selectedSlotId,
  requestedLanguages,
  languageMatch,
  onPick,
  dimmed,
}: {
  specialty: string;
  specialist: Specialist;
  slots: AvailabilitySlot[];
  isSelected: boolean;
  selectedSlotId?: number;
  requestedLanguages: string[];
  languageMatch: boolean;
  onPick: (specialty: string, specialistId: number, slotId?: number) => void;
  dimmed?: boolean;
}) {
  const languages = normalizeLanguages(specialist.languages || []);
  const dayGroups = groupSlotsByRelativeDay(slots).slice(0, 2);
  const shownSlotsCount = dayGroups.reduce((n, g) => n + Math.min(g.slots.length, 3), 0);
  const remainingSlotCount = Math.max(slots.length - shownSlotsCount, 0);
  const earliestSlot = slots[0];

  return (
    <div
      className={`rounded-xl border bg-white transition-all ${
        isSelected
          ? "border-indigo-400 shadow-sm ring-2 ring-indigo-100"
          : "border-slate-200 hover:border-indigo-200 hover:shadow-sm"
      } ${dimmed ? "opacity-60" : ""}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onPick(specialty, specialist.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPick(specialty, specialist.id);
          }
        }}
        aria-pressed={isSelected}
        className="flex w-full cursor-pointer items-start gap-3 rounded-xl p-3 text-left transition-all focus:outline-none focus:ring-4 focus:ring-indigo-500/20"
      >
        {/* Avatar */}
        <div className="relative shrink-0">
          {specialist.profile_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={specialist.profile_image}
              alt=""
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(specialist.id)} text-sm font-extrabold text-white shadow-sm`}
              aria-hidden="true"
            >
              {specialistInitials(specialist)}
            </div>
          )}
          {languageMatch && (
            <div
              className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white"
              title="Speaks your language"
              aria-label="Language match"
            >
              <Check className="h-3 w-3 text-white" aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Info column */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-extrabold text-slate-900">
                {specialistName(specialist)}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                {earliestSlot ? (
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <CalendarCheck className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                    Next: {relativeDateLabel(earliestSlot.start_at)} {shortTimeLabel(earliestSlot.start_at)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-400">
                    <CalendarX className="h-3 w-3" aria-hidden="true" />
                    No open slots yet
                  </span>
                )}
                {slots.length > 0 && (
                  <>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span>{slots.length} slot{slots.length !== 1 ? "s" : ""}</span>
                  </>
                )}
              </div>
              {/* Language codes */}
              {languages.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {languages.slice(0, 4).map(lang => {
                    const match = requestedLanguages.some(r => r.toLowerCase() === lang.toLowerCase());
                    return (
                      <span
                        key={lang}
                        title={lang}
                        className={`inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded px-1 text-[0.6rem] font-extrabold ${
                          match
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {languageCode(lang)}
                      </span>
                    );
                  })}
                  {languages.length > 4 && (
                    <span className="inline-flex h-5 items-center justify-center rounded bg-slate-100 px-1 text-[0.6rem] font-extrabold text-slate-500">
                      +{languages.length - 4}
                    </span>
                  )}
                </div>
              ) : requestedLanguages.length > 0 ? (
                <div className="mt-1.5">
                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[0.6rem] font-bold text-amber-700">
                    <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                    Language not listed
                  </span>
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href={`/users/${specialist.id}`}
                onClick={e => e.stopPropagation()}
                aria-label={`View ${specialistName(specialist)}'s profile`}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <Info className="h-3.5 w-3.5" />
              </Link>
              {isSelected && <CheckCircle2 className="h-5 w-5 text-indigo-600" aria-hidden="true" />}
            </div>
          </div>

          {/* Inline time pills — Calendly-style, flat in the card */}
          {slots.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {dayGroups.map((group, gi) => (
                <div key={group.label} className="flex items-center gap-1.5">
                  <span className="text-[0.62rem] font-bold uppercase tracking-wider text-slate-400">
                    {group.label}
                  </span>
                  {group.slots.slice(0, 3).map(slot => {
                    const checked = isSelected && selectedSlotId === slot.id;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPick(specialty, specialist.id, slot.id);
                        }}
                        aria-label={`Pick ${specialistName(specialist)} for ${group.label} at ${shortTimeLabel(slot.start_at)}`}
                        aria-pressed={checked}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.7rem] font-bold transition-all focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${
                          checked
                            ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                        }`}
                      >
                        {shortTimeLabel(slot.start_at)}
                      </button>
                    );
                  })}
                  {gi < dayGroups.length - 1 && (
                    <span className="mx-0.5 text-slate-300" aria-hidden="true">|</span>
                  )}
                </div>
              ))}
              {remainingSlotCount > 0 && (
                <span className="text-[0.68rem] font-semibold text-slate-400">
                  +{remainingSlotCount} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SpecialistsPage() {
  return (
    <ProtectedRoute allowedRoles={["ADMIN", "PARENT"]}>
      <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading...</div>}>
        <SpecialistsContent />
      </Suspense>
    </ProtectedRoute>
  );
}
