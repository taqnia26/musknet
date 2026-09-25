import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminUsersTable } from "./admin-users";
import { campaignsTable } from "./campaigns";

export const socialPostsTable = pgTable("marketing_social_posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  caption: text("caption").notNull(),
  platforms: text("platforms").array().notNull(),
  mediaUrls: text("media_urls").array().notNull().default(sql`'{}'::text[]`),
  status: text("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
  createdBy: integer("created_by").references(() => adminUsersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("marketing_social_posts_schedule_idx").on(table.status, table.scheduledAt),
  check("marketing_social_posts_status_check", sql`${table.status} IN ('draft', 'scheduled', 'published_manual')`),
]);

export const insertSocialPostSchema = createInsertSchema(socialPostsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type SocialPost = typeof socialPostsTable.$inferSelect;