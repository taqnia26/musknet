import { expect, test } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import {
  accountingAccountsTable,
  adminSessionsTable,
  adminUsersTable,
  categoriesTable,
  db,
  invoiceItemsTable,
  invoicesTable,
  journalEntriesTable,
  journalEntryAuditTable,
  journalEntryLinesTable,
  productsTable,
  uploadedContractFilesTable,
  wholesaleDistributorsTable,
} from "@workspace/db";
import { ensureStandardAccountingChart } from "../../artifacts/api-server/src/lib/accounting";
import { hashAdminPassword } from "../../artifacts/api-server/src/lib/admin-auth";

const runId = `${Date.now()}-${process.pid}`;
const password = "invoice-e2e-password";
const email = `invoice-e2e-${runId}@example.com`;
const invoiceNumber = `E2E-INV-${runId}`;
const productName = `Invoice preview item ${runId}`;
const updatedBuyer = `Updated buyer ${runId}`;
const updatedAddress = `Updated address ${runId}`;
const dueDate = "2026-10-15";

let adminId: number;
let categoryId: number;
let productId: number;
let distributorId: number;
let invoiceId: number;
let journalId: number;
let contractFileId: number;

test.beforeAll(async () => {
  await ensureStandardAccountingChart();
  const passwordHash = await hashAdminPassword(password);
  const [admin] = await db.insert(adminUsersTable).values({
    email,
    name: "Invoice E2E Administrator",
    passwordHash,
    isSuperAdmin: true,
  }).returning();
  adminId = admin.id;
  const [category] = await db.insert(categoriesTable).values({
    nameAr: "اختبار عرض الفاتورة",
    nameEn: "Invoice display test",
    slug: `invoice-display-${runId}`,
  }).returning();
  categoryId = category.id;
  const [product] = await db.insert(productsTable).values({
    nameAr: productName,
    nameEn: productName,
    slug: `invoice-preview-item-${runId}`,
    sku: `E2E-${runId}`,
    price: 100,
    categoryId,
    stockQuantity: 0,
  }).returning();
  productId = product.id;
  const [distributor] = await db.insert(wholesaleDistributorsTable).values({
    companyName: `Test buyer ${runId}`,
    contactName: "Invoice E2E",
    phone: `050${String(Date.now()).slice(-7)}`,
    taxNumber: "310000000000003",
    commercialRegistrationNumber: `CR-${runId}`,
  }).returning();
  distributorId = distributor.id;
  const [contractFile] = await db.insert(uploadedContractFilesTable).values({
    ownerType: "distributor", ownerId: distributorId, ownerName: distributor.companyName,
    fileName: `company-reference-${runId}.pdf`, objectPath: `/objects/uploads/contracts/files/company-reference-${runId}`,
    mimeType: "application/pdf", sizeBytes: 100, uploadedBy: adminId,
    termsConfirmedAt: new Date(), termsConfirmedBy: adminId,
    contractType: "Saudi distributor agreement", discountPercent: "7.50",
    paymentTerm: "net_days", paymentDays: 30,
    startDate: "2025-01-01", endDate: "2025-12-31",
  }).returning();
  contractFileId = contractFile.id;
  const [invoice] = await db.insert(invoicesTable).values({
    distributorId,
    creationKey: `invoice-display-${runId}`,
    sequenceNumber: 1_800_000_000 + (Date.now() % 100_000_000),
    invoiceNumber,
    sellerName: "مؤسسة مسك اللولو للتجارة",
    issueDatetime: new Date("2026-09-22T10:00:00.000Z"),
    sellerVatNumber: "300000000000003",
    buyerName: `Test buyer ${runId}`,
    buyerTaxNumber: "310000000000003",
    buyerCommercialRegistrationNumber: `CR-${runId}`,
    buyerAddress: `Original address ${runId}`,
    subtotal: 100,
    vatAmount: 15,
    totalAmount: 115,
    qrCodeData: `invoice=${invoiceNumber}&total=115&vat=15`,
  }).returning();
  invoiceId = invoice.id;
  await db.insert(invoiceItemsTable).values({
    invoiceId,
    productId,
    productName,
    sku: `E2E-${runId}`,
    quantity: 2,
    unitPrice: 50,
    subtotal: 100,
    vatAmount: 15,
    totalAmount: 115,
  });
  const accounts = await db.select({ id: accountingAccountsTable.id }).from(accountingAccountsTable).limit(2);
  if (accounts.length < 2) throw new Error("Invoice E2E requires at least two accounting accounts");
  const [journal] = await db.insert(journalEntriesTable).values({
    entryNumber: `JE-${1_000_000_000 + (Date.now() % 1_000_000_000)}`,
    entryDate: "2026-09-22",
    description: `Accounting record for ${invoiceNumber}`,
    sourceType: "distributor_invoice",
    sourceId: String(invoiceId),
    status: "draft",
    createdBy: adminId,
  }).returning();
  journalId = journal.id;
  await db.insert(journalEntryLinesTable).values([
    {
      journalEntryId: journalId,
      lineNumber: 1,
      accountId: accounts[0].id,
      description: `Test debit for ${invoiceNumber}`,
      debit: "115",
      credit: "0",
    },
    {
      journalEntryId: journalId,
      lineNumber: 2,
      accountId: accounts[1].id,
      description: `Test credit for ${invoiceNumber}`,
      debit: "0",
      credit: "115",
    },
  ]);
  await db.update(journalEntriesTable).set({
    status: "posted",
    postedBy: adminId,
    postedAt: new Date("2026-09-22T10:01:00.000Z"),
  }).where(eq(journalEntriesTable.id, journalId));
});

