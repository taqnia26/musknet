import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import {
  adminPermissionsTable, adminSessionsTable, adminUserPermissionsTable,
  adminUsersTable, categoriesTable, db, manufacturingBatchesTable, productsTable, productionPlansTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";

const suffix = Date.now();
const userIds: number[] = [];
const planIds: number[] = [];
const batchIds: number[] = [];
const productIds: number[] = [];
const categoryIds: number[] = [];
let maker: string;
let finance: string;
let outsider: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `production-root-${suffix}@example.com`;
  process.env.ADMIN_PASSWORD = "production-test-password";
  await db.insert(adminPermissionsTable).values([
    { module: "manufacturing", action: "view" }, { module: "manufacturing", action: "edit" },
    { module: "finance", action: "view" }, { module: "finance", action: "edit" },
  ]).onConflictDoNothing();
  const passwordHash = await hashAdminPassword("production-test-password");
  const users = await db.insert(adminUsersTable).values([
    { email: `production-maker-${suffix}@example.com`, name: "Maker", passwordHash },
    { email: `production-finance-${suffix}@example.com`, name: "Finance", passwordHash },
    { email: `production-outsider-${suffix}@example.com`, name: "Outsider", passwordHash },
  ]).returning();
  userIds.push(...users.map(user => user.id));
  const permissions = await db.select().from(adminPermissionsTable);
  const grant = (userId: number, module: string, action: string) => {
    const permission = permissions.find(p => p.module === module && p.action === action);
    if (!permission) throw new Error(`Missing ${module}:${action}`);
    return { adminUserId: userId, permissionId: permission.id };
  };
  await db.insert(adminUserPermissionsTable).values([
    grant(users[0].id, "manufacturing", "view"), grant(users[0].id, "manufacturing", "edit"),
    grant(users[1].id, "finance", "view"), grant(users[1].id, "finance", "edit"),
  ]);
  [maker, finance, outsider] = await Promise.all(users.map(user => createAdminSession(user.id)));
});

afterAll(async () => {
  if (batchIds.length) await db.delete(manufacturingBatchesTable).where(inArray(manufacturingBatchesTable.id, batchIds));
  if (planIds.length) await db.delete(productionPlansTable).where(inArray(productionPlansTable.id, planIds));
  if (productIds.length) await db.delete(productsTable).where(inArray(productsTable.id, productIds));
  if (categoryIds.length) await db.delete(categoriesTable).where(inArray(categoriesTable.id, categoryIds));
  if (userIds.length) {
    await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminUserId, userIds));
    await db.delete(adminUserPermissionsTable).where(inArray(adminUserPermissionsTable.adminUserId, userIds));
    await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, userIds));
  }
});

