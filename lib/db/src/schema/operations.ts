import { check, date, integer, jsonb, numeric, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminUsersTable } from "./admin-users";
import { productsTable } from "./products";

export const operationKindEnum = pgEnum("operation_kind", [
  "opening_balance", "purchase_receipt", "manufacturing_consumption",
  "manufacturing_output", "sale_fulfillment", "liability", "payment",
]);
export const operationStatusEnum = pgEnum("operation_status", ["pending", "posted", "reversed"]);
export const openingBalanceStatusEnum = pgEnum("opening_balance_status", ["draft", "review", "approved", "rejected"]);
export const openingBalanceMappingStateEnum = pgEnum("opening_balance_mapping_state", ["mapped", "unmapped", "rejected"]);

/** Immutable, source-linked business event envelope. Domain tables remain the source of detail. */
export const operationEventsTable = pgTable("operation_events", {
  id: serial("id").primaryKey(),
  eventKey: text("event_key").notNull(),
  kind: operationKindEnum("kind").notNull(),
  status: operationStatusEnum("status").notNull().default("pending"),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  actorId: integer("actor_id").references(() => adminUsersTable.id, { onDelete: "restrict" }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("operation_events_event_key_unique").on(table.eventKey),
  uniqueIndex("operation_events_source_unique").on(table.sourceType, table.sourceId),
  index("operation_events_kind_date_idx").on(table.kind, table.occurredAt),
]);

export const openingBalanceImportsTable = pgTable("opening_balance_imports", {
  id: serial("id").primaryKey(),
  importKey: text("import_key").notNull(),
  sourceFileName: text("source_file_name").notNull(),
  sourceSheet: text("source_sheet").notNull(),
  valuationMethod: text("valuation_method").notNull().default("weighted_average"),
  status: openingBalanceStatusEnum("status").notNull().default("draft"),
  createdBy: integer("created_by").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  approvedBy: integer("approved_by").references(() => adminUsersTable.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("opening_balance_imports_key_unique").on(table.importKey),
  check("opening_balance_imports_valuation_method", sql`${table.valuationMethod} = 'weighted_average'`),
  check("opening_balance_imports_approval_audit", sql`(${table.status} <> 'approved') or (${table.approvedBy} is not null and ${table.approvedAt} is not null)`),
]);

export const openingBalanceLinesTable = pgTable("opening_balance_lines", {
  id: serial("id").primaryKey(),
  importId: integer("import_id").notNull().references(() => openingBalanceImportsTable.id, { onDelete: "cascade" }),
  sourceRow: integer("source_row").notNull(),
  sourceLabel: text("source_label").notNull(),
  sourceQuantity: numeric("source_quantity", { precision: 19, scale: 4, mode: "string" }).notNull(),
  openingQuantity: integer("opening_quantity").notNull(),
  fullBatchUnitCost: numeric("full_batch_unit_cost", { precision: 19, scale: 4, mode: "string" }).notNull(),
  openingValue: numeric("opening_value", { precision: 19, scale: 4, mode: "string" }).notNull(),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "restrict" }),
  mappingState: openingBalanceMappingStateEnum("mapping_state").notNull().default("unmapped"),
  mappingNote: text("mapping_note"),
  provenance: jsonb("provenance").$type<{ file: string; sheet: string; row: number; columns?: Record<string, string> }>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("opening_balance_lines_import_idx").on(table.importId),
  check("opening_balance_lines_quantity_nonnegative", sql`${table.openingQuantity} >= 0 and ${table.sourceQuantity} >= 0`),
  check("opening_balance_lines_cost_nonnegative", sql`${table.fullBatchUnitCost} >= 0 and ${table.openingValue} >= 0`),
]);

export const insertOperationEventSchema = createInsertSchema(operationEventsTable).omit({ id: true, createdAt: true });
export const insertOpeningBalanceImportSchema = createInsertSchema(openingBalanceImportsTable).omit({ id: true, createdAt: true });
export const insertOpeningBalanceLineSchema = createInsertSchema(openingBalanceLinesTable).omit({ id: true, createdAt: true });
export type OperationEvent = typeof operationEventsTable.$inferSelect;
export type InsertOperationEvent = z.infer<typeof insertOperationEventSchema>;
export type OpeningBalanceImport = typeof openingBalanceImportsTable.$inferSelect;
export type OpeningBalanceLine = typeof openingBalanceLinesTable.$inferSelect;