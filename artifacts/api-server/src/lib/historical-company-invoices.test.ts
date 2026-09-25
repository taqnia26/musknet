import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  accountingAccountsTable, adminUsersTable, db, inventoryMovementsTable, invoiceItemsTable, invoicesTable,
  journalEntriesTable, journalEntryAuditTable, journalEntryLinesTable, operationEventsTable,
  receivablePaymentsTable, shipmentsTable, wholesaleDistributorsTable,
} from "@workspace/db";
import { createHistoricalInvoice, reconcileHistoricalInvoice, type HistoricalInvoiceInput } from "./historical-company-invoices";
import { createReceivablePayment, DistributorInvoiceConflictError, nextLiveInvoiceNumber } from "./invoices";

const key = `historical-test-${Date.now()}`;
let distributorId: number;
let actorId: number;
let reservedInvoiceId: number;
const invoiceIds: number[] = [];
const input = (): HistoricalInvoiceInput => ({
  creationKey: `${key}-create`, distributorId, invoiceNumber: `${key}-external`,
  issueDate: "2026-07-13", dueDate: "2026-08-13", buyerName: `${key}-buyer`,
  sellerName: "Original seller", sellerVatNumber: "300000000000003", taxTreatment: "domestic",
  subtotal: 180, discountAmount: 23, vatAmount: 27, totalAmount: 207,
  items: [{ productName: "Discontinued perfume", sku: "OLD-1", quantity: 2, unitPrice: 115, subtotal: 180, vatAmount: 27, totalAmount: 207 }],
  payments: [{ paymentKey: `${key}-initial-payment`, paymentDate: "2026-07-20", amount: 50, paymentMethod: "bank_transfer", reference: `${key}-receipt` }],
});

beforeAll(async () => {
  const [actor] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).limit(1);
  if (!actor) throw new Error("Seed an admin before invoice tests");
  actorId = actor.id;
  const [company] = await db.insert(wholesaleDistributorsTable).values({
    companyName: `${key}-buyer`, contactName: "Test", phone: `055${String(Date.now()).slice(-7)}`,
  }).returning({ id: wholesaleDistributorsTable.id });
  distributorId = company.id;
});
afterAll(async () => {
  if (invoiceIds.length) {
    const payments = await db.select({ id: receivablePaymentsTable.id }).from(receivablePaymentsTable)
      .where(inArray(receivablePaymentsTable.invoiceId, invoiceIds));
    await db.transaction(async tx => {
      await tx.execute(sql`set local session_replication_role = 'replica'`);
      const entries = await tx.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(
        sql`(${journalEntriesTable.sourceType} = 'historical_company_invoice' and ${journalEntriesTable.sourceId} in (${sql.join(invoiceIds.map(id => sql`${String(id)}`), sql`, `)}))
          or (${journalEntriesTable.sourceType} = 'receivable_payment' and ${journalEntriesTable.sourceId} in (${sql.join(payments.map(p => sql`${String(p.id)}`), sql`, `)}))`);
      if (entries.length) {
        await tx.delete(journalEntryAuditTable).where(inArray(journalEntryAuditTable.journalEntryId, entries.map(e => e.id)));
        await tx.delete(journalEntryLinesTable).where(inArray(journalEntryLinesTable.journalEntryId, entries.map(e => e.id)));
        await tx.delete(journalEntriesTable).where(inArray(journalEntriesTable.id, entries.map(e => e.id)));
      }
      await tx.delete(operationEventsTable).where(and(eq(operationEventsTable.sourceType, "receivable_payment"), inArray(operationEventsTable.sourceId, payments.map(p => String(p.id)))));
      await tx.delete(receivablePaymentsTable).where(inArray(receivablePaymentsTable.invoiceId, invoiceIds));
      await tx.delete(invoiceItemsTable).where(inArray(invoiceItemsTable.invoiceId, invoiceIds));
      await tx.delete(invoicesTable).where(inArray(invoicesTable.id, invoiceIds));
    });
  }
  await db.delete(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, distributorId));
});

