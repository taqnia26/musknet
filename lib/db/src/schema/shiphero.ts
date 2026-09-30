import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { productsTable } from "./products";
import { ordersTable } from "./orders";

// No tokens, secrets, merchant IDs or warehouse IDs are persisted in these tables.
export const shipheroSettingsTable = pgTable("shiphero_settings", {
  id: text("id").primaryKey().default("main"),
  dryShippingCode: text("dry_shipping_code"),
  coldShippingCode: text("cold_shipping_code"),
  coldCoverageCities: jsonb("cold_coverage_cities").$type<string[]>().notNull().default([]),
  statusMappings: jsonb("status_mappings").$type<Record<string, string>>().notNull().default({}),
  catalogBaselineMaxId: integer("catalog_baseline_max_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const shipheroProductMappingsTable = pgTable("shiphero_product_mappings", {
  productId: integer("product_id").primaryKey().references(() => productsTable.id, { onDelete: "restrict" }),
  productName: text("product_name").notNull(),
  sku: text("sku").notNull(),
  registrationKind: text("registration_kind").notNull().default("existing"),
  remoteProductId: text("remote_product_id"),
  createStatus: text("create_status").notNull().default("not_requested"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [uniqueIndex("shiphero_product_mapping_sku_unique").on(table.sku)]);

export const shipheroDispatchesTable = pgTable("shiphero_dispatches", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "restrict" }),
  orderNumber: text("order_number").notNull(),
  status: text("status").notNull().default("queued"),
  remoteOrderId: text("remote_order_id"),
  payload: jsonb("payload"),
  response: jsonb("response"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  uniqueIndex("shiphero_dispatch_order_unique").on(table.orderId),
  uniqueIndex("shiphero_dispatch_number_unique").on(table.orderNumber),
  index("shiphero_dispatch_status_idx").on(table.status),
]);

export const shipheroWebhookEventsTable = pgTable("shiphero_webhook_events", {
  id: serial("id").primaryKey(),
  messageId: text("message_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  outcome: text("outcome").notNull().default("received"),
  detail: text("detail"),
  eventAt: timestamp("event_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, table => [
  uniqueIndex("shiphero_webhook_message_unique").on(table.messageId),
  index("shiphero_webhook_outcome_idx").on(table.outcome),
]);

export const insertShipheroSettingsSchema = createInsertSchema(shipheroSettingsTable);
export const insertShipheroProductMappingSchema = createInsertSchema(shipheroProductMappingsTable);
export const insertShipheroDispatchSchema = createInsertSchema(shipheroDispatchesTable);
export const insertShipheroWebhookEventSchema = createInsertSchema(shipheroWebhookEventsTable);
export type ShipheroSettings = typeof shipheroSettingsTable.$inferSelect;
export type ShipheroProductMapping = typeof shipheroProductMappingsTable.$inferSelect;
export type ShipheroDispatch = typeof shipheroDispatchesTable.$inferSelect;
export type ShipheroWebhookEvent = typeof shipheroWebhookEventsTable.$inferSelect;