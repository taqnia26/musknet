import { expect, test, type Page } from "@playwright/test";
import { eq, inArray, sql } from "drizzle-orm";
import {
  accountingAccountsTable,
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  db,
  journalEntriesTable,
  journalEntryAuditTable,
  journalEntryLinesTable,
} from "@workspace/db";
import { ensureStandardAccountingChart } from "../../artifacts/api-server/src/lib/accounting";
import {
  ensureAdminSeeded,
  hashAdminPassword,
} from "../../artifacts/api-server/src/lib/admin-auth";

const runId = `${Date.now()}-${process.pid}`;
const password = "accounting-e2e-password";
const viewerEmail = `accounting-view-${runId}@example.com`;
const editorEmail = `accounting-edit-${runId}@example.com`;
const entryDescription = `E2E balanced journal ${runId}`;
const reversalReason = `E2E reversal ${runId}`;
const amount = 37.25;

let viewerId: number;
let editorId: number;
let cashAccountId: number;
let capitalAccountId: number;

async function login(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.getByLabel(/البريد الإلكتروني|Email/).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByTestId("button-login-submit").click();
  await expect(page).toHaveURL(/\/admin(?:\/)?$/);
  await page.goto("/admin/accounting");
  await expect(page.getByRole("heading", { name: /المحاسبة|Accounting/ })).toBeVisible();
}

function amountFromCell(value: string | null) {
  return Number((value ?? "").replace(/[^\d.-]/g, ""));
}

async function trialAmounts(page: Page, accountId: number, allowMissing = false) {
  const row = page.getByTestId(`row-trial-account-${accountId}`);
  if (allowMissing && (await row.count()) === 0) {
    return { debit: 0, credit: 0 };
  }
  const cells = row.getByRole("cell");
  await expect(cells).toHaveCount(6);
  return {
    debit: amountFromCell(await cells.nth(3).textContent()),
    credit: amountFromCell(await cells.nth(4).textContent()),
  };
}

test.beforeAll(async () => {
  await ensureAdminSeeded();
  await ensureStandardAccountingChart();
  const permissions = await db
    .select()
    .from(adminPermissionsTable)
    .where(eq(adminPermissionsTable.module, "accounting"));
  const viewPermission = permissions.find((permission) => permission.action === "view");
  const editPermission = permissions.find((permission) => permission.action === "edit");
  if (!viewPermission || !editPermission) {
    throw new Error("Accounting view/edit permissions are not seeded");
  }

  const passwordHash = await hashAdminPassword(password);
  const [viewer, editor] = await db
    .insert(adminUsersTable)
    .values([
      { email: viewerEmail, name: "Accounting E2E Viewer", passwordHash },
      { email: editorEmail, name: "Accounting E2E Editor", passwordHash },
    ])
    .returning();
  viewerId = viewer.id;
  editorId = editor.id;
  await db.insert(adminUserPermissionsTable).values([
    { adminUserId: viewerId, permissionId: viewPermission.id },
    { adminUserId: editorId, permissionId: viewPermission.id },
    { adminUserId: editorId, permissionId: editPermission.id },
  ]);

  const accounts = await db
    .select({ id: accountingAccountsTable.id, code: accountingAccountsTable.code })
    .from(accountingAccountsTable)
    .where(inArray(accountingAccountsTable.code, ["1110", "3100"]));
  cashAccountId = accounts.find((account) => account.code === "1110")!.id;
  capitalAccountId = accounts.find((account) => account.code === "3100")!.id;
});

test.afterAll(async () => {
  const userIds = [viewerId, editorId].filter((id): id is number => Boolean(id));
  if (!userIds.length) return;

  await db.transaction(async (tx) => {
    const entries = editorId
      ? await tx
          .select({ id: journalEntriesTable.id })
          .from(journalEntriesTable)
          .where(eq(journalEntriesTable.createdBy, editorId))
      : [];
    const entryIds = entries.map((entry) => entry.id);
    if (entryIds.length) {
      await tx.execute(
        sql`alter table journal_entries disable trigger user`,
      );
      await tx.execute(
        sql`alter table journal_entry_lines disable trigger user`,
      );
      await tx
        .delete(journalEntryAuditTable)
        .where(inArray(journalEntryAuditTable.journalEntryId, entryIds));
      await tx
        .delete(journalEntryLinesTable)
        .where(inArray(journalEntryLinesTable.journalEntryId, entryIds));
      await tx
        .delete(journalEntriesTable)
        .where(inArray(journalEntriesTable.id, entryIds));
      await tx.execute(
        sql`alter table journal_entry_lines enable trigger user`,
      );
      await tx.execute(
        sql`alter table journal_entries enable trigger user`,
      );
    }
    await tx
      .delete(adminSessionsTable)
      .where(inArray(adminSessionsTable.adminUserId, userIds));
    await tx
      .delete(adminUserPermissionsTable)
      .where(inArray(adminUserPermissionsTable.adminUserId, userIds));
    await tx.delete(adminUsersTable).where(inArray(adminUsersTable.id, userIds));
  });
});

