import { check, pgTable, serial, timestamp, uniqueIndex, integer, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const cartsTable = pgTable("storefront_carts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => customersTable.id, { onDelete: "cascade" }),
  guestToken: text("guest_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("storefront_carts_user_id_unique").on(table.userId),
  uniqueIndex("storefront_carts_guest_token_unique").on(table.guestToken),
  check("storefront_carts_owner_check", sql`(user_id is not null) <> (guest_token is not null)`),
]);

export const insertCartSchema = createInsertSchema(cartsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCart = z.infer<typeof insertCartSchema>;
export type Cart = typeof cartsTable.$inferSelect;