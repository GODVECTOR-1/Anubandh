/**
 * Shipping budget, measured over the wire against a production build.
 *
 * Counting files on disk cannot answer the question that matters, because a
 * lazily-imported dependency splits into dozens of chunks that carry no obvious
 * signature. The only honest measure is what a browser actually downloads, so
 * that is what this does.
 *
 * TWO populations, measured separately:
 *
 *   CORE — a phone at 375px that has asked for reduced motion. This visitor
 *          fails every gate on the 3D layer, so what they download is the app
 *          and nothing else. Every visitor pays at least this.
 *   3D   — a 1440px desktop with motion enabled, after the browser goes idle.
 *          The difference between the two is the true cost of the ambient
 *          Spline layer on the landing page.
 *
 * This also asserts the gates actually hold: if the 3D runtime ever leaks into
 * the phone's download, CORE blows its budget and the build fails. That is a
 * stronger guarantee than reading the source and believing it.
 *
 *   npm run build
 *   npx next start -p 3100
 *   npm run check:budget
 */

import { chromium, type BrowserContext } from 'playwright';

const BASE = process.env.BUDGET_BASE ?? 'http://localhost:3100';
const CORE_BUDGET_KB = 320;
const THREE_D_BUDGET_KB = 1000;

const ROUTES = ['/', '/upload', '/radar', '/document', '/timeline', '/ask', '/prepare'];

/** Bytes of JS actually transferred while loading a route. */
async function jsBytes(context: BrowserContext, path: string, settleMs: number) {
  const page = await context.newPage();
  const seen = new Map<string, number>();

  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/_next/static/') || !url.endsWith('.js')) return;
    if (seen.has(url)) return;
    try {
      // responseBodySize is the ENCODED size: the compressed bytes that
      // actually crossed the wire. res.body() would return the decoded
      // source, which is roughly 2.7x larger here and not comparable to a
      // gzip budget — measuring it was the first version of this bug.
      const sizes = await res.request().sizes();
      // A cache hit reports -1. Counting it would subtract from the total,
      // which is how the first run of this check produced a route that
      // apparently shipped minus three kilobytes.
      if (sizes.responseBodySize > 0) seen.set(url, sizes.responseBodySize);
    } catch {
      /* redirected or aborted; not counted */
    }
  });

  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  // The 3D layer loads on requestIdleCallback, which is after networkidle.
  if (settleMs) await page.waitForTimeout(settleMs);
  await page.close();

  const total = [...seen.values()].reduce((a, b) => a + b, 0) / 1024;
  return { kb: total, files: seen.size };
}

/**
 * This gate measures the PRODUCTION bundle, so it needs a production server —
 * dev serves unminified code and would report numbers that mean nothing.
 *
 * Without this preflight the failure is a raw Playwright navigation stack
 * trace, which reads like the script is broken rather than like a server is
 * missing. That matters most for someone running check:all for the first time.
 */
async function requireServer() {
  try {
    const res = await fetch(BASE, { method: "HEAD" });
    if (res.ok || res.status < 500) return;
  } catch {
    // falls through to the message below
  }
  console.error(
    [
      '',
      '  Budget check needs a production server at ' + BASE + ', and nothing is listening.',
      '',
      '  Start one first:',
      '    npm run build',
      '    npx next start -p 3100',
      '',
      '  Then re-run: npm run check:budget',
      '',
      '  Dev mode is unminified, so measuring it would report numbers that mean nothing.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

async function run() {
  await requireServer();
  console.log('\nShipping budget — measured over the wire\n');

  const browser = await chromium.launch();
  let failed = 0;

  // CORE: a phone that asked for reduced motion. Fails every 3D gate.
  // A FRESH context per route: these numbers answer 'what does a first-time
  // visitor download', and a shared context warms the cache so every route
  // after the first looks nearly free.
  const newPhone = () =>
    browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });

  let worst = { path: '', kb: 0 };
  console.log('  CORE — 375px, reduced motion, cold cache (every visitor pays this)');
  for (const path of ROUTES) {
    const phone = await newPhone();
    const { kb, files } = await jsBytes(phone, path, 0);
    await phone.close();
    if (kb > worst.kb) worst = { path, kb };
    const over = kb > CORE_BUDGET_KB;
    if (over) failed++;
    console.log(
      '    ' + (over ? 'FAIL' : 'ok  ') + '  ' + kb.toFixed(1).padStart(7) + ' KB  ' +
        String(files).padStart(3) + ' files  ' + path,
    );
  }

  // FULL: desktop, motion on, after idle. The ambient layer is mounted in the
  // root layout, so it lands on EVERY route. Measured on an app route as well
  // as the landing, because that is where someone reads a bond clause and the
  // cost there is the one the plan argued about.
  console.log('\n  3D LAYER — every route, 1440px, motion on, after idle');
  for (const path of ['/', '/radar']) {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const full = await jsBytes(desktop, path, 4000);
    await desktop.close();
    const coldPhone = await newPhone();
    const bare = await jsBytes(coldPhone, path, 0);
    await coldPhone.close();

    const cost = full.kb - bare.kb;
    const over = cost > THREE_D_BUDGET_KB;
    if (over) failed++;
    console.log(
      '    ' + (over ? 'FAIL' : 'ok  ') + '  ' + path.padEnd(7) +
        '  phone ' + bare.kb.toFixed(1).padStart(7) + ' KB  ->  desktop ' + full.kb.toFixed(1).padStart(7) +
        ' KB   3D costs ' + cost.toFixed(1).padStart(7) + ' KB  (ceiling ' + THREE_D_BUDGET_KB + ')',
    );
  }

  await browser.close();

  console.log(
    failed === 0
      ? '\nBudget check passed. Worst core route: ' + worst.path + ' at ' + worst.kb.toFixed(1) + ' KB.\n'
      : '\nBudget check FAILED — ' + failed + ' budget(s) exceeded.\n',
  );
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
