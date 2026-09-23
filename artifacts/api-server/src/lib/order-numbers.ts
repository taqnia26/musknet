import { sql } from "drizzle-orm";
import { db, ordersTable } from "@workspace/db";

type OrderTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Allocate only for new orders; historical references remain untouched. */
export async function nextIndividualOrderNumber(tx: OrderTransaction): Promise<string> {
  // The transaction lock serializes both storefront and admin writers. Reading
  // after acquiring it also accounts for any previously issued L- references.
  await tx.execute(sql`select pg_advisory_xact_lock(7521010002)`);
  const [row] = await tx.select({
    next: sql<string>`(coalesce(max(substring(${ordersTable.orderNumber} from 3)::numeric), 0) + 1)::text`,
  }).from(ordersTable).where(sql`${ordersTable.orderNumber} ~ '^L-[0-9]+$'`);
  return `L-${row.next}`;
}