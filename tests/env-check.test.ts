import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingProductionEnv, assertProductionEnv } from '@/lib/env-check';

/**
 * The guard that turns "every upload returns 500 in production" into "the build
 * failed, and here is the variable". The first deploy shipped with none of the
 * variables set and nothing said so.
 */

const COMPLETE = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  SESSION_SECRET: 'x'.repeat(32),
  DATABASE_URL: 'postgresql://u:p@host:6543/postgres',
  GEMINI_API_KEY: 'k',
  CRON_SECRET: 'c',
};

test('the deploy that actually shipped is refused, with every missing variable named', () => {
  // What production had: Vercel set, nothing else.
  const missing = missingProductionEnv({ VERCEL: '1', VERCEL_ENV: 'production' });
  const names = missing.map((m) => m.split(' ')[0]);
  assert.deepEqual(names, ['SESSION_SECRET', 'DATABASE_URL', 'GEMINI_API_KEY', 'CRON_SECRET']);
});

test('a complete production environment passes', () => {
  assert.deepEqual(missingProductionEnv(COMPLETE), []);
  assert.doesNotThrow(() => assertProductionEnv(COMPLETE));
});

test('a short secret is as bad as none, because the app refuses it at runtime', () => {
  // lib/session.ts rejects anything under 16 characters in production. The
  // build must agree with the runtime, or it passes a deploy that 500s.
  const missing = missingProductionEnv({ ...COMPLETE, SESSION_SECRET: 'short' });
  assert.equal(missing.length, 1);
  assert.ok(missing[0].startsWith('SESSION_SECRET'));
  assert.deepEqual(missingProductionEnv({ ...COMPLETE, SESSION_SECRET: 'x'.repeat(16) }), []);
});

test('each variable is required on its own', () => {
  for (const key of ['SESSION_SECRET', 'DATABASE_URL', 'GEMINI_API_KEY', 'CRON_SECRET'] as const) {
    const env = { ...COMPLETE, [key]: undefined };
    const missing = missingProductionEnv(env);
    assert.equal(missing.length, 1, key + ' alone was not reported');
    assert.ok(missing[0].startsWith(key));
  }
});

test('local builds, CI and preview deploys are not blocked', () => {
  // `next build` on a laptop runs with NODE_ENV=production and no VERCEL; CI
  // builds with no credentials on purpose. Neither receives documents.
  assert.deepEqual(missingProductionEnv({}), []);
  assert.deepEqual(missingProductionEnv({ NODE_ENV: 'production' }), []);
  assert.deepEqual(missingProductionEnv({ VERCEL: '1', VERCEL_ENV: 'preview' }), []);
  assert.deepEqual(missingProductionEnv({ VERCEL: '1', VERCEL_ENV: 'development' }), []);
});

test('the error says where to fix it', () => {
  assert.throws(
    () => assertProductionEnv({ VERCEL: '1', VERCEL_ENV: 'production' }),
    (e: Error) => /Environment Variables/.test(e.message) && /SESSION_SECRET/.test(e.message),
  );
});

test('no secret value ever appears in the message', () => {
  // A build log is not a place for a secret, even one that is too short.
  let message = '';
  try {
    assertProductionEnv({ ...COMPLETE, SESSION_SECRET: 'tooShortSecret', DATABASE_URL: undefined });
  } catch (e) {
    message = (e as Error).message;
  }
  assert.ok(message.length > 0);
  assert.ok(!message.includes('tooShortSecret'), 'the rejected secret was printed');
});
