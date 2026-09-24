import 'server-only';
import { z } from 'zod';
import { NodeKind, TemporalScope, FlagBasis, Severity } from '@/contracts/schema';
import { PipelineError } from '@/lib/pipeline-error';

/**
 * The model boundary. Two narrow calls, never one mega-prompt.
 *
 * Each has one job, a strict output schema, and is validated with zod on the
 * way back. A single prompt asked to extract and rank at once fails as a unit:
 * one bad field and the whole document is unreadable, with no way to tell which
 * of the two tasks went wrong.
 *
 * The model returns `quoted_text` and NOTHING positional. Character offsets are
 * computed by LOCATE against our own normalized text (lib/pipeline.ts), because
 * language models do not produce trustworthy character positions and a design
 * that assumes they do has no grounding guarantee at all.
 */

/**
 * A LIST, in preference order, and every entry is an alias rather than a pin.
 *
 * Three separate things forced this shape, all of them measured rather than
 * imagined:
 *
 *   - A pinned `gemini-2.5-flash` stopped being served to new API keys. Every
 *     call returned 404 while the model still appeared in the key's own model
 *     listing, so nothing about the failure pointed at the cause.
 *   - The free tier's request quota is PER MODEL PER DAY. Exhausting one
 *     model's quota returns 429 while the next model answers immediately.
 *   - Capacity is per model too. A model can return 503 "experiencing high
 *     demand" four times in a row while another serves the same prompt in
 *     eight seconds.
 *
 * So a transient failure moves to the NEXT model rather than asking the same
 * one again. Retrying a model that has no quota left is just waiting.
 * GEMINI_MODEL overrides the list, comma-separated, best first.
 *
 * Six deep, because three was not enough. Measured on 2026-09-24 during a
 * demand spike: flash-latest, 3.1-flash-lite and flash-lite-latest all 503,
 * 3.6-flash took 58s to say "ok", 3.5-flash 12s and 3-flash-preview 27s. With
 * only the first three in the list, both attempts of a real upload spent their
 * whole budget on 503s and one slow model, and the reader was told we stopped
 * at ninety seconds. A 503 costs about a second, so a longer list is cheap to
 * walk; ordered so the slowest responder is asked after the quick ones.
 */
const DEFAULT_MODELS = [
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
];

/** `||` and not `??`: the env template ships `GEMINI_MODEL=` with no value, and
 *  `??` keeps an empty string — which split and filtered down to an empty list
 *  and put the literal string "undefined" in the request URL. */
const configured = (process.env.GEMINI_MODEL || '').split(',').map((m) => m.trim()).filter(Boolean);
const MODELS = configured.length > 0 ? configured : DEFAULT_MODELS;
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
/** A ceiling on one attempt, not the budget. The budget is the deadline the
 *  caller passes, and the caller is the one that knows how much of it this
 *  particular call is allowed to spend. */
const CALL_TIMEOUT_MS = 40_000;
/** Below this there is no point starting another attempt. */
const MIN_ATTEMPT_MS = 4_000;

/** Google's own words on a 503 here are "spikes in demand are usually
 *  temporary, please try again later", and in practice a second attempt
 *  succeeds. This is NOT the retry the spec forbids: that one is re-rolling a
 *  response that failed VALIDATION until it happens to pass, which launders a
 *  bad answer into a good-looking one. Retrying a request that was never
 *  served launders nothing.
 *
 *  Two passes over the list. The first costs about a second a model; the
 *  second waits between attempts, and the deadline, not this number, is what
 *  ends it. One pass gave up nine seconds into a thirty-five second budget. */
const MAX_ATTEMPTS = 12;

/**
 * Not every model accepts `thinkingConfig`, and the ones that refuse it answer
 * 400 "Request contains an invalid argument" with no field named — so there is
 * nothing to branch on but the outcome. Dropped on the first 400 and remembered
 * for the life of the process, rather than maintained as a support matrix that
 * would be wrong the week after it was written.
 */
