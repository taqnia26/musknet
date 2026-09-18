import { boolean, doublePrecision, integer, pgTable, serial, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { couponsTable } from "./coupons";

export const influencersTable = pgTable("storefront_influencers", {
  id: serial("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(), imageUrl: text("image_url"), referralCode: text("referral_code").notNull(),
  commissionRate: doublePrecision("commission_rate").notNull().default(10), isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("influencers_email_unique").on(t.email), uniqueIndex("influencers_referral_unique").on(t.referralCode)]);
export const influencerSessionsTable = pgTable("storefront_influencer_sessions", {
  id: serial("id").primaryKey(), influencerId: integer("influencer_id").notNull().references(() => influencersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex("influencer_sessions_token_unique").on(t.tokenHash)]);
export const influencerVisitsTable = pgTable("storefront_influencer_visits", {
  id: serial("id").primaryKey(), influencerId: integer("influencer_id").notNull().references(() => influencersTable.id, { onDelete: "cascade" }),
  visitorKey: text("visitor_key").notNull(), landingPath: text("landing_path"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("influencer_visits_influencer_created").on(t.influencerId, t.createdAt)]);
export const influencerCouponsTable = pgTable("storefront_influencer_coupons", {
  influencerId: integer("influencer_id").notNull().references(() => influencersTable.id, { onDelete: "cascade" }),
  couponId: integer("coupon_id").notNull().references(() => couponsTable.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("influencer_coupon_unique").on(t.influencerId, t.couponId), uniqueIndex("influencer_coupon_owner_unique").on(t.couponId)]);
export const orderAttributionsTable = pgTable("storefront_order_attributions", {
  orderId: integer("order_id").primaryKey().references(() => ordersTable.id, { onDelete: "cascade" }),
  influencerId: integer("influencer_id").notNull().references(() => influencersTable.id, { onDelete: "restrict" }),
  source: text("source").notNull(), commissionRate: doublePrecision("commission_rate").notNull(),
  commissionAmount: doublePrecision("commission_amount").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertInfluencerSchema = createInsertSchema(influencersTable).omit({ id: true, createdAt: true });
export type Influencer = typeof influencersTable.$inferSelect;
export type InsertInfluencer = z.infer<typeof insertInfluencerSchema>;