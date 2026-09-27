-- READ-ONLY. Run against the same database where you will run the cleanup.
-- Share only this short output, not database credentials or journal rows.
WITH targets AS (
  SELECT id, source_id FROM public.journal_entries
   WHERE source_type = 'historical_import'
     AND source_id LIKE 'ff316fd33b56c91c4a383043:%'
),
amounts AS (
  SELECT coalesce(sum(l.debit), 0) AS debit,
         coalesce(sum(l.credit), 0) AS credit,
         count(*) AS line_count,
         md5(string_agg(t.source_id || '|' || l.line_number::text || '|' ||
                        l.debit::text || '|' || l.credit::text,
                        E'\n' ORDER BY t.source_id COLLATE "C", l.line_number)) AS content_digest
    FROM targets t JOIN public.journal_entry_lines l ON l.journal_entry_id = t.id
)
SELECT (SELECT count(*) FROM public.journal_entries) AS all_journals,
       (SELECT count(*) FROM targets) AS target_journals,
       (SELECT count(*) FROM public.journal_entry_audit a
         WHERE a.journal_entry_id IN (SELECT id FROM targets)) AS target_audits,
       (SELECT md5(string_agg(source_id, E'\n' ORDER BY source_id COLLATE "C")) FROM targets) AS source_digest,
       (SELECT line_count FROM amounts) AS target_lines,
       (SELECT debit FROM amounts) AS debit,
       (SELECT credit FROM amounts) AS credit,
       (SELECT content_digest FROM amounts) AS content_digest,
       (SELECT count(*) FROM pg_trigger
         WHERE tgrelid IN ('public.journal_entries'::regclass, 'public.journal_entry_lines'::regclass)
           AND tgname IN ('journal_entries_immutable', 'journal_entry_lines_immutable',
                          'journal_entries_balanced', 'journal_entry_lines_balanced')
           AND tgenabled = 'O') AS enabled_accounting_triggers,
       (SELECT to_regnamespace('master_sales_recovery') IS NOT NULL) AS archive_already_exists;