-- Indexes for the column every query in this app filters on.
--
-- Row level security adds `session_id = app_session_id()` to every read and
-- write on these three tables — that is the whole ownership model — but none
-- of them had an index on session_id. So every request scanned every row of
-- every session to find its own, and "the current analysis" (the newest row
-- for this session) scanned and SORTED the whole table on every page load.
-- At demo scale that is invisible. It is also exactly how a small app gets
-- slower with every reader it has ever had, until the 24-hour purge catches
-- up — and the purge runs once a day.
--
-- These are usable against the policy only because app_session_id() is
-- declared STABLE in 0001: the planner evaluates it once per statement and
-- compares against the index, where a VOLATILE function would force a check
-- row by row and leave the index unused.

create index if not exists documents_session_idx on documents (session_id);
create index if not exists jobs_session_idx      on jobs (session_id);

-- Composite, because the hot query is "newest analysis for this session":
-- the index hands back that session's rows already in created_at order, so
-- `order by created_at desc limit 1` reads one entry instead of sorting.
create index if not exists analyses_session_created_idx on analyses (session_id, created_at desc);
