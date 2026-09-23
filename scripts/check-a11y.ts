/**
 * axe in CI, not a manual checklist.
 *
 * Drives a real browser over every route in both themes, runs axe-core, and
 * additionally measures two things axe does not: target sizes, and whether the
 * keyboard can actually reach the controls the product depends on.
 *
 * Needs the dev server running:
 *   npm run dev
 *   npm run check:a11y
 */

import { chromium, type Page } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const AXE_SOURCE = require('node:fs').readFileSync(axePath, 'utf8');

const BASE = process.env.A11Y_BASE ?? 'http://localhost:3000';

const ROUTES = [
  { path: '/', name: 'Landing' },
  { path: '/upload', name: 'Intake' },
  { path: '/radar', name: 'Risk Radar' },
  { path: '/radar?coverage=cautionary', name: 'Risk Radar (cautionary)' },
  { path: '/document?clause=n_bond_money', name: 'Plain Language' },
  { path: '/timeline', name: 'Timeline' },
  { path: '/ask', name: 'Ask' },
  { path: '/prepare', name: 'Prepare' },
  { path: '/states', name: 'Component states' },
];

type Violation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[]; failureSummary: string }>;
};

let failed = 0;
const fail = (msg: string) => {
  console.error('  FAIL  ' + msg);
  failed++;
};
const pass = (msg: string) => console.log('  ok    ' + msg);

/** Used by both the Hindi sweep and the clicked-toggle test. */
const devanagari = (t: string) =>
  [...t].some((ch) => { const c = ch.codePointAt(0)!; return c >= 0x0900 && c <= 0x097f; });

/**
 * WCAG 2.5.8 exempts targets that sit inline within a sentence — a clause
 * highlight cannot be 44px tall without tearing the paragraph apart, which is
 * exactly the layout bug this product already hit once. Everything else is
 * measured.
 */
async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const MIN = 44;
    const out: Array<{ label: string; w: number; h: number }> = [];
    const nodes = document.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, [role="button"], [role="slider"], summary',
    );
    for (const el of nodes) {
      // Inline exception: the element flows inside a line of text.
      if (getComputedStyle(el).display === 'inline') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // not rendered
      // Visually-hidden elements (the skip link at rest) measure 1x1 by
      // design. They are not targets until focused, and the focused state is
      // checked separately.
      if (r.width <= 2 && r.height <= 2) continue;
      if (r.width < MIN || r.height < MIN) {
        out.push({
          label: (el.getAttribute('aria-label') || el.textContent || el.tagName)
            .trim()
            .slice(0, 50),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }
    return out;
  });
}

