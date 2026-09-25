import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, gt } from "drizzle-orm";
import {
  adminUsersTable,
  customersTable,
  db,
  inventoryBalancesTable,
  inventoryMovementsTable,
  operationEventsTable,
  orderItemsTable,
  orderPaymentLinksTable,
  ordersTable,
  productsTable,
} from "@workspace/db";
import {
  cancelUnpaidMoyasarOrder,
  confirmMoyasarInvoice,
  issueOrderPaymentLink,
  PaymentLinkError,
} from "./moyasar-payment-links";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let nextFixture = 0;
const fixtureIds: Array<{ customerId: number; orderId: number }> = [];
const inventorySnapshots: Array<{
  productId: number;
  stockQuantity: number;
  averageCost: string;
  balances: Array<typeof inventoryBalancesTable.$inferSelect>;
}> = [];
const envKeys = [
  "MOYASAR_SECRET_KEY",
  "MOYASAR_CALLBACK_URL",
  "RESEND_API_KEY",
  "INVOICE_FROM_EMAIL",
] as const;
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

const invoiceId = "123e4567-e89b-12d3-a456-426614174000";
const paymentUrl = "https://checkout.moyasar.com/test-payment";

function providerInvoice(overrides: Partial<{
  id: string;
  status: string;
  amount: number;
  currency: string;
  url: string;
  expired_at: string;
  description: string;
}> = {}) {
  return {
    id: invoiceId,
    status: "initiated",
    amount: 11500,
    currency: "SAR",
    url: paymentUrl,
    expired_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    description: "Order MPL-TEST",
    ...overrides,
  };
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init)));
}

async function createOrder(options: {
  email?: string | null;
  status?: string;
  paymentStatus?: string;
} = {}) {
  nextFixture += 1;
  const [customer] = await db.insert(customersTable).values({
    phone: `+9665${runId.replace(/\D/g, "").slice(-8)}${String(nextFixture).padStart(3, "0")}`,
    name: "Moyasar payment-link test",
    email: options.email === undefined ? "payment-links@example.com" : options.email,
  }).returning({ id: customersTable.id });
  const orderNumber = `MPL-${runId}-${nextFixture}`;
  const [order] = await db.insert(ordersTable).values({
    userId: customer.id,
    orderNumber,
    subtotal: 100,
    shippingCost: 0,
    discount: 0,
    tax: 15,
    total: 115,
    status: options.status ?? "pending_payment",
    paymentStatus: options.paymentStatus ?? "pending",
    address: "{}",
    shippingMethod: "regular",
    paymentMethod: "moyasar",
  }).returning({ id: ordersTable.id });
  fixtureIds.push({ customerId: customer.id, orderId: order.id });
  return { customerId: customer.id, id: order.id, orderNumber };
}

async function addPaymentLink(orderId: number, id = invoiceId) {
  await db.insert(orderPaymentLinksTable).values({
    orderId,
    providerInvoiceId: id,
    paymentUrl,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    emailStatus: "sent",
  });
}

async function addFulfilledStock(orderId: number) {
  const [product] = await db.select({
    id: productsTable.id,
    stockQuantity: productsTable.stockQuantity,
    averageCost: productsTable.averageCost,
  }).from(productsTable).where(gt(productsTable.stockQuantity, 0)).limit(1);
  if (!product) throw new Error("Cancellation inventory test requires a stocked product");
  const balances = await db.select().from(inventoryBalancesTable)
    .where(eq(inventoryBalancesTable.productId, product.id));
  inventorySnapshots.push({
    productId: product.id,
    stockQuantity: product.stockQuantity,
    averageCost: product.averageCost,
    balances,
  });
  await db.update(productsTable).set({ stockQuantity: product.stockQuantity - 1 })
    .where(eq(productsTable.id, product.id));
  await db.insert(orderItemsTable).values({
    orderId,
    productId: product.id,
    productName: "Moyasar cancellation inventory fixture",
    quantity: 1,
    unitPrice: 10,
    totalPrice: 10,
    costSnapshot: product.averageCost,
  });
  await db.insert(inventoryMovementsTable).values({
    productId: product.id,
    movementType: "decrease",
    quantityChange: -1,
    quantityBefore: product.stockQuantity,
    quantityAfter: product.stockQuantity - 1,
    reason: `Fulfillment fixture ${orderId}`,
    unitCost: product.averageCost,
    totalCost: product.averageCost,
    sourceType: "order",
    sourceId: String(orderId),
    eventKey: `moyasar-cancel-fulfillment:${orderId}`,
  });
  return product;
}

