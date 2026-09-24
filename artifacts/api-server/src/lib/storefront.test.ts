import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { and, eq, inArray } from "drizzle-orm";
import {
  customersTable,
  db,
  inventoryBalancesTable,
  inventoryMovementsTable,
  invoicesTable,
  journalEntriesTable,
  orderAddressesTable,
  ordersTable,
  productsTable,
  shipmentsTable,
} from "@workspace/db";
import {
  addAddress,
  addToCart,
  completeStorefrontPayment,
  createOrderForUser,
  getAddresses,
  getCartForUser,
  getOrder,
  getOrders,
  getQuote,
  issueToken,
  removeCartItem,
  requestDevelopmentOtp,
  updateCartItem,
  verifyDevelopmentOtp,
} from "./storefront";

const phones: string[] = [];
const movementReasons: string[] = [];
const productSnapshots = new Map<number, { stockQuantity: number; price: number }>();
const balanceSnapshots = new Map<number, Array<typeof inventoryBalancesTable.$inferSelect>>();
let originalCatalogStock: Array<{ id: number; stockQuantity: number }> = [];

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `storefront-accounting-${Date.now()}@example.com`;
  process.env.ADMIN_PASSWORD = "storefront-accounting-password";
  originalCatalogStock = await db.select({ id: productsTable.id, stockQuantity: productsTable.stockQuantity })
    .from(productsTable).where(inArray(productsTable.id, [1, 2, 3, 4]));
  await db.update(productsTable).set({ stockQuantity: 100 }).where(inArray(productsTable.id, [1, 2, 3, 4]));
});

afterAll(async () => {
  for (const product of originalCatalogStock) {
    await db.update(productsTable).set({ stockQuantity: product.stockQuantity }).where(eq(productsTable.id, product.id));
  }
});

async function createUser(suffix: string) {
  const phone = `+9665000${Date.now()}${suffix}`;
  phones.push(phone);
  await requestDevelopmentOtp(phone);
  const user = await verifyDevelopmentOtp(phone, "123456");
  if (!user) throw new Error("Test customer was not created");
  return user;
}

afterEach(async () => {
  if (movementReasons.length > 0) {
    await db.delete(inventoryMovementsTable).where(inArray(inventoryMovementsTable.reason, movementReasons));
  }
  if (phones.length > 0) {
    const users = await db.select({ id: customersTable.id }).from(customersTable).where(inArray(customersTable.phone, phones));
    const ids = users.map(({ id }) => id);
    if (ids.length > 0) {
      const orders = await db.select({ id: ordersTable.id }).from(ordersTable).where(inArray(ordersTable.userId, ids));
      const orderIds = orders.map(({ id }) => id);
      if (orderIds.length > 0) {
        await db.delete(invoicesTable).where(inArray(invoicesTable.orderId, orderIds));
      }
      await db.delete(ordersTable).where(inArray(ordersTable.userId, ids));
      await db.delete(customersTable).where(inArray(customersTable.id, ids));
    }
  }
  for (const [productId, snapshot] of productSnapshots) {
    await db.update(productsTable).set(snapshot).where(eq(productsTable.id, productId));
    await db.delete(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, productId));
    const balances = balanceSnapshots.get(productId) ?? [];
    if (balances.length) await db.insert(inventoryBalancesTable).values(balances);
  }
  phones.length = 0;
  movementReasons.length = 0;
  productSnapshots.clear();
  balanceSnapshots.clear();
});

