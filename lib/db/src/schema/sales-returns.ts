import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, numeric, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { adminUsersTable } from "./admin-users";
import { companyOrderItemsTable, companyOrdersTable } from "./distributor-portal";
import { inventoryLocationsTable } from "./inventory-operations";
import { orderItemsTable } from "./order-items";
import { ordersTable } from "./orders";
import { productsTable } from "./products";

export const salesReturnsTable = pgTable("sales_returns", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id"),
  companyOrderId: integer("company_order_id"),
  status: text("status").notNull().default("draft"),
  reason: text("reason"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedBy: integer("completed_by"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completionKey: text("completion_key").unique("sales_returns_completion_key_key"),
  completionFingerprint: text("completion_fingerprint"),
}, (t) => [
  foreignKey({ name: "sales_returns_order_id_fkey", columns: [t.orderId], foreignColumns: [ordersTable.id] }).onDelete("restrict"),
  foreignKey({ name: "sales_returns_company_order_id_fkey", columns: [t.companyOrderId], foreignColumns: [companyOrdersTable.id] }).onDelete("restrict"),
  foreignKey({ name: "sales_returns_created_by_fkey", columns: [t.createdBy], foreignColumns: [adminUsersTable.id] }).onDelete("restrict"),
  foreignKey({ name: "sales_returns_completed_by_fkey", columns: [t.completedBy], foreignColumns: [adminUsersTable.id] }).onDelete("restrict"),
  check("sales_returns_one_source", sql`(${t.orderId} is not null)::integer + (${t.companyOrderId} is not null)::integer = 1`),
  check("sales_returns_status_check", sql`${t.status} in ('draft', 'completed', 'cancelled')`),
  check("sales_returns_completion_check", sql`(${t.status} = 'completed' and ${t.completedBy} is not null and ${t.completedAt} is not null and ${t.completionKey} is not null and ${t.completionFingerprint} is not null) or (${t.status} in ('draft', 'cancelled') and ${t.completedBy} is null and ${t.completedAt} is null and ${t.completionKey} is null and ${t.completionFingerprint} is null)`),
  unique("sales_returns_order_parent_unique").on(t.id, t.orderId),
  unique("sales_returns_company_parent_unique").on(t.id, t.companyOrderId),
  index("sales_returns_order_idx").on(t.orderId),
  index("sales_returns_company_order_idx").on(t.companyOrderId),
  index("sales_returns_status_created_idx").on(t.status, t.createdAt),
]);

export const salesReturnLinesTable = pgTable("sales_return_lines", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").notNull(),
  orderId: integer("order_id"),
  companyOrderId: integer("company_order_id"),
  orderItemId: integer("order_item_id"),
  companyOrderItemId: integer("company_order_item_id"),
  productId: integer("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  condition: text("condition").notNull(),
  unitCost: numeric("unit_cost", { precision: 19, scale: 4 }).notNull(),
  targetLocationId: integer("target_location_id"),
}, (t) => [
  foreignKey({ name: "sales_return_lines_return_id_fkey", columns: [t.returnId], foreignColumns: [salesReturnsTable.id] }).onDelete("restrict"),
  foreignKey({ name: "sales_return_lines_product_id_fkey", columns: [t.productId], foreignColumns: [productsTable.id] }).onDelete("restrict"),
  foreignKey({ name: "sales_return_lines_target_location_id_fkey", columns: [t.targetLocationId], foreignColumns: [inventoryLocationsTable.id] }).onDelete("restrict"),
  check("sales_return_lines_one_source", sql`(${t.orderId} is not null and ${t.orderItemId} is not null and ${t.companyOrderId} is null and ${t.companyOrderItemId} is null) or (${t.companyOrderId} is not null and ${t.companyOrderItemId} is not null and ${t.orderId} is null and ${t.orderItemId} is null)`),
  check("sales_return_lines_quantity_check", sql`${t.quantity} > 0`),
  check("sales_return_lines_condition_check", sql`${t.condition} in ('new', 'opened', 'damaged')`),
  check("sales_return_lines_cost_check", sql`${t.unitCost} >= 0`),
  check("sales_return_lines_destination_check", sql`(${t.condition} = 'damaged' and ${t.targetLocationId} is null) or (${t.condition} in ('new', 'opened') and ${t.targetLocationId} is not null)`),
  foreignKey({ name: "sales_return_lines_order_parent_fk", columns: [t.returnId, t.orderId], foreignColumns: [salesReturnsTable.id, salesReturnsTable.orderId] }).onDelete("restrict"),
  foreignKey({ name: "sales_return_lines_company_parent_fk", columns: [t.returnId, t.companyOrderId], foreignColumns: [salesReturnsTable.id, salesReturnsTable.companyOrderId] }).onDelete("restrict"),
  foreignKey({ name: "sales_return_lines_order_source_fk", columns: [t.orderItemId, t.orderId, t.productId], foreignColumns: [orderItemsTable.id, orderItemsTable.orderId, orderItemsTable.productId] }).onDelete("restrict"),
  foreignKey({ name: "sales_return_lines_company_source_fk", columns: [t.companyOrderItemId, t.companyOrderId, t.productId], foreignColumns: [companyOrderItemsTable.id, companyOrderItemsTable.companyOrderId, companyOrderItemsTable.productId] }).onDelete("restrict"),
  unique("sales_return_lines_order_condition_unique").on(t.returnId, t.orderItemId, t.condition),
  unique("sales_return_lines_company_condition_unique").on(t.returnId, t.companyOrderItemId, t.condition),
  index("sales_return_lines_order_item_idx").on(t.orderItemId),
  index("sales_return_lines_company_item_idx").on(t.companyOrderItemId),
  index("sales_return_lines_location_idx").on(t.targetLocationId),
]);