test.afterAll(async () => {
  if (distributorId) {
    const created = await db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.distributorId, distributorId));
    for (const { id } of created.filter(row => row.id !== invoiceId)) {
      const journals = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(and(
        eq(journalEntriesTable.sourceType, "historical_company_invoice"),
        eq(journalEntriesTable.sourceId, String(id)),
      ));
      for (const journal of journals) {
        await db.execute(sql`alter table journal_entry_lines disable trigger user`);
        await db.execute(sql`alter table journal_entries disable trigger user`);
        await db.delete(journalEntryAuditTable).where(eq(journalEntryAuditTable.journalEntryId, journal.id));
        await db.delete(journalEntryLinesTable).where(eq(journalEntryLinesTable.journalEntryId, journal.id));
        await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, journal.id));
        await db.execute(sql`alter table journal_entry_lines enable trigger user`);
        await db.execute(sql`alter table journal_entries enable trigger user`);
      }
      await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));
      await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
    }
  }
  if (journalId) {
    await db.execute(sql`alter table journal_entry_lines disable trigger user`);
    await db.execute(sql`alter table journal_entries disable trigger user`);
    await db.delete(journalEntryAuditTable).where(eq(journalEntryAuditTable.journalEntryId, journalId));
    await db.delete(journalEntryLinesTable).where(eq(journalEntryLinesTable.journalEntryId, journalId));
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, journalId));
    await db.execute(sql`alter table journal_entry_lines enable trigger user`);
    await db.execute(sql`alter table journal_entries enable trigger user`);
  }
  if (invoiceId) {
    await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId));
    await db.delete(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  }
  if (contractFileId) await db.delete(uploadedContractFilesTable).where(eq(uploadedContractFilesTable.id, contractFileId));
  if (distributorId) await db.delete(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, distributorId));
  if (productId) await db.delete(productsTable).where(eq(productsTable.id, productId));
  if (categoryId) await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  if (adminId) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, adminId));
    await db.delete(adminUsersTable).where(eq(adminUsersTable.id, adminId));
  }
});

