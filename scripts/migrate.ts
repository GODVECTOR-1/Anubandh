/**
 * Applies supabase/migrations/*.sql in filename order.
 *
 * No ledger table, because every migration in this repo is written to be
 * idempotent — `create table if not exists`, `drop policy if exists` before
 * each `create policy`, `create or replace function`. Re-running them is a
 * no-op, which is a cheaper guarantee to keep than a ledger to reconcile.
 *
 *   npm run migrate
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('\nDATABASE_URL is not set — nothing to migrate.\n');
    process.exit(1);
  }

  const { Client } = await import('pg');
  // Migrations run as the owner, deliberately: they create the very role the
  // application later switches into, and that role cannot create itself.
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('\nApplying migrations\n');
  let failed = 0;

  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await client.query(readFileSync(join(DIR, file), 'utf8'));
      console.log('  ok    ' + file);
    } catch (e) {
      failed++;
      console.log('  FAIL  ' + file + ' — ' + String((e as Error)?.message).slice(0, 200));
    }
  }

  await client.end();
  console.log(failed === 0 ? '\nMigrations applied.\n' : '\n' + failed + ' migration(s) failed.\n');
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
