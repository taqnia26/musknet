import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  customersTable,
  db,
  inventoryMovementsTable,
  orderAddressesTable,
  ordersTable,
  productsTable,
} from "@workspace/db";
import {
  addAddress,
  addToCart,
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
const stockSnapshots = new Map<number, number>();

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
      await db.delete(ordersTable).where(inArray(ordersTable.userId, ids));
      await db.delete(customersTable).where(inArray(customersTable.id, ids));
    }
  }
  for (const [productId, stockQuantity] of stockSnapshots) {
    await db.update(productsTable).set({ stockQuantity }).where(eq(productsTable.id, productId));
  }
  phones.length = 0;
  movementReasons.length = 0;
  stockSnapshots.clear();
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
    const [orderedProduct] = await db.select({ stockQuantity: productsTable.stockQuantity })
      .from(productsTable).where(eq(productsTable.id, 2)).limit(1);
    stockSnapshots.set(2, orderedProduct.stockQuantity);
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