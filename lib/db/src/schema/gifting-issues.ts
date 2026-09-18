import { integer, numeric, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { adminUsersTable } from "./admin-users";

export const giftingCategoryEnum = pgEnum("gifting_issue_category", ["VIP", "Sample", "Damage", "Marketing", "Tester"]);

export const giftingIssuesTable = pgTable("gifting_issues", {
  id: serial("id").primaryKey(),
  recipientName: text("recipient_name").notNull(),
  category: giftingCategoryEnum("category").notNull(),
  comment: text("comment").notNull().default(""),
  program: text("program"),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  barcode: text("barcode").notNull(),
  descriptionSnapshot: text("description_snapshot").notNull(),
  quantity: integer("quantity").notNull(),
  totalCost: numeric("total_cost", { precision: 18, scale: 8 }).notNull(),
  issueDate: timestamp("issue_date", { withTimezone: true }),
  sourceFilename: text("source_filename").notNull(),
  sourceSheet: text("source_sheet").notNull(),
  sourceRow: integer("source_row").notNull(),
  rowFingerprint: text("row_fingerprint").notNull(),
  importBatch: text("import_batch").notNull(),
  importFingerprint: text("import_fingerprint").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  createdBy: integer("created_by").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("gifting_issues_dedupe_key_unique").on(table.dedupeKey),
  uniqueIndex("gifting_issues_row_fingerprint_unique").on(table.rowFingerprint),
]);

export const insertGiftingIssueSchema = createInsertSchema(giftingIssuesTable).omit({ id: true, importedAt: true });
export type InsertGiftingIssue = z.infer<typeof insertGiftingIssueSchema>;
export type GiftingIssue = typeof giftingIssuesTable.$inferSelect;