import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  adminPermissionsTable, adminSessionsTable, adminUserPermissionsTable, adminUsersTable,
  customersTable, db, whatsappChatsTable, whatsappMessagesTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";
import { listWhatsappChats, phoneFromWhatsappJid, trustedWhatsappName, WhatsAppManager } from "../lib/whatsapp";

const suffix = Date.now();
const adminId = 1_850_000_000 + suffix % 20_000_000;
const phone = `96650${String(suffix % 100_000_000).padStart(8, "0")}`;
const namedJid = `${phone}@s.whatsapp.net`;
const lidJid = `${suffix}@lid`;
const ids = [namedJid, lidJid];
let token: string;

beforeAll(async () => {
  await db.insert(adminPermissionsTable).values(["view", "edit"].map((action) => ({ module: "customer-service", action }))).onConflictDoNothing();
  await db.insert(adminUsersTable).values({
    id: adminId, email: `whatsapp-inbox-${suffix}@example.com`, name: "WhatsApp test agent",
    passwordHash: await hashAdminPassword("test-password"),
  });
  const permissions = await db.select().from(adminPermissionsTable).where(eq(adminPermissionsTable.module, "customer-service"));
  await db.insert(adminUserPermissionsTable).values(permissions.filter((row) => row.action === "view" || row.action === "edit")
    .map((row) => ({ adminUserId: adminId, permissionId: row.id })));
  token = await createAdminSession(adminId);
});
afterAll(async () => {
  await db.delete(whatsappMessagesTable).where(inArray(whatsappMessagesTable.chatJid, ids));
  await db.delete(whatsappChatsTable).where(inArray(whatsappChatsTable.jid, ids));
  await db.delete(customersTable).where(eq(customersTable.phone, `+${phone}`));
  await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, adminId));
  await db.delete(adminUserPermissionsTable).where(eq(adminUserPermissionsTable.adminUserId, adminId));
  await db.delete(adminUsersTable).where(eq(adminUsersTable.id, adminId));
});

describe.sequential("WhatsApp inbox identity", () => {
  it("does not present a LID or a numeric/JID sender as a customer name or phone", async () => {
    expect(phoneFromWhatsappJid(lidJid)).toBe("");
    expect(phoneFromWhatsappJid(namedJid)).toBe(phone);
    expect(trustedWhatsappName(`${phone}@lid`)).toBe("");
    expect(trustedWhatsappName(phone)).toBe("");
    const manager = new WhatsAppManager();
    await (manager as any).ingest([{ key: { remoteJid: lidJid, id: `lid-${suffix}` }, pushName: lidJid, message: { conversation: "Hello" }, messageTimestamp: 1234567890 }]);
    const chat = (await listWhatsappChats()).find((row) => row.jid === lidJid);
    expect(chat).toMatchObject({ name: "", phone: "" });
    const res = await request(app).patch(`/api/admin/whatsapp/chats/${encodeURIComponent(lidJid)}`)
      .set("Authorization", `Bearer ${token}`).send({ name: "LID conversation" }).expect(200);
    expect(res.body).toMatchObject({ name: "LID conversation", phone: "" });
  });

  it("resolves customer names before WhatsApp names, then preserves a manual label across imports and reloads", async () => {
    const manager = new WhatsAppManager();
    await (manager as any).upsertChat(namedJid, phone, "chat");
    await (manager as any).ingest([{ key: { remoteJid: namedJid, id: `first-${suffix}` }, pushName: "WhatsApp sender", message: { conversation: "First message" }, messageTimestamp: 1234567890 }]);
    expect((await listWhatsappChats()).find((row) => row.jid === namedJid)?.name).toBe("WhatsApp sender");
    await (manager as any).upsertChat(namedJid, "Saved WhatsApp contact", "contact");
    await (manager as any).ingest([{ key: { remoteJid: namedJid, id: `second-${suffix}` }, message: { conversation: "Second message" }, messageTimestamp: 1234567891 }]);
    expect((await listWhatsappChats()).find((row) => row.jid === namedJid)?.name).toBe("Saved WhatsApp contact");
    await db.insert(customersTable).values({ phone: `+${phone}`, name: "Registered customer" });
    expect((await listWhatsappChats()).find((row) => row.jid === namedJid)?.name).toBe("Registered customer");
    const url = `/api/admin/whatsapp/chats/${encodeURIComponent(namedJid)}`;
    const auth = { Authorization: `Bearer ${token}` };
    await request(app).patch(url).set(auth).send({ name: "Service label" }).expect(200);
    await (manager as any).upsertChat(namedJid, null, "contact");
    await (manager as any).ingest([{ key: { remoteJid: namedJid, id: `third-${suffix}` }, pushName: phone, message: { conversation: "Third message" }, messageTimestamp: 1234567892 }]);
    expect((await request(app).get("/api/admin/whatsapp/chats").set(auth).expect(200)).body.find((row: any) => row.jid === namedJid))
      .toMatchObject({ name: "Service label", manualName: "Service label", phone });
    await request(app).patch(url).set(auth).send({ name: "123456" }).expect(400);
    await request(app).patch(url).set(auth).send({ name: "" }).expect(200);
    expect((await listWhatsappChats()).find((row) => row.jid === namedJid)?.name).toBe("Registered customer");
    await request(app).patch("/api/admin/whatsapp/chats/missing@lid").set(auth).send({ name: "Missing" }).expect(404);
  });
});