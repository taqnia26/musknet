-- MANUAL OPERATION ONLY: run on the SAME production database described in the report.
-- Supersedes master-sales-cleanup-2026-09-27.sql for that database.
-- No connection strings or production rows are embedded in this file.
-- Requires a client that stops on the FIRST error and executes this entire file
-- on ONE connection. On an error before COMMIT, issue ROLLBACK; do not continue.
-- Deletes 82 posted entries, 246 lines, 82 audits ONLY if every guard passes.
-- This removes posted accounting and audit history; finance must approve the
-- effect of 141896.5843 SAR on EACH side of the trial balance.
-- The permanent archive is in master_sales_recovery, outside public/Drizzle's
-- schema definitions. Never drop it automatically; retain until finance signs off.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.journal_entries, public.journal_entry_lines, public.journal_entry_audit IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE master_sales_targets ON COMMIT DROP AS
  SELECT id, source_id FROM public.journal_entries
   WHERE source_type = 'historical_import'
     AND source_id LIKE 'ff316fd33b56c91c4a383043:%';
CREATE TEMP TABLE master_sales_other_count ON COMMIT DROP AS
  SELECT count(*) AS n FROM public.journal_entries
   WHERE id NOT IN (SELECT id FROM master_sales_targets);

DO $guard$
DECLARE
  source_digest text;
  content_digest text;
  debit_total numeric;
  credit_total numeric;
BEGIN
  SELECT md5(string_agg(source_id, E'\n' ORDER BY source_id COLLATE "C"))
    INTO source_digest FROM master_sales_targets;
  IF (SELECT count(*) FROM master_sales_targets) <> 82
     OR source_digest IS DISTINCT FROM 'faaa3461391af9d218ba37bf5b42daf4' THEN
    RAISE EXCEPTION 'Master Sales source identity/count differs; no deletion';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.journal_entries e JOIN master_sales_targets t ON t.id = e.id
     WHERE e.status <> 'posted' OR e.reversal_of_entry_id IS NOT NULL
        OR e.source_type <> 'historical_import'
        OR e.source_id !~ '^ff316fd33b56c91c4a383043:row-[0-9]+:barcode-[0-9]+:month-20[0-9][0-9]-(0[1-9]|1[0-2])$'
  ) OR EXISTS (
    SELECT 1 FROM public.journal_entries e
     WHERE e.reversal_of_entry_id IN (SELECT id FROM master_sales_targets)
  ) THEN
    RAISE EXCEPTION 'Status, source format or reversal references changed; no deletion';
  END IF;
  IF (SELECT count(*) FROM public.journal_entry_lines
       WHERE journal_entry_id IN (SELECT id FROM master_sales_targets)) <> 246
     OR (SELECT count(*) FROM public.journal_entry_audit
       WHERE journal_entry_id IN (SELECT id FROM master_sales_targets)) <> 82
     OR EXISTS (
       SELECT 1 FROM master_sales_targets t
        WHERE (SELECT count(*) FROM public.journal_entry_lines l WHERE l.journal_entry_id = t.id) <> 3
           OR (SELECT count(*) FROM public.journal_entry_audit a WHERE a.journal_entry_id = t.id) <> 1
     ) THEN
    RAISE EXCEPTION 'Dependent row counts changed; no deletion';
  END IF;
  IF (SELECT count(*) FROM pg_constraint
       WHERE contype = 'f' AND confrelid = 'public.journal_entries'::regclass) <> 3
     OR EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE contype = 'f' AND confrelid = 'public.journal_entries'::regclass
          AND conrelid NOT IN (
            'public.journal_entries'::regclass, 'public.journal_entry_lines'::regclass,
            'public.journal_entry_audit'::regclass
          )
     ) OR EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name IN ('journal_entry_id', 'reversal_of_entry_id')
          AND table_name NOT IN ('journal_entries', 'journal_entry_lines', 'journal_entry_audit')
     ) THEN
    RAISE EXCEPTION 'New journal references found; no deletion';
  END IF;
  IF (SELECT count(*) FROM pg_trigger
       WHERE tgrelid IN ('public.journal_entries'::regclass, 'public.journal_entry_lines'::regclass)
         AND tgname IN (
           'journal_entries_immutable', 'journal_entry_lines_immutable',
           'journal_entries_balanced', 'journal_entry_lines_balanced'
         ) AND tgenabled = 'O') <> 4 THEN
    RAISE EXCEPTION 'Accounting protection triggers are not all enabled; no deletion';
  END IF;
  SELECT coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0),
         md5(string_agg(t.source_id || '|' || l.line_number::text || '|' ||
                        l.debit::text || '|' || l.credit::text,
                        E'\n' ORDER BY t.source_id COLLATE "C", l.line_number))
    INTO debit_total, credit_total, content_digest
    FROM master_sales_targets t
    JOIN public.journal_entry_lines l ON l.journal_entry_id = t.id;
  IF debit_total <> 141896.5843 OR credit_total <> 141896.5843
     OR content_digest IS DISTINCT FROM '8f48f3f73f82029baf4861b9aa1c1ede' THEN
    RAISE EXCEPTION 'Master Sales line amounts/checksum differ; no deletion';
  END IF;
