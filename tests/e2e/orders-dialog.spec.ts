import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import {
  adminSessionsTable,
  adminUsersTable,
  customersTable,
  db,
  orderAddressesTable,
  orderItemsTable,
  ordersTable,
} from "@workspace/db";
import { hashAdminPassword } from "../../artifacts/api-server/src/lib/admin-auth";

const runId = `${Date.now()}-${process.pid}`;
const email = `order-scroll-${runId}@example.com`;
const password = "order-scroll-e2e-password";
const orderNumber = `E2E-SCROLL-${runId}`;
const lastProduct = `Last product ${runId}`;
let adminId: number;
let customerId: number;
let orderId: number;

test.beforeAll(async () => {
  const [admin] = await db.insert(adminUsersTable).values({
    email,
    name: "Order Scroll Test",
    passwordHash: await hashAdminPassword(password),
    isSuperAdmin: true,
  }).returning();
  adminId = admin.id;
  const [customer] = await db.insert(customersTable).values({
    name: "Order Scroll Customer",
    phone: `05${String(Date.now()).slice(-8)}`,
    email,
  }).returning();
  customerId = customer.id;
  const [order] = await db.insert(ordersTable).values({
    userId: customerId,
    orderNumber,
    subtotal: 360,
    shippingCost: 20,
    discount: 0,
    tax: 54,
    total: 434,
    address: "{}",
    shippingMethod: "delivery",
    paymentMethod: "cash",
  }).returning();
  orderId = order.id;
  await db.insert(orderAddressesTable).values({
    orderId,
    label: "Home",
    city: "Riyadh",
    district: "Center",
    street: "Long Street",
    buildingNo: "12",
  });
  await db.insert(orderItemsTable).values(Array.from({ length: 12 }, (_, index) => ({
    orderId,
    productId: 1000000 + index,
    productName: index === 11 ? lastProduct : `Product ${index + 1}`,
    quantity: 1,
    unitPrice: 30,
    totalPrice: 30,
  })));
});

test.afterAll(async () => {
  if (orderId) await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
  if (customerId) await db.delete(customersTable).where(eq(customersTable.id, customerId));
  if (adminId) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, adminId));
    await db.delete(adminUsersTable).where(eq(adminUsersTable.id, adminId));
  }
});

test("long order details scroll inside the dialog at short and mobile sizes in both languages", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/admin/login");
  await page.getByLabel(/البريد الإلكتروني|Email/).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByTestId("button-login-submit").click();
  await expect(page).toHaveURL(/\/admin(?:\/)?$/);
  const skipTour = page.getByRole("button", { name: /تخطي|Skip/ });
  if (await skipTour.isVisible()) await skipTour.click();
  await page.goto("/admin/orders");

  for (const viewport of [{ width: 900, height: 520 }, { width: 390, height: 620 }]) {
    await page.setViewportSize(viewport);
    for (const direction of ["rtl", "ltr"] as const) {
      const row = page.getByTestId(`row-order-${orderId}`);
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: /إجراءات الطلب|Order actions/ }).click();
      await page.getByText(/عرض التفاصيل|View details/, { exact: true }).click();
      const dialog = page.getByRole("dialog");
      const scroll = page.getByTestId("order-details-scroll");
      await expect(dialog).toHaveAttribute("dir", direction);
      await expect(scroll.getByText(lastProduct)).toBeAttached();
      await expect.poll(() => scroll.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      const initialPageScroll = await page.evaluate(() => window.scrollY);
      await scroll.hover();
      await page.mouse.wheel(0, 1200);
      await expect.poll(() => scroll.evaluate((el) => el.scrollTop > 0)).toBe(true);
      await scroll.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await expect(scroll.getByText(lastProduct)).toBeVisible();
      await expect(scroll.locator("span").filter({ hasText: /^(الإجمالي النهائي|Total)$/ })).toBeVisible();
      await expect(dialog.getByRole("heading", { name: /تفاصيل الطلب|Order Details/ })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
      expect(await page.evaluate(() => window.scrollY)).toBe(initialPageScroll);
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await scroll.evaluate((el) => { el.scrollTop = 0; });
      if (viewport.width < 500) {
        const box = await scroll.boundingBox();
        if (!box) throw new Error("Order scroll region is not visible");
        const x = box.x + box.width / 2;
        const startY = box.y + box.height * 0.8;
        const session = await page.context().newCDPSession(page);
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart", touchPoints: [{ x, y: startY }],
        });
        for (let step = 1; step <= 8; step++) {
          await session.send("Input.dispatchTouchEvent", {
            type: "touchMove", touchPoints: [{ x, y: startY - step * 24 }],
          });
        }
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await expect.poll(() => scroll.evaluate((el) => el.scrollTop > 0)).toBe(true);
        expect(await page.evaluate(() => window.scrollY)).toBe(initialPageScroll);
        await session.detach();
        await scroll.evaluate((el) => { el.scrollTop = 0; });
      }
      await scroll.getByRole("combobox").first().click();
      await expect(page.getByRole("option", { name: /قيد التجهيز|Processing/ })).toBeVisible();
      await page.keyboard.press("Escape");
      await scroll.getByRole("combobox").nth(1).click();
      await expect(page.getByRole("option", { name: /مدفوع|Paid/ })).toBeVisible();
      await page.keyboard.press("Escape");
      await dialog.getByRole("button", { name: "Close" }).click();
      await expect(dialog).not.toBeVisible();
      await page.getByRole("button", { name: /تغيير اللغة|Toggle language/ }).click();
    }
  }
});