const rejectsThinkingConfig = new Set<string>();
/** 0.6s, 1.2s, 2.4s, 4.8s … capped. Bounded by the deadline either way. */
const backoff = (attempt: number) => Math.min(600 * 2 ** (attempt - 1), 5_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Wait only before going BACK to a model already asked. Moving on to a
 *  different model needs no breather, and every sleep comes out of the same
 *  budget the answer has to fit in: with the old unconditional backoff, four
 *  quick 503s cost nine seconds of a thirty-five second extraction. */
const pause = (attempt: number) =>
  attempt >= MODELS.length ? sleep(backoff(attempt - MODELS.length + 1)) : Promise.resolve();

/* ─────────────────────── schemas: generated, not retyped ─────────────────────── */

/** One extracted obligation. `quoted_text` is the contract and everything else
 *  is commentary — an item whose quote we cannot find in the document is
 *  dropped whole, however good the commentary looked. */
export const ExtractedItem = z.object({
  id: z.string(),
  kind: NodeKind,
  temporal_scope: TemporalScope,
  /** 8–20 words. The minimal DISTINCTIVE span, never the whole clause: long
   *  quotes fail exact matching far more often than short ones do. */
  quoted_text: z.string(),
  clause_label: z.string(),
  summary: z.string(),
  /* The remaining fields populate GraphNode.fields, whose keys lib/describe.ts
   * already reads. Flat and always present, because a nested optional union is
   * the shape Gemini's responseSchema most often fails to honour — and an
   * absent key would read as a claim that the document is silent. */
  amount_text: z.string(),
  payer: z.string(),
  trigger: z.string(),
  restrained: z.string(),
  duration_months: z.number(),
  action: z.string(),
  holder: z.string(),
  notice_days: z.number(),
  in_lieu: z.string(),
  deadline_days: z.number(),
  gates: z.string(),
});
export const Extraction = z.object({ items: z.array(ExtractedItem) });

export const ProposedFlag = z.object({
  node_id: z.string(),
  basis: FlagBasis,
  severity: Severity,
  consequence: z.string(),
  what_to_ask: z.string(),
  reason: z.string(),
  /** Statutory flags only, and only ever from the closed list in the prompt. A
   *  section we cannot resolve is dropped as `entail_failed`, never softened. */
  statute_section_id: z.string(),
});
export const Flagging = z.object({ flags: z.array(ProposedFlag) });

/**
 * Gemini's responseSchema is a narrow subset of OpenAPI 3.0: no $ref, no
 * additionalProperties, no $schema. Generating it from the zod schema above and
 * stripping what Gemini rejects keeps ONE definition. Two hand-maintained
 * schemas that must agree is how a dead card at hour 30 happens.
 */
export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7', io: 'output' }) as Record<string, unknown>;
  const defs = (json.$defs ?? {}) as Record<string, Record<string, unknown>>;

  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk);
    if (!n || typeof n !== 'object') return n;
    const node = { ...(n as Record<string, unknown>) };

    if (typeof node.$ref === 'string') {
      const key = node.$ref.replace('#/$defs/', '');
      return walk(defs[key] ?? {});
    }
    for (const k of ['$schema', '$defs', 'additionalProperties', 'default', 'const', 'exclusiveMinimum']) {
      delete node[k];
    }
    if (node.properties) {
      const props = node.properties as Record<string, unknown>;
      node.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, walk(v)]));
      // Gemini honours field order; matching the declared order keeps the
      // model from reordering keys and tripping the parse.
      node.propertyOrdering = Object.keys(props);
    }
    if (node.items) node.items = walk(node.items);
    if (node.type === 'integer') node.type = 'number';
    return node;
  };

  return walk(json) as Record<string, unknown>;
}

/* ──────────────────────────────── the call ──────────────────────────────── */

type Part = { text: string };

/**
 * `deadline` is the JOB's deadline, threaded all the way down.
 *
 * Without it each call owned its own budget and retried on its own schedule,
 * and three calls that each believed they had a minute overran a job that had
 * ninety seconds in total — the run finished its extraction and then failed,
 * having done all the work and thrown it away. The deadline is the real
 * constraint, so it is the one every attempt is measured against.
 */
