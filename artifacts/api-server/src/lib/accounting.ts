import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  accountingAccountsTable,
  db,
  expenseCategoryAccountMappingsTable,
  expensesTable,
  journalEntriesTable,
  journalEntryAuditTable,
  journalEntryLinesTable,
  payrollRecordsTable,
  purchasesTable,
  seedStandardRetailChart,
} from "@workspace/db";

const JOURNAL_NUMBER_LOCK = 7_521_010_002;
const SCALE = 10_000n;

type Executor = any;
type MoneyInput = string | number;
export type JournalLineInput = { accountCode: string; debit?: MoneyInput; credit?: MoneyInput; description?: string };
export type PostJournalInput = {
  entryDate: string;
  description: string;
  createdBy: number;
  sourceType?: string;
  sourceId?: string;
  reversalOfEntryId?: number;
  lines: JournalLineInput[];
};

export class AccountingValidationError extends Error {}
export class AccountingConflictError extends Error {}
export class AccountingNotFoundError extends Error {}

function scaled(value: MoneyInput | undefined): bigint {
  if (value === undefined) return 0n;
  if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 10_000)) {
    throw new AccountingValidationError(`Money number is outside the supported range: ${String(value)}`);
  }
  // Legacy operational tables store money as double precision. Canonicalize
  // those source values once at the ledger boundary; string/API inputs remain
  // strict and must already contain at most four fractional digits.
  const raw = typeof value === "number"
    ? value.toFixed(4)
    : value.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(raw);
  if (!match) throw new AccountingValidationError(`Invalid exact money amount: ${String(value)}`);
  const amount = BigInt(match[2]) * SCALE + BigInt((match[3] ?? "").padEnd(4, "0"));
  return match[1] ? -amount : amount;
}

export function exactMoney(value: MoneyInput | undefined): string {
  const amount = scaled(value);
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  return `${sign}${absolute / SCALE}.${String(absolute % SCALE).padStart(4, "0")}`;
}

function isoDate(value: string | Date) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

export async function ensureStandardAccountingChart() {
  await seedStandardRetailChart(db);
}

async function existingSource(executor: Executor, sourceType?: string, sourceId?: string) {
  if (!sourceType || !sourceId) return undefined;
  const [entry] = await executor.select().from(journalEntriesTable).where(and(
    eq(journalEntriesTable.sourceType, sourceType),
    eq(journalEntriesTable.sourceId, sourceId),
  )).limit(1);
  return entry;
}

async function assertIdempotent(executor: Executor, entry: typeof journalEntriesTable.$inferSelect, input: PostJournalInput) {
  const rows = await executor.select({
    accountCode: accountingAccountsTable.code,
    debit: journalEntryLinesTable.debit,
    credit: journalEntryLinesTable.credit,
    description: journalEntryLinesTable.description,
  }).from(journalEntryLinesTable)
    .innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
    .where(eq(journalEntryLinesTable.journalEntryId, entry.id))
    .orderBy(asc(journalEntryLinesTable.lineNumber));
  const requested = input.lines.map((line) => ({
    accountCode: line.accountCode,
    debit: exactMoney(line.debit),
    credit: exactMoney(line.credit),
    description: line.description ?? null,
  }));
  if (
    entry.entryDate !== input.entryDate ||
    entry.description !== input.description ||
    JSON.stringify(rows) !== JSON.stringify(requested)
  ) {
    throw new AccountingConflictError(`Source ${input.sourceType}:${input.sourceId} is already posted with different values`);
  }
  return journalWithLines(executor, entry);
}

async function journalWithLines(executor: Executor, entry: typeof journalEntriesTable.$inferSelect) {
  const lines = await executor.select().from(journalEntryLinesTable)
    .where(eq(journalEntryLinesTable.journalEntryId, entry.id))
    .orderBy(journalEntryLinesTable.lineNumber);
  return { ...entry, lines };
}

