import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  maintenance: true,
  rows: [] as Array<{ id: number; event_type: string; payload: unknown; processed_at: boolean; error: string | null }>,
  nextId: 1,
  queueLock: false,
  fencedWriters: 0,
  fenceReleased: null as null | (() => void),
}));

vi.mock("@workspace/db", () => ({
  backupWritePool: {
    query: async (text: string, values: unknown[] = []) => {
      if (text.startsWith("INSERT INTO backup_deferred_whatsapp")) {
        state.rows.push({
          id: state.nextId++, event_type: String(values[0]),
          payload: JSON.parse(String(values[1])), processed_at: false, error: null,
        });
        return { rows: [] };
      }
      throw new Error(`Unexpected pool query: ${text}`);
    },
    connect: async () => ({
      query: async (text: string, values: unknown[] = []) => {
        if (text.includes("pg_try_advisory_lock")) {
          if (state.queueLock) return { rows: [{ locked: false }] };
          state.queueLock = true;
          return { rows: [{ locked: true }] };
        }
        if (text.startsWith("SELECT id, event_type, payload")) {
          const row = state.rows.find((entry) => !entry.processed_at);
          return { rows: row ? [{ id: row.id, event_type: row.event_type, payload: row.payload }] : [] };
        }
        if (text.startsWith("UPDATE backup_deferred_whatsapp SET processed_at")) {
          const row = state.rows.find((entry) => entry.id === Number(values[0]));
          if (row) { row.processed_at = true; row.error = null; }
          return { rows: [] };
        }
        if (text.startsWith("UPDATE backup_deferred_whatsapp SET error")) {
          const row = state.rows.find((entry) => entry.id === Number(values[0]));
          if (row) row.error = String(values[1]);
          return { rows: [] };
        }
        if (text.includes("pg_advisory_unlock")) {
          state.queueLock = false;
          return { rows: [] };
        }
        throw new Error(`Unexpected client query: ${text}`);
      },
      release: vi.fn(),
    }),
  },
}));

vi.mock("./backup-fence", () => ({
  withBackupWriteFence: async (handler: () => Promise<unknown>) => {
    if (state.maintenance) return undefined;
    state.fencedWriters++;
    try {
      return await handler();
    } finally {
      state.fencedWriters--;
      state.fenceReleased?.();
      state.fenceReleased = null;
    }
  },
}));

import { drainDeferredWhatsappEvents, enqueueDeferredWhatsappEvent } from "./whatsapp-deferred";

describe("deferred WhatsApp ingress writer fence", () => {
  beforeEach(() => {
    state.maintenance = true;
    state.rows.length = 0;
    state.nextId = 1;
    state.queueLock = false;
    state.fencedWriters = 0;
    state.fenceReleased = null;
  });

  it("durably queues events during maintenance without running business writes", async () => {
    const handler = vi.fn(async () => undefined);
    await enqueueDeferredWhatsappEvent("messages.upsert", { messages: [{ key: { id: "m1" } }] });
    expect(await drainDeferredWhatsappEvents(handler)).toBeUndefined();
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].processed_at).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("replays queued ingress once after maintenance resumes", async () => {
    await enqueueDeferredWhatsappEvent("contacts.upsert", { contacts: [{ id: "123@s.whatsapp.net" }] });
    const handler = vi.fn(async () => undefined);
    state.maintenance = false;
    expect(await drainDeferredWhatsappEvents(handler)).toBe(1);
    expect(await drainDeferredWhatsappEvents(handler)).toBe(0);
    expect(handler).toHaveBeenCalledOnce();
    expect(state.rows[0].processed_at).toBe(true);
  });

  it("keeps the shared writer fence held until an asynchronous replay callback finishes", async () => {
    await enqueueDeferredWhatsappEvent("messages.upsert", { messages: [{ key: { id: "m2" } }] });
    state.maintenance = false;
    let finishHandler!: () => void;
    let handlerStarted!: () => void;
    const started = new Promise<void>((resolve) => { handlerStarted = resolve; });
    const work = drainDeferredWhatsappEvents(async () => {
      handlerStarted();
      await new Promise<void>((resolve) => { finishHandler = resolve; });
    });
    await started;

    let engineExclusiveStarted = false;
    const engineExclusive = (async () => {
      if (state.fencedWriters > 0) {
        await new Promise<void>((resolve) => { state.fenceReleased = resolve; });
      }
      engineExclusiveStarted = true;
    })();
    await Promise.resolve();
    expect(engineExclusiveStarted).toBe(false);
    finishHandler();
    await work;
    await engineExclusive;
    expect(engineExclusiveStarted).toBe(true);
  });
});