test("company invoice cancellation confirms safely without cancelling stored invoices", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const reason = "إلغاء الفاتورة بتأكيد المستخدم من لوحة الإدارة";
  const requests: { reason: string }[] = [];
  let release: () => void = () => {};
  let listRequests = 0;
  page.on("request", request => {
    if (request.method() === "GET" && /\/api\/admin\/invoices(?:\?|$)/.test(request.url())) listRequests++;
  });
  // Never forward cancellation to the server, even on assertion failure.
  await page.route(`**/api/admin/invoices/${invoiceId}/cancel`, async route => {
    expect(route.request().method()).toBe("POST");
    requests.push(route.request().postDataJSON());
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill(requests.length === 1
      ? { status: 409, json: { error: "Shipment has advanced or been sent to a carrier" } }
      : { status: 200, json: {
          id: invoiceId, cancelledAt: new Date().toISOString(),
          cancellationReason: reason, cancelledByAdminId: adminId,
        } });
  });
  await page.goto("/admin/login");
  await page.getByLabel(/البريد الإلكتروني|Email/).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByTestId("button-login-submit").click();
  await expect(page).toHaveURL(/\/admin(?:\/)?$/);
  const skipTour = page.getByRole("button", { name: /تخطي|Skip/ });
  await expect(skipTour).toBeVisible();
  await skipTour.click();
  await expect(skipTour).toBeHidden();
  await page.goto("/admin/sales/companies");
  const dialog = page.getByRole("dialog");
  const open = async () => {
    await page.getByTestId(`invoice-actions-${invoiceId}`).click();
    await page.getByRole("menuitem", { name: /إلغاء الفاتورة|Cancel invoice/, exact: true }).click();
    await expect(dialog).toBeVisible();
  };
  const checkDialog = async (arabic: boolean) => {
    await expect(dialog).toHaveAttribute("dir", arabic ? "rtl" : "ltr");
    await expect(dialog.getByRole("heading")).toHaveText(arabic ? "هل تريد إلغاء الفاتورة؟" : "Do you want to cancel the invoice?");
    await expect(dialog).toContainText(invoiceNumber);
    await expect(dialog.locator("input, textarea")).toHaveCount(0);
    await expect(dialog.getByRole("button")).toHaveCount(2);
    await expect(dialog.getByRole("button", { name: arabic ? "تراجع" : "Back", exact: true })).toBeEnabled();
    await expect(dialog.getByRole("button", { name: arabic ? "تأكيد" : "Confirm", exact: true })).toBeEnabled();
    await expect(dialog).not.toContainText(/إلغاء نهائي|Permanent cancellation/);
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  };
  await open();
  await checkDialog(true);
  await page.screenshot({ path: testInfo.outputPath("cancel-ar-desktop.png") });
  await dialog.getByRole("button", { name: "تراجع", exact: true }).click();
  await expect(dialog).toBeHidden();
  await open();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await open();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
  expect(requests).toHaveLength(0);

  await page.getByRole("button", { name: /تغيير اللغة|Toggle language/ }).click();
  await open();
  await checkDialog(false);
  await page.screenshot({ path: testInfo.outputPath("cancel-en-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkDialog(false);
  await page.screenshot({ path: testInfo.outputPath("cancel-en-mobile.png") });
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: /تغيير اللغة|Toggle language/ }).click();
  await open();
  await checkDialog(true);
  await page.screenshot({ path: testInfo.outputPath("cancel-ar-mobile.png") });

  const confirm = dialog.getByRole("button", { name: "تأكيد", exact: true });
  const back = dialog.getByRole("button", { name: "تراجع", exact: true });
  // Two synchronous clicks exercise the guard before React's pending render.
  await confirm.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toEqual({ reason });
  expect(requests[0].reason.length).toBeGreaterThanOrEqual(10);
  expect(requests[0].reason.length).toBeLessThanOrEqual(500);
  await expect(confirm).toBeDisabled();
  await expect(back).toBeDisabled();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await back.evaluate((button: HTMLButtonElement) => button.click());
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  expect(requests).toHaveLength(1);
  release();
  await expect(dialog.getByRole("alert")).toContainText("Shipment has advanced or been sent to a carrier");
  await expect(confirm).toBeEnabled();
  await expect(back).toBeEnabled();
  await expect(dialog).toHaveAttribute("aria-busy", "false");
  const listsBeforeRetry = listRequests;
  await confirm.click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(confirm).toBeDisabled();
  expect(requests[1]).toEqual({ reason });
  release();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("أُلغيت الفاتورة", { exact: true })).toBeVisible();
  await expect.poll(() => listRequests).toBeGreaterThan(listsBeforeRetry);
  // The mocked success and failure must leave even the disposable fixture untouched.
  const [stored] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  expect(stored.cancelledAt).toBeNull();
  expect(stored.cancellationReason).toBeNull();
  expect(stored.invoiceNumber).toBe(invoiceNumber);
});

