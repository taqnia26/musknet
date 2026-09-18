import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  adminUsersTable,
  accountingAccountsTable,
  db,
  employeesTable,
  journalEntriesTable,
  journalEntryLinesTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "./admin-auth";
import {
  AccountingValidationError,
  createExpenseWithJournal,
  createPurchaseWithJournal,
  createPayrollWithJournal,
  ensureStandardAccountingChart,
  postJournalEntry,
  postSalesJournal,
  reverseJournalEntry,
  trialBalance,
} from "./accounting";

const suffix = Date.now();
const testYear = 2160 + (Math.floor(suffix / 1000) % 35);
const postingDate = `${testYear}-10-15`;
const mixedPostingDate = `${testYear}-11-15`;
let actorId: number;
let token: string;
let cashAccountId: number;
let capitalAccountId: number;

const journal = (sourceId: string, amount = "10.0000") => ({
  entryDate: postingDate,
  description: `Accounting test ${sourceId}`,
  createdBy: actorId,
  sourceType: "accounting_test",
  sourceId,
  lines: [
    { accountCode: "1110", debit: amount },
    { accountCode: "3100", credit: amount },
  ],
});

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `accounting-seed-${suffix}@example.com`;
  process.env.ADMIN_PASSWORD = "accounting-test-password";
  const [actor] = await db.insert(adminUsersTable).values({
    email: `accounting-actor-${suffix}@example.com`,
    name: "Accounting Actor",
    passwordHash: await hashAdminPassword("accounting-test-password"),
    isSuperAdmin: true,
  }).returning();
  actorId = actor.id;
  token = await createAdminSession(actorId);
  await ensureStandardAccountingChart();
  const accounts = await db.select({ id: accountingAccountsTable.id, code: accountingAccountsTable.code })
    .from(accountingAccountsTable);
  cashAccountId = accounts.find((account) => account.code === "1110")!.id;
  capitalAccountId = accounts.find((account) => account.code === "3100")!.id;
});

