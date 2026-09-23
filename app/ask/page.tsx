import { priyaOfferLetter } from '@/fixtures/priya-offer-letter';
import { AppShell } from '@/components/AppShell';
import { Ask } from '@/components/Ask';
import { getCurrentAnalysis } from '@/lib/analysis';

export const metadata = { title: 'Ask — Anubandh' };

export default async function AskPage() {
  // The seam. A real analysis if this session has one, otherwise the sample —
  // /radar is linked straight from the landing page and from "open the sample
  // instead", so a cold visit has to land on something to read.
  const analysis = (await getCurrentAnalysis()) ?? priyaOfferLetter;
  return (
    <AppShell coverage={analysis.coverage}>
      <Ask analysis={analysis} />
    </AppShell>
  );
}
