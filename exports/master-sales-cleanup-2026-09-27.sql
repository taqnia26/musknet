-- OBSOLETE: do not run. Use master-sales-cleanup-with-db-archive.sql
-- only after checking master-sales-preflight-readonly.sql on the exact target.
BEGIN;
DO $obsolete$ BEGIN RAISE EXCEPTION 'Obsolete cleanup: use the same-transaction database archive version'; END $obsolete$;
-- MANUAL PRODUCTION OPERATION ONLY. Do not run in development or automatically.
-- Scope: the single Master Sales file with SHA-256
-- ff316fd33b56c91c4a383043b3b7013e17d5ea3bf6d49c2e6fab92b623b1a6d5.
-- Download and retain master-sales-journals-backup-2026-09-27.json FIRST.
-- Expected effect: remove 82 posted journals, 246 lines, 82 audit rows.
-- Trial-balance debit/credit totals decrease by 141896.5843 SAR on each side.
-- WARNING: this deliberately removes posted accounting history and audit records.
-- Run as a SINGLE script against the PRODUCTION database only, with an SQL client
-- that stops on error. If an error occurs before COMMIT, issue ROLLBACK.
-- If COMMIT succeeds but either ENABLE TRIGGER statement does not run, execute
-- the two ENABLE TRIGGER statements below immediately before allowing writes.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE journal_entries, journal_entry_lines, journal_entry_audit IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE master_sales_cleanup_targets ON COMMIT DROP AS
  SELECT id, source_id
    FROM journal_entries
   WHERE source_type = 'historical_import'
     AND source_id LIKE 'ff316fd33b56c91c4a383043:%';

CREATE TEMP TABLE master_sales_cleanup_guard ON COMMIT DROP AS
  SELECT count(*) AS other_entries
    FROM journal_entries
   WHERE id NOT IN (SELECT id FROM master_sales_cleanup_targets);

DO $guard$
DECLARE
  identity_digest text;
  debit_total numeric;
  credit_total numeric;
BEGIN
  SELECT md5(string_agg(id::text || ':' || source_id, E'\n' ORDER BY id))
    INTO identity_digest FROM master_sales_cleanup_targets;
  IF (SELECT count(*) FROM master_sales_cleanup_targets) <> 82
     OR identity_digest IS DISTINCT FROM '4c187b5979e2469f9682d060f5bdeab4' THEN
    RAISE EXCEPTION 'Master Sales identity or entry count changed; no records deleted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM journal_entries e JOIN master_sales_cleanup_targets t ON t.id = e.id
     WHERE e.status <> 'posted' OR e.reversal_of_entry_id IS NOT NULL
        OR e.source_type <> 'historical_import'
        OR e.source_id !~ '^ff316fd33b56c91c4a383043:row-[0-9]+:barcode-[0-9]+:month-20[0-9][0-9]-(0[1-9]|1[0-2])$'
  ) OR EXISTS (
    SELECT 1 FROM journal_entries e
     WHERE e.reversal_of_entry_id IN (SELECT id FROM master_sales_cleanup_targets)
  ) THEN
    RAISE EXCEPTION 'Master Sales status, source format or reversal references changed; no records deleted';
  END IF;
  IF (SELECT count(*) FROM journal_entry_lines
       WHERE journal_entry_id IN (SELECT id FROM master_sales_cleanup_targets)) <> 246
     OR (SELECT count(*) FROM journal_entry_audit
       WHERE journal_entry_id IN (SELECT id FROM master_sales_cleanup_targets)) <> 82
     OR EXISTS (
       SELECT 1 FROM master_sales_cleanup_targets t
        WHERE (SELECT count(*) FROM journal_entry_lines l WHERE l.journal_entry_id = t.id) <> 3
           OR (SELECT count(*) FROM journal_entry_audit a WHERE a.journal_entry_id = t.id) <> 1
     ) THEN
    RAISE EXCEPTION 'Master Sales dependent row counts changed; no records deleted';
  END IF;
  -- New FK or journal_entry_id columns require a fresh review; never cascade.
  IF (SELECT count(*) FROM pg_constraint
       WHERE contype = 'f' AND confrelid = 'journal_entries'::regclass) <> 3
     OR EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE contype = 'f' AND confrelid = 'journal_entries'::regclass
          AND conrelid NOT IN (
            'journal_entries'::regclass, 'journal_entry_lines'::regclass,
            'journal_entry_audit'::regclass
          )
     ) OR EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name IN ('journal_entry_id', 'reversal_of_entry_id')
          AND table_name NOT IN ('journal_entries', 'journal_entry_lines', 'journal_entry_audit')
     ) THEN
    RAISE EXCEPTION 'New journal references found; no records deleted';
  END IF;
  IF (SELECT count(*) FROM pg_trigger
       WHERE tgname IN (
         'journal_entries_immutable', 'journal_entry_lines_immutable',
         'journal_entries_balanced', 'journal_entry_lines_balanced'
       ) AND tgenabled = 'O') <> 4 THEN
    RAISE EXCEPTION 'Accounting protection triggers are not all enabled; no records deleted';
  END IF;
  SELECT coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
    INTO debit_total, credit_total
    FROM journal_entry_lines l
   WHERE l.journal_entry_id IN (SELECT id FROM master_sales_cleanup_targets);
  IF debit_total <> 141896.5843 OR credit_total <> 141896.5843 THEN
    RAISE EXCEPTION 'Master Sales amounts changed; no records deleted';
  END IF;
