import { boolean, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ownerUsersTable = pgTable("owner_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("owner_users_email_unique").on(table.email)]);

export const insertOwnerUserSchema = createInsertSchema(ownerUsersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOwnerUser = z.infer<typeof insertOwnerUserSchema>;
export type OwnerUser = typeof ownerUsersTable.$inferSelect;