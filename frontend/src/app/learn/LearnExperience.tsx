'use client';

import { useEffect, useState } from 'react';
import {
  Map as MapIcon,
  Workflow,
  GraduationCap,
  Brain,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  ArrowRight,
  ArrowLeftRight,
  Check,
  BookOpen,
} from 'lucide-react';
import {
  MAP_ZONES,
  TRACES,
  LESSONS,
  QUIZ,
  SIDE_LABEL,
  type Side,
  type MapFile,
} from './learn-data';
import LessonViewer from './LessonViewer';

type Tab = 'map' | 'trace' | 'lessons' | 'quiz';

const PROGRESS_KEY = 'arase-learn-done';

const SIDE_PILL: Record<Side, string> = {
  FE: 'bg-info-soft text-info border-info-line',
  BE: 'bg-success-soft text-success border-success-line',
  DB: 'bg-warning-soft text-warning border-warning-line',
};

const SIDE_DOT: Record<Side, string> = {
  FE: 'bg-info-strong',
  BE: 'bg-success-strong',
  DB: 'bg-warning-strong',
};

const TABS: { key: Tab; label: string; Icon: typeof MapIcon }[] = [
  { key: 'map', label: 'Map', Icon: MapIcon },
  { key: 'trace', label: 'Trace a Request', Icon: Workflow },
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
          An interactive way into your own codebase — click around, watch a request travel, test yourself.
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
                : 'bg-surface text-muted border-line hover:text-fg'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'map' && <CodeMap />}
      {tab === 'trace' && <RequestTracer />}
      {tab === 'lessons' && <LessonsTab />}
      {tab === 'quiz' && <QuizTab />}
    </div>
  );
}

/* ─── Map ─────────────────────────────────────────────────────────────────── */

function CodeMap() {
  const [selected, setSelected] = useState<{ file: MapFile; side: Side } | null>(null);

  return (
    <div className="glass-panel p-5">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch">
        {MAP_ZONES.map((zone, zi) => (
          <div key={zone.side} className="flex flex-1 gap-3">
            <div className="flex-1 rounded-xl bg-app p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted mb-3">{zone.label}</div>
              {zone.files.map((file) => {
                const isSel = selected?.file.path === file.path;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelected({ file, side: zone.side })}
                    className={`block w-full text-left rounded-lg border px-3 py-2 mb-2 transition-all ${
                      isSel ? `${SIDE_PILL[zone.side]}` : 'bg-card border-line hover:border-[var(--accent-border)]'
                    }`}
                  >
                    <span className="text-sm text-fg">{file.name}</span>
                    <span className="block font-mono text-[11px] text-muted mt-0.5 break-all">{file.path}</span>
                  </button>
                );
              })}
            </div>
            {zi < MAP_ZONES.length - 1 && (
              <div className="hidden lg:flex items-center text-faint">
                {zi === 0 ? <ArrowLeftRight size={20} /> : <ArrowRight size={20} />}
              </div>
            )}
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
              These are the real files in your repo. The browser asks; the server answers; the database remembers.
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
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              i === scnIdx ? 'bg-fg text-app border-fg' : 'bg-surface text-muted border-line hover:text-fg'
            }`}
          >
            ▶ {s.label}
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
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-fg disabled:opacity-40 hover:bg-app"
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
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-fg disabled:opacity-40 hover:bg-app"
        >
          Next <ChevronRight size={15} />
        </button>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-fg hover:bg-app"
        >
          {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? 'Pause' : 'Auto-play'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setStep(0);
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-muted hover:bg-app"
        >
          <RotateCcw size={14} /> Reset
        </button>
        <span className="ml-auto text-sm text-muted">
          Step {step + 1} / {steps.length}
        </span>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Timeline */}
        <div className="flex-1 flex flex-col gap-1">
          {steps.map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setPlaying(false);
                setStep(i);
              }}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-left transition-all ${
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

        {/* Stage */}
        <div className="flex-1 rounded-xl bg-app p-4">
          <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${SIDE_PILL[hop.side]}`}>
            {SIDE_LABEL[hop.side]}
          </span>
          <h3 className="text-base font-bold text-fg mt-2 mb-1">{hop.title}</h3>
          <p className="font-mono text-xs text-info break-all">{hop.file}</p>
          <p className="text-sm text-muted mt-2.5 mb-1">
            {hop.dir === 'req' ? '→ request travelling to the server' : '← response coming back to the screen'}
          </p>
          <p className="text-fg">{hop.desc}</p>
          <pre className="mt-3 rounded-lg bg-surface border border-line p-3 font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {hop.code}
          </pre>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className={`h-2.5 w-2.5 rounded-full ${SIDE_DOT.FE}`} /> Frontend (browser)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className={`h-2.5 w-2.5 rounded-full ${SIDE_DOT.BE}`} /> Backend (Django)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className={`h-2.5 w-2.5 rounded-full ${SIDE_DOT.DB}`} /> Database
        </span>
      </div>
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

  const completed = done.filter((s) => s !== 'README').length;
  const total = LESSONS.filter((l) => l.slug !== 'README').length;

  return (
    <div className="glass-panel p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-fg m-0">Your progress</h3>
        <span className="text-sm text-muted">
          {completed} / {total} complete
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-app overflow-hidden my-3">
        <div
          className="h-full bg-success-solid transition-all"
          style={{ width: `${total ? (completed / total) * 100 : 0}%` }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {LESSONS.map((lesson) => {
          const isDone = done.includes(lesson.slug);
          return (
            <div
              key={lesson.slug}
              className={`rounded-xl border p-4 ${isDone ? 'bg-app border-line' : 'bg-card border-line'}`}
            >
              <div className="text-xs text-faint">{lesson.slug === 'README' ? 'Intro' : `Lesson ${lesson.num}`}</div>
              <div className="text-[15px] font-bold text-fg mt-0.5 mb-1">{lesson.title}</div>
              <p className="text-sm text-muted mb-3">{lesson.blurb}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActive(lesson.slug)}
                  className="inline-flex items-center gap-1.5 rounded-lg border-none bg-info-soft text-info px-3 py-1.5 text-[13px] hover:brightness-95"
                >
                  <BookOpen size={14} /> Read lesson
                </button>
                <button
                  type="button"
                  onClick={() => toggle(lesson.slug)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${
                    isDone ? 'bg-success-soft text-success border-success-line' : 'bg-transparent text-muted border-line hover:text-fg'
                  }`}
                >
                  {isDone ? <Check size={14} /> : null}
                  {isDone ? 'Done' : 'Mark done'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
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
                  className={`block w-full text-left rounded-lg border px-3 py-2 mb-1.5 text-sm text-fg transition-all ${cls}`}
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
            ? ' — flawless. You can read this codebase. 🎉'
            : ' — revisit the Trace tab and try again.'}
        </div>
      )}
    </div>
  );
}