describe.sequential("historical company invoices", () => {
  it("previews and blocks an already posted invoice or a possibly matching Master Sales month", async () => {
    expect((await reconcileHistoricalInvoice(input())).conflicts).toEqual([]);
    const [duplicate] = await db.insert(invoicesTable).values({
      distributorId, sequenceNumber: -1_000_000_000 - distributorId, invoiceNumber: input().invoiceNumber,
      sellerName: "test", sellerVatNumber: "test", issueDatetime: new Date("2026-07-13T12:00:00Z"),
      subtotal: 1, vatAmount: 0, totalAmount: 1, qrCodeData: "",
    }).returning();
    invoiceIds.push(duplicate.id);
    expect((await reconcileHistoricalInvoice(input())).conflicts).toContain(`Invoice #${duplicate.id}: ${duplicate.invoiceNumber}`);
    await expect(createHistoricalInvoice(input(), actorId)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    await db.transaction(async tx => {
      await tx.execute(sql`set local session_replication_role = 'replica'`);
      await tx.delete(invoicesTable).where(eq(invoicesTable.id, duplicate.id));
    });
    invoiceIds.splice(invoiceIds.indexOf(duplicate.id), 1);
    const [entry] = await db.insert(journalEntriesTable).values({
      entryNumber: `JE-99999999`, entryDate: "2026-07-01", description: "Legacy sale; retailer alias unknown",
      sourceType: "historical_import", sourceId: key, createdBy: actorId, status: "draft",
    }).returning();
    expect((await reconcileHistoricalInvoice(input())).conflicts).toContain(`Master Sales journal #${entry.id}`);
    await db.transaction(async tx => {
      await tx.execute(sql`set local session_replication_role = 'replica'`);
      await tx.delete(journalEntriesTable).where(eq(journalEntriesTable.id, entry.id));
    });
  });
  it("posts the original sale and collections once under concurrent retries without touching stock", async () => {
    const before = await db.select({ count: sql<number>`count(*)` }).from(inventoryMovementsTable);
    const shipmentsBefore = await db.select({ count: sql<number>`count(*)` }).from(shipmentsTable);
    const [a, b] = await Promise.all([createHistoricalInvoice(input(), actorId), createHistoricalInvoice(input(), actorId)]);
    invoiceIds.push(a.id);
    expect(a.id).toBe(b.id);
    expect(a).toMatchObject({ invoiceNumber: input().invoiceNumber, historical: "yes", subtotal: 180, discountAmount: 23, vatAmount: 27, totalAmount: 207 });
    expect(a.sequenceNumber).toBeLessThan(0);
    expect(a.issueDatetime.toISOString().slice(0, 10)).toBe("2026-07-13");
    expect(await db.select({ count: sql<number>`count(*)` }).from(inventoryMovementsTable)).toEqual(before);
    expect(await db.select({ count: sql<number>`count(*)` }).from(shipmentsTable)).toEqual(shipmentsBefore);
    const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, a.id));
    expect(items[0]).toMatchObject({ productId: null, productName: "Discontinued perfume", totalAmount: 207 });
    const journals = await db.select().from(journalEntriesTable).where(and(
      inArray(journalEntriesTable.sourceType, ["historical_company_invoice", "receivable_payment"]),
      inArray(journalEntriesTable.sourceId, [String(a.id), String((await db.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, a.id)))[0].id)]),
    ));
    expect(journals).toHaveLength(2);
    const lines = await db.select({ code: accountingAccountsTable.code, debit: journalEntryLinesTable.debit, credit: journalEntryLinesTable.credit })
      .from(journalEntryLinesTable).innerJoin(accountingAccountsTable, eq(accountingAccountsTable.id, journalEntryLinesTable.accountId))
      .where(eq(journalEntryLinesTable.journalEntryId, journals.find(j => j.sourceType === "historical_company_invoice")!.id));
    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "1130", debit: "207.0000" }),
      expect.objectContaining({ code: "4100", credit: "180.0000" }),
      expect.objectContaining({ code: "2120", credit: "27.0000" }),
    ]));
    await expect(createHistoricalInvoice({ ...input(), totalAmount: 206 }, actorId)).rejects.toThrow();
    expect((await reconcileHistoricalInvoice(input())).conflicts.length).toBeGreaterThan(0);
    const full = await createReceivablePayment(a.id, { paymentKey: `${key}-final-payment`, paymentDate: "2026-08-01", amount: 157, paymentMethod: "cash" }, actorId);
    expect((await createReceivablePayment(a.id, { paymentKey: `${key}-final-payment`, paymentDate: "2026-08-01", amount: 157, paymentMethod: "cash" }, actorId)).id).toBe(full.id);
    await expect(createReceivablePayment(a.id, { paymentKey: `${key}-final-payment`, paymentDate: "2026-08-01", amount: 10, paymentMethod: "cash" }, actorId)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    await expect(createReceivablePayment(a.id, { paymentKey: `${key}-extra-payment`, paymentDate: "2026-08-02", amount: 1, paymentMethod: "cash" }, actorId)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    expect((await createHistoricalInvoice(input(), actorId)).id).toBe(a.id);
  });
  it("reserves a historical live-format number while keeping its separate negative sequence", async () => {
    const [row] = await db.select({ next: sql<number>`greatest(coalesce(max(${invoicesTable.sequenceNumber}), 0), 0) + 1` }).from(invoicesTable);
    const reservedNumber = `LC-${String(Number(row.next)).padStart(6, "0")}`;
    const reserved = await createHistoricalInvoice({ ...input(), creationKey: `${key}-reserved-create`, invoiceNumber: reservedNumber, issueDate: "2026-06-10", dueDate: "2026-07-10", payments: [] }, actorId);
    invoiceIds.push(reserved.id);
    reservedInvoiceId = reserved.id;
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(${7_521_010_001})`);
      const next = await nextLiveInvoiceNumber(tx, "LC");
      expect(next.invoiceNumber).not.toBe(reservedNumber);
      expect(next.sequenceNumber).toBe(Number(row.next) + 1);
    });
  });
  it("blocks later collections already represented by an import or receipt journal", async () => {
    const [imported] = await db.insert(journalEntriesTable).values({
      entryNumber: "JE-99999999", entryDate: "2026-08-01", description: "Legacy collection from retailer alias",
      sourceType: "historical_import", sourceId: key, createdBy: actorId, status: "draft",
    }).returning();
    try {
      await expect(createReceivablePayment(reservedInvoiceId, {
        paymentKey: `${key}-blocked-import`, paymentDate: "2026-08-12", amount: 40, paymentMethod: "bank_transfer",
      }, actorId)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
      expect(await db.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, reservedInvoiceId))).toHaveLength(0);
    } finally {
      await db.transaction(async tx => {
        await tx.execute(sql`set local session_replication_role = 'replica'`);
        await tx.delete(journalEntriesTable).where(eq(journalEntriesTable.id, imported.id));
      });
    }
    const [receipt] = await db.insert(journalEntriesTable).values({
      entryNumber: "JE-99999999", entryDate: "2026-08-04", description: `${key}-external-bank-reference`,
      sourceType: "historical_import_receipt", sourceId: key, createdBy: actorId, status: "draft",
    }).returning();
    try {
      await expect(createReceivablePayment(reservedInvoiceId, {
        paymentKey: `${key}-blocked-reference`, paymentDate: "2026-09-12", amount: 40, paymentMethod: "bank_transfer",
        reference: `${key}-external-bank-reference`,
      }, actorId)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    } finally {
      await db.transaction(async tx => {
        await tx.execute(sql`set local session_replication_role = 'replica'`);
        await tx.delete(journalEntriesTable).where(eq(journalEntriesTable.id, receipt.id));
      });
    }
    await createReceivablePayment(reservedInvoiceId, {
      paymentKey: `${key}-approved-payment`, paymentDate: "2026-09-12", amount: 40, paymentMethod: "bank_transfer",
      reference: `${key}-approved-bank-reference`,
    }, actorId);
    await expect(createReceivablePayment(reservedInvoiceId, {
      paymentKey: `${key}-duplicate-payment`, paymentDate: "2026-09-12", amount: 40, paymentMethod: "bank_transfer",
      reference: `${key}-approved-bank-reference`,
    }, actorId)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
  });
  it("blocks an initial collection when its month overlaps an import outside the invoice issue month", async () => {
    const submission = {
      ...input(), creationKey: `${key}-cross-month-create`, invoiceNumber: `${key}-cross-month`,
      issueDate: "2026-05-10", dueDate: "2026-06-10",
      payments: [{ paymentKey: `${key}-cross-month-payment`, paymentDate: "2026-08-12", amount: 50,
        paymentMethod: "bank_transfer" as const, reference: null }],
    };
    const [imported] = await db.insert(journalEntriesTable).values({
      entryNumber: "JE-99999999", entryDate: "2026-08-01", description: "Legacy bank receipt from retailer alias",
      sourceType: "historical_import", sourceId: key, createdBy: actorId, status: "draft",
    }).returning();
    try {
      expect((await reconcileHistoricalInvoice(submission)).conflicts).toContain(`Master Sales journal #${imported.id}`);
      await expect(createHistoricalInvoice(submission, actorId)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
      expect(await db.select().from(invoicesTable).where(eq(invoicesTable.creationKey, submission.creationKey))).toHaveLength(0);
    } finally {
      await db.transaction(async tx => {
        await tx.execute(sql`set local session_replication_role = 'replica'`);
        await tx.delete(journalEntriesTable).where(eq(journalEntriesTable.id, imported.id));
      });
    }
  });
});