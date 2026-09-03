import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ownerSessionsTable } from "./owner-sessions";
import { ownerUsersTable } from "./owner-users";

export const ownerSessionNotificationsTable = pgTable("owner_session_notifications", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull().references(() => ownerUsersTable.id, { onDelete: "cascade" }),
  recipientSessionId: integer("recipient_session_id").notNull().references(() => ownerSessionsTable.id, { onDelete: "cascade" }),
  newSessionId: integer("new_session_id").notNull(),
  deviceLabel: text("device_label").notNull(),
  browser: text("browser").notNull(),
  operatingSystem: text("operating_system").notNull(),
  sessionCreatedAt: timestamp("session_created_at", { withTimezone: true }).notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("owner_session_notifications_recipient_new_unique").on(
    table.recipientSessionId,
    table.newSessionId,
  ),
]);

export const insertOwnerSessionNotificationSchema = createInsertSchema(ownerSessionNotificationsTable)
  .omit({ id: true, createdAt: true });
export type InsertOwnerSessionNotification = z.infer<typeof insertOwnerSessionNotificationSchema>;
export type OwnerSessionNotification = typeof ownerSessionNotificationsTable.$inferSelect;