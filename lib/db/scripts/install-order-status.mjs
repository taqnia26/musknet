import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const allowedStatuses = [
  "new", "processing", "ready", "completed", "shipped", "delivered", "cancelled",
  "returned", "pending_review", "preparing", "out_for_delivery", "pending_payment",
];
const migrationPath = fileURLToPath(new URL("../migrations/20260619_order_status_payment_links.sql", import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set before installing the order-status migration");
}

async function statusCounts(client) {
  const exists = await client.query("SELECT to_regclass('public.storefront_orders') IS NOT NULL AS exists");
  if (!exists.rows[0].exists) return null;
  const result = await client.query(
    "SELECT status, count(*)::integer AS count FROM public.storefront_orders GROUP BY status ORDER BY status",
  );
  return result.rows.map(({ status, count }) => ({ status, count }));
}

function rejectUnknownStatuses(counts) {
  if (!counts) return;
  const unknown = counts.filter(({ status }) => !allowedStatuses.includes(status));
  if (unknown.length > 0) {
    throw new Error(
      `Refusing order-status migration: unknown historical storefront_orders.status value(s): ${unknown.map(({ status, count }) => `${String(status)} (${count})`).join(", ")}`,
    );
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  const before = await statusCounts(client);
  rejectUnknownStatuses(before);

  if (process.argv.includes("--preflight")) {
    console.info("Order-status migration preflight counts:", before ?? "storefront_orders does not exist yet");
  } else if (!before) {
    console.info("Order-status migration skipped: storefront_orders does not exist yet");
  } else {
    await client.query("BEGIN");
    await client.query(await readFile(migrationPath, "utf8"));
    const after = await statusCounts(client);
    rejectUnknownStatuses(after);
    await client.query("COMMIT");
    console.info("Order-status migration counts:", {
      before: before ?? "storefront_orders did not exist before schema push",
      after: after ?? "storefront_orders does not exist",
    });
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}