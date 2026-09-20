import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  accountingAccountsTable, adminUsersTable, categoriesTable, db, giftingIssuesTable,
  inventoryBalancesTable, inventoryMovementsTable, journalEntriesTable, journalEntryLinesTable,
  productsTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession } from "../lib/admin-auth";

const suffix = Date.now();
const baseId = 1_800_000_000 + (suffix % 100_000_000);
const email = `gifting-${suffix}@example.com`;
let adminId: number;
let categoryId: number;
let productId: number;
let token: string;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = email;
  process.env.ADMIN_PASSWORD = "gifting-test-password";
  await request(app).get("/api/admin/dashboard").expect(401);
  const [admin] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).where(eq(adminUsersTable.email, email));
  adminId = admin.id;
  token = await createAdminSession(adminId);
  const [category] = await db.insert(categoriesTable).values({
    id: baseId, nameAr: "هدايا", nameEn: "Gifting", slug: `gifting-${suffix}`,
  }).returning();
  categoryId = category.id;
  const [product] = await db.insert(productsTable).values({
    id: baseId + 1, nameAr: "منتج هدية", nameEn: "Gift product", slug: `gift-product-${suffix}`,
    price: 40, categoryId, stockQuantity: 5, averageCost: "12.5000", sku: `GIFT-${suffix}`,
  }).returning();
  productId = product.id;
});

afterAll(async () => {
  // Posted accounting records are intentionally immutable. Use unique IDs for
  // each run and leave this complete audit chain intact, as the admin route
  // integration suite does for its posted journals.
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
});

describe.sequential("gifting issue operations", () => {
  it("atomically issues stock and posts a balanced journal with optional fields", async () => {
    const payload = {
      productId, category: "VIP_GIFT", quantity: 2, issueDate: "2026-09-19",
      recipientName: "عميل مهم", occasion: "إطلاق المنتج", idempotencyKey: `gift-${suffix}`,
    };
    const response = await request(app).post("/api/admin/gifting-issues")
      .set("Authorization", `Bearer ${token}`).send(payload).expect(201);
    expect(response.body).toMatchObject({
      productId, category: "VIP_GIFT", quantity: 2, totalCost: "25.00000000",
      recipientName: "عميل مهم", occasion: "إطلاق المنتج",
    });
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    expect(product.stockQuantity).toBe(3);
    const [balance] = await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, productId));
    expect(balance.available).toBe(3);
    const [movement] = await db.select().from(inventoryMovementsTable)
      .where(and(eq(inventoryMovementsTable.sourceType, "gifting_issue"), eq(inventoryMovementsTable.sourceId, String(response.body.id))));
    expect(movement).toMatchObject({ quantityChange: -2, quantityBefore: 5, quantityAfter: 3, totalCost: "25.0000" });
    const [entry] = await db.select().from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.sourceType, "gifting_issue"), eq(journalEntriesTable.sourceId, String(response.body.id))));
    expect(entry).toMatchObject({ status: "posted", entryDate: "2026-09-19" });
    const lines = await db.select({
      code: accountingAccountsTable.code, debit: journalEntryLinesTable.debit, credit: journalEntryLinesTable.credit,
    }).from(journalEntryLinesTable)
      .innerJoin(accountingAccountsTable, eq(accountingAccountsTable.id, journalEntryLinesTable.accountId))
      .where(eq(journalEntryLinesTable.journalEntryId, entry.id));
    expect(lines).toEqual(expect.arrayContaining([
      { code: "6160", debit: "25.0000", credit: "0.0000" },
      { code: "1140", debit: "0.0000", credit: "25.0000" },
    ]));

    const duplicate = await request(app).post("/api/admin/gifting-issues")
      .set("Authorization", `Bearer ${token}`).send(payload).expect(201);
    expect(duplicate.body.id).toBe(response.body.id);
    expect((await db.select().from(inventoryMovementsTable).where(eq(inventoryMovementsTable.productId, productId)))).toHaveLength(1);
  });

  it("defaults optional fields and date without creating partial effects", async () => {
    const before = new Date().toISOString().slice(0, 10);
    const response = await request(app).post("/api/admin/gifting-issues")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, category: "TESTER", quantity: 1, idempotencyKey: `optional-${suffix}` }).expect(201);
    expect(response.body).toMatchObject({ recipientName: null, occasion: null });
    expect(response.body.issueDate.slice(0, 10)).toBe(before);

    await request(app).post("/api/admin/gifting-issues")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, category: "INFLUENCERS", quantity: 99, idempotencyKey: `short-${suffix}` }).expect(409);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    expect(product.stockQuantity).toBe(2);
    expect(await db.select().from(giftingIssuesTable).where(eq(giftingIssuesTable.idempotencyKey, `short-${suffix}`))).toHaveLength(0);
    expect(await db.select().from(inventoryMovementsTable).where(eq(inventoryMovementsTable.eventKey, `gifting:short-${suffix}`))).toHaveLength(0);
  });
});