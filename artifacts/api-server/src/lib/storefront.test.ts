import { afterEach, beforeAll, describe, expect, it } from "vitest";
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
  removeCartItem,
  requestDevelopmentOtp,
  updateCartItem,
  verifyDevelopmentOtp,
} from "./storefront";

const phones: string[] = [];
const movementReasons: string[] = [];
const productSnapshots = new Map<number, { stockQuantity: number; price: number }>();
const balanceSnapshots = new Map<number, Array<typeof inventoryBalancesTable.$inferSelect>>();

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `storefront-accounting-${Date.now()}@example.com`;
  process.env.ADMIN_PASSWORD = "storefront-accounting-password";
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
      shippingMethod: "storage-station-standard",
      paymentMethod: "moyasar",
    });
    movementReasons.push(`Order ${order!.orderNumber}`);

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
      shippingMethod: "storage-station-standard",
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