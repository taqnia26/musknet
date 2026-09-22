import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, or } from "drizzle-orm";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  customersTable,
  db,
  invoicesTable,
  orderAddressesTable,
  ordersTable,
  shipmentsTable,
  wholesaleDistributorsTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";

const suffix = Date.now();
const base = 1_820_000_000 + (suffix % 20_000_000);
const ids = { admin: base, viewer: base + 1, customer: base + 2, order: base + 3, address: base + 4, distributor: base + 5, invoice: base + 6, missingShipmentOrder: base + 7 };
let adminToken: string;
let shippingViewerToken: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await db.insert(adminPermissionsTable).values(
    ["view", "edit"].map((action) => ({ module: "shipping", action })),
  ).onConflictDoNothing();
  await db.insert(adminUsersTable).values([
    { id: ids.admin, email: `shipping-admin-${suffix}@example.com`, name: "Shipping Admin", passwordHash: await hashAdminPassword("shipping-password") },
    { id: ids.viewer, email: `shipping-viewer-${suffix}@example.com`, name: "Shipping Viewer", passwordHash: await hashAdminPassword("shipping-password") },
  ]);
  const permissions = await db.select().from(adminPermissionsTable).where(eq(adminPermissionsTable.module, "shipping"));
  await db.insert(adminUserPermissionsTable).values(
    permissions.map((permission) => ({ adminUserId: ids.admin, permissionId: permission.id })),
  );
  await db.insert(adminUserPermissionsTable).values(
    permissions.filter((permission) => permission.action === "view")
      .map((permission) => ({ adminUserId: ids.viewer, permissionId: permission.id })),
  );
  adminToken = await createAdminSession(ids.admin);
  shippingViewerToken = await createAdminSession(ids.viewer);

  await db.insert(customersTable).values({ id: ids.customer, phone: `9665${String(suffix).slice(-8)}`, name: "Shipping Customer" });
  await db.insert(ordersTable).values({
    id: ids.order, userId: ids.customer, orderNumber: `SHIP-ORDER-${suffix}`,
    subtotal: 100, shippingCost: 28, discount: 0, tax: 15, total: 143,
    address: "{}", shippingMethod: "express", paymentMethod: "cod",
    createdAt: new Date("2026-09-01T09:00:00.000Z"),
  });
  await db.insert(ordersTable).values({
    id: ids.missingShipmentOrder, userId: ids.customer, orderNumber: `SHIP-MISSING-${suffix}`,
    subtotal: 80, shippingCost: 20, discount: 0, tax: 12, total: 112,
    address: "{}", shippingMethod: "standard", paymentMethod: "cod",
    createdAt: new Date("2026-09-07T09:00:00.000Z"),
  });
  await db.insert(orderAddressesTable).values({
    id: ids.address, orderId: ids.order, label: "Home", city: "Riyadh", district: "Olaya",
    street: "King Road", buildingNo: "9", isDefault: true,
  });
  await db.insert(wholesaleDistributorsTable).values({
    id: ids.distributor, companyName: "Shipping Company", contactName: "Manager",
    phone: `011${String(suffix).slice(-7)}`, city: "Jeddah", address: "Industrial Area",
  });
  await db.insert(invoicesTable).values({
    id: ids.invoice, distributorId: ids.distributor, creationKey: `shipping-invoice-${suffix}`,
    sequenceNumber: base, invoiceNumber: `SHIP-INV-${suffix}`, sellerName: "Musk Ellolo",
    issueDatetime: new Date("2026-09-02T09:00:00.000Z"), sellerVatNumber: "300000000000003",
    buyerName: "Shipping Company", buyerAddress: "Industrial Area, Jeddah",
    subtotal: 500, vatAmount: 75, totalAmount: 575, qrCodeData: "AQ==",
  });
  await db.insert(shipmentsTable).values([
    {
      channel: "online", orderId: ids.order, destinationCity: "Riyadh", destinationAddress: "Olaya",
      serviceMethod: "express", trackingNumber: `ON-${suffix}`, status: "in_transit",
      actualCost: 20, collectedCost: 28, shippedAt: new Date("2026-09-03T09:00:00.000Z"),
      createdAt: new Date("2026-09-03T09:00:00.000Z"),
    },
    {
      channel: "b2b", invoiceId: ids.invoice, destinationCity: "Jeddah", destinationAddress: "Industrial Area",
      carrier: "Test Carrier", trackingNumber: `B2B-${suffix}`, status: "delivered",
      actualCost: 60, collectedCost: 75, shippedAt: new Date("2026-09-04T09:00:00.000Z"),
      deliveredAt: new Date("2026-09-05T09:00:00.000Z"), createdAt: new Date("2026-09-04T09:00:00.000Z"),
    },
  ]);
});

