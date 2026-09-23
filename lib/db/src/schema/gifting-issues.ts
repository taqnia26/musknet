import { check, integer, jsonb, numeric, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { adminUsersTable } from "./admin-users";

export const giftingCategoryEnum = pgEnum("gifting_issue_category", [
  "VIP", "Sample", "Damage", "Marketing", "Tester",
  "B2B_EVALUATION", "TESTER", "VIP_GIFT", "INFLUENCERS", "DAMAGED", "OTHER",
]);
export const b2bStockSourceEnum = pgEnum("b2b_stock_source", ["normal", "used_return"]);
export const b2bReturnConditionEnum = pgEnum("b2b_return_condition", ["new", "used", "mixed"]);

export const giftingIssuesTable = pgTable("gifting_issues", {
  id: serial("id").primaryKey(),
  recipientName: text("recipient_name"),
  city: text("city"),
  country: text("country"),
  category: giftingCategoryEnum("category").notNull(),
  comment: text("comment").notNull().default(""),
  reason: text("reason"),
  occasion: text("occasion"),
  program: text("program"),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  barcode: text("barcode").notNull(),
  descriptionSnapshot: text("description_snapshot").notNull(),
  quantity: integer("quantity").notNull(),
  stockSource: b2bStockSourceEnum("stock_source").notNull().default("normal"),
  returnedQuantity: integer("returned_quantity").notNull().default(0),
  returnCondition: b2bReturnConditionEnum("return_condition"),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  totalCost: numeric("total_cost", { precision: 18, scale: 8 }).notNull(),
  issueDate: timestamp("issue_date", { withTimezone: true }).notNull().defaultNow(),
  sourceFilename: text("source_filename"),
  sourceSheet: text("source_sheet"),
  sourceRow: integer("source_row"),
  rowFingerprint: text("row_fingerprint"),
  importBatch: text("import_batch"),
  importFingerprint: text("import_fingerprint"),
  dedupeKey: text("dedupe_key").notNull(),
  idempotencyKey: text("idempotency_key"),
  createdBy: integer("created_by").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: integer("voided_by").references(() => adminUsersTable.id, { onDelete: "restrict" }),
}, (table) => [
  uniqueIndex("gifting_issues_dedupe_key_unique").on(table.dedupeKey),
  uniqueIndex("gifting_issues_row_fingerprint_unique").on(table.rowFingerprint),
  uniqueIndex("gifting_issues_idempotency_key_unique").on(table.idempotencyKey),
  check("gifting_issues_returned_quantity_valid", sql`${table.returnedQuantity} >= 0 and ${table.returnedQuantity} <= ${table.quantity}`),
]);

export const giftingIssueReturnsTable = pgTable("gifting_issue_returns", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").notNull().references(() => giftingIssuesTable.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  quantity: integer("quantity").notNull(),
  condition: b2bReturnConditionEnum("condition").notNull(),
  responseSnapshot: jsonb("response_snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("gifting_issue_returns_idempotency_key_unique").on(table.idempotencyKey),
  uniqueIndex("gifting_issue_returns_issue_key_unique").on(table.issueId, table.idempotencyKey),
  check("gifting_issue_returns_quantity_positive", sql`${table.quantity} > 0`),
]);

export const insertGiftingIssueSchema = createInsertSchema(giftingIssuesTable).omit({ id: true, importedAt: true, voidedAt: true, voidedBy: true });
export type InsertGiftingIssue = z.infer<typeof insertGiftingIssueSchema>;
export type GiftingIssue = typeof giftingIssuesTable.$inferSelect;