test("accounting:view can inspect every read-only tab without edit actions", async ({ page }) => {
  await login(page, viewerEmail);

  await expect(page.getByTestId("tab-accounts")).toBeVisible();
  await expect(page.locator('[data-testid^="row-account-"]').first()).toBeVisible();

  await page.getByTestId("tab-journals").click();
  await expect(page.getByTestId("input-journal-from")).toBeVisible();
  await expect(page.locator('[data-testid^="button-reverse-journal-"]')).toHaveCount(0);

  await page.getByTestId("tab-trial-balance").click();
  await expect(page.getByTestId("text-trial-total-debit")).toBeVisible();
  await expect(page.getByTestId("tab-manual-entry")).toHaveCount(0);
  await expect(page.getByTestId("button-post-journal")).toHaveCount(0);
});

test("accounting:edit rejects imbalance, posts a balanced entry, and reverses it", async ({ page }) => {
  await login(page, editorEmail);

  await page.getByTestId("tab-trial-balance").click();
  const cashBefore = await trialAmounts(page, cashAccountId, true);
  const capitalBefore = await trialAmounts(page, capitalAccountId, true);

  await page.getByTestId("tab-manual-entry").click();
  await page.getByTestId("input-entry-description").fill(entryDescription);
  await page.getByTestId("select-entry-account-0").selectOption(String(cashAccountId));
  await page.getByTestId("select-entry-account-1").selectOption(String(capitalAccountId));
  await page.getByTestId("input-entry-debit-0").fill(String(amount));
  await page.getByTestId("input-entry-credit-0").fill("0");
  await page.getByTestId("input-entry-debit-1").fill("0");
  await page.getByTestId("input-entry-credit-1").fill("37.24");
  await page.getByTestId("button-post-journal").click();
  await expect(page.getByText(/غير متوازن|Unbalanced/)).toBeVisible();
  await expect(page.getByText(entryDescription)).toHaveCount(0);

  await page.getByTestId("input-entry-credit-1").fill(String(amount));
  await page.getByTestId("button-post-journal").click();
  await expect(page.getByText(/^(تم ترحيل القيد|Journal entry posted)$/)).toBeVisible();

  await page.getByTestId("tab-journals").click();
  const originalRow = page.getByRole("row").filter({ hasText: entryDescription });
  await expect(originalRow).toBeVisible();
  await expect(originalRow).toContainText("posted");

  await page.getByTestId("tab-trial-balance").click();
  const cashPosted = await trialAmounts(page, cashAccountId);
  const capitalPosted = await trialAmounts(page, capitalAccountId);
  expect(cashPosted.debit).toBeCloseTo(cashBefore.debit + amount, 4);
  expect(capitalPosted.credit).toBeCloseTo(capitalBefore.credit + amount, 4);

  await page.getByTestId("tab-journals").click();
  await originalRow.locator('[data-testid^="button-reverse-journal-"]').click();
  await expect(page.getByRole("alertdialog")).toContainText(/تأكيد عكس القيد|Confirm journal reversal/);
  await expect(page.getByTestId("button-confirm-reversal")).toBeDisabled();
  await page.getByTestId("input-reversal-reason").fill(reversalReason);
  await page.getByTestId("button-confirm-reversal").click();
  await expect(page.getByText(/^(تم عكس القيد|Journal entry reversed)$/)).toBeVisible();

  await expect(page.getByRole("row").filter({ hasText: reversalReason })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: entryDescription })).toContainText("reversed");

  await page.getByTestId("tab-trial-balance").click();
  const cashReversed = await trialAmounts(page, cashAccountId);
  const capitalReversed = await trialAmounts(page, capitalAccountId);
  expect(cashReversed.debit).toBeCloseTo(cashBefore.debit + amount, 4);
  expect(cashReversed.credit).toBeCloseTo(cashBefore.credit + amount, 4);
  expect(capitalReversed.debit).toBeCloseTo(capitalBefore.debit + amount, 4);
  expect(capitalReversed.credit).toBeCloseTo(capitalBefore.credit + amount, 4);
});