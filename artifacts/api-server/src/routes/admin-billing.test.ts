import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  adminPermissionsTable, adminSessionsTable, adminUserPermissionsTable,
  adminUsersTable, billingSettingsTable, db,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";

const base = 1_720_000_000 + (Date.now() % 20_000_000);
const ids = [base, base + 1, base + 2];
let tokens: string[] = [];
let previous: typeof billingSettingsTable.$inferSelect | undefined;
const path = "/api/admin/finance/billing-settings";
const auth = (index: number) => ({ Authorization: `Bearer ${tokens[index]}` });

beforeAll(async () => {
  [previous] = await db.select().from(billingSettingsTable).where(eq(billingSettingsTable.id, 1)).limit(1);
  await db.insert(adminPermissionsTable).values([
    { module: "finance", action: "view" }, { module: "finance", action: "edit" },
  ]).onConflictDoNothing();
  const permissions = await db.select().from(adminPermissionsTable).where(eq(adminPermissionsTable.module, "finance"));
  await db.insert(adminUsersTable).values(await Promise.all(ids.map(async (id, index) => ({
    id, email: `billing-${id}-${index}@example.com`, name: "Billing test",
    passwordHash: await hashAdminPassword("billing-test-password"),
  }))));
  await db.insert(adminUserPermissionsTable).values([
    ...permissions.filter((p) => p.action === "view").flatMap((p) => ids.slice(0, 2).map((id) => ({ adminUserId: id, permissionId: p.id }))),
    ...permissions.filter((p) => p.action === "edit").map((p) => ({ adminUserId: ids[1], permissionId: p.id })),
  ]);
  tokens = await Promise.all(ids.map(createAdminSession));
});

afterAll(async () => {
  if (previous) {
    await db.insert(billingSettingsTable).values(previous).onConflictDoUpdate({
      target: billingSettingsTable.id, set: previous,
    });
  } else {
    await db.delete(billingSettingsTable).where(eq(billingSettingsTable.id, 1));
  }
  await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminUserId, ids));
  await db.delete(adminUserPermissionsTable).where(inArray(adminUserPermissionsTable.adminUserId, ids));
  await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, ids));
});

describe.sequential("billing settings permissions and persistence", () => {
  it("denies unauthorized requests and finance viewers' edits", async () => {
    await request(app).get(path).expect(401);
    await request(app).get(path).set(auth(2)).expect(403);
    await request(app).patch(path).set(auth(0)).send({ invoiceEmail: "viewer@example.com" }).expect(403);
  });

  it("rejects unexpected fields, card details and malformed bank data", async () => {
    await request(app).patch(path).set(auth(1)).send({ cardNumber: "1234" }).expect(400);
    await request(app).patch(path).set(auth(1)).send({}).expect(400);
    await request(app).patch(path).set(auth(1)).send({ invoiceEmail: "invalid" }).expect(400);
    await request(app).patch(path).set(auth(1)).send({ iban: "SA123" }).expect(400);
  });

  it("persists settings and masks bank identifiers for view-only staff", async () => {
    const payload = {
      invoiceEmail: "billing-test@example.com", companyName: "Billing test",
      bankName: "Test bank", accountHolder: "Billing test",
      accountNumber: "123456789012", iban: "SA1234567890123456789012",
      preferredPaymentMethod: "bank_transfer",
    };
    const saved = await request(app).patch(path).set(auth(1)).send(payload).expect(200);
    expect(saved.body.accountNumber).toBe(payload.accountNumber);
    const editor = await request(app).get(path).set(auth(1)).expect(200);
    expect(editor.body).toMatchObject(payload);
    const viewer = await request(app).get(path).set(auth(0)).expect(200);
    expect(viewer.body.invoiceEmail).toBe(payload.invoiceEmail);
    expect(viewer.body.accountNumber).toMatch(/9012$/);
    expect(viewer.body.accountNumber).not.toBe(payload.accountNumber);
    expect(viewer.body.iban).not.toBe(payload.iban);
  });
});