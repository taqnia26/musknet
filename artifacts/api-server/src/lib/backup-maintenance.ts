import type { NextFunction, Request, Response } from "express";
import { getMaintenanceState } from "./backup-control";
import { acquireBackupWriteFence } from "./backup-fence";

/**
 * Restore must never admit writes while rows/files are being replaced.
 * The durable flag covers every API instance, not just the worker process.
 */
export async function backupMaintenanceGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS" || /^\/admin\/backups(?:\/|$)/.test(req.path)) {
    next();
    return;
  }
  try {
    const state = await getMaintenanceState();
    if (!state.maintenance) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        const release = await acquireBackupWriteFence();
        if (!release) {
          res.status(503).json({ code: "backup_maintenance", error: "بدأت صيانة النسخ الاحتياطي. حاول لاحقاً." });
          return;
        }
        res.once("finish", () => { void release(); });
        res.once("close", () => { void release(); });
      }
      next();
      return;
    }
    const readOnly = req.method === "GET" || req.method === "HEAD";
    const safeStatusRead = readOnly && ["/healthz", "/admin/me", "/admin/auth/me"].includes(req.path);
    if (safeStatusRead || (readOnly && state.operation === "backup")) { next(); return; }
    res.setHeader("Retry-After", "30");
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      code: "backup_maintenance",
      error: "الموقع في وضع صيانة مؤقت أثناء النسخ أو الاستعادة. حاول لاحقاً.",
    });
  } catch (error) {
    // Fail closed for writes if the persistent guard cannot be checked.
    if (req.method === "GET" || req.method === "HEAD") { next(); return; }
    req.log.error({ error: error instanceof Error ? error.name : "UnknownError" }, "Backup write guard unavailable");
    res.status(503).json({ code: "backup_guard_unavailable", error: "تعذر التحقق من حالة الصيانة. حاول لاحقاً." });
  }
}