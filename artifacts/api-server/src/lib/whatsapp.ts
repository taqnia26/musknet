import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import makeWASocket, {
  Browsers, BufferJSON, DisconnectReason, initAuthCreds, proto,
  type AuthenticationState, type SignalDataSet, type SignalKeyStore,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import { asc, desc, eq } from "drizzle-orm";
import {
  db, whatsappAuthStateTable, whatsappChatsTable, whatsappMessagesTable,
} from "@workspace/db";

export const encryptWhatsappState = (plain: string, secret = process.env.SESSION_SECRET): string => {
  if (!secret) throw new Error("SESSION_SECRET must be configured for WhatsApp sessions");
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
};

export const decryptWhatsappState = (encoded: string, secret = process.env.SESSION_SECRET): string => {
  if (!secret) throw new Error("SESSION_SECRET must be configured for WhatsApp sessions");
  const [ivText, tagText, dataText] = encoded.split(".");
  if (!ivText || !tagText || !dataText) throw new Error("Invalid encrypted WhatsApp state");
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
};
const waLogger = pino({ level: "silent" });

const encode = (value: unknown) => JSON.stringify(value, BufferJSON.replacer);
const decode = <T>(value: string) => JSON.parse(value, BufferJSON.reviver) as T;

async function useDatabaseAuthState(): Promise<AuthenticationState> {
  const rows = await db.select().from(whatsappAuthStateTable);
  const values = new Map(rows.map((row) => [row.key, decode<unknown>(decryptWhatsappState(row.value))]));
  const save = async (key: string, value: unknown) => {
    const encrypted = encryptWhatsappState(encode(value));
    await db.insert(whatsappAuthStateTable).values({ key, value: encrypted })
      .onConflictDoUpdate({ target: whatsappAuthStateTable.key, set: { value: encrypted, updatedAt: new Date() } });
  };
  const creds = (values.get("creds") as ReturnType<typeof initAuthCreds> | undefined) ?? initAuthCreds();
  const keys: SignalKeyStore = {
    get: async (type, ids) => Object.fromEntries(ids.map((id) => {
      const value = values.get(`${type}-${id}`);
      if (type === "app-state-sync-key" && value) {
        return [id, proto.Message.AppStateSyncKeyData.fromObject(value as object)];
      }
      return [id, value];
    }).filter(([, value]) => value !== undefined)) as never,
    set: async (data: SignalDataSet) => {
      for (const [type, entries] of Object.entries(data)) {
        for (const [id, value] of Object.entries(entries ?? {})) {
          const key = `${type}-${id}`;
          if (value === null) { values.delete(key); await db.delete(whatsappAuthStateTable).where(eq(whatsappAuthStateTable.key, key)); }
          else { values.set(key, value); await save(key, value); }
        }
      }
    },
    clear: async () => { values.clear(); await db.delete(whatsappAuthStateTable); },
  };
  return {
    creds,
    keys,
  } as AuthenticationState;
}

export const whatsappText = (message: proto.IMessage | null | undefined): string => {
  if (!message) return "";
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage) return "📷 صورة";
  if (message.videoMessage) return "🎥 فيديو";
  if (message.audioMessage) return "🎵 مقطع صوتي";
  if (message.documentMessage) return `📎 ${message.documentMessage.fileName ?? "مستند"}`;
  if (message.stickerMessage) return "🏷️ ملصق";
  return "رسالة غير نصية";
};

type ConnectionStatus = "disconnected" | "connecting" | "qr" | "completing" | "connected";
export class WhatsAppManager {
  private socket: ReturnType<typeof makeWASocket> | null = null;
  private starting: Promise<void> | null = null;
  private status: ConnectionStatus = "disconnected";
  private qr: string | null = null;
  private explicitLogout = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private lastError: string | null = null;
  private pairing = false;
  private qrTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private failed = false;

