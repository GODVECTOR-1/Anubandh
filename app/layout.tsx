import type { Metadata } from "next";
import { Geist, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { ResetOnReload } from "@/components/ResetOnReload";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getLocale } from "@/lib/locale";
import { UI } from "@/lib/ui-strings";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

/** Reserved for text quoted FROM the user's document.
 *
 *  The typeface is what separates the document's words from ours, and that
 *  distinction has to survive the change of face. The serif carried it by
 *  being a different KIND of type; this carries it by being a different
 *  family and a heavier weight than anything Anubandh writes in its own
 *  voice, which never goes above 600. */
const quoteFace = Bricolage_Grotesque({
  variable: "--font-quote",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Anubandh — read your contract with the receipts",
  description:
    "Every obligation in your document, traced back to the exact words it came from. Information, not legal advice.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const t = UI[locale];

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${quoteFace.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ResetOnReload />

        {/* First stop for keyboard users. The Radar is long; tabbing through the
            header on every page load is the kind of thing that never shows up in
            an audit score and always shows up in real use. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-lg"
        >
          {t.common.skipToContent}
        </a>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
