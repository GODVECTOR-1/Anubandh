-- The role the application actually runs as.
--
-- 0001 turned on row level security and FORCEd it, which binds the table owner.
-- That is still not enough: Supabase hands out a connection as `postgres`, and
-- that role carries rolbypassrls, which skips every policy regardless of FORCE.
-- The result was total — every session could read every row, and nothing about
-- it looked different, because the policies were present and correct and simply
-- never consulted.
--
-- It went unnoticed because the check that should have caught it was run
-- against a table with no other session's rows in it, where "sees nothing"
-- is true whether or not the policy fires.
--
-- The fix is to stop running as a role that can bypass. `anubandh_app` cannot;
-- lib/db.ts does `set local role anubandh_app` at the top of every transaction,
-- which is transaction-scoped and so cannot leak across a pooled connection.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anubandh_app') then
    -- nologin: nothing connects AS this role, the app switches INTO it.
    -- A new role is NOBYPASSRLS and NOSUPERUSER by default, which is the
    -- whole point of it. Setting those explicitly needs superuser, which
    -- Supabase's `postgres` is not — so they are asserted below instead.
    create role anubandh_app nologin;
  end if;
end $$;

-- The one property this role exists to have. If a future migration or a
-- console click ever grants it the bypass, every policy silently stops being
-- consulted, so the migration refuses to complete rather than hand that back.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anubandh_app' and (rolbypassrls or rolsuper)) then
    raise exception 'anubandh_app must not have BYPASSRLS or SUPERUSER — it would skip every row level security policy';
  end if;
end $$;

grant usage on schema public to anubandh_app;
grant select, insert, update, delete on documents, jobs, analyses to anubandh_app;
grant execute on function app_session_id() to anubandh_app;
grant execute on function purge_expired() to anubandh_app;

-- `postgres` must be a member of the role to be allowed to SET ROLE to it.
grant anubandh_app to postgres;

-- ───────────────────────────── the purge, again ─────────────────────────────
--
-- 0001 gave documents a DELETE policy (`purge_after < now()`) and made
-- purge_expired() run as its caller. That does not work once the caller is a
-- role without the bypass, because Postgres applies the SELECT policies to the
-- rows a DELETE's WHERE clause examines — and no SELECT policy matches a row
-- the purge does not own. The delete found nothing and reported success.
--
-- Widening SELECT to cover expired rows would make every reader's document
-- readable by anyone for the last hours of its life, which is the opposite of
-- what the 24-hour promise means. So the elevation is given to the ONE
-- operation that needs it instead: a definer function that takes no arguments
-- and can only ever delete rows that are already past their retention window.

drop policy if exists purge_expired_documents on documents;

create or replace function purge_expired() returns integer
  language plpgsql
  security definer            -- runs as the owner, which may see every row
  set search_path = public
  as $$
  declare n integer;
  begin
    delete from documents where purge_after < now();
    get diagnostics n = row_count;      -- cascades clear jobs and analyses
    return n;
  end $$;

revoke all on function purge_expired() from public;
grant execute on function purge_expired() to anubandh_app;
