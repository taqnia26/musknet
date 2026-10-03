import { expect, test, type Page, type Route } from "@playwright/test";
import { eq } from "drizzle-orm";
import { adminSessionsTable, adminUsersTable, db } from "@workspace/db";
import { hashAdminPassword } from "../../artifacts/api-server/src/lib/admin-auth";
import { createTemplate, type InvoiceDesign } from "../../lib/invoice-document/src/design";

// All design endpoints are mocked: no invoice, accounting or design record is ever written.
const runId = `${Date.now()}-${process.pid}`;
const password = "invoice-design-e2e-password";
const email = `invoice-design-e2e-${runId}@example.com`;
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
let adminId: number;

test.beforeAll(async () => {
  const [admin] = await db.insert(adminUsersTable).values({
    email, name: "Invoice Design E2E", passwordHash: await hashAdminPassword(password), isSuperAdmin: true,
  }).returning();
  adminId = admin.id;
});
test.afterAll(async () => {
  if (!adminId) return;
  await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, adminId));
  await db.delete(adminUsersTable).where(eq(adminUsersTable.id, adminId));
});

type Calls = { puts: Array<{ revision: number; design: InvoiceDesign }>; publishes: Array<{ revision: number; design: InvoiceDesign }> };

async function mockDesignApi(page: Page, opts: { conflictOnSave?: boolean } = {}) {
  const base = createTemplate("reference");
  const state = {
    revision: 3, draft: base as InvoiceDesign, published: base as InvoiceDesign,
    updatedBy: adminId, updatedAt: "2026-10-03T09:00:00.000Z", publishedBy: adminId, publishedAt: "2026-10-01T09:00:00.000Z",
    sampleQr: PIXEL,
  };
  const calls: Calls = { puts: [], publishes: [] };
  await page.route("**/api/admin/finance/invoice-design/publish", async (route: Route) => {
    const body = route.request().postDataJSON();
    calls.publishes.push(body);
    state.revision = body.revision + 1; state.draft = body.design; state.published = body.design;
    state.publishedAt = new Date().toISOString();
    await route.fulfill({ status: 200, json: state });
  });
  await page.route("**/api/admin/finance/invoice-design", async (route: Route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ status: 200, json: state });
    if (method === "PUT") {
      const body = route.request().postDataJSON();
      calls.puts.push(body);
      if (opts.conflictOnSave) return route.fulfill({ status: 409, json: { error: "تم تعديل التصميم من مستخدم آخر" } });
      state.revision = body.revision + 1; state.draft = body.design; state.updatedAt = new Date().toISOString();
      return route.fulfill({ status: 200, json: state });
    }
    return route.fallback();
  });
  return calls;
}

async function openEditor(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel(/البريد الإلكتروني|Email/).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByTestId("button-login-submit").click();
  await expect(page).toHaveURL(/\/admin(?:\/)?$/);
  const skipTour = page.getByRole("button", { name: /تخطي|Skip/ });
  if (await skipTour.isVisible()) await skipTour.click();
  await page.goto("/admin/finance/invoice-design");
  await expect(page.getByTestId("canvas-a4")).toBeVisible();
  await expect(page.getByTestId("status-document")).toHaveText("المستند جاهز", { timeout: 20_000 });
}
const value = async (page: Page, id: string) => Number(await page.getByTestId(id).inputValue());

