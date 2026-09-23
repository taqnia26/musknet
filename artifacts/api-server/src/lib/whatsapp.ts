import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import makeWASocket, {
  Browsers, BufferJSON, DisconnectReason, initAuthCreds, proto,
  type AuthenticationState, type SignalDataSet, type SignalKeyStore,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import { asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  customersTable, db, whatsappAuthStateTable, whatsappChatsTable, whatsappMessagesTable,
} from "@workspace/db";
import { logger } from "./logger";
import { sendWhatsappDisconnectAlert } from "./whatsapp-alert";

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

const monitorKey = "connection-monitor";
const ALERT_DELAY_MS = 120_000;

type ConnectionMonitor = { alerted: boolean; disconnectedAt: number | null };

async function useDatabaseAuthState(): Promise<{ auth: AuthenticationState; monitor: ConnectionMonitor | null }> {
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
    auth: { creds, keys } as AuthenticationState,
    monitor: (values.get(monitorKey) as ConnectionMonitor | undefined) ?? null,
  };
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

// LID is a private WhatsApp identity, not a telephone number.
export const phoneFromWhatsappJid = (jid: string): string =>
  /^(?:[1-9]\d{6,14})@(s\.whatsapp\.net|c\.us)$/.test(jid) ? jid.split("@")[0] : "";

export const trustedWhatsappName = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120 || /@(?:lid|s\.whatsapp\.net|c\.us|g\.us)\b/i.test(name)) return "";
  if (!/[\p{L}]/u.test(name) || /[\x00-\x1f\x7f]/.test(name)) return "";
  return name;
};

export async function renameWhatsappChat(jid: string, name: string) {
  const [chat] = await db.update(whatsappChatsTable).set({ manualName: name || null, updatedAt: new Date() })
    .where(eq(whatsappChatsTable.jid, jid)).returning();
  return chat ?? null;
}