async function postInTransaction(executor: Executor, input: PostJournalInput) {
  if ((input.sourceType === undefined) !== (input.sourceId === undefined)) {
    throw new AccountingValidationError("sourceType and sourceId must be supplied together");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate) || !input.description.trim()) {
    throw new AccountingValidationError("A valid entry date and description are required");
  }
  if (input.lines.length < 2) throw new AccountingValidationError("A journal entry requires at least two lines");

  let debitTotal = 0n;
  let creditTotal = 0n;
  const normalized = input.lines.map((line) => {
    const debit = scaled(line.debit);
    const credit = scaled(line.credit);
    if ((debit > 0n) === (credit > 0n) || debit < 0n || credit < 0n) {
      throw new AccountingValidationError("Each journal line must have exactly one positive debit or credit");
    }
    debitTotal += debit;
    creditTotal += credit;
    return { ...line, debit: exactMoney(line.debit), credit: exactMoney(line.credit) };
  });
  if (debitTotal !== creditTotal) {
    throw new AccountingValidationError(`Journal entry is not balanced: debit ${exactMoneyFromScaled(debitTotal)}, credit ${exactMoneyFromScaled(creditTotal)}`);
  }

  const beforeLock = await existingSource(executor, input.sourceType, input.sourceId);
  if (beforeLock) return assertIdempotent(executor, beforeLock, input);
  await executor.execute(sql`select pg_advisory_xact_lock(${JOURNAL_NUMBER_LOCK})`);
  const afterLock = await existingSource(executor, input.sourceType, input.sourceId);
  if (afterLock) return assertIdempotent(executor, afterLock, input);

  const accounts = await executor.select().from(accountingAccountsTable)
    .where(inArray(accountingAccountsTable.code, normalized.map((line) => line.accountCode)));
  const byCode = new Map<string, typeof accountingAccountsTable.$inferSelect>(
    accounts.map((account: typeof accountingAccountsTable.$inferSelect) => [account.code, account]),
  );
  for (const line of normalized) {
    const account = byCode.get(line.accountCode);
    if (!account) throw new AccountingNotFoundError(`Accounting account ${line.accountCode} was not found`);
    if (!account.isActive || !account.isPosting) {
      throw new AccountingValidationError(`Accounting account ${line.accountCode} does not accept postings`);
    }
  }

  const [{ next }] = await executor.select({
    next: sql<number>`coalesce(max(cast(substring(${journalEntriesTable.entryNumber} from 4) as integer)), 0) + 1`,
  }).from(journalEntriesTable);
  const entryNumber = `JE-${String(Number(next)).padStart(8, "0")}`;
  const now = new Date();
  const [draft] = await executor.insert(journalEntriesTable).values({
    entryNumber,
    entryDate: input.entryDate,
    description: input.description.trim(),
    status: "draft",
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    createdBy: input.createdBy,
  }).returning();
  await executor.insert(journalEntryLinesTable).values(normalized.map((line, index) => ({
    journalEntryId: draft.id,
    lineNumber: index + 1,
    accountId: byCode.get(line.accountCode)!.id,
    description: line.description,
    debit: line.debit,
    credit: line.credit,
  })));
  const [entry] = await executor.update(journalEntriesTable).set({
    status: "posted", postedBy: input.createdBy, postedAt: now, updatedAt: now,
    reversalOfEntryId: input.reversalOfEntryId,
  }).where(eq(journalEntriesTable.id, draft.id)).returning();
  await executor.insert(journalEntryAuditTable).values({
    journalEntryId: entry.id,
    action: "posted",
    actorId: input.createdBy,
    changes: { sourceType: input.sourceType, sourceId: input.sourceId },
  });
  return journalWithLines(executor, entry);
}

function exactMoneyFromScaled(amount: bigint) {
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  return `${sign}${absolute / SCALE}.${String(absolute % SCALE).padStart(4, "0")}`;
}

export async function postJournalEntry(input: PostJournalInput, executor?: Executor) {
  if (executor) return postInTransaction(executor, input);
  await ensureStandardAccountingChart();
  return db.transaction((tx) => postInTransaction(tx, input));
}

