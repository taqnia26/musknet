import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const rows = new Map<string, string>();
  const sockets: Array<{ events: Record<string, (value: any) => any>; end: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> }> = [];
  return { rows, sockets, qr: vi.fn(async (value: string) => `data:image/png;base64,${value}`) };
});
vi.mock("./whatsapp-alert", () => ({ sendWhatsappDisconnectAlert: vi.fn(async () => undefined) }));
vi.mock("./logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.qr } }));
vi.mock("@workspace/db", () => ({
  whatsappAuthStateTable: { key: "key" },
  whatsappChatsTable: {}, whatsappMessagesTable: {},
  db: {
    select: () => ({ from: async () => [...mocks.rows].map(([key, value]) => ({ key, value })) }),
    insert: () => ({ values: ({ key, value }: { key: string; value: string }) => ({
      onConflictDoUpdate: async () => { mocks.rows.set(key, value); },
    }) }),
    delete: () => ({
      where: async (_: unknown) => { for (const key of [...mocks.rows.keys()]) if (key !== "connection-monitor") mocks.rows.delete(key); },
      then: (resolve: (value: unknown) => void) => { mocks.rows.clear(); resolve(undefined); },
    }),
  },
}));
vi.mock("@whiskeysockets/baileys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@whiskeysockets/baileys")>();
  return {
    ...actual,
    default: () => {
      const socket = {
        events: {} as Record<string, (value: any) => any>,
        end: vi.fn(),
        logout: vi.fn(async () => undefined),
        ev: { on(event: string, callback: (value: any) => any) { socket.events[event] = callback; } },
      };
      mocks.sockets.push(socket);
      return socket;
    },
  };
});

import { WhatsAppManager } from "./whatsapp";
import { sendWhatsappDisconnectAlert } from "./whatsapp-alert";

const emit = async (index: number, event: string, value: unknown) => {
  await mocks.sockets[index].events[event](value);
};

