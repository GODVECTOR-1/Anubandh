-- Anubandh — tables, ownership, purge.
--
-- Ownership is an anonymous session id carried in a signed httpOnly cookie and
-- pushed into `app.session_id` for the life of one transaction. No column the
-- client can choose, no user table, no login. See docs/BACKEND-SPEC.md §5.

create extension if not exists pgcrypto;

create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null,
  filename      text not null,
  byte_size     integer not null,
  normalized    text,                 -- the NORMALIZE output; spans cite into this
  -- The rest of what NORMALIZE produced: page_offsets, offset_map, sha256,
  -- source_kind, page_count. The route back to the reader's own page only
  -- exists at normalisation time, and the expensive stages run on a later
  -- request, so it is persisted rather than recomputed from text it cannot see.
  normalize_meta jsonb,
  created_at    timestamptz not null default now(),
  purge_after   timestamptz not null default now() + interval '24 hours'
);

create table if not exists jobs (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id) on delete cascade,
  session_id    uuid not null,
  stage         text not null check (stage in ('reading','extracting','verifying','checking_law')),
  status        text not null check (status in ('queued','running','done','failed','cancelled','timed_out')),
  deadline_at   timestamptz not null,
  error_code    text,
  counts        jsonb,
  -- The one-click samples on the intake screen, and the failure paths the UI
  -- has to be able to render. Null for a real upload. It lives here rather than
  -- in the client so that a demo run takes the same transport, the same
  -- ownership check and the same lazy transitions as a real one.
  scenario      text,
  created_at    timestamptz not null default now()
);

create table if not exists analyses (
  document_id    uuid primary key references documents(id) on delete cascade,
  session_id     uuid not null,
  payload        jsonb not null,      -- a full AnalysisPayload, zod-validated on write
  schema_version integer not null,
  created_at     timestamptz not null default now()
);

create index if not exists documents_purge_after_idx on documents (purge_after);
create index if not exists jobs_document_id_idx       on jobs (document_id);

-- ─────────────────────────── row level security ───────────────────────────
--
-- FORCE, not just ENABLE. A plain `enable` leaves the table OWNER exempt, and
-- Supabase hands out a connection as the owner — so without FORCE the policies
-- below would be decoration on every connection this app actually opens.

alter table documents enable row level security;
alter table jobs      enable row level security;
alter table analyses  enable row level security;

alter table documents force row level security;
alter table jobs      force row level security;
alter table analyses  force row level security;

-- `nullif` before the cast: an unset GUC reads back as '' and ''::uuid raises,
-- which would turn "no session" into a 500 instead of an empty result set.
create or replace function app_session_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.session_id', true), '')::uuid $$;

drop policy if exists session_owns_documents on documents;
create policy session_owns_documents on documents
  using (session_id = app_session_id())
  with check (session_id = app_session_id());

drop policy if exists session_owns_jobs on jobs;
create policy session_owns_jobs on jobs
  using (session_id = app_session_id())
  with check (session_id = app_session_id());

drop policy if exists session_owns_analyses on analyses;
create policy session_owns_analyses on analyses
  using (session_id = app_session_id())
  with check (session_id = app_session_id());

-- ───────────────────────────── the 24h purge ─────────────────────────────
--
-- The cron has no session of its own, and FORCE row level security binds the
-- table owner too — so a `security definer` function would run as the owner and
-- still match no rows, deleting nothing while reporting success. The honest fix
-- is a policy that says what the purge is actually allowed to do.
--
-- This widens DELETE only, and only to rows whose retention window has already
-- expired: rows the landing page has already promised are gone. No SELECT
-- policy is loosened, so nothing becomes readable that was not readable before.
-- Deletes on jobs and analyses come through the cascade, which runs as a
-- referential action and is not subject to RLS.

drop policy if exists purge_expired_documents on documents;
create policy purge_expired_documents on documents
  for delete
  using (purge_after < now());

create or replace function purge_expired() returns integer
  language plpgsql
  set search_path = public
  as $$
  declare n integer;
  begin
    delete from documents where purge_after < now();
    get diagnostics n = row_count;      -- cascades clear jobs and analyses
    return n;
  end $$;
