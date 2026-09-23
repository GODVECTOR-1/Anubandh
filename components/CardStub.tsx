/**
 * The visible stub for an item we counted but could not show.
 *
 * Shared deliberately by both failure paths — a render crash caught by the
 * client boundary, and a flag whose node is missing from the graph. One set of
 * words for one user-visible outcome; two would drift.
 */
import { UI } from '@/lib/ui-strings';
import type { Locale } from '@/lib/i18n';

export function CardStub({ label, locale = 'en' }: { label?: string; locale?: Locale }) {
  const t = UI[locale].radar;
  return (
    <article
      role="alert"
      className="rim rounded-lg border border-dashed border-reduced/50 bg-reduced-bg p-4 text-sm"
    >
      <p className="font-medium text-reduced">{t.cardStubTitle}</p>
      <p className="mt-1 text-ink-muted">
        {t.cardStubBody}
      </p>
      {label && <p className="mt-1 font-mono text-xs text-ink-faint">{label}</p>}
    </article>
  );
}
