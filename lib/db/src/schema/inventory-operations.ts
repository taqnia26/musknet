import { boolean, check, date, integer, jsonb, numeric, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminUsersTable } from "./admin-users";
import { productsTable } from "./products";

export const inventoryLocationTypeEnum = pgEnum("inventory_location_type", ["warehouse", "store", "virtual"]);
export const inventoryBalanceStateEnum = pgEnum("inventory_balance_state", ["active", "closed"]);
export const transferStatusEnum = pgEnum("inventory_transfer_status", ["draft", "sent", "received", "cancelled"]);
export const cycleCountStatusEnum = pgEnum("inventory_cycle_count_status", ["draft", "review", "approved", "cancelled"]);
export const purchaseOrderStatusEnum = pgEnum("inventory_purchase_order_status", ["draft", "ordered", "partially_received", "received", "cancelled"]);
export const inventoryPurchaseOrdersTable = pgTable("inventory_purchase_orders", {
  id: serial("id").primaryKey(), orderNumber: text("order_number").notNull(), vendorName: text("vendor_name").notNull(),
  locationId: integer("location_id").notNull().references(() => inventoryLocationsTable.id), status: purchaseOrderStatusEnum("status").notNull().default("draft"),
  idempotencyKey: text("idempotency_key").notNull(), createdBy: integer("created_by").notNull().references(() => adminUsersTable.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("inventory_purchase_orders_number_unique").on(t.orderNumber), uniqueIndex("inventory_purchase_orders_key_unique").on(t.idempotencyKey)]);
export const inventoryPurchaseOrderLinesTable = pgTable("inventory_purchase_order_lines", {
  id: serial("id").primaryKey(), purchaseOrderId: integer("purchase_order_id").notNull().references(() => inventoryPurchaseOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id), orderedQuantity: integer("ordered_quantity").notNull(), receivedQuantity: integer("received_quantity").notNull().default(0),
  unitCost: numeric("unit_cost", { precision: 19, scale: 4, mode: "string" }).notNull(), receivedAt: timestamp("received_at", { withTimezone: true }),
}, (t) => [uniqueIndex("inventory_purchase_order_product_unique").on(t.purchaseOrderId, t.productId), check("inventory_purchase_order_quantities", sql`${t.orderedQuantity} > 0 and ${t.receivedQuantity} >= 0 and ${t.receivedQuantity} <= ${t.orderedQuantity}`)]);

export const inventoryLocationsTable = pgTable("inventory_locations", {
  id: serial("id").primaryKey(), name: text("name").notNull(), code: text("code").notNull(),
  managerName: text("manager_name"), email: text("email"), phone: text("phone"),
  type: inventoryLocationTypeEnum("type").notNull().default("warehouse"), isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("inventory_locations_code_unique").on(t.code)]);

export const inventoryBalancesTable = pgTable("inventory_balances", {
  id: serial("id").primaryKey(), productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  locationId: integer("location_id").notNull().references(() => inventoryLocationsTable.id, { onDelete: "restrict" }),
  available: integer("available").notNull().default(0), reserved: integer("reserved").notNull().default(0), incoming: integer("incoming").notNull().default(0),
  averageCost: numeric("average_cost", { precision: 19, scale: 4, mode: "string" }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("inventory_balances_product_location_unique").on(t.productId, t.locationId),
  check("inventory_balances_nonnegative", sql`${t.available} >= 0 and ${t.reserved} >= 0 and ${t.incoming} >= 0`),
  index("inventory_balances_location_idx").on(t.locationId)]);

export const inventoryTransfersTable = pgTable("inventory_transfers", {
  id: serial("id").primaryKey(), transferNumber: text("transfer_number").notNull(), fromLocationId: integer("from_location_id").notNull().references(() => inventoryLocationsTable.id),
  toLocationId: integer("to_location_id").notNull().references(() => inventoryLocationsTable.id), status: transferStatusEnum("status").notNull().default("draft"),
  idempotencyKey: text("idempotency_key").notNull(), createdBy: integer("created_by").notNull().references(() => adminUsersTable.id), sentAt: timestamp("sent_at", { withTimezone: true }), receivedAt: timestamp("received_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("inventory_transfers_number_unique").on(t.transferNumber), uniqueIndex("inventory_transfers_idempotency_unique").on(t.idempotencyKey)]);
export const inventoryTransferLinesTable = pgTable("inventory_transfer_lines", {
  id: serial("id").primaryKey(), transferId: integer("transfer_id").notNull().references(() => inventoryTransfersTable.id, { onDelete: "cascade" }), productId: integer("product_id").notNull().references(() => productsTable.id), quantity: integer("quantity").notNull(), unitCost: numeric("unit_cost", { precision: 19, scale: 4, mode: "string" }).notNull().default("0"),
}, (t) => [check("inventory_transfer_lines_positive", sql`${t.quantity} > 0`)]);

export const inventoryCycleCountsTable = pgTable("inventory_cycle_counts", {
  id: serial("id").primaryKey(), locationId: integer("location_id").notNull().references(() => inventoryLocationsTable.id), status: cycleCountStatusEnum("status").notNull().default("draft"), createdBy: integer("created_by").notNull().references(() => adminUsersTable.id), approvedBy: integer("approved_by").references(() => adminUsersTable.id), approvedAt: timestamp("approved_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const inventoryCycleCountLinesTable = pgTable("inventory_cycle_count_lines", {
  id: serial("id").primaryKey(), cycleCountId: integer("cycle_count_id").notNull().references(() => inventoryCycleCountsTable.id, { onDelete: "cascade" }), productId: integer("product_id").notNull().references(() => productsTable.id), expectedQuantity: integer("expected_quantity").notNull(), countedQuantity: integer("counted_quantity").notNull(), unitCost: numeric("unit_cost", { precision: 19, scale: 4, mode: "string" }).notNull().default("0"), note: text("note"),
}, (t) => [uniqueIndex("inventory_cycle_count_product_unique").on(t.cycleCountId, t.productId), check("inventory_cycle_count_nonnegative", sql`${t.expectedQuantity} >= 0 and ${t.countedQuantity} >= 0`)]);

export const inventoryAlertsTable = pgTable("inventory_alerts", {
  id: serial("id").primaryKey(), productId: integer("product_id").notNull().references(() => productsTable.id), locationId: integer("location_id").references(() => inventoryLocationsTable.id), kind: text("kind").notNull(), reorderQuantity: integer("reorder_quantity").notNull().default(0), acknowledged: boolean("acknowledged").notNull().default(false), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("inventory_alert_dedupe_unique").on(t.productId, t.locationId, t.kind, t.acknowledged)]);

export const insertInventoryLocationSchema = createInsertSchema(inventoryLocationsTable).omit({ id: true, createdAt: true });
export type InventoryLocation = typeof inventoryLocationsTable.$inferSelect;
export type InventoryBalance = typeof inventoryBalancesTable.$inferSelect;
export type InventoryTransfer = typeof inventoryTransfersTable.$inferSelect;
export type InventoryCycleCount = typeof inventoryCycleCountsTable.$inferSelect;