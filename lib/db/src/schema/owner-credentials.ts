import { integer, pgTable, serial, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminUsersTable } from "./admin-users";

/** The single configurable credential used to authenticate the owner portal. */
export const ownerCredentialsTable = pgTable("owner_credentials", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer("updated_by").references(() => adminUsersTable.id, { onDelete: "restrict" }),
}, (table) => [check("owner_credentials_singleton_check", sql`${table.id} = 1`)]);

export type OwnerCredentials = typeof ownerCredentialsTable.$inferSelect;