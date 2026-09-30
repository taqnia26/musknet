import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, categoriesTable, productsTable, shipheroProductMappingsTable } from "@workspace/db";
import { createShipHeroAdminRouter } from "./shiphero-admin";

describe("ShipHero admin configuration and disabled action boundaries", () => {
  const unique = randomUUID();
  let categoryId: number;
  let productId: number;
  const app = express();
  app.use(express.json());
  app.use(createShipHeroAdminRouter((_module, _action) => (_req, res, next) => {
    res.locals.admin = { isSuperAdmin: true };
    next();
  }));
  const readOnlyApp = express();
  readOnlyApp.use(express.json());
  readOnlyApp.use(createShipHeroAdminRouter((_module, action) => (_req, res, next) => {
    res.locals.admin = { isSuperAdmin: false };
    res.locals.permissions = ["integrations:view"];
    if (action !== "view") { res.status(403).json({ error: "Insufficient permission" }); return; }
    next();
  }));
  beforeAll(async () => {
    const [category] = await db.insert(categoriesTable).values({
      nameAr: "اختبار مؤقت", nameEn: "Disposable integration test", slug: `shiphero-test-${unique}`,
    }).returning();
    categoryId = category.id;
    const [product] = await db.insert(productsTable).values({
      nameAr: "اختبار مؤقت", nameEn: "Disposable ShipHero fixture",
      slug: `shiphero-test-${unique}`, categoryId, price: 1, isActive: false,
    }).returning();
    productId = product.id;
  });
  afterAll(async () => {
    if (productId) {
      await db.delete(shipheroProductMappingsTable).where(eq(shipheroProductMappingsTable.productId, productId));
      await db.delete(productsTable).where(eq(productsTable.id, productId));
    }
    if (categoryId) await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  });
  it("reports the actual disabled state and hides order records from configuration-only readers", async () => {
    const response = await request(readOnlyApp).get("/admin/shiphero").expect(200);
    expect(response.body.readiness.configured).toBe(false);
    expect(response.body.readiness.partnerContractConfirmed).toBe(false);
    expect(response.body.dispatches).toEqual([]);
    expect(response.body.events).toEqual([]);
    await request(readOnlyApp).put("/admin/shiphero/settings").send({}).expect(403);
  });
  it("saves confirmed mapping fields, edits them, and refuses blank or registered replacements", async () => {
    const path = `/admin/shiphero/mappings/${productId}`;
    await request(app).put(path).send({ productName: "  ", sku: " ", registrationKind: "existing" }).expect(400);
    await request(app).put(path).send({
      productName: "Disposable test partner name", sku: `fixture-${unique}`, registrationKind: "existing",
    }).expect(200);
    await request(app).put(path).send({
      productName: "Updated disposable test name", sku: `fixture-${unique}`, registrationKind: "existing",
    }).expect(200);
    const [mapping] = await db.select().from(shipheroProductMappingsTable).where(eq(shipheroProductMappingsTable.productId, productId));
    expect(mapping.productName).toBe("Updated disposable test name");
    await db.update(shipheroProductMappingsTable).set({ createStatus: "created", remoteProductId: "fixture-remote-id" })
      .where(eq(shipheroProductMappingsTable.productId, productId));
    await request(app).put(path).send({
      productName: "Must not replace registered identity", sku: "different-fixture", registrationKind: "new",
    }).expect(409);
    await request(app).delete(path).expect(409);
    await db.update(shipheroProductMappingsTable).set({ createStatus: "not_requested", remoteProductId: null })
      .where(eq(shipheroProductMappingsTable.productId, productId));
    await request(app).delete(path).expect(200);
    expect(await db.select().from(shipheroProductMappingsTable).where(eq(shipheroProductMappingsTable.productId, productId))).toHaveLength(0);
  });
  it("returns a clear 503 for send and registration while the partner example is unconfirmed", async () => {
    const response = await request(app).post("/admin/shiphero/orders/1/send").expect(503);
    expect(response.body.error).toContain("Live sending is disabled");
    await request(app).post(`/admin/shiphero/products/${productId}/create`)
      .send({ confirmNotRegistered: true }).expect(503);
  });
});