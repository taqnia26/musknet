import pg from "pg";
import { readFile } from "node:fs/promises";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '10s'");
  await client.query(await readFile(new URL("../sql/return-source-keys.sql", import.meta.url), "utf8"));
  await client.query("COMMIT");
  console.log("Verified return-source UNIQUE constraints before schema push");
} catch (error) {
  await client.query("ROLLBACK");
  // Do not print connection settings or credentials.
  console.error("Return-source prerequisites failed:", error.code, error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}