describe.sequential("persistent storefront carts and orders", () => {
  it("persists cart changes and prevents another customer from changing them", async () => {
    const owner = await createUser("1");
    const other = await createUser("2");

    const added = await addToCart(owner.id, 1, 2);
    expect(added?.itemCount).toBe(2);
    const itemId = added!.items[0]!.id;

    expect((await getCartForUser(owner.id)).items[0]?.quantity).toBe(2);
    expect((await getCartForUser(other.id)).items).toEqual([]);
    expect(await updateCartItem(other.id, itemId, 5)).toBeNull();
    await removeCartItem(other.id, itemId);
    expect((await getCartForUser(owner.id)).items[0]?.quantity).toBe(2);
  });

  it("atomically snapshots an order, clears only its owner's cart, and isolates reads", async () => {
    const owner = await createUser("3");
    const other = await createUser("4");
    const [orderedProduct] = await db.select({
      stockQuantity: productsTable.stockQuantity,
      price: productsTable.price,
    })
      .from(productsTable).where(eq(productsTable.id, 2)).limit(1);
    productSnapshots.set(2, orderedProduct);
    balanceSnapshots.set(2, await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, 2)));
    await addToCart(owner.id, 2, 1);
    await addToCart(other.id, 3, 1);

    const order = await createOrderForUser(owner.id, {
      address: {
        label: "المنزل",
        city: "الرياض",
        district: "العليا",
        street: "الملك فهد",
        buildingNo: "10",
        additionalInfo: null,
        isDefault: false,
      },
      shippingMethod: "regular",
      paymentMethod: "moyasar",
    });
    movementReasons.push(`Order ${order!.orderNumber}`);

    expect(order?.orderNumber).toMatch(/^L-[0-9]+$/);
    expect((await getOrder(owner.id, order!.orderNumber))?.orderNumber).toBe(order!.orderNumber);
    expect(order?.items).toHaveLength(1);
    const [addressSnapshot] = await db
      .select()
      .from(orderAddressesTable)
      .where(eq(orderAddressesTable.orderId, order!.id));
    expect(addressSnapshot).toMatchObject({
      label: "المنزل",
      city: "الرياض",
      district: "العليا",
      street: "الملك فهد",
      buildingNo: "10",
      additionalInfo: null,
    });
    expect((await getCartForUser(owner.id)).items).toEqual([]);
    expect((await getCartForUser(other.id)).itemCount).toBe(1);
    expect((await getOrders(owner.id)).map(({ orderNumber }) => orderNumber)).toContain(order!.orderNumber);
    expect(await getOrder(other.id, order!.orderNumber)).toBeNull();
    expect(await getOrders(other.id)).toEqual([]);
  });

  it("allocates distinct numeric order references for concurrent customers", async () => {
    const first = await createUser("7");
    const second = await createUser("8");
    const [product] = await db.select({
      stockQuantity: productsTable.stockQuantity, price: productsTable.price,
    }).from(productsTable).where(eq(productsTable.id, 2));
    productSnapshots.set(2, product);
    balanceSnapshots.set(2, await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, 2)));
    await Promise.all([addToCart(first.id, 2, 1), addToCart(second.id, 2, 1)]);
    const details = {
      address: { label: "Home", city: "Riyadh", district: "Olaya", street: "Main", buildingNo: "10", additionalInfo: null, isDefault: false },
      shippingMethod: "regular", paymentMethod: "card",
    };
    const [one, two] = await Promise.all([
      createOrderForUser(first.id, details),
      createOrderForUser(second.id, details),
    ]);
    expect(one?.orderNumber).toMatch(/^L-[0-9]+$/);
    expect(two?.orderNumber).toMatch(/^L-[0-9]+$/);
    expect(one?.orderNumber).not.toBe(two?.orderNumber);
    movementReasons.push(`Order ${one!.orderNumber}`, `Order ${two!.orderNumber}`);
  });

  it("uses the shared atomic transition for a trusted storefront payment completion", async () => {
    const owner = await createUser("6");
    const [orderedProduct] = await db.select({
      stockQuantity: productsTable.stockQuantity,
      price: productsTable.price,
    })
      .from(productsTable).where(eq(productsTable.id, 4)).limit(1);
    productSnapshots.set(4, orderedProduct);
    balanceSnapshots.set(4, await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, 4)));
    await db.update(productsTable).set({ price: 4.99 }).where(eq(productsTable.id, 4));
    await addToCart(owner.id, 4, 7);

    const environment = {
      VAT_SELLER_LEGAL_NAME: "مؤسسة مسك اللولو للتجارة",
      VAT_REGISTRATION_NUMBER: "300000000000003",
    };
    const order = await createOrderForUser(owner.id, {
      address: {
        label: "المنزل",
        city: "الرياض",
        district: "العليا",
        street: "الملك فهد",
        buildingNo: "10",
        additionalInfo: null,
        isDefault: false,
      },
      shippingMethod: "regular",
      paymentMethod: "moyasar",
    }, null, { confirmedByProvider: true, environment });

    expect(order?.paymentStatus).toBe("paid");
    expect(order?.subtotal).toBeCloseTo(34.93, 2);
    await completeStorefrontPayment(owner.id, order!.orderNumber, environment);
    const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, order!.id));
    expect(invoices).toHaveLength(1);
    const journals = await db.select().from(journalEntriesTable).where(and(
      eq(journalEntriesTable.sourceType, "order"),
      eq(journalEntriesTable.sourceId, String(order!.id)),
    ));
    expect(journals).toHaveLength(1);
    expect(journals[0]?.status).toBe("posted");
  });

  it.each([
    ["regular", 28],
    ["refrigerated", 33],
  ])("quotes and persists %s shipping at %i SAR with VAT included", async (method, price) => {
    const owner = await createUser(method);
    const [product] = await db.select({ stockQuantity: productsTable.stockQuantity, price: productsTable.price })
      .from(productsTable).where(eq(productsTable.id, 1));
    productSnapshots.set(1, product);
    balanceSnapshots.set(1, await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, 1)));
    await addToCart(owner.id, 1, 1);
    const riyadh = await getQuote(owner.id, "الرياض", method);
    const jeddah = await getQuote(owner.id, "Jeddah", method);
    expect(riyadh).toEqual(jeddah);
    expect(riyadh.shippingCost).toBe(price);
    expect(riyadh.total).toBeCloseTo(product.price + price, 2);
    expect(riyadh.tax).toBe(Math.round(Math.round((product.price + price) * 100) * 15 / 115) / 100);
    const order = await createOrderForUser(owner.id, {
      address: { label: "Home", city: "Jeddah", district: "Center", street: "Main", buildingNo: "1", additionalInfo: null, isDefault: false },
      shippingMethod: method,
      paymentMethod: "moyasar",
    });
    movementReasons.push(`Order ${order!.orderNumber}`);
    expect(order).toMatchObject({ shippingCost: price, total: riyadh.total, tax: riyadh.tax });
    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.orderId, order!.id));
    expect(shipment).toMatchObject({ serviceMethod: method, collectedCost: price });
  });

  it("rejects unsupported shipping before consuming a cart", async () => {
    const owner = await createUser("invalid");
    await addToCart(owner.id, 1, 1);
    const authorization = `Bearer ${issueToken(owner.id)}`;
    const address = { label: "Home", city: "Riyadh", district: "Center", street: "Main", buildingNo: "1" };
    await request(app).post("/api/checkout/quote").set("Authorization", authorization)
      .send({ city: "Riyadh" }).expect(400);
    await request(app).post("/api/checkout/quote").set("Authorization", authorization)
      .send({ city: "Riyadh", shippingMethod: "unknown" }).expect(400);
    await request(app).post("/api/orders").set("Authorization", authorization)
      .send({ address, shippingMethod: "unknown", paymentMethod: "moyasar" }).expect(400);
    await expect(getQuote(owner.id, "Riyadh", "unknown")).rejects.toThrow(/Invalid individual shipping method/);
    await expect(createOrderForUser(owner.id, {
      address: { label: "Home", city: "Riyadh", district: "Center", street: "Main", buildingNo: "1", additionalInfo: null, isDefault: false },
      shippingMethod: "unknown", paymentMethod: "moyasar",
    })).rejects.toThrow(/Invalid individual shipping method/);
    expect((await getCartForUser(owner.id)).itemCount).toBe(1);
  });

  it("keeps exactly one default address under concurrent writes", async () => {
    const owner = await createUser("5");
    const address = (label: string) => ({
      label,
      city: "الرياض",
      district: "العليا",
      street: "الملك فهد",
      buildingNo: "10",
      additionalInfo: null,
      isDefault: true,
    });

    await Promise.all([
      addAddress(owner.id, address("المنزل")),
      addAddress(owner.id, address("العمل")),
    ]);

    const addresses = await getAddresses(owner.id);
    expect(addresses).toHaveLength(2);
    expect(addresses.filter(({ isDefault }) => isDefault)).toHaveLength(1);
  });
});