'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, LifeBuoy, Scale, Search, SendHorizontal } from 'lucide-react';
import type { AnalysisPayload, AskResponse } from '@/contracts/schema';
import { ask, seedQuestions } from '@/lib/ask';
import { useUi } from '@/components/LocaleProvider';
import { BorderTrail } from '@/components/core/border-trail';
import { TextShimmerWave } from '@/components/core/text-shimmer-wave';
import { PageHeadingRoll } from '@/components/core/page-heading-roll';

/**
 * Four renderings, one per outcome. The classifier decides which; this file
 * decides only how each one looks, and the ADVICE case is the one that matters:
 * reframe first, handoff second, never a bare refusal.
 */
/**
 * The answer now comes from POST /api/ask, which is where the advice boundary
 * is enforced. A boundary the client draws is one anyone can step over with
 * curl, so the server classifies and the server is authoritative.
 *
 * The one thing still decided locally is ESCALATE, and deliberately: someone
 * typing "I have a court date on Friday" should see a legal-aid number without
 * waiting on a network round trip. It only ever ADDS an interstitial, so a
 * local false positive costs a dismissable screen rather than a wrong answer.
 */

/**
 * The floor on how long the waiting state stays up.
 *
 * The round trip is twenty milliseconds on a local machine and seconds on a
 * phone on mobile data. Without a floor the waiting message flashes and is gone
 * before it can be read — a blink that reads as a glitch rather than as work —
 * and the screen reader announcement it carries is cancelled before it is
 * spoken. Same reasoning as the per-stage dwell on intake: a state worth
 * showing is worth showing long enough to see.
 */
const MIN_WAIT_MS = 450;

