'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { LANGUAGE_OPTIONS, normalizeLanguages } from '@/lib/languages';
import { SPECIALIST_SPECIALTIES } from '@/lib/specialties';
import { toast } from 'sonner';
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
  'w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm font-medium text-slate-800 placeholder:font-normal placeholder:text-slate-400 transition-all hover:bg-white focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/15';

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
      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${
        checked
          ? 'border-indigo-400 bg-indigo-50 text-indigo-800 shadow-[0_2px_10px_rgba(99,102,241,0.12)]'
          : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm'
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
      <div className="bg-gradient-to-b from-indigo-50/60 via-white to-white py-8 md:py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 md:px-0">
          {/* Progress indicator */}
          <ol className="flex items-center gap-3 text-sm">
            <li className="flex items-center gap-2 font-bold text-indigo-700">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs text-white shadow-sm">
                1
              </span>
              Profile
            </li>
            <li className="h-px flex-1 bg-gradient-to-r from-indigo-300 to-slate-200" aria-hidden="true" />
            <li className="flex items-center gap-2 font-medium text-slate-400">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-xs">
                2
              </span>
              Schedule
            </li>
          </ol>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            {/* Header */}
            <div className="mb-8 flex items-start gap-4 border-b border-indigo-100/60 pb-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-200">
                <Sparkles className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h1 className="m-0 bg-gradient-to-r from-blue-700 to-indigo-500 bg-clip-text text-2xl font-extrabold leading-tight text-transparent">
                  Complete your specialist profile
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Add your name and working languages so families can be matched correctly. Your specialty is managed by admin.
                </p>
              </div>
            </div>

            {/* Name fields */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700" htmlFor="first-name">
                  First name
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
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
                <label className="block text-sm font-bold text-slate-700" htmlFor="last-name">
                  Last name
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
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
            <div className="mt-6 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />
                  <p className="m-0 text-sm font-extrabold text-slate-900">Your specialty</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
                  Assigned by admin
                </span>
              </div>

              {hasSpecialty ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {specialties.map((specialty) => (
                    <span
                      key={specialty}
                      className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-800"
                    >
                      {specialty}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                  <div>
                    <p className="m-0 text-sm font-bold text-amber-900">Not assigned yet</p>
                    <p className="mt-1 text-sm text-amber-800">
                      Admin needs to assign your specialty before you can finish setup. You'll get a notification once it's ready.
                    </p>
                  </div>
                </div>
              )}

              {hasSpecialty && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                  <p className="m-0 text-sm font-bold text-slate-900">Did we get your specialty right?</p>
                  <p className="mt-1 text-sm text-slate-500">
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
                          ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                          : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
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
                          ? 'bg-amber-600 text-white shadow-sm hover:bg-amber-700'
                          : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <PencilLine className="h-4 w-4" aria-hidden="true" />
                      Request change
                    </button>
                  </div>

                  {specialtyConfirmed && !requestingChange && !specialtyRequestSent && (
                    <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Great — your specialty is confirmed.
                    </p>
                  )}

                  {requestingChange && (
                    <div className="mt-4 flex flex-col gap-3">
                      <div className="space-y-2">
                        <label className="block text-sm font-bold text-slate-700" htmlFor="requested-specialty">
                          Requested specialty
                        </label>
                        <select
                          id="requested-specialty"
                          value={requestedSpecialty}
                          onChange={(event) => setRequestedSpecialty(event.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm font-medium text-slate-800 transition-all hover:bg-white focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/15"
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
                        <label className="block text-sm font-bold text-slate-700" htmlFor="specialty-note">
                          Note for admin
                        </label>
                        <textarea
                          id="specialty-note"
                          value={specialtyRequestNote}
                          onChange={(event) => setSpecialtyRequestNote(event.target.value)}
                          rows={3}
                          placeholder="Briefly explain what should be changed."
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm font-medium text-slate-800 transition-all hover:bg-white focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/15"
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
                              toast.success('Specialty change request sent.');
                            } catch (err: any) {
                              toast.error(err.response?.data?.error || 'Could not send specialty request.');
                            } finally {
                              setSpecialtyRequestLoading(false);
                            }
                          }}
                          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
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
                    <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
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
                <p className="m-0 text-sm font-bold text-slate-700">Session languages</p>
                {languages.length > 0 && (
                  <span className="text-xs font-semibold text-indigo-600">
                    {languages.length} selected
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">
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
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1 text-xs font-semibold text-slate-700"
                    >
                      {language}
                      <button
                        type="button"
                        onClick={() => setLanguages((prev) => prev.filter((item) => item !== language))}
                        aria-label={`Remove ${language}`}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
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
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {/* Footer actions */}
            <div className="mt-8 flex flex-col gap-2 border-t border-slate-100 pt-6">
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
                  <p className="m-0 text-xs text-slate-500">
                    Waiting for admin to assign your specialty.
                  </p>
                )}
                {hasSpecialty && languages.length === 0 && (
                  <p className="m-0 text-xs text-slate-500">
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
