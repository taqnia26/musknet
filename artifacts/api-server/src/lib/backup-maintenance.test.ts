import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  release: vi.fn(async () => undefined),
  maintenance: false,
}));
vi.mock("./backup-control", () => ({
  getMaintenanceState: async () => ({ maintenance: mocks.maintenance, operation: "backup" }),
}));
vi.mock("./backup-fence", () => ({
  acquireBackupWriteFence: async () => mocks.release,
}));
import { backupMaintenanceGuard } from "./backup-maintenance";

describe("backup request lifetime fence", () => {
  beforeEach(() => { mocks.release.mockClear(); mocks.maintenance = false; });

  it("does not release an admitted delayed handler just because its client disconnects", async () => {
    const response = Object.assign(new EventEmitter(), {
      writableEnded: false,
      end() { this.writableEnded = true; return this; },
    }) as unknown as Response;
    const next = vi.fn();
    await backupMaintenanceGuard({ method: "POST", path: "/admin/products" } as Request, response, next);
    expect(next).toHaveBeenCalledOnce();
    response.emit("close");
    expect(mocks.release).not.toHaveBeenCalled();
    // The handler finishes its awaited DB/file work before ending the response.
    response.end();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});