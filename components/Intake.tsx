'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle, Check, ClipboardPaste, Clock, FileText, Loader2, Upload, X,
} from 'lucide-react';
import type { JobStage } from '@/contracts/schema';
import {
  ERROR_COPY, STAGE_COPY, STAGE_ORDER, type JobUpdate, type Scenario,
} from '@/lib/mock-job';
import { runJob, type JobInput } from '@/lib/job-client';
import { cn } from '@/lib/cn';
import { useUi } from '@/components/LocaleProvider';
import { interpolate } from '@/lib/interpolate';
import { NumberTicker } from '@/components/NumberTicker';
import { GlowEffect } from '@/components/core/glow-effect';
import { TextMorph } from '@/components/core/text-morph';
import { motion } from 'motion/react';

/** One click each. An arriving judge should never face an empty upload box. */
const SAMPLES = [
  { id: 'offer', label: 'Software engineer offer letter', note: 'Service bond, non-compete, 90-day notice', scenario: 'success' as Scenario },
  { id: 'clean', label: 'A fair offer letter', note: 'Nothing unusual — the empty state is a real result', scenario: 'no_flags' as Scenario },
  { id: 'scan', label: 'A photographed letter', note: 'Poor scan — shows what partial extraction looks like', scenario: 'low_coverage' as Scenario },
];

const MAX_BYTES = 10 * 1024 * 1024;

type Phase = 'idle' | 'running' | 'failed' | 'done';

