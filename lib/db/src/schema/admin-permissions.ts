import { integer, pgTable, primaryKey, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminUsersTable } from "./admin-users";

export const adminPermissionsTable = pgTable("admin_permissions", {
  id: serial("id").primaryKey(),
  module: text("module").notNull(),
  action: text("action").notNull(),
}, (table) => [uniqueIndex("admin_permissions_module_action_unique").on(table.module, table.action)]);

export const adminUserPermissionsTable = pgTable("admin_user_permissions", {
  adminUserId: integer("admin_user_id").notNull().references(() => adminUsersTable.id, { onDelete: "cascade" }),
  permissionId: integer("permission_id").notNull().references(() => adminPermissionsTable.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.adminUserId, table.permissionId] })]);

export const insertAdminPermissionSchema = createInsertSchema(adminPermissionsTable).omit({ id: true });
export type InsertAdminPermission = z.infer<typeof insertAdminPermissionSchema>;