function configureProviderAndEmail() {
  process.env.MOYASAR_SECRET_KEY = "test-secret";
  process.env.MOYASAR_CALLBACK_URL = "https://shop.example.com/api/payments/moyasar/callback";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.INVOICE_FROM_EMAIL = "orders@example.com";
}

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const key of envKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const { customerId, orderId } of fixtureIds.splice(0)) {
    await db.delete(inventoryMovementsTable).where(eq(inventoryMovementsTable.sourceId, String(orderId)));
    await db.delete(operationEventsTable).where(eq(operationEventsTable.sourceId, String(orderId)));
    await db.delete(orderPaymentLinksTable).where(eq(orderPaymentLinksTable.orderId, orderId));
    await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
    await db.delete(customersTable).where(eq(customersTable.id, customerId));
  }
  for (const snapshot of inventorySnapshots.splice(0)) {
    await db.update(productsTable).set({
      stockQuantity: snapshot.stockQuantity,
      averageCost: snapshot.averageCost,
    }).where(eq(productsTable.id, snapshot.productId));
    await db.delete(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, snapshot.productId));
    if (snapshot.balances.length) await db.insert(inventoryBalancesTable).values(snapshot.balances);
  }
});

describe.sequential("Moyasar payment links", () => {
  it("creates the provider invoice, records an email failure, and retries the same live link", async () => {
    configureProviderAndEmail();
    const order = await createOrder();
    let createRequests = 0;
    let fetchInvoiceRequests = 0;
    let emailRequests = 0;
    mockFetch((url, init) => {
      if (url === "https://api.moyasar.com/v1/invoices" && init?.method === "POST") {
        createRequests += 1;
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({
          amount: 11500,
          currency: "SAR",
          description: `Order ${order.orderNumber}`,
          callback_url: process.env.MOYASAR_CALLBACK_URL,
        });
        return Response.json(providerInvoice({ description: `Order ${order.orderNumber}` }));
      }
      if (url === `https://api.moyasar.com/v1/invoices/${invoiceId}`) {
        fetchInvoiceRequests += 1;
        return Response.json(providerInvoice({
          description: `Order ${order.orderNumber}`,
        }));
      }
      if (url === "https://api.resend.com/emails") {
        emailRequests += 1;
        const email = JSON.parse(String(init?.body));
        expect(email).toMatchObject({
          to: ["payment-links@example.com"],
          html: expect.stringContaining(paymentUrl),
        });
        return emailRequests === 1
          ? new Response("temporary email outage", { status: 503 })
          : new Response("", { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const first = await issueOrderPaymentLink(order.id);
    expect(first).toMatchObject({ sent: false, status: "failed" });
    const [failedLink] = await db.select().from(orderPaymentLinksTable)
      .where(eq(orderPaymentLinksTable.orderId, order.id));
    expect(failedLink).toMatchObject({
      providerInvoiceId: invoiceId,
      paymentUrl,
      emailStatus: "failed",
      emailError: "Email provider returned 503",
    });

    const retry = await issueOrderPaymentLink(order.id);
    expect(retry).toMatchObject({ sent: true, status: "sent" });
    const [sentLink] = await db.select().from(orderPaymentLinksTable)
      .where(eq(orderPaymentLinksTable.orderId, order.id));
    expect(sentLink).toMatchObject({
      providerInvoiceId: invoiceId,
      paymentUrl,
      emailStatus: "sent",
      emailError: null,
    });
    expect(createRequests).toBe(1);
    expect(fetchInvoiceRequests).toBe(1);
    expect(emailRequests).toBe(2);
  });

  it("reuses one provider invoice when concurrent requests create links for the same order", async () => {
    configureProviderAndEmail();
    const order = await createOrder();
    let createRequests = 0;
    let fetchInvoiceRequests = 0;
    mockFetch((url, init) => {
      if (url === "https://api.moyasar.com/v1/invoices" && init?.method === "POST") {
        createRequests += 1;
        return Response.json(providerInvoice({ description: `Order ${order.orderNumber}` }));
      }
      if (url === `https://api.moyasar.com/v1/invoices/${invoiceId}`) {
        fetchInvoiceRequests += 1;
        return Response.json(providerInvoice({ description: `Order ${order.orderNumber}` }));
      }
      if (url === "https://api.resend.com/emails") return new Response("", { status: 200 });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const results = await Promise.all([
      issueOrderPaymentLink(order.id),
      issueOrderPaymentLink(order.id),
    ]);
    expect(results.every((result) => result.sent)).toBe(true);
    expect(createRequests).toBe(1);
    expect(fetchInvoiceRequests).toBe(1);
    const links = await db.select().from(orderPaymentLinksTable)
      .where(eq(orderPaymentLinksTable.orderId, order.id));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ providerInvoiceId: invoiceId, emailStatus: "sent" });
  });

  it("accepts a trusted paid-provider duplicate without posting payment again", async () => {
    configureProviderAndEmail();
    const order = await createOrder({ status: "pending_review", paymentStatus: "paid" });
    await addPaymentLink(order.id);
    let requests = 0;
    mockFetch((url, init) => {
      requests += 1;
      expect(url).toBe(`https://api.moyasar.com/v1/invoices/${invoiceId}`);
      expect((init?.headers as Record<string, string>).Authorization)
        .toBe(`Basic ${Buffer.from("test-secret:").toString("base64")}`);
      return Response.json(providerInvoice({
        status: "paid",
        description: `Order ${order.orderNumber}`,
      }));
    });

    await expect(confirmMoyasarInvoice(invoiceId)).resolves.toEqual({
      accepted: true,
      duplicate: true,
    });
    expect(requests).toBe(1);
    const [unchangedOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
    expect(unchangedOrder).toMatchObject({ status: "pending_review", paymentStatus: "paid" });
  });

  it("rejects a provider-paid callback when the verified amount differs from the order", async () => {
    configureProviderAndEmail();
    const order = await createOrder();
    await addPaymentLink(order.id);
    mockFetch((url) => {
      expect(url).toBe(`https://api.moyasar.com/v1/invoices/${invoiceId}`);
      return Response.json(providerInvoice({
        status: "paid",
        amount: 11499,
        description: `Order ${order.orderNumber}`,
      }));
    });

    await expect(confirmMoyasarInvoice(invoiceId))
      .rejects.toThrow("Invoice does not match order");
    const [unchangedOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
    expect(unchangedOrder).toMatchObject({ status: "pending_payment", paymentStatus: "pending" });
  });

  it("blocks link issuance and a paid callback after cancellation", async () => {
    configureProviderAndEmail();
    const order = await createOrder({ status: "cancelled" });
    await addPaymentLink(order.id);
    const fetchMock = vi.fn(() => {
      return Promise.resolve(Response.json(providerInvoice({
        status: "paid",
        description: `Order ${order.orderNumber}`,
      })));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(issueOrderPaymentLink(order.id))
      .rejects.toBeInstanceOf(PaymentLinkError);
    await expect(confirmMoyasarInvoice(invoiceId))
      .rejects.toThrow("Order is no longer payable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels an emailed initiated invoice and restores fulfilled stock", async () => {
    configureProviderAndEmail();
    const order = await createOrder();
    const [actor] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).limit(1);
    if (!actor) throw new Error("Cancellation tests require a seeded administrator");
    await addPaymentLink(order.id);
    const product = await addFulfilledStock(order.id);
    const calls: Array<{ url: string; method?: string }> = [];
    mockFetch((url, init) => {
      calls.push({ url, method: init?.method });
      if (url === `https://api.moyasar.com/v1/invoices/${invoiceId}`) {
        return Response.json(providerInvoice({ description: `Order ${order.orderNumber}` }));
      }
      if (url === `https://api.moyasar.com/v1/invoices/${invoiceId}/cancel`) {
        return Response.json(providerInvoice({
          status: "canceled",
          description: `Order ${order.orderNumber}`,
        }));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await cancelUnpaidMoyasarOrder(order.id, actor.id);
    expect(result).toMatchObject({ status: "cancelled", paymentStatus: "pending" });
    expect(calls).toEqual([
      { url: `https://api.moyasar.com/v1/invoices/${invoiceId}`, method: undefined },
      { url: `https://api.moyasar.com/v1/invoices/${invoiceId}/cancel`, method: "PUT" },
    ]);
    const [updatedProduct] = await db.select({
      stockQuantity: productsTable.stockQuantity,
    }).from(productsTable).where(eq(productsTable.id, product.id));
    expect(updatedProduct.stockQuantity).toBe(product.stockQuantity);
    const [restock] = await db.select().from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.eventKey, `sale-cancellation:${order.id}:${product.id}`));
    expect(restock).toMatchObject({
      movementType: "increase",
      quantityChange: 1,
      sourceType: "order_cancellation",
      sourceId: String(order.id),
    });
  });

  it("cancels a failed-email link through the provider", async () => {
    configureProviderAndEmail();
    const order = await createOrder();
    const [actor] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).limit(1);
    if (!actor) throw new Error("Cancellation tests require a seeded administrator");
    await db.insert(orderPaymentLinksTable).values({
      orderId: order.id,
      providerInvoiceId: invoiceId,
      paymentUrl,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      emailStatus: "failed",
      emailError: "Email provider returned 503",
    });
    const calls: string[] = [];
    mockFetch((url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return Response.json(providerInvoice({
        status: url.endsWith("/cancel") ? "canceled" : "initiated",
        description: `Order ${order.orderNumber}`,
      }));
    });

    const result = await cancelUnpaidMoyasarOrder(order.id, actor.id);
    expect(result?.status).toBe("cancelled");
    expect(calls).toEqual([
      `GET https://api.moyasar.com/v1/invoices/${invoiceId}`,
      `PUT https://api.moyasar.com/v1/invoices/${invoiceId}/cancel`,
    ]);
  });

  it("cancels an expired provider invoice without sending a cancel request", async () => {
    configureProviderAndEmail();
    const order = await createOrder();
    const [actor] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).limit(1);
    if (!actor) throw new Error("Cancellation tests require a seeded administrator");
    await addPaymentLink(order.id);
    const calls: string[] = [];
    mockFetch((url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return Response.json(providerInvoice({
        status: "expired",
        description: `Order ${order.orderNumber}`,
      }));
    });

    const result = await cancelUnpaidMoyasarOrder(order.id, actor.id);
    expect(result?.status).toBe("cancelled");
    expect(calls).toEqual([`GET https://api.moyasar.com/v1/invoices/${invoiceId}`]);
  });

  it("refuses cancellation when the provider invoice is paid", async () => {
    configureProviderAndEmail();
    const order = await createOrder();
    const [actor] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).limit(1);
    if (!actor) throw new Error("Cancellation tests require a seeded administrator");
    await addPaymentLink(order.id);
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(providerInvoice({
      status: "paid",
      description: `Order ${order.orderNumber}`,
    }))));
    vi.stubGlobal("fetch", fetchMock);

    await expect(cancelUnpaidMoyasarOrder(order.id, actor.id))
      .rejects.toThrow("Invoice has been paid");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [unchangedOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
    expect(unchangedOrder).toMatchObject({ status: "pending_payment", paymentStatus: "pending" });
  });
});