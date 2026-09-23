import { priyaOfferLetter } from '@/fixtures/priya-offer-letter';
import { AppShell } from '@/components/AppShell';
import { RiskRadar } from '@/components/RiskRadar';
import { getCurrentAnalysis } from '@/lib/analysis';

export const metadata = { title: 'Risk Radar — Anubandh' };

/**
 * Renders the frozen fixture, not the API.
 *
 * `?coverage=cautionary` is what the classifier override lands on: a document
 * we were not confident was an employment contract still gets read, but the
 * strip says so and never stops saying so. Without this the cautionary weight
 * existed only on the states page, which is another way of saying it had never
 * shipped.
 */
export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ coverage?: string }>;
}) {
  const { coverage } = await searchParams;
  // The seam. A real analysis if this session has one, otherwise the sample —
  // /radar is linked straight from the landing page and from "open the sample
  // instead", so a cold visit has to land on something to read.
  const analysis = (await getCurrentAnalysis()) ?? priyaOfferLetter;

  const shown =
    coverage === 'cautionary' || coverage === 'reduced'
      ? { ...analysis, coverage: { ...analysis.coverage, mode: coverage as 'cautionary' | 'reduced' } }
      : analysis;

  return (
    <AppShell coverage={shown.coverage}>
      <RiskRadar analysis={shown} />
    </AppShell>
  );
}