async function run() {
  console.log('\nAccessibility — axe-core over a real browser\n');

  const browser = await chromium.launch();

  // Light only: dark mode was removed from the product, so asserting a dark
  // theme here would be asserting something that no longer ships.
  for (const scheme of ['light'] as const) {
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    for (const route of ROUTES) {
      await page.goto(BASE + route.path, { waitUntil: 'networkidle' });
      await page.addScriptTag({ content: AXE_SOURCE });

      const results = (await page.evaluate(async () => {
        // @ts-expect-error injected at runtime
        return await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
      })) as { violations: Violation[] };

      const label = scheme + ' ' + route.name;
      if (results.violations.length === 0) {
        pass(label + ' — no axe violations');
      } else {
        for (const v of results.violations) {
          fail(
            label + ' — ' + v.id + ' (' + (v.impact ?? 'unknown') + '): ' + v.help +
              '  [' + v.nodes.length + ' node(s)] ' + (v.nodes[0]?.target.join(' ') ?? ''),
          );
        }
      }
    }

    await context.close();
  }

  // Target sizes, measured at phone width where it actually matters.
  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await mobile.newPage();
  for (const route of ROUTES) {
    await page.goto(BASE + route.path, { waitUntil: 'networkidle' });
    const small = await smallTargets(page);
    if (small.length === 0) {
      pass('375px ' + route.name + ' — every target at least 44px');
    } else {
      for (const t of small) {
        fail('375px ' + route.name + ' — target ' + t.w + 'x' + t.h + 'px: "' + t.label + '"');
      }
    }

    // Sideways scroll on a phone. Nothing here was catching it, and the
    // landing header had been overflowing by 59px unnoticed.
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      if (de.scrollWidth <= de.clientWidth) return null;
      let worst = null;
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        // Skip anything inside a horizontal scroller or a clip: the tab strip
        // is SUPPOSED to run past the viewport, and it is far wider than the
        // real offender, so without this it wins every time and the actual
        // cause never gets named.
        let clipped = false;
        for (let n = el.parentElement; n && n !== de; n = n.parentElement) {
          const ox = getComputedStyle(n).overflowX;
          if (ox !== 'visible') { clipped = true; break; }
        }
        if (clipped) continue;
        const r = el.getBoundingClientRect();
        const over = Math.round(Math.max(r.right - de.clientWidth, -r.left));
        if (over > 1 && (!worst || over > worst.over)) {
          worst = { over, tag: el.tagName, cls: String((el as HTMLElement).className).slice(0, 48) };
        }
      }
      return { by: de.scrollWidth - de.clientWidth, worst };
    });
    overflow === null
      ? pass('375px ' + route.name + ' — no horizontal scroll')
      : fail(
          '375px ' + route.name + ' — scrolls sideways by ' + overflow.by + 'px, widest offender ' +
            (overflow.worst ? overflow.worst.tag + '.' + overflow.worst.cls : 'unknown'),
        );
  }

  // The scrubber is the signature interaction and the plan promises a full
  // keyboard path through it. Arrow steps a month, Home/End jump to bounds.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE + '/timeline', { waitUntil: 'networkidle' });
  const thumb = page.locator('[role="slider"]');
  await thumb.focus();
  const before = await thumb.getAttribute('aria-valuenow');
  await page.keyboard.press('ArrowRight');
  const afterRight = await thumb.getAttribute('aria-valuenow');
  await page.keyboard.press('End');
  const afterEnd = await thumb.getAttribute('aria-valuenow');
  await page.keyboard.press('Home');
  const afterHome = await thumb.getAttribute('aria-valuenow');
  const valuetext = await thumb.getAttribute('aria-valuetext');

  Number(afterRight) === Number(before) + 1
    ? pass('scrubber: arrow key steps one month')
    : fail('scrubber: arrow key moved ' + before + ' to ' + afterRight);
  afterEnd === '36' ? pass('scrubber: End jumps to the last month') : fail('scrubber: End gave ' + afterEnd);
  afterHome === '0' ? pass('scrubber: Home jumps to day one') : fail('scrubber: Home gave ' + afterHome);
  valuetext && /month/i.test(valuetext)
    ? pass('scrubber: announces a value, not a bare number (' + valuetext + ')')
    : fail('scrubber: aria-valuetext is ' + valuetext);

  // Hindi, on every route. The toggle is global now, so a surface that was
  // never wired renders English chrome inside a lang="hi" document, which is
  // both a translation bug and an accessibility one: a screen reader will read
  // English words with a Hindi voice.
  const hiCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await hiCtx.addCookies([
    { name: 'anubandh_locale', value: 'hi', url: BASE },
  ]);
  const hiPage = await hiCtx.newPage();
  for (const route of ROUTES) {
    if (route.path.startsWith('/states')) continue; // dev-only surface
    await hiPage.goto(BASE + route.path, { waitUntil: 'networkidle' });
    const htmlLang = await hiPage.getAttribute('html', 'lang');
    const heading = (await hiPage.locator('h1').first().textContent()) ?? '';
    const navText = (await hiPage.locator('nav').first().textContent().catch(() => '')) ?? '';

    if (htmlLang !== 'hi') { fail('hindi ' + route.name + ': html lang is ' + htmlLang); continue; }
    if (!devanagari(heading)) { fail('hindi ' + route.name + ': heading is still English (' + heading.slice(0, 40) + ')'); continue; }
    if (navText && !devanagari(navText)) { fail('hindi ' + route.name + ': navigation is still English'); continue; }
    pass('hindi ' + route.name + ' — heading and chrome translated');
  }
  await hiCtx.close();

  // The language toggle, CLICKED. Asserting the cookie is not enough: the bug
  // that shipped set the cookie correctly and changed nothing on screen,
  // because next/link served the destination from the client router cache. So
  // this checks what the reader actually sees, on a page with a query string,
  // which also has to survive the round trip.
  const tgl = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tglPage = await tgl.newPage();
  await tglPage.goto(BASE + '/document?clause=n_postterm_restraint', { waitUntil: 'networkidle' });

  const headingNow = async () => (await tglPage.locator('h1').first().textContent()) ?? '';
  const langNow = async () => await tglPage.getAttribute('html', 'lang');

  const enHeading = await headingNow();
  await tglPage.getByRole('link', { name: 'हिन्दी' }).click();
  await tglPage.waitForLoadState('networkidle');
  const hiHeading = await headingNow();
  const hiLang = await langNow();
  const hiUrl = new URL(tglPage.url());

  hiLang === 'hi' && hiHeading !== enHeading && devanagari(hiHeading)
    ? pass('language toggle: clicking Hindi actually re-renders the page')
    : fail('language toggle: clicked Hindi but the page still reads "' + hiHeading.slice(0, 30) + '" (lang=' + hiLang + ')');

  hiUrl.pathname + hiUrl.search === '/document?clause=n_postterm_restraint'
    ? pass('language toggle: the query string survives the switch')
    : fail('language toggle: landed on ' + hiUrl.pathname + hiUrl.search);

  await tglPage.getByRole('link', { name: 'English' }).click();
  await tglPage.waitForLoadState('networkidle');
  const backHeading = await headingNow();
  (await langNow()) === 'en' && backHeading === enHeading
    ? pass('language toggle: switching back returns to English')
    : fail('language toggle: switching back gave "' + backHeading.slice(0, 30) + '"');
  await tgl.close();

  // A real pointer drag on the scrubber. Smooth scrolling is a scroll hijack
  // mounted app-wide, and a horizontal drag inside a vertically-scrolling page
  // is the classic gesture conflict — so this asserts the drag still moves the
  // handle and does NOT scroll the page out from under the reader.
  await page.goto(BASE + '/timeline', { waitUntil: 'networkidle' });
  const box = await page.locator('[role="slider"]').boundingBox();
  // Slider.Root carries data-orientation. The thumb's PARENT is an internal
  // wrapper with the same 44x44 box, so measuring that gives a 44px 'track'
  // and a full-width drag looks like it barely moved. That false alarm cost
  // real time; the assertion below is now proportional so it cannot repeat.
  const trackBox = await page.locator('span[data-orientation="horizontal"]').first().boundingBox();
  if (!box || !trackBox) {
    fail('scrubber: could not locate the handle to drag');
  } else {
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(trackBox.x + trackBox.width * 0.75, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    const endValue = Number(await page.locator('[role="slider"]').getAttribute('aria-valuenow'));
    const scrollAfter = await page.evaluate(() => window.scrollY);
    // 'It moved' is too weak: a drag that nudges one month regardless of
    // distance passes that and is useless. This asserts the handle TRACKS the
    // pointer, within two months of where 75% of the track should land.
    const expected = Math.round(36 * 0.75);
    Math.abs(endValue - expected) <= 2
      ? pass('scrubber: pointer drag tracked to month ' + endValue + ' (75% of track, expected about ' + expected + ')')
      : fail('scrubber: drag to 75% landed on month ' + endValue + ', expected about ' + expected);
    Math.abs(scrollAfter - scrollBefore) < 8
      ? pass('scrubber: dragging did not scroll the page')
      : fail('scrubber: dragging scrolled the page by ' + (scrollAfter - scrollBefore) + 'px');
  }

  // prefers-reduced-motion is promised on every animation. The global CSS rule
  // covers transitions; Motion's spring is JS and opts out through
  // useReducedMotion, so both paths are checked rather than assumed.
  const rm = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
  const rmPage = await rm.newPage();
  await rmPage.goto(BASE + '/timeline', { waitUntil: 'networkidle' });
  const durations = await rmPage.evaluate(() => {
    const out: number[] = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      for (const raw of cs.transitionDuration.split(',')) {
        const v = raw.trim();
        if (!v || v === '0s') continue;
        out.push(v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000);
      }
    }
    return out;
  });
  const longest = durations.length ? Math.max(...durations) : 0;
  longest <= 1
    ? pass('reduced motion: transitions collapse to ' + longest + 'ms')
    : fail('reduced motion: a transition still runs for ' + longest + 'ms');

  // The border trails loop forever, so under reduced motion they must not
  // exist at all. Slowing an infinite animation down is not honouring the
  // setting, it is just a slower version of the thing it asked us to stop.
  const trailRoutes = ['/', '/radar', '/prepare'];
  let trailsUnderReduce = 0;
  for (const route of trailRoutes) {
    await rmPage.goto(BASE + route, { waitUntil: 'networkidle' });
    trailsUnderReduce += await rmPage.evaluate(() =>
      document.querySelectorAll('[style*="offset-path"]').length,
    );
  }
  // Same routes with motion allowed, so a zero above cannot be a broken query.
  let trailsWithMotion = 0;
  for (const route of trailRoutes) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    trailsWithMotion += await page.evaluate(() =>
      document.querySelectorAll('[style*="offset-path"]').length,
    );
  }
  trailsUnderReduce === 0 && trailsWithMotion > 0
    ? pass('reduced motion: ' + trailsWithMotion + ' border trails render normally, 0 under reduce')
    : fail('reduced motion: ' + trailsUnderReduce + ' border trails under reduce, ' + trailsWithMotion + ' with motion');

  // TextRoll swaps its whole markup under reduced motion: no per-character
  // spans, no visually hidden duplicate, just the string. So the check is not
  // only that the animation stopped but that the HEADINGS ARE STILL THERE —
  // the failure mode of that branch is a page of empty headings.
  const rollShape = async (p: typeof page) => {
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    return p.evaluate(() => {
      const wanted = ['The same clause', 'Why you can check us', 'What it will not do', 'See it on a real offer letter'];
      const texts = Array.from(document.querySelectorAll('h2'), (h) => (h.textContent || ''));
      return {
        chars: document.querySelectorAll('h2 span.sr-only').length,
        found: wanted.filter((w) => texts.some((t) => t.includes(w))).length,
        wanted: wanted.length,
      };
    });
  };
  const rollReduced = await rollShape(rmPage);
  const rollMotion = await rollShape(page);
  rollReduced.chars === 0 &&
  rollMotion.chars === 4 &&
  rollReduced.found === rollReduced.wanted &&
  rollMotion.found === rollMotion.wanted
    ? pass('reduced motion: 4 rolled headings become plain text, all still readable')
    : fail(
        'reduced motion: rolled headings are ' + JSON.stringify({ reduce: rollReduced, motion: rollMotion }),
      );

  // Same again for the five in-app page headings, which roll vertically rather
  // than turning over. Each must be one rolled h1 with motion, plain text
  // without, and never an empty heading either way.
  const ROLLED_H1 = ['/radar', '/document', '/timeline', '/ask', '/prepare'];
  const h1Shape = async (p: typeof page, route: string) => {
    await p.goto(BASE + route, { waitUntil: 'networkidle' });
    return p.evaluate(() => {
      const h1 = document.querySelector('h1');
      return {
        rolled: document.querySelectorAll('h1 span.sr-only').length,
        text: (h1 ? h1.textContent || '' : '').trim().length,
      };
    });
  };
  let h1Problems = 0;
  for (const route of ROLLED_H1) {
    const withMotion = await h1Shape(page, route);
    const underReduce = await h1Shape(rmPage, route);
    const ok =
      withMotion.rolled === 1 &&
      underReduce.rolled === 0 &&
      withMotion.text > 0 &&
      underReduce.text > 0;
    if (!ok) {
      h1Problems++;
      fail(
        'reduced motion: ' + route + ' heading is ' +
          JSON.stringify({ motion: withMotion, reduce: underReduce }),
      );
    }
  }
  if (h1Problems === 0) {
    pass('reduced motion: 5 rolled page headings become plain text, all still readable');
  }
  await rm.close();

  // Skip link is the first stop, and it must become visible when focused.
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  const skip = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { text: (el.textContent ?? '').trim(), visible: r.width > 1 && r.height > 1 };
  });
  skip && /skip/i.test(skip.text) && skip.visible
    ? pass('skip link is the first tab stop and is visible when focused')
    : fail('first tab stop is ' + JSON.stringify(skip));

  // The accordion is hand-wired ARIA over a copy-paste primitive, so it gets
  // the same treatment as the scrubber: keyboard operation and the trigger/
  // panel relationship asserted rather than assumed.
  await page.goto(BASE + String.fromCharCode(47), { waitUntil: "networkidle" });
  const triggers = page.locator("[data-accordion] button[aria-expanded][aria-controls]");
  const triggerCount = await triggers.count();
  triggerCount === 4
    ? pass("accordion: 4 triggers expose aria-expanded and aria-controls")
    : fail("accordion: expected exactly 4 triggers, found " + triggerCount);

  const firstTrigger = triggers.first();
  const accPanelId = await firstTrigger.getAttribute("aria-controls");
  // Attribute selector, not an id selector: React useId emits guillemets,
  // which are not valid unescaped in a CSS id.
  const accPanel = page.locator("[id=" + JSON.stringify(accPanelId) + "]");
  const accLabelledBy = await accPanel.getAttribute("aria-labelledby");
  const accTriggerId = await firstTrigger.getAttribute("id");
  (await accPanel.count()) === 1 && accTriggerId && accLabelledBy === accTriggerId
    ? pass("accordion: the open panel is a region labelled by its own trigger")
    : fail("accordion: wiring is " + JSON.stringify({ accPanelId, accLabelledBy, accTriggerId }));

  // Keyboard, not click. A div with an onClick passes a click test and strands
  // every keyboard user.
  await firstTrigger.focus();
  await page.keyboard.press("Enter");
  const accShut = await firstTrigger.getAttribute("aria-expanded");
  await page.keyboard.press("Enter");
  const accOpen = await firstTrigger.getAttribute("aria-expanded");
  accShut === "false" && accOpen === "true"
    ? pass("accordion: Enter closes the panel and opens it again")
    : fail("accordion: Enter left aria-expanded at " + accShut + " then " + accOpen);

  // Let the 200ms transition finish first. Sampling straight after the click
  // caught the chevron mid-flight at 88.57deg and failed a working animation —
  // and it only started failing when unrelated components made the page
  // heavier, which is the signature of a timing bug in the test.
  await page.waitForTimeout(500);

  // Read off rotate, NOT transform. Tailwind v4 compiles rotate-90 to the
  // independent rotate property, so computed transform stays "none" on a
  // chevron that is turning perfectly well. Checking transform here reports a
  // working animation as broken, which is exactly what happened once already.
  const chevron = await page.evaluate(() => {
    const open = document.querySelector("[data-accordion] button[aria-expanded='true'] svg");
    const shut = document.querySelector("[data-accordion] button[aria-expanded='false'] svg");
    return {
      open: open ? getComputedStyle(open).rotate : null,
      shut: shut ? getComputedStyle(shut).rotate : null,
    };
  });
  // Degrees with a tolerance, not a string match: the exact serialisation is
  // not the thing under test, the turn is.
  const openDeg = parseFloat(String(chevron.open));
  Math.abs(openDeg - 90) < 1.5 && chevron.shut === "none"
    ? pass("accordion: the chevron turns on the open item only (" + openDeg.toFixed(1) + "deg)")
    : fail("accordion: chevron rotate is " + JSON.stringify(chevron));
  // The waiting state on Ask. It only exists between submitting a question and
  // the answer arriving, so nothing else in this suite ever sees it.
  const askPending = async (reduced: boolean) => {
    const c = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: reduced ? "reduce" : "no-preference",
    });
    const p = await c.newPage();
    await p.goto(BASE + "/ask", { waitUntil: "networkidle" });
    await p.fill("#ask-input", "What happens if I leave early?");
    await p.click("button[type=submit]");
    // waitForFunction, not waitForSelector then evaluate. The waiting state
    // lasts about a second, and the gap between those two calls was long
    // enough for it to vanish in between — the check reported a state that had
    // simply already finished as missing. This captures it in one step.
    const handle = await p.waitForFunction(() => {
      const st = document.querySelector("[role=status]");
      if (!st) return false;
      const sr = st.querySelector(".sr-only");
      return {
        live: st.getAttribute("aria-live"),
        message: (sr ? sr.textContent || "" : (st.textContent || "")).trim(),
        animatedChars: st.querySelectorAll("[aria-hidden=true] span").length,
      };
    }, { timeout: 4000 });
    const seen = (await handle.jsonValue()) as
      | { live: string | null; message: string; animatedChars: number }
      | null;
    // And it has to go away again when the answer lands.
    await p.waitForSelector("[role=status]", { state: "detached", timeout: 6000 }).catch(() => {});
    const cleared = (await p.locator("[role=status]").count()) === 0;
    await c.close();
    return { seen, cleared };
  };

  const askMotion = await askPending(false);
  const askReduced = await askPending(true);

  askMotion.seen && askMotion.seen.live === "polite" && askMotion.seen.message.length > 0 && askMotion.seen.animatedChars > 0
    ? pass("ask: the waiting message is a polite status region with " + askMotion.seen.animatedChars + " animated characters")
    : fail("ask: waiting state with motion is " + JSON.stringify(askMotion.seen));

  // Reduced motion must keep the MESSAGE and drop only the animation. The
  // failure mode of that branch is a silent wait with nothing on screen.
  askReduced.seen && askReduced.seen.message.length > 0 && askReduced.seen.animatedChars === 0
    ? pass("ask: under reduced motion the waiting message stays and the wave does not")
    : fail("ask: waiting state under reduce is " + JSON.stringify(askReduced.seen));

  askMotion.cleared && askReduced.cleared
    ? pass("ask: the waiting message clears once the answer arrives")
    : fail("ask: waiting message still on screen after the answer");
  // The intake pipeline while it is running. Every route in ROUTES is a
  // resting state; this one only exists for about seventeen seconds after a
  // click, so axe has never once looked at it — which is exactly how it ended
  // up shipping a heading with no accessible name.
  const running = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const runPage = await running.newPage();
  // tsx compiles with keepNames, which wraps inner arrow functions in a
  // __name() helper that exists in the bundle and not in the browser. Without
  // this shim the walk() below throws ReferenceError before running a line.
  await runPage.addInitScript({ content: "globalThis.__name = globalThis.__name || function (f) { return f; };" });
  await runPage.goto(BASE + "/upload", { waitUntil: "networkidle" });
  await runPage.getByRole("button", { name: /offer letter/i }).first().click();
  await runPage.waitForSelector("ol li", { timeout: 5000 });

  const named = await runPage.evaluate(() => {
    const h1 = document.querySelector("h1");
    if (!h1) return null;
    // What a screen reader would get: text that is not inside aria-hidden.
    const walk = (node: Element): string => {
      if (node.getAttribute("aria-hidden") === "true") return "";
      let out = "";
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) out += child.textContent || "";
        else if (child.nodeType === 1) out += walk(child as Element);
      }
      return out;
    };
    return { accessible: walk(h1).trim(), visible: (h1.textContent || "").trim().length > 0 };
  });

  named && named.accessible.length > 0 && named.visible
    ? pass('intake running: the stage heading has an accessible name ("' + named.accessible + '")')
    : fail("intake running: stage heading is " + JSON.stringify(named));

  await runPage.addScriptTag({ content: AXE_SOURCE });
  const runResults = (await runPage.evaluate(async () => {
    // @ts-expect-error injected at runtime
    return await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
  })) as { violations: Violation[] };
  if (runResults.violations.length === 0) {
    pass("intake running — no axe violations in the pipeline state");
  } else {
    for (const v of runResults.violations) {
      fail("intake running — " + v.id + " (" + (v.impact ?? "unknown") + "): " + v.help);
    }
  }
  await running.close();
  await browser.close();

  console.log(
    failed === 0 ? '\nAccessibility check passed.\n' : '\nAccessibility check FAILED — ' + failed + ' problem(s).\n',
  );
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
