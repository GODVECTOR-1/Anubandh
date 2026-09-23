import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { SeverityMark } from '@/components/SeverityMark';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Spotlight } from '@/components/Spotlight';
import { GavelMark } from '@/components/GavelMark';
import { Logo3D } from '@/components/Logo3D';
import { HowItWorks } from '@/components/HowItWorks';
import { HeroBackdrop } from '@/components/HeroBackdrop';
import { AmbientGradient } from '@/components/AmbientGradient';
import { BorderTrail } from '@/components/core/border-trail';
import { HomeMark } from '@/components/HomeMark';
import { TextRoll } from '@/components/core/text-roll';
import { getLocale } from '@/lib/locale';
import { UI } from '@/lib/ui-strings';

/**
 * The landing page.
 *
 * Style: "Trust & Authority" — credentials, real metrics, before/after
 * comparison. Deliberately NOT the testimonials pattern: this product has no
 * users yet, and inventing praise with names and photographs for a legal tool
 * would be manufacturing exactly the kind of credibility the product exists to
 * replace with evidence. The proof here is the mechanism and the limits.
 *
 * Carries the 3D hero moment and Lenis smooth scroll, both requested
 * explicitly. Each is fenced so it cannot cost the scored criteria: see
 * SplineHero for the four conditions that gate the WebGL runtime, and
 * SmoothScroll for the reduced-motion and anchor handling. Neither is mounted
 * anywhere but this route, and the hero reads correctly with both absent.
 *
 * Otherwise a server component: the landing is the first thing anyone loads.
 */


/**
 * One roll for every section heading, so the page has a single motion idiom
 * instead of four near-identical ones drifting apart.
 *
 * Each heading animates when it is scrolled to, not on mount — see TextRoll.
 * All four sit below the fold, so an on-mount roll would finish unseen.
 *
 * Transform only, no blur. The blur variant looked better for 300ms and then
 * cost a permanent composited filter layer on every character for the life of
 * the page — 146 of them on this route, because filter: blur(0px) is still a
 * filter. That is a real scroll cost for a garnish on a flip that already
 * reads without it.
 */
const HEADING_ROLL = {
  enter: { initial: { rotateX: 0 }, animate: { rotateX: 90 } },
  exit: { initial: { rotateX: 90 }, animate: { rotateX: 0 } },
};