  async start(forcePair = false) {
    if (this.starting) return this.starting;
    if (this.socket || this.status === "connected") return;
    if (!forcePair && this.failed) return;
    if (forcePair) this.failed = false;
    if (forcePair) this.pairing = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.lastError = null;
    this.starting = this.connect().catch(() => {
      this.status = "disconnected";
      this.qr = null;
      this.failed = true;
      this.lastError = "Could not start WhatsApp pairing. Check the server connection and try again.";
    }).finally(() => { this.starting = null; });
    return this.starting;
  }

  async restore() { return this.start(false); }

  private clearQr() {
    if (this.qrTimer) clearTimeout(this.qrTimer);
    this.qrTimer = null;
    this.qr = null;
  }

  private clearConnectTimer() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private async connect() {
    this.status = "connecting"; this.clearQr();
    const auth = await useDatabaseAuthState();
    if (!auth.creds.registered && !this.pairing) {
      this.status = "disconnected";
      return;
    }
    const generation = ++this.generation;
    this.explicitLogout = false;
    const socket = makeWASocket({ auth, browser: Browsers.macOS("Chrome"), printQRInTerminal: false, syncFullHistory: true, logger: waLogger });
    this.socket = socket;
    this.connectTimer = setTimeout(() => {
      if (generation !== this.generation || this.socket !== socket || this.status === "qr" || this.status === "connected") return;
      this.generation++;
      this.socket = null;
      this.pairing = false;
      this.failed = true;
      this.status = "disconnected";
      this.clearQr();
      this.lastError = "WhatsApp did not respond. Check the server connection and try again.";
      socket.end(new Error("Connection timed out"));
    }, 45000);
    let credsSave = Promise.resolve();
    socket.ev.on("creds.update", (update) => {
      Object.assign(auth.creds, update);
      const snapshot = encode(auth.creds);
      credsSave = credsSave.then(async () => {
        const value = encryptWhatsappState(snapshot);
        await db.insert(whatsappAuthStateTable).values({ key: "creds", value })
          .onConflictDoUpdate({ target: whatsappAuthStateTable.key, set: { value, updatedAt: new Date() } });
      });
      void credsSave.catch(() => undefined);
    });
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (generation !== this.generation) return;
      if (qr && connection !== "close" && this.status !== "connected") {
        try {
          const image = await QRCode.toDataURL(qr, { margin: 2, width: 320 });
          if (generation !== this.generation || this.socket !== socket || this.state().connected || this.status === "completing") return;
          this.clearQr();
          this.clearConnectTimer();
          this.qr = image; this.status = "qr"; this.lastError = null;
          this.qrTimer = setTimeout(() => {
            if (generation !== this.generation || this.socket !== socket || this.status !== "qr") return;
            this.clearQr();
            this.status = "connecting";
            socket.end(new Error("QR expired"));
          }, 60000);
        } catch {
          if (generation !== this.generation || this.socket !== socket) return;
          this.clearQr();
          this.clearConnectTimer();
          this.lastError = "Could not generate a pairing code. Try again.";
          this.status = "disconnected";
          this.generation++;
          this.socket = null;
          this.pairing = false;
          this.failed = true;
          socket.end(new Error("QR generation failed"));
        }
      }
      if (connection === "open") {
        this.clearQr();
        this.clearConnectTimer();
        this.status = "completing";
        try {
          await credsSave;
          if (generation !== this.generation || this.socket !== socket) return;
          this.status = "connected"; this.lastError = null; this.pairing = false;
        } catch {
          if (generation !== this.generation) return;
          this.status = "disconnected";
          this.lastError = "Could not save WhatsApp credentials. Try again.";
          this.failed = true;
          this.generation++;
          this.socket = null;
          socket.end(new Error("Credentials could not be saved"));
        }
      }
      if (connection === "close") {
        this.clearQr(); this.clearConnectTimer();
        this.status = "completing";
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
        try { await credsSave; } catch {
          if (generation !== this.generation) return;
          this.socket = null;
          this.status = "disconnected";
          this.lastError = "Could not save WhatsApp credentials. Try again.";
          this.failed = true;
          return;
        }
        if (generation !== this.generation) return;
        this.socket = null;
        const restartRequired = code === DisconnectReason.restartRequired;
        if (code === DisconnectReason.loggedOut || this.explicitLogout) {
          this.status = "disconnected"; this.explicitLogout = false; this.pairing = false;
          await this.clearAuth();
          this.lastError = code === DisconnectReason.loggedOut ? "WhatsApp logged out. Start pairing again." : null;
          return;
        }
        if (restartRequired && auth.creds.registered) this.pairing = false;
        this.status = restartRequired ? "completing" : "connecting";
        if (this.lastError !== "Could not generate a pairing code. Try again.") this.lastError = null;
        if (!this.explicitLogout) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (generation === this.generation) void this.start(false);
          }, restartRequired ? 100 : 1500);
        }
      }
    });
    socket.ev.on("messaging-history.set", async ({ chats, messages }) => {
      for (const chat of chats) await this.upsertChat(chat.id!, chat.name ?? chat.id!, chat.id!, chat.unreadCount ?? 0, undefined, undefined);
      await this.ingest(messages);
    });
    socket.ev.on("messages.upsert", async ({ messages }) => this.ingest(messages));
  }

  private async upsertChat(jid: string, name: string, phone: string, unread = 0, lastMessage?: string, at?: Date) {
    if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return;
    await db.insert(whatsappChatsTable).values({ jid, name, phone: phone.replace(/@.*/, ""), unread, lastMessage, lastMessageAt: at })
      .onConflictDoUpdate({ target: whatsappChatsTable.jid, set: { name, phone: phone.replace(/@.*/, ""), unread, ...(lastMessage !== undefined ? { lastMessage, lastMessageAt: at } : {}), updatedAt: new Date() } });
  }

  private async ingest(messages: proto.IWebMessageInfo[]) {
    for (const item of messages) {
      const key = item.key;
      if (!key) continue;
      const jid = key.remoteJid;
      const id = key.id;
      if (!jid || !id || jid.endsWith("@g.us") || jid === "status@broadcast") continue;
      const text = whatsappText(item.message);
      const date = new Date(Number(item.messageTimestamp ?? Math.floor(Date.now() / 1000)) * 1000);
      await this.upsertChat(jid, item.pushName ?? jid.split("@")[0], jid, key.fromMe ? 0 : 1, text, date);
      await db.insert(whatsappMessagesTable).values({ id, chatJid: jid, text, fromMe: Boolean(key.fromMe), timestamp: date, status: item.status === 4 ? "read" : "sent" }).onConflictDoNothing();
    }
  }

  async logout() {
    this.explicitLogout = true;
    this.generation++;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.clearQr();
    this.clearConnectTimer();
    if (this.socket) await this.socket.logout().catch(() => undefined);
    this.socket = null; this.status = "disconnected"; this.qr = null; this.lastError = null;
    this.pairing = false;
    this.failed = false;
    await this.clearAuth();
  }

  private async clearAuth() {
    await db.delete(whatsappAuthStateTable);
  }

  state() { return { status: this.status, qr: this.qr, connected: this.status === "connected", lastError: this.lastError }; }
  async send(jid: string, text: string) {
    if (!this.socket || this.status !== "connected") throw new Error("WhatsApp is not connected");
    const result = await this.socket.sendMessage(jid, { text });
    if (!result?.key?.id) throw new Error("WhatsApp did not return a message id");
    await this.ingest([result as proto.IWebMessageInfo]);
    return result.key.id;
  }
}

export const whatsappManager = new WhatsAppManager();
export async function listWhatsappChats() { return db.select().from(whatsappChatsTable).orderBy(desc(whatsappChatsTable.lastMessageAt), asc(whatsappChatsTable.name)); }
export async function listWhatsappMessages(jid: string) { return db.select().from(whatsappMessagesTable).where(eq(whatsappMessagesTable.chatJid, jid)).orderBy(asc(whatsappMessagesTable.timestamp)).limit(500); }