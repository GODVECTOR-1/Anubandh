import { priyaOfferLetter } from '@/fixtures/priya-offer-letter';
import { AppShell } from '@/components/AppShell';
import { Prepare } from '@/components/Prepare';
import { getCurrentAnalysis } from '@/lib/analysis';

export const metadata = { title: 'Prepare — Anubandh' };

export default async function PreparePage() {
  // The seam. A real analysis if this session has one, otherwise the sample —
  // /radar is linked straight from the landing page and from "open the sample
  // instead", so a cold visit has to land on something to read.
  const analysis = (await getCurrentAnalysis()) ?? priyaOfferLetter;
  // The footer's only job is to point here, so it is noise on this screen.
  return (
    <AppShell coverage={analysis.coverage} showFooter={false}>
      <Prepare analysis={analysis} />
    </AppShell>
  );
}
