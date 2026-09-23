import { priyaOfferLetter } from '@/fixtures/priya-offer-letter';
import { AppShell } from '@/components/AppShell';
import { Scrubber } from '@/components/Scrubber';
import { getLocale } from '@/lib/locale';
import { UI } from '@/lib/ui-strings';
import { PageHeadingRoll } from '@/components/core/page-heading-roll';
import { getCurrentAnalysis } from '@/lib/analysis';

export const metadata = { title: 'Timeline — Anubandh' };

export default async function TimelinePage() {
  // The seam. A real analysis if this session has one, otherwise the sample —
  // /radar is linked straight from the landing page and from "open the sample
  // instead", so a cold visit has to land on something to read.
  const analysis = (await getCurrentAnalysis()) ?? priyaOfferLetter;
  const t = UI[await getLocale()].timeline;

  return (
    <AppShell coverage={analysis.coverage}>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          <PageHeadingRoll>{t.title}</PageHeadingRoll>
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">{t.subtitle}</p>
        <div className="mt-6">
          <Scrubber analysis={analysis} />
        </div>
      </div>
    </AppShell>
  );
}
