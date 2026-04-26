'use client';

import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import { CalendarClock, ArrowRight } from 'lucide-react';

function SchedulePausedContent() {
  return (
    <div className='mx-auto flex min-h-[60vh] w-full max-w-3xl items-center px-4 md:px-0'>
      <section className='w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-start'>
          <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600'>
            <CalendarClock className='h-6 w-6' aria-hidden='true' />
          </div>
          <div className='flex-1'>
            <h1 className='m-0 text-2xl font-extrabold text-slate-900'>Assessment Scheduling Is Paused</h1>
            <p className='mt-2 text-sm leading-relaxed text-slate-600'>
              We&apos;re keeping assessment coordination manual for now so specialists can move straight into the evaluation workflow.
            </p>
            <p className='mt-2 text-sm leading-relaxed text-slate-500'>
              Use the workspace to review assigned students and continue assessments once your profile setup is complete.
            </p>
            <div className='mt-5 flex flex-wrap gap-3'>
              <Link
                href='/workspace'
                className='inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white no-underline hover:bg-indigo-700'
              >
                Open Workspace
                <ArrowRight className='h-4 w-4' aria-hidden='true' />
              </Link>
              <Link
                href='/dashboard'
                className='inline-flex items-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 no-underline hover:bg-slate-50'
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <ProtectedRoute allowedRoles={['SPECIALIST']}>
      <SchedulePausedContent />
    </ProtectedRoute>
  );
}
