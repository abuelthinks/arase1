'use client';

import { useEffect, useState } from 'react';
import {
  Map as MapIcon,
  Workflow,
  GraduationCap,
  Brain,
  Bug,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Check,
  BookOpen,
  FileSearch,
  Lightbulb,
} from 'lucide-react';
import {
  MAP_ZONES,
  TRACES,
  LESSONS,
  SYMPTOMS,
  QUIZ,
  SIDE_LABEL,
  type Side,
  type MapFile,
} from './learn-data';
import LessonViewer from './LessonViewer';

type Tab = 'map' | 'trace' | 'symptoms' | 'lessons' | 'quiz';

const PROGRESS_KEY = 'arase-learn-done';

const SIDE_PILL: Record<Side, string> = {
  FE: 'bg-info-soft text-info border-info-line',
  BE: 'bg-success-soft text-success border-success-line',
  BG: 'bg-attention-soft text-attention border-attention-line',
  DB: 'bg-warning-soft text-warning border-warning-line',
};

const SIDE_DOT: Record<Side, string> = {
  FE: 'bg-info-strong',
  BE: 'bg-success-strong',
  BG: 'bg-attention-strong',
  DB: 'bg-warning-strong',
};

const SIDE_HINT: Record<Side, string> = {
  FE: 'Frontend (browser)',
  BE: 'Backend (Django)',
  BG: 'Background (Celery, Redis, WebSocket)',
  DB: 'Database',
};

const TABS: { key: Tab; label: string; Icon: typeof MapIcon }[] = [
  { key: 'map', label: 'Map', Icon: MapIcon },
  { key: 'trace', label: 'Trace a Request', Icon: Workflow },
  { key: 'symptoms', label: 'Symptom Finder', Icon: Bug },
  { key: 'lessons', label: 'Lessons', Icon: GraduationCap },
  { key: 'quiz', label: 'Quiz', Icon: Brain },
];

export default function LearnExperience() {
  const [tab, setTab] = useState<Tab>('map');

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-fg m-0">ARASE Code Explorer</h1>
        <p className="text-muted mt-1">
          An interactive way into your own codebase: click around, watch a request travel, diagnose a symptom, test yourself.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm transition-colors ${
              tab === key
                ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)] font-bold'
                : 'bg-surface text-muted border-line hover:text-fg hover:border-[var(--accent-border)]'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'map' && <CodeMap />}
      {tab === 'trace' && <RequestTracer />}
      {tab === 'symptoms' && <SymptomFinder />}
      {tab === 'lessons' && <LessonsTab />}
      {tab === 'quiz' && <QuizTab />}
    </div>
  );
}

function SideLegend({ sides }: { sides: Side[] }) {
  return (
    <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted">
      {sides.map((side) => (
        <span key={side} className="inline-flex items-center gap-1.5">
          <i className={`h-2.5 w-2.5 rounded-full ${SIDE_DOT[side]}`} /> {SIDE_HINT[side]}
        </span>
      ))}
    </div>
  );
}

/* ─── Map ─────────────────────────────────────────────────────────────────── */