afterAll(async () => {
  await db.delete(shipmentsTable).where(or(eq(shipmentsTable.orderId, ids.order), eq(shipmentsTable.invoiceId, ids.invoice)));
  await db.delete(invoicesTable).where(eq(invoicesTable.id, ids.invoice));
  await db.delete(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, ids.distributor));
  await db.delete(ordersTable).where(inArray(ordersTable.id, [ids.order, ids.missingShipmentOrder]));
  await db.delete(customersTable).where(eq(customersTable.id, ids.customer));
  await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminUserId, [ids.admin, ids.viewer]));
  await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, [ids.admin, ids.viewer]));
});

describe.sequential("admin shipping dashboards", () => {
  it("aggregates online shipping separately with actual and collected costs", async () => {
    const response = await request(app).get("/api/admin/shipping?channel=online&from=2026-09-01&to=2026-09-30")
      .set(auth(adminToken)).expect(200);
    expect(response.body.summary).toMatchObject({
      shipmentCount: 1, uniqueParties: 1, totalActualCost: 20, averageActualCost: 20, totalCollectedCost: 28,
    });
    expect(response.body.items[0]).toMatchObject({
      channel: "online", referenceNumber: `SHIP-ORDER-${suffix}`, partyName: "Shipping Customer", destinationCity: "Riyadh",
    });
    expect(response.body.items.every((item: { invoiceId: number | null }) => item.invoiceId === null)).toBe(true);
  });

  it("filters B2B shipments by city, status, and search without leaking online rows", async () => {
    const response = await request(app)
      .get(`/api/admin/shipping?channel=b2b&city=Jeddah&status=delivered&search=${encodeURIComponent(`B2B-${suffix}`)}`)
      .set(auth(adminToken)).expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({
      channel: "b2b", referenceNumber: `SHIP-INV-${suffix}`, partyName: "Shipping Company", orderId: null,
    });
  });

  it("enforces channel permissions and rejects edits for a view-only user", async () => {
    await request(app).get("/api/admin/shipping?channel=online").set(auth(shippingViewerToken)).expect(200);
    await request(app).get("/api/admin/shipping?channel=b2b").set(auth(shippingViewerToken)).expect(200);
    const online = await db.select({ id: shipmentsTable.id }).from(shipmentsTable).where(eq(shipmentsTable.orderId, ids.order)).limit(1);
    await request(app).patch(`/api/admin/shipping/${online[0].id}`).set(auth(shippingViewerToken))
      .send({ status: "delivered" }).expect(403);
  });

  it("updates operational shipment fields and keeps the two cost meanings distinct", async () => {
    const [online] = await db.select({ id: shipmentsTable.id }).from(shipmentsTable).where(eq(shipmentsTable.orderId, ids.order)).limit(1);
    const response = await request(app).patch(`/api/admin/shipping/${online.id}`).set(auth(adminToken))
      .send({ carrier: "Carrier X", status: "delivered", actualCost: 22, collectedCost: 28, deliveredAt: "2026-09-06T10:00:00.000Z" })
      .expect(200);
    expect(response.body).toMatchObject({ carrier: "Carrier X", status: "delivered", actualCost: 22, collectedCost: 28 });
    await request(app).patch(`/api/admin/shipping/${online.id}`).set(auth(adminToken))
      .send({ status: "delivered" }).expect(409)
      .then(({ body }) => expect(body.error).toMatch(/invalid shipment status transition/i));
    await request(app).patch(`/api/admin/shipping/${online.id}`).set(auth(adminToken))
      .send({ status: "in_transit" }).expect(409)
      .then(({ body }) => expect(body.error).toMatch(/allowed next statuses: returned/i));
    const [order] = await db.select({ status: ordersTable.status }).from(ordersTable).where(eq(ordersTable.id, ids.order));
    expect(order.status).toBe("new");
  });

  it("registers shipping details for a source that has no shipment yet", async () => {
    const response = await request(app).post("/api/admin/shipping").set(auth(adminToken)).send({
      channel: "online",
      sourceId: ids.missingShipmentOrder,
      destinationCity: "Dammam",
      destinationAddress: "Al Faisaliyah",
      carrier: "Carrier Y",
      trackingNumber: `NEW-${suffix}`,
      status: "ready",
      actualCost: 17,
      collectedCost: 20,
    }).expect(201);
    expect(response.body).toMatchObject({
      channel: "online",
      orderId: ids.missingShipmentOrder,
      referenceNumber: `SHIP-MISSING-${suffix}`,
      destinationCity: "Dammam",
      actualCost: 17,
      collectedCost: 20,
    });
  });

  it("returns a clear empty dashboard when filters match no shipments", async () => {
    const response = await request(app).get("/api/admin/shipping?channel=online&city=NoSuchCity")
      .set(auth(adminToken)).expect(200);
    expect(response.body).toMatchObject({ total: 0, items: [], summary: { shipmentCount: 0, uniqueParties: 0, totalActualCost: 0 } });
  });
});