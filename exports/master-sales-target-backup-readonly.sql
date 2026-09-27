-- READ-ONLY. Run this query on the EXACT database where the cleanup failed.
-- Save the single backup_json cell as a UTF-8 .json file and upload that file.
-- It includes full journal, line, and audit records, so handle as private
-- financial data. Do not include credentials or connection strings.
-- This query does not delete, update, or lock any rows.
WITH targets AS MATERIALIZED (
  SELECT *
  FROM journal_entries
  WHERE source_type = 'historical_import'
    AND source_id LIKE 'ff316fd33b56c91c4a383043:%'
),
target_lines AS MATERIALIZED (
  SELECT l.*
  FROM journal_entry_lines l
  JOIN targets t ON t.id = l.journal_entry_id
),
target_audit AS MATERIALIZED (
  SELECT a.*
  FROM journal_entry_audit a
  JOIN targets t ON t.id = a.journal_entry_id
)
SELECT jsonb_pretty(jsonb_build_object(
  'exported_at', current_timestamp,
  'source_sha256', 'ff316fd33b56c91c4a383043b3b7013e17d5ea3bf6d49c2e6fab92b623b1a6d5',
  'journal_entries', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) FROM targets t),
  'journal_entry_lines', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb) FROM target_lines l),
  'journal_entry_audit', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]'::jsonb) FROM target_audit a),
  'verification', jsonb_build_object(
    'total_journals_in_database', (SELECT count(*) FROM journal_entries),
    'target_journals', (SELECT count(*) FROM targets),
    'target_min_id', (SELECT min(id) FROM targets),
    'target_max_id', (SELECT max(id) FROM targets),
    'source_digest', (SELECT md5(string_agg(source_id, E'\n' ORDER BY source_id COLLATE "C")) FROM targets),
    'target_lines', (SELECT count(*) FROM target_lines),
    'target_audit', (SELECT count(*) FROM target_audit),
    'debit', (SELECT coalesce(sum(debit), 0) FROM target_lines),
    'credit', (SELECT coalesce(sum(credit), 0) FROM target_lines)
  )
)) AS backup_json;