/**
 * Contrast over whatever is actually behind the text, on every route.
 *
 * check-contrast.ts reasons about token pairs, which assumes the background is
 * a flat token. It is not any more: the pages sit on a mesh gradient that runs
 * from Spring Celadon (#EAFBF7, nearly white) to Indigo (#274A78), and the hero
 * sits on a photograph. A pair that measures 13:1 against --paper can be
 * unreadable over the light end of that gradient, and nothing in the token
 * checker can see it. axe cannot either — it returns "incomplete" rather than a
 * violation when a translucent or image backdrop makes the effective background
 * indeterminate, so a page can go green while being unreadable.
 *
 * So this photographs the truth, the same way check-hero.ts does for the hero:
 * hide every glyph, screenshot what remains, and score each run of text against
 * the worst pixel inside its own box. Anything sitting on its own opaque fill is
 * skipped, because the backdrop never reaches it — that is why the dark cards
 * drop out of this and are covered by the card context in check-contrast.ts.
 *
 * Needs the dev server running:
 *   npm run dev
 *   npm run check:backdrop
 */

import { chromium, type Page } from 'playwright';
import sharp from 'sharp';

const BASE = process.env.A11Y_BASE ?? 'http://localhost:3000';

const ROUTES = [
  { path: '/', name: 'Landing' },
  { path: '/upload', name: 'Intake' },
  { path: '/radar', name: 'Risk Radar' },
  { path: '/document?clause=n_bond_money', name: 'Plain Language' },
  { path: '/timeline', name: 'Timeline' },
  { path: '/ask', name: 'Ask' },
  { path: '/prepare', name: 'Prepare' },
];

// One narrow and one wide: the gradient is object-cover, so which part of it
// lands behind the copy changes with the viewport.
const WIDTHS = [
  { name: '390px ', width: 390, height: 844 },
  { name: '1280px', width: 1280, height: 900 },
];

