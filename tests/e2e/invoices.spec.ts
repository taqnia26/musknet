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
    sellerName: "Musk Ellolo Test Seller",
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
  await expect(page.getByRole("heading", { name: /مبيعات الشركات|Company Sales/ })).toBeVisible();
  const row = page.getByTestId(`invoice-row-${invoiceId}`);
  await expect(row).toContainText(invoiceNumber);

  await page.getByTestId(`invoice-actions-${invoiceId}`).click();
  await page.getByText(/معاينة الفاتورة|Preview Invoice/, { exact: true }).click();
  const preview = page.getByTestId("invoice-template");
  await expect(preview).toContainText("Musk Ellolo Test Seller");
  await expect(preview).toContainText(`Test buyer ${runId}`);
  await expect(preview).toContainText(productName);
  await expect(preview).toContainText("15.00");
  await expect(preview).toContainText("115.00");
  await expect(page.getByTestId("invoice-qr")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();

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
  await page.getByRole("button", { name: "Close", exact: true }).click();

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
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByTestId(`invoice-actions-${invoiceId}`).click();
  await page.getByText(/إرسال بالبريد|Email Invoice/, { exact: true }).click();
  await page.getByTestId("invoice-email-recipient").fill("not-an-email");
  await page.getByTestId("button-draft-invoice-email").click();
  await expect(page.getByRole("alert")).toContainText(/عنوان بريد إلكتروني صالح|valid email address/);
  await page.getByTestId("invoice-email-recipient").fill("client@example.com");
  const mailto = decodeURIComponent((await page.getByTestId("button-draft-invoice-email").getAttribute("data-mailto")) ?? "");
  expect(mailto).toContain("client@example.com");
  expect(mailto).toContain(invoiceNumber);
  expect(mailto.toLowerCase()).not.toContain("attachment");
  expect(mailto).not.toContain("مرفق");
  await page.getByTestId("button-draft-invoice-email").click();
  await expect(page.getByTestId("invoice-email-recipient")).toHaveCount(0);

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