function CodeMap() {
  const [selected, setSelected] = useState<{ file: MapFile; side: Side } | null>(null);

  return (
    <div className="glass-panel p-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {MAP_ZONES.map((zone) => (
          <div key={zone.side} className="rounded-xl bg-app p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted mb-3">
              <i className={`h-2 w-2 rounded-full ${SIDE_DOT[zone.side]}`} />
              {zone.label}
            </div>
            {zone.files.map((file) => {
              const isSel = selected?.file.path === file.path;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelected({ file, side: zone.side })}
                  className={`block w-full text-left rounded-lg border px-3 py-2 mb-2 transition-colors ${
                    isSel ? SIDE_PILL[zone.side] : 'bg-card border-line hover:border-[var(--accent-border)]'
                  }`}
                >
                  <span className="text-sm text-fg">{file.name}</span>
                  <span className="block font-mono text-[11px] text-muted mt-0.5 break-all">{file.path}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-app p-4 min-h-[110px]">
        {selected ? (
          <>
            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${SIDE_PILL[selected.side]}`}>
              {SIDE_LABEL[selected.side]}
            </span>
            <h3 className="text-base font-bold text-fg mt-2 mb-1">{selected.file.name}</h3>
            <p className="font-mono text-xs text-info break-all">{selected.file.path}</p>
            <p className="text-muted mt-2">{selected.file.desc}</p>
          </>
        ) : (
          <>
            <h3 className="text-base font-bold text-fg mb-1">Click any file to learn what it does</h3>
            <p className="text-muted">
              These are real files in the repo. The browser asks, the server answers, slow work goes to the background, and the database remembers.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Trace ───────────────────────────────────────────────────────────────── */

function RequestTracer() {
  const [scnIdx, setScnIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const scenario = TRACES[scnIdx];
  const steps = scenario.steps;
  const hop = steps[step];
  const sidesUsed = (['FE', 'BE', 'BG', 'DB'] as Side[]).filter((side) => steps.some((s) => s.side === side));

  useEffect(() => {
    if (!playing) return;
    if (step >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), 1700);
    return () => clearTimeout(t);
  }, [playing, step, steps.length]);

  const pick = (i: number) => {
    setScnIdx(i);
    setStep(0);
    setPlaying(false);
  };

  return (
    <div className="glass-panel p-5">
      <div className="flex flex-wrap gap-2 mb-4">
        {TRACES.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => pick(i)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              i === scnIdx ? 'bg-fg text-app border-fg' : 'bg-surface text-muted border-line hover:text-fg hover:border-[var(--accent-border)]'
            }`}
          >
            <Play size={13} /> {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setStep((s) => Math.max(0, s - 1));
          }}
          disabled={step === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-fg transition-colors disabled:opacity-40 hover:bg-app"
        >
          <ChevronLeft size={15} /> Back
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setStep((s) => Math.min(steps.length - 1, s + 1));
          }}
          disabled={step === steps.length - 1}
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-fg transition-colors disabled:opacity-40 hover:bg-app"
        >
          Next <ChevronRight size={15} />
        </button>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-fg transition-colors hover:bg-app"
        >
          {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? 'Pause' : 'Auto-play'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setStep(0);
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-muted transition-colors hover:bg-app"
        >
          <RotateCcw size={14} /> Reset
        </button>
        <span className="ml-auto text-sm text-muted">
          Step {step + 1} / {steps.length}
        </span>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex flex-col gap-1">
          {steps.map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setPlaying(false);
                setStep(i);
              }}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                i === step ? 'bg-app border-line opacity-100' : `border-transparent ${i < step ? 'opacity-80' : 'opacity-45'} hover:opacity-100`
              }`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] text-white ${SIDE_DOT[h.side]}`}>
                {i + 1}
              </span>
              <span>
                <span className="block text-sm text-fg leading-tight">{h.title}</span>
                <span className="block font-mono text-[11px] text-faint mt-0.5">{h.file}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1 rounded-xl bg-app p-4">
          <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${SIDE_PILL[hop.side]}`}>
            {SIDE_LABEL[hop.side]}
          </span>
          <h3 className="text-base font-bold text-fg mt-2 mb-1">{hop.title}</h3>
          <p className="font-mono text-xs text-info break-all">{hop.file}</p>
          <p className="text-sm text-muted mt-2.5 mb-1">
            {hop.dir === 'req' ? '→ work moving forward' : '← answer coming back'}
          </p>
          <p className="text-fg">{hop.desc}</p>
          <pre className="mt-3 rounded-lg bg-surface border border-line p-3 font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {hop.code}
          </pre>
        </div>
      </div>

      <SideLegend sides={sidesUsed} />
    </div>
  );
}

/* ─── Symptoms ────────────────────────────────────────────────────────────── */

function SymptomFinder() {
  const [selected, setSelected] = useState<number | null>(null);
  const item = selected === null ? null : SYMPTOMS[selected];

  return (
    <div className="glass-panel p-5">
      <p className="text-muted mb-4">
        Pick what you are seeing. You get the usual cause, the one thing to check first, and which files to open.
      </p>
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex flex-col gap-1.5">
          {SYMPTOMS.map((s, i) => (
            <button
              key={s.symptom}
              type="button"
              onClick={() => setSelected(i)}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                i === selected ? SIDE_PILL[s.side] : 'bg-card border-line text-fg hover:border-[var(--accent-border)]'
              }`}
            >
              <i className={`h-2.5 w-2.5 shrink-0 rounded-full ${SIDE_DOT[s.side]}`} />
              {s.symptom}
            </button>
          ))}
        </div>

        <div className="flex-1 md:sticky md:top-4 self-start w-full rounded-xl bg-app p-4 min-h-[160px]">
          {item ? (
            <>
              <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${SIDE_PILL[item.side]}`}>
                Usually {SIDE_LABEL[item.side].toLowerCase()}
              </span>
              <h3 className="text-base font-bold text-fg mt-2 mb-3">{item.symptom}</h3>
              <div className="flex gap-2 mb-3">
                <Lightbulb size={16} className="text-muted shrink-0 mt-0.5" />
                <p className="text-fg m-0">{item.cause}</p>
              </div>
              <div className="flex gap-2 mb-3">
                <FileSearch size={16} className="text-muted shrink-0 mt-0.5" />
                <p className="text-fg m-0">
                  <span className="font-bold">Check first: </span>
                  {item.check}
                </p>
              </div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted mb-1.5">Open</div>
              <ul className="m-0 pl-0 list-none flex flex-col gap-1">
                {item.where.map((w) => (
                  <li key={w} className="font-mono text-xs text-info break-all">{w}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h3 className="text-base font-bold text-fg mb-1">Start with the Network tab</h3>
              <p className="text-muted">
                Open DevTools (F12), reproduce the bug, and look at the request&apos;s status code. Then pick the matching symptom here.
                Lesson 07 has the full method.
              </p>
            </>
          )}
        </div>
      </div>
      <SideLegend sides={['FE', 'BE', 'BG', 'DB']} />
    </div>
  );
}

/* ─── Lessons ─────────────────────────────────────────────────────────────── */

function LessonsTab() {
  const [done, setDone] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '[]');
      if (Array.isArray(saved)) setDone(saved);
    } catch {
      // ignore malformed storage
    }
  }, []);

  const toggle = (slug: string) => {
    setDone((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      } catch {
        // ignore storage failures
      }
      return next;
    });
  };

  if (active) {
    return (
      <div className="glass-panel p-5 md:p-7">
        <LessonViewer slug={active} onBack={() => setActive(null)} onNavigate={(slug) => setActive(slug)} />
      </div>
    );
  }

  const counted = LESSONS.filter((l) => !l.reference);
  const completed = counted.filter((l) => done.includes(l.slug)).length;
  const parts = Array.from(new Set(LESSONS.map((l) => l.part)));

  return (
    <div className="glass-panel p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-fg m-0">Your progress</h3>
        <span className="text-sm text-muted">
          {completed} / {counted.length} lessons
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-app overflow-hidden my-3">
        <div
          className="h-full bg-success-solid transition-all"
          style={{ width: `${counted.length ? (completed / counted.length) * 100 : 0}%` }}
        />
      </div>

      {parts.map((part) => (
        <section key={part} className="mt-5 first:mt-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">{part}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LESSONS.filter((l) => l.part === part).map((lesson) => {
              const isDone = done.includes(lesson.slug);
              return (
                <div
                  key={lesson.slug}
                  className={`rounded-xl border p-4 ${isDone ? 'bg-app border-line' : 'bg-card border-line'}`}
                >
                  <div className="text-xs text-faint">
                    {lesson.reference ? 'Reference' : `Lesson ${lesson.num}`}
                  </div>
                  <div className="text-[15px] font-bold text-fg mt-0.5 mb-1">{lesson.title}</div>
                  <p className="text-sm text-muted mb-3">{lesson.blurb}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActive(lesson.slug)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-info-line bg-info-soft text-info px-3 py-1.5 text-[13px] transition-colors hover:border-[var(--accent-border)] hover:text-fg"
                    >
                      <BookOpen size={14} /> {lesson.reference ? 'Open' : 'Read lesson'}
                    </button>
                    {!lesson.reference && (
                      <button
                        type="button"
                        onClick={() => toggle(lesson.slug)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${
                          isDone ? 'bg-success-soft text-success border-success-line' : 'bg-transparent text-muted border-line hover:text-fg hover:border-[var(--accent-border)]'
                        }`}
                      >
                        {isDone ? <Check size={14} /> : null}
                        {isDone ? 'Done' : 'Mark done'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ─── Quiz ────────────────────────────────────────────────────────────────── */

function QuizTab() {
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const answeredCount = Object.keys(answers).length;
  const correct = Object.keys(answers).filter((k) => answers[+k] === QUIZ[+k].answer).length;
  const allAnswered = answeredCount === QUIZ.length;

  return (
    <div className="glass-panel p-5">
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-sm text-muted">
          {answeredCount} / {QUIZ.length} answered
        </span>
        {answeredCount > 0 && (
          <button
            type="button"
            onClick={() => setAnswers({})}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg hover:border-[var(--accent-border)]"
          >
            <RotateCcw size={14} /> Start over
          </button>
        )}
      </div>

      {QUIZ.map((item, qi) => {
        const chosen = answers[qi];
        const locked = chosen !== undefined;
        return (
          <div key={qi} className="mb-5 last:mb-0">
            <div className="text-[15px] font-bold text-fg mb-2">
              {qi + 1}. {item.q}
            </div>
            {item.options.map((opt, oi) => {
              let cls = 'bg-card border-line hover:border-[var(--accent-border)]';
              if (locked) {
                if (oi === item.answer) cls = 'bg-success-soft text-success border-success-line';
                else if (oi === chosen) cls = 'bg-danger-soft text-danger border-danger-line';
                else cls = 'bg-card border-line opacity-60';
              }
              return (
                <button
                  key={oi}
                  type="button"
                  disabled={locked}
                  onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                  className={`block w-full text-left rounded-lg border px-3 py-2 mb-1.5 text-sm text-fg transition-colors ${cls}`}
                >
                  {opt}
                </button>
              );
            })}
            {locked && <p className="text-sm text-muted mt-1.5 pl-1">{item.explain}</p>}
          </div>
        );
      })}

      {allAnswered && (
        <div className="mt-4 rounded-xl bg-app p-4 text-fg font-bold">
          Score: {correct} / {QUIZ.length}
          {correct === QUIZ.length
            ? ' · Flawless. You can read this codebase.'
            : ' · Revisit the Trace and Symptom tabs, then start over.'}
        </div>
      )}
    </div>
  );
}