END $guard$;

-- PostgreSQL's posted-journal protection must be disabled only for this
-- locked transaction. Balance and FK constraint triggers remain enabled.
ALTER TABLE journal_entry_lines DISABLE TRIGGER journal_entry_lines_immutable;
ALTER TABLE journal_entries DISABLE TRIGGER journal_entries_immutable;

DO $delete$
DECLARE
  affected integer;
BEGIN
  DELETE FROM journal_entry_audit
   WHERE journal_entry_id IN (SELECT id FROM master_sales_cleanup_targets);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 82 THEN RAISE EXCEPTION 'Expected 82 audit rows, deleted %', affected; END IF;

  DELETE FROM journal_entry_lines
   WHERE journal_entry_id IN (SELECT id FROM master_sales_cleanup_targets);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 246 THEN RAISE EXCEPTION 'Expected 246 lines, deleted %', affected; END IF;

  DELETE FROM journal_entries
   WHERE id IN (SELECT id FROM master_sales_cleanup_targets)
     AND source_type = 'historical_import'
     AND source_id LIKE 'ff316fd33b56c91c4a383043:%';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 82 THEN RAISE EXCEPTION 'Expected 82 entries, deleted %', affected; END IF;

  IF (SELECT count(*) FROM journal_entries
       WHERE id IN (SELECT id FROM master_sales_cleanup_targets)) <> 0
     OR (SELECT count(*) FROM journal_entry_lines
       WHERE journal_entry_id IN (SELECT id FROM master_sales_cleanup_targets)) <> 0
     OR (SELECT count(*) FROM journal_entry_audit
       WHERE journal_entry_id IN (SELECT id FROM master_sales_cleanup_targets)) <> 0
     OR (SELECT count(*) FROM journal_entries
       WHERE id NOT IN (SELECT id FROM master_sales_cleanup_targets))
        <> (SELECT other_entries FROM master_sales_cleanup_guard) THEN
    RAISE EXCEPTION 'Post-delete check failed; transaction will roll back';
  END IF;
END $delete$;

COMMIT;

-- These two commands MUST run after COMMIT: deferred balance triggers can
-- reject reenabling the immutability triggers inside the deletion transaction.
ALTER TABLE journal_entry_lines ENABLE TRIGGER journal_entry_lines_immutable;
ALTER TABLE journal_entries ENABLE TRIGGER journal_entries_immutable;

SELECT count(*) AS remaining_master_sales_entries
  FROM journal_entries
 WHERE source_type = 'historical_import'
   AND source_id LIKE 'ff316fd33b56c91c4a383043:%';
SELECT tgname, tgenabled FROM pg_trigger
 WHERE tgname IN ('journal_entries_immutable', 'journal_entry_lines_immutable')
 ORDER BY tgname;