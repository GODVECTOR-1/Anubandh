import { priyaOfferLetter } from '@/fixtures/priya-offer-letter';
import { AppShell } from '@/components/AppShell';
import { SplitView } from '@/components/SplitView';
import { getLocale } from '@/lib/locale';
import { getCurrentAnalysis } from '@/lib/analysis';

export const metadata = { title: 'Plain Language — Anubandh' };

/**
 * `?clause=<node id>` is what a flag card and an Ask citation link to, so a
 * jump from either lands on the right clause and the back button behaves.
 *
 * Language comes from the cookie, like every other screen. It used to come from
 * a `?lang` parameter here, which stopped being right the moment the toggle
 * became global: two sources for one setting means one of them is wrong.
 */
export default async function DocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ clause?: string }>;
}) {
  const { clause } = await searchParams;
  // The seam. A real analysis if this session has one, otherwise the sample —
  // /radar is linked straight from the landing page and from "open the sample
  // instead", so a cold visit has to land on something to read.
  const analysis = (await getCurrentAnalysis()) ?? priyaOfferLetter;
  const locale = await getLocale();

  return (
    <AppShell coverage={analysis.coverage}>
      <SplitView analysis={analysis} initialSelected={clause ?? null} locale={locale} />
    </AppShell>
  );
}
