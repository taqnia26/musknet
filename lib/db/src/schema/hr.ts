import { boolean, check, date, doublePrecision, integer, pgEnum, pgTable, serial, text, time, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminUsersTable } from "./admin-users";

export const attendanceStatusEnum = pgEnum("attendance_status", ["present", "absent", "late", "on_leave"]);
export const leaveTypeEnum = pgEnum("leave_type", ["annual", "sick", "emergency", "unpaid"]);
export const leaveStatusEnum = pgEnum("leave_status", ["pending", "approved", "rejected"]);
export const payrollPaymentStatusEnum = pgEnum("payroll_payment_status", ["pending", "paid"]);

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nationalId: text("national_id").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  position: text("position").notNull(),
  department: text("department").notNull(),
  salary: doublePrecision("salary").notNull(),
  hireDate: date("hire_date", { mode: "string" }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  adminUserId: integer("admin_user_id").references(() => adminUsersTable.id, { onDelete: "restrict" }),
}, (table) => [
  uniqueIndex("employees_national_id_unique").on(table.nationalId),
  check("employees_salary_nonnegative", sql`${table.salary} >= 0`),
]);

export const attendanceRecordsTable = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "restrict" }),
  date: date("date", { mode: "string" }).notNull(),
  checkInTime: time("check_in_time"),
  checkOutTime: time("check_out_time"),
  status: attendanceStatusEnum("status").notNull(),
  notes: text("notes"),
}, (table) => [uniqueIndex("attendance_employee_date_unique").on(table.employeeId, table.date)]);

export const leaveRequestsTable = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "restrict" }),
  leaveType: leaveTypeEnum("leave_type").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  status: leaveStatusEnum("status").notNull().default("pending"),
  reason: text("reason").notNull(),
  approvedBy: integer("approved_by").references(() => adminUsersTable.id, { onDelete: "restrict" }),
}, (table) => [check("leave_dates_valid", sql`${table.endDate} >= ${table.startDate}`)]);

export const payrollRecordsTable = pgTable("payroll_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "restrict" }),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  baseSalary: doublePrecision("base_salary").notNull(),
  deductions: doublePrecision("deductions").notNull(),
  bonuses: doublePrecision("bonuses").notNull(),
  netSalary: doublePrecision("net_salary").notNull(),
  paymentDate: date("payment_date", { mode: "string" }),
  paymentStatus: payrollPaymentStatusEnum("payment_status").notNull().default("pending"),
}, (table) => [
  uniqueIndex("payroll_employee_period_unique").on(table.employeeId, table.month, table.year),
  check("payroll_month_valid", sql`${table.month} between 1 and 12`),
  check("payroll_year_valid", sql`${table.year} between 1900 and 2200`),
  check("payroll_amounts_nonnegative", sql`${table.baseSalary} >= 0 and ${table.deductions} >= 0 and ${table.bonuses} >= 0 and ${table.netSalary} >= 0`),
]);

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true });
export const insertAttendanceRecordSchema = createInsertSchema(attendanceRecordsTable).omit({ id: true });
export const insertLeaveRequestSchema = createInsertSchema(leaveRequestsTable).omit({ id: true });
export const insertPayrollRecordSchema = createInsertSchema(payrollRecordsTable).omit({ id: true });
export type Employee = typeof employeesTable.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;