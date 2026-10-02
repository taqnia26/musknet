import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set before installing individual invoice support");
}

const migrationSql = `
ALTER TABLE public.tax_invoices
  ADD COLUMN IF NOT EXISTS individual boolean NOT NULL DEFAULT false;

ALTER TABLE public.tax_invoices
  DROP CONSTRAINT IF EXISTS invoice_single_channel;

ALTER TABLE public.tax_invoices
  ADD CONSTRAINT invoice_single_channel CHECK (
    (CASE WHEN order_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN distributor_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN exhibition_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN individual THEN 1 ELSE 0 END) = 1
  );
`;

async function verify(client) {
  const { rows } = await client.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'tax_invoices'
           AND column_name = 'individual' AND is_nullable = 'NO'
           AND column_default IN ('false', 'false::boolean')
      ) AS individual_column_ready,
      pg_get_constraintdef(oid) AS channel_constraint
      FROM pg_constraint
     WHERE conrelid = 'public.tax_invoices'::regclass
       AND conname = 'invoice_single_channel'
  `);
  const result = rows[0];
  if (!result?.individual_column_ready || !result.channel_constraint?.includes("individual")) {
    throw new Error("Standalone individual invoice schema is not installed correctly");
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  if (!process.argv.includes("--verify")) {
    await client.query("BEGIN");
    await client.query(migrationSql);
    await verify(client);
    await client.query("COMMIT");
    console.log("Installed and verified standalone individual invoice schema");
  } else {
    await verify(client);
    console.log("Verified standalone individual invoice schema");
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}