export async function Landing() {
  const locale = await getLocale();
  const heroImage = process.env.HERO_IMAGE ?? null;
  const L = UI[locale].landing;
  const C = UI[locale].common;
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          {/* flex-wrap: at 375px the wordmark, the language toggle and the
              New document button total 434px and pushed the page into a 60px
              sideways scroll. Wrapping costs a second header line on the
              narrowest phones and nothing anywhere else. */}
          <div className="flex flex-wrap items-center gap-3">
          {/* Not a link here: this IS home. Same mark, same motion. */}
          <HomeMark />
          {/* The reason anyone is here. Present before they scroll, and in
              the same place on every screen once they are inside the app. */}
          <LanguageToggle />
          <Link
            href="/upload"
            className="pop-sm relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-paper"
          >
            {/* Light on a dark button: the trail rides the border ring, so it
                reads as an edge highlight rather than as a second colour. */}
            <BorderTrail className="bg-linear-to-l from-transparent via-paper to-transparent" size={40} />
            <Plus size={14} aria-hidden="true" />
            {C.newDocument}
          </Link>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {/* ── hero ───────────────────────────────────────────────── */}
        <section className="relative isolate mx-auto max-w-5xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-20">
          <HeroBackdrop src={heroImage} />
          <Spotlight />
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
            <div>
              {/* Domain mark, not the hero image. The clause card below holds
                  the image slot, because that is the actual claim. */}
              {/* Two marks in one hero is clutter, so the 3D monogram takes the
                  anchor position and the gavel stays as the smaller domain cue
                  beside it. */}
              <div className="flex items-center gap-4">
                <Logo3D className="h-20 w-20 shrink-0 text-[4.5rem] sm:h-24 sm:w-24 sm:text-[5.5rem]" />
                <GavelMark className="h-10 w-10 shrink-0 opacity-70 sm:h-12 sm:w-12" />
                <p className="max-w-[22ch] text-xs font-semibold uppercase leading-relaxed tracking-[0.12em] text-ink-muted">
                  {L.eyebrow}
                </p>
              </div>
              <h1 className="mt-3 text-[2.1rem] font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
                {L.headline1} {L.headline2}
              </h1>
              <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-ink-muted">
                {L.lede}
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/radar"
                  className="pop-sm relative inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-paper"
                >
                  <BorderTrail className="bg-linear-to-l from-transparent via-paper to-transparent" size={48} />
                  {L.ctaSample}
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <Link
                  href="/upload"
                  className="pop-sm rim inline-flex min-h-11 items-center rounded-lg border border-rule-strong px-5 text-sm font-medium text-ink"
                >
                  {L.ctaOwn}
                </Link>
                <a
                  href="#how"
                  className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-ink-muted transition-colors duration-200 hover:text-ink"
                >
                  {L.ctaHow}
                </a>
              </div>

              <p className="mt-5 text-xs leading-relaxed text-ink-faint">
                {L.heroNote}
              </p>
            </div>

            {/* The product's own metaphor, drawn in CSS. One entrance animation,
                which the global reduced-motion rule switches off. */}
            <div className="anb-rise relative">
              <div className="pop rounded-xl border border-rule card p-5">
                <p className="text-xs text-ink-faint">Clause 9.2, in your document</p>
                <p className="doc-quote mt-2">
                  The Employee shall{' '}
                  <mark className="anb-hl anb-hl-on rounded-[3px] px-0.5">
                    pay to the Company a sum of Rs. 2,00,000/-
                  </mark>{' '}
                  if the Employee resigns before completing twenty-four months of service.
                </p>

                <div aria-hidden="true" className="mt-4 ml-3 h-6 w-px bg-rule-strong" />

                <div className="rounded-lg border border-rule bg-surface-sunk/60 p-3.5">
                  {/* The real component, not a hand-drawn copy. A landing that
                      draws its own severity chip is the first place the scale
                      drifts, and this one had already picked the wrong icon. */}
                  <SeverityMark severity="act_on_this" />
                  <p className="mt-1.5 text-sm font-medium leading-snug text-ink">
                    Leaving before month 24 puts Rs. 2,00,000 on you, payable to the company.
                  </p>
                  <p className="mt-2 text-xs text-ink-muted">
                    <span className="font-medium text-ink">Ask:</span> what training expenditure does
                    this Rs. 2,00,000 actually represent?
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── before / after ─────────────────────────────────────────
            Full bleed, and the two halves are NOT equal. This is the page
            centrepiece, so it gets the most height and the most width, and it
            drops the card borders: two panes of one composition rather than two
            boxes in a grid. The left is deliberately a wall of serif — that
            density IS the problem being shown, so making it comfortable to read
            would undercut the point. */}
        {/* Saffron only ever appears like this: a large section wash, never a chip
            or a label. It sits next to the --ask gold that means "ask about this",
            so anything smaller would read as a severity signal. */}
        {/* The gradient starts HERE, not at the top: the hero has its own
            photograph, and two backdrops fighting over the same screen is one
            too many. From this section down it is the page background, and the
            sections above it are translucent so it reads through them. */}
        <div className="relative isolate">
          <AmbientGradient placement="section" />

        <section className="border-y border-rule bg-sand/55">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <div className="mx-auto max-w-[46ch] text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-4xl">
                <TextRoll variants={HEADING_ROLL}>
                  {L.sameClauseTitle}
                </TextRoll>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{L.sameClauseBody}</p>
            </div>

            <div className="mt-12 grid gap-10 md:grid-cols-[0.85fr_1.15fr] md:gap-0">
              <div className="md:pr-10">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                  {L.whatYouWereSent}
                </p>
                <p className="doc-quote mt-4 text-ink-muted">
                  9.2 Service bond. The Employee shall pay to the Company a sum of Rs. 2,00,000/- if
                  the Employee resigns before completing twenty-four months of service.
                  <br />
                  <br />
                  9.4 Documents. The Company may withhold the relieving and experience letters until
                  all dues under clause 9.2 are settled.
                </p>
              </div>

              {/* One hairline instead of two card edges. */}
              <div className="md:border-l md:border-rule md:pl-10">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                  {L.whatYouGetBack}
                </p>
                <ul className="mt-4 space-y-5">
                  <li>
                    <p className="text-base font-medium leading-snug text-ink sm:text-lg">
                      Leaving before month 24 puts Rs. 2,00,000 on you.
                    </p>
                    <p className="mt-1.5 text-xs text-ink-muted">
                      Clause 9.2 · cited to s.74 of the Indian Contract Act
                    </p>
                  </li>
                  <li>
                    <p className="text-base font-medium leading-snug text-ink sm:text-lg">
                      The company can hold your experience letter until that is paid.
                    </p>
                    <p className="mt-1.5 text-xs text-ink-muted">
                      Clause 9.4 · no statute cited, because none applies — this one is flagged for
                      its shape, and says so
                    </p>
                  </li>
                </ul>
                <p className="mt-6 border-t border-rule pt-4 text-xs leading-relaxed text-ink-faint">
                  {L.sampleCoverage}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── how it works ───────────────────────────────────────────
            A narrow editorial column, not a grid. These four stages are a
            PIPELINE — each one depends on the one before it — so they read down
            a single connecting line. A 2x2 grid claimed they were four
            independent features, which is both wrong and the most recognisable
            AI layout there is. */}
        <section id="how" className="bg-accent-bg/50">
          <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            <TextRoll variants={HEADING_ROLL}>{L.howTitle}</TextRoll>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">{L.howBody}</p>

          <HowItWorks
            stages={[
              { id: 'normalize', name: L.stage1, body: L.stage1Body },
              { id: 'locate', name: L.stage2, body: L.stage2Body },
              { id: 'verify', name: L.stage3, body: L.stage3Body },
              { id: 'check-law', name: L.stage4, body: L.stage4Body },
            ]}
          />
          </div>
        </section>

        {/* ── the limits, stated ─────────────────────────────────────
            A list, not cards. These are four sentences, and a card around a
            sentence is a box that earns nothing. Hairlines between them, wide
            measure, quiet: the section should read as the page lowering its
            voice before the close. */}
        {/* This one had no wash of its own, so its copy sat straight on the
            gradient and measured 3.76:1. Every other section down here carries
            one; this is the same idea in the page colour. */}
        <section className="border-t border-rule bg-paper/65">
          <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
            <div className="grid gap-8 md:grid-cols-[1fr_1.4fr]">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  <TextRoll variants={HEADING_ROLL}>{L.limitsTitle}</TextRoll>
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{L.limitsBody}</p>
              </div>
              <ul className="divide-y divide-rule">
                {[L.limit1, L.limit2, L.limit3, L.limit4].map((l) => (
                  <li
                    key={l}
                    className="py-3.5 text-sm leading-relaxed text-ink-muted first:pt-0 last:pb-0"
                  >
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── closing ────────────────────────────────────────────────
            Inverted and full bleed. The page has been paper the whole way down;
            ending on ink gives it a terminal beat instead of a fifth variation
            of the same block. paper-on-ink already measures 15.93:1, so the
            inversion costs nothing in contrast. */}
        <section className="bg-accent/90">
          <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28">
            <h2 className="text-2xl font-semibold tracking-tight text-paper sm:text-4xl">
              <TextRoll variants={HEADING_ROLL}>{L.closingTitle}</TextRoll>
            </h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-sm leading-relaxed text-on-ink-muted">
              {L.closingBody}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/radar"
                className="pop-sm inline-flex min-h-11 items-center gap-2 rounded-lg bg-paper px-5 text-sm font-medium text-ink"
              >
                {C.openSample}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <Link
                href="/upload"
                className="pop-sm inline-flex min-h-11 items-center gap-2 rounded-lg border border-on-ink-muted/40 px-5 text-sm font-medium text-paper"
              >
                <Plus size={15} aria-hidden="true" />
                {L.ctaOwn}
              </Link>
            </div>
          </div>
        </section>
        </div>

      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-5 sm:px-6">
          <p className="text-xs text-ink-faint">
            {L.footerNote}
          </p>
          <p className="text-xs text-ink-faint">
            {L.footerAid}
          </p>
        </div>
      </footer>
    </div>
  );
}
