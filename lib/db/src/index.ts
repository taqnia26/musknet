import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Writer fences must not occupy the business pool while handlers await queries.
export const backupWritePool = new Pool({ connectionString: process.env.DATABASE_URL, max: 32 });
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./seeds/standard-retail-chart";