async function generate(
  prompt: string,
  schema: z.ZodType,
  maxTokens: number,
  deadline: number,
): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new PipelineError('internal', 'GEMINI_API_KEY is not set');

  let transient: PipelineError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const model = MODELS[(attempt - 1) % MODELS.length];
    const sendThinkingConfig = !rejectsThinkingConfig.has(model);
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) throw transient ?? new PipelineError('upstream_timeout');
    let res: Response;
    try {
      res = await fetch(ENDPOINT + model + ':generateContent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        signal: AbortSignal.timeout(Math.min(CALL_TIMEOUT_MS, remaining)),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
            responseSchema: toGeminiSchema(schema),
            // Gemini 3 spends output budget on thinking BEFORE it writes a
            // token of the answer, and that spend counts against
            // maxOutputTokens. Left on, a one-line classification came back
            // `MAX_TOKENS` with an empty answer, which this file would have
            // reported as `response_truncated` — a real failure with a
            // misleading cause. Copying a quote out of a document is not a
            // reasoning task, so the budget is better spent on the quote.
            ...(sendThinkingConfig ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
      });
    } catch (e) {
      // Network only — no document text passes through here, so the cause is
      // safe to log and is otherwise lost entirely.
      const name = (e as Error)?.name ?? 'Error';
      console.error('gemini ' + model + ' attempt ' + attempt + ' failed:', name, String((e as Error)?.message).slice(0, 100));
      transient = new PipelineError('upstream_timeout', name);
      if (attempt < MAX_ATTEMPTS && deadline - Date.now() > MIN_ATTEMPT_MS) { await pause(attempt); continue; }
      throw transient;
    }

    if (res.status === 429 || res.status === 503 || res.status === 504) {
      // Logged, because "upstream_timeout" on its own sent us looking for a
      // slow network when the real answer was three straight 503s. Status and
      // attempt only — no prompt, no document text.
      console.error('gemini ' + res.status + ' from ' + model + ' (attempt ' + attempt + '/' + MAX_ATTEMPTS + ')');
      transient = new PipelineError(res.status === 429 ? 'rate_limited' : 'upstream_timeout');
      if (attempt < MAX_ATTEMPTS && deadline - Date.now() > MIN_ATTEMPT_MS) { await pause(attempt); continue; }
      throw transient;
    }

    if (!res.ok) {
      // The body says WHY. A bare status sent us looking for a network fault
      // when the real answer was "this model is no longer available to new
      // users" — which is a one-line fix once you can read it.
      const detail = await res.text().catch(() => '');

      // A model retired under us is not a failed document. 2.5-flash went this
      // way: 404 "no longer available to new users" while still in the key's
      // own listing. Move on to the next model; only a list with nothing left
      // in it fails the run.
      if (res.status === 404) {
        console.error('gemini 404 from ' + model + ' (attempt ' + attempt + '/' + MAX_ATTEMPTS + ')');
        transient = new PipelineError('internal', 'gemini ' + model + ' is not available');
        continue;
      }

      // The model rejects thinkingConfig. Drop it and try once more, rather
      // than failing a document over a field we only sent as an optimisation.
      if (res.status === 400 && sendThinkingConfig) {
        rejectsThinkingConfig.add(model);
        console.error('gemini ' + model + ' rejected thinkingConfig; retrying without it');
        // The SAME model, and the attempt does not count: it answered, so it
        // has capacity. A bare `continue` moved to the next model and never
        // asked the one that had just proved it was up. Cannot loop, because
        // the model is now in rejectsThinkingConfig.
        attempt--;
        continue;
      }

      throw new PipelineError('internal', 'gemini HTTP ' + res.status + ' ' + detail.replace(/\s+/g, ' ').slice(0, 200));
    }

    return readResponse(await res.json(), schema);
  }

  throw transient ?? new PipelineError('upstream_timeout');
}

function readResponse(body: unknown, schema: z.ZodType): unknown {
  const b = body as {
    candidates?: Array<{ finishReason?: string; content?: { parts?: Part[] } }>;
    promptFeedback?: { blockReason?: string };
  };

  if (b.promptFeedback?.blockReason) throw new PipelineError('model_refusal');

  const candidate = b.candidates?.[0];
  if (!candidate) throw new PipelineError('model_refusal');

  const finish = candidate.finishReason ?? 'STOP';
  if (finish === 'MAX_TOKENS') throw new PipelineError('response_truncated');
  if (finish !== 'STOP') throw new PipelineError('model_refusal');

  const text = (candidate.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text.trim()) throw new PipelineError('model_refusal');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Valid JSON that stops early is truncation; anything else is a shape we
    // do not trust. Neither is a retry loop that eventually gets lucky.
    throw new PipelineError(text.trimEnd().endsWith('}') ? 'schema_validation' : 'response_truncated');
  }

  const checked = schema.safeParse(parsed);
  if (!checked.success) throw new PipelineError('schema_validation', checked.error.message.slice(0, 300));
  return checked.data;
}

/* ──────────────────────────────── prompts ──────────────────────────────── */

const BOUNDARY = `
You are a document reader, not a lawyer. You state what a document says. You
never advise, predict an outcome, or say whether something is enforceable.
Never use the words "void", "unenforceable", "illegal", or "you should".
`.trim();

