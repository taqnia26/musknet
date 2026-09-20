import { doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
  carrierShipmentId: text("carrier_shipment_id"),
  labelUrl: text("label_url"),
  status: text("status").notNull().default("pending"),
  integrationStatus: text("integration_status").notNull().default("not_requested"),
  integrationError: text("integration_error"),
  integrationAttempts: integer("integration_attempts").notNull().default(0),
  lastIntegrationAttemptAt: timestamp("last_integration_attempt_at", { withTimezone: true }),
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

export const shipmentEventsTable = pgTable("shipment_events", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").notNull().references(() => shipmentsTable.id, { onDelete: "cascade" }),
  carrier: text("carrier").notNull(),
  eventType: text("event_type").notNull(),
  status: text("status"),
  outcome: text("outcome").notNull(),
  errorMessage: text("error_message"),
  carrierEventId: text("carrier_event_id"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("shipment_events_shipment_created_idx").on(table.shipmentId, table.createdAt),
  uniqueIndex("shipment_events_carrier_event_unique").on(table.carrier, table.carrierEventId),
]);

export const insertShipmentEventSchema = createInsertSchema(shipmentEventsTable).omit({ id: true, createdAt: true });
export type InsertShipmentEvent = z.infer<typeof insertShipmentEventSchema>;
export type ShipmentEvent = typeof shipmentEventsTable.$inferSelect;