export async function reverseJournalEntry(entryId: number, actorId: number, reason: string, reversalDate?: string) {
  if (!reason.trim()) throw new AccountingValidationError("A reversal reason is required");
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${journalEntriesTable} where ${journalEntriesTable.id} = ${entryId} for update`);
    const [original] = await tx.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, entryId)).limit(1);
    if (!original) throw new AccountingNotFoundError("Journal entry was not found");
    const [existing] = await tx.select().from(journalEntriesTable)
      .where(eq(journalEntriesTable.reversalOfEntryId, entryId)).limit(1);
    if (existing) return journalWithLines(tx, existing);
    if (original.status !== "posted") throw new AccountingConflictError("Only a posted journal entry can be reversed");
    const lines = await tx.select({
      accountCode: accountingAccountsTable.code,
      debit: journalEntryLinesTable.debit,
      credit: journalEntryLinesTable.credit,
      description: journalEntryLinesTable.description,
    }).from(journalEntryLinesTable)
      .innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
      .where(eq(journalEntryLinesTable.journalEntryId, entryId))
      .orderBy(journalEntryLinesTable.lineNumber);
    const reversal = await postInTransaction(tx, {
      entryDate: reversalDate ?? new Date().toISOString().slice(0, 10),
      description: `${reason.trim()} (${original.entryNumber})`,
      createdBy: actorId,
      sourceType: "reversal",
      sourceId: String(entryId),
      reversalOfEntryId: entryId,
      lines: lines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.credit,
        credit: line.debit,
        description: line.description ?? undefined,
      })),
    });
    await tx.update(journalEntriesTable).set({ status: "reversed", updatedAt: new Date() })
      .where(eq(journalEntriesTable.id, original.id));
    await tx.insert(journalEntryAuditTable).values({
      journalEntryId: original.id, action: "reversed", actorId, changes: { reversalEntryId: reversal.id, reason: reason.trim() },
    });
    return reversal;
  });
}

export async function createExpenseWithJournal(
  values: typeof expensesTable.$inferInsert,
  idempotencyKey?: string,
) {
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    const key = idempotencyKey?.trim();
    if (key) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"expense:" + key}, 0))`);
      const [existing] = await tx.select().from(expensesTable)
        .where(eq(expensesTable.idempotencyKey, key)).limit(1);
      if (existing) {
        const same = existing.category === values.category &&
          scaled(existing.amount) === scaled(values.amount) &&
          existing.description === values.description &&
          existing.expenseDate === values.expenseDate &&
          existing.receiptUrl === (values.receiptUrl ?? null) &&
          existing.createdBy === values.createdBy;
        if (!same) throw new AccountingConflictError("Expense idempotency key was already used with different values");
        return existing;
      }
    }
    const [expense] = await tx.insert(expensesTable).values({ ...values, idempotencyKey: key || null }).returning();
    const [mapping] = await tx.select({ code: accountingAccountsTable.code })
      .from(expenseCategoryAccountMappingsTable)
      .innerJoin(accountingAccountsTable, eq(expenseCategoryAccountMappingsTable.accountId, accountingAccountsTable.id))
      .where(eq(expenseCategoryAccountMappingsTable.category, expense.category)).limit(1);
    if (!mapping) throw new AccountingNotFoundError(`No account mapping exists for expense category ${expense.category}`);
    await postInTransaction(tx, {
      entryDate: expense.expenseDate,
      description: expense.description,
      createdBy: expense.createdBy,
      sourceType: "expense",
      sourceId: String(expense.id),
      lines: [
        { accountCode: mapping.code, debit: expense.amount },
        { accountCode: "1120", credit: expense.amount },
      ],
    });
    return expense;
  });
}

const purchaseAccountCodes: Record<string, string> = {
  direct_materials_oils: "5100", travel_tickets: "6190", meeting_hospitality: "6190",
  shipping: "6150", marketing: "6140", utilities: "6130", other: "6190",
};

