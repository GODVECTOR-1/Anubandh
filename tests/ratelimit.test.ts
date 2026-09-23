import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The limiter is the only thing standing between an anonymous POST and the
 * project's Gemini bill, so it is tested against the two ways limiters usually
 * fail: the key can be forged, or the window never closes.
 *
 * DATABASE_URL is cleared before the module loads so these exercise the
 * in-process path deterministically; see tests/helpers/no-db.ts for why that
 * is an import rather than a line of code in this file.
 */
import './helpers/no-db';
import { callerKey, rateLimit } from '@/lib/ratelimit';

const headers = (h: Record<string, string>) => new Headers(h);

/* ───────────────────────────── the key ───────────────────────────── */

test('the RIGHTMOST forwarded address is used, not the first', () => {
  // A client can put anything in x-forwarded-for; only the entry the edge
  // appended is trustworthy. Taking the first would let an abuser rotate
  // "1.1.1.1, 2.2.2.2, ..." and get a fresh bucket on every request.
  assert.equal(callerKey(headers({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' })), '203.0.113.7');
  assert.equal(callerKey(headers({ 'x-forwarded-for': '203.0.113.7' })), '203.0.113.7');
});

test('a spoofed chain cannot change the bucket the edge decided', () => {
  const real = '203.0.113.7';
  const a = callerKey(headers({ 'x-forwarded-for': `evil, ${real}` }));
  const b = callerKey(headers({ 'x-forwarded-for': `other, junk, ${real}` }));
  assert.equal(a, b, 'prepending entries changed the key');
});

test('whitespace and empty entries do not create new keys', () => {
  assert.equal(callerKey(headers({ 'x-forwarded-for': '  203.0.113.7  ' })), '203.0.113.7');
  assert.equal(callerKey(headers({ 'x-forwarded-for': '1.1.1.1, ,203.0.113.7' })), '203.0.113.7');
});

test('it falls back to x-real-ip, then to a constant', () => {
  assert.equal(callerKey(headers({ 'x-real-ip': '198.51.100.4' })), '198.51.100.4');
  assert.equal(callerKey(headers({})), 'unknown');
  // An empty header must not read as an address.
  assert.equal(callerKey(headers({ 'x-forwarded-for': '', 'x-real-ip': '198.51.100.4' })), '198.51.100.4');
});

/* ──────────────────────────── the window ──────────────────────────── */

test('the limit allows exactly N and refuses the next one', async () => {
  const key = 'window-' + Math.random();
  for (let i = 1; i <= 3; i++) {
    const v = await rateLimit('t', key, 3, 60);
    assert.equal(v.ok, true, 'refused request ' + i + ' of an allowance of 3');
  }
  const over = await rateLimit('t', key, 3, 60);
  assert.equal(over.ok, false);
  if (!over.ok) {
    assert.ok(over.retryAfter > 0, 'retryAfter must tell the caller when to come back');
    assert.ok(over.retryAfter <= 60, 'retryAfter must not exceed the window');
  }
});

test('two callers do not share an allowance', async () => {
  const a = 'a-' + Math.random();
  const b = 'b-' + Math.random();
  assert.equal((await rateLimit('t', a, 1, 60)).ok, true);
  assert.equal((await rateLimit('t', a, 1, 60)).ok, false);
  // b must be untouched by a having exhausted its own bucket.
  assert.equal((await rateLimit('t', b, 1, 60)).ok, true);
});

test('scopes are independent, so asking does not consume uploads', async () => {
  const key = 'scope-' + Math.random();
  assert.equal((await rateLimit('upload', key, 1, 60)).ok, true);
  assert.equal((await rateLimit('upload', key, 1, 60)).ok, false);
  assert.equal((await rateLimit('ask', key, 1, 60)).ok, true);
});

test('the window reopens once it has passed', async () => {
  const key = 'expiry-' + Math.random();
  // A one-second window, so this is a real expiry rather than a mocked clock.
  assert.equal((await rateLimit('t', key, 1, 1)).ok, true);
  assert.equal((await rateLimit('t', key, 1, 1)).ok, false);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal((await rateLimit('t', key, 1, 1)).ok, true, 'the window never reopened');
});

test('the stored bucket is a hash, never the address itself', async () => {
  // The table must not become a log of who used the service. If the raw
  // address ever appears as a key, this fails.
  const g = globalThis as typeof globalThis & { __anubandhRate?: Map<string, unknown> };
  const address = '203.0.113.99';
  await rateLimit('t', address, 5, 60);
  const keys = [...(g.__anubandhRate?.keys() ?? [])];
  assert.ok(keys.length > 0, 'nothing was recorded');
  assert.ok(!keys.some((k) => k.includes(address)), 'the raw address was stored as a key');
});
