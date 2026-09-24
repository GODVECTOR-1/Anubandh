/**
 * What a PRODUCTION deploy cannot run without, checked before it is built.
 *
 * The first Vercel deploy shipped with none of these set. It built, it served
 * the landing page, and every upload failed with a bare 500 in 12ms — because
 * lib/session.ts refuses to sign a cookie without a secret, and every upload
 * signs one. Nothing said which variable was missing; finding it took a probe
 * against production. The failure was real and correct. The silence was not.
 *
 * So a production build that is missing any of these now fails, with the list,
 * in the build log — where it costs a redeploy rather than a debugging session,
 * and where Vercel keeps the last good deployment serving meanwhile.
 *
 * A pure function over an env object so it can be tested without a build.
 */

type Env = Record<string, string | undefined>;

export function missingProductionEnv(env: Env): string[] {
  // Only a real Vercel PRODUCTION build. Local `next build` runs with
  // NODE_ENV=production too, and CI builds on purpose with no credentials —
  // neither is a deploy anyone will send a document to.
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production') return [];

  const missing: string[] = [];

  if ((env.SESSION_SECRET ?? '').length < 16) {
    missing.push(
      'SESSION_SECRET — 16+ characters. Every upload signs a session cookie with it; without it every upload returns 500.',
    );
  }
  if (!env.DATABASE_URL) {
    missing.push(
      'DATABASE_URL — serverless instances share no memory, so without a database an upload stored on one instance is not found by the poll that lands on another.',
    );
  }
  if (!env.GEMINI_API_KEY) {
    missing.push('GEMINI_API_KEY — no real document can be read without it; only the samples would work.');
  }
  if (!env.CRON_SECRET) {
    missing.push(
      'CRON_SECRET — the purge route refuses every caller without it, including Vercel\'s own cron, so nothing uploaded is ever deleted.',
    );
  }

  return missing;
}

export function assertProductionEnv(env: Env = process.env): void {
  const missing = missingProductionEnv(env);
  if (missing.length === 0) return;
  throw new Error(
    'This production deploy is missing environment variables it cannot run without:\n\n  - ' +
      missing.join('\n  - ') +
      '\n\nSet them in Vercel: Project → Settings → Environment Variables, scope Production, then redeploy.\n',
  );
}