export async function createPurchaseWithJournal(
  values: typeof purchasesTable.$inferInsert,
  idempotencyKey?: string,
) {
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    const key = idempotencyKey?.trim() || null;
    if (key) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"purchase:" + key}, 0))`);
      const [existing] = await tx.select().from(purchasesTable).where(eq(purchasesTable.idempotencyKey, key)).limit(1);
      if (existing) {
        const same = existing.title === values.title &&
          existing.description === values.description &&
          exactMoney(existing.amount) === exactMoney(values.amount) &&
          existing.purchaseDate === values.purchaseDate &&
          (existing.notes ?? null) === (values.notes ?? null) &&
          existing.category === values.category &&
          existing.paymentSource === values.paymentSource &&
          (existing.invoiceObjectPath ?? null) === (values.invoiceObjectPath ?? null) &&
          (existing.invoiceContentType ?? null) === (values.invoiceContentType ?? null) &&
          (existing.invoiceSize ?? null) === (values.invoiceSize ?? null) &&
          existing.createdBy === values.createdBy;
        if (!same) {
          throw new AccountingConflictError("Purchase idempotency key was already used with different values");
        }
        return existing;
      }
    }
    const [purchase] = await tx.insert(purchasesTable).values({ ...values, idempotencyKey: key }).returning();
    await postInTransaction(tx, {
      entryDate: purchase.purchaseDate,
      description: `Purchase: ${purchase.title}`,
      createdBy: purchase.createdBy,
      sourceType: "purchase",
      sourceId: String(purchase.id),
      lines: [
        { accountCode: purchaseAccountCodes[purchase.category] ?? "6190", debit: purchase.amount },
        { accountCode: purchase.paymentSource === "owner_account" ? "2140" : "1120", credit: purchase.amount },
      ],
    });
    return purchase;
  });
}

export async function createPayrollWithJournal(values: typeof payrollRecordsTable.$inferInsert, actorId: number) {
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${
      `payroll:${values.employeeId}:${values.year}:${values.month}`
    }, 0))`);
    if (scaled(values.netSalary) !== scaled(values.baseSalary) + scaled(values.bonuses) - scaled(values.deductions)) {
      throw new AccountingValidationError("Payroll net salary does not match base salary plus bonuses minus deductions");
    }
    const [existing] = await tx.select().from(payrollRecordsTable).where(and(
      eq(payrollRecordsTable.employeeId, values.employeeId),
      eq(payrollRecordsTable.month, values.month),
      eq(payrollRecordsTable.year, values.year),
    )).limit(1);
    if (existing) {
      const same = existing.baseSalary === values.baseSalary && existing.deductions === values.deductions &&
        existing.bonuses === values.bonuses && existing.netSalary === values.netSalary &&
        existing.paymentStatus === values.paymentStatus && existing.paymentDate === (values.paymentDate ?? null);
      if (!same) throw new AccountingConflictError("Payroll period already exists with different values");
      return existing;
    }
    const [payroll] = await tx.insert(payrollRecordsTable).values(values).returning();
    if (payroll.paymentStatus === "paid") {
      await postInTransaction(tx, {
        entryDate: payroll.paymentDate ?? `${payroll.year}-${String(payroll.month).padStart(2, "0")}-01`,
        description: `Payroll ${payroll.year}-${String(payroll.month).padStart(2, "0")}`,
        createdBy: actorId,
        sourceType: "payroll",
        sourceId: String(payroll.id),
        lines: [
          { accountCode: "6120", debit: payroll.netSalary },
          { accountCode: "1120", credit: payroll.netSalary },
        ],
      });
    }
    return payroll;
  });
}

