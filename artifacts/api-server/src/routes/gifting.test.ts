import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import {
  accountingAccountsTable, adminUsersTable, categoriesTable, db, giftingIssuesTable,
  inventoryBalancesTable, inventoryLocationsTable, inventoryMovementsTable, journalEntriesTable, journalEntryLinesTable,
  journalEntryAuditTable, productsTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession } from "../lib/admin-auth";

const suffix = Date.now();
const baseId = 1_800_000_000 + (suffix % 100_000_000);
const email = `gifting-${suffix}@example.com`;
let adminId: number;
let categoryId: number;
let productId: number;
let secondProductId: number;
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
  const [secondProduct] = await db.insert(productsTable).values({
    id: baseId + 2, nameAr: "منتج هدية ثان", nameEn: "Second gift product", slug: `second-gift-product-${suffix}`,
    price: 60, categoryId, stockQuantity: 4, averageCost: "8.0000", sku: `GIFT-SECOND-${suffix}`,
  }).returning();
  secondProductId = secondProduct.id;
});

afterAll(async () => {
  const issues = await db.select({ id: giftingIssuesTable.id }).from(giftingIssuesTable)
    .where(inArray(giftingIssuesTable.productId, [productId, secondProductId]));
  const entries = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable)
    .where(or(
      and(eq(journalEntriesTable.sourceType, "gifting_issue"), inArray(journalEntriesTable.sourceId, issues.map((issue) => String(issue.id)))),
      and(eq(journalEntriesTable.sourceType, "gifting_issue_batch"), eq(journalEntriesTable.sourceId, `multi-%_${suffix}`)),
      and(eq(journalEntriesTable.sourceType, "gifting_issue_void"), inArray(journalEntriesTable.sourceId, issues.map((issue) => String(issue.id)))),
      and(eq(journalEntriesTable.sourceType, "gifting_issue_adjustment"), inArray(sql<string>`split_part(${journalEntriesTable.sourceId}, ':', 1)`, issues.map((issue) => String(issue.id)))),
    ));
  if (entries.length) {
    await db.execute(sql`alter table journal_entry_lines disable trigger journal_entry_lines_immutable`);
    await db.execute(sql`alter table journal_entries disable trigger journal_entries_immutable`);
    await db.transaction(async (tx) => {
      await tx.delete(journalEntryAuditTable).where(inArray(journalEntryAuditTable.journalEntryId, entries.map((row) => row.id)));
      await tx.delete(journalEntryLinesTable).where(inArray(journalEntryLinesTable.journalEntryId, entries.map((row) => row.id)));
      await tx.delete(journalEntriesTable).where(inArray(journalEntriesTable.id, entries.map((row) => row.id)));
    });
    await db.execute(sql`alter table journal_entry_lines enable trigger journal_entry_lines_immutable`);
    await db.execute(sql`alter table journal_entries enable trigger journal_entries_immutable`);
  }
  await db.delete(inventoryMovementsTable).where(inArray(inventoryMovementsTable.productId, [productId, secondProductId]));
  await db.delete(giftingIssuesTable).where(inArray(giftingIssuesTable.productId, [productId, secondProductId]));
  await db.delete(inventoryBalancesTable).where(inArray(inventoryBalancesTable.productId, [productId, secondProductId]));
  await db.delete(productsTable).where(inArray(productsTable.id, [productId, secondProductId]));
  await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
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

  it("updates quantity and metadata with inventory and accounting corrections, then safely voids the movement", async () => {
    const created = await request(app).post("/api/admin/gifting-issues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productId: secondProductId, category: "VIP_GIFT", quantity: 1,
        recipientName: "مستلم قديم", city: "الرياض", country: "السعودية",
        idempotencyKey: `editable-${suffix}`,
      }).expect(201);
    expect(created.body).toMatchObject({ city: "الرياض", country: "السعودية" });

    const updated = await request(app).patch(`/api/admin/gifting-issues/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 2, recipientName: "مستلم جديد", city: "جدة", country: "السعودية" }).expect(200);
    expect(updated.body).toMatchObject({
      quantity: 2,
      totalCost: "16.00000000",
      recipientName: "مستلم جديد",
      city: "جدة",
      country: "السعودية",
    });
    const [afterUpdate] = await db.select().from(productsTable).where(eq(productsTable.id, secondProductId));
    expect(afterUpdate.stockQuantity).toBe(2);
    const [adjustment] = await db.select().from(inventoryMovementsTable).where(and(
      eq(inventoryMovementsTable.sourceType, "gifting_issue_adjustment"),
      eq(inventoryMovementsTable.sourceId, String(created.body.id)),
    ));
    expect(adjustment).toMatchObject({ quantityChange: -1, quantityBefore: 3, quantityAfter: 2, totalCost: "8.0000" });
    const [adjustmentEntry] = await db.select().from(journalEntriesTable).where(and(
      eq(journalEntriesTable.sourceType, "gifting_issue_adjustment"),
      sql`${journalEntriesTable.sourceId} like ${`${created.body.id}:%`}`,
    ));
    expect(adjustmentEntry).toMatchObject({ status: "posted" });

    const [beforeDelete] = await db.select().from(productsTable).where(eq(productsTable.id, secondProductId));
    await request(app).delete(`/api/admin/gifting-issues/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`).expect(204);
    const [afterDelete] = await db.select().from(productsTable).where(eq(productsTable.id, secondProductId));
    expect(afterDelete.stockQuantity).toBe(beforeDelete.stockQuantity + 2);
    expect((await db.select().from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.eventKey, `gifting:void:${created.body.id}`)))).toHaveLength(1);
    expect((await db.select().from(journalEntriesTable).where(and(
      eq(journalEntriesTable.sourceType, "gifting_issue_void"),
      eq(journalEntriesTable.sourceId, String(created.body.id)),
    )))).toHaveLength(1);
    await request(app).get(`/api/admin/gifting-issues/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`).expect(404);
  });

  it("issues multiple products atomically and requires reasons for damaged/other", async () => {
    await request(app).post("/api/admin/gifting-issues")
      .set("Authorization", `Bearer ${token}`)
      .send({ lines: [{ productId: secondProductId, quantity: 1 }], category: "DAMAGED", idempotencyKey: `missing-reason-${suffix}` })
      .expect(400);

    const payload = {
      lines: [{ productId: productId, quantity: 1 }, { productId: secondProductId, quantity: 2 }],
      category: "OTHER", reason: "تحديث مخزون", recipientName: "نفس الشخص",
      idempotencyKey: `multi-%_${suffix}`,
    };
    const response = await request(app).post("/api/admin/gifting-issues")
      .set("Authorization", `Bearer ${token}`).send(payload).expect(201);
    expect(response.body).toMatchObject({ category: "OTHER", reason: "تحديث مخزون", recipientName: "نفس الشخص" });
    const [firstAfter] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    const [secondAfter] = await db.select().from(productsTable).where(eq(productsTable.id, secondProductId));
    expect(firstAfter.stockQuantity).toBe(1);
    expect(secondAfter.stockQuantity).toBe(2);
    const [firstBalance] = await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, productId));
    const [secondBalance] = await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, secondProductId));
    expect(firstBalance.available).toBe(1);
    expect(secondBalance.available).toBe(2);

    const rows = await db.select().from(giftingIssuesTable)
      .where(eq(giftingIssuesTable.dedupeKey, `manual:multi-%_${suffix}:line:${secondProductId}:normal`));
    expect(rows).toHaveLength(1);
    const movements = await db.select().from(inventoryMovementsTable)
      .where(sql`event_key like ${`gifting:multi-%_${suffix}:%`}`);
    expect(movements).toHaveLength(2);
    const [entry] = await db.select().from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.sourceType, "gifting_issue_batch"), eq(journalEntriesTable.sourceId, `multi-%_${suffix}`)));
    expect(entry).toBeDefined();
    expect(await db.select().from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.sourceType, "gifting_issue_batch"), eq(journalEntriesTable.sourceId, `multi-%_${suffix}`))))
      .toHaveLength(1);
    expect(movements.every((movement) => movement.sourceType === "gifting_issue_batch" && movement.sourceId === `multi-%_${suffix}`)).toBe(true);
    const [journalTotals] = await db.select({
      debit: sql<string>`coalesce(sum(${journalEntryLinesTable.debit}), 0)::numeric`,
      credit: sql<string>`coalesce(sum(${journalEntryLinesTable.credit}), 0)::numeric`,
    }).from(journalEntryLinesTable).where(eq(journalEntryLinesTable.journalEntryId, entry.id));
    expect(journalTotals.debit).toBe(journalTotals.credit);

    // Compatibility regression: batches written before source-qualified line
    // keys used only the product id for non-first rows.
    await db.update(giftingIssuesTable).set({
      dedupeKey: `manual:multi-%_${suffix}:line:${secondProductId}`,
    }).where(eq(giftingIssuesTable.dedupeKey, `manual:multi-%_${suffix}:line:${secondProductId}:normal`));
    const duplicate = await request(app).post("/api/admin/gifting-issues")
      .set("Authorization", `Bearer ${token}`).send({
        ...payload,
        lines: [...payload.lines].reverse(),
      }).expect(201);
    expect(duplicate.body.id).toBe(response.body.id);

    const beforeRollback = await db.select().from(productsTable)
      .where(sql`${productsTable.id} in (${productId}, ${secondProductId})`);
    await request(app).post("/api/admin/gifting-issues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        lines: [{ productId, quantity: 1, stockSource: "normal" }, { productId: secondProductId, quantity: 99, stockSource: "normal" }],
        category: "TESTER", idempotencyKey: `rollback-${suffix}`,
      }).expect(409);
    const afterRollback = await db.select().from(productsTable)
      .where(sql`${productsTable.id} in (${productId}, ${secondProductId})`);
    expect(afterRollback.map((row) => row.stockQuantity)).toEqual(beforeRollback.map((row) => row.stockQuantity));
    expect(await db.select().from(giftingIssuesTable)
      .where(sql`${giftingIssuesTable.dedupeKey} = ${`manual:rollback-${suffix}:batch`}`)).toHaveLength(0);
  });

  it("reuses opened B2B testers separately and records mixed returns safely", async () => {
    let [location] = await db.select().from(inventoryLocationsTable).where(eq(inventoryLocationsTable.code, "B2B_USED_RETURN")).limit(1);
    if (!location) {
      [location] = await db.insert(inventoryLocationsTable).values({
        name: "Test opened testers", code: "B2B_USED_RETURN", type: "virtual", isDefault: false,
      }).returning();
    }
    await db.insert(inventoryBalancesTable).values({ productId: secondProductId, locationId: location.id, available: 1, averageCost: "8.0000" });

    const opened = await request(app).post("/api/admin/gifting-issues").set("Authorization", `Bearer ${token}`).send({
      lines: [{ productId: secondProductId, quantity: 1, stockSource: "used_return" }], category: "B2B_EVALUATION",
      idempotencyKey: `opened-${suffix}`,
    }).expect(201);
    await request(app).post(`/api/admin/gifting-issues/${opened.body.id}/return`)
      .set("Authorization", `Bearer ${token}`).send({ quantity: 1, condition: "new", idempotencyKey: `opened-new-${suffix}` }).expect(409);
    const openedReturn = await request(app).post(`/api/admin/gifting-issues/${opened.body.id}/return`)
      .set("Authorization", `Bearer ${token}`).send({ quantity: 1, condition: "used", idempotencyKey: `opened-used-${suffix}` }).expect(200);
    const replay = await request(app).post(`/api/admin/gifting-issues/${opened.body.id}/return`)
      .set("Authorization", `Bearer ${token}`).send({ quantity: 1, condition: "used", idempotencyKey: `opened-used-${suffix}` }).expect(200);
    expect(replay.body).toEqual(openedReturn.body);
    await request(app).post(`/api/admin/gifting-issues/${opened.body.id}/return`)
      .set("Authorization", `Bearer ${token}`).send({ quantity: 1, condition: "new", idempotencyKey: `opened-used-${suffix}` }).expect(409);

    const normal = await request(app).post("/api/admin/gifting-issues").set("Authorization", `Bearer ${token}`).send({
      productId: secondProductId, quantity: 2, category: "B2B_EVALUATION", idempotencyKey: `mixed-${suffix}`,
    }).expect(201);
    const firstNormalReturn = await request(app).post(`/api/admin/gifting-issues/${normal.body.id}/return`)
      .set("Authorization", `Bearer ${token}`).send({ quantity: 1, condition: "new", idempotencyKey: `mixed-new-${suffix}` }).expect(200);
    const mixed = await request(app).post(`/api/admin/gifting-issues/${normal.body.id}/return`)
      .set("Authorization", `Bearer ${token}`).send({ quantity: 1, condition: "used", idempotencyKey: `mixed-used-${suffix}` }).expect(200);
    expect(mixed.body.returnCondition).toBe("mixed");
    const firstReplay = await request(app).post(`/api/admin/gifting-issues/${normal.body.id}/return`)
      .set("Authorization", `Bearer ${token}`).send({ quantity: 1, condition: "new", idempotencyKey: `mixed-new-${suffix}` }).expect(200);
    expect(firstReplay.body).toEqual(firstNormalReturn.body);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, secondProductId));
    const [openedBalance] = await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.locationId, location.id));
    expect(product.stockQuantity).toBe(1);
    expect(openedBalance.available).toBe(2);

    const splitPayload = {
      category: "B2B_EVALUATION",
      idempotencyKey: `split-${suffix}`,
      lines: [
        { productId: secondProductId, quantity: 1, stockSource: "used_return" },
        { productId: secondProductId, quantity: 1, stockSource: "normal" },
      ],
    };
    const split = await request(app).post("/api/admin/gifting-issues")
      .set("Authorization", `Bearer ${token}`).send(splitPayload).expect(201);
    const splitRows = await db.select().from(giftingIssuesTable)
      .where(sql`${giftingIssuesTable.dedupeKey} like ${`manual:split-${suffix}:%`}`);
    expect(splitRows).toHaveLength(2);
    expect(splitRows.map((row) => row.stockSource).sort()).toEqual(["normal", "used_return"]);
    const retry = await request(app).post("/api/admin/gifting-issues")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...splitPayload, lines: [...splitPayload.lines].reverse() }).expect(201);
    expect(retry.body.id).toBe(split.body.id);
    const availability = await request(app).get("/api/admin/gifting-issues/tester-availability")
      .set("Authorization", `Bearer ${token}`).query({ productId: secondProductId }).expect(200);
    expect(availability.body).toMatchObject({ normalAvailable: 0, usedReturnAvailable: 1, totalAvailable: 1 });
    await request(app).post("/api/admin/gifting-issues")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: secondProductId, quantity: 1, category: "TESTER", idempotencyKey: `no-main-${suffix}` })
      .expect(409);
    const [stillOpened] = await db.select().from(inventoryBalancesTable)
      .where(eq(inventoryBalancesTable.locationId, location.id));
    expect(stillOpened.available).toBe(1);

    const finalTester = await request(app).post("/api/admin/gifting-issues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        category: "TESTER", idempotencyKey: `final-opened-${suffix}`,
        lines: [{ productId: secondProductId, quantity: 1, stockSource: "used_return" }],
      }).expect(201);
    await request(app).post(`/api/admin/gifting-issues/${finalTester.body.id}/return`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 1, condition: "used", idempotencyKey: `final-return-${suffix}` }).expect(409);
    const [afterFinalOpened] = await db.select().from(inventoryBalancesTable)
      .where(eq(inventoryBalancesTable.locationId, location.id));
    const [afterFinalMain] = await db.select().from(productsTable).where(eq(productsTable.id, secondProductId));
    expect(afterFinalOpened.available).toBe(0);
    expect(afterFinalMain.stockQuantity).toBe(0);
  });
});