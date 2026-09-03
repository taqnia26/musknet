import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pageViewsTable = pgTable("storefront_page_views", {
  id: serial("id").primaryKey(),
  sessionKey: text("session_key").notNull(),
  path: text("path").notNull(),
  referrer: text("referrer"),
  source: text("source").notNull().default("direct"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("storefront_page_views_created_idx").on(table.createdAt),
  index("storefront_page_views_session_created_idx").on(table.sessionKey, table.createdAt),
  index("storefront_page_views_source_created_idx").on(table.source, table.createdAt),
]);

export const insertPageViewSchema = createInsertSchema(pageViewsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPageView = z.infer<typeof insertPageViewSchema>;
export type PageView = typeof pageViewsTable.$inferSelect;