test("invoice preview, printing, editing, email drafting, and archiving remain consistent", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/admin/login");
  await page.getByLabel(/البريد الإلكتروني|Email/).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByTestId("button-login-submit").click();
  await expect(page).toHaveURL(/\/admin(?:\/)?$/);
  await expect(page.getByRole("heading", { name: /نظرة عامة|Overview/ })).toBeVisible();
  const skipTour = page.getByRole("button", { name: /تخطي|Skip/ });
  if (await skipTour.isVisible()) await skipTour.click();

  await page.goto("/admin/sales/companies");
  await expect(page.getByRole("heading", { name: /فواتير الشركات|Company Invoices/ })).toBeVisible();
  const row = page.getByTestId(`invoice-row-${invoiceId}`);
  await expect(row).toContainText(invoiceNumber);

  await page.getByTestId(`invoice-actions-${invoiceId}`).click();
  await page.getByText(/معاينة الفاتورة|Preview Invoice/, { exact: true }).click();
  const frame = page.frameLocator('[data-testid="invoice-template"] iframe');
  const pagesRoot = frame.locator("#invoice-pages");
  // The shared document is trusted and paginated inside an isolated iframe: wait for it, then read facts from there.
  const waitReady = async () => {
    await expect(pagesRoot).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
    const raw = await pagesRoot.getAttribute("data-errors");
    expect(JSON.parse(raw || "[]")).toEqual([]);
  };
  const checkLayout = async (print = false) => {
    await page.emulateMedia({ media: print ? "print" : "screen" });
    await waitReady();
    const g = await pagesRoot.evaluate((root) => {
      const page1 = root.querySelector<HTMLElement>(".invoice-page")!;
      const rect = (el: Element | null) => {
        if (!el) throw new Error("Missing invoice element");
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      const at = (kind: string) => rect(page1.querySelector(`[data-element="${kind}"]`));
      return {
        page: rect(page1), seller: at("seller"), logo: at("logo"), buyer: at("buyer"), info: at("info"),
        table: at("table"), totals: at("totals"), notes: at("notes"), footer: at("footer"),
        pages: root.querySelectorAll(".invoice-page").length,
      };
    });
    const mid = (r: { left: number; right: number }) => (r.left + r.right) / 2;
    const center = mid(g.page);
    // Physical (non-mirrored) layout: seller top-left, logo top-right, buyer left, info right, notes left, totals right.
    expect(mid(g.seller)).toBeLessThan(center);
    expect(mid(g.logo)).toBeGreaterThan(center);
    expect(mid(g.buyer)).toBeLessThan(center);
    expect(mid(g.info)).toBeGreaterThan(center);
    expect(mid(g.notes)).toBeLessThan(center);
    expect(mid(g.totals)).toBeGreaterThan(center);
    expect(g.buyer.top).toBeGreaterThanOrEqual(g.seller.bottom - 1);
    expect(g.table.top).toBeGreaterThanOrEqual(Math.max(g.buyer.bottom, g.info.bottom) - 1);
    expect(Math.abs(mid(g.footer) - center)).toBeLessThan(3);
    expect(g.pages).toBeGreaterThanOrEqual(1);
    await page.emulateMedia({ media: "screen" });
  };
  const checkPalette = async (print = false) => {
    await page.emulateMedia({ media: print ? "print" : "screen" });
    await waitReady();
    // The document is isolated from admin dark mode: always dark ink on white paper.
    const colors = await pagesRoot.evaluate((root) => {
      const pageEl = root.querySelector<HTMLElement>(".invoice-page")!;
      const seller = root.querySelector<HTMLElement>('[data-element="seller"]')!;
      const qr = root.querySelector<HTMLImageElement>('[data-element="qr"] img');
      return {
        page: getComputedStyle(pageEl).backgroundColor,
        body: getComputedStyle(root.ownerDocument.body).backgroundColor,
        ink: getComputedStyle(seller).color,
        qrLoaded: !!qr && qr.complete && qr.naturalWidth > 0,
      };
    });
    expect(colors.page).toBe("rgb(255, 255, 255)");
    const [r, g2, b] = colors.ink.match(/\d+/g)!.map(Number);
    expect((r + g2 + b) / 3).toBeLessThan(90);
    expect(colors.qrLoaded).toBe(true);
    await checkLayout(print);
    await page.emulateMedia({ media: "screen" });
  };
  const toggleTheme = () => page.locator('button[title="تغيير المظهر"], button[title="Toggle theme"]').evaluate((button: HTMLButtonElement) => button.click());
  await waitReady();
  await expect(frame.locator('[data-element="seller"]').first()).toHaveAttribute("dir", "rtl");
  await expect(frame.locator("body")).toContainText(invoiceNumber);
  await expect(frame.locator("body")).toContainText(`Test buyer ${runId}`);
  await expect(frame.locator("body")).toContainText(productName);
  await expect(frame.locator("body")).toContainText("300000000000003");
  await expect.poll(async () => frame.locator('[data-element="qr"] img').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(await frame.locator(".invoice-page").count()).toBe(1);
  await checkPalette();
  await checkPalette(true);
  await toggleTheme();
  await checkPalette();
  await checkPalette(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await checkLayout();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: /تغيير اللغة|Toggle language/ }).click();
  await page.getByTestId(`invoice-actions-${invoiceId}`).click();
  await page.getByText("Preview Invoice", { exact: true }).click();
  await waitReady();
  await expect(frame.locator('[data-element="seller"]').first()).toHaveAttribute("dir", "ltr");
  await expect(frame.locator("body")).toContainText(productName);
  await checkPalette();
  await toggleTheme();
  await checkPalette();
  await checkPalette(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await checkLayout();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: /تغيير اللغة|Toggle language/ }).click();

  let printCalls = 0;
  await page.exposeFunction("recordInvoicePrint", () => { printCalls += 1; });
  await page.addInitScript(() => {
    window.print = () => void (window as unknown as { recordInvoicePrint: () => void }).recordInvoicePrint();
  });
  await page.route(`**/api/admin/invoices/${invoiceId}/qr`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.reload();
  await page.getByTestId(`invoice-actions-${invoiceId}`).click();
  await page.getByText(/طباعة|Print/, { exact: true }).click();
  await page.waitForTimeout(100);
  expect(printCalls).toBe(0);
  await waitReady();
  await expect(frame.locator("body")).toContainText(invoiceNumber);
  await expect.poll(async () => frame.locator('[data-element="qr"] img').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => printCalls).toBe(1);
  // Long-document pagination is covered by the local sample in invoice-design.spec.ts, with no DOM injection here.
  await page.getByRole("button", { name: "Close", exact: true }).last().click();

  await page.getByTestId(`invoice-actions-${invoiceId}`).click();
  await page.getByText(/تعديل البيانات|Edit Details/, { exact: true }).click();
  const editDialog = page.getByRole("dialog");
  await page.getByTestId("invoice-edit-buyer-name").fill(updatedBuyer);
  await page.getByTestId("invoice-edit-buyer-address").fill(updatedAddress);
  await page.getByTestId("invoice-edit-due-date").fill(dueDate);
  await editDialog.getByText(/حفظ التعديلات|Save Changes/, { exact: true }).click();
  await expect(page.getByText("تم تحديث الفاتورة بنجاح", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId(`invoice-row-${invoiceId}`)).toContainText(dueDate);
  await page.getByTestId(`invoice-actions-${invoiceId}`).click();
  await page.getByText(/معاينة الفاتورة|Preview Invoice/, { exact: true }).click();
  const editedFrame = page.frameLocator('[data-testid="invoice-template"] iframe');
  await expect(editedFrame.locator("#invoice-pages")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(editedFrame.locator("body")).toContainText(updatedBuyer);
  await expect(editedFrame.locator("body")).toContainText(updatedAddress);
  await page.getByRole("button", { name: "Close", exact: true }).last().click();

  await page.route(`**/api/admin/invoices/${invoiceId}/email-deliveries`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  let sentRecipient = "";
  await page.route(`**/api/admin/invoices/${invoiceId}/email`, async (route) => {
    sentRecipient = (route.request().postDataJSON() as { recipient: string }).recipient;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        invoiceId,
        recipient: sentRecipient,
        status: "sent",
        errorMessage: null,
        sentByAdminId: 1,
        sentByName: "Admin",
        attemptedAt: new Date().toISOString(),
      }),
    });
  });
  await page.getByTestId(`invoice-actions-${invoiceId}`).click();
  await page.getByText(/إرسال بالبريد|Email Invoice/, { exact: true }).click();
  await page.getByTestId("invoice-email-recipient").fill("not-an-email");
  await page.getByTestId("button-send-invoice-email").click();
  await expect(page.getByRole("alert")).toContainText(/عنوان بريد إلكتروني صالح|valid email address/);
  await page.getByTestId("invoice-email-recipient").fill("client@example.com");
  await page.getByTestId("button-send-invoice-email").click();
  await expect(page.getByText(/تم إرسال الفاتورة بنجاح|Invoice sent successfully/)).toBeVisible();
  expect(sentRecipient).toBe("client@example.com");
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();

  await page.goto("/admin/sales/companies");
  await page.getByTestId(`invoice-actions-${invoiceId}`).click();
  await page.getByText(/أرشفة|Archive/, { exact: true }).click();
  await page.getByText(/تأكيد الأرشفة|Confirm Archive/, { exact: true }).click();
  await expect(page.getByTestId(`invoice-row-${invoiceId}`)).toHaveCount(0);
  const [archived] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  expect(archived.archivedAt).not.toBeNull();
  const journals = await db.select().from(journalEntriesTable).where(and(
    eq(journalEntriesTable.sourceType, "distributor_invoice"),
    eq(journalEntriesTable.sourceId, String(invoiceId)),
  ));
  expect(journals.map((entry) => entry.id)).toContain(journalId);
});