async function drag(page: Page, selector: string, dx: number, dy: number) {
  const box = (await page.locator(selector).boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

test("a delayed draft-save response cannot discard valid or invalid newer edits",async({page})=>{
  const calls=await mockDesignApi(page);
  let release!:()=>void,entered!:()=>void,first=true;
  const hold=new Promise<void>(resolve=>{release=resolve;});
  const pending=new Promise<void>(resolve=>{entered=resolve;});
  await page.route("**/api/admin/finance/invoice-design",async route=>{
    if(first&&route.request().method()==="PUT") {
      first=false;entered();await hold;
    }
    await route.fallback();
  });
  await openEditor(page);
  await page.getByTestId("overlay-logo").click();
  await page.getByTestId("input-width").fill("60");
  await page.getByTestId("button-save-draft").click();
  await pending;
  await page.getByTestId("input-height").fill("20");
  await page.getByTestId("input-x").fill("1");
  await expect(page.getByTestId("preview-retained")).toBeVisible();
  release();
  await expect.poll(()=>calls.puts.length).toBe(1);
  await expect(page.getByText("تم حفظ المسودة",{exact:true})).toBeVisible();
  await expect(page.getByTestId("input-x")).toHaveValue("1");
  await expect(page.getByTestId("input-height")).toHaveValue("20");
  await expect(page.getByTestId("input-width")).toHaveValue("60");
  await expect(page.getByTestId("status-draft")).toHaveText("تعديلات غير محفوظة");
  expect(calls.puts[0].design.elements.find(e=>e.kind==="logo")).toMatchObject({x:132,height:19,width:60});
  await page.getByTestId("input-x").fill("132");
  await expect(page.getByTestId("status-document")).toHaveText("المستند جاهز");
  await page.getByTestId("button-save-draft").click();
  await expect.poll(()=>calls.puts.length).toBe(2);
  expect(calls.puts[1].revision).toBe(4);
  expect(calls.puts[1].design.elements.find(e=>e.kind==="logo")).toMatchObject({x:132,height:20,width:60});
  await expect(page.getByTestId("status-draft")).toHaveText("المسودة محفوظة");
  expect(calls.publishes).toHaveLength(0);
  await page.reload();
  await page.getByTestId("overlay-logo").click();
  await expect(page.getByTestId("input-height")).toHaveValue("20");
});

test("invalid numeric inputs retain the preview and unsaved edits until correction",async({page})=>{
  const calls=await mockDesignApi(page);
  await openEditor(page);
  await page.getByTestId("overlay-logo").click();
  await page.getByTestId("input-width").fill("60");
  await expect(page.getByTestId("status-document")).toHaveText("المستند جاهز");
  await page.getByTestId("input-x").fill("1");
  await expect(page.getByTestId("preview-retained")).toBeVisible();
  await page.waitForTimeout(500); // Beyond the render debounce that formerly crashed the route.
  await expect(page.getByTestId("canvas-a4")).toBeVisible();
  await expect(page.getByTestId("input-width")).toHaveValue("60");
  await expect(page.getByTestId("input-x")).toHaveValue("1");
  await expect(page.getByTestId("button-publish")).toBeDisabled();
  await expect(page.getByTestId("button-save-draft")).toBeDisabled();
  await expect(page.frameLocator('[data-testid="canvas-a4"] iframe').locator('#invoice-pages')).toHaveAttribute("data-ready","true");
  await page.getByTestId("input-x").fill("132");
  await expect(page.getByTestId("preview-retained")).toHaveCount(0);
  await page.getByTestId("input-col-product").fill("30");
  await expect(page.getByTestId("preview-retained")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId("input-width")).toHaveValue("60");
  await expect(page.getByTestId("canvas-a4")).toBeVisible();
  await page.getByTestId("input-col-product").fill("48");
  await expect(page.getByTestId("preview-retained")).toHaveCount(0);
  await expect(page.getByTestId("status-document")).toHaveText("المستند جاهز");
  await page.getByTestId("button-save-draft").click();
  await expect.poll(()=>calls.puts.length).toBe(1);
  expect(calls.puts[0].design.elements.find(e=>e.kind==="logo")).toMatchObject({x:132,width:60});
  expect(calls.puts[0].design.columns.product).toBe(48);
  expect(calls.publishes).toHaveLength(0);
  await page.reload();
  await expect(page.getByTestId("canvas-a4")).toBeVisible();
  await page.getByTestId("overlay-logo").click();
  await expect(page.getByTestId("input-width")).toHaveValue("60");
});

test("pointer drag and resize use physical mm, undo/redo, and save only the draft", async ({ page }) => {
  test.setTimeout(90_000);
  const calls = await mockDesignApi(page);
  await openEditor(page);
  await page.getByTestId("overlay-qr").click();
  const x0 = await value(page, "input-x"), w0 = await value(page, "input-width");
  expect(x0).toBe(14);
  expect(w0).toBe(25);

  await drag(page, '[data-testid="overlay-qr"]', 60, 0);
  const moved = await value(page, "input-x");
  expect(moved).toBeGreaterThan(x0 + 5);
  await expect(page.getByTestId("status-draft")).toHaveText("تعديلات غير محفوظة");

  await drag(page, '[data-testid="handle-se"]', 30, 0);
  expect(await value(page, "input-width")).toBeGreaterThan(w0);

  await page.getByTestId("button-undo").click();
  expect(await value(page, "input-width")).toBe(w0);
  await page.getByTestId("button-undo").click();
  expect(await value(page, "input-x")).toBe(x0);
  await expect(page.getByTestId("status-draft")).toHaveText("المسودة محفوظة");
  await page.getByTestId("button-redo").click();
  expect(await value(page, "input-x")).toBe(moved);

  await page.getByTestId("button-save-draft").click();
  await expect(page.getByTestId("status-draft")).toHaveText("المسودة محفوظة");
  expect(calls.puts).toHaveLength(1);
  expect(calls.puts[0].revision).toBe(3);
  expect(calls.puts[0].design.elements.find((e) => e.kind === "qr")!.x).toBe(moved);
  // Saving a draft never publishes.
  expect(calls.publishes).toHaveLength(0);
  await expect(page.getByTestId("status-published")).toHaveText("يختلف عن التصميم المعتمد");

  await page.reload();
  await expect(page.getByTestId("canvas-a4")).toBeVisible();
  await page.getByTestId("overlay-qr").click();
  expect(await value(page, "input-x")).toBe(moved);
});

test("keyboard arrows and numeric fields move elements; publish needs explicit confirmation", async ({ page }) => {
  test.setTimeout(90_000);
  const calls = await mockDesignApi(page);
  await openEditor(page);
  await page.getByTestId("overlay-qr").click();
  await page.keyboard.press("ArrowRight");
  expect(await value(page, "input-x")).toBe(14.5);
  await page.keyboard.press("Shift+ArrowDown");
  expect(await value(page, "input-y")).toBe(254);
  await page.getByTestId("input-x").fill("20");
  expect(await value(page, "input-x")).toBe(20);

  await page.getByTestId("button-publish").click();
  await expect(page.getByRole("alertdialog")).toContainText("اعتماد وتطبيق على جميع الفواتير");
  await expect(page.getByRole("alertdialog")).toContainText("ملفات PDF");
  expect(calls.publishes).toHaveLength(0);
  await page.getByRole("button", { name: "إلغاء" }).click();
  expect(calls.publishes).toHaveLength(0);

  await page.getByTestId("button-publish").click();
  await page.getByTestId("button-confirm-publish").click();
  await expect(page.getByTestId("status-published")).toHaveText("مطابق للمعتمد");
  expect(calls.publishes).toHaveLength(1);
  expect(calls.publishes[0].revision).toBe(3);
  expect(calls.puts).toHaveLength(0);
});

test("unsaved edits are protected on internal links and browser back; conflicts keep local edits", async ({ page }) => {
  test.setTimeout(90_000);
  await mockDesignApi(page, { conflictOnSave: true });
  await openEditor(page);
  await page.getByTestId("overlay-qr").click();
  await page.getByTestId("input-x").fill("30");

  await page.locator('a[href="/admin/finance/reports"]').first().click();
  await expect(page.getByRole("alertdialog")).toContainText("مغادرة الصفحة");
  await page.getByTestId("button-stay").click();
  await expect(page).toHaveURL(/invoice-design$/);
  expect(await value(page, "input-x")).toBe(30);

  await page.goBack();
  await expect(page.getByRole("alertdialog")).toContainText("مغادرة الصفحة");
  await page.getByTestId("button-stay").click();
  await expect(page).toHaveURL(/invoice-design$/);

  await page.getByTestId("button-save-draft").click();
  await expect(page.getByTestId("banner-conflict")).toBeVisible();
  await expect(page.getByText("تم تعديل التصميم من مستخدم آخر").first()).toBeVisible();
  expect(await value(page, "input-x")).toBe(30);
  await expect(page.getByTestId("status-draft")).toHaveText("تعديلات غير محفوظة");
});

test("long sample paginates and overlays follow the actual iframe positions on later pages", async ({ page }) => {
  test.setTimeout(90_000);
  await mockDesignApi(page);
  await openEditor(page);
  const before = (await page.getByTestId("canvas-a4").boundingBox())!.height;
  await page.getByTestId("select-sample").selectOption("long");
  await expect(page.getByTestId("status-document")).toHaveText(/المستند جاهز|المستند يحتوي أخطاء/, { timeout: 20_000 });
  await expect.poll(async () => (await page.getByTestId("canvas-a4").boundingBox())!.height).toBeGreaterThan(before * 1.5);
  await expect.poll(() => page.locator('[data-testid^="overlay-"][data-testid$="-p2"]').count()).toBeGreaterThan(0);
  // The configured rectangles stay in mm: selecting a later-page box exposes the same design element.
  await page.locator('[data-testid^="overlay-"][data-testid$="-p2"]').first().click();
  await expect(page.getByTestId("panel-properties")).toContainText(/جدول|الإجماليات|الملاحظات|التذييل|رمز|نص|فاصل|البائع|المشتري|بيانات|العنوان|الشعار/);
});