END $guard$;

-- CREATE SCHEMA (without IF NOT EXISTS) aborts if an older archive is present.
-- The DDL and the deletion share this transaction: a failure rolls both back.
CREATE SCHEMA master_sales_recovery;
CREATE TABLE master_sales_recovery.journal_entries AS
  SELECT e.* FROM public.journal_entries e JOIN master_sales_targets t ON t.id = e.id;
CREATE TABLE master_sales_recovery.journal_entry_lines AS
  SELECT l.* FROM public.journal_entry_lines l JOIN master_sales_targets t ON t.id = l.journal_entry_id;
CREATE TABLE master_sales_recovery.journal_entry_audit AS
  SELECT a.* FROM public.journal_entry_audit a JOIN master_sales_targets t ON t.id = a.journal_entry_id;
-- Additional full-row integrity seals detect accidental edits to descriptions,
-- accounts or audit changes before a later restore. IDs are excluded from
-- these hashes; the copied rows themselves still retain the original IDs.
CREATE TABLE master_sales_recovery.integrity_manifest AS
  SELECT
    (SELECT md5(string_agg(e.source_id || '|' || (to_jsonb(e) - 'id')::text,
                           E'\n' ORDER BY e.source_id COLLATE "C"))
       FROM master_sales_recovery.journal_entries e) AS entries_digest,
    (SELECT md5(string_agg(e.source_id || '|' || (to_jsonb(l) - 'id' - 'journal_entry_id')::text,
                           E'\n' ORDER BY e.source_id COLLATE "C", l.line_number))
       FROM master_sales_recovery.journal_entry_lines l
       JOIN master_sales_recovery.journal_entries e ON e.id = l.journal_entry_id) AS lines_digest,
    (SELECT md5(string_agg(e.source_id || '|' || (to_jsonb(a) - 'id' - 'journal_entry_id')::text,
                           E'\n' ORDER BY e.source_id COLLATE "C"))
       FROM master_sales_recovery.journal_entry_audit a
       JOIN master_sales_recovery.journal_entries e ON e.id = a.journal_entry_id) AS audit_digest;

DO $verify_copy$
DECLARE
  copied_digest text;
  source_digest text;
  debit_total numeric;
  credit_total numeric;
