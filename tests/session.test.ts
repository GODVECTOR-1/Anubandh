import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSessionCookie, serializeSessionCookie, newSessionId } from '@/lib/session';

/**
 * The signed session cookie is the ONLY thing separating one reader's contract
 * from another's, so it gets the most adversarial tests in the suite.
 *
 * These are unit tests on purpose. check-backend proves the cookie is sent with
 * the right attributes over real HTTP; what it cannot easily do is hand the
 * parser a hundred malformed and forged values and watch each one be refused.
 */

const ID = '3f1a9c62-4d7b-4a1e-9c3d-8b2e5f7a6d10';

test('a cookie this server signed round-trips to the same id', () => {
  assert.equal(parseSessionCookie(serializeSessionCookie(ID)), ID);
});

test('a freshly minted id is a uuid and survives a round trip', () => {
  const id = newSessionId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(parseSessionCookie(serializeSessionCookie(id)), id);
});

test('swapping the id for someone else’s is refused', () => {
  // The whole attack in one line: keep a valid signature, change whose
  // document it points at. If this ever returns the other id, every document
  // in the database is readable by anyone who can edit a cookie.
  const victim = '00000000-1111-4222-8333-444444444444';
  const forged = victim + '.' + serializeSessionCookie(ID).split('.')[1];
  assert.equal(parseSessionCookie(forged), null);
});

test('an unsigned id is refused', () => {
  assert.equal(parseSessionCookie(ID), null);
  assert.equal(parseSessionCookie(ID + '.'), null);
});

test('a tampered signature is refused, one character at a time', () => {
  const good = serializeSessionCookie(ID);
  const [id, mac] = good.split('.');
  for (let i = 0; i < mac.length; i += 7) {
    const ch = mac[i] === '0' ? '1' : '0';
    const bad = id + '.' + mac.slice(0, i) + ch + mac.slice(i + 1);
    assert.equal(parseSessionCookie(bad), null, 'accepted a signature altered at index ' + i);
  }
});

test('a signature of the wrong length is refused without throwing', () => {
  const [id, mac] = serializeSessionCookie(ID).split('.');
  assert.equal(parseSessionCookie(id + '.' + mac.slice(0, -1)), null);
  assert.equal(parseSessionCookie(id + '.' + mac + 'ff'), null);
  // timingSafeEqual throws on a length mismatch; the parser must catch that
  // rather than turn a malformed cookie into a 500.
  assert.equal(parseSessionCookie(id + '.zz'), null);
});

test('a value that is not a uuid is refused however it is signed', () => {
  for (const bad of [
    'not-a-uuid',
    '../../etc/passwd',
    "'; drop table documents; --",
    '<script>alert(1)</script>',
    '3f1a9c62-4d7b-4a1e-9c3d-8b2e5f7a6d10x',
    ' ' + ID,
  ]) {
    assert.equal(parseSessionCookie(serializeSessionCookie(bad)), null, 'accepted ' + bad);
  }
});

test('empty, missing and separator-only values are refused', () => {
  assert.equal(parseSessionCookie(undefined), null);
  assert.equal(parseSessionCookie(''), null);
  assert.equal(parseSessionCookie('.'), null);
  assert.equal(parseSessionCookie('..'), null);
  assert.equal(parseSessionCookie('.' + ID), null);
});

test('the id is normalised to lower case, so ownership cannot fork on case', () => {
  // Postgres compares uuids by value, but app.session_id is set as TEXT. If the
  // parser returned mixed case, the same reader could hold two identities that
  // RLS treats as different people.
  const upper = ID.toUpperCase();
  assert.equal(parseSessionCookie(serializeSessionCookie(upper)), ID);
});