/**
 * CALL 1 — obligations, each with its verbatim quote.
 *
 * The prompt asks for a SHORT quote for a measurable reason: long quotes fail
 * exact matching far more often, and every failure here is a dropped item the
 * reader never sees. §11 names this as the highest-risk assumption in the whole
 * design, so the instruction is stated three ways rather than once.
 */
export async function extract(text: string, deadline: number): Promise<z.infer<typeof Extraction>> {
  const out = await generate(
    `${BOUNDARY}

Extract every obligation, restraint, right, deadline, money amount, condition
and termination path from the document below.

RULES — the quote is the whole point:
- "quoted_text" MUST be copied CHARACTER FOR CHARACTER from the document.
  Copy it; do not retype it, correct it, expand an abbreviation, or tidy
  punctuation. If you cannot copy a span exactly, omit the item entirely.
- Keep the quote to 8-20 words: the shortest span that is still distinctive.
  Do not quote a whole clause.
- Choose a span that appears ONCE in the document. A phrase repeated in several
  clauses cannot be tied back to this one.
- "clause_label" is the document's own numbering if it has any ("9.2"), else "".
- "temporal_scope": use post_employment ONLY for a restraint that operates
  AFTER employment ends, during_employment for one that operates while it is
  running, not_applicable for anything that is not a restraint, unclear if the
  document genuinely does not say. This distinction changes which law applies,
  so do not guess it.
- "amount_text" verbatim including currency and punctuation ("Rs. 2,00,000/-"),
  or "" if the item is not about money. Never a number you computed. The digits
  in it must appear in "quoted_text" — a number read off elsewhere is dropped.
- "summary" is one plain sentence a non-lawyer can read.

FIELDS, by kind. Fill the ones that apply and leave the rest "" or 0:
- Money        → amount_text, payer ("employee"/"company"), trigger (what sets it off)
- Restraint    → restrained (what you may not do), duration_months
- Obligation   → action (what you may be required to do)
- Right        → holder (which party holds the power)
- TerminationPath → notice_days, in_lieu (what may be paid instead), holder
- Deadline     → deadline_days, gates (what the clock runs on)

DOCUMENT:
"""
${text.slice(0, 60_000)}
"""`,
    Extraction,
    16384,
    deadline,
  );
  return out as z.infer<typeof Extraction>;
}

/**
 * CALL 2 — severity and basis for items we have already LOCATED.
 *
 * It only ever sees located items, so a flag can never attach to a span that
 * failed verification. `statute_section_id` is drawn from a closed list passed
 * in by the caller; anything outside it fails to resolve and the flag is
 * dropped as `entail_failed` rather than cited loosely.
 */
export async function flag(
  items: Array<{ id: string; kind: string; temporal_scope: string; quoted_text: string; summary: string }>,
  sections: Array<{ section_id: string; act: string; section: string; applies_to: string }>,
  deadline: number,
): Promise<z.infer<typeof Flagging>> {
  const out = await generate(
    `${BOUNDARY}

For each extracted item below, decide whether it is worth the reader's
attention, and why.

"basis":
- "statutory" ONLY when one of the listed sections genuinely bears on the item.
  Put its exact section_id in "statute_section_id".
- "asymmetry" when the clause gives one party a power the other does not have.
  These cite NO statute: leave "statute_section_id" as "". An asymmetry flag
  that borrows a citation implies that cited means severe, and that is exactly
  the confusion the two bases exist to prevent.

"severity": act_on_this (money or a deadline the reader must handle),
ask_about_this (raise it before signing), know_about_this (worth knowing).

"consequence": ONE plain sentence on what this means for the reader, in the
second person. No verdict language.
"what_to_ask": a question the reader can put to the other party or a lawyer.
"reason": for asymmetry, the computed observation. For statutory, "".

Omit any item that is unremarkable. Not every clause is a flag.

SECTIONS AVAILABLE:
${sections.map((s) => `- ${s.section_id} (${s.act} ${s.section}) — applies to: ${s.applies_to}`).join('\n')}

ITEMS:
${items.map((i) => `- ${i.id} [${i.kind}, ${i.temporal_scope}] "${i.quoted_text}" — ${i.summary}`).join('\n')}`,
    Flagging,
    4096,
    deadline,
  );
  return out as z.infer<typeof Flagging>;
}

export const hasGemini = () => !!process.env.GEMINI_API_KEY;
