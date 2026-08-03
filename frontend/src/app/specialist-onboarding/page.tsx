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
  Clock,
  Loader2,
  Minus,
  PencilLine,
  Plus,
  Sparkles,
  User,
  X,
} from 'lucide-react';

const inputCls =
  'w-full rounded-xl border border-line bg-app/60 px-4 py-3 text-sm font-medium text-fg placeholder:font-normal placeholder:text-faint transition-colors hover:bg-card focus:border-indigo-400 focus:bg-card focus:outline-none focus:ring-4 focus:ring-indigo-500/15';

function TogglePill({
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
  const [requestedSpecialties, setRequestedSpecialties] = useState<string[]>([]);
  const [specialtyRequestNote, setSpecialtyRequestNote] = useState('');
  const [specialtyRequestLoading, setSpecialtyRequestLoading] = useState(false);
  const [cancellingRequest, setCancellingRequest] = useState(false);
  // Name comes from sign-up, so it shows as a review row until they ask to edit it.
  const [editingName, setEditingName] = useState(false);

  const specialties = useMemo(() => {
    if (Array.isArray(user?.specialties) && user.specialties.length > 0) {
      return user.specialties;
    }
    return user?.specialty ? [user.specialty] : [];
  }, [user?.specialties, user?.specialty]);

  const hasSpecialty = specialties.length > 0;
  const pendingRequest = user?.pending_specialty_request ?? null;

  // The request carries the full desired set — added/removed are just the diff.
  const addedSpecialties = requestedSpecialties.filter((s) => !specialties.includes(s));
  const removedSpecialties = specialties.filter((s) => !requestedSpecialties.includes(s));
  const hasSpecialtyDelta = addedSpecialties.length > 0 || removedSpecialties.length > 0;
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
          <section className="rounded-2xl border border-line bg-card p-6 shadow-sm md:p-8">
            {/* Header */}
            <div className="mb-7 flex items-start gap-4 border-b border-line pb-5">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${semanticToneClass('primary')}`}>
                <Sparkles className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h1 className="m-0 text-2xl font-extrabold leading-tight text-fg">
                  {firstName ? `Hi ${firstName} — one quick check` : 'One quick check'}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  You&apos;re almost in. We just want to make sure we got your details right before you
                  head to your dashboard. Takes about 20 seconds, and you won&apos;t see this again.
                </p>
              </div>
            </div>

            {/* Name — already collected at sign-up, so this is a review row, not a form. */}
            <div className="rounded-2xl border border-line bg-app/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <User className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted">Your name</p>
                    {editingName ? null : (
                      <p className="mt-0.5 truncate text-base font-extrabold text-fg">
                        {`${firstName} ${lastName}`.trim() || 'Not set'}
                      </p>
                    )}
                  </div>
                </div>
                {!editingName && (
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-bold text-fg transition-colors hover:bg-app"
                  >
                    <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                    Change
                  </button>
                )}
              </div>

              {editingName && (
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-fg" htmlFor="first-name">
                      First name
                    </label>
                    <input
                      id="first-name"
                      type="text"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      className={inputCls}
                      placeholder="Jane"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-fg" htmlFor="last-name">
                      Last name
                    </label>
                    <input
                      id="last-name"
                      type="text"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      className={inputCls}
                      placeholder="Doe"
                    />
                  </div>
                </div>
              )}
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

              {hasSpecialty && pendingRequest && (
                <div className={`mt-4 rounded-xl border p-4 ${semanticToneClass('warning')}`}>
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-sm font-bold">Waiting for admin approval</p>
                      <p className="mt-1 text-sm">
                        Your specialties stay as they are until an admin approves these edits.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pendingRequest.added.map((specialty) => (
                          <span
                            key={`add-${specialty}`}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${semanticToneClass('success')}`}
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            {specialty}
                          </span>
                        ))}
                        {pendingRequest.removed.map((specialty) => (
                          <span
                            key={`remove-${specialty}`}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${semanticToneClass('danger')}`}
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                            {specialty}
                          </span>
                        ))}
                      </div>
                      {pendingRequest.note && (
                        <p className="mt-3 text-sm italic">"{pendingRequest.note}"</p>
                      )}
                      <button
                        type="button"
                        disabled={cancellingRequest}
                        onClick={async () => {
                          setCancellingRequest(true);
                          try {
                            await api.delete('/api/users/request-specialty-change/');
                            await refreshUser();
                            toast.success('Request withdrawn.');
                          } catch (err: any) {
                            toast.error(extractApiError(err, 'Could not withdraw the request.'));
                          } finally {
                            setCancellingRequest(false);
                          }
                        }}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-current px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {cancellingRequest ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            Withdrawing...
                          </>
                        ) : (
                          <>
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                            Withdraw request
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {hasSpecialty && !pendingRequest && (
                <div className="mt-4 rounded-xl border border-line bg-card p-4">
                  <p className="m-0 text-sm font-bold text-fg">Did we get your specialties right?</p>
                  <p className="mt-1 text-sm text-muted">
                    If something is missing or shouldn't be there, ask admin to add or remove it.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSpecialtyConfirmed(true);
                        setRequestingChange(false);
                        setRequestedSpecialties([]);
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
                        setRequestingChange((current) => {
                          const next = !current;
                          if (next) setRequestedSpecialties(specialties);
                          return next;
                        });
                        setSpecialtyConfirmed(false);
                      }}
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                        requestingChange
                          ? 'bg-warning-solid text-white shadow-sm hover:bg-warning-solid'
                          : 'border border-line text-fg hover:bg-app'
                      }`}
                    >
                      <PencilLine className="h-4 w-4" aria-hidden="true" />
                      Request an edit
                    </button>
                  </div>

                  {specialtyConfirmed && !requestingChange && (
                    <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-success">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Great — your specialties are confirmed.
                    </p>
                  )}

                  {requestingChange && (
                    <div className="mt-4 flex flex-col gap-3">
                      <div className="space-y-2">
                        <p className="m-0 text-sm font-bold text-fg">Which specialties should you hold?</p>
                        <p className="m-0 text-sm text-muted">
                          Tick every discipline you practise. Untick anything assigned to you by mistake.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2.5">
                          {SPECIALIST_SPECIALTIES.map((option) => (
                            <TogglePill
                              key={option}
                              label={option}
                              checked={requestedSpecialties.includes(option)}
                              onToggle={() =>
                                setRequestedSpecialties((prev) =>
                                  prev.includes(option)
                                    ? prev.filter((s) => s !== option)
                                    : [...prev, option],
                                )
                              }
                            />
                          ))}
                        </div>
                      </div>

                      {hasSpecialtyDelta && (
                        <div className="rounded-xl border border-line bg-app/60 p-3">
                          <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted">
                            Admin will be asked to
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {addedSpecialties.map((specialty) => (
                              <span
                                key={`add-${specialty}`}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${semanticToneClass('success')}`}
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                Add {specialty}
                              </span>
                            ))}
                            {removedSpecialties.map((specialty) => (
                              <span
                                key={`remove-${specialty}`}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${semanticToneClass('danger')}`}
                              >
                                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                                Remove {specialty}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

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
                          disabled={
                            specialtyRequestLoading || !hasSpecialtyDelta || requestedSpecialties.length === 0
                          }
                          onClick={async () => {
                            setSpecialtyRequestLoading(true);
                            try {
                              await api.post('/api/users/request-specialty-change/', {
                                specialties: requestedSpecialties,
                                note: specialtyRequestNote,
                              });
                              await refreshUser();
                              setRequestingChange(false);
                              setSpecialtyRequestNote('');
                              toast.success('Request sent to admin.');
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
                        {requestedSpecialties.length === 0 && (
                          <p className="mt-2 text-xs font-medium text-danger">
                            Keep at least one specialty selected.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Languages — the one thing sign-up didn't already ask for. */}
            <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="m-0 text-sm font-extrabold text-fg">
                  One thing we still need — your session languages
                </p>
                {languages.length > 0 && (
                  <span className="text-xs font-semibold text-indigo-600">
                    {languages.length} selected
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">
                Pick the languages you can comfortably use with parents and children. We use these to
                match you with families you can talk to directly.
              </p>

              <div className="mt-3 flex flex-wrap gap-2.5">
                {LANGUAGE_OPTIONS.map((option) => {
                  const checked = languages.some((language) => language.toLowerCase() === option.toLowerCase());
                  return (
                    <TogglePill
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
                      Looks right — take me in
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
