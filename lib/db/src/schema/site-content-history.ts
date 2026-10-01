import { index, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const siteContentHistoryTable = pgTable("site_content_history", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  data: jsonb("data").$type<unknown>().notNull(),
  deletedBy: text("deleted_by").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  restoredBy: text("restored_by"),
  restoredAt: timestamp("restored_at", { withTimezone: true }),
}, (table) => [
  index("site_content_history_deleted_at_idx").on(table.deletedAt),
]);

export const insertSiteContentHistorySchema = createInsertSchema(siteContentHistoryTable)
  .omit({ id: true, deletedAt: true });
export type InsertSiteContentHistory = z.infer<typeof insertSiteContentHistorySchema>;
export type SiteContentHistory = typeof siteContentHistoryTable.$inferSelect;