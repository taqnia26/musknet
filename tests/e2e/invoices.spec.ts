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
    entryNumber: `E2E-JE-${runId}`,
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
  if (distributorId) await db.delete(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, distributorId));
  if (productId) await db.delete(productsTable).where(eq(productsTable.id, productId));
  if (categoryId) await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  if (adminId) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, adminId));
    await db.delete(adminUsersTable).where(eq(adminUsersTable.id, adminId));
  }
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
  const preview = page.getByTestId("invoice-template");
  const checkLayout = async (print = false, long = false) => {
    await page.emulateMedia({ media: print ? "print" : "screen" });
    const boxes = await preview.evaluate((sheet) => {
      const box = (selector: string) => {
        const element = sheet.querySelector(selector);
        if (!element) throw new Error(`Missing invoice element: ${selector}`);
        const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
        return { left, right, top, bottom, width, height };
      };
      return {
        sheet: (() => {
          const { left, right, top, bottom, width, height } = sheet.getBoundingClientRect();
          return { left, right, top, bottom, width, height };
        })(),
        buyer: box('[data-testid="invoice-buyer"]'),
        seller: box('[data-testid="invoice-seller"]'),
        sellerColumn: box(".invoice-heading-seller"),
        logo: box(".invoice-heading-logo"),
        card: box('[data-testid="invoice-info-card"]'),
        table: box('[data-testid="invoice-items"]'),
        summary: box('[data-testid="invoice-summary"]'),
        footer: box('[data-testid="invoice-footer"]'),
        footerImage: box('[data-testid="invoice-footer"] img'),
        tableScrollWidth: sheet.querySelector<HTMLElement>('[data-testid="invoice-items"]')!.scrollWidth,
        cardScrollWidth: sheet.querySelector<HTMLElement>('[data-testid="invoice-info-card"]')!.scrollWidth,
        printHeaderDisplay: getComputedStyle(document.querySelector('[role="dialog"] > .print-hide')!).display,
      };
    });
    expect(Math.abs(boxes.sellerColumn.left - boxes.card.left)).toBeLessThan(2);
    expect(Math.abs(boxes.sellerColumn.right - boxes.card.right)).toBeLessThan(2);
    expect(Math.abs(boxes.seller.left - boxes.card.left)).toBeLessThan(2);
    expect(boxes.card.top).toBeGreaterThanOrEqual(boxes.seller.bottom + 10);
    expect(boxes.table.top).toBeGreaterThanOrEqual(boxes.card.bottom);
    expect(boxes.table.top - Math.max(boxes.buyer.bottom, boxes.card.bottom, boxes.logo.bottom)).toBeLessThan(50);
    expect(boxes.summary.top).toBeGreaterThanOrEqual(boxes.table.bottom);
    expect(boxes.footer.top).toBeGreaterThanOrEqual(boxes.summary.bottom);
    expect(boxes.footer.top - boxes.summary.bottom).toBeLessThan(50);
    expect(boxes.sheet.bottom - boxes.footer.bottom).toBeLessThan(print ? 20 : 45);
    expect(boxes.footerImage.bottom).toBeLessThanOrEqual(boxes.footer.bottom + 2);
    expect(boxes.tableScrollWidth).toBeLessThanOrEqual(boxes.table.width + 2);
    expect(boxes.cardScrollWidth).toBeLessThanOrEqual(boxes.card.width + 2);
    if (print) expect(boxes.printHeaderDisplay).toBe("none");
    if (!long && (print || boxes.sheet.width > 600)) expect(boxes.sheet.height).toBeLessThan(print ? 850 : 950);
    if (print || boxes.sheet.width > 600) {
      expect(boxes.seller.right).toBeLessThan(boxes.logo.left + 2);
      expect(boxes.logo.right).toBeLessThan(boxes.buyer.left + 2);
    }
    await page.emulateMedia({ media: "screen" });
  };
  const checkPalette = async (dark: boolean, print = false) => {
    await page.emulateMedia({ media: print ? "print" : "screen" });
    const colors = await preview.evaluate((sheet) => {
      const get = (selector: string) => {
        const element = sheet.querySelector(selector);
        if (!element) throw new Error(`Missing invoice element: ${selector}`);
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, text: style.color, display: style.display };
      };
      const black = sheet.querySelector<HTMLImageElement>(".invoice-logo-black")!;
      const white = sheet.querySelector<HTMLImageElement>(".invoice-logo-white")!;
      const visibleLogo = getComputedStyle(black).display !== "none" ? black : white;
      const canvas = document.createElement("canvas");
      canvas.width = visibleLogo.naturalWidth;
      canvas.height = visibleLogo.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(visibleLogo, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let luminance = 0;
      let opaque = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 128) continue;
        luminance += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        opaque++;
      }
      return {
        sheet: { background: getComputedStyle(sheet).backgroundColor, text: getComputedStyle(sheet).color },
        title: get('[data-testid="invoice-title"]'),
        info: get('[data-testid="invoice-info-card"]'),
        table: get('[data-testid="invoice-table-head"]'),
        body: get('[data-testid="invoice-table-body"]'),
        item: get('[data-testid="invoice-table-body"] td'),
        total: get('[data-testid="invoice-total-card"]'),
        qr: get('[data-testid="invoice-qr-surface"]'),
        footer: get('[data-testid="invoice-footer"]'),
        footerLoaded: !!sheet.querySelector<HTMLImageElement>('[data-testid="invoice-footer"] img')?.naturalWidth,
        footerImage: (() => {
          const img = sheet.querySelector<HTMLImageElement>('[data-testid="invoice-footer"] img')!;
          const imageBox = img.getBoundingClientRect();
          const sheetBox = sheet.getBoundingClientRect();
          return {
            centerOffset: Math.abs((imageBox.left + imageBox.right) / 2 - (sheetBox.left + sheetBox.right) / 2),
            insideSheet: imageBox.left >= sheetBox.left && imageBox.right <= sheetBox.right,
            ratio: img.naturalWidth / img.naturalHeight,
            alt: img.alt,
          };
        })(),
        sellerName: (() => {
          const name = sheet.querySelector<HTMLElement>(".invoice-seller-name")!;
          const seller = sheet.querySelector<HTMLElement>('[data-testid="invoice-seller"]')!;
          const nameBox = name.getBoundingClientRect();
          const sellerBox = seller.getBoundingClientRect();
          return {
            height: nameBox.height,
            lineHeight: parseFloat(getComputedStyle(name).lineHeight),
            insideSeller: nameBox.left >= sellerBox.left && nameBox.right <= sellerBox.right,
            textFits: name.scrollWidth <= name.clientWidth,
          };
        })(),
        buyerRight: sheet.querySelector('[data-testid="invoice-buyer"]')!.getBoundingClientRect().right,
        sellerRight: sheet.querySelector('[data-testid="invoice-seller"]')!.getBoundingClientRect().right,
        blackDisplay: get(".invoice-logo-black").display,
        whiteDisplay: get(".invoice-logo-white").display,
        logoLoaded: visibleLogo.complete && visibleLogo.naturalWidth > 0,
        logoRatio: visibleLogo.naturalWidth / visibleLogo.naturalHeight,
        logoLuminance: opaque ? luminance / opaque : -1,
        qrLoaded: !!sheet.querySelector<HTMLImageElement>('[data-testid="invoice-qr"]')?.naturalWidth,
      };
    });
    const ink = dark && !print ? "rgb(245, 243, 240)" : "rgb(41, 39, 40)";
    expect(colors.sheet.background).toBe(dark && !print ? "rgb(21, 23, 27)" : "rgb(255, 255, 255)");
    expect(colors.sheet.text).toBe(ink);
    expect(colors.title.text).toBe(ink);
    expect(colors.info.background).toBe(dark && !print ? "rgb(38, 41, 47)" : "rgb(245, 245, 244)");
    expect(colors.table.background).toBe(dark && !print ? "rgb(32, 35, 41)" : "rgb(250, 250, 249)");
    expect(colors.body.background).toBe(colors.sheet.background);
    expect(colors.item.text).toBe(ink);
    expect(colors.total.background).toBe(colors.info.background);
    expect(colors.total.text).toBe(ink);
    expect(colors.qr.background).toBe("rgb(255, 255, 255)");
    expect(colors.qrLoaded).toBe(true);
    expect(colors.footer.background).toBe("rgb(255, 255, 255)");
    expect(colors.footerLoaded).toBe(true);
    expect(colors.footerImage.centerOffset).toBeLessThan(2);
    expect(colors.footerImage.insideSheet).toBe(true);
    expect(colors.footerImage.ratio).toBeGreaterThan(4);
    expect(colors.footerImage.alt).toContain("muskellolo.com");
    expect(colors.sellerName.insideSeller).toBe(true);
    expect(colors.sellerName.textFits).toBe(true);
    expect(colors.buyerRight).toBeGreaterThan(colors.sellerRight);
    expect(colors.logoLoaded).toBe(true);
    expect(colors.logoRatio).toBeGreaterThan(3);
    expect(colors.blackDisplay === "none").toBe(dark && !print);
    expect(colors.whiteDisplay === "none").toBe(!dark || print);
    expect(dark && !print ? colors.logoLuminance : 255 - colors.logoLuminance).toBeGreaterThan(200);
     await checkLayout(print);
    await page.emulateMedia({ media: "screen" });
  };
  await expect(preview).toHaveAttribute("dir", "rtl");
  await expect(preview).toContainText("فاتورة ضريبية");
  await expect(preview.getByTestId("invoice-buyer")).toContainText("بيانات العميل");
  await expect(preview.getByTestId("invoice-seller")).not.toContainText("بياناتنا");
  await expect(preview.getByTestId("invoice-seller")).toContainText("مؤسسة مسك اللولو للتجارة");
  await expect(preview.getByTestId("invoice-seller")).toContainText("السعودية، الرياض، حي السليمانية");
  await expect(preview.getByTestId("invoice-seller")).toContainText("300000000000003");
  await expect(preview).toContainText(`Test buyer ${runId}`);
  await expect(preview).toContainText(productName);
  await expect(preview).toContainText("15.00");
  await expect(preview).toContainText("115.00");
  await expect(page.getByTestId("invoice-discount")).toContainText("-0.00");
  await expect(page.getByTestId("invoice-qr")).toBeVisible();
  await expect.poll(async () => page.getByTestId("invoice-qr").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await checkPalette(true);
  await checkPalette(true, true);
  await page.emulateMedia({ media: "print" });
  const shortPdf = await page.pdf({ format: "A4", printBackground: true });
  expect((shortPdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
  await page.emulateMedia({ media: "screen" });
  await page.locator('button[title="تغيير المظهر"], button[title="Toggle theme"]').evaluate((button: HTMLButtonElement) => button.click());
  await checkPalette(false);
  await checkPalette(false, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await checkLayout();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: /تغيير اللغة|Toggle language/ }).click();
  await page.getByTestId(`invoice-actions-${invoiceId}`).click();
  await page.getByText("Preview Invoice", { exact: true }).click();
  await expect(page.getByTestId("invoice-template")).toHaveAttribute("dir", "ltr");
  await expect(page.getByTestId("invoice-template")).toContainText("Tax Invoice");
  await expect(page.getByTestId("invoice-buyer")).toContainText("Customer Details");
  await expect(page.getByTestId("invoice-seller")).not.toContainText("From");
  await expect(page.getByTestId("invoice-seller")).toContainText("Saudi Arabia, Riyadh, Al Sulimaniyah");
  await expect(page.getByTestId("invoice-template")).toContainText(productName);
  await checkPalette(false);
  await page.locator('button[title="تغيير المظهر"], button[title="Toggle theme"]').evaluate((button: HTMLButtonElement) => button.click());
  await checkPalette(true);
  await checkPalette(true, true);
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
  await expect(page.getByTestId("invoice-template")).toContainText(invoiceNumber);
  await expect(page.getByTestId("invoice-qr")).toBeVisible();
  await expect.poll(() => printCalls).toBe(1);
  // Stress the rendered document without changing saved invoice amounts or fixture data.
  await preview.evaluate((sheet) => {
    const buyer = sheet.querySelector<HTMLElement>('[data-testid="invoice-buyer"]')!;
    const address = document.createElement("p");
    address.textContent = "Long customer address ".repeat(18);
    buyer.append(address);
    const tbody = sheet.querySelector<HTMLTableSectionElement>('[data-testid="invoice-table-body"]')!;
    sheet.querySelector<HTMLElement>('[data-testid="invoice-info-card"] dd')!.textContent = "E2E-LONG-INVOICE-NUMBER-".repeat(8);
    const row = tbody.querySelector("tr")!;
    for (let i = 0; i < 28; i++) {
      const copy = row.cloneNode(true) as HTMLTableRowElement;
      copy.querySelector("td")!.textContent = `Multi-line product description ${i} `.repeat(5);
      tbody.append(copy);
    }
  });
  await checkLayout(false, true);
  await checkLayout(true, true);
  await page.emulateMedia({ media: "print" });
  const multipagePdf = await page.pdf({ format: "A4", printBackground: true });
  expect(multipagePdf.subarray(0, 4).toString()).toBe("%PDF");
  expect((multipagePdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThan(1);
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkLayout(false, true);
  await page.setViewportSize({ width: 1280, height: 900 });
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
  await expect(page.getByTestId("invoice-template")).toContainText(updatedBuyer);
  await expect(page.getByTestId("invoice-template")).toContainText(updatedAddress);
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