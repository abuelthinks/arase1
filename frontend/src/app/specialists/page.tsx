'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ActivityIcon,
  AlertTriangle,
  Brain,
  Briefcase,
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
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { extractApiError } from '@/lib/toast-utils';
import { normalizeLanguages } from '@/lib/languages';
import { getPractitionerTitle, getSpecialtyDescription } from '@/lib/specialties';
import { semanticToneClass } from '@/lib/role-colors';

interface Specialist {
  id: number;
  first_name: string;
  last_name: string;
  specialty: string;
  specialties?: string[];
  languages?: string[];
  profile_image?: string | null;
}

interface SpecialistPreference {
  id: number;
  student: number;
  specialty: string;
  specialist: number;
}

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  status?: string;
  status_code?: string;
}

interface AssignedStaff {
  id: number;
  role: string;
  first_name: string;
  last_name: string;
  specialty?: string;
  specialties?: string[];
  languages?: string[];
  profile_image?: string | null;
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
  'Speech-Language Pathology': MessageCircleHeart,
  'Occupational Therapy': HandHeart,
  'Physical Therapy': ActivityIcon,
  'Applied Behavior Analysis (ABA)': Brain,
  'Developmental Psychology': Sparkles,
};

const LANGUAGE_CODES: Record<string, string> = {
  English: 'EN',
  Arabic: 'AR',
  Tagalog: 'TL',
  Urdu: 'UR',
  Hindi: 'HI',
  Japanese: 'JA',
  Spanish: 'ES',
  French: 'FR',
  Mandarin: 'ZH',
  Chinese: 'ZH',
};

const specialistName = (specialist: Specialist) => {
  const name = `${specialist.first_name || ''} ${specialist.last_name || ''}`.trim();
  return name || `Specialist #${specialist.id}`;
};

const specialistInitials = (specialist: Specialist) => {
  const first = specialist.first_name?.[0] || '';
  const last = specialist.last_name?.[0] || '';
  return `${first}${last}`.toUpperCase() || 'SP';
};

const languageCode = (language: string) => LANGUAGE_CODES[language] || language.slice(0, 2).toUpperCase();

function SpecialistsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentId = searchParams.get('studentId');

  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [preferences, setPreferences] = useState<SpecialistPreference[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [formStatuses, setFormStatuses] = useState<any>(null);
  const [assignedStaff, setAssignedStaff] = useState<AssignedStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'undecided' | 'manual'>('undecided');
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [expandedForBrowsing, setExpandedForBrowsing] = useState<Record<string, boolean>>({});
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [requestedLanguages, setRequestedLanguages] = useState<string[]>([]);

  useEffect(() => {
    if (!studentId || !user) return;

    const fetchData = async () => {
      try {
        const profileRes = await api.get(`/api/students/${studentId}/profile/`);
        setStudent(profileRes.data.student);
        setFormStatuses(profileRes.data.form_statuses);
        setAssignedStaff(profileRes.data.assigned_staff || []);

        const specRes = await api.get('/api/specialists/');
        setSpecialists(specRes.data);

        const prefRes = await api.get(`/api/specialist-preferences/?student_id=${studentId}`);
        setPreferences(prefRes.data);

        try {
          const parentAssessmentRes = await api.get('/api/inputs/parent-assessment/');
          const parentAssessment = (parentAssessmentRes.data || []).find(
            (item: ParentAssessment) => Number(item.student) === Number(studentId),
          );
          const languageData = parentAssessment?.form_data?.v2 || {};
          const baseLanguages: string[] = Array.isArray(languageData.primary_language) ? languageData.primary_language : [];
          const otherLanguage = languageData.primary_language_other ? [languageData.primary_language_other] : [];
          setRequestedLanguages(normalizeLanguages([...baseLanguages.filter(language => language !== 'Other'), ...otherLanguage]));
        } catch {
          setRequestedLanguages([]);
        }

        const initialSelections: Record<string, number> = {};
        const initialExpanded: Record<string, boolean> = {};
        prefRes.data.forEach((pref: SpecialistPreference) => {
          initialSelections[pref.specialty] = pref.specialist;
          initialExpanded[pref.specialty] = true;
        });
        setSelections(initialSelections);
        setExpandedForBrowsing(initialExpanded);

        if (prefRes.data.length > 0) {
          setSelectionMode('manual');
        }
      } catch (err) {
        console.error('Failed to load data', err);
        toast.error('Could not load specialists.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [studentId, user]);

  const groupedSpecialists = useMemo(() => {
    return specialists.reduce((acc, current) => {
      const specialties = current.specialties && current.specialties.length > 0
        ? current.specialties
        : [current.specialty || 'Other'];

      for (const specialty of specialties) {
        const key = specialty || 'Other';
        if (!acc[key]) acc[key] = [];
        acc[key].push(current);
      }

      return acc;
    }, {} as Record<string, Specialist[]>);
  }, [specialists]);

  const languageMatchesRequest = (specialist: Specialist) => {
    if (requestedLanguages.length === 0) return false;
    const specialistLanguages = normalizeLanguages(specialist.languages || []);
    const requested = new Set(requestedLanguages.map(language => language.toLowerCase()));
    return specialistLanguages.some(language => requested.has(language.toLowerCase()));
  };

  // Reachable from the dashboard card and from the workspace overview, so "back"
  // has to mean wherever they actually came from. Falls back to the dashboard
  // when this page was opened directly and there is no in-app history to pop.
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/dashboard');
  };

  const clearPickForSpecialty = (specialty: string) => {
    setSelections(prev => {
      const next = { ...prev };
      delete next[specialty];
      return next;
    });
  };

  const pickSpecialist = (specialty: string, specialistId: number) => {
    setSelections(prev => ({ ...prev, [specialty]: specialistId }));
  };

  const handleSave = async () => {
    if (!studentId) return;
    setSaving(true);
    try {
      // 1. Fetch the absolute latest preferences to avoid 404s and handle dirty states from partial saves
      const currentPrefsRes = await api.get(`/api/specialist-preferences/?student_id=${studentId}`);
      const currentPrefs = currentPrefsRes.data;

      // 2. Delete all existing preferences, ignoring 404s just in case
      await Promise.all(
        currentPrefs.map((pref: any) => 
          api.delete(`/api/specialist-preferences/${pref.id}/`).catch(err => {
            if (err.response?.status !== 404) throw err;
          })
        )
      );

      // 3. Post new selections concurrently for speed and reliability
      const postPromises = Object.entries(selections)
        .filter(([_, specialistId]) => specialistId)
        .map(([specialty, specialistId]) =>
          api.post('/api/specialist-preferences/', {
            student: Number(studentId),
            specialty,
            specialist: specialistId,
          })
        );

      const results = await Promise.all(postPromises);
      setPreferences(results.map(res => res.data));

      toast.success("Preferences saved.");
      router.push('/dashboard');
    } catch (error) {
      console.error(error);
      toast.error(extractApiError(error, 'Failed to save preferences.'));
    } finally {
      setSaving(false);
    }
  };

  const childName = student?.first_name || 'your child';
  const specialtyEntries = Object.entries(groupedSpecialists);
  const totalSpecialties = specialtyEntries.length;
  const overrideCount = Object.values(selections).filter(Boolean).length;
  const hasOverrides = overrideCount > 0;
  const defaultVisibleCount = 6;

  if (loading) {
    return (
      <div className='mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-0 md:py-12'>
        <div className='h-8 w-2/3 animate-pulse rounded-lg bg-subtle-soft' />
        <div className='h-20 w-full animate-pulse rounded-2xl bg-subtle-soft' />
        {[...Array(3)].map((_, index) => (
          <div key={index} className='h-40 w-full animate-pulse rounded-2xl bg-subtle-soft' />
        ))}
      </div>
    );
  }

  if (!student) {
    return <div className='p-8 text-center text-danger'>Student not found.</div>;
  }

  const parentAssessmentSubmitted = formStatuses?.parent_assessment?.submitted;
  const assignedSpecialists = assignedStaff.filter(staff => staff.role === 'SPECIALIST');
  const assignedTeacher = assignedStaff.find(staff => staff.role === 'TEACHER');
  const statusCode = (student?.status_code || student?.status || '').toUpperCase().replace(/\s+/g, '_');
  const isTeamFinalized = assignedSpecialists.length > 0 || statusCode === 'ENROLLED' || statusCode === 'INTEGRATED';

  if (!parentAssessmentSubmitted) {
    return (
      <div className='flex min-h-screen flex-col items-center justify-center bg-app p-6 pb-32 text-center'>
        <div className='w-16 h-16 bg-card rounded-2xl shadow-sm border border-line flex items-center justify-center mb-6'>
          <Lock className='h-8 w-8 text-faint' />
        </div>
        <h1 className='text-2xl font-extrabold text-fg mb-3'>Assessment Required</h1>
        <p className='text-muted max-w-md mb-8 leading-relaxed'>
          Before we can match {childName} with the best specialists, we need you to complete the "About Your Child" form. This helps us understand their unique needs.
        </p>
        <Link
          href='/dashboard'
          className='inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700'
        >
          <FileText className='h-4 w-4' />
          Go to Assessment
        </Link>
      </div>
    );
  }

  if (isTeamFinalized) {
    return (
      <div className='min-h-screen bg-app pb-32'>
        <div className='mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-0 md:py-12'>
          <div className='flex items-start gap-4'>
            <button
              type='button'
              onClick={goBack}
              aria-label='Go back'
              className='mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-muted transition-colors hover:bg-app hover:text-fg'
            >
              <ChevronLeft className='h-4 w-4' />
            </button>
            <div className='flex items-start gap-4'>
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${semanticToneClass('primary')}`}>
                <Users className='h-6 w-6' aria-hidden='true' />
              </div>
              <div>
                <h1 className='m-0 text-2xl font-extrabold leading-tight tracking-tight text-fg md:text-3xl'>
                  {childName}&apos;s Clinical Team
                </h1>
                <p className='mt-2 text-sm leading-relaxed text-muted'>
                  Our clinical directors have reviewed your child&apos;s needs and finalized their dedicated team of specialists.
                </p>
              </div>
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mt-4'>
            {assignedSpecialists.length > 0 ? (
              assignedSpecialists.map(staff => (
                <TeamMemberCard key={staff.id} staff={staff} requestedLanguages={requestedLanguages} />
              ))
            ) : (
              <div className='col-span-1 md:col-span-2 rounded-2xl border border-line bg-card p-10 text-center text-sm text-muted shadow-sm'>
                <Clock className='mx-auto mb-3 h-6 w-6 text-faint' aria-hidden='true' />
                Your team is being finalized. We&apos;ll let you know as soon as {childName}&apos;s specialists are confirmed.
              </div>
            )}
          </div>

          {assignedTeacher && (
            <div className='flex flex-col gap-3'>
              <h2 className='m-0 text-sm font-extrabold uppercase tracking-wide text-faint'>Classroom Teacher</h2>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <TeamMemberCard staff={assignedTeacher} requestedLanguages={requestedLanguages} />
              </div>
            </div>
          )}

          {preferences.length > 0 && (
            <div className='flex items-start gap-3 rounded-2xl border border-line bg-app p-4 text-sm text-muted'>
              <Info className='mt-0.5 h-4 w-4 shrink-0 text-faint' aria-hidden='true' />
              <span>
                Thank you for sharing your preferences — our clinical directors considered them alongside{' '}
                {childName}&apos;s assessment when building this team.
              </span>
            </div>
          )}

          {/* This page replaced the staff profile pages for families, so the
              "how do I reach them" answer has to live here too. */}
          <div className={`flex items-start gap-3 rounded-2xl border p-4 ${semanticToneClass('primary')}`}>
            <ShieldCheck className='mt-0.5 h-5 w-5 shrink-0' aria-hidden='true' />
            <div>
              <p className='m-0 text-sm font-extrabold'>Getting in touch</p>
              <p className='m-0 mt-1 text-sm leading-relaxed'>
                All contact runs through the school so everything stays on record. For questions about{' '}
                {childName}&apos;s sessions, team or schedule — or to ask about a change — reach out to your
                admin team or raise it at the next scheduled session.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (selectionMode === 'undecided') {
    return (
      <div className='flex min-h-screen flex-col items-center justify-center bg-app p-6 pb-32 text-center'>
        <div className='mx-auto flex w-full max-w-2xl flex-col gap-8'>
          <div className='flex flex-col items-center gap-4'>
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl border shadow-sm ${semanticToneClass('primary')}`}>
              <Users className='h-8 w-8' aria-hidden='true' />
            </div>
            <h1 className='m-0 text-3xl font-extrabold leading-tight tracking-tight text-fg md:text-4xl'>
              Who should work with {childName}?
            </h1>
            <p className='text-base leading-relaxed text-muted max-w-lg'>
              Our clinical directors can automatically match {childName} with the best-fit specialists based on their assessment. Alternatively, you can browse our clinical team and choose specialists yourself.
            </p>
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4'>
            <button
              onClick={() => {
                setSelections({});
                handleSave();
              }}
              disabled={saving}
              className='group relative flex flex-col items-center gap-3 rounded-2xl border-2 border-indigo-100 bg-card p-6 text-center transition-colors hover:border-indigo-500 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-indigo-500/20 disabled:opacity-50'
            >
              <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-500 group-hover:text-white'>
                {saving ? <Loader2 className='h-6 w-6 animate-spin' /> : <Sparkles className='h-6 w-6' />}
              </div>
              <div>
                <h2 className='text-lg font-bold text-fg'>Match the best team</h2>
                <p className='mt-2 text-sm text-muted'>
                  We'll find the best specialists for {childName}'s specific needs.
                </p>
              </div>
            </button>

            <button
              onClick={() => setSelectionMode('manual')}
              disabled={saving}
              className='group relative flex flex-col items-center gap-3 rounded-2xl border-2 border-line bg-card p-6 text-center transition-colors hover:border-line hover:shadow-md focus:outline-none focus:ring-4 focus:ring-slate-400/20 disabled:opacity-50'
            >
              <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-app text-muted transition-colors group-hover:bg-subtle-soft group-hover:text-fg'>
                <Briefcase className='h-6 w-6' />
              </div>
              <div>
                <h2 className='text-lg font-bold text-fg'>I'd like to choose</h2>
                <p className='mt-2 text-sm text-muted'>
                  Browse available specialists and pick who you prefer.
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='bg-app pb-32'>
      <div className='mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-0 md:py-12'>
        <div className='flex items-start gap-4'>
          <button
            type='button'
            onClick={goBack}
            aria-label='Go back'
            className='mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-muted transition-colors hover:bg-app hover:text-fg'
          >
            <ChevronLeft className='h-4 w-4' />
          </button>
          <div className='flex items-start gap-4'>
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${semanticToneClass('primary')}`}>
              <Users className='h-6 w-6' aria-hidden='true' />
            </div>
            <div>
              <h1 className='m-0 text-2xl font-extrabold leading-tight tracking-tight text-fg md:text-3xl'>
                Who should work with {childName}?
              </h1>
              <p className='mt-2 text-sm leading-relaxed text-muted'>
                Our team will match {childName} with the best-fit specialist in each area.
                You can override any of these picks below if there&apos;s someone you strongly prefer.
              </p>
            </div>
          </div>
        </div>

        <div
          className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${semanticToneClass(hasOverrides ? 'primary' : 'success')}`}
        >
          <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-card'>
            <Sparkles className='h-5 w-5' aria-hidden='true' />
          </div>
          <div className='flex-1'>
            {hasOverrides ? (
              <>
                <p className='m-0 text-sm font-extrabold'>
                  You&apos;ve picked {overrideCount} specialist{overrideCount !== 1 ? 's' : ''}.
                </p>
                <p className='mt-1 text-sm'>
                  Our team will match {childName} with the best-fit specialist for the remaining {totalSpecialties - overrideCount} area{totalSpecialties - overrideCount !== 1 ? 's' : ''}.
                </p>
              </>
            ) : (
              <>
                <p className='m-0 text-sm font-extrabold'>
                  {childName} is ready. We&apos;ll match the best team.
                </p>
                <p className='mt-1 text-sm'>
                  {requestedLanguages.length > 0
                    ? <>Language needs like <span className='font-bold'>{requestedLanguages.join(', ')}</span> will be prioritized during matching.</>
                    : 'Specialty fit and team review will guide the final match.'}
                </p>
              </>
            )}
          </div>
        </div>

        {totalSpecialties === 0 ? (
          <div className='rounded-2xl border border-line bg-card p-10 text-center text-sm italic text-faint shadow-sm'>
            No specialists are available right now.
          </div>
        ) : (
          <div className='flex flex-col gap-4'>
            {specialtyEntries.map(([specialty, list]) => {
              const selectedSpecialistId = selections[specialty];
              const hasPick = Boolean(selectedSpecialistId);
              const isBrowsing = Boolean(expandedForBrowsing[specialty]);
              const practitionerTitle = getPractitionerTitle(specialty);
              const SpecialtyIcon = SPECIALTY_ICONS[specialty] || Briefcase;
              const languageMatchCount = list.filter(languageMatchesRequest).length;
              const pickedSpecialist = hasPick ? list.find(specialist => specialist.id === selectedSpecialistId) : null;

              return (
                <section
                  key={specialty}
                  className={`rounded-2xl border bg-card shadow-sm transition-colors ${
                    hasPick ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-line'
                  }`}
                  aria-labelledby={`specialty-heading-${specialty.replace(/\s+/g, '-')}`}
                >
                  <div className='flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 md:px-5'>
                    <div className='flex min-w-0 items-center gap-3'>
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                        hasPick ? semanticToneClass('primary') : semanticToneClass('neutral')
                      }`}>
                        <SpecialtyIcon className='h-4 w-4' />
                      </div>
                      <div className='min-w-0'>
                        <h2
                          id={`specialty-heading-${specialty.replace(/\s+/g, '-')}`}
                          className='m-0 text-sm font-extrabold text-fg sm:truncate md:text-base'
                        >
                          {practitionerTitle}
                        </h2>
                      </div>
                    </div>
                    <div className='shrink-0 pl-12 sm:pl-0'>
                      {hasPick ? (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-bold ${semanticToneClass('primary')}`}>
                          <CheckCircle2 className='h-3 w-3' aria-hidden='true' />
                          Your pick
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-bold ${semanticToneClass('success')}`}>
                          <Sparkles className='h-3 w-3' aria-hidden='true' />
                          Matching for you
                        </span>
                      )}
                    </div>
                  </div>

                  {!isBrowsing && (
                    <div className='px-5 py-5 md:px-6'>
                      {hasPick && pickedSpecialist ? (
                        <div className='flex flex-col gap-3'>
                          <div className='flex items-center gap-3'>
                            {pickedSpecialist.profile_image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={pickedSpecialist.profile_image}
                                alt=''
                                className='h-12 w-12 rounded-full object-cover'
                              />
                            ) : (
                              <div
                                className={`flex h-12 w-12 items-center justify-center rounded-full border text-sm font-extrabold shadow-sm ${semanticToneClass('primary')}`}
                                aria-hidden='true'
                              >
                                {specialistInitials(pickedSpecialist)}
                              </div>
                            )}
                            <div className='min-w-0 flex-1'>
                              <p className='m-0 text-xs font-bold uppercase tracking-wide text-faint'>Your pick</p>
                              <p className='m-0 truncate text-base font-extrabold text-fg'>
                                {specialistName(pickedSpecialist)}
                              </p>
                              <div className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted'>
                                <span className='inline-flex items-center gap-1 font-semibold text-muted'>
                                  <Info className='h-3 w-3' aria-hidden='true' />
                                  We&apos;ll coordinate timing after the team is finalized.
                                </span>
                                {languageMatchesRequest(pickedSpecialist) && (
                                  <span className='inline-flex items-center gap-1 font-semibold text-success'>
                                    <Check className='h-3 w-3' aria-hidden='true' />
                                    Language match
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className='flex flex-wrap gap-2'>
                            <button
                              type='button'
                              onClick={() => setExpandedForBrowsing(prev => ({ ...prev, [specialty]: true }))}
                              className='inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-bold text-fg transition-colors hover:bg-app'
                            >
                              Change pick
                              <ChevronDown className='h-3.5 w-3.5' aria-hidden='true' />
                            </button>
                            <button
                              type='button'
                              onClick={() => clearPickForSpecialty(specialty)}
                              className='inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:text-fg'
                            >
                              <RotateCcw className='h-3.5 w-3.5' aria-hidden='true' />
                              Let us match instead
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className='flex flex-col gap-3'>
                          <div className='flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between'>
                            <div className='flex min-w-0 items-center gap-4'>
                              <div className='flex shrink-0 -space-x-2' aria-hidden='true'>
                                {list.slice(0, 4).map(specialist => (
                                  <div
                                    key={specialist.id}
                                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-[0.65rem] font-extrabold ring-2 ring-white ${semanticToneClass('primary')}`}
                                    title={specialistName(specialist)}
                                  >
                                    {specialistInitials(specialist)}
                                  </div>
                                ))}
                                {list.length > 4 && (
                                  <div className='flex h-8 w-8 items-center justify-center rounded-full bg-subtle-soft text-[0.65rem] font-extrabold text-muted ring-2 ring-white'>
                                    +{list.length - 4}
                                  </div>
                                )}
                              </div>
                              <span className='inline-flex min-w-0 items-center gap-1.5 text-sm text-fg'>
                                <Languages className={`h-4 w-4 shrink-0 ${requestedLanguages.length > 0 && languageMatchCount > 0 ? 'text-success' : 'text-faint'}`} aria-hidden='true' />
                                <span className='font-bold'>
                                  {requestedLanguages.length > 0
                                    ? languageMatchCount > 0
                                      ? `${languageMatchCount} match${languageMatchCount === 1 ? 'es' : ''} ${requestedLanguages[0]}`
                                      : 'No language match yet'
                                    : `${list.length} specialist${list.length !== 1 ? 's' : ''} available`}
                                </span>
                              </span>
                            </div>
                            <button
                              type='button'
                              onClick={() => setExpandedForBrowsing(prev => ({ ...prev, [specialty]: true }))}
                              className='inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-50'
                            >
                              Browse specialists
                              <ChevronDown className='h-4 w-4' aria-hidden='true' />
                            </button>
                          </div>

                          {requestedLanguages.length > 0 && languageMatchCount === 0 && (
                            <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${semanticToneClass('warning')}`}>
                              <AlertTriangle className='h-4 w-4 shrink-0' aria-hidden='true' />
                              No specialists currently list {requestedLanguages.join(', ')}. Our team will find the best alternative.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {isBrowsing && (
                    <div className='px-5 py-5 md:px-6'>
                      <div className='mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                        {list.length > defaultVisibleCount ? (
                          <div className='relative flex-1 sm:max-w-xs'>
                            <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint' />
                            <input
                              type='text'
                              value={searchTerms[specialty] || ''}
                              onChange={event => setSearchTerms(prev => ({ ...prev, [specialty]: event.target.value }))}
                              placeholder='Search specialists'
                              className='h-10 w-full rounded-xl border border-line bg-app/60 pl-9 pr-3 text-sm text-fg outline-none transition-colors hover:bg-card focus:border-indigo-400 focus:bg-card focus:ring-4 focus:ring-indigo-500/15'
                            />
                          </div>
                        ) : <div />}
                        <button
                          type='button'
                          onClick={() => setExpandedForBrowsing(prev => ({ ...prev, [specialty]: false }))}
                          className='inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-muted transition-colors hover:text-fg'
                        >
                          <ChevronUp className='h-4 w-4' aria-hidden='true' />
                          Hide list
                        </button>
                      </div>

                      <button
                        type='button'
                        onClick={() => clearPickForSpecialty(specialty)}
                        aria-pressed={!hasPick}
                        className={`mb-3 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus:ring-4 focus:ring-success/20 ${
                          !hasPick
                            ? 'border-success-line bg-success-soft/70'
                            : 'border-line bg-card hover:border-success-line hover:bg-success-soft/30'
                        }`}
                      >
                        <div className='flex items-center gap-3'>
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                            !hasPick ? semanticToneClass('success') : semanticToneClass('neutral')
                          }`}>
                            <Sparkles className='h-4 w-4' aria-hidden='true' />
                          </div>
                          <div>
                            <p className={`m-0 text-sm font-extrabold ${!hasPick ? 'text-success' : 'text-fg'}`}>
                              Let our team match
                            </p>
                            <p className={`m-0 text-xs ${!hasPick ? 'text-success' : 'text-muted'}`}>
                              Best-fit specialist based on language needs and clinical fit
                            </p>
                          </div>
                        </div>
                        {!hasPick && <CheckCircle2 className='h-5 w-5 shrink-0 text-success' aria-hidden='true' />}
                      </button>

                      <SpecialistList
                        specialty={specialty}
                        list={list}
                        selectedSpecialistId={selectedSpecialistId}
                        requestedLanguages={requestedLanguages}
                        languageMatchesRequest={languageMatchesRequest}
                        onPick={pickSpecialist}
                        searchTerm={searchTerms[specialty] || ''}
                      />
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <div className='flex items-start gap-2 rounded-xl bg-app p-3 text-xs text-muted'>
          <Info className='mt-0.5 h-3.5 w-3.5 shrink-0 text-faint' aria-hidden='true' />
          <span>
            You can change any of these picks later from the dashboard. Timing will be coordinated separately after assignment.
          </span>
        </div>
      </div>

      {totalSpecialties > 0 && (
        <div className='fixed bottom-[var(--mobile-nav-h)] left-0 right-0 z-[1001] border-t border-line bg-card px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] md:bottom-0 md:pl-[180px]'>
          <div className='mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='min-w-0 flex-1'>
              <p className='m-0 text-xs font-semibold text-muted'>
                {hasOverrides
                  ? `You've picked ${overrideCount} · Our team will match the remaining ${totalSpecialties - overrideCount}`
                  : `Our team will match all ${totalSpecialties} specialists for ${childName}`}
              </p>
            </div>
            <div className='flex gap-2'>
              <button
                disabled={saving}
                onClick={() => router.push('/dashboard')}
                className='rounded-xl px-4 py-2.5 text-sm font-bold text-muted transition-colors hover:text-fg disabled:opacity-50'
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={handleSave}
                className='inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60'
              >
                {saving ? (
                  <>
                    <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
                    Saving...
                  </>
                ) : hasOverrides ? (
                  'Save my preferences'
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

// Self-contained on purpose: parents no longer get a staff profile page, so
// everything they need about a team member lives on this card.
function TeamMemberCard({ staff, requestedLanguages }: { staff: AssignedStaff; requestedLanguages: string[] }) {
  const name = `${staff.first_name || ''} ${staff.last_name || ''}`.trim() || `Team member #${staff.id}`;
  const initials = `${staff.first_name?.[0] || ''}${staff.last_name?.[0] || ''}`.toUpperCase() || 'SP';
  const isTeacher = staff.role === 'TEACHER';
  const specialties = staff.specialties && staff.specialties.length > 0
    ? staff.specialties
    : staff.specialty
      ? [staff.specialty]
      : [];
  const languages = normalizeLanguages(staff.languages || []);
  const requested = new Set(requestedLanguages.map(language => language.toLowerCase()));

  return (
    <div className='flex flex-col gap-4 rounded-2xl border border-line bg-card p-5 shadow-sm'>
      <div className='flex items-center gap-4'>
        {staff.profile_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={staff.profile_image} alt='' className='h-14 w-14 rounded-full object-cover shadow-sm' />
        ) : (
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border text-base font-extrabold shadow-sm ${semanticToneClass('primary')}`}>
            {initials}
          </div>
        )}
        <div className='min-w-0 flex-1'>
          <p className='m-0 truncate text-base font-extrabold text-fg'>{name}</p>
          <p className='m-0 mt-0.5 truncate text-xs font-semibold text-indigo-600'>
            {isTeacher ? 'Classroom Teacher' : getPractitionerTitle(staff.specialty || '') || 'Specialist'}
          </p>
        </div>
        <CheckCircle2 className='h-5 w-5 shrink-0 text-success' aria-hidden='true' />
      </div>

      {!isTeacher && specialties.length > 0 && (
        <div className='flex flex-col gap-2'>
          <p className='m-0 text-[0.65rem] font-bold uppercase tracking-widest text-faint'>
            Works with {name.split(' ')[0]} on
          </p>
          <ul className='m-0 flex list-none flex-col gap-2 p-0'>
            {specialties.map(specialty => {
              const SpecialtyIcon = SPECIALTY_ICONS[specialty] || Briefcase;
              const description = getSpecialtyDescription(specialty);
              return (
                <li key={specialty} className='flex items-start gap-2.5'>
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${semanticToneClass('primary')}`}>
                    <SpecialtyIcon className='h-3 w-3' />
                  </span>
                  <div className='min-w-0'>
                    <p className='m-0 text-xs font-extrabold text-fg'>{getPractitionerTitle(specialty)}</p>
                    {description && <p className='m-0 text-xs leading-snug text-muted'>{description}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {languages.length > 0 && (
        <div className='flex flex-wrap items-center gap-2 border-t border-line pt-3'>
          <span className='inline-flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-faint'>
            <Languages className='h-3.5 w-3.5' aria-hidden='true' />
            Speaks
          </span>
          {languages.map(language => {
            const match = requested.has(language.toLowerCase());
            return (
              <span
                key={language}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.7rem] font-bold ${
                  match ? 'border border-success-line bg-success-soft text-success' : 'bg-subtle-soft text-muted'
                }`}
              >
                {match && <Check className='h-3 w-3' strokeWidth={3} aria-hidden='true' />}
                {language}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SpecialistList({
  specialty,
  list,
  selectedSpecialistId,
  requestedLanguages,
  languageMatchesRequest,
  onPick,
  searchTerm,
}: {
  specialty: string;
  list: Specialist[];
  selectedSpecialistId?: number;
  requestedLanguages: string[];
  languageMatchesRequest: (specialist: Specialist) => boolean;
  onPick: (specialty: string, specialistId: number) => void;
  searchTerm: string;
}) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const sorted = [...list].sort((a, b) => {
    const aLanguageMatch = languageMatchesRequest(a);
    const bLanguageMatch = languageMatchesRequest(b);

    if (a.id === selectedSpecialistId) return -1;
    if (b.id === selectedSpecialistId) return 1;
    if (aLanguageMatch !== bLanguageMatch) return aLanguageMatch ? -1 : 1;
    return specialistName(a).localeCompare(specialistName(b));
  });

  const filtered = sorted.filter(specialist => {
    if (!normalizedSearch) return true;
    const specialties = specialist.specialties && specialist.specialties.length > 0 ? specialist.specialties : [specialist.specialty];
    const languages = normalizeLanguages(specialist.languages || []);
    const haystack = `${specialistName(specialist)} ${specialties.join(' ')} ${languages.join(' ')}`.toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  if (filtered.length === 0) {
    return (
      <p className='m-0 rounded-xl border border-line bg-app px-4 py-3 text-sm text-muted'>
        No specialists match your search.
      </p>
    );
  }

  return (
    <div className='flex flex-col gap-2'>
      {filtered.map(specialist => (
        <SpecialistCard
          key={specialist.id}
          specialty={specialty}
          specialist={specialist}
          isSelected={selectedSpecialistId === specialist.id}
          requestedLanguages={requestedLanguages}
          languageMatch={languageMatchesRequest(specialist)}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

function SpecialistCard({
  specialty,
  specialist,
  isSelected,
  requestedLanguages,
  languageMatch,
  onPick,
}: {
  specialty: string;
  specialist: Specialist;
  isSelected: boolean;
  requestedLanguages: string[];
  languageMatch: boolean;
  onPick: (specialty: string, specialistId: number) => void;
}) {
  const languages = normalizeLanguages(specialist.languages || []);
  const specialties = specialist.specialties && specialist.specialties.length > 0
    ? specialist.specialties
    : [specialist.specialty];

  return (
    <div
      className={`relative rounded-xl border bg-card transition-colors ${
        isSelected
          ? 'border-indigo-400 shadow-sm ring-2 ring-indigo-100'
          : 'border-line hover:border-indigo-200 hover:shadow-sm'
      }`}
    >
      <div
        role='button'
        tabIndex={0}
        onClick={() => onPick(specialty, specialist.id)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onPick(specialty, specialist.id);
          }
        }}
        aria-pressed={isSelected}
        className='flex w-full cursor-pointer items-start gap-3 rounded-xl p-3 pr-14 text-left transition-colors focus:outline-none focus:ring-4 focus:ring-indigo-500/20'
      >
        <div className='relative shrink-0'>
          {specialist.profile_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={specialist.profile_image}
              alt=''
              className='h-14 w-14 rounded-full object-cover'
            />
          ) : (
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full border text-sm font-extrabold shadow-sm ${semanticToneClass('primary')}`}
              aria-hidden='true'
            >
              {specialistInitials(specialist)}
            </div>
          )}
          {languageMatch && (
            <div
              className='absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-success-solid ring-2 ring-white'
              title='Speaks your language'
              aria-label='Language match'
            >
              <Check className='h-3 w-3 text-white' aria-hidden='true' />
            </div>
          )}
        </div>

        <div className='min-w-0 flex-1'>
          <p className='m-0 truncate text-sm font-extrabold text-fg'>
            {specialistName(specialist)}
          </p>
          <div className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted'>
            <span className='inline-flex items-center gap-1 font-semibold text-muted'>
              <Info className='h-3 w-3' aria-hidden='true' />
              Timing coordinated after assignment
            </span>
            {languageMatch ? (
              <>
                <span className='text-faint' aria-hidden='true'>·</span>
                <span className='font-semibold text-success'>Language match</span>
              </>
            ) : requestedLanguages.length > 0 ? (
              <>
                <span className='text-faint' aria-hidden='true'>·</span>
                <span className='font-semibold text-faint'>No listed language match</span>
              </>
            ) : null}
          </div>

          {languages.length > 0 ? (
            <div className='mt-1.5 flex flex-wrap gap-1'>
              {languages.slice(0, 4).map(language => {
                const match = requestedLanguages.some(requested => requested.toLowerCase() === language.toLowerCase());
                return (
                  <span
                    key={language}
                    title={language}
                    className={`inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded px-1 text-[0.6rem] font-extrabold ${
                      match
                        ? 'border border-success-line bg-success-soft text-success'
                        : 'bg-subtle-soft text-muted'
                    }`}
                  >
                    {languageCode(language)}
                  </span>
                );
              })}
              {languages.length > 4 && (
                <span className='inline-flex h-5 items-center justify-center rounded bg-subtle-soft px-1 text-[0.6rem] font-extrabold text-muted'>
                  +{languages.length - 4}
                </span>
              )}
            </div>
          ) : requestedLanguages.length > 0 ? (
            <div className='mt-1.5'>
              <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[0.6rem] font-bold ${semanticToneClass('warning')}`}>
                <AlertTriangle className='h-2.5 w-2.5' aria-hidden='true' />
                Language not listed
              </span>
            </div>
          ) : null}

          {specialties.length > 0 && (
            <div className='mt-2 flex flex-wrap gap-1'>
              {specialties.slice(0, 3).map(item => (
                <span
                  key={item}
                  className='inline-flex items-center rounded-md bg-subtle-soft px-2 py-0.5 text-[0.65rem] font-bold text-muted'
                >
                  {getPractitionerTitle(item)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className='absolute right-1 top-1 flex items-center gap-0.5'>
        {isSelected && <CheckCircle2 className='h-5 w-5 text-indigo-600' aria-hidden='true' />}
      </div>
    </div>
  );
}

export default function SpecialistsPage() {
  return (
    <ProtectedRoute allowedRoles={['ADMIN', 'PARENT']}>
      <Suspense fallback={<div className='p-8 text-center text-muted'>Loading...</div>}>
        <SpecialistsContent />
      </Suspense>
    </ProtectedRoute>
  );
}
