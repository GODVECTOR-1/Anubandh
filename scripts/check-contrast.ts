/**
 * WCAG contrast, measured against the real tokens in app/globals.css.
 *
 * The token file claims AA in both themes in a comment. A comment is not a
 * measurement, and a palette drifts one hex at a time — so this parses the
 * actual CSS and computes the ratios for every pair the UI really renders.
 *
 *   npm run check:contrast
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');

/** Pull the custom properties out of one rule block. */
function tokensIn(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector);
  if (start < 0) throw new Error('selector not found in globals.css: ' + selector);
  const open = CSS.indexOf('{', start);
  const close = CSS.indexOf('}', open);
  const body = CSS.slice(open + 1, close);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2];
  // Glass tokens are rgb(... / a), not hex, so the matcher above skips them.
  // Captured generically rather than by the one exact prefix '--glass:' —
  // that version silently dropped --glass-card and reported it as missing.
  for (const line of body.split(String.fromCharCode(10))) {
    const t = line.trim();
    if (!t.startsWith('--')) continue;
    const colon = t.indexOf(':');
    if (colon < 0) continue;
    const name = t.slice(2, colon).trim();
    const value = t.slice(colon + 1).replace(';', '').trim();
    if (value.startsWith('rgb')) out[name] = value;
  }
  return out;
}

const light = tokensIn(':root {');
// Dark mode was removed. The second set of values to prove is no longer a
// theme but the CARD, which inverts its own subtree. This mirrors the .card
// rule in globals.css; if the two ever drift, this script is measuring a card
// the app does not render.
const card: Record<string, string> = {
  ...light,
  surface: light['card'],
  'surface-sunk': light['on-card-sunk'],
  ink: light['on-card'],
  'ink-muted': light['on-card-muted'],
  'ink-faint': light['on-card-faint'],
  rule: light['on-card-rule'],
  'rule-strong': light['on-card-rule-strong'],
  act: light['act-on-card'],
  'act-bg': light['act-bg-on-card'],
  ask: light['ask-on-card'],
  'ask-bg': light['ask-bg-on-card'],
  know: light['know-on-card'],
  'know-bg': light['know-bg-on-card'],
  statutory: light['statutory-on-card'],
  asymmetry: light['asymmetry-on-card'],
  caution: light['ask-on-card'],
  'caution-bg': light['ask-bg-on-card'],
  reduced: light['act-on-card'],
  'reduced-bg': light['act-bg-on-card'],
  focus: light['statutory-on-card'],
  accent: '#4d5896',
};

/** Composites a translucent token over an opaque backdrop. Glass is measured
 *  against the colour the reader actually sees, not against the surface token
 *  it is derived from: at 80% over paper those differ, and the difference is
 *  exactly where a glass card stops clearing AA. */
function compositeGlass(glass: string, backdropHex: string): string | null {
  // Parsed with string operations, not a regex. A regex here is how this file
  // silently lost its backslashes once already, and a contrast checker that
  // fails open is worse than no contrast checker.
  const inner = glass.slice(glass.indexOf('(') + 1, glass.lastIndexOf(')'));
  const [rgbPart, alphaPart] = inner.split('/');
  if (!alphaPart) return null;
  const rgb = rgbPart.trim().split(' ').filter(Boolean).map(Number);
  const a = Number(alphaPart.trim());
  if (rgb.length !== 3 || rgb.some(Number.isNaN) || Number.isNaN(a)) return null;
  const back = [1, 3, 5].map((i) => parseInt(backdropHex.slice(i, i + 2), 16));
  const out = rgb.map((c, i) => Math.round(c * a + back[i] * (1 - a)));
  return '#' + out.map((c) => c.toString(16).padStart(2, '0')).join('');
}

function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = v.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Every pair the UI actually puts on screen. `large` marks text rendered at
 * 18.66px bold or 24px+, where AA is 3.0 rather than 4.5.
 */
/** Pairs that occur on the PAGE: the mint desk and the two section washes. */
const PAIRS: Array<{ fg: string; bg: string; where: string; large?: boolean }> = [
  { fg: 'ink', bg: 'paper', where: 'body text on the desk' },
  { fg: 'ink-muted', bg: 'paper', where: 'secondary text on the desk' },
  { fg: 'ink-faint', bg: 'paper', where: 'metadata on the desk' },

  { fg: 'act', bg: 'paper', where: 'act on this, on the desk' },
  { fg: 'ask', bg: 'paper', where: 'ask about this, on the desk' },
  { fg: 'know', bg: 'paper', where: 'know about this, on the desk' },

  { fg: 'accent', bg: 'paper', where: 'accent text on the desk' },
  { fg: 'accent', bg: 'accent-bg', where: 'accent on its own tint' },
  { fg: 'accent', bg: 'sand', where: 'accent over a sand section' },
  { fg: 'accent', bg: 'emerald-wash', where: 'accent over an emerald wash' },
  { fg: 'ink', bg: 'accent-bg', where: 'body text on an accent tint' },
  { fg: 'ink-muted', bg: 'accent-bg', where: 'secondary text on an accent tint' },
  { fg: 'ink-faint', bg: 'accent-bg', where: 'eyebrows on an accent tint' },
  { fg: 'ink', bg: 'sand', where: 'body text on a sand section' },
  { fg: 'ink-muted', bg: 'sand', where: 'secondary text on a sand section' },
  { fg: 'ink-faint', bg: 'sand', where: 'eyebrows on a sand section' },
  { fg: 'ink', bg: 'emerald-wash', where: 'body text on an emerald wash' },
  { fg: 'ink-muted', bg: 'emerald-wash', where: 'secondary text on an emerald wash' },
  { fg: 'ink-faint', bg: 'emerald-wash', where: 'eyebrows on an emerald wash' },
  { fg: 'paper', bg: 'accent', where: 'label on a primary action' },
  { fg: 'on-ink-muted', bg: 'accent', where: 'body text in the closing section' },
  { fg: 'focus', bg: 'paper', where: 'focus ring on the desk' },
];

