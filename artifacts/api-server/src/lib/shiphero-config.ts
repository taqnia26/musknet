import { db, ordersTable, productsTable, shipmentsTable, shipheroSettingsTable } from "@workspace/db";
import { eq, isNull, max, sql } from "drizzle-orm";

export const SHIPHERO_TRIGGER_STATUS = "preparing" as const;
// ShipHero integration build: partner has NOT supplied the Create Order example.
// TODO: confirm Merchant ID -> customer_account_id, public Warehouse UUID,
// Address 2 example and partner event payload before replacing this gate.
// Neither saving settings nor adding credentials can bypass this release gate.
export const SHIPHERO_PARTNER_CONTRACT_CONFIRMED = false;
export const SHIPHERO_ENV_NAMES = [
  "SHIPHERO_ACCESS_TOKEN", "SHIPHERO_REFRESH_TOKEN", "SHIPHERO_MERCHANT_ID",
  "SHIPHERO_WAREHOUSE_ID", "SHIPHERO_WEBHOOK_SECRET",
] as const;

export class ShipHeroError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ShipHeroError";
  }
}

export async function getShipHeroSettings() {
  const [existing] = await db.select().from(shipheroSettingsTable).where(eq(shipheroSettingsTable.id, "main"));
  if (existing) return existing;
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(87352106)`);
    const [again] = await tx.select().from(shipheroSettingsTable).where(eq(shipheroSettingsTable.id, "main"));
    if (again) return again;
    const [baseline] = await tx.select({ value: max(productsTable.id) }).from(productsTable);
    // One-time installation backfill also covers schema-push deployments, which
    // do not execute migration data statements. Never infer manual edits from
    // mutable updatedAt after installation: webhook processing updates it too.
    await tx.update(ordersTable).set({ statusManuallyUpdatedAt: sql`${ordersTable.updatedAt}` })
      .where(isNull(ordersTable.statusManuallyUpdatedAt));
    await tx.update(shipmentsTable).set({ statusManuallyUpdatedAt: sql`${shipmentsTable.updatedAt}` })
      .where(isNull(shipmentsTable.statusManuallyUpdatedAt));
    const [created] = await tx.insert(shipheroSettingsTable).values({
      id: "main", catalogBaselineMaxId: baseline.value ?? 0,
    }).returning();
    return created;
  });
}

export function shipHeroReadiness(environment: NodeJS.ProcessEnv = process.env) {
  const missing = [
    ...(!environment.SHIPHERO_ACCESS_TOKEN?.trim() && !environment.SHIPHERO_REFRESH_TOKEN?.trim()
      ? ["SHIPHERO_ACCESS_TOKEN or SHIPHERO_REFRESH_TOKEN"] : []),
    ...["SHIPHERO_MERCHANT_ID", "SHIPHERO_WAREHOUSE_ID", "SHIPHERO_WEBHOOK_SECRET"]
      .filter(key => !environment[key]?.trim()),
  ];
  return {
    configured: SHIPHERO_PARTNER_CONTRACT_CONFIRMED && missing.length === 0,
    partnerContractConfirmed: SHIPHERO_PARTNER_CONTRACT_CONFIRMED,
    webhookConfigured: Boolean(environment.SHIPHERO_WEBHOOK_SECRET?.trim()),
    triggerStatus: SHIPHERO_TRIGGER_STATUS,
    missing,
    blockingReason: "Partner Create Order example and National Address format are pending confirmation. Live sending is disabled.",
  };
}

export function assertShipHeroSendingConfigured(environment: NodeJS.ProcessEnv = process.env) {
  const readiness = shipHeroReadiness(environment);
  if (!readiness.configured) throw new ShipHeroError(503, readiness.blockingReason);
}

// Environment identifiers must never be persisted, even in support snapshots.
// Preserve business fields; replace env-owned fields with named placeholders.
export function redactShipHeroPayload(value: unknown, environment: NodeJS.ProcessEnv = process.env): unknown {
  const sensitive = SHIPHERO_ENV_NAMES.map(key => environment[key]).filter((item): item is string => Boolean(item));
  const walk = (item: unknown): unknown => {
    if (typeof item === "string") {
      let result = item;
      for (const secret of sensitive) result = result.split(secret).join("[environment value]");
      return result;
    }
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, entry]) => [
      key, /(?:token|secret|authorization|customer_account_id|merchant_id|warehouse_id|warehouse_uuid|account_id)/i.test(key)
        ? "[environment value]" : walk(entry),
    ]));
    return item;
  };
  return walk(value);
}