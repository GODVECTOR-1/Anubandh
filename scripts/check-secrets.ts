/**
 * The secret-leak gate.
 *
 * app/layout.tsx says "a CI grep fails the build on that prefix so no key can
 * ever reach the browser". That grep did not exist — it was a comment
 * describing a gate nobody had built. This is the gate.
 *
 * It matters most now, not earlier: the frontend has no keys, but the backend
 * is about to be written against a real Gemini key and a real Supabase service
 * role key, by agents editing this tree. The failure mode is quiet and total —
 * a key that reaches the client bundle is public the moment it is deployed, and
 * nothing about the page looks different.
 *
 * Four checks, each of which has a specific way of going wrong:
 *
 *   1. NEXT_PUBLIC_ anywhere in source. In Next.js that prefix is what INLINES
 *      a value into the client bundle. It is the single mechanism by which a
 *      server secret becomes a public one.
 *   2. process.env read inside a 'use client' module. Same outcome by another
 *      route: anything a client component reads is either inlined or undefined,
 *      and the first is a leak while the second is a bug.
 *   3. An env file tracked by git. .gitignore covers .env*, but a -f add or a
 *      renamed file defeats it, and a committed key is a rotated key.
 *   4. Live-looking credentials in source. Shapes only, no allowlist of real
 *      values — the point is to catch a key pasted "just for a second".
 *
 *   npm run check:secrets
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'out', 'dist', 'coverage']);
const SOURCE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

let failed = 0;
const pass = (m: string) => console.log('  ok    ' + m);
const fail = (m: string) => {
  failed++;
  console.log('  FAIL  ' + m);
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) sourceFiles(full, out);
    else if (SOURCE_EXT.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

/** Credential shapes. Deliberately narrow: a rule that fires on every long
 *  string gets switched off within a week and then protects nothing. */
const SECRET_SHAPES: Array<{ name: string; test: (s: string) => boolean }> = [
  { name: 'Google/Gemini API key', test: (s) => /\bAIza[0-9A-Za-z_-]{30,}/.test(s) },
  { name: 'OpenAI key', test: (s) => /\bsk-[A-Za-z0-9]{20,}/.test(s) },
  { name: 'JWT (Supabase anon/service tokens are JWTs)', test: (s) => /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(s) },
  { name: 'Supabase service_role reference', test: (s) => /service_role["'\s:=]+[A-Za-z0-9._-]{20,}/.test(s) },
  { name: 'AWS access key id', test: (s) => /\bAKIA[0-9A-Z]{16}\b/.test(s) },
  { name: 'Generic assigned secret', test: (s) => /(api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/i.test(s) },
];

function run() {
  console.log('\nSecret-leak gate\n');
  const files = sourceFiles(ROOT);

  // 1. NEXT_PUBLIC_
  const publicHits: string[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f).split('\\').join('/');
    if (rel.startsWith('scripts/check-secrets')) continue;
    const src = readFileSync(f, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (!line.includes('NEXT_PUBLIC_')) return;
      // A comment explaining the rule is not a violation of it.
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      publicHits.push(rel + ':' + (i + 1) + '  ' + t.slice(0, 90));
    });
  }
  publicHits.length === 0
    ? pass('no NEXT_PUBLIC_ in source — nothing is inlined into the client bundle')
    : publicHits.forEach((h) => fail('NEXT_PUBLIC_ would inline a value into the browser: ' + h));

  // 2. process.env inside client modules
  const clientEnv: string[] = [];
  for (const f of files) {
    if (!/\.(tsx|jsx|ts|js)$/.test(f)) continue;
    const src = readFileSync(f, 'utf8');
    const head = src.slice(0, 400);
    if (!/^\s*['"]use client['"]/m.test(head)) continue;
    src.split('\n').forEach((line, i) => {
      if (/process\.env\.[A-Z]/.test(line)) {
        clientEnv.push(relative(ROOT, f).split('\\').join('/') + ':' + (i + 1) + '  ' + line.trim().slice(0, 90));
      }
    });
  }
  clientEnv.length === 0
    ? pass("no 'use client' module reads process.env")
    : clientEnv.forEach((h) => fail('client component reads env — inlined or undefined, both wrong: ' + h));

  // 3. env files under version control
  let tracked: string[] = [];
  try {
    const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
    tracked = out.split('\n').filter((p) => /(^|\/)\.env($|\.)/.test(p) && !p.endsWith('.example'));
  } catch {
    // Not a git repo, or git unavailable: nothing to assert.
  }
  tracked.length === 0
    ? pass('no .env file is tracked by git (.env.example is allowed)')
    : tracked.forEach((p) => fail('env file is committed — treat the key as burned and rotate it: ' + p));

  // 4. Credential shapes in source
  const shaped: string[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f).split('\\').join('/');
    if (rel.startsWith('scripts/check-secrets')) continue;
    if (rel === 'package-lock.json') continue;
    const src = readFileSync(f, 'utf8');
    for (const shape of SECRET_SHAPES) {
      if (shape.test(src)) shaped.push(rel + ' — looks like a ' + shape.name);
    }
  }
  shaped.length === 0
    ? pass('no live-looking credentials in source')
    : shaped.forEach((h) => fail(h));

  console.log(
    failed === 0
      ? '\nSecret-leak gate passed.\n'
      : '\nSecret-leak gate FAILED — ' + failed + ' problem(s). Do not commit.\n',
  );
  process.exit(failed === 0 ? 0 : 1);
}

run();
