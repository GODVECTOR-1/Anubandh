'use client';

import { ChevronRight } from 'lucide-react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/core/accordion';

type Stage = { id: string; name: string; body: string };

/**
 * The four verification stages, as an accordion on the connecting line.
 *
 * The numbered rail stays: these stages are a pipeline, each one depending on
 * the last, and collapsing them must not turn the sequence back into a list of
 * four unrelated features.
 *
 * The first panel opens by default. This section's whole job is to explain the
 * mechanism, and a fully-collapsed version shows four headings and no argument
 * — which is the opposite of what a section called "why you can check us" is
 * for. One open panel keeps the claim on screen and still lets the rest fold
 * away.
 *
 * Strings arrive as props rather than being read here, because the locale lives
 * in a cookie the server reads and this component is client-side.
 */
export function HowItWorks({ stages }: { stages: Stage[] }) {
  return (
    <Accordion
      className="mt-10 flex w-full flex-col border-l border-rule pl-8"
      defaultValue={stages[0]?.id ?? null}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      variants={{
        expanded: { opacity: 1, scale: 1 },
        collapsed: { opacity: 0, scale: 0.94 },
      }}
    >
      {stages.map((s, i) => (
        <AccordionItem key={s.id} value={s.id} className="relative py-3">
          {/* The number sits ON the rail, so the sequence is the structure. */}
          <span
            aria-hidden="true"
            className="absolute -left-[2.3rem] top-3.5 flex h-6 w-6 items-center justify-center rounded-full bg-paper text-xs font-semibold text-ink-faint ring-1 ring-rule"
          >
            {i + 1}
          </span>

          <AccordionTrigger className="w-full min-h-11 py-0.5 text-left">
            <div className="flex items-center">
              <ChevronRight
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 group-data-expanded:rotate-90"
              />
              <span className="ml-2 text-base font-semibold text-ink">{s.name}</span>
            </div>
          </AccordionTrigger>

          <AccordionContent className="origin-left">
            <p className="pl-6 pr-2 pt-1.5 text-sm leading-relaxed text-ink-muted">{s.body}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
