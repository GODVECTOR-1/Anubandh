import type { NextConfig } from "next";
import { assertProductionEnv } from "./lib/env-check";

// Refuse to build a production deploy that cannot work, and say why. See
// lib/env-check.ts — this is the check whose absence cost the first deploy.
assertProductionEnv();

/**
 * Response headers, because the defaults leave the browser's own defences off.
 *
 * Every one of these is enforced by the user agent rather than by us, which is
 * what makes them worth setting: they hold even on a page where our own code
 * has already gone wrong.
 *
 * The CSP is the load-bearing one. This app renders text taken from a file a
 * stranger uploaded, so "a clause containing markup cannot become markup" is a
 * promise the product makes. React escaping is what keeps that true today and
 * the CSP is what keeps it true after someone reaches for
 * dangerouslySetInnerHTML in a hurry.
 */
const csp = [
  "default-src 'self'",
  // Next injects inline bootstrap and, in development, eval for HMR. Neither
  // can be dropped without ejecting from the framework, so the honest form is
  // to allow them explicitly and keep every other source closed.
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  // Tailwind and next/font both emit style elements.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // data: and blob: cover the inlined gradient tile and any canvas capture.
  "img-src 'self' data: blob:",
  // Same-origin only: this app talks to its own routes and nothing else. The
  // Gemini call is made by the server, never by the browser, so there is no
  // third party to allow here — and if that ever changes it should be a
  // deliberate edit to this line rather than a silent new connection.
  "connect-src 'self'",
  // Nothing here is ever framed, and nothing is framed inside it.
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  // The app posts only to itself; this stops a form injected into the page
  // from exfiltrating its contents elsewhere.
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

const nextConfig: NextConfig = {
  // No "X-Powered-By: Next.js". Naming the framework on every response tells a
  // scanner which advisories to try first, and tells a reader nothing.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // frame-ancestors above covers modern browsers; this covers the rest.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The app asks for none of these, so it should be unable to ask.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
          // Two years, subdomains included. Safe to send from a Vercel domain,
          // which is HTTPS-only; it is the header that stops the first request
          // of the next visit from going out in the clear.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // A document someone uploaded is not something other origins get to
          // read, measure, or share a process with.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
