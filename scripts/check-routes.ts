/**
 * Smoke test: does every route actually load, and does anything shout?
 *
 * The other gates measure specific properties — contrast, targets, budget. None
 * of them notices a route that 500s, a console error on hydration, a request
 * that 404s, or an error boundary rendering its fallback. Those are exactly the
 * failures a backend change introduces, so this exists for the handoff: run it
 * after any change to the data layer and it will tell you which screen broke.
 *
 * It asserts three things per route:
 *   - the document responded 200 and no sub-request failed
 *   - nothing was logged to console.error, and no uncaught exception fired
 *   - the page is not showing an error boundary or an empty <main>
 *
 * Needs the dev server running:
 *   npm run dev
 *   npm run check:routes
 */

import { chromium, type ConsoleMessage, type Request } from 'playwright';

const BASE = process.env.A11Y_BASE ?? 'http://localhost:3000';

const ROUTES = [
  { path: '/', name: 'Landing' },
  { path: '/upload', name: 'Intake' },
  { path: '/radar', name: 'Risk Radar' },
  { path: '/radar?coverage=cautionary', name: 'Risk Radar (cautionary)' },
  { path: '/document', name: 'Plain Language' },
  { path: '/document?clause=n_bond_money', name: 'Plain Language (deep link)' },
  { path: '/timeline', name: 'Timeline' },
  { path: '/ask', name: 'Ask' },
  { path: '/prepare', name: 'Prepare' },
  { path: '/states', name: 'Component states' },
];

// Noise that is the dev server talking to itself, not the app failing.
const IGNORE = [
  'Download the React DevTools',
  'react-devtools',
  '[Fast Refresh]',
  'webpack-hmr',
  '_next/static/webpack',
];

let failed = 0;
const pass = (m: string) => console.log('  ok    ' + m);
const fail = (m: string) => {
  failed++;
  console.log('  FAIL  ' + m);
};