export function Ask({ analysis }: { analysis: AnalysisPayload }) {
  const t = useUi();
  const [draft, setDraft] = useState('');
  const [response, setResponse] = useState<AskResponse | null>(null);
  // An escalation the reader has stepped past. A false positive is the LIKELY
  // path here, so without an exit a wrong guess traps them on a legal-aid
  // screen and the product is worse than useless to them.
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  /** Monotonic request id. Responses that are not the newest are discarded. */
  const latest = useRef(0);

  // Nothing in flight may write state after unmount.
  useEffect(() => () => { latest.current = -1; }, []);

  const submit = (question: string) => {
    const q = question.trim();
    if (!q) return;
    // Classified locally first, so that an escalation interrupts immediately and
    // never depends on the network. The server's answer replaces this one.
    const local = ask(analysis, q);
    setDismissed(false);
    setResponse(local.outcome === 'escalate' ? local : null);
    setDraft('');
    setPending(true);

    const seq = ++latest.current;
    const startedAt = Date.now();
    void (async () => {
      let answer = local;
      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question: q, document_id: analysis.document.id }),
        });
        const body = await res.json();
        if (res.ok && body?.outcome) answer = body;
      } catch {
        // The network failed. The local classification is what we have, and it
        // is the conservative one: it never widens a claim, it only fails to
        // find a citation the server might have found.
      }

      const remaining = MIN_WAIT_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));

      // A second question asked while the first was in flight: the older answer
      // must not land on top of the newer one.
      if (seq !== latest.current) return;
      setResponse(answer);
      setPending(false);
    })();
  };

  const seeds = seedQuestions(analysis);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        <PageHeadingRoll>{t.ask.title}</PageHeadingRoll>
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        {t.ask.subtitle}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
        className="mt-5"
      >
        <label htmlFor="ask-input" className="sr-only">
          {t.ask.inputLabel}
        </label>
        <div className="flex gap-2">
          <input
            id="ask-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t.ask.placeholder}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-rule card px-3.5 text-sm text-ink placeholder:text-ink-faint"
          />
          <button
            type="submit"
            disabled={!draft.trim() || pending}
            className="pop-sm relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-paper disabled:opacity-40"
          >
            {/* Lit while a question is typed and unanswered, dark once the
                answer is on screen.

                The condition is the draft, not a pending flag, because ask()
                is synchronous local classification: there is no latency here
                to report, and inventing a spinner for work that already
                finished would be theatre. submit() clears the draft, so the
                trail goes out at the same moment the answer appears, and comes
                back when the next question is typed. When the real model call
                lands this should key off that request instead. */}
            {(draft.trim().length > 0 || pending) && (
              <BorderTrail
                className="bg-linear-to-l from-transparent via-paper to-transparent"
                size={44}
              />
            )}
            <SendHorizontal size={14} aria-hidden="true" />
            {t.ask.submit}
          </button>
        </div>
      </form>

      {/* The wait.

          role=status announces it once, and the shimmer characters are
          aria-hidden with the sentence repeated in a hidden copy, so nobody
          hears it spelled out. The copy names what the delay is BUYING — this
          is a person reading a document that worries them, and a bare spinner
          tells them only that something is taking time. */}
      {pending && (
        <p role="status" aria-live="polite" className="mt-6 text-sm">
          <TextShimmerWave
            duration={1}
            spread={1}
            zDistance={1}
            scaleDistance={1.1}
            rotateYDistance={20}
          >
            {t.ask.thinking}
          </TextShimmerWave>
        </p>
      )}

      {/* A blank Q&A box is the cheapest way to make a surface feel dead, and
          the reader already has these questions. */}
      {!response && !pending && (
        <div className="mt-5">
          <p className="text-xs uppercase tracking-wider text-ink-faint">{t.ask.tryOne}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {seeds.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => submit(s)}
                  className="pop-sm rim inline-flex min-h-11 items-center rounded-full border border-rule card px-4 text-xs text-ink-muted hover:text-ink"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {response && (
        <div aria-live="polite" className="mt-6">
          <p className="text-xs uppercase tracking-wider text-ink-faint">{t.ask.youAsked}</p>
          <p className="mt-1 text-sm font-medium text-ink">{response.question}</p>

          {/* ── ESCALATE: interrupts, contacts before prose, explicit exit ── */}
          {response.outcome === 'escalate' && response.escalation && !dismissed && (
            <section
              role="alert"
              className="mt-3.5 rounded-lg border border-reduced/50 bg-reduced-bg p-4 sm:p-5"
            >
              <h2 className="flex items-center gap-2 text-base font-semibold text-reduced">
                <LifeBuoy size={16} aria-hidden="true" />
                {t.ask.talkFirst}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">{response.escalation.reason}</p>

              <ul className="mt-3 space-y-2">
                {response.escalation.contacts.map((c) => (
                  <li key={c.name} className="rounded-md border border-rule card p-3">
                    <p className="text-sm font-medium text-ink">{c.name}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{c.detail}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-3.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  className="pop-sm rim inline-flex min-h-11 items-center rounded-md border border-rule-strong px-4 text-xs font-medium text-ink"
                >
                  {t.ask.continueToAnalysis}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDismissed(true);
                    setResponse(null);
                  }}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-xs text-ink-muted hover:underline"
                >
                  {t.ask.notApplicable}
                </button>
              </div>
            </section>
          )}

          {/* Stepping past the interstitial arrives at the reading, not at a
              blank screen. A false positive is the likely path here, and an
              exit that leads nowhere strands the reader it exists for. */}
          {response.outcome === 'escalate' && dismissed && (
            <section className="mt-3.5 rounded-lg border border-rule card p-4 sm:p-5">
              <p className="text-sm leading-relaxed text-ink">{response.answer}</p>
              <Citations response={response} />
              <p className="mt-3.5 border-t border-rule pt-2.5 text-xs text-ink-muted">
                {t.ask.contactsLater}
              </p>
            </section>
          )}

          {/* ── ADVICE: reframe, then handoff. The refusal is never the lead. ── */}
          {response.outcome === 'advice' && (
            <section className="mt-3.5 rounded-lg border border-rule card p-4 sm:p-5">
              <p className="text-sm leading-relaxed text-ink">{response.answer}</p>
              {response.handoff && (
                <p className="mt-3 rounded-md border border-ask/40 bg-ask-bg px-3.5 py-2.5 text-sm leading-relaxed text-ask">
                  {response.handoff}
                </p>
              )}
              <Citations response={response} />
              <Link
                href="/prepare"
                className="mt-3.5 inline-flex items-center gap-1.5 text-sm font-medium text-statutory hover:underline"
              >
                {t.ask.getQuestionList}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </section>
          )}

          {/* ── INFORMATION: answer with citation chips ── */}
          {response.outcome === 'information' && (
            <section className="mt-3.5 rounded-lg border border-rule card p-4 sm:p-5">
              <p className="text-sm leading-relaxed text-ink">{response.answer}</p>
              <Citations response={response} />
            </section>
          )}

          {/* ── NO COVERAGE: what we did extract, and how many we dropped ── */}
          {response.outcome === 'no_coverage' && (
            <section className="mt-3.5 rounded-lg border border-dashed border-rule card p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Search size={14} aria-hidden="true" />
                {t.ask.notExtracted}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{response.answer}</p>
              <Link
                href="/document"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-statutory hover:underline"
              >
                {t.ask.readFullText}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </section>
          )}
        </div>
      )}

      <p className="mt-8 text-xs leading-relaxed text-ink-faint">
        {t.ask.advocatesAct}
      </p>
    </div>
  );
}

/** Citation chips. Each opens the split view at the exact words. */
function Citations({ response }: { response: AskResponse }) {
  const t = useUi();
  if (response.citations.length === 0) return null;
  return (
    <ul className="mt-3.5 space-y-2">
      {response.citations.map((c) => (
        <li key={c.node_id}>
          <Link
            href={{ pathname: '/document', query: { clause: c.node_id } }}
            className="pop block rounded-md border border-rule bg-surface-sunk/50 p-3"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-statutory">
              <Scale size={11} aria-hidden="true" />
              {c.clause_label ? t.ask.inYourDocument + ' · ' + c.clause_label : t.ask.inYourDocument}
            </span>
            <span className="doc-quote mt-1 block">{c.quoted_text}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