describe.sequential("exact double-entry accounting", () => {
  it("rejects imbalanced entries in the service and API", async () => {
    await expect(postJournalEntry({
      ...journal(`imbalance-${suffix}`),
      lines: [
        { accountCode: "1110", debit: "10.0000" },
        { accountCode: "3100", credit: "9.9999" },
      ],
    })).rejects.toBeInstanceOf(AccountingValidationError);
    await request(app).post("/api/admin/accounting/journal-entries")
      .set({ Authorization: `Bearer ${token}` })
      .send({
        entryDate: postingDate,
        description: "Bad API journal",
        lines: [
          { accountId: cashAccountId, debit: "1.0000", credit: "0.0000" },
          { accountId: capitalAccountId, debit: "0.0000", credit: "0.9999" },
        ],
      }).expect(400);
  });

  it("posts one source once under concurrency and allocates sequential numbers", async () => {
    const source = `same-${suffix}`;
    const [first, retry, next] = await Promise.all([
      postJournalEntry(journal(source)),
      postJournalEntry(journal(source)),
      postJournalEntry(journal(`next-${suffix}`, "20.0000")),
    ]);
    expect(first.id).toBe(retry.id);
    const numbers = [first.entryNumber, next.entryNumber]
      .map((value) => Number(value.slice(3))).sort((a, b) => a - b);
    expect(numbers[1] - numbers[0]).toBe(1);
  });

  it("enforces database immutability and uses a reversing entry", async () => {
    const entry = await postJournalEntry(journal(`immutable-${suffix}`, "30.0000"));
    await expect(db.update(journalEntryLinesTable).set({ debit: "31.0000" })
      .where(eq(journalEntryLinesTable.journalEntryId, entry.id))).rejects.toThrow();
    await expect(db.update(journalEntriesTable).set({ status: "reversed" })
      .where(eq(journalEntriesTable.id, entry.id))).rejects.toThrow();
    const reversal = await reverseJournalEntry(entry.id, actorId, "Accounting test reversal");
    const retry = await reverseJournalEntry(entry.id, actorId, "Accounting test reversal");
    expect(retry.id).toBe(reversal.id);
    const [original] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, entry.id));
    expect(original.status).toBe("reversed");
  });

  it("uses the generated manual-journal request and response contract", async () => {
    const response = await request(app).post("/api/admin/accounting/journal-entries")
      .set({ Authorization: `Bearer ${token}` })
      .send({
        entryDate: postingDate,
        description: "Generated contract journal",
        lines: [
          { accountId: cashAccountId, debit: "12.3400", credit: "0.0000" },
          { accountId: capitalAccountId, debit: "0.0000", credit: "12.3400" },
        ],
      }).expect(201);
    expect(response.body).toMatchObject({ status: "posted", lines: expect.any(Array) });
    expect(response.body.lines).toHaveLength(2);
    expect(response.body.lines[0]).toMatchObject({ accountId: cashAccountId, debit: "12.3400", credit: "0.0000" });
    const reversal = await request(app).post(`/api/admin/accounting/journal-entries/${response.body.id}/reverse`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ entryDate: postingDate, description: "Generated contract reversal" }).expect(201);
    expect(reversal.body).toMatchObject({ status: "posted", reversalOfEntryId: response.body.id, lines: expect.any(Array) });
    const reversalRetry = await request(app).post(`/api/admin/accounting/journal-entries/${response.body.id}/reverse`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ entryDate: postingDate, description: "Generated contract reversal" }).expect(201);
    expect(reversalRetry.body).toMatchObject({
      id: reversal.body.id,
      reversalOfEntryId: response.body.id,
      lines: expect.any(Array),
    });
    expect(reversalRetry.body.lines).toHaveLength(2);
  });

  it("lists historical journal details with source and posting actors", async () => {
    const entry = await postJournalEntry(journal(`history-${suffix}`, "42.5000"));
    const response = await request(app)
      .get(`/api/admin/accounting/journal-entries?from=${postingDate}&to=${postingDate}`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    const listed = response.body.find((item: { id: number }) => item.id === entry.id);
    expect(listed).toMatchObject({
      sourceType: "accounting_test",
      sourceId: `history-${suffix}`,
      creator: { id: actorId, name: "Accounting Actor" },
      poster: { id: actorId, name: "Accounting Actor" },
      lines: expect.any(Array),
    });
    expect(listed.lines).toHaveLength(2);
    await request(app)
      .get(`/api/admin/accounting/journal-entries?from=${postingDate}&to=2000-01-01`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(400);
  });

  it("posts sales, expense, and paid payroll atomically and balances mixed exact amounts", async () => {
    const before = await trialBalance(mixedPostingDate, mixedPostingDate);
    await db.transaction((tx) => postSalesJournal({
      id: 1_900_000_000 + (suffix % 99_999_999),
      orderNumber: `ACC-SALE-${suffix}`,
      subtotal: 100,
      shippingCost: 20,
      discount: 5,
      total: 130,
      tax: 15,
      createdAt: new Date(`${mixedPostingDate}T12:00:00.000Z`),
    }, actorId, tx));
    const expenseValues = {
      category: "utilities",
      amount: 80,
      description: `Accounting utility ${suffix}`,
      expenseDate: mixedPostingDate,
      createdBy: actorId,
    } as const;
    const [expense, expenseRetry] = await Promise.all([
      createExpenseWithJournal(expenseValues, `accounting-expense-${suffix}`),
      createExpenseWithJournal(expenseValues, `accounting-expense-${suffix}`),
    ]);
    expect(expenseRetry.id).toBe(expense.id);
    const [employee] = await db.insert(employeesTable).values({
      name: `Accounting Employee ${suffix}`,
      nationalId: `ACC-${suffix}`,
      phone: `05${String(suffix).slice(-8)}`,
      position: "Tester",
      department: "Accounting",
      salary: 5000,
      hireDate: `${testYear}-01-01`,
    }).returning();
    const payroll = await createPayrollWithJournal({
      employeeId: employee.id,
      month: 11,
      year: testYear,
      baseSalary: 5000,
      deductions: 250,
      bonuses: 400,
      netSalary: 5150,
      paymentDate: mixedPostingDate,
      paymentStatus: "paid",
    }, actorId);
    const retry = await createPayrollWithJournal({
      employeeId: employee.id,
      month: 11,
      year: testYear,
      baseSalary: 5000,
      deductions: 250,
      bonuses: 400,
      netSalary: 5150,
      paymentDate: mixedPostingDate,
      paymentStatus: "paid",
    }, actorId);
    expect(retry.id).toBe(payroll.id);

    const balance = await trialBalance(mixedPostingDate, mixedPostingDate);
    expect(balance.totals.difference).toBe("0.0000");
    const scaled = (value: string) => BigInt(value.replace(".", ""));
    expect(scaled(balance.totals.debit) - scaled(before.totals.debit)).toBe(53_650_000n);
    expect(scaled(balance.totals.credit) - scaled(before.totals.credit)).toBe(53_650_000n);
    const throughAsOf = await trialBalance(undefined, mixedPostingDate);
    const api = await request(app).get(`/api/admin/accounting/trial-balance?as_of=${mixedPostingDate}`)
      .set({ Authorization: `Bearer ${token}` }).expect(200);
    expect(api.body).toMatchObject({
      asOf: expect.any(String),
      totalDebit: throughAsOf.totals.debit,
      totalCredit: throughAsOf.totals.credit,
      isBalanced: true,
    });
  });

  it("posts owner-paid purchases to owner payable and is idempotent", async () => {
    const values = {
      title: `Owner oils ${suffix}`,
      description: "Exact purchase test",
      amount: "125.0000",
      purchaseDate: mixedPostingDate,
      notes: null,
      category: "direct_materials_oils",
      paymentSource: "owner_account",
      invoiceObjectPath: null,
      invoiceContentType: null,
      invoiceSize: null,
      createdBy: actorId,
    } as const;
    const [purchase, concurrentRetry] = await Promise.all([
      createPurchaseWithJournal(values, `purchase-test-${suffix}`),
      createPurchaseWithJournal({ ...values, amount: "125" }, `purchase-test-${suffix}`),
    ]);
    const retry = concurrentRetry;
    expect(retry.id).toBe(purchase.id);
    await expect(createPurchaseWithJournal({ ...values, description: "Different payload" }, `purchase-test-${suffix}`))
      .rejects.toThrow("idempotency key was already used with different values");
    const [entry] = await db.select().from(journalEntriesTable)
      .where(and(
        eq(journalEntriesTable.sourceType, "purchase"),
        eq(journalEntriesTable.sourceId, String(purchase.id)),
      )).limit(1);
    const lines = await db.select().from(journalEntryLinesTable)
      .where(eq(journalEntryLinesTable.journalEntryId, entry.id));
    expect(lines).toHaveLength(2);
    const accounts = await db.select().from(accountingAccountsTable);
    expect(lines.map((line) => accounts.find((account) => account.id === line.accountId)?.code)).toEqual(expect.arrayContaining(["5100", "2140"]));
  });
});