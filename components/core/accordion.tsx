'use client';

import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion, type Transition, type Variants } from 'motion/react';
import { cn } from '@/lib/cn';

/**
 * Accordion, on the Motion-Primitives API.
 *
 * The library ships this as copy-paste rather than a package, so it lives here
 * and is ours to keep correct. Two things were added on the way in, because the
 * pasted version does not have them and this project's accessibility suite runs
 * axe over every route:
 *
 *   - real ARIA wiring. The trigger is a <button> carrying aria-expanded and
 *     aria-controls; the panel is a region labelled by its own trigger. Without
 *     that, a screen reader hears a heading that does nothing and a paragraph
 *     that appears from nowhere.
 *   - prefers-reduced-motion. The spring is replaced by an instant transition
 *     rather than merely a faster one: an accordion that springs open is the
 *     exact motion that setting exists to stop.
 *
 * `data-expanded` is kept on the trigger so `group-data-expanded:` utilities
 * work as they do in the library's own examples.
 *
 * If you go looking for that rotation in the DOM: Tailwind v4 compiles it to the
 * independent `rotate` property, not to `transform`. Computed `transform` reads
 * `none` on a chevron that is turning perfectly well.
 */

type AccordionContextValue = {
  expandedValue: string | null;
  toggle: (value: string) => void;
  variants?: Variants;
  transition?: Transition;
};

const AccordionContext = createContext<AccordionContextValue | null>(null);

const useAccordion = () => {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error('Accordion parts must be used inside <Accordion>');
  return ctx;
};

const ItemContext = createContext<{ value: string; triggerId: string; panelId: string } | null>(null);

const useItem = () => {
  const ctx = useContext(ItemContext);
  if (!ctx) throw new Error('AccordionTrigger and AccordionContent must be used inside <AccordionItem>');
  return ctx;
};

export function Accordion({
  children,
  className,
  variants,
  transition,
  defaultValue = null,
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
  transition?: Transition;
  /** Leave one panel open so a collapsed section still says something. */
  defaultValue?: string | null;
}) {
  const [expandedValue, setExpandedValue] = useState<string | null>(defaultValue);
  const toggle = (value: string) => setExpandedValue((cur) => (cur === value ? null : value));

  return (
    <AccordionContext.Provider value={{ expandedValue, toggle, variants, transition }}>
      {/* A stable hook for the accessibility suite. Scoping its assertions by
          class or position picks up Next's dev-overlay button, which also
          carries aria-expanded and which Playwright reaches through the
          shadow root. */}
      <div data-accordion="" className={className}>{children}</div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <ItemContext.Provider value={{ value, triggerId: id + '-trigger', panelId: id + '-panel' }}>
      <div className={className}>{children}</div>
    </ItemContext.Provider>
  );
}

export function AccordionTrigger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { expandedValue, toggle } = useAccordion();
  const { value, triggerId, panelId } = useItem();
  const expanded = expandedValue === value;

  return (
    <button
      type="button"
      id={triggerId}
      aria-expanded={expanded}
      aria-controls={panelId}
      data-expanded={expanded ? '' : undefined}
      onClick={() => toggle(value)}
      className={cn('group cursor-pointer', className)}
    >
      {children}
    </button>
  );
}

export function AccordionContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { expandedValue, variants, transition } = useAccordion();
  const { value, triggerId, panelId } = useItem();
  const reduce = useReducedMotion();
  const expanded = expandedValue === value;

  // Instant, not merely quick. A spring that completes in 1ms is still a spring.
  const t: Transition = reduce ? { duration: 0 } : (transition ?? { type: 'spring', stiffness: 120, damping: 20 });

  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          id={panelId}
          role="region"
          aria-labelledby={triggerId}
          // Height is animated on the WRAPPER and the caller's variants run on
          // the content inside it. Putting both on one element makes the panel
          // fight itself: the scale would be measured against a height that is
          // still moving.
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={t}
          className="overflow-hidden"
        >
          <motion.div
            variants={reduce ? undefined : variants}
            initial={variants ? 'collapsed' : undefined}
            animate={variants ? 'expanded' : undefined}
            exit={variants ? 'collapsed' : undefined}
            transition={t}
            className={className}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