describe("WhatsApp pairing lifecycle", () => {
  beforeEach(() => {
    mocks.rows.clear();
    mocks.sockets.length = 0;
    mocks.qr.mockClear();
    vi.mocked(sendWhatsappDisconnectAlert).mockClear();
    process.env.SESSION_SECRET = "whatsapp-test-secret";
  });

  it("does not start a new unregistered connection on status polling, and reuses a pending QR on repeated connect", async () => {
    const manager = new WhatsAppManager();
    await manager.restore();
    expect(mocks.sockets).toHaveLength(0);
    await Promise.all([manager.start(true), manager.start(true)]);
    expect(mocks.sockets).toHaveLength(1);
    await emit(0, "connection.update", { qr: "first" });
    expect(manager.state()).toMatchObject({ status: "qr", qr: "data:image/png;base64,first" });
    await manager.start(true);
    await manager.restore();
    expect(mocks.sockets).toHaveLength(1);
    expect(manager.state().qr).toContain("first");
    await emit(0, "connection.update", { qr: "second" });
    expect(manager.state().qr).toContain("second");
    expect(mocks.qr).toHaveBeenCalledTimes(2);
    await manager.logout();
  });

  it("hides a scanned QR, saves credentials and reconnects on restartRequired before reporting connected", async () => {
    vi.useFakeTimers();
    try {
      const manager = new WhatsAppManager();
      await manager.start(true);
      await emit(0, "connection.update", { qr: "first" });
      await emit(0, "creds.update", { registered: true });
      await emit(0, "connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode: 515 } } } });
      expect(manager.state()).toMatchObject({ status: "completing", qr: null, connected: false });
      expect(mocks.rows.has("creds")).toBe(true);
      await vi.advanceTimersByTimeAsync(100);
      expect(mocks.sockets).toHaveLength(2);
      await emit(1, "connection.update", { connection: "open" });
      expect(manager.state()).toMatchObject({ status: "connected", qr: null, connected: true });
      const restored = new WhatsAppManager();
      await restored.restore();
      expect(mocks.sockets).toHaveLength(3);
      await emit(2, "connection.update", { connection: "open" });
      expect(restored.state().status).toBe("connected");
      await manager.logout();
    } finally { vi.useRealTimers(); }
  });

  it("reconnects an expired unregistered QR without wiping the pairing session", async () => {
    vi.useFakeTimers();
    try {
      const manager = new WhatsAppManager();
      await manager.start(true);
      await emit(0, "connection.update", { qr: "old" });
      await vi.advanceTimersByTimeAsync(60000);
      expect(manager.state()).toMatchObject({ status: "connecting", qr: null });
      expect(mocks.sockets[0].end).toHaveBeenCalledOnce();
      await emit(0, "connection.update", { connection: "close" });
      await vi.advanceTimersByTimeAsync(1500);
      expect(mocks.sockets).toHaveLength(2);
      await emit(1, "connection.update", { qr: "new" });
      expect(manager.state().qr).toContain("new");
      await manager.logout();
    } finally { vi.useRealTimers(); }
  });

  it("reports QR generation failure without exposing the raw code", async () => {
    const manager = new WhatsAppManager();
    await manager.start(true);
    mocks.qr.mockRejectedValueOnce(new Error("secret raw qr"));
    await emit(0, "connection.update", { qr: "secret raw qr" });
    expect(manager.state()).toMatchObject({ status: "disconnected", qr: null });
    expect(manager.state().lastError).not.toContain("secret raw qr");
    await manager.logout();
  });

  it("shows a retryable error when the server never receives a QR or open event", async () => {
    vi.useFakeTimers();
    try {
      const manager = new WhatsAppManager();
      await manager.start(true);
      await vi.advanceTimersByTimeAsync(45000);
      expect(manager.state()).toMatchObject({ status: "disconnected", qr: null, connected: false });
      expect(manager.state().lastError).toContain("try again");
      await manager.restore();
      expect(mocks.sockets).toHaveLength(1);
      await manager.start(true);
      expect(mocks.sockets).toHaveLength(2);
      await manager.logout();
    } finally { vi.useRealTimers(); }
  });

  it("alerts once after a sustained outage, across reconnection attempts and server restart", async () => {
    vi.useFakeTimers();
    try {
      const manager = new WhatsAppManager();
      await manager.start(true);
      await emit(0, "creds.update", { registered: true });
      await emit(0, "connection.update", { connection: "open" });
      await emit(0, "connection.update", { connection: "close" });
      await vi.advanceTimersByTimeAsync(1500);
      await emit(1, "connection.update", { connection: "close" });
      await vi.advanceTimersByTimeAsync(110_000);
      expect(sendWhatsappDisconnectAlert).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(sendWhatsappDisconnectAlert).toHaveBeenCalledTimes(1);
      expect(manager.state().connectionAlerted).toBe(true);
      const restarted = new WhatsAppManager();
      await restarted.restore();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(sendWhatsappDisconnectAlert).toHaveBeenCalledTimes(1);
      await manager.logout();
      await restarted.logout();
    } finally { vi.useRealTimers(); }
  });

  it("does not alert for a brief drop, initial pairing, or intentional logout", async () => {
    vi.useFakeTimers();
    try {
      const manager = new WhatsAppManager();
      await manager.start(true);
      await vi.advanceTimersByTimeAsync(46_000);
      expect(sendWhatsappDisconnectAlert).not.toHaveBeenCalled();
      await manager.start(true);
      await emit(1, "creds.update", { registered: true });
      await emit(1, "connection.update", { connection: "open" });
      await emit(1, "connection.update", { connection: "close" });
      await vi.advanceTimersByTimeAsync(1500);
      await emit(2, "connection.update", { connection: "open" });
      await vi.advanceTimersByTimeAsync(180_000);
      expect(sendWhatsappDisconnectAlert).not.toHaveBeenCalled();
      await manager.logout();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(sendWhatsappDisconnectAlert).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("alerts after a remote logout but not again after a restart", async () => {
    vi.useFakeTimers();
    try {
      const manager = new WhatsAppManager();
      await manager.start(true);
      await emit(0, "creds.update", { registered: true });
      await emit(0, "connection.update", { connection: "open" });
      await emit(0, "connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode: 401 } } } });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(sendWhatsappDisconnectAlert).toHaveBeenCalledTimes(1);
      const restarted = new WhatsAppManager();
      await restarted.restore();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(sendWhatsappDisconnectAlert).toHaveBeenCalledTimes(1);
      await manager.logout();
      await restarted.logout();
    } finally { vi.useRealTimers(); }
  });
});