async function run() {
  console.log('\nRoute smoke test — does every screen load and stay quiet?\n');
  const browser = await chromium.launch();

  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();

    const errors: string[] = [];
    const failedReqs: string[] = [];

    page.on('console', (m: ConsoleMessage) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      if (IGNORE.some((s) => text.includes(s))) return;
      errors.push(text.slice(0, 160));
    });
    page.on('pageerror', (e) => errors.push('uncaught: ' + String(e.message).slice(0, 160)));
    page.on('requestfailed', (r: Request) => {
      const url = r.url();
      if (IGNORE.some((s) => url.includes(s))) return;
      const why = r.failure()?.errorText ?? '?';

      // A cancelled RSC prefetch is the router working, not a broken resource.
      //
      // In a production build Next speculatively fetches the routes whose
      // links are in view and aborts the ones it turns out not to need, so a
      // handful of `?_rsc=` requests end in ERR_ABORTED on every page. This
      // gate had only ever been pointed at `next dev`, which does not prefetch
      // the same way, so the first run against a real build reported 77
      // failures on a site with nothing wrong with it.
      //
      // Narrow on purpose: only an ABORTED request, and only one carrying the
      // RSC marker. A prefetch that 404s or is blocked still fails the gate.
      if (why.includes('ERR_ABORTED') && url.includes('_rsc=')) return;

      failedReqs.push(r.method() + ' ' + url.slice(0, 110) + ' — ' + why);
    });

    const res = await page.goto(BASE + route.path, { waitUntil: 'networkidle' });
    // Client components mount after networkidle; give hydration a moment to
    // throw if it is going to.
    await page.waitForTimeout(700);

    const status = res ? res.status() : 0;
    const shape = await page.evaluate(() => {
      const main = document.querySelector('main');
      const text = (main ? main.innerText : document.body.innerText).trim();
      return {
        mainExists: !!main,
        textLength: text.length,
        // The app renders a visible stub rather than vanishing, so the stub
        // copy is the signal that a card blew up.
        brokenCards: document.querySelectorAll('[data-card-stub]').length,
        looksLikeNextError:
          document.title.toLowerCase().includes('error') ||
          text.includes('This page could') ||
          text.includes('Application error') ||
          text.includes('Unhandled Runtime Error'),
      };
    });

    const problems: string[] = [];
    if (status !== 200) problems.push('HTTP ' + status);
    if (shape.looksLikeNextError) problems.push('error page rendered');
    if (!shape.mainExists) problems.push('no <main>');
    if (shape.textLength < 40) problems.push('page is effectively empty (' + shape.textLength + ' chars)');
    for (const e of errors) problems.push('console: ' + e);
    for (const r of failedReqs) problems.push('request: ' + r);

    if (problems.length === 0) {
      pass(route.name + ' — 200, ' + shape.textLength + ' chars, no errors');
    } else {
      for (const p of problems) fail(route.name + ' — ' + p);
    }

    await ctx.close();
  }

  // Two sentences on one screen counting the same thing. The headline once said
  // 38 under a strip saying 37: it counted a node that failed entailment and
  // was never shown. On a product whose promise is exact numbers, that is the
  // bug the reader notices first.
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + '/radar', { waitUntil: 'networkidle' });
    const counts = await page.evaluate(() => ({
      strip: document.querySelector('aside summary .sr-only')?.textContent ?? null,
      headline: /out of (\d+) obligations/.exec(document.body.textContent ?? '')?.[1] ?? null,
    }));
    counts.strip && counts.strip === counts.headline
      ? pass('radar headline and coverage strip agree — ' + counts.strip + ' shown')
      : fail('radar headline says ' + counts.headline + ' obligations, coverage strip says ' + counts.strip);
    await ctx.close();
  }

  // The one flow that is not just a page load: pick a sample and let the
  // pipeline run to completion. It is the path a real upload will take.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const flowErrors: string[] = [];
  page.on('pageerror', (e) => flowErrors.push(String(e.message).slice(0, 160)));
  await page.goto(BASE + '/upload', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /offer letter/i }).first().click();
  const landed = await page
    .waitForURL((u) => !u.pathname.endsWith('/upload'), { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  landed && flowErrors.length === 0
    ? pass('upload flow — a sample runs the pipeline and lands on ' + new URL(page.url()).pathname)
    : fail('upload flow — landed=' + landed + ' errors=' + JSON.stringify(flowErrors));
  await ctx.close();

  // "Try again" must send the reader's own text again. It used to load the
  // sample offer letter under their filename, so a failed upload "worked on
  // the second try" and showed findings quoted from a document they never
  // sent. Both POSTs are answered here with the failure the reader actually
  // met, so this needs no database and no model.
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const posts: string[] = [];
    await page.route('**/api/documents', (route) => {
      posts.push(route.request().postDataBuffer()?.toString('utf8') ?? '');
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal' }) });
    });
    const mine = ('MY OWN CLAUSE. ' + 'The Employee shall give sixty days written notice before resigning. '.repeat(4)).trim();
    await page.goto(BASE + '/upload', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^paste text instead$/i }).click();
    await page.locator('#paste').fill(mine);
    await page.getByRole('button', { name: /^read this$/i }).click();
    await page.getByRole('button', { name: /^try again$/i }).click();
    await page.waitForTimeout(1000);
    const retry = posts[1] ?? '';
    posts.length === 2 && retry.includes(mine) && !retry.includes('name="scenario"')
      ? pass('try again — resends the reader\'s own text, not a sample')
      : fail('try again — ' + posts.length + ' upload(s); the retry sent ' + (retry.match(/name="(\w+)"/g) ?? []).join(', '));
    await ctx.close();
  }

  // The PDF route is the only other thing that produces a file.
  const api = await browser.newContext();
  const apiPage = await api.newPage();
  const pdf = await apiPage.request.get(BASE + '/api/prepare');
  const body = await pdf.body();
  const isPdf = body.subarray(0, 5).toString() === '%PDF-';
  pdf.status() === 200 && isPdf
    ? pass('/api/prepare — 200, ' + Math.round(body.length / 1024) + ' KB, valid PDF header')
    : fail('/api/prepare — status ' + pdf.status() + ', pdf=' + isPdf);
  await api.close();

  await browser.close();
  console.log(failed === 0 ? '\nRoute smoke test passed.\n' : '\nRoute smoke test FAILED — ' + failed + ' problem(s).\n');
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