export function Intake() {
  const router = useRouter();
  const t = useUi();
  const [phase, setPhase] = useState<Phase>('idle');
  const [job, setJob] = useState<JobUpdate | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [dragging, setDragging] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  // One announcement per STAGE, not per update. Seven interruptions in
  // seventeen seconds is a screen-reader failure, not progress reporting.
  const [announced, setAnnounced] = useState<string>('');
  const lastStage = useRef<JobStage | null>(null);

  useEffect(() => () => cancelRef.current?.(), []);

  const start = useCallback(
    (input: JobInput, name: string) => {
      setFileName(name);
      setPhase('running');
      setJob(null);
      lastStage.current = null;
      setAnnounced('');

      cancelRef.current = runJob(input, (update) => {
        setJob(update);

        if (update.status === 'running' && update.stage !== lastStage.current) {
          lastStage.current = update.stage;
          setAnnounced(STAGE_COPY[update.stage].label);
        }
        if (update.status === 'failed' || update.status === 'timed_out') setPhase('failed');
        if (update.status === 'cancelled') { setPhase('idle'); setFileName(null); }
        if (update.status === 'done') {
          setPhase('done');
          // No `?coverage=` override any more: the stored analysis carries its
          // own mode, and a query parameter that contradicts it would be a
          // second source for one setting.
          window.setTimeout(() => router.push('/radar'), 900);
        }
      });
    },
    [router],
  );

  const sample = (scenario: Scenario, label: string) =>
    start({ kind: 'scenario', scenario, label }, label);

  /** Size is decided BEFORE the upload, not just before extraction: there is no
   *  point spending a reader's data allowance on a file we have already said we
   *  will not read. Everything else the SERVER decides — an encrypted PDF or a
   *  document that is not an agreement is not something a filename can tell us. */
  const onFile = (file: File) => {
    if (file.size > MAX_BYTES) return sample('oversize', file.name);
    start({ kind: 'file', file }, file.name);
  };

  const cancel = () => {
    cancelRef.current?.();
    cancelRef.current = null;
  };

  /* ── running ─────────────────────────────────────────────────── */
  if (phase === 'running' || phase === 'done') {
    const stageIndex = job ? STAGE_ORDER.indexOf(job.stage) : 0;
    const done = phase === 'done';

    return (
      <div className="relative mx-auto max-w-2xl px-4 py-14 sm:px-6">
        {/* The glow says "working" without claiming a percentage. It fades out
            on done, so the last thing the reader sees before the results is a
            settled page rather than something still churning. */}
        <motion.div
          className="pointer-events-none absolute inset-x-0 inset-y-8 -z-10"
          animate={{ opacity: done ? 0 : 0.28 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <GlowEffect mode="colorShift" blur="strong" duration={4} />
        </motion.div>

        <p className="text-xs uppercase tracking-wider text-ink-faint">{fileName}</p>
        {/* These two lines change four times during a run. Morphing the shared
            characters makes it read as one line being rewritten rather than
            four unrelated messages flashing past. The live region below is
            what actually announces the change; this is only the visual. */}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          <TextMorph>{done ? t.intake.done : STAGE_COPY[job?.stage ?? 'reading'].label}</TextMorph>
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          <TextMorph>
            {job?.message ?? (done ? t.intake.openingResults : STAGE_COPY[job?.stage ?? 'reading'].detail)}
          </TextMorph>
        </p>

        {/* Exactly one live region, updated once per stage. */}
        <p aria-live="polite" className="sr-only">
          {announced}
        </p>

        <ol className="mt-7 space-y-3">
          {STAGE_ORDER.map((stage, i) => {
            const state = done || i < stageIndex ? 'complete' : i === stageIndex ? 'active' : 'pending';
            return (
              <li key={stage} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                    state === 'complete' && 'border-accent bg-accent text-paper',
                    state === 'active' && 'border-ink-muted text-ink',
                    state === 'pending' && 'border-rule text-ink-faint',
                  )}
                >
                  {state === 'complete' ? (
                    <Check size={13} />
                  ) : state === 'active' ? (
                    <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />
                  ) : (
                    <span className="text-[11px]">{i + 1}</span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-sm',
                    state === 'pending' ? 'text-ink-faint' : 'font-medium text-ink',
                  )}
                >
                  {STAGE_COPY[stage].label}
                </span>
              </li>
            );
          })}
        </ol>

        {job?.counts && (
          <p className="mt-6 text-sm tabular-nums text-ink-muted">
            {interpolate(t.intake.foundVerifiedTemplate, {
              found: <NumberTicker value={job.counts.found} className="font-medium text-ink" />,
              verified: <NumberTicker value={job.counts.verified} className="font-medium text-ink" />,
            })}
          </p>
        )}

        {!done && (
          <button
            type="button"
            onClick={cancel}
            className="pop-sm rim mt-7 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-rule-strong px-4 text-sm font-medium text-ink"
          >
            <X size={14} aria-hidden="true" />
            {t.intake.stopThis}
          </button>
        )}
      </div>
    );
  }

  /* ── failed ──────────────────────────────────────────────────── */
  if (phase === 'failed' && job?.error_code) {
    const e = ERROR_COPY[job.error_code];
    return (
      <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <div className="rounded-xl border border-reduced/40 bg-reduced-bg p-5 sm:p-6">
          <h1 className="flex items-start gap-2.5 text-lg font-semibold text-reduced">
            <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            {e.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink">{e.body}</p>
          {fileName && <p className="mt-2 text-xs text-ink-faint">{fileName}</p>}

          <div className="mt-5 flex flex-wrap gap-2">
            {/* The override. Cutting shallow mode made this classifier the sole
                gate on the whole product, and a real employment contract
                misread as something else is a dead end for the person holding
                it. One link turns that back into a recoverable mistake. */}
            {e.action === 'override' && (
              <button
                type="button"
                onClick={() => sample('low_coverage', fileName ?? 'your document')}
                className="pop-sm inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-paper"
              >
                {t.intake.analyzeAnyway}
              </button>
            )}
            {e.action === 'retry' && (
              <button
                type="button"
                onClick={() => sample('success', fileName ?? 'your document')}
                className="pop-sm inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-paper"
              >
                {t.intake.tryAgain}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setPhase('idle'); setJob(null); setFileName(null); }}
              className="pop-sm rim inline-flex min-h-11 items-center rounded-lg border border-rule-strong px-4 text-sm font-medium text-ink"
            >
              {e.action === 'wait' ? t.intake.back : t.intake.differentFile}
            </button>
            <Link
              href="/radar"
              className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm text-ink-muted hover:underline"
            >
              {t.intake.openSampleInstead}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ── idle ────────────────────────────────────────────────────── */
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {t.intake.title}
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        {t.intake.subtitle}
      </p>

      {/* One glow behind whichever panel is showing. It comes up the moment the
          reader commits to a path — clicking "Paste text instead" swaps the
          panel, and choosing a file leaves this view for the running one, which
          carries its own. Idle and untouched, there is no glow at all: a card
          that pulses before anyone has done anything is just noise. */}
      <div className="relative mt-6">
        <motion.div
          // The spill has to be WIDER than the blur radius. At -inset-4 the
          // glow reached 16px past an opaque card while being blurred by 64px,
          // so almost all of it was hidden behind the card and the rest was
          // diluted to nothing. 48px of spill against a 24px blur is what makes
          // it a halo instead of a rumour.
          // Wide, but not tall: at -inset-12 the halo reached the subtitle
          // above the card and the "or try one of ours" heading below it, and
          // measurement put both under AA (1.74:1 and 3.07:1). The horizontal
          // spill has nothing to collide with, so only the vertical is pulled in.
          className="pointer-events-none absolute -inset-x-12 inset-y-0 -z-10"
          initial={{ opacity: 0 }}
          // Lit from the start rather than only once the reader commits. This
          // is the one place on the site that is asking to be used, and the
          // drop target is a dark card — the glow is what makes it look live.
          animate={{ opacity: dragging ? 0.85 : pasting ? 0.75 : 0.6 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {/* Five stops rather than the default four, and rotate rather than
              colorShift, so the colour travels around the card instead of
              cross-fading in place. All five are palette tokens; none of them
              is a severity colour. */}
          <GlowEffect
            mode="rotate"
            blur="soft"
            duration={7}
            colors={[
              'var(--accent)',
              'var(--emerald)',
              'var(--statutory)',
              'var(--sand)',
              'var(--asymmetry)',
            ]}
          />
        </motion.div>

      {!pasting ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className={cn(
            'relative rounded-xl border-2 border-dashed p-8 text-center transition-colors duration-200',
            dragging ? 'border-ink-muted card' : 'border-rule-strong card',
          )}
        >
          <Upload size={22} aria-hidden="true" className="mx-auto text-ink-faint" />
          <p className="mt-3 text-sm font-medium text-ink">{t.intake.dropHere}</p>
          <p className="mt-1 text-xs text-ink-faint">{t.intake.limits}</p>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <label className="pop-sm inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-paper">
              <FileText size={14} aria-hidden="true" />
              {t.intake.chooseFile}
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.doc,.docx,.txt,.rtf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => setPasting(true)}
              className="pop-sm rim inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-rule-strong px-4 text-sm font-medium text-ink"
            >
              <ClipboardPaste size={14} aria-hidden="true" />
              {t.intake.pasteInstead}
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <label htmlFor="paste" className="text-sm font-medium text-ink">
            {t.intake.pasteLabel}
          </label>
          <textarea
            id="paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={9}
            className="mt-2 w-full rounded-lg border border-rule card p-3.5 text-sm text-ink placeholder:text-ink-faint"
            placeholder="9.2 Service bond. The Employee shall pay..."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pasted.trim().length < 40}
              onClick={() => start({ kind: 'text', text: pasted.trim(), label: 'Pasted text' }, 'Pasted text')}
              className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-paper disabled:opacity-40"
            >
              {t.intake.readThis}
            </button>
            <button
              type="button"
              onClick={() => setPasting(false)}
              className="pop-sm rim inline-flex min-h-11 items-center rounded-lg border border-rule-strong px-4 text-sm font-medium text-ink"
            >
              {t.intake.backToUpload}
            </button>
          </div>
        </div>
      )}
      </div>

      <section aria-labelledby="samples" className="mt-9">
        <h2 id="samples" className="text-sm font-semibold text-ink">
          {t.intake.orTryOurs}
        </h2>
        <ul className="mt-3 space-y-2.5">
          {SAMPLES.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => sample(s.scenario, s.label)}
                className="pop flex w-full min-h-11 items-center justify-between gap-4 rounded-lg border border-rule card p-4 text-left"
              >
                <span>
                  <span className="block text-sm font-medium text-ink">{s.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{s.note}</span>
                </span>
                <FileText size={15} aria-hidden="true" className="shrink-0 text-ink-faint" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* The loss cliff, stated up front rather than discovered. */}
      <p className="mt-8 flex items-start gap-2 rounded-lg border border-rule card px-4 py-3 text-xs leading-relaxed text-ink-muted">
        <Clock size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-faint" />
        <span>
          {t.intake.retention}
        </span>
      </p>
    </div>
  );
}
