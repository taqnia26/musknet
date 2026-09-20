ALTER TABLE "receivable_payments" ADD COLUMN "payment_method" text NOT NULL;
--> statement-breakpoint
WITH legacy AS (
  SELECT je."source_id", je."entry_date", je."created_by",
    row_number() OVER (ORDER BY je."id") AS sequence_offset
  FROM "journal_entries" je
  JOIN "journal_entry_lines" jel ON jel."journal_entry_id" = je."id"
  JOIN "accounting_accounts" aa ON aa."id" = jel."account_id"
  WHERE je."source_type" = 'distributor_invoice'
    AND je."status" = 'posted'
    AND aa."code" = '1120'
    AND jel."debit" > 0
    AND NOT EXISTS (
      SELECT 1 FROM "journal_entries" correction
      WHERE correction."source_type" = 'distributor_invoice_ar_correction'
        AND correction."source_id" = je."source_id"
    )
), next_number AS (
  SELECT coalesce(max(cast(substring("entry_number" from 4) AS integer)), 0) AS base
  FROM "journal_entries"
)
INSERT INTO "journal_entries" (
  "entry_number", "entry_date", "description", "status",
  "source_type", "source_id", "created_by"
)
SELECT
  'JE-' || lpad((next_number.base + legacy.sequence_offset)::text, 8, '0'),
  legacy."entry_date",
  'Correct distributor invoice classification to accounts receivable',
  'draft',
  'distributor_invoice_ar_correction',
  legacy."source_id",
  legacy."created_by"
FROM legacy CROSS JOIN next_number;
--> statement-breakpoint
WITH legacy_amounts AS (
  SELECT je."source_id", sum(jel."debit") AS amount
  FROM "journal_entries" je
  JOIN "journal_entry_lines" jel ON jel."journal_entry_id" = je."id"
  JOIN "accounting_accounts" aa ON aa."id" = jel."account_id"
  WHERE je."source_type" = 'distributor_invoice'
    AND aa."code" = '1120'
    AND jel."debit" > 0
  GROUP BY je."source_id"
), correction_lines AS (
  SELECT correction."id" AS journal_entry_id, 1 AS line_number, ar."id" AS account_id, legacy.amount AS debit, 0::numeric AS credit
  FROM "journal_entries" correction
  JOIN legacy_amounts legacy ON legacy."source_id" = correction."source_id"
  JOIN "accounting_accounts" ar ON ar."code" = '1130'
  WHERE correction."source_type" = 'distributor_invoice_ar_correction' AND correction."status" = 'draft'
  UNION ALL
  SELECT correction."id", 2, bank."id", 0::numeric, legacy.amount
  FROM "journal_entries" correction
  JOIN legacy_amounts legacy ON legacy."source_id" = correction."source_id"
  JOIN "accounting_accounts" bank ON bank."code" = '1120'
  WHERE correction."source_type" = 'distributor_invoice_ar_correction' AND correction."status" = 'draft'
)
INSERT INTO "journal_entry_lines" ("journal_entry_id", "line_number", "account_id", "debit", "credit")
SELECT journal_entry_id, line_number, account_id, debit, credit FROM correction_lines;
--> statement-breakpoint
UPDATE "journal_entries"
SET "status" = 'posted', "posted_by" = "created_by", "posted_at" = now(), "updated_at" = now()
WHERE "source_type" = 'distributor_invoice_ar_correction' AND "status" = 'draft';
--> statement-breakpoint
INSERT INTO "journal_entry_audit" ("journal_entry_id", "action", "actor_id", "changes")
SELECT "id", 'created', "created_by", jsonb_build_object('reason', 'legacy distributor invoice receivable reclassification')
FROM "journal_entries"
WHERE "source_type" = 'distributor_invoice_ar_correction'
  AND NOT EXISTS (
    SELECT 1 FROM "journal_entry_audit"
    WHERE "journal_entry_id" = "journal_entries"."id" AND "action" = 'created'
  );
--> statement-breakpoint
INSERT INTO "journal_entry_audit" ("journal_entry_id", "action", "actor_id", "changes")
SELECT "id", 'posted', "posted_by", jsonb_build_object('reason', 'legacy distributor invoice receivable reclassification')
FROM "journal_entries"
WHERE "source_type" = 'distributor_invoice_ar_correction'
  AND NOT EXISTS (
    SELECT 1 FROM "journal_entry_audit"
    WHERE "journal_entry_id" = "journal_entries"."id" AND "action" = 'posted'
  );