/** Pairs that occur ON A CARD, which is dark. Same names, inverted values —
    see the .card rule, which re-points each token to its on-card twin. */
const CARD_PAIRS: Array<{ fg: string; bg: string; where: string; large?: boolean }> = [
  { fg: 'ink', bg: 'surface', where: 'card body text' },
  { fg: 'ink-muted', bg: 'surface', where: 'card secondary text' },
  { fg: 'ink-faint', bg: 'surface', where: 'provenance chips' },
  { fg: 'ink-muted', bg: 'surface-sunk', where: 'statute block body' },
  { fg: 'ink-faint', bg: 'surface-sunk', where: 'citation chip quote' },
  { fg: 'act', bg: 'surface', where: 'act on this, on a card' },
  { fg: 'ask', bg: 'surface', where: 'ask about this, on a card' },
  { fg: 'ask', bg: 'ask-bg', where: 'assumption header' },
  { fg: 'know', bg: 'surface', where: 'know about this, on a card' },
  { fg: 'statutory', bg: 'surface', where: 'cited-to-law tag and links' },
  { fg: 'statutory', bg: 'surface-sunk', where: 'statute heading' },
  { fg: 'asymmetry', bg: 'surface', where: 'structural-not-cited tag' },
  { fg: 'asymmetry', bg: 'surface-sunk', where: 'why this stood out' },
  { fg: 'caution', bg: 'caution-bg', where: 'coverage strip, cautionary' },
  { fg: 'reduced', bg: 'reduced-bg', where: 'coverage strip, reduced' },
  { fg: 'reduced', bg: 'surface', where: 'card stub heading' },
  { fg: 'paper', bg: 'accent', where: 'label on a primary action inside a card' },
  { fg: 'focus', bg: 'surface', where: 'focus ring on a card' },
];

let failed = 0;
console.log('\nWCAG contrast — measured from app/globals.css\n');

console.log('');

for (const [themeName, tokens, list] of [
  ['page', light, PAIRS],
  ['card', card, CARD_PAIRS],
] as const) {
  console.log('  ' + themeName);
  for (const pair of list) {
    const fg = tokens[pair.fg];
    const bg = tokens[pair.bg];
    if (!fg || !bg) {
      console.error('    FAIL  missing token in ' + themeName + ': ' + pair.fg + ' or ' + pair.bg);
      failed++;
      continue;
    }
    // The focus ring is a 2px outline, judged as a non-text UI component: AA
    // asks 3.0 for those, not 4.5.
    const isUi = pair.fg === 'focus';
    const floor = pair.large || isUi ? 3 : 4.5;
    const r = ratio(fg, bg);
    const ok = r >= floor;
    if (!ok) failed++;
    console.log(
      '    ' +
        (ok ? 'ok  ' : 'FAIL') +
        '  ' +
        r.toFixed(2).padStart(5) +
        ':1  (needs ' +
        floor.toFixed(1) +
        ')  ' +
        pair.fg +
        ' on ' +
        pair.bg +
        ' — ' +
        pair.where,
    );
  }
  // Glass surfaces: the reader sees text on glass composited over the page,
  // and on a flag card that glass sits over a moving 3D scene. Measured
  // against the worst realistic backdrop, which is the page itself.
  // Glass is the sticky chrome only: header, tab bar, footer. The flag card
  // was frosted once and measured too low over the mint page, so it is opaque.
  if (themeName !== 'page') continue;
  const glassOn = tokens.glass ? compositeGlass(tokens.glass, tokens.paper) : null;
  if (!glassOn) {
    console.error('    FAIL  no --glass token found in ' + themeName);
    failed++;
  } else {
    for (const fg of ['ink', 'ink-muted', 'ink-faint', 'act', 'ask', 'statutory'] as const) {
      const r = ratio(tokens[fg], glassOn);
      const ok = r >= 4.5;
      if (!ok) failed++;
      console.log(
        '    ' + (ok ? 'ok  ' : 'FAIL') + '  ' + r.toFixed(2).padStart(5) +
          ':1  (needs 4.5)  ' + fg + ' on glass ' + glassOn + ' — frosted chrome and flag cards',
      );
    }
  }

  console.log('');
}

console.log(
  failed === 0
    ? 'Contrast check passed: ' + PAIRS.length * 2 + ' pairs clear WCAG AA.\n'
    : 'Contrast check FAILED — ' + failed + ' pair(s) below AA.\n',
);
process.exit(failed === 0 ? 0 : 1);
