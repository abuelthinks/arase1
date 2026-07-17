'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { LANGUAGE_OPTIONS, normalizeLanguages } from '@/lib/languages';
import { SPECIALIST_SPECIALTIES } from '@/lib/specialties';
import { semanticToneClass } from '@/lib/role-colors';
import { toast } from 'sonner';
import { extractApiError } from '@/lib/toast-utils';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Check,
  Loader2,
  PencilLine,
  Plus,
  Sparkles,
  User,
  X,
} from 'lucide-react';

const inputCls =
  'w-full rounded-xl border border-line bg-app/60 px-4 py-3 text-sm font-medium text-fg placeholder:font-normal placeholder:text-faint transition-colors hover:bg-card focus:border-indigo-400 focus:bg-card focus:outline-none focus:ring-4 focus:ring-indigo-500/15';

function LanguagePill({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${
        checked
          ? 'border-indigo-400 bg-indigo-50 text-indigo-800 shadow-[0_2px_10px_rgba(99,102,241,0.12)]'
          : 'border-line bg-card text-muted hover:border-line hover:bg-app'
      }`}
    >
      {checked && <Check className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />}
      <span className={checked ? 'font-bold' : 'font-medium'}>{label}</span>
    </button>
  );
}

export default function SpecialistOnboardingPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [languageOther, setLanguageOther] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [specialtyConfirmed, setSpecialtyConfirmed] = useState(false);
  const [requestingChange, setRequestingChange] = useState(false);
  const [requestedSpecialty, setRequestedSpecialty] = useState('');
  const [specialtyRequestNote, setSpecialtyRequestNote] = useState('');
  const [specialtyRequestLoading, setSpecialtyRequestLoading] = useState(false);
  const [specialtyRequestSent, setSpecialtyRequestSent] = useState(false);

  const specialties = useMemo(() => {
    if (Array.isArray(user?.specialties) && user.specialties.length > 0) {
      return user.specialties;
    }
    return user?.specialty ? [user.specialty] : [];
  }, [user?.specialties, user?.specialty]);

  const hasSpecialty = specialties.length > 0;
  const knownLanguageSet = new Set(LANGUAGE_OPTIONS.map((language) => language.toLowerCase()));
  const customLanguages = languages.filter((language) => !knownLanguageSet.has(language.toLowerCase()));

  useEffect(() => {
    setFirstName(user?.first_name || '');
    setLastName(user?.last_name || '');
    setLanguages(normalizeLanguages(Array.isArray(user?.languages) ? user.languages : []));
  }, [user?.first_name, user?.last_name, user?.languages]);

  useEffect(() => {
    if (user?.role && user.role !== 'SPECIALIST') {
      router.replace('/dashboard');
      return;
    }
    if (user?.role === 'SPECIALIST' && user.specialist_onboarding_complete) {
      router.replace('/workspace');
    }
  }, [router, user?.role, user?.specialist_onboarding_complete]);

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const nextLanguages = normalizeLanguages([...languages, languageOther]);
      await api.patch(`/api/users/${user?.user_id}/`, {
        first_name: firstName,
        last_name: lastName,
        languages: nextLanguages,
      });
      await refreshUser();
      router.replace('/workspace');
    } catch (err: any) {
      setError(
        err.response?.data?.first_name?.[0]
          || err.response?.data?.last_name?.[0]
          || err.response?.data?.languages?.[0]
          || err.response?.data?.detail
          || 'Could not save profile setup.',
      );
    } finally {
      setLoading(false);
    }
  };

  const addCustomLanguage = () => {
    const trimmed = languageOther.trim();
    if (!trimmed) return;
    setLanguages((prev) => normalizeLanguages([...prev, trimmed]));
    setLanguageOther('');
  };

  return (
    <ProtectedRoute allowedRoles={['SPECIALIST']}>
      <div className="bg-app py-8 md:py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 md:px-0">
          {/* Progress indicator */}
          <ol className="flex items-center gap-3 text-sm">
            <li className="flex items-center gap-2 font-bold text-indigo-700">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs text-white shadow-sm">
                1
              </span>
              Profile
            </li>
            <li className="h-px flex-1 bg-subtle-soft" aria-hidden="true" />
            <li className="flex items-center gap-2 font-medium text-faint">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-xs">
                2
              </span>
              Schedule
            </li>
          </ol>

          <section className="rounded-2xl border border-line bg-card p-6 shadow-sm md:p-8">
            {/* Header */}
            <div className="mb-7 flex items-start gap-4 border-b border-line pb-5">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${semanticToneClass('primary')}`}>
                <Sparkles className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h1 className="m-0 text-2xl font-extrabold leading-tight text-fg">
                  Complete your specialist profile
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Add your name and working languages so families can be matched correctly. Your specialty is managed by admin.
                </p>
              </div>
            </div>

            {/* Name fields */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-fg" htmlFor="first-name">
                  First name
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
                  <input
                    id="first-name"
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className={`${inputCls} pl-9`}
                    placeholder="Jane"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-fg" htmlFor="last-name">
                  Last name
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
                  <input
                    id="last-name"
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className={`${inputCls} pl-9`}
                    placeholder="Doe"
                  />
                </div>
              </div>
            </div>

            {/* Specialty */}
            <div className="mt-6 rounded-2xl border border-line bg-app/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />
                  <p className="m-0 text-sm font-extrabold text-fg">Your specialty</p>
                </div>
                <span className="rounded-full border border-line bg-card px-2.5 py-1 text-xs font-semibold text-muted">
                  Assigned by admin
                </span>
              </div>

              {hasSpecialty ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {specialties.map((specialty) => (
                    <span
                      key={specialty}
                      className={`rounded-full border px-3 py-1 text-sm font-semibold ${semanticToneClass('primary')}`}
                    >
                      {specialty}
                    </span>
                  ))}
                </div>
              ) : (
                <div className={`mt-3 flex items-start gap-3 rounded-xl border p-4 ${semanticToneClass('warning')}`}>
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="m-0 text-sm font-bold">Not assigned yet</p>
                    <p className="mt-1 text-sm">
                      Admin needs to assign your specialty before you can finish setup. You'll get a notification once it's ready.
                    </p>
                  </div>
                </div>
              )}

              {hasSpecialty && (
                <div className="mt-4 rounded-xl border border-line bg-card p-4">
                  <p className="m-0 text-sm font-bold text-fg">Did we get your specialty right?</p>
                  <p className="mt-1 text-sm text-muted">
                    If this is not your actual specialty, send a change request to admin.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSpecialtyConfirmed(true);
                        setRequestingChange(false);
                        setRequestedSpecialty('');
                        setSpecialtyRequestNote('');
                      }}
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                        specialtyConfirmed && !requestingChange
                          ? 'bg-success-solid text-white shadow-sm hover:bg-success-solid'
                          : 'border border-line text-fg hover:bg-app'
                      }`}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Yes, it's correct
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRequestingChange((current) => !current);
                        setSpecialtyConfirmed(false);
                      }}
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                        requestingChange
                          ? 'bg-warning-solid text-white shadow-sm hover:bg-warning-solid'
                          : 'border border-line text-fg hover:bg-app'
                      }`}
                    >
                      <PencilLine className="h-4 w-4" aria-hidden="true" />
                      Request change
                    </button>
                  </div>

                  {specialtyConfirmed && !requestingChange && !specialtyRequestSent && (
                    <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-success">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Great — your specialty is confirmed.
                    </p>
                  )}

                  {requestingChange && (
                    <div className="mt-4 flex flex-col gap-3">
                      <div className="space-y-2">
                        <label className="block text-sm font-bold text-fg" htmlFor="requested-specialty">
                          Requested specialty
                        </label>
                        <select
                          id="requested-specialty"
                          value={requestedSpecialty}
                          onChange={(event) => setRequestedSpecialty(event.target.value)}
                          className="w-full rounded-xl border border-line bg-app/60 px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-card focus:border-warning-line focus:bg-card focus:outline-none focus:ring-4 focus:ring-warning/15"
                        >
                          <option value="">Select specialty</option>
                          {SPECIALIST_SPECIALTIES.filter((option) => !specialties.includes(option)).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-bold text-fg" htmlFor="specialty-note">
                          Note for admin
                        </label>
                        <textarea
                          id="specialty-note"
                          value={specialtyRequestNote}
                          onChange={(event) => setSpecialtyRequestNote(event.target.value)}
                          rows={3}
                          placeholder="Briefly explain what should be changed."
                          className="w-full rounded-xl border border-line bg-app/60 px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-card focus:border-warning-line focus:bg-card focus:outline-none focus:ring-4 focus:ring-warning/15"
                        />
                      </div>
                      <div>
                        <button
                          type="button"
                          disabled={specialtyRequestLoading || !requestedSpecialty}
                          onClick={async () => {
                            setSpecialtyRequestLoading(true);
                            try {
                              await api.post('/api/users/request-specialty-change/', {
                                specialty: requestedSpecialty,
                                note: specialtyRequestNote,
                              });
                              setSpecialtyRequestSent(true);
                              setRequestingChange(false);
                              setRequestedSpecialty('');
                              setSpecialtyRequestNote('');
                              toast.success('Request sent.');
                            } catch (err: any) {
                              toast.error(extractApiError(err, 'Request failed.'));
                            } finally {
                              setSpecialtyRequestLoading(false);
                            }
                          }}
                          className="inline-flex items-center gap-2 rounded-lg bg-warning-solid px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-warning-solid disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {specialtyRequestLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              Sending...
                            </>
                          ) : (
                            'Send request'
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {specialtyRequestSent && (
                    <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-success">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Your specialty change request was sent to admin.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Languages */}
            <div className="mt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="m-0 text-sm font-bold text-fg">Session languages</p>
                {languages.length > 0 && (
                  <span className="text-xs font-semibold text-indigo-600">
                    {languages.length} selected
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">
                Select the languages you can comfortably use with parents and children.
              </p>

              <div className="mt-3 flex flex-wrap gap-2.5">
                {LANGUAGE_OPTIONS.map((option) => {
                  const checked = languages.some((language) => language.toLowerCase() === option.toLowerCase());
                  return (
                    <LanguagePill
                      key={option}
                      label={option}
                      checked={checked}
                      onToggle={() => {
                        setLanguages((prev) => normalizeLanguages(
                          checked
                            ? prev.filter((language) => language.toLowerCase() !== option.toLowerCase())
                            : [...prev, option],
                        ));
                      }}
                    />
                  );
                })}
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={languageOther}
                  onChange={(event) => setLanguageOther(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addCustomLanguage();
                    }
                  }}
                  placeholder="Other language"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={addCustomLanguage}
                  disabled={!languageOther.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg transition-colors hover:bg-app disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add
                </button>
              </div>

              {customLanguages.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customLanguages.map((language) => (
                    <span
                      key={language}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-app py-1 pl-3 pr-1 text-xs font-semibold text-fg"
                    >
                      {language}
                      <button
                        type="button"
                        onClick={() => setLanguages((prev) => prev.filter((item) => item !== language))}
                        aria-label={`Remove ${language}`}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-faint transition-colors hover:bg-subtle-soft hover:text-fg"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className={`mt-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${semanticToneClass('danger')}`}>
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {/* Footer actions */}
            <div className="mt-8 flex flex-col gap-2 border-t border-line pt-6">
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={loading || !hasSpecialty || languages.length === 0}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Save & set my schedule
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </button>
                {!hasSpecialty && (
                  <p className="m-0 text-xs text-muted">
                    Waiting for admin to assign your specialty.
                  </p>
                )}
                {hasSpecialty && languages.length === 0 && (
                  <p className="m-0 text-xs text-muted">
                    Select at least one working language to continue.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </ProtectedRoute>
  );
}
