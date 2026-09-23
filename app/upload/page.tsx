import { AppHeader } from '@/components/AppHeader';
import { Intake } from '@/components/Intake';
import { AmbientGradient } from '@/components/AmbientGradient';

export const metadata = { title: 'Read a document — Anubandh' };

export default function UploadPage() {
  return (
    <>
      <AmbientGradient />
      {/* No "New document" button on the page that IS new document. */}
      <AppHeader showNewDocument={false} />
      <main id="main" className="flex-1">
        <Intake />
      </main>
    </>
  );
}
