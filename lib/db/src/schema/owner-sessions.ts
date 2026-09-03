import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ownerUsersTable } from "./owner-users";

export const ownerSessionsTable = pgTable("owner_sessions", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull().references(() => ownerUsersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  deviceLabel: text("device_label").notNull().default("Unknown device"),
  browser: text("browser").notNull().default("Unknown browser"),
  operatingSystem: text("operating_system").notNull().default("Unknown operating system"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("owner_sessions_token_hash_unique").on(table.tokenHash)]);

export const insertOwnerSessionSchema = createInsertSchema(ownerSessionsTable).omit({ id: true, createdAt: true });
export type InsertOwnerSession = z.infer<typeof insertOwnerSessionSchema>;
export type OwnerSession = typeof ownerSessionsTable.$inferSelect;