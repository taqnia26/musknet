import { sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Control-plane records only. These tables intentionally do not reference
 * business data tables because those tables may be replaced by a restore.
 */
export const backupRecordsTable = pgTable("backup_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  reason: text("reason").notNull(),
  label: text("label"),
  status: text("status").notNull().default("queued"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
  rowCount: integer("row_count").notNull().default(0),
  tableCount: integer("table_count").notNull().default(0),
  fileCount: integer("file_count").notNull().default(0),
  error: text("error"),
  safetyBackupId: uuid("safety_backup_id"),
  targetBackupId: uuid("target_backup_id"),
  actorId: integer("actor_id"),
}, (table) => [
  check("backup_records_reason_check", sql`${table.reason} in ('manual', 'scheduled', 'restore', 'pre_restore')`),
  check("backup_records_status_check", sql`${table.status} in ('queued', 'running', 'completed', 'failed')`),
  index("backup_records_created_idx").on(table.createdAt),
  index("backup_records_status_created_idx").on(table.status, table.createdAt),
  uniqueIndex("backup_records_one_active_job").on(sql`(1)`)
    .where(sql`${table.status} in ('queued', 'running') and ${table.reason} <> 'pre_restore'`),
]);

export const backupSettingsTable = pgTable("backup_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: boolean("enabled").notNull().default(false),
  frequency: text("frequency").notNull().default("daily"),
  localDate: text("local_date"),
  localTime: text("local_time").notNull().default("02:00"),
  weekday: integer("weekday"),
  timeZone: text("time_zone").notNull().default("Asia/Riyadh"),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer("updated_by"),
}, (table) => [
  check("backup_settings_singleton_check", sql`${table.id} = 1`),
  check("backup_settings_frequency_check", sql`${table.frequency} in ('once', 'daily', 'weekly')`),
  check("backup_settings_weekday_check", sql`${table.weekday} is null or ${table.weekday} between 0 and 6`),
]);

export const backupRuntimeTable = pgTable("backup_runtime", {
  id: integer("id").primaryKey().default(1),
  operation: text("operation"),
  jobId: uuid("job_id"),
  maintenance: boolean("maintenance").notNull().default(false),
  recoveryRequired: boolean("recovery_required").notNull().default(false),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("backup_runtime_singleton_check", sql`${table.id} = 1`),
  check("backup_runtime_operation_check", sql`${table.operation} is null or ${table.operation} in ('backup', 'restore', 'recovery_required')`),
]);

/** Failed attempts are persisted too, so bad-password limits work across replicas. */
export const backupAccessGrantsTable = pgTable("backup_access_grants", {
  id: serial("id").primaryKey(),
  adminSessionHash: text("admin_session_hash").notNull(),
  accessTokenHash: text("access_token_hash"),
  passwordFingerprint: text("password_fingerprint"),
  outcome: text("outcome").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  check("backup_access_grants_outcome_check", sql`${table.outcome} in ('granted', 'rejected', 'restore-authorized')`),
  index("backup_access_grants_attempt_window_idx").on(table.adminSessionHash, table.outcome, table.createdAt),
  uniqueIndex("backup_access_grants_token_unique").on(table.accessTokenHash),
]);

export const insertBackupRecordSchema = createInsertSchema(backupRecordsTable).omit({ createdAt: true });
export type BackupRecord = typeof backupRecordsTable.$inferSelect;
export type InsertBackupRecord = z.infer<typeof insertBackupRecordSchema>;
export type BackupSettings = typeof backupSettingsTable.$inferSelect;
export type BackupRuntime = typeof backupRuntimeTable.$inferSelect;
export type BackupAccessGrant = typeof backupAccessGrantsTable.$inferSelect;