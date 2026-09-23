-- Abuse control for the two routes that spend money.
--
-- Both /api/documents and /api/ask are anonymous by design and both reach
-- Gemini, so without a limiter one loop drains the project's quota and the
-- owner's card. The contract has carried `rate_limited` since day one and
-- lib/mock-job.ts has the copy for it; this is the half that was missing.
--
-- KEYED ON THE CALLER'S NETWORK, NOT THE SESSION. A session id lives in a
-- cookie the caller controls, so limiting per session asks the abuser to
-- please keep their cookie. The bucket is derived from the forwarded address
-- instead.
--
-- The address is never stored. lib/ratelimit.ts puts an HMAC of it in
-- `bucket`, keyed with SESSION_SECRET, so this table holds no personal data
-- and cannot be turned back into a list of who used the service — which is
-- the same promise the 24-hour purge makes about documents.

create table if not exists rate_limits (
  bucket       text primary key,
  count        integer not null default 0,
  window_start timestamptz not null default now()
);

-- The purge sweeps by age; without this it is a sequential scan of every
-- bucket ever created.
create index if not exists rate_limits_window_idx on rate_limits (window_start);

alter table rate_limits enable row level security;
alter table rate_limits force row level security;

-- No session OWNS a rate-limit row, so there is nothing to compare
-- app.session_id against and the policy is deliberately unconditional. What
-- keeps it safe is the grant below: only anubandh_app can reach the table at
-- all, and the rows are opaque hashes and integers rather than anyone's data.
-- Writing `using (true)` explicitly is better than leaving RLS off, because a
-- table with RLS disabled looks like an oversight next to the three that force
-- it, and the next person has to work out which it was.
drop policy if exists app_manages_rate_limits on rate_limits;
create policy app_manages_rate_limits on rate_limits using (true) with check (true);

grant select, insert, update, delete on rate_limits to anubandh_app;

-- ───────────────────────────── purge, extended ─────────────────────────────
--
-- Spent buckets are litter: the window has closed, the count no longer gates
-- anything, and the row stays until something removes it. The existing cron
-- already runs hourly, so it sweeps these too rather than earning a second
-- schedule.
--
-- The return value is still the DOCUMENT count. The route reports it and the
-- backend gate asserts on it, so folding a second number into it would change
-- what that assertion means.
create or replace function purge_expired() returns integer
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare n integer;
  begin
    delete from documents where purge_after < now();
    get diagnostics n = row_count;      -- cascades clear jobs and analyses
    -- A day is far longer than any window this app sets; anything older than
    -- that is certainly closed.
    delete from rate_limits where window_start < now() - interval '1 day';
    return n;
  end $$;

revoke all on function purge_expired() from public;
grant execute on function purge_expired() to anubandh_app;