export async function resolvedWhatsappChats() {
  const chats = await db.select().from(whatsappChatsTable)
    .orderBy(desc(whatsappChatsTable.lastMessageAt), asc(whatsappChatsTable.name));
  const phones = [...new Set(chats.map(({ jid }) => phoneFromWhatsappJid(jid)).filter(Boolean))];
  const customers = phones.length ? await db.select({ phone: customersTable.phone, name: customersTable.name })
    .from(customersTable)
    .where(inArray(sql<string>`regexp_replace(translate(${customersTable.phone}, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g')`, phones)) : [];
  const matches = new Map<string, string[]>();
  for (const customer of customers) {
    const digits = customer.phone.replace(/[٠-٩۰-۹]/g, (digit) =>
      String("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹".indexOf(digit) % 10)).replace(/\D/g, "");
    matches.set(digits, [...(matches.get(digits) ?? []), trustedWhatsappName(customer.name)]);
  }
  return chats.map((chat) => {
    const phone = phoneFromWhatsappJid(chat.jid);
    const customerNames = matches.get(phone);
    const customerName = customerNames?.length === 1 ? customerNames[0] : "";
    return {
      ...chat,
      phone,
      name: trustedWhatsappName(chat.manualName) || customerName || trustedWhatsappName(chat.name),
      manualName: chat.manualName,
    };
  });
}

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
  private monitor: ConnectionMonitor | null = null;
  private alertTimer: ReturnType<typeof setTimeout> | null = null;
  private alertInFlight = false;

  private async saveMonitor(monitor: ConnectionMonitor) {
    const value = encryptWhatsappState(encode(monitor));
    await db.insert(whatsappAuthStateTable).values({ key: monitorKey, value })
      .onConflictDoUpdate({ target: whatsappAuthStateTable.key, set: { value, updatedAt: new Date() } });
    this.monitor = monitor;
  }

  private clearAlertTimer() {
    if (this.alertTimer) clearTimeout(this.alertTimer);
    this.alertTimer = null;
  }

  private scheduleAlert() {
    this.clearAlertTimer();
    if (!this.monitor?.disconnectedAt || this.monitor.alerted) return;
    const disconnectedAt = this.monitor.disconnectedAt;
    this.alertTimer = setTimeout(() => {
      this.alertTimer = null;
      if (this.monitor?.disconnectedAt !== disconnectedAt || this.monitor.alerted || this.alertInFlight) return;
      this.alertInFlight = true;
      void (async () => {
        try {
          await sendWhatsappDisconnectAlert();
          if (this.monitor?.disconnectedAt === disconnectedAt) {
            await this.saveMonitor({ alerted: true, disconnectedAt });
          }
        } catch {
          logger.warn("Could not deliver WhatsApp connection alert");
          if (this.monitor?.disconnectedAt === disconnectedAt && !this.monitor.alerted) {
            this.alertTimer = setTimeout(() => { this.alertTimer = null; this.scheduleAlert(); }, ALERT_DELAY_MS);
          }
        } finally {
          this.alertInFlight = false;
        }
      })();
    }, Math.max(0, disconnectedAt + ALERT_DELAY_MS - Date.now()));
  }

  private async markOutage() {
    if (!this.monitor || this.monitor.disconnectedAt) return;
    await this.saveMonitor({ ...this.monitor, disconnectedAt: Date.now() });
    this.scheduleAlert();
  }

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
      if (this.monitor?.disconnectedAt) this.scheduleAlert();
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
    const stored = await useDatabaseAuthState();
    const { auth } = stored;
    if (stored.monitor && !this.monitor) this.monitor = stored.monitor;
    if (this.monitor?.disconnectedAt) this.scheduleAlert();
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
      void this.markOutage().catch(() => logger.warn("Could not record WhatsApp outage"));
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
          void this.markOutage().catch(() => logger.warn("Could not record WhatsApp outage"));
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
          await this.saveMonitor({ alerted: false, disconnectedAt: null });
          this.clearAlertTimer();
          this.status = "connected"; this.lastError = null; this.pairing = false;
        } catch {
          if (generation !== this.generation) return;
          this.status = "disconnected";
          this.lastError = "Could not save WhatsApp credentials. Try again.";
          this.failed = true;
          void this.markOutage().catch(() => logger.warn("Could not record WhatsApp outage"));
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
          await this.markOutage().catch(() => logger.warn("Could not record WhatsApp outage"));
          return;
        }
        if (generation !== this.generation) return;
        this.socket = null;
        const restartRequired = code === DisconnectReason.restartRequired;
        if (code === DisconnectReason.loggedOut || this.explicitLogout) {
          this.status = "disconnected"; this.explicitLogout = false; this.pairing = false;
          if (code === DisconnectReason.loggedOut) {
            await this.markOutage().catch(() => logger.warn("Could not record WhatsApp outage"));
            await this.clearAuth(true);
          } else {
            this.clearAlertTimer();
            this.monitor = null;
            await this.clearAuth();
          }
          this.lastError = code === DisconnectReason.loggedOut ? "WhatsApp logged out. Start pairing again." : null;
          return;
        }
        await this.markOutage().catch(() => logger.warn("Could not record WhatsApp outage"));
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
    socket.ev.on("contacts.upsert", (contacts) => {
      void Promise.all(contacts.map((contact) => this.upsertChat(contact.id, contact.name || contact.verifiedName || contact.notify, "contact")))
        .catch(() => logger.warn("Could not import WhatsApp contacts"));
    });
    socket.ev.on("contacts.update", (contacts) => {
      void Promise.all(contacts.map((contact) => this.upsertChat(contact.id, contact.name || contact.verifiedName || contact.notify, "contact")))
        .catch(() => logger.warn("Could not update WhatsApp contacts"));
    });
    socket.ev.on("messaging-history.set", async ({ chats, contacts, messages }) => {
      for (const contact of contacts ?? []) await this.upsertChat(contact.id, contact.name || contact.verifiedName || contact.notify, "contact");
      for (const chat of chats) if (chat.id) await this.upsertChat(chat.id, chat.name, "chat", chat.unreadCount);
      await this.ingest(messages, true);
    });
    socket.ev.on("messages.upsert", async ({ messages }) => this.ingest(messages));
  }

  private async upsertChat(jid: string | undefined | null, candidate?: string | null, source: "message" | "chat" | "contact" = "message", unread?: number | null) {
    if (!jid || (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@c.us") && !jid.endsWith("@lid"))) return;
    const name = trustedWhatsappName(candidate);
    const replaceName = source === "contact" ? sql`true` : sql`(
      ${whatsappChatsTable.name} = '' OR ${whatsappChatsTable.name} = ${whatsappChatsTable.phone}
      OR ${whatsappChatsTable.name} = ${whatsappChatsTable.jid}
      OR ${whatsappChatsTable.nameSource} = 'message' ${source === "message" ? sql`` : sql`OR ${whatsappChatsTable.nameSource} = 'chat'`}
    )`;
    await db.insert(whatsappChatsTable).values({ jid, name, nameSource: name ? source : "message", phone: phoneFromWhatsappJid(jid), unread: unread ?? 0 })
      .onConflictDoUpdate({ target: whatsappChatsTable.jid, set: {
        name: name ? sql`CASE WHEN ${replaceName} THEN ${name} ELSE ${whatsappChatsTable.name} END` : whatsappChatsTable.name,
        // A missing sender name never clears a previously known contact name.
        nameSource: name ? sql`CASE WHEN ${replaceName} THEN ${source} ELSE ${whatsappChatsTable.nameSource} END` : whatsappChatsTable.nameSource,
        phone: phoneFromWhatsappJid(jid),
        ...(unread != null ? { unread } : {}),
        updatedAt: new Date(),
      } });
  }

  private async ingest(messages: proto.IWebMessageInfo[], historical = false) {
    for (const item of messages) {
      const key = item.key;
      if (!key) continue;
      const jid = key.remoteJid;
      const id = key.id;
      if (!jid || !id || jid.endsWith("@g.us") || jid === "status@broadcast") continue;
      const text = whatsappText(item.message);
      const date = new Date(Number(item.messageTimestamp ?? Math.floor(Date.now() / 1000)) * 1000);
      await this.upsertChat(jid, key.fromMe ? null : item.pushName);
      const inserted = await db.insert(whatsappMessagesTable).values({ id, chatJid: jid, text, fromMe: Boolean(key.fromMe), timestamp: date, status: item.status === 4 ? "read" : "sent" }).onConflictDoNothing().returning({ id: whatsappMessagesTable.id });
      if (inserted.length) await db.update(whatsappChatsTable).set({
        lastMessage: sql`CASE WHEN ${whatsappChatsTable.lastMessageAt} IS NULL OR ${whatsappChatsTable.lastMessageAt} <= ${date} THEN ${text} ELSE ${whatsappChatsTable.lastMessage} END`,
        lastMessageAt: sql`GREATEST(COALESCE(${whatsappChatsTable.lastMessageAt}, ${date}), ${date})`,
        ...(!historical && !key.fromMe ? { unread: sql`${whatsappChatsTable.unread} + 1` } : {}),
      }).where(eq(whatsappChatsTable.jid, jid));
    }
  }

  async logout() {
    this.explicitLogout = true;
    this.generation++;
    this.clearAlertTimer();
    this.monitor = null;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.clearQr();
    this.clearConnectTimer();
    if (this.socket) await this.socket.logout().catch(() => undefined);
    this.socket = null; this.status = "disconnected"; this.qr = null; this.lastError = null;
    this.pairing = false;
    this.failed = false;
    await this.clearAuth();
  }

  private async clearAuth(keepMonitor = false) {
    if (keepMonitor) await db.delete(whatsappAuthStateTable).where(ne(whatsappAuthStateTable.key, monitorKey));
    else await db.delete(whatsappAuthStateTable);
  }

  state() { return { status: this.status, qr: this.qr, connected: this.status === "connected", lastError: this.lastError, connectionAlerted: this.monitor?.alerted ?? false, previouslyConnected: this.monitor !== null }; }
  async send(jid: string, text: string) {
    if (!this.socket || this.status !== "connected") throw new Error("WhatsApp is not connected");
    const result = await this.socket.sendMessage(jid, { text });
    if (!result?.key?.id) throw new Error("WhatsApp did not return a message id");
    await this.ingest([result as proto.IWebMessageInfo]);
    return result.key.id;
  }
}

export const whatsappManager = new WhatsAppManager();
export const listWhatsappChats = resolvedWhatsappChats;
export async function listWhatsappMessages(jid: string) { return db.select().from(whatsappMessagesTable).where(eq(whatsappMessagesTable.chatJid, jid)).orderBy(asc(whatsappMessagesTable.timestamp)).limit(500); }