describe("production plans and finance funding", () => {
  const plan = {
    productId: null,
    productName: "Future perfume",
    category: "Perfumes",
    productType: "Eau de parfum",
    priority: "high",
    targetLaunchDate: "2031-10-01",
    targetProductionDate: "2031-09-01",
    plannedQuantity: 500,
    manufacturingCountry: "Saudi Arabia",
    factory: "Test Factory",
    estimatedCost: "18000.0000",
    status: "planning",
    notes: "Test only",
  };

  it("requires approval and a finance confirmation before scheduling, without creating a payment", async () => {
    const created = await request(app).post("/api/admin/production/plans").set(auth(maker)).send(plan).expect(201);
    planIds.push(created.body.id);
    expect(created.body).toMatchObject({ productName: plan.productName, status: "planning", fundingStatus: "not_requested" });
    const id = created.body.id;
    await request(app).patch(`/api/admin/production/plans/${id}`).set(auth(maker)).send({ status: "approved" }).expect(409);
    await request(app).patch(`/api/admin/production/plans/${id}`).set(auth(maker)).send({ status: "under_review" }).expect(200);
    const approved = await request(app).patch(`/api/admin/production/plans/${id}`).set(auth(maker)).send({ status: "approved" }).expect(200);
    expect(approved.body).toMatchObject({ fundingStatus: "pending", securedAt: null });
    await request(app).patch(`/api/admin/production/plans/${id}`).set(auth(maker)).send({ estimatedCost: "20000.0000" }).expect(409);
    await request(app).patch(`/api/admin/production/plans/${id}`).set(auth(maker)).send({ status: "scheduled" }).expect(409);
    await request(app).post(`/api/admin/production/plans/${id}/secure-funds`).set(auth(maker)).send({}).expect(403);
    const queue = await request(app).get("/api/admin/finance/production-funding").set(auth(finance)).expect(200);
    expect(queue.body).toEqual(expect.arrayContaining([expect.objectContaining({ id, fundingStatus: "pending" })]));
    const secured = await request(app).post(`/api/admin/production/plans/${id}/secure-funds`)
      .set(auth(finance)).send({ note: "Funds available" }).expect(200);
    expect(secured.body).toMatchObject({ fundingStatus: "secured", fundingNote: "Funds available", estimatedCost: plan.estimatedCost });
    await request(app).post(`/api/admin/production/plans/${id}/secure-funds`).set(auth(finance)).send({}).expect(409);
    const scheduled = await request(app).patch(`/api/admin/production/plans/${id}`)
      .set(auth(maker)).send({ status: "scheduled" }).expect(200);
    expect(scheduled.body.fundingStatus).toBe("secured");
    const listed = await request(app).get("/api/admin/production/plans").set(auth(maker)).expect(200);
    expect(listed.body).toEqual(expect.arrayContaining([expect.objectContaining({ id, status: "scheduled" })]));
  });

  it("keeps manufacturing and finance permissions separate", async () => {
    await request(app).get("/api/admin/production/plans").expect(401);
    await request(app).get("/api/admin/production/plans").set(auth(outsider)).expect(403);
    await request(app).post("/api/admin/production/plans").set(auth(finance)).send(plan).expect(403);
    await request(app).get("/api/admin/finance/production-funding").set(auth(maker)).expect(403);
    await request(app).get("/api/admin/production/reorder-alerts").set(auth(outsider)).expect(403);
    const alerts = await request(app).get("/api/admin/production/reorder-alerts").set(auth(maker)).expect(200);
    expect(Array.isArray(alerts.body)).toBe(true);
  });

  it("links batches only to funded active plans, while preserving existing completed links", async () => {
    const [category] = await db.insert(categoriesTable).values({
      nameAr: "اختبار الإنتاج", nameEn: "Production test", slug: `production-test-${suffix}`,
    }).returning();
    categoryIds.push(category.id);
    const [product] = await db.insert(productsTable).values({
      nameAr: "عطر الاختبار", nameEn: "Production perfume", slug: `production-perfume-${suffix}`,
      price: 50, categoryId: category.id,
    }).returning();
    productIds.push(product.id);
    const catalog = await request(app).get("/api/admin/production/catalog-products").set(auth(maker)).expect(200);
    expect(catalog.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: product.id })]));
    await request(app).get("/api/admin/production/catalog-products").set(auth(finance)).expect(403);

    const created = await request(app).post("/api/admin/production/plans").set(auth(maker))
      .send({ ...plan, productId: product.id }).expect(201);
    planIds.push(created.body.id);
    const id = created.body.id;
    const batch = {
      batchNumber: `test-batch-${suffix}`, productId: product.id, productionPlanId: id,
      quantityProduced: 10, productionDate: "2031-09-01", expiryDate: null,
      costPerUnit: 20, status: "in_production",
    };
    await request(app).post("/api/admin/manufacturing/batches").set(auth(maker)).send(batch).expect(400);
    await request(app).patch(`/api/admin/production/plans/${id}`).set(auth(maker))
      .send({ status: "under_review" }).expect(200);
    await request(app).patch(`/api/admin/production/plans/${id}`).set(auth(maker))
      .send({ status: "approved" }).expect(200);
    await request(app).post("/api/admin/manufacturing/batches").set(auth(maker)).send(batch).expect(400);
    await request(app).post(`/api/admin/production/plans/${id}/secure-funds`).set(auth(finance)).send({}).expect(200);
    const linked = await request(app).post("/api/admin/manufacturing/batches").set(auth(maker))
      .send(batch).expect(201);
    batchIds.push(linked.body.id);
    expect(linked.body.productionPlanId).toBe(id);
    for (const status of ["scheduled", "in_production", "completed"]) {
      await request(app).patch(`/api/admin/production/plans/${id}`).set(auth(maker))
        .send({ status }).expect(200);
    }
    await request(app).patch(`/api/admin/manufacturing/batches/${linked.body.id}`)
      .set(auth(maker)).send({ status: "quality_check" }).expect(200);
    await request(app).post("/api/admin/manufacturing/batches").set(auth(maker))
      .send({ ...batch, batchNumber: `test-batch-late-${suffix}` }).expect(400);
  });
});