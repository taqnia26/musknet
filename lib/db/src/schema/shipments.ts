import { doublePrecision, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { invoicesTable } from "./invoices";

export const shipmentsTable = pgTable("shipments", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull(),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "cascade" }),
  invoiceId: integer("invoice_id").references(() => invoicesTable.id, { onDelete: "cascade" }),
  destinationCity: text("destination_city").notNull(),
  destinationAddress: text("destination_address"),
  carrier: text("carrier"),
  serviceMethod: text("service_method"),
  trackingNumber: text("tracking_number"),
  status: text("status").notNull().default("pending"),
  actualCost: doublePrecision("actual_cost"),
  collectedCost: doublePrecision("collected_cost"),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("shipments_order_id_unique").on(table.orderId),
  uniqueIndex("shipments_invoice_id_unique").on(table.invoiceId),
]);

export const insertShipmentSchema = createInsertSchema(shipmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipmentsTable.$inferSelect;