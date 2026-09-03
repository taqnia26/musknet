import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set before installing accounting integrity");
}

const requiredTriggers = [
  "journal_entries_immutable",
  "journal_entry_lines_immutable",
  "journal_entries_balanced",
  "journal_entry_lines_balanced",
];

const installSql = `
CREATE OR REPLACE FUNCTION accounting_protect_posted_entry() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('posted', 'reversed') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'posted journal entries are immutable';
    END IF;
    IF OLD.status = 'posted' AND NEW.status = 'reversed'
      AND NEW.entry_number IS NOT DISTINCT FROM OLD.entry_number
      AND NEW.entry_date IS NOT DISTINCT FROM OLD.entry_date
      AND NEW.description IS NOT DISTINCT FROM OLD.description
      AND NEW.source_type IS NOT DISTINCT FROM OLD.source_type
      AND NEW.source_id IS NOT DISTINCT FROM OLD.source_id
      AND NEW.reversal_of_entry_id IS NOT DISTINCT FROM OLD.reversal_of_entry_id
      AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
      AND NEW.posted_by IS NOT DISTINCT FROM OLD.posted_by
      AND NEW.posted_at IS NOT DISTINCT FROM OLD.posted_at
      AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    THEN
      IF NOT EXISTS (
        SELECT 1 FROM journal_entries reversal
        WHERE reversal.reversal_of_entry_id = OLD.id AND reversal.status = 'posted'
      ) THEN
        RAISE EXCEPTION 'a posted reversing entry is required before reversal';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'posted journal entries are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION accounting_protect_posted_lines() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE entry_status journal_entry_status;
BEGIN
  SELECT status INTO entry_status FROM journal_entries
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_entry_id ELSE NEW.journal_entry_id END;
  IF entry_status IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'posted journal entry lines are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION accounting_assert_balanced_entry() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE target_id integer;
DECLARE entry_status journal_entry_status;
DECLARE line_count integer;
DECLARE debit_total numeric(19,4);
DECLARE credit_total numeric(19,4);
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    target_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target_id := OLD.journal_entry_id;
  ELSE
    target_id := NEW.journal_entry_id;
  END IF;
  SELECT status INTO entry_status FROM journal_entries WHERE id = target_id;
  IF entry_status IN ('posted', 'reversed') THEN
    SELECT count(*), COALESCE(sum(debit), 0), COALESCE(sum(credit), 0)
      INTO line_count, debit_total, credit_total
      FROM journal_entry_lines WHERE journal_entry_id = target_id;
    IF line_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
      RAISE EXCEPTION 'posted journal entry % must contain at least two balanced lines', target_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS journal_entries_immutable ON journal_entries;
CREATE TRIGGER journal_entries_immutable
BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION accounting_protect_posted_entry();

DROP TRIGGER IF EXISTS journal_entry_lines_immutable ON journal_entry_lines;
CREATE TRIGGER journal_entry_lines_immutable
BEFORE INSERT OR UPDATE OR DELETE ON journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION accounting_protect_posted_lines();

DROP TRIGGER IF EXISTS journal_entries_balanced ON journal_entries;
CREATE CONSTRAINT TRIGGER journal_entries_balanced
AFTER INSERT OR UPDATE ON journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION accounting_assert_balanced_entry();

DROP TRIGGER IF EXISTS journal_entry_lines_balanced ON journal_entry_lines;
CREATE CONSTRAINT TRIGGER journal_entry_lines_balanced
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION accounting_assert_balanced_entry();
`;

async function verify(client) {
  const result = await client.query(
    `SELECT tgname
       FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgrelid IN ('journal_entries'::regclass, 'journal_entry_lines'::regclass)
        AND tgname = ANY($1::text[])`,
    [requiredTriggers],
  );
  const installed = new Set(result.rows.map(({ tgname }) => tgname));
  const missing = requiredTriggers.filter((name) => !installed.has(name));
  if (missing.length > 0) {
    throw new Error(`Missing accounting integrity triggers: ${missing.join(", ")}`);
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  if (!process.argv.includes("--verify")) {
    await client.query("BEGIN");
    await client.query(installSql);
    await verify(client);
    await client.query("COMMIT");
    console.log("Installed and verified accounting integrity triggers");
  } else {
    await verify(client);
    console.log("Verified accounting integrity triggers");
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}