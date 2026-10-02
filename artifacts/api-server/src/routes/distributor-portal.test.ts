import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  categoriesTable,
  companyOrderDecisionsTable,
  companyOrderItemsTable,
  companyOrdersTable,
  db,
  distributorPortalAccountsTable,
  distributorPortalLoginAttemptsTable,
  distributorPortalSessionsTable,
  distributorContractsTable,
  inventoryBalancesTable,
  inventoryMovementsTable,
  invoiceItemsTable,
  invoicesTable,
  journalEntryAuditTable,
  journalEntryLinesTable,
  journalEntriesTable,
  operationEventsTable,
  productsTable,
  receivablePaymentsTable,
  wholesaleDistributorsTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";
import { createReceivablePayment } from "../lib/invoices";
import { saudiCalendarDate } from "../lib/invoice-dates";
import {
  hashDistributorPortalPassword,
  isStrongDistributorPortalPassword,
  verifyDistributorPortalPassword,
} from "./distributor-portal";

const suffix = Date.now();
const strongPassword = "Portal-Test-2028!";
const invalidPassword = "short";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const fixtureEmails = [`portal-a-${suffix}@example.com`, `portal-b-${suffix}@example.com`];
const loginKeyHashes = (email: string) => {
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  return [
    digest(`email:${digest(email)}`),
    ...["::ffff:127.0.0.1", "::1", "127.0.0.1", "unknown"].map((ip) => digest(`ip:${digest(ip)}`)),
  ];
};
const originalAdminEmail = process.env.ADMIN_EMAIL;
const originalAdminPassword = process.env.ADMIN_PASSWORD;
const originalVatSellerName = process.env.VAT_SELLER_LEGAL_NAME;
const originalVatRegistration = process.env.VAT_REGISTRATION_NUMBER;
function restoreVatConfiguration() {
  if (originalVatSellerName === undefined) delete process.env.VAT_SELLER_LEGAL_NAME;
  else process.env.VAT_SELLER_LEGAL_NAME = originalVatSellerName;
  if (originalVatRegistration === undefined) delete process.env.VAT_REGISTRATION_NUMBER;
  else process.env.VAT_REGISTRATION_NUMBER = originalVatRegistration;
}
let productIds: number[] = [];
let categoryId: number;
let companyIds: number[] = [];
let contractId: number;
let accountIds: number[] = [];
let adminIds: number[] = [];
let editAdminId: number;
let adminSessionIds: number[] = [];
let portalSessionIds: number[] = [];
let orderIds: number[] = [];
let adminTokens: { view: string; edit: string; none: string } | undefined;
let portalTokens: { first: string; second: string } | undefined;

describe.sequential("distributor portal authentication and company orders", () => {
  beforeAll(async () => {
    process.env.ADMIN_EMAIL = `portal-test-root-${suffix}@example.com`;
    process.env.ADMIN_PASSWORD = strongPassword;
    await db.insert(adminPermissionsTable).values([
      { module: "company-orders", action: "view" },
      { module: "company-orders", action: "edit" },
    ]).onConflictDoNothing();
    const [category] = await db.insert(categoriesTable).values({
      nameAr: "اختبار بوابة الموزعين",
      nameEn: "Distributor portal test",
      slug: `distributor-portal-test-${suffix}`,
    }).returning();
    categoryId = category.id;
    const products = await db.insert(productsTable).values([
      {
        nameAr: "منتج البوابة الأول",
        nameEn: "Portal product one",
        slug: `distributor-portal-product-one-${suffix}`,
        price: 100,
        categoryId,
        stockQuantity: 20,
        averageCost: "20.0000",
        sellable: true,
        isActive: true,
        showOnDistributors: true,
      },
      {
        nameAr: "منتج البوابة المخفي",
        nameEn: "Portal hidden product",
        slug: `distributor-portal-product-hidden-${suffix}`,
        price: 50,
        categoryId,
        stockQuantity: 20,
        sellable: true,
        isActive: true,
        showOnDistributors: false,
      },
    ]).returning();
    productIds = products.map((product) => product.id);

    const companies = await db.insert(wholesaleDistributorsTable).values([
      {
        companyName: `Portal company A ${suffix}`,
        contactName: "Portal tester A",
        email: fixtureEmails[0],
        phone: `055${String(suffix).slice(-7)}`,
        countryCode: "SA",
      },
      {
        companyName: `Portal company B ${suffix}`,
        contactName: "Portal tester B",
        email: fixtureEmails[1],
        phone: `056${String(suffix).slice(-7)}`,
        countryCode: "SA",
      },
    ]).returning();
    companyIds = companies.map((company) => company.id);
    const [contract] = await db.insert(distributorContractsTable).values({
      contractNumber: `PORTAL-TEST-${suffix}`,
      distributorId: companyIds[0],
      contractType: "عقد توريد أجل المملكة العربية السعودية",
      status: "final",
      marginPercent: "10.00",
      minOrderValue: "0.00",
      paymentDays: 30,
      vatRate: "15.00",
      sellerName: "Portal test seller",
      sellerCrNumber: "1234567890",
      sellerCrDate: "2028-01-01",
      sellerCrIssuer: "Portal test",
      sellerAddress: "Test address",
      sellerRepName: "Portal test representative",
      sellerRepTitle: "Manager",
      buyerCompanyName: companies[0].companyName,
      createdBy: (await db.insert(adminUsersTable).values({
        email: `portal-test-credit-reviewer-${suffix}@example.com`,
        name: "Portal credit reviewer",
        passwordHash: await hashAdminPassword(strongPassword),
      }).returning({ id: adminUsersTable.id }))[0].id,
      creditLimit: "100000.00",
      creditLimitApprovedBy: null,
      creditLimitApprovedAt: null,
      creditLimitApprovalReason: null,
    }).returning();
    contractId = contract.id;
    const reviewerId = contract.createdBy;
    await db.update(distributorContractsTable).set({
      creditLimitApprovedBy: reviewerId,
      creditLimitApprovedAt: new Date(),
      creditLimitApprovalReason: "Approved distributor portal test exposure.",
    }).where(eq(distributorContractsTable.id, contractId));

    const users = await db.insert(adminUsersTable).values([
      {
        email: `portal-viewer-${suffix}@example.com`,
        name: "Portal viewer",
        passwordHash: await hashAdminPassword(strongPassword),
      },
      {
        email: `portal-editor-${suffix}@example.com`,
        name: "Portal editor",
        passwordHash: await hashAdminPassword(strongPassword),
      },
      {
        email: `portal-outsider-${suffix}@example.com`,
        name: "Portal outsider",
        passwordHash: await hashAdminPassword(strongPassword),
      },
    ]).returning();
    adminIds = [...adminIds, ...users.map((user) => user.id), reviewerId];
    const permissions = await db.select().from(adminPermissionsTable).where(eq(adminPermissionsTable.module, "company-orders"));
    const permissionFor = (action: string) => {
      const permission = permissions.find((entry) => entry.action === action);
      if (!permission) throw new Error(`Missing company-orders:${action} permission`);
      return permission;
    };
    await db.insert(adminUserPermissionsTable).values([
      { adminUserId: users[0].id, permissionId: permissionFor("view").id },
      { adminUserId: users[1].id, permissionId: permissionFor("view").id },
      { adminUserId: users[1].id, permissionId: permissionFor("edit").id },
    ]);
    adminTokens = {
      view: await createAdminSession(users[0].id),
      edit: await createAdminSession(users[1].id),
      none: await createAdminSession(users[2].id),
    };
    editAdminId = users[1].id;
    adminSessionIds = await db.select({ id: adminSessionsTable.id }).from(adminSessionsTable)
      .where(inArray(adminSessionsTable.adminUserId, users.map((user) => user.id)))
      .then((rows) => rows.map((row) => row.id));

    const initialHash = await hashDistributorPortalPassword(strongPassword);
    const accounts = await db.insert(distributorPortalAccountsTable).values([
      { distributorId: companyIds[0], email: fixtureEmails[0], passwordHash: initialHash, enabled: false },
    ]).returning();
    accountIds = accounts.map((account) => account.id);
  });

  afterAll(async () => {
    if (orderIds.length) {
      await db.delete(companyOrderDecisionsTable).where(inArray(companyOrderDecisionsTable.companyOrderId, orderIds));
      await db.delete(companyOrderItemsTable).where(inArray(companyOrderItemsTable.companyOrderId, orderIds));
    }
    if (companyIds.length) {
      const fixtureInvoices = await db.select({ id: invoicesTable.id }).from(invoicesTable)
        .where(inArray(invoicesTable.distributorId, companyIds));
      const invoiceIds = fixtureInvoices.map((invoice) => invoice.id);
      if (invoiceIds.length) {
        const payments = await db.select({ id: receivablePaymentsTable.id }).from(receivablePaymentsTable)
          .where(inArray(receivablePaymentsTable.invoiceId, invoiceIds));
        const financialSourceIds = [...invoiceIds.map(String), ...payments.map((payment) => String(payment.id))];
        await db.transaction(async (tx) => {
          await tx.execute(sql`set local session_replication_role = 'replica'`);
          await tx.update(companyOrdersTable).set({ invoiceId: null })
            .where(inArray(companyOrdersTable.invoiceId, invoiceIds));
          const entries = await tx.select({ id: journalEntriesTable.id }).from(journalEntriesTable)
            .where(and(
              inArray(journalEntriesTable.sourceType, [
                "distributor_invoice", "distributor_invoice_cogs", "receivable_payment",
              ]),
              inArray(journalEntriesTable.sourceId, financialSourceIds),
            ));
          if (entries.length) {
            const entryIds = entries.map((entry) => entry.id);
            await tx.delete(journalEntryAuditTable).where(inArray(journalEntryAuditTable.journalEntryId, entryIds));
            await tx.delete(journalEntryLinesTable).where(inArray(journalEntryLinesTable.journalEntryId, entryIds));
            await tx.delete(journalEntriesTable).where(inArray(journalEntriesTable.id, entryIds));
          }
          if (payments.length) {
            await tx.delete(operationEventsTable).where(and(
              eq(operationEventsTable.sourceType, "receivable_payment"),
              inArray(operationEventsTable.sourceId, payments.map((payment) => String(payment.id))),
            ));
            await tx.delete(receivablePaymentsTable).where(inArray(receivablePaymentsTable.id, payments.map((payment) => payment.id)));
          }
          await tx.delete(invoiceItemsTable).where(inArray(invoiceItemsTable.invoiceId, invoiceIds));
          await tx.delete(operationEventsTable).where(and(
            inArray(operationEventsTable.sourceType, ["distributor_invoice", "distributor_invoice_cogs"]),
            inArray(operationEventsTable.sourceId, invoiceIds.map(String)),
          ));
          await tx.delete(inventoryMovementsTable).where(and(
            inArray(inventoryMovementsTable.sourceType, ["distributor_invoice", "distributor_invoice_cogs"]),
            inArray(inventoryMovementsTable.sourceId, invoiceIds.map(String)),
          ));
          await tx.delete(invoicesTable).where(inArray(invoicesTable.id, invoiceIds));
        });
      }
    }
    if (orderIds.length) await db.delete(companyOrdersTable).where(inArray(companyOrdersTable.id, orderIds));
    if (portalSessionIds.length) {
      await db.delete(distributorPortalSessionsTable).where(inArray(distributorPortalSessionsTable.id, portalSessionIds));
    }
    if (accountIds.length) {
      await db.delete(distributorPortalSessionsTable).where(inArray(distributorPortalSessionsTable.accountId, accountIds));
      await db.delete(distributorPortalAccountsTable).where(inArray(distributorPortalAccountsTable.id, accountIds));
    }
    for (const email of fixtureEmails) {
      await db.delete(distributorPortalLoginAttemptsTable)
        .where(inArray(distributorPortalLoginAttemptsTable.keyHash, loginKeyHashes(email)));
    }
    if (contractId) await db.delete(distributorContractsTable).where(eq(distributorContractsTable.id, contractId));
    if (companyIds.length) await db.delete(wholesaleDistributorsTable).where(inArray(wholesaleDistributorsTable.id, companyIds));
    if (productIds.length) {
      await db.delete(inventoryMovementsTable).where(inArray(inventoryMovementsTable.productId, productIds));
      await db.delete(inventoryBalancesTable).where(inArray(inventoryBalancesTable.productId, productIds));
      await db.delete(productsTable).where(inArray(productsTable.id, productIds));
    }
    if (categoryId) await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
    if (adminSessionIds.length) await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.id, adminSessionIds));
    if (adminIds.length) {
      await db.delete(adminUserPermissionsTable).where(inArray(adminUserPermissionsTable.adminUserId, adminIds));
      await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, adminIds));
    }
    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdminEmail;
    if (originalAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalAdminPassword;
    if (originalVatSellerName === undefined) delete process.env.VAT_SELLER_LEGAL_NAME;
    else process.env.VAT_SELLER_LEGAL_NAME = originalVatSellerName;
    if (originalVatRegistration === undefined) delete process.env.VAT_REGISTRATION_NUMBER;
    else process.env.VAT_REGISTRATION_NUMBER = originalVatRegistration;
  });

  it("hashes strong passwords, reports existing and absent account state and requires read permission", async () => {
    if (!adminTokens) throw new Error("Admin test sessions were not initialized");
    expect(isStrongDistributorPortalPassword(strongPassword)).toBe(true);
    expect(isStrongDistributorPortalPassword(invalidPassword)).toBe(false);
    const storedHash = await hashDistributorPortalPassword(strongPassword);
    expect(storedHash).not.toContain(strongPassword);
    expect(await verifyDistributorPortalPassword(strongPassword, storedHash)).toBe(true);
    expect(await verifyDistributorPortalPassword("Other-Password-2028!", storedHash)).toBe(false);

    await request(app).get("/api/distributor-portal/catalog").expect(401);
    await request(app).post("/api/distributor-portal/session/login")
      .send({ email: fixtureEmails[0], password: strongPassword }).expect(401);
    const denied = await request(app).get("/api/admin/company-orders").expect(401);
    expect(denied.body.error).toContain("Admin");
    await request(app).get(`/api/admin/distributor-portal/accounts/${companyIds[0]}`)
      .set(auth(adminTokens.none)).expect(403);
    const existing = await request(app).get(`/api/admin/distributor-portal/accounts/${companyIds[0]}`)
      .set(auth(adminTokens.view)).expect(200);
    expect(existing.body).toMatchObject({
      companyId: companyIds[0],
      exists: true,
      email: fixtureEmails[0],
      enabled: false,
    });
    const absent = await request(app).get(`/api/admin/distributor-portal/accounts/${companyIds[1]}`)
      .set(auth(adminTokens.view)).expect(200);
    expect(absent.body).toMatchObject({
      companyId: companyIds[1],
      exists: false,
      email: null,
      enabled: null,
      createdAt: null,
      updatedAt: null,
    });
  });

  it("creates and activates a company account with admin edit permission, then issues an opaque session", async () => {
    if (!adminTokens) throw new Error("Admin test sessions were not initialized");
    await request(app).put(`/api/admin/distributor-portal/accounts/${companyIds[0]}`)
      .set(auth(adminTokens.view)).send({ enabled: true, email: fixtureEmails[0], password: strongPassword }).expect(403);
    const created = await request(app).put(`/api/admin/distributor-portal/accounts/${companyIds[0]}`)
      .set(auth(adminTokens.edit)).send({ enabled: true, email: fixtureEmails[0], password: strongPassword }).expect(200);
    expect(created.body).toMatchObject({ companyId: companyIds[0], email: fixtureEmails[0], enabled: true });
    expect(created.body.passwordHash).toBeUndefined();
    const secondAccount = await request(app).put(`/api/admin/distributor-portal/accounts/${companyIds[1]}`)
      .set(auth(adminTokens.edit)).send({ enabled: true, email: fixtureEmails[1], password: strongPassword }).expect(200);
    expect(secondAccount.body).toMatchObject({ companyId: companyIds[1], email: fixtureEmails[1], enabled: true });
    accountIds.push((await db.select({ id: distributorPortalAccountsTable.id }).from(distributorPortalAccountsTable)
      .where(eq(distributorPortalAccountsTable.distributorId, companyIds[1])))[0].id);

    const login = await request(app).post("/api/distributor-portal/session/login")
      .send({ email: fixtureEmails[0].toUpperCase(), password: strongPassword }).expect(200);
    portalTokens = { first: login.body.token, second: "" };
    expect(login.body.company.id).toBe(companyIds[0]);
    expect(login.body.token).toBeTruthy();
    const session = await db.select({ id: distributorPortalSessionsTable.id })
      .from(distributorPortalSessionsTable).where(eq(distributorPortalSessionsTable.accountId, accountIds[0]));
    portalSessionIds.push(...session.map((row) => row.id));
    const current = await request(app).get("/api/distributor-portal/session").set(auth(portalTokens.first)).expect(200);
    expect(current.body.company.id).toBe(companyIds[0]);
    const catalog = await request(app).get("/api/distributor-portal/catalog").set(auth(portalTokens.first)).expect(200);
    const catalogIds = catalog.body.catalog.map((entry: { id: number }) => entry.id);
    expect(catalogIds).toContain(productIds[0]);
    expect(catalogIds).not.toContain(productIds[1]);
    expect(catalog.body.terms).toMatchObject({
      contractId,
      discountPercent: 10,
      creditLimit: 100000,
      creditLimitApproved: true,
    });

    const otherLogin = await request(app).post("/api/distributor-portal/session/login")
      .send({ email: fixtureEmails[1], password: strongPassword }).expect(200);
    portalTokens.second = otherLogin.body.token;
    const otherSessions = await db.select({ id: distributorPortalSessionsTable.id })
      .from(distributorPortalSessionsTable).where(eq(distributorPortalSessionsTable.accountId, accountIds[1]));
    portalSessionIds.push(...otherSessions.map((row) => row.id));
    expect((await request(app).get("/api/distributor-portal/session").set(auth(portalTokens.second)).expect(200))
      .body.company.id).toBe(companyIds[1]);
  });

  it("submits a server-priced immutable snapshot with idempotency and no financial or stock effects", async () => {
    if (!portalTokens) throw new Error("Portal sessions were not initialized");
    const beforeProduct = (await db.select().from(productsTable).where(eq(productsTable.id, productIds[0])))[0];
    const beforeInvoices = await db.select({ id: invoicesTable.id }).from(invoicesTable)
      .where(eq(invoicesTable.distributorId, companyIds[0]));
    const beforeMovements = await db.select({ id: inventoryMovementsTable.id }).from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.productId, productIds[0]));
    const payload = {
      idempotencyKey: `portal-order-${suffix}-first`,
      items: [{ productId: productIds[0], quantity: 2 }],
    };
    const created = await request(app).post("/api/distributor-portal/orders")
      .set(auth(portalTokens.first)).send(payload).expect(201);
    orderIds.push(created.body.id);
    expect(created.body).toMatchObject({
      companyId: companyIds[0],
      status: "pending_review",
      items: [expect.objectContaining({ productId: productIds[0], unitPrice: 100, quantity: 2 })],
      totalAmount: 180,
    });
    const replay = await request(app).post("/api/distributor-portal/orders")
      .set(auth(portalTokens.first)).send(payload).expect(200);
    expect(replay.body.id).toBe(created.body.id);
    await request(app).post("/api/distributor-portal/orders").set(auth(portalTokens.first))
      .send({ ...payload, items: [{ productId: productIds[1], quantity: 2 }] }).expect(409);
    await request(app).post("/api/distributor-portal/orders").set(auth(portalTokens.first))
      .send({ ...payload, items: [{ productId: productIds[0], quantity: 2, unitPrice: 0 }] }).expect(400);

    const ownOrders = await request(app).get("/api/distributor-portal/orders")
      .set(auth(portalTokens.first)).expect(200);
    expect(ownOrders.body.map((order: { id: number }) => order.id)).toContain(created.body.id);
    await request(app).get(`/api/distributor-portal/orders/${created.body.id}`)
      .set(auth(portalTokens.second)).expect(404);
    const otherOrders = await request(app).get("/api/distributor-portal/orders")
      .set(auth(portalTokens.second)).expect(200);
    expect(otherOrders.body).toEqual([]);

    const afterProduct = (await db.select().from(productsTable).where(eq(productsTable.id, productIds[0])))[0];
    const afterInvoices = await db.select({ id: invoicesTable.id }).from(invoicesTable)
      .where(eq(invoicesTable.distributorId, companyIds[0]));
    const afterMovements = await db.select({ id: inventoryMovementsTable.id }).from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.productId, productIds[0]));
    expect(afterProduct.stockQuantity).toBe(beforeProduct.stockQuantity);
    expect(afterInvoices).toEqual(beforeInvoices);
    expect(afterMovements).toEqual(beforeMovements);
  });

  it("blocks review when a company has no explicitly approved current contract credit source", async () => {
    if (!adminTokens || !portalTokens) throw new Error("Portal sessions were not initialized");
    const submitted = await request(app).post("/api/distributor-portal/orders")
      .set(auth(portalTokens.second)).send({
        idempotencyKey: `portal-no-credit-${suffix}-missing`,
        items: [{ productId: productIds[0], quantity: 1 }],
      }).expect(201);
    orderIds.push(submitted.body.id);
    const review = await request(app).get(`/api/admin/company-orders/${submitted.body.id}/review`)
      .set(auth(adminTokens.view)).expect(200);
    expect(review.body.credit.limit).toBeNull();
    expect(review.body.credit.availableBefore).toBeNull();
    expect(review.body.blockReasons.join(" ")).toMatch(/explicitly approved credit limit/i);
    const rejected = await request(app).post(`/api/admin/company-orders/${submitted.body.id}/decision`)
      .set(auth(adminTokens.edit)).send({
        decision: "reject",
        expectedReviewFingerprint: review.body.reviewFingerprint,
        acknowledgeChanges: false,
        reason: "Rejected because no approved credit source exists.",
      }).expect(200);
    expect(rejected.body.order.status).toBe("rejected");
  });

  it("requires separate admin view/edit permissions, current review fingerprints, explicit change acknowledgment and audit reasons", async () => {
    if (!adminTokens || !portalTokens || !orderIds.length) throw new Error("Portal order fixture was not initialized");
    const orderId = orderIds[0];
    await request(app).get("/api/admin/company-orders").set(auth(adminTokens.view)).expect(200);
    await request(app).get(`/api/admin/company-orders/${orderId}/review`)
      .set(auth(adminTokens.view)).expect(200);
    await request(app).post(`/api/admin/company-orders/${orderId}/decision`)
      .set(auth(adminTokens.view)).send({ decision: "reject", expectedReviewFingerprint: "x", reason: "Rejected for test review" }).expect(403);
    const firstReview = await request(app).get(`/api/admin/company-orders/${orderId}/review`)
      .set(auth(adminTokens.view)).expect(200);
    expect(firstReview.body.hasMeaningfulChanges).toBe(false);

    await db.update(productsTable).set({ price: 125 }).where(eq(productsTable.id, productIds[0]));
    const stale = await request(app).post(`/api/admin/company-orders/${orderId}/decision`)
      .set(auth(adminTokens.edit)).send({
        decision: "reject",
        expectedReviewFingerprint: firstReview.body.reviewFingerprint,
        acknowledgeChanges: false,
        reason: "Rejected after changed product price.",
      }).expect(409);
    expect(stale.body.details.review.currentItems[0].unitPrice).toBe(125);
    const changedReview = stale.body.details.review;
    expect(changedReview.hasMeaningfulChanges).toBe(true);
    await request(app).post(`/api/admin/company-orders/${orderId}/decision`)
      .set(auth(adminTokens.edit)).send({
        decision: "reject",
        expectedReviewFingerprint: changedReview.reviewFingerprint,
        acknowledgeChanges: false,
        reason: "Rejected after changed product price.",
      }).expect(409);

    await request(app).post(`/api/admin/company-orders/${orderId}/decision`)
      .set(auth(adminTokens.edit)).send({
        decision: "reject",
        expectedReviewFingerprint: changedReview.reviewFingerprint,
        acknowledgeChanges: true,
        reason: "Rejected after changed product price.",
      }).expect(200);
    const [order] = await db.select().from(companyOrdersTable).where(eq(companyOrdersTable.id, orderId));
    expect(order.status).toBe("rejected");
    expect(order.invoiceId).toBeNull();
    expect(order.reviewedByAdminId).not.toBeNull();
    const [decision] = await db.select().from(companyOrderDecisionsTable)
      .where(eq(companyOrderDecisionsTable.companyOrderId, orderId));
    expect(decision).toMatchObject({
      decision: "reject",
      reason: "Rejected after changed product price.",
      changesAcknowledged: true,
    });
    const invoiceCount = await db.select({ id: invoicesTable.id }).from(invoicesTable)
      .where(eq(invoicesTable.distributorId, companyIds[0]));
    const journalCount = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.sourceType, "company_order"), eq(journalEntriesTable.sourceId, String(orderId))));
    expect(invoiceCount).toEqual([]);
    expect(journalCount).toEqual([]);
    const ownDetails = await request(app).get(`/api/distributor-portal/orders/${orderId}`)
      .set(auth(portalTokens.first)).expect(200);
    expect(ownDetails.body).toMatchObject({
      reviewedByAdminId: expect.any(Number),
      reviewedByName: "Portal editor",
      reviewedAt: expect.any(String),
    });
  });

  it("locks and rechecks approval credit/inventory, atomically retries issuance, and reflects partial collections", async () => {
    if (!adminTokens || !portalTokens) throw new Error("Test sessions were not initialized");
    await db.update(distributorContractsTable).set({ creditLimit: "225.00" })
      .where(eq(distributorContractsTable.id, contractId));
    const submitted = await request(app).post("/api/distributor-portal/orders")
      .set(auth(portalTokens.first)).send({
        idempotencyKey: `portal-approval-${suffix}-exact`,
        items: [{ productId: productIds[0], quantity: 2 }],
      }).expect(201);
    orderIds.push(submitted.body.id);
    const exactReview = await request(app).get(`/api/admin/company-orders/${submitted.body.id}/review`)
      .set(auth(adminTokens.view)).expect(200);
    expect(exactReview.body.currentTotals.totalAmount).toBe(225);
    expect(exactReview.body.credit).toMatchObject({ limit: 225, outstanding: 0, availableAfter: 0 });
    expect(exactReview.body.blockReasons).not.toEqual(expect.arrayContaining([expect.stringMatching(/credit limit/i)]));

    // Hold the product row across the approval request, change stock while the
    // reviewer waits, then verify that the refreshed locked read invalidates
    // the stale fingerprint and prevents an invoice from being issued.
    let signalProductLock!: () => void;
    let releaseStockUpdate!: () => void;
    const productLockAcquired = new Promise<void>((resolve) => { signalProductLock = resolve; });
    const updateMayCommit = new Promise<void>((resolve) => { releaseStockUpdate = resolve; });
    const inventoryMutation = db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${productsTable} where id = ${productIds[0]} for update`);
      signalProductLock();
      await updateMayCommit;
      await tx.update(productsTable).set({ stockQuantity: 1 }).where(eq(productsTable.id, productIds[0]));
    });
    await productLockAcquired;
    const pendingDecision = request(app).post(`/api/admin/company-orders/${submitted.body.id}/decision`)
      .set(auth(adminTokens.edit)).send({
        decision: "approve",
        expectedReviewFingerprint: exactReview.body.reviewFingerprint,
        acknowledgeChanges: false,
      });
    const decisionResponse = pendingDecision.then((response) => response);
    let waitingOnLockedProduct = false;
    for (let attempt = 0; attempt < 100 && !waitingOnLockedProduct; attempt += 1) {
      const waitState = await db.execute(sql`
        select exists (
          select 1 from pg_stat_activity
          where wait_event_type = 'Lock'
            and query ilike '%for update%'
            and query ilike '%storefront_products%'
        ) as waiting
      `);
      waitingOnLockedProduct = Boolean(waitState.rows[0]?.waiting);
      if (!waitingOnLockedProduct) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    releaseStockUpdate();
    await inventoryMutation;
    expect(waitingOnLockedProduct).toBe(true);
    const inventoryRace = await decisionResponse;
    expect(inventoryRace.status).toBe(409);
    expect(inventoryRace.body.details.review.blockReasons.join(" ")).toMatch(/Insufficient stock/);
    await db.update(productsTable).set({ stockQuantity: 20 }).where(eq(productsTable.id, productIds[0]));
    const refreshed = await request(app).get(`/api/admin/company-orders/${submitted.body.id}/review`)
      .set(auth(adminTokens.view)).expect(200);
    expect(refreshed.body.hasMeaningfulChanges).toBe(false);
    expect(refreshed.body.blockReasons).toEqual([]);

    // Fail inside the shared transaction at the invoice configuration boundary:
    // no order decision, invoice, stock movement, or ledger survives the failure.
    const failedIssue = await (async () => {
      delete process.env.VAT_SELLER_LEGAL_NAME;
      delete process.env.VAT_REGISTRATION_NUMBER;
      try {
        return await request(app).post(`/api/admin/company-orders/${submitted.body.id}/decision`)
          .set(auth(adminTokens.edit)).send({
            decision: "approve",
            expectedReviewFingerprint: refreshed.body.reviewFingerprint,
            acknowledgeChanges: true,
          });
      } finally {
        restoreVatConfiguration();
      }
    })();
    expect([409, 503]).toContain(failedIssue.status);
    expect(failedIssue.body.error).toEqual(expect.any(String));
    const [afterRollback] = await db.select().from(companyOrdersTable)
      .where(eq(companyOrdersTable.id, submitted.body.id));
    expect(afterRollback.status).toBe("pending_review");
    expect(afterRollback.invoiceId).toBeNull();
    expect(await db.select({ id: invoicesTable.id }).from(invoicesTable)
      .where(eq(invoicesTable.distributorId, companyIds[0]))).toEqual([]);
    expect(await db.select().from(companyOrderDecisionsTable)
      .where(eq(companyOrderDecisionsTable.companyOrderId, submitted.body.id))).toEqual([]);

    const approvalBody = {
      decision: "approve",
      expectedReviewFingerprint: refreshed.body.reviewFingerprint,
      acknowledgeChanges: true,
    };
    const [approvalA, approvalB] = await (async () => {
      process.env.VAT_SELLER_LEGAL_NAME = "Musk Ellolo Portal Test";
      process.env.VAT_REGISTRATION_NUMBER = "300000000000003";
      try {
        return await Promise.all([
          request(app).post(`/api/admin/company-orders/${submitted.body.id}/decision`)
            .set(auth(adminTokens.edit)).send(approvalBody),
          request(app).post(`/api/admin/company-orders/${submitted.body.id}/decision`)
            .set(auth(adminTokens.edit)).send(approvalBody),
        ]);
      } finally {
        restoreVatConfiguration();
      }
    })();
    expect(approvalA.status, JSON.stringify(approvalA.body)).toBe(200);
    expect(approvalB.status, JSON.stringify(approvalB.body)).toBe(200);
    expect(approvalA.body.invoiceId).toBe(approvalB.body.invoiceId);
    const invoiceId = approvalA.body.invoiceId as number;
    expect(invoiceId).toBeGreaterThan(0);
    const [approvedOrder] = await db.select().from(companyOrdersTable)
      .where(eq(companyOrdersTable.id, submitted.body.id));
    expect(approvedOrder).toMatchObject({ status: "approved", invoiceId });
    expect(await db.select({ id: invoicesTable.id }).from(invoicesTable)
      .where(eq(invoicesTable.distributorId, companyIds[0]))).toHaveLength(1);
    const [stockAfterIssue] = await db.select({ quantity: productsTable.stockQuantity })
      .from(productsTable).where(eq(productsTable.id, productIds[0]));
    expect(stockAfterIssue.quantity).toBe(18);
    expect(await db.select().from(companyOrderDecisionsTable)
      .where(eq(companyOrderDecisionsTable.companyOrderId, submitted.body.id))).toHaveLength(1);

    const paymentDate = saudiCalendarDate(new Date());
    await createReceivablePayment(invoiceId, {
      paymentKey: `portal-partial-payment-${suffix}`,
      paymentDate,
      amount: 112.5,
      paymentMethod: "bank_transfer",
    }, editAdminId);
    const withinLimit = await request(app).post("/api/distributor-portal/orders")
      .set(auth(portalTokens.first)).send({
        idempotencyKey: `portal-approval-${suffix}-partial`,
        items: [{ productId: productIds[0], quantity: 1 }],
      }).expect(201);
    orderIds.push(withinLimit.body.id);
    const withinReview = await request(app).get(`/api/admin/company-orders/${withinLimit.body.id}/review`)
      .set(auth(adminTokens.view)).expect(200);
    expect(withinReview.body.currentTotals.totalAmount).toBe(112.5);
    expect(withinReview.body.credit).toMatchObject({
      limit: 225,
      outstanding: 112.5,
      availableBefore: 112.5,
      availableAfter: 0,
    });
    expect(withinReview.body.blockReasons).not.toEqual(expect.arrayContaining([expect.stringMatching(/credit limit/i)]));

    const overLimit = await request(app).post("/api/distributor-portal/orders")
      .set(auth(portalTokens.first)).send({
        idempotencyKey: `portal-approval-${suffix}-over`,
        items: [{ productId: productIds[0], quantity: 2 }],
      }).expect(201);
    orderIds.push(overLimit.body.id);
    const overReview = await request(app).get(`/api/admin/company-orders/${overLimit.body.id}/review`)
      .set(auth(adminTokens.view)).expect(200);
    expect(overReview.body.credit).toMatchObject({ outstanding: 112.5, availableBefore: 112.5, availableAfter: -112.5 });
    expect(overReview.body.blockReasons.join(" ")).toMatch(/credit limit exceeded/i);

    await db.update(distributorContractsTable).set({ creditLimit: "0.00" })
      .where(eq(distributorContractsTable.id, contractId));
    const zeroLimitReview = await request(app).get(`/api/admin/company-orders/${withinLimit.body.id}/review`)
      .set(auth(adminTokens.view)).expect(200);
    expect(zeroLimitReview.body.credit.limit).toBe(0);
    expect(zeroLimitReview.body.blockReasons.join(" ")).toMatch(/credit limit exceeded/i);
    await createReceivablePayment(invoiceId, {
      paymentKey: `portal-final-payment-${suffix}`,
      paymentDate,
      amount: 112.5,
      paymentMethod: "bank_transfer",
    }, editAdminId);
    const fullyCollectedReview = await request(app).get(`/api/admin/company-orders/${withinLimit.body.id}/review`)
      .set(auth(adminTokens.view)).expect(200);
    expect(fullyCollectedReview.body.credit.outstanding).toBe(0);
    expect(fullyCollectedReview.body.credit.limit).toBe(0);
    expect(fullyCollectedReview.body.blockReasons.join(" ")).toMatch(/credit limit exceeded/i);
  });

  it("revokes all active sessions when an account is disabled and requires strong replacement passwords", async () => {
    if (!adminTokens || !portalTokens) throw new Error("Test sessions were not initialized");
    await request(app).put(`/api/admin/distributor-portal/accounts/${companyIds[0]}`)
      .set(auth(adminTokens.edit)).send({ enabled: true, password: invalidPassword }).expect(400);
    const revoked = await request(app).put(`/api/admin/distributor-portal/accounts/${companyIds[0]}`)
      .set(auth(adminTokens.edit)).send({ enabled: false }).expect(200);
    expect(revoked.body.enabled).toBe(false);
    const [pendingOrder] = await db.select().from(companyOrdersTable)
      .where(and(eq(companyOrdersTable.distributorId, companyIds[0]), eq(companyOrdersTable.status, "pending_review"))).limit(1);
    const disabledReview = await request(app).get(`/api/admin/company-orders/${pendingOrder.id}/review`)
      .set(auth(adminTokens.view)).expect(200);
    expect(disabledReview.body.blockReasons).toContain("Distributor portal access is disabled for this company.");
    await request(app).post(`/api/admin/company-orders/${pendingOrder.id}/decision`)
      .set(auth(adminTokens.edit)).send({
        decision: "approve", expectedReviewFingerprint: disabledReview.body.reviewFingerprint, acknowledgeChanges: true,
      }).expect(409);
    await request(app).get("/api/distributor-portal/session").set(auth(portalTokens.first)).expect(401);
    const sessionCount = await db.select({ id: distributorPortalSessionsTable.id })
      .from(distributorPortalSessionsTable).where(eq(distributorPortalSessionsTable.accountId, accountIds[0]));
    expect(sessionCount).toEqual([]);
    await request(app).post(`/api/admin/distributor-portal/accounts/${companyIds[0]}/revoke-sessions`)
      .set(auth(adminTokens.edit)).expect(200);
  });
});