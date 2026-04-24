"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Calendar, CalendarClock, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isSpecialistOnboardingIncomplete, specialistOnboardingMessage } from "@/lib/specialist-onboarding";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm font-medium text-slate-800 transition-all hover:bg-white focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-50";

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const toDateTimeLocalValue = (value: Date) => {
  const offsetMs = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
};

const nextDefaultStart = () => {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return toDateTimeLocalValue(next);
};

const nextDefaultEnd = () => {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(10, 0, 0, 0);
  return toDateTimeLocalValue(next);
};

function SpecialistScheduleContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [slots, setSlots] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startAt, setStartAt] = useState(nextDefaultStart);
  const [endAt, setEndAt] = useState(nextDefaultEnd);
  const onboardingIncomplete = isSpecialistOnboardingIncomplete(user);

  useEffect(() => {
    if (searchParams.get("onboarded") === "1") {
      toast.success("Profile saved! Now add your availability below.");
      router.replace("/schedule");
    }
  }, []);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const [slotRes, appointmentRes] = await Promise.all([
        api.get("/api/assessment/availability/"),
        api.get("/api/assessment/appointments/"),
      ]);
      setSlots(slotRes.data || []);
      setAppointments(appointmentRes.data || []);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Could not load schedule.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "SPECIALIST") {
      loadSchedule();
    }
  }, [user?.role]);

  const createSlot = async () => {
    setSaving(true);
    try {
      await api.post("/api/assessment/availability/", {
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        mode: "ONLINE",
        is_active: true,
      });
      toast.success("Availability added.");
      await loadSchedule();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Could not add availability.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSlot = async (slotId: number) => {
    try {
      await api.delete(`/api/assessment/availability/${slotId}/`);
      toast.success("Availability removed.");
      await loadSchedule();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Could not remove availability.");
    }
  };

  const scheduledAppointments = appointments.filter(a => a.status === "SCHEDULED");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 md:px-0">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          {/* Header */}
          <div className="mb-8 flex flex-col gap-4 border-b border-indigo-100/60 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-200">
                <CalendarClock className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h1 className="m-0 bg-gradient-to-r from-blue-700 to-indigo-500 bg-clip-text text-2xl font-extrabold leading-tight text-transparent">
                  My Schedule
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Add online assessment times that parents can choose from.
                </p>
              </div>
            </div>
          </div>

          {/* Info banner */}
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
            <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" aria-hidden="true" />
            <p className="m-0 text-sm font-medium text-indigo-900">
              Parents only see open slots you add here. The specialist assessment form unlocks after the booked session is marked complete by admin.
            </p>
          </div>

          {onboardingIncomplete && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="m-0 flex-1 text-sm font-semibold text-amber-900">
                {specialistOnboardingMessage(user?.specialist_onboarding_missing)}
              </p>
              <Link
                href="/specialist-onboarding"
                className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white no-underline hover:bg-amber-700"
              >
                Finish setup
              </Link>
            </div>
          )}

          {/* Add availability */}
          <div className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5">
            <p className="m-0 mb-4 text-sm font-extrabold text-slate-900">Add availability</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor="start-at">
                  Start
                </label>
                <input
                  id="start-at"
                  type="datetime-local"
                  value={startAt}
                  onChange={e => setStartAt(e.target.value)}
                  disabled={onboardingIncomplete}
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor="end-at">
                  End
                </label>
                <input
                  id="end-at"
                  type="datetime-local"
                  value={endAt}
                  onChange={e => setEndAt(e.target.value)}
                  disabled={onboardingIncomplete}
                  className={inputCls}
                />
              </div>
              <button
                type="button"
                onClick={createSlot}
                disabled={saving || onboardingIncomplete}
                className="inline-flex items-center justify-center gap-2 self-end rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
                Add slot
              </button>
            </div>
          </div>

          {/* Slots + Appointments */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="m-0 text-sm font-extrabold text-slate-900">Open slots</p>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                  {slots.length}
                </span>
              </div>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading...
                </div>
              ) : slots.length === 0 ? (
                <p className="m-0 text-sm text-slate-400">No open availability yet.</p>
              ) : (
                <div className="space-y-2">
                  {slots.map(slot => (
                    <div key={slot.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <div>
                        <p className="m-0 text-sm font-bold text-slate-900">{formatDateTime(slot.start_at)}</p>
                        <p className="m-0 text-xs text-slate-400">Online</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteSlot(slot.id)}
                        disabled={onboardingIncomplete}
                        aria-label="Remove slot"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="m-0 text-sm font-extrabold text-slate-900">Booked sessions</p>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  {scheduledAppointments.length}
                </span>
              </div>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading...
                </div>
              ) : scheduledAppointments.length === 0 ? (
                <p className="m-0 text-sm text-slate-400">No booked sessions yet.</p>
              ) : (
                <div className="space-y-2">
                  {scheduledAppointments.map(appointment => (
                    <div key={appointment.id} className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-white p-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                      <div>
                        <p className="m-0 text-sm font-bold text-slate-900">{formatDateTime(appointment.start_at)}</p>
                        <p className="m-0 text-xs text-slate-500">{appointment.student_name} · Online</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
      </section>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <ProtectedRoute allowedRoles={["SPECIALIST"]}>
      <SpecialistScheduleContent />
    </ProtectedRoute>
  );
}
