import { check, date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminUsersTable } from "./admin-users";

export const annualAgendaEventsTable = pgTable("annual_agenda_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  recurrence: text("recurrence").notNull().default("none"),
  note: text("note"),
  createdBy: integer("created_by").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  check("annual_agenda_event_dates_valid", sql`${table.endDate} >= ${table.startDate}`),
  check("annual_agenda_event_type_valid", sql`${table.type} in ('exhibition', 'occasion', 'holiday', 'launch', 'other')`),
  check("annual_agenda_event_recurrence_valid", sql`${table.recurrence} in ('none', 'annual_gregorian')`),
  check("annual_agenda_exhibitions_manual", sql`${table.type} <> 'exhibition' or ${table.recurrence} = 'none'`),
]);

export const insertAnnualAgendaEventSchema = createInsertSchema(annualAgendaEventsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAnnualAgendaEvent = z.infer<typeof insertAnnualAgendaEventSchema>;
export type AnnualAgendaEvent = typeof annualAgendaEventsTable.$inferSelect;