let failed = 0;
const pass = (m: string) => console.log('  ok    ' + m);
const fail = (m: string) => {
  failed++;
  console.log('  FAIL  ' + m);
};

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = (c: number[]) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
const contrast = (a: number[], b: number[]) => {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

type Rect = { x: number; y: number; w: number; h: number };
type Run = { text: string; color: number[]; need: number; rects: Rect[] };

/** Every run of text currently in the viewport that is NOT on an opaque fill. */
async function planFor(page: Page) {
  return page.evaluate(() => {
    const nums = (s: string) => {
      const open = s.indexOf('(');
      if (open === -1) return [];
      const body = s.slice(open + 1, s.lastIndexOf(')'));
      const parts: string[] = [];
      let cur = '';
      for (const ch of body) {
        if (ch === ',' || ch === ' ' || ch === '/') {
          if (cur) parts.push(cur);
          cur = '';
        } else cur += ch;
      }
      if (cur) parts.push(cur);
      return parts.map(Number).filter((n) => !Number.isNaN(n));
    };

    // Anything scrolled under the sticky header or tab bar is behind frosted
    // chrome, not behind the page backdrop. Sampling through it reads the
    // glass as if it were the background of text that is in fact covered —
    // which is what made a legend item look like 4.07:1. Runs are clamped to
    // below the chrome instead.
    let chromeBottom = 0;
    for (const el of Array.from(document.querySelectorAll('header,nav,aside,footer'))) {
      const pos = getComputedStyle(el as HTMLElement).position;
      if (pos !== 'sticky' && pos !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.top <= 2 && r.bottom > chromeBottom) chromeBottom = r.bottom;
    }

    const runs: Array<Record<string, unknown>> = [];
    // mark is in the list so a paragraph CONTAINING a highlight is skipped and
    // the highlight is scored on its own fill instead of poisoning its parent.
    const sel = 'p,h1,h2,h3,a,span,button,li,blockquote,figcaption,label,mark';
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const text = (el.textContent || '').trim();
      if (text.length < 3) continue;
      if (el.querySelector(sel)) continue;

      let opaque = false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const bg = nums(getComputedStyle(n as HTMLElement).backgroundColor);
        if (bg.length >= 3 && (bg.length < 4 || bg[3] >= 0.85)) {
          opaque = true;
          break;
        }
      }
      if (opaque) continue;

      const cs = getComputedStyle(el as HTMLElement);
      if (parseFloat(cs.opacity) < 0.99) continue;
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      // checkVisibility catches what the style checks above cannot: content
      // inside a collapsed <details> still reports a box, so the sampler was
      // reading whatever is painted behind the closed panel and calling it the
      // background of text nobody can see.
      const cv = (el as HTMLElement & { checkVisibility?: (o: object) => boolean }).checkVisibility;
      if (typeof cv === 'function' && !cv.call(el, { checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) continue;
      // And it must actually be the thing on top at its own centre.
      const box = el.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      // Viewport only: the screenshot is the viewport.
      if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
      if (r.right <= 0 || r.left >= window.innerWidth) continue;

      const px = parseFloat(cs.fontSize);
      const weight = Number(cs.fontWeight) || 400;
      const large = px >= 24 || (px >= 18.66 && weight >= 700);

      const top = Math.max(r.y, chromeBottom);
      const height = r.bottom - top;
      if (height < 4) continue;
      // Inset the sample. A rounded-full pill has page, not pill, in the
      // corners of its bounding box, and the darkest pixel in the box was
      // being read as the background of text that sits well inside it.
      const inset = Math.min(Math.round(height * 0.32), 12);

      // Per-line boxes, not the bounding box. An inline run that wraps has a
      // bounding rect covering the union of its lines, so it was sampling
      // whatever sits beside it on another line — which is how a paragraph got
      // scored against a highlight it merely sits near.
      const rects = [];
      for (const q of Array.from(el.getClientRects())) {
        const qTop = Math.max(q.y, chromeBottom);
        const qH = q.bottom - qTop;
        if (qH < 4 || q.width < 4) continue;
        if (q.bottom <= 0 || q.top >= window.innerHeight) continue;
        const vi = Math.min(inset, qH / 3);
        rects.push({
          x: Math.max(0, Math.round(q.x + inset)),
          y: Math.max(0, Math.round(qTop + vi)),
          w: Math.max(1, Math.round(q.width - inset * 2)),
          h: Math.max(1, Math.round(qH - vi * 2)),
        });
      }
      if (rects.length === 0) continue;

      runs.push({
        text: text.slice(0, 30),
        color: nums(cs.color).slice(0, 3),
        need: large ? 3 : 4.5,
        rects,
      });
    }
    return runs;
  });
}

async function run() {
  console.log('\nContrast over the real backdrop — gradient, photograph, glass\n');
  const browser = await chromium.launch();

  for (const size of WIDTHS) {
    for (const route of ROUTES) {
      const label = size.name + ' ' + route.name;
      const ctx = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        colorScheme: 'light',
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      await page.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' });
      await page.goto(BASE + route.path, { waitUntil: 'networkidle' });
      // The drift is a slow transform loop; freeze it so the sample is stable.
      await page.addStyleTag({
        content:
          '*,*::before,*::after{animation-play-state:paused !important}' +
          // The dev-tools badge is a real element in the page, sits over the
          // footer, and was being sampled as though it were the design.
          'nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}',
      });

      // Two passes down the page, because the gradient is fixed and the copy
      // scrolls across it — the worst pairing is rarely at the top.
      const stops = [0, 0.45, 0.9];
      let worstRun: Run | null = null;
      let worst = Infinity;
      let worstMargin = Infinity;
      let checked = 0;

      for (const frac of stops) {
        await page.evaluate((f) => {
          window.scrollTo(0, Math.round((document.body.scrollHeight - window.innerHeight) * f));
        }, frac);
        await page.waitForTimeout(250);

        const runs = (await planFor(page)) as unknown as Run[];
        if (runs.length === 0) continue;

        // Hide the GLYPHS, not the elements. visibility:hidden also hides an
        // element's own background, and several of these surfaces ARE text
        // elements — the question cards on Prepare are <li>. Hiding them made
        // the sampler read the page behind the card instead of the card, which
        // reported dark-on-glass text as light-on-light at 1.00:1.
        const hide = await page.addStyleTag({
          content:
            '*{color:transparent !important;text-shadow:none !important;' +
            '-webkit-text-fill-color:transparent !important}' +
            'svg,img{visibility:hidden !important}',
        });
        const shot = await page.screenshot();
        await hide.evaluate((n) => (n as unknown as HTMLElement).remove());

        const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });

        for (const r of runs) {
          let min = Infinity;
          let minPx: number[] = [];
          for (const box of r.rects) {
            const xEnd = Math.min(info.width, box.x + box.w);
            const yEnd = Math.min(info.height, box.y + box.h);
            for (let y = box.y; y < yEnd; y += 2) {
              for (let x = box.x; x < xEnd; x += 2) {
                const i = (y * info.width + x) * info.channels;
                const c = contrast(r.color, [data[i], data[i + 1], data[i + 2]]);
                if (c < min) { min = c; minPx = [data[i], data[i + 1], data[i + 2]]; }
              }
            }
          }
          if (!Number.isFinite(min)) continue;
          checked++;
          if (min < r.need) {
            fail(
              label + ' — "' + r.text + '" is ' + min.toFixed(2) + ':1 (needs ' + r.need +
                ')  text rgb(' + r.color.join(',') + ') on rgb(' + minPx.join(',') + ')',
            );
          }
          const margin = min - r.need;
          if (margin < worstMargin) {
            worstMargin = margin;
            worst = min;
            worstRun = r;
          }
        }
      }

      if (worstRun && worstMargin >= 0) {
        pass(
          label + ' — ' + checked + ' runs, tightest "' + worstRun.text + '" at ' + worst.toFixed(2) +
            ':1 (needs ' + worstRun.need + ')',
        );
      } else if (!worstRun) {
        pass(label + ' — no text sits directly on the backdrop');
      }
      await ctx.close();
    }
  }

  await browser.close();
  console.log(
    failed === 0
      ? '\nBackdrop contrast passed.\n'
      : '\nBackdrop contrast FAILED — ' + failed + ' problem(s).\n',
  );
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