export async function postSalesJournal(
  order: {
    id: number; orderNumber: string; subtotal: number; shippingCost: number;
    discount: number; total: number; tax: number; createdAt: Date;
  },
  actorId: number,
  executor: Executor,
) {
  const total = scaled(order.total);
  const subtotal = scaled(order.subtotal);
  const shipping = scaled(order.shippingCost);
  const discount = scaled(order.discount);
  const tax = scaled(order.tax);
  const legacyTotals = total + discount === subtotal + shipping + tax;
  const inclusiveTotals = total === subtotal - discount + shipping;
  if (total < 0n || subtotal < 0n || shipping < 0n || discount < 0n || discount > subtotal || tax < 0n ||
    (!legacyTotals && !inclusiveTotals)) {
    throw new AccountingValidationError("Order totals must satisfy total + discount = subtotal + shipping + tax");
  }
  const inclusiveProductRevenue = (subtotal * 100n + 57n) / 115n;
  const inclusiveProductRevenueAfterDiscount = ((subtotal - discount) * 100n + 57n) / 115n;
  const inclusiveDiscount = inclusiveProductRevenue - inclusiveProductRevenueAfterDiscount;
  const inclusiveShippingRevenue = total - tax - inclusiveProductRevenueAfterDiscount;
  if (inclusiveTotals && !legacyTotals && inclusiveShippingRevenue < 0n) {
    throw new AccountingValidationError("Inclusive order tax allocation exceeds the shipping and product gross");
  }
  return postInTransaction(executor, {
    entryDate: isoDate(order.createdAt),
    description: `Paid sale ${order.orderNumber}`,
    createdBy: actorId,
    sourceType: "order",
    sourceId: String(order.id),
    lines: [
      { accountCode: "1120", debit: exactMoneyFromScaled(total) },
      ...(inclusiveTotals && !legacyTotals
        ? [
          ...(inclusiveProductRevenue > 0n ? [{ accountCode: "4100", credit: exactMoneyFromScaled(inclusiveProductRevenue) }] : []),
          ...(inclusiveShippingRevenue > 0n ? [{ accountCode: "4110", credit: exactMoneyFromScaled(inclusiveShippingRevenue) }] : []),
          ...(inclusiveDiscount > 0n ? [{ accountCode: "4190", debit: exactMoneyFromScaled(inclusiveDiscount) }] : []),
        ]
        : [
          ...(subtotal > 0n ? [{ accountCode: "4100", credit: exactMoneyFromScaled(subtotal) }] : []),
          ...(shipping > 0n ? [{ accountCode: "4110", credit: exactMoneyFromScaled(shipping) }] : []),
          ...(discount > 0n ? [{ accountCode: "4190", debit: exactMoneyFromScaled(discount) }] : []),
        ]),
      ...(tax > 0n ? [{ accountCode: "2120", credit: exactMoneyFromScaled(tax) }] : []),
    ],
  });
}

export async function trialBalance(from?: string, to?: string) {
  const filters = [
    inArray(journalEntriesTable.status, ["posted", "reversed"]),
    ...(from ? [sql`${journalEntriesTable.entryDate} >= ${from}`] : []),
    ...(to ? [sql`${journalEntriesTable.entryDate} <= ${to}`] : []),
  ];
  const rows = await db.select({
    accountId: accountingAccountsTable.id,
    accountCode: accountingAccountsTable.code,
    nameAr: accountingAccountsTable.nameAr,
    nameEn: accountingAccountsTable.nameEn,
    accountType: accountingAccountsTable.accountType,
    normalBalance: accountingAccountsTable.normalBalance,
    debit: sql<string>`coalesce(sum(${journalEntryLinesTable.debit}), 0)::text`,
    credit: sql<string>`coalesce(sum(${journalEntryLinesTable.credit}), 0)::text`,
  }).from(journalEntryLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntryLinesTable.journalEntryId, journalEntriesTable.id))
    .innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
    .where(and(...filters))
    .groupBy(accountingAccountsTable.id)
    .orderBy(accountingAccountsTable.code);
  const debit = rows.reduce((total, row) => total + scaled(row.debit), 0n);
  const credit = rows.reduce((total, row) => total + scaled(row.credit), 0n);
  const difference = debit - credit;
  if (difference !== 0n) throw new Error(`Trial balance invariant failed: ${exactMoneyFromScaled(difference)}`);
  return {
    accounts: rows.map((row) => {
      const debit = exactMoney(row.debit);
      const credit = exactMoney(row.credit);
      const closing = scaled(debit) - scaled(credit);
      return {
        ...row,
        debit,
        credit,
        accountNameAr: row.nameAr,
        accountNameEn: row.nameEn,
        openingBalance: "0.0000",
        totalDebit: debit,
        totalCredit: credit,
        closingBalance: exactMoneyFromScaled(row.normalBalance === "debit" ? closing : -closing),
      };
    }),
    totals: {
      debit: exactMoneyFromScaled(debit),
      credit: exactMoneyFromScaled(credit),
      difference: exactMoneyFromScaled(difference),
    },
  };
}