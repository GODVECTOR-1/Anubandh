/**
 * Contrast over the hero photograph, measured rather than argued about.
 *
 * "Busy imagery behind text" is an instant-fail rule, and a background image is
 * the one place the static checker is blind: check-contrast.ts reasons about
 * token pairs and glass, and knows nothing about a photograph whose pixels move
 * with every viewport.
 *
 * So this does not model the CSS. Modelling it is how you get a green check for
 * a scrim you are not shipping: an early version of this measurement rebuilt the
 * gradients from computed styles, failed to parse the oklab() colour stops that
 * Tailwind emits, silently composited no scrim at all, and reported a hero that
 * was fine as catastrophically broken.
 *
 * Instead it photographs the truth. The hero's text is hidden, the backdrop is
 * screenshotted as the browser actually composites it (image, filter, opacity,
 * mask, every gradient, in whatever colour space), and each run of text is then
 * scored against the worst pixel inside its own box. Anything sitting on its own
 * opaque fill is skipped, because the photograph never reaches it.
 *
 * Needs the dev server running:
 *   npm run dev
 *   npm run check:hero
 */

import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE = process.env.A11Y_BASE ?? 'http://localhost:3000';

// Both sides of the lg breakpoint, because the hero is two different layouts
// with two different scrims and only one of them can be wrong at a time.
const WIDTHS = [
  { name: '375px  (phone, one column)', width: 375, height: 800 },
  { name: '900px  (tablet, one column)', width: 900, height: 900 },
  { name: '1280px (desktop, two column)', width: 1280, height: 900 },
  { name: '1600px (wide, two column)', width: 1600, height: 900 },
];

// Light only: dark mode was removed from the product.
const THEMES = [{ name: 'light', scheme: 'light' as const }];

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

type Run = { text: string; color: number[]; need: number; x: number; y: number; w: number; h: number };

async function run() {
  console.log('\nHero contrast over the background photograph\n');
  const browser = await chromium.launch();

  for (const theme of THEMES) {
    for (const size of WIDTHS) {
      const label = theme.name + ' ' + size.name;
      const ctx = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        colorScheme: theme.scheme,
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      // tsx compiles with keepNames, which wraps inner arrow functions in a
      // __name() helper. That helper exists in the bundle, not in the browser,
      // so anything page.evaluate ships over throws ReferenceError before it
      // runs a single line. Define an identity version in the page.
      await page.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' });
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });

      const plan = await page.evaluate(() => {
        const img = document.querySelector('main section img');
        if (!img || !img.parentElement || !img.parentElement.parentElement) return null;
        const host = img.parentElement.parentElement as HTMLElement;
        const box = host.getBoundingClientRect();

        // No regex: pull the numbers out of rgb()/rgba() by hand.
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

        const section = document.querySelector('main section');
        if (!section) return null;
        const runs = [];
        const sel = 'p,h1,h2,a,span,button,li';
        for (const el of Array.from(section.querySelectorAll(sel))) {
          const text = (el.textContent || '').trim();
          if (text.length < 3) continue;
          if (el.querySelector(sel)) continue;

          // Anything on its own opaque fill is not over the photograph.
          //
          // The walk stops at the hero section. It must not continue past it:
          // the backdrop is a SIBLING of the copy, not an ancestor of it, so
          // walking to the root always reaches <html>, which is opaque, and
          // every run of text gets excluded as "not over the image".
          let opaque = false;
          for (let n: Element | null = el; n && n !== section.parentElement; n = n.parentElement) {
            const bg = nums(getComputedStyle(n as HTMLElement).backgroundColor);
            if (bg.length >= 3 && (bg.length < 4 || bg[3] >= 0.9)) {
              opaque = true;
              break;
            }
          }
          if (opaque) continue;

          const cs = getComputedStyle(el as HTMLElement);
          if (parseFloat(cs.opacity) < 0.99) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          if (r.bottom <= box.top || r.top >= box.bottom) continue;

          const px = parseFloat(cs.fontSize);
          const weight = Number(cs.fontWeight) || 400;
          const large = px >= 24 || (px >= 18.66 && weight >= 700);

          runs.push({
            text: text.slice(0, 34),
            color: nums(cs.color).slice(0, 3),
            need: large ? 3 : 4.5,
            x: Math.max(0, Math.round(r.x - box.x)),
            y: Math.max(0, Math.round(r.y - box.y)),
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
        }
        return {
          box: {
            x: Math.round(box.x),
            y: Math.round(box.y),
            w: Math.round(box.width),
            h: Math.round(box.height),
          },
          runs,
        };
      });

      if (!plan || plan.runs.length === 0) {
        fail(label + ' — no hero image or no text found over it (is HERO_IMAGE set?)');
        await ctx.close();
        continue;
      }

      // Hide the words, keep the backdrop, photograph what is behind them.
      //
      // The dev-tools badge goes too. It is a real element that sits over the
      // bottom-left corner of the page, so it lands inside the hero card and
      // gets sampled as though it were the photograph: a run on cream at about
      // 8:1 was reported as 1.03:1 because one dark pixel of the badge, at
      // (47, 759), fell inside its box. It is not part of the design and does
      // not ship. check-backdrop.ts already drops it for the same reason; this
      // gate never did, and only got away with it while cards were opaque
      // enough to be skipped by the test above.
      await page.addStyleTag({
        content:
          'nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}' +
          'main section :is(p,h1,h2,a,span,button,li,svg){visibility:hidden !important}',
      });
      const shot = await page.screenshot({
        clip: { x: plan.box.x, y: plan.box.y, width: plan.box.w, height: plan.box.h },
      });
      const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });

      let worstRun: Run | null = null;
      let worst = Infinity;
      let worstMargin = Infinity;

      for (const r of plan.runs as Run[]) {
        let min = Infinity;
        const xEnd = Math.min(info.width, r.x + r.w);
        const yEnd = Math.min(info.height, r.y + r.h);
        for (let y = r.y; y < yEnd; y += 2) {
          for (let x = r.x; x < xEnd; x += 2) {
            const i = (y * info.width + x) * info.channels;
            const c = contrast(r.color, [data[i], data[i + 1], data[i + 2]]);
            if (c < min) min = c;
          }
        }
        if (!Number.isFinite(min)) continue;
        if (min < r.need) {
          fail(label + ' — "' + r.text + '" is ' + min.toFixed(2) + ':1 over the photo (needs ' + r.need + ')');
        }
        const margin = min - r.need;
        if (margin < worstMargin) {
          worstMargin = margin;
          worst = min;
          worstRun = r;
        }
      }

      if (worstRun && worstMargin >= 0) {
        pass(
          label +
            ' — tightest is "' +
            worstRun.text +
            '" at ' +
            worst.toFixed(2) +
            ':1 (needs ' +
            worstRun.need +
            ')',
        );
      }
      await ctx.close();
    }
  }

  await browser.close();
  console.log(
    failed === 0
      ? '\nHero contrast passed: every run of text clears AA over the photograph.\n'
      : '\nHero contrast FAILED — ' + failed + ' problem(s).\n',
  );
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
