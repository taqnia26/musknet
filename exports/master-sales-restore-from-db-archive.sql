-- MANUAL RECOVERY ONLY after master-sales-cleanup-with-db-archive.sql COMMITTED.
-- Run on the SAME production database. Requires stop-on-first-error and a
-- single connection. On any error before COMMIT, issue ROLLBACK; do not continue.
-- Reads the original IDs, entry numbers and all columns from the permanent
-- master_sales_recovery schema. Does not drop or alter the archive.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.journal_entries, public.journal_entry_lines, public.journal_entry_audit IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE master_sales_unrelated_before ON COMMIT DROP AS
  SELECT count(*) AS n FROM public.journal_entries;

DO $guard$
DECLARE
  source_digest text;
  content_digest text;
  debit_total numeric;
  credit_total numeric;
BEGIN
  -- Missing schema or tables abort here; never replace them from another DB.
  SELECT md5(string_agg(source_id, E'\n' ORDER BY source_id COLLATE "C"))
    INTO source_digest FROM master_sales_recovery.journal_entries;
  SELECT coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0),
         md5(string_agg(e.source_id || '|' || l.line_number::text || '|' ||
                        l.debit::text || '|' || l.credit::text,
                        E'\n' ORDER BY e.source_id COLLATE "C", l.line_number))
    INTO debit_total, credit_total, content_digest
    FROM master_sales_recovery.journal_entries e
    JOIN master_sales_recovery.journal_entry_lines l ON l.journal_entry_id = e.id;
  IF (SELECT count(*) FROM master_sales_recovery.journal_entries) <> 82
     OR (SELECT count(*) FROM master_sales_recovery.journal_entry_lines) <> 246
     OR (SELECT count(*) FROM master_sales_recovery.journal_entry_audit) <> 82
     OR (SELECT count(*) FROM master_sales_recovery.integrity_manifest) <> 1
     OR source_digest IS DISTINCT FROM 'faaa3461391af9d218ba37bf5b42daf4'
     OR debit_total <> 141896.5843 OR credit_total <> 141896.5843
     OR content_digest IS DISTINCT FROM '8f48f3f73f82029baf4861b9aa1c1ede'
     OR (SELECT entries_digest FROM master_sales_recovery.integrity_manifest)
        IS DISTINCT FROM (
          SELECT md5(string_agg(e.source_id || '|' || (to_jsonb(e) - 'id')::text,
                                E'\n' ORDER BY e.source_id COLLATE "C"))
            FROM master_sales_recovery.journal_entries e)
     OR (SELECT lines_digest FROM master_sales_recovery.integrity_manifest)
        IS DISTINCT FROM (
          SELECT md5(string_agg(e.source_id || '|' || (to_jsonb(l) - 'id' - 'journal_entry_id')::text,
                                E'\n' ORDER BY e.source_id COLLATE "C", l.line_number))
            FROM master_sales_recovery.journal_entry_lines l
            JOIN master_sales_recovery.journal_entries e ON e.id = l.journal_entry_id)
     OR (SELECT audit_digest FROM master_sales_recovery.integrity_manifest)
        IS DISTINCT FROM (
          SELECT md5(string_agg(e.source_id || '|' || (to_jsonb(a) - 'id' - 'journal_entry_id')::text,
                                E'\n' ORDER BY e.source_id COLLATE "C"))
            FROM master_sales_recovery.journal_entry_audit a
            JOIN master_sales_recovery.journal_entries e ON e.id = a.journal_entry_id)
     OR EXISTS (
       SELECT 1 FROM master_sales_recovery.journal_entries e
        WHERE e.source_type <> 'historical_import'
           OR e.status <> 'posted' OR e.reversal_of_entry_id IS NOT NULL
           OR e.source_id !~ '^ff316fd33b56c91c4a383043:row-[0-9]+:barcode-[0-9]+:month-20[0-9][0-9]-(0[1-9]|1[0-2])$'
           OR (SELECT count(*) FROM master_sales_recovery.journal_entry_lines l WHERE l.journal_entry_id = e.id) <> 3
           OR (SELECT count(*) FROM master_sales_recovery.journal_entry_audit a WHERE a.journal_entry_id = e.id) <> 1
     )
     OR EXISTS (
       SELECT 1 FROM master_sales_recovery.journal_entry_lines l
        WHERE NOT EXISTS (SELECT 1 FROM master_sales_recovery.journal_entries e WHERE e.id = l.journal_entry_id)
     )
     OR EXISTS (
       SELECT 1 FROM master_sales_recovery.journal_entry_audit a
        WHERE NOT EXISTS (SELECT 1 FROM master_sales_recovery.journal_entries e WHERE e.id = a.journal_entry_id)
     ) THEN
    RAISE EXCEPTION 'Archive is missing, incomplete or changed; nothing restored';
  END IF;
  -- Fail before touching any rows if a previous partial restore or another
  -- operation has claimed an original ID, entry number, or source identity.
  IF EXISTS (
    SELECT 1 FROM public.journal_entries e
     WHERE (e.source_type = 'historical_import' AND e.source_id LIKE 'ff316fd33b56c91c4a383043:%')
        OR e.id IN (SELECT id FROM master_sales_recovery.journal_entries)
        OR e.entry_number IN (SELECT entry_number FROM master_sales_recovery.journal_entries)
        OR (e.source_type, e.source_id) IN (
          SELECT source_type, source_id FROM master_sales_recovery.journal_entries)
  ) OR EXISTS (
    SELECT 1 FROM public.journal_entry_lines l
     WHERE l.id IN (SELECT id FROM master_sales_recovery.journal_entry_lines)
  ) OR EXISTS (
    SELECT 1 FROM public.journal_entry_audit a
     WHERE a.id IN (SELECT id FROM master_sales_recovery.journal_entry_audit)
  ) THEN
    RAISE EXCEPTION 'Original entry/line/audit IDs or entry numbers are already used; nothing restored';
  END IF;
  IF (SELECT count(*) FROM pg_trigger
       WHERE tgrelid IN ('public.journal_entries'::regclass, 'public.journal_entry_lines'::regclass)
         AND tgname IN (
           'journal_entries_immutable', 'journal_entry_lines_immutable',
           'journal_entries_balanced', 'journal_entry_lines_balanced'
         ) AND tgenabled = 'O') <> 4 THEN
    RAISE EXCEPTION 'Accounting protection triggers are not enabled; nothing restored';
  END IF;