BEGIN
  SELECT md5(string_agg(source_id, E'\n' ORDER BY source_id COLLATE "C"))
    INTO source_digest FROM master_sales_recovery.journal_entries;
  SELECT coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0),
         md5(string_agg(e.source_id || '|' || l.line_number::text || '|' ||
                        l.debit::text || '|' || l.credit::text,
                        E'\n' ORDER BY e.source_id COLLATE "C", l.line_number))
    INTO debit_total, credit_total, copied_digest
    FROM master_sales_recovery.journal_entries e
    JOIN master_sales_recovery.journal_entry_lines l ON l.journal_entry_id = e.id;
  IF (SELECT count(*) FROM master_sales_recovery.journal_entries) <> 82
     OR (SELECT count(*) FROM master_sales_recovery.journal_entry_lines) <> 246
     OR (SELECT count(*) FROM master_sales_recovery.journal_entry_audit) <> 82
     OR (SELECT count(*) FROM master_sales_recovery.integrity_manifest) <> 1
     OR source_digest IS DISTINCT FROM 'faaa3461391af9d218ba37bf5b42daf4'
     OR debit_total <> 141896.5843 OR credit_total <> 141896.5843
     OR copied_digest IS DISTINCT FROM '8f48f3f73f82029baf4861b9aa1c1ede'
     OR EXISTS (
       (SELECT e.* FROM master_sales_recovery.journal_entries e
        EXCEPT ALL SELECT e.* FROM public.journal_entries e JOIN master_sales_targets t ON t.id = e.id)
     ) OR EXISTS (
       (SELECT l.* FROM master_sales_recovery.journal_entry_lines l
        EXCEPT ALL SELECT l.* FROM public.journal_entry_lines l JOIN master_sales_targets t ON t.id = l.journal_entry_id)
     ) OR EXISTS (
       (SELECT a.* FROM master_sales_recovery.journal_entry_audit a
        EXCEPT ALL SELECT a.* FROM public.journal_entry_audit a JOIN master_sales_targets t ON t.id = a.journal_entry_id)
     ) THEN
    RAISE EXCEPTION 'Archive copy is incomplete or different; no deletion';
  END IF;
END $verify_copy$;

ALTER TABLE public.journal_entry_lines DISABLE TRIGGER journal_entry_lines_immutable;
ALTER TABLE public.journal_entries DISABLE TRIGGER journal_entries_immutable;

DO $delete$
DECLARE affected integer;
BEGIN
  DELETE FROM public.journal_entry_audit WHERE journal_entry_id IN (SELECT id FROM master_sales_targets);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 82 THEN RAISE EXCEPTION 'Expected 82 audits, deleted %', affected; END IF;
  DELETE FROM public.journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM master_sales_targets);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 246 THEN RAISE EXCEPTION 'Expected 246 lines, deleted %', affected; END IF;
  DELETE FROM public.journal_entries
   WHERE id IN (SELECT id FROM master_sales_targets)
     AND source_type = 'historical_import'
     AND source_id LIKE 'ff316fd33b56c91c4a383043:%';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 82 THEN RAISE EXCEPTION 'Expected 82 entries, deleted %', affected; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id IN (SELECT id FROM master_sales_targets))
     OR EXISTS (SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM master_sales_targets))
     OR EXISTS (SELECT 1 FROM public.journal_entry_audit WHERE journal_entry_id IN (SELECT id FROM master_sales_targets))
     OR (SELECT count(*) FROM public.journal_entries WHERE id NOT IN (SELECT id FROM master_sales_targets))
         <> (SELECT n FROM master_sales_other_count) THEN
    RAISE EXCEPTION 'Post-delete check failed; transaction will roll back';
  END IF;
END $delete$;

-- Force deferred balance checks while still locked, then re-enable BOTH guards
-- before commit. A failed check rolls back deletion, archive DDL and trigger DDL.
SET CONSTRAINTS journal_entries_balanced, journal_entry_lines_balanced IMMEDIATE;
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER journal_entry_lines_immutable;
ALTER TABLE public.journal_entries ENABLE TRIGGER journal_entries_immutable;
COMMIT;

-- Verify after COMMIT; do not drop the recovery schema after finance signs off.
SELECT (SELECT count(*) FROM master_sales_recovery.journal_entries) AS archived_entries,
       (SELECT count(*) FROM master_sales_recovery.journal_entry_lines) AS archived_lines,
       (SELECT count(*) FROM master_sales_recovery.journal_entry_audit) AS archived_audits,
       (SELECT count(*) FROM public.journal_entries
         WHERE source_type = 'historical_import'
           AND source_id LIKE 'ff316fd33b56c91c4a383043:%') AS remaining_target_entries;
SELECT tgname, tgenabled FROM pg_trigger
 WHERE tgrelid IN ('public.journal_entries'::regclass, 'public.journal_entry_lines'::regclass)
   AND tgname IN ('journal_entries_immutable', 'journal_entry_lines_immutable')
 ORDER BY tgname;