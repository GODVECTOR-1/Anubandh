-- Somewhere to keep an extraction that has already been paid for.
--
-- A transient upstream failure hands the job back for one retry. Without this
-- that retry starts from the top and re-extracts a document that had already
-- been read successfully — paying for the expensive call a second time because
-- the call that actually failed was the LATER one.
--
-- Safe to reuse rather than an approximation: a document is immutable once
-- normalised (nothing updates `normalized` after the upload writes it), so the
-- input to extraction cannot have changed between attempts.
--
-- On the documents row rather than a table of its own. It has the same owner,
-- the same lifetime and the same 24-hour purge as the text it was extracted
-- from, and a separate table would need its own policy saying exactly that.
-- It inherits `session_owns_documents` and the cascade for free.
alter table documents add column if not exists extraction jsonb;

comment on column documents.extraction is
  'Model extraction for this document, reused by a retry so the call is paid for once. Same lifetime and owner as the row; cleared with it by purge_expired().';