END $guard$;

-- Posted lines cannot be inserted while their immutable trigger is active.
-- Only this named trigger is disabled, under the exclusive lock, and it is
-- re-enabled BEFORE COMMIT. Balance and FK checks stay active throughout.
ALTER TABLE public.journal_entry_lines DISABLE TRIGGER journal_entry_lines_immutable;
INSERT INTO public.journal_entries
  SELECT * FROM master_sales_recovery.journal_entries;
INSERT INTO public.journal_entry_lines
  SELECT * FROM master_sales_recovery.journal_entry_lines;
INSERT INTO public.journal_entry_audit
  SELECT * FROM master_sales_recovery.journal_entry_audit;

DO $verify_restore$
DECLARE
  source_digest text;
  content_digest text;
  debit_total numeric;
  credit_total numeric;
BEGIN
  SELECT md5(string_agg(e.source_id, E'\n' ORDER BY e.source_id COLLATE "C"))
    INTO source_digest FROM public.journal_entries e
   WHERE e.source_type = 'historical_import' AND e.source_id LIKE 'ff316fd33b56c91c4a383043:%';
  SELECT coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0),
         md5(string_agg(e.source_id || '|' || l.line_number::text || '|' ||
                        l.debit::text || '|' || l.credit::text,
                        E'\n' ORDER BY e.source_id COLLATE "C", l.line_number))
    INTO debit_total, credit_total, content_digest
    FROM public.journal_entries e
    JOIN public.journal_entry_lines l ON l.journal_entry_id = e.id
   WHERE e.source_type = 'historical_import' AND e.source_id LIKE 'ff316fd33b56c91c4a383043:%';
  IF (SELECT count(*) FROM public.journal_entries
       WHERE source_type = 'historical_import' AND source_id LIKE 'ff316fd33b56c91c4a383043:%') <> 82
     OR (SELECT count(*) FROM public.journal_entry_lines
       WHERE journal_entry_id IN (SELECT id FROM master_sales_recovery.journal_entries)) <> 246
     OR (SELECT count(*) FROM public.journal_entry_audit
       WHERE journal_entry_id IN (SELECT id FROM master_sales_recovery.journal_entries)) <> 82
     OR (SELECT count(*) FROM public.journal_entries)
        <> (SELECT n FROM master_sales_unrelated_before) + 82
     OR source_digest IS DISTINCT FROM 'faaa3461391af9d218ba37bf5b42daf4'
     OR debit_total <> 141896.5843 OR credit_total <> 141896.5843
     OR content_digest IS DISTINCT FROM '8f48f3f73f82029baf4861b9aa1c1ede'
     OR EXISTS (
       (SELECT e.* FROM master_sales_recovery.journal_entries e
        EXCEPT ALL SELECT e.* FROM public.journal_entries e
          WHERE e.id IN (SELECT id FROM master_sales_recovery.journal_entries))
     ) OR EXISTS (
       (SELECT l.* FROM master_sales_recovery.journal_entry_lines l
        EXCEPT ALL SELECT l.* FROM public.journal_entry_lines l
          WHERE l.id IN (SELECT id FROM master_sales_recovery.journal_entry_lines))
     ) OR EXISTS (
       (SELECT a.* FROM master_sales_recovery.journal_entry_audit a
        EXCEPT ALL SELECT a.* FROM public.journal_entry_audit a
          WHERE a.id IN (SELECT id FROM master_sales_recovery.journal_entry_audit))
     ) THEN
    RAISE EXCEPTION 'Restored data or amounts differ from archive; transaction will roll back';
  END IF;
END $verify_restore$;

SET CONSTRAINTS journal_entries_balanced, journal_entry_lines_balanced IMMEDIATE;
ALTER TABLE public.journal_entry_lines ENABLE TRIGGER journal_entry_lines_immutable;
COMMIT;

SELECT (SELECT count(*) FROM master_sales_recovery.journal_entries) AS archived_entries,
       (SELECT count(*) FROM public.journal_entries
         WHERE source_type = 'historical_import'
           AND source_id LIKE 'ff316fd33b56c91c4a383043:%') AS restored_entries;
SELECT tgname, tgenabled FROM pg_trigger
 WHERE tgrelid IN ('public.journal_entries'::regclass, 'public.journal_entry_lines'::regclass)
   AND tgname IN ('journal_entries_immutable', 'journal_entry_lines_immutable')
 ORDER BY tgname;