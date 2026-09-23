import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { adminPermissionsTable, adminSessionsTable, adminUserPermissionsTable, adminUsersTable, db, distributorContractsTable } from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";

let userId: number;
let token: string;
let contractsEditorId: number;
let contractsEditorToken: string;
const contractIds: number[] = [];

beforeAll(async () => {
  const [user] = await db.insert(adminUsersTable).values({
    email: `contract-pdf-${Date.now()}@example.test`,
    name: "Contract PDF test",
    passwordHash: await hashAdminPassword("test-password-not-used"),
    isSuperAdmin: true,
    isActive: true,
  }).returning();
  userId = user.id;
  token = await createAdminSession(userId);
  await db.insert(adminPermissionsTable).values({ module: "contracts", action: "edit" }).onConflictDoNothing();
  const [permission] = await db.select().from(adminPermissionsTable)
    .where(and(eq(adminPermissionsTable.module, "contracts"), eq(adminPermissionsTable.action, "edit")));
  const [editor] = await db.insert(adminUsersTable).values({
    email: `contract-editor-${Date.now()}@example.test`,
    name: "Contract editor",
    passwordHash: await hashAdminPassword("test-password-not-used"),
    isSuperAdmin: false,
    isActive: true,
  }).returning();
  contractsEditorId = editor.id;
  await db.insert(adminUserPermissionsTable).values({ adminUserId: contractsEditorId, permissionId: permission.id });
  contractsEditorToken = await createAdminSession(contractsEditorId);
});

afterAll(async () => {
  for (const id of contractIds) await db.delete(distributorContractsTable).where(eq(distributorContractsTable.id, id));
  if (userId) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, userId));
    await db.delete(adminUsersTable).where(eq(adminUsersTable.id, userId));
  }
  if (contractsEditorId) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, contractsEditorId));
    await db.delete(adminUserPermissionsTable).where(eq(adminUserPermissionsTable.adminUserId, contractsEditorId));
    await db.delete(adminUsersTable).where(eq(adminUsersTable.id, contractsEditorId));
  }
});

const pdfParser = (response: { on(event: string, handler: (...args: any[]) => void): unknown }, callback: (error: Error | null, body: Buffer) => void) => {
  const parts: Buffer[] = [];
  response.on("data", (part: Buffer) => parts.push(part));
  response.on("end", () => callback(null, Buffer.concat(parts)));
  response.on("error", (error: Error) => callback(error, Buffer.alloc(0)));
};

describe("administrator contract PDF download", () => {
  it("lets a contracts editor without site-content access read only legal defaults and create a contract", async () => {
    const headers = { Authorization: `Bearer ${contractsEditorToken}` };
    const content = await request(app).get("/api/admin/site-content").set(headers).expect(200);
    expect(content.body.every((entry: { key: string }) => entry.key === "seller_legal_profile")).toBe(true);
    await request(app).put("/api/admin/site-content").set(headers).send({ items: [] }).expect(403);
    const created = await request(app).post("/api/admin/contracts").set(headers).send({
      contractType: "عقد توريد أجل المملكة العربية السعودية",
      sellerName: "مؤسسة مسك اللولو للتجارة",
      sellerCrNumber: "7003185274",
      sellerCrDate: "02/07/2011",
      sellerCrIssuer: "وزارة التجارة",
      sellerAddress: "الرياض، حي السليمانية",
      sellerRepName: "ممثل اختباري",
      sellerRepTitle: "مدير اختباري",
      buyerCompanyName: "موزع اختباري",
    }).expect(201);
    contractIds.push(created.body.id);
    expect(created.body.sellerCrNumber).toBe("7003185274");
  });
  it("returns binary Arabic PDF for a new draft and an existing contract without changing saved seller data", async () => {
    const input = {
      contractType: "عقد توريد أجل المملكة العربية السعودية",
      sellerName: "مؤسسة مسك اللولو للتجارة",
      sellerCrNumber: "7003185274",
      sellerCrDate: "02/07/2011",
      sellerCrIssuer: "وزارة التجارة",
      sellerAddress: "الرياض، حي السليمانية، شارع امرؤ القيس، مبنى 3394",
      sellerRepName: "ممثل اختباري",
      sellerRepTitle: "مدير اختباري",
      buyerCompanyName: "موزع اختباري",
    };
    const created = await request(app).post("/api/admin/contracts")
      .set("Authorization", `Bearer ${token}`).send(input).expect(201);
    contractIds.push(created.body.id);
    const existing = await db.insert(distributorContractsTable).values({
      ...input, sellerName: "اسم محفوظ سابقاً", contractNumber: `PDF-EXISTING-${Date.now()}`,
      createdBy: userId, products: [],
    }).returning();
    contractIds.push(existing[0].id);

    for (const id of [created.body.id, existing[0].id]) {
      const response = await request(app).get(`/api/admin/contracts/${id}/pdf`)
        .set("Authorization", `Bearer ${token}`).buffer(true).parse(pdfParser).expect(200);
      expect(response.headers["content-type"]).toMatch(/^application\/pdf/);
      expect(response.body.subarray(0, 5).toString()).toBe("%PDF-");
      expect(response.body.length).toBeGreaterThan(1000);
      const saved = await request(app).get(`/api/admin/contracts/${id}`)
        .set("Authorization", `Bearer ${token}`).expect(200);
      expect(saved.body.sellerName).toBe(id === created.body.id ? input.sellerName : "اسم محفوظ سابقاً");
    }
    await request(app).get(`/api/admin/contracts/${created.body.id}/pdf`).expect(401);
  });
});