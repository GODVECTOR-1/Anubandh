/**
 * Import this FIRST, before anything that reaches lib/db.
 *
 * HAS_DB is read once at module load, so a test that wants the in-process
 * store has to clear the variable before that module is evaluated. Import
 * order is the mechanism: ESM and CJS both run a module's side effects in
 * import order, so this file executing first is guaranteed, whereas a
 * `delete` written inside the test file would run after the hoisted imports
 * and the tests would quietly start hitting Postgres.
 */
delete process.env.DATABASE_URL;
export {};