test("prior date retains the approved file, warns about its period, and previews an invoice-only discount", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/admin/login");
  await page.getByLabel(/البريد الإلكتروني|Email/).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByTestId("button-login-submit").click();
  await expect(page).toHaveURL(/\/admin(?:\/)?$/);
  const skipTour = page.getByRole("button", { name: /تخطي|Skip/ });
  await expect(skipTour).toBeVisible();
  await skipTour.click();
  await expect(skipTour).toBeHidden();
  await page.goto("/admin/sales/companies");
  await expect(page.getByRole("heading", { name: /فواتير الشركات|Company Invoices/ })).toBeVisible();
  await page.getByTestId("button-create-company-invoice").click();
  await page.getByTestId("select-company-invoice-distributor").click();
  await page.getByRole("option", { name: `Test buyer ${runId}` }).click();
  await page.getByTestId("input-company-invoice-issue-date").fill("2000-04-17");
  await page.getByTestId("select-company-invoice-contract").click();
  await page.getByRole("option", { name: new RegExp(`company-reference-${runId}`) }).click();
  await expect(page.getByTestId("input-company-invoice-override-percent")).toHaveValue("7.5");
  await expect(page.getByTestId("warning-company-invoice-contract-period")).toContainText(/2025-01-01/);
  await page.getByTestId("input-company-invoice-issue-date").fill("2026-02-01");
  await expect(page.getByTestId("select-company-invoice-contract")).toContainText(`company-reference-${runId}`);
  await expect(page.getByTestId("warning-company-invoice-contract-period")).toContainText(/2025-12-31/);
  await page.getByTestId("input-company-invoice-override-percent").fill("20");
  await expect(page.getByTestId("company-invoice-totals-preview")).toContainText("20%");
  await page.getByTestId("select-company-invoice-product-0").click();
  await page.getByRole("option", { name: /منتج غير موجود|Product missing/ }).click();
  await page.getByTestId("input-historical-product-name-0").fill("Historical perfume");
  await page.getByTestId("input-company-invoice-unit-price-0").fill("115");
  await expect(page.getByTestId("company-invoice-totals-preview")).toContainText("92.00");
  await page.getByTestId("button-submit-company-invoice").click();
  await expect(page.getByTestId("company-invoice-error")).toContainText(/10|١٠/);
});

test("saves a prior invoice with its displayed contract rate without editing the discount", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/admin/login");
  await page.getByLabel(/البريد الإلكتروني|Email/).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByTestId("button-login-submit").click();
  await expect(page).toHaveURL(/\/admin(?:\/)?$/);
  const skipTour = page.getByRole("button", { name: /تخطي|Skip/ });
  await expect(skipTour).toBeVisible();
  await skipTour.click();
  await expect(skipTour).toBeHidden();
  await page.goto("/admin/sales/companies");
  await page.getByTestId("button-create-company-invoice").click();
  await page.getByTestId("select-company-invoice-distributor").click();
  await page.getByRole("option", { name: `Test buyer ${runId}` }).click();
  await page.getByTestId("input-company-invoice-issue-date").fill("2000-05-21");
  await page.getByTestId("select-company-invoice-contract").click();
  await page.getByRole("option", { name: new RegExp(`company-reference-${runId}`) }).click();
  await expect(page.getByTestId("input-company-invoice-override-percent")).toHaveValue("7.5");
  await page.getByTestId("select-company-invoice-product-0").click();
  await page.getByRole("option", { name: /منتج غير موجود|Product missing/ }).click();
  await page.getByTestId("input-historical-product-name-0").fill("Historical perfume");
  await page.getByTestId("input-company-invoice-unit-price-0").fill("115");
  await page.getByTestId("button-submit-company-invoice").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const created = await db.select().from(invoicesTable).where(eq(invoicesTable.distributorId, distributorId));
  expect(created.find(row => row.issueDatetime.toISOString().slice(0, 10) === "2000-05-21")).toMatchObject({
    uploadedContractFileId: contractFileId, contractDiscountPercent: "7.50",
    appliedDiscountPercent: "7.50", invoiceDiscountPercent: null,
    totalAmount: 106.38,
  });
});