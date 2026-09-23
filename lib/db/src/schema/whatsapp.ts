import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const whatsappAuthStateTable = pgTable("whatsapp_auth_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const whatsappChatsTable = pgTable("whatsapp_chats", {
  jid: text("jid").primaryKey(),
  name: text("name").notNull(),
  nameSource: text("name_source").notNull().default("message"),
  manualName: text("manual_name"),
  phone: text("phone").notNull(),
  unread: integer("unread").notNull().default(0),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const whatsappMessagesTable = pgTable("whatsapp_messages", {
  id: text("id").primaryKey(),
  chatJid: text("chat_jid").notNull().references(() => whatsappChatsTable.jid, { onDelete: "cascade" }),
  text: text("text").notNull(),
  fromMe: boolean("from_me").notNull().default(false),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("sent"),
});

export const insertWhatsappChatSchema = createInsertSchema(whatsappChatsTable);
export const insertWhatsappMessageSchema = createInsertSchema(whatsappMessagesTable);
export type WhatsappChat = typeof whatsappChatsTable.$inferSelect;
export type WhatsappMessage = typeof whatsappMessagesTable.$inferSelect;
export type InsertWhatsappChat = z.infer<typeof insertWhatsappChatSchema>;
export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;