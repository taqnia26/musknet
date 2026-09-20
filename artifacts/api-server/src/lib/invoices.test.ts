import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import {
  accountingAccountsTable, adminUsersTable, categoriesTable, customersTable, db, inventoryBalancesTable, inventoryMovementsTable,
  invoiceItemsTable, invoicesTable, journalEntriesTable, journalEntryAuditTable,
  journalEntryLinesTable, operationEventsTable, ordersTable, productsTable, receivablePaymentsTable, wholesaleDistributorsTable,
} from "@workspace/db";
import { createDistributorInvoice, createReceivablePayment, DistributorInvoiceConflictError, updateOrderAndIssueInvoice } from "./invoices";

const base = 1_700_000_000 + (Date.now() % 100_000_000);
const customerId = base;
const orderIds = [base + 1, base + 2, base + 3];
let distributorId: number;
let inactiveDistributorId: number;
let productId: number;
let actorId: number;
let successfulInvoiceId: number;

const order = (id: number) => ({
  id,
  userId: customerId,
  orderNumber: `INVOICE-TEST-${id}`,
  subtotal: 100,
  shippingCost: 15,
  discount: 0,
  tax: 15,
  total: 115,
  address: "{}",
  shippingMethod: "standard",
  paymentMethod: "card",
});

beforeAll(async () => {
  const [actor] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).limit(1);
  if (!actor) throw new Error("Invoice tests require a seeded administrator");
  actorId = actor.id;
  await db.insert(customersTable).values({ id: customerId, phone: `9665${String(base).slice(-8)}`, name: "Invoice Test" });
  await db.insert(ordersTable).values(orderIds.map(order));
  let [category] = await db.select({ id: categoriesTable.id }).from(categoriesTable).limit(1);
  if (!category) {
    [category] = await db.insert(categoriesTable).values({
      nameAr: "اختبار الفواتير", nameEn: "Invoice tests", slug: `invoice-tests-${base}`,
    }).returning({ id: categoriesTable.id });
  }
  const [product] = await db.insert(productsTable).values({
    nameAr: "منتج فاتورة موزع", nameEn: "Distributor invoice product", slug: `distributor-invoice-${base}`,
    price: 10, categoryId: category.id, sku: `DIT-${base}`, stockQuantity: 10, averageCost: "4",
  }).returning({ id: productsTable.id });
  productId = product.id;
  const distributors = await db.insert(wholesaleDistributorsTable).values([
    {
      companyName: "موزع اختبار", contactName: "Tester", phone: `050${String(base).slice(-7)}`,
      taxNumber: "310000000000003", commercialRegistrationNumber: `CR-${base}`,
    },
    {
      companyName: "موزع غير نشط", contactName: "Tester", phone: `051${String(base).slice(-7)}`,
      isActive: false,
    },
  ]).returning({ id: wholesaleDistributorsTable.id, isActive: wholesaleDistributorsTable.isActive });
  distributorId = distributors.find((row) => row.isActive)!.id;
  inactiveDistributorId = distributors.find((row) => !row.isActive)!.id;
});

afterAll(async () => {
  const distributorInvoices = await db.select({ id: invoicesTable.id }).from(invoicesTable)
    .where(inArray(invoicesTable.distributorId, [distributorId, inactiveDistributorId]));
  if (distributorInvoices.length) {
    const invoiceIds = distributorInvoices.map((row) => row.id);
    const payments = await db.select({ id: receivablePaymentsTable.id }).from(receivablePaymentsTable)
      .where(inArray(receivablePaymentsTable.invoiceId, invoiceIds));
    await db.delete(inventoryMovementsTable).where(and(
      eq(inventoryMovementsTable.sourceType, "distributor_invoice"),
      inArray(inventoryMovementsTable.sourceId, invoiceIds.map(String)),
    ));
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = 'replica'`);
      const entries = await tx.select({ id: journalEntriesTable.id }).from(journalEntriesTable)
        .where(and(
          or(
            and(inArray(journalEntriesTable.sourceType, ["distributor_invoice", "distributor_invoice_cogs"]), inArray(journalEntriesTable.sourceId, invoiceIds.map(String))),
            and(eq(journalEntriesTable.sourceType, "receivable_payment"), inArray(journalEntriesTable.sourceId, payments.map((payment) => String(payment.id)))),
          ),
        ));
      if (entries.length) {
        const entryIds = entries.map((entry) => entry.id);
        await tx.delete(journalEntryAuditTable).where(inArray(journalEntryAuditTable.journalEntryId, entryIds));
        await tx.delete(journalEntryLinesTable).where(inArray(journalEntryLinesTable.journalEntryId, entryIds));
        await tx.delete(journalEntriesTable).where(inArray(journalEntriesTable.id, entryIds));
      }
      if (payments.length) {
        await tx.delete(operationEventsTable).where(and(
          eq(operationEventsTable.sourceType, "receivable_payment"),
          inArray(operationEventsTable.sourceId, payments.map((payment) => String(payment.id))),
        ));
        await tx.delete(receivablePaymentsTable).where(inArray(receivablePaymentsTable.id, payments.map((payment) => payment.id)));
      }
    });
    await db.delete(invoiceItemsTable).where(inArray(invoiceItemsTable.invoiceId, invoiceIds));
    await db.delete(invoicesTable).where(inArray(invoicesTable.id, invoiceIds));
  }
  await db.delete(wholesaleDistributorsTable).where(inArray(wholesaleDistributorsTable.id, [distributorId, inactiveDistributorId]));
  await db.delete(inventoryMovementsTable).where(eq(inventoryMovementsTable.productId, productId));
  await db.delete(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, productId));
  await db.delete(productsTable).where(eq(productsTable.id, productId));
  await db.delete(invoicesTable).where(inArray(invoicesTable.orderId, orderIds));
  await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
  await db.delete(customersTable).where(eq(customersTable.id, customerId));
});

describe.sequential("atomic invoice issuance", () => {
  it("rolls payment back when VAT configuration is missing", async () => {
    await expect(updateOrderAndIssueInvoice(
      orderIds[0],
      { paymentStatus: "paid" },
      { VAT_SELLER_LEGAL_NAME: "مؤسسة مسك اللولو للتجارة" },
    ))
      .rejects.toThrow(/VAT_REGISTRATION_NUMBER/);
    const [unchanged] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderIds[0]));
    const invoice = await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, orderIds[0]));
    expect(unchanged.paymentStatus).toBe("pending");
    expect(invoice).toHaveLength(0);
  });

  it("is idempotent under concurrent calls and allocates consecutive successful numbers", async () => {
    const env = {
      VAT_SELLER_LEGAL_NAME: "مؤسسة مسك اللولو للتجارة",
      VAT_REGISTRATION_NUMBER: "300000000000003",
    };
    await Promise.all([
      updateOrderAndIssueInvoice(orderIds[0], { paymentStatus: "paid" }, env),
      updateOrderAndIssueInvoice(orderIds[0], { paymentStatus: "paid" }, env),
      updateOrderAndIssueInvoice(orderIds[1], { paymentStatus: "paid" }, env),
      updateOrderAndIssueInvoice(orderIds[2], { paymentStatus: "paid" }, env),
    ]);
    const rows = await db.select().from(invoicesTable)
      .where(inArray(invoicesTable.orderId, orderIds));
    expect(rows).toHaveLength(3);
    const sequences = rows.map((row) => row.sequenceNumber).sort((a, b) => a - b);
    expect(sequences).toEqual([sequences[0], sequences[0] + 1, sequences[0] + 2]);
    expect(new Set(rows.map((row) => row.invoiceNumber)).size).toBe(3);
  });
});

describe.sequential("distributor invoice issuance", () => {
  const env = {
    VAT_SELLER_LEGAL_NAME: "مؤسسة مسك اللولو للتجارة",
    VAT_REGISTRATION_NUMBER: "300000000000003",
  };

  it("rejects an inactive distributor without saving anything", async () => {
    await expect(createDistributorInvoice({
      creationKey: `inactive-${base}-invoice`,
      distributorId: inactiveDistributorId,
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    const rows = await db.select().from(invoicesTable).where(eq(invoicesTable.distributorId, inactiveDistributorId));
    expect(rows).toHaveLength(0);
  });

  it("rolls the whole sale back when stock is insufficient", async () => {
    await expect(createDistributorInvoice({
      creationKey: `insufficient-${base}-invoice`,
      distributorId,
      items: [{ productId, quantity: 11, unitPrice: 20 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    const [product] = await db.select({ stockQuantity: productsTable.stockQuantity }).from(productsTable).where(eq(productsTable.id, productId));
    expect(product.stockQuantity).toBe(10);
    const rows = await db.select().from(invoicesTable).where(eq(invoicesTable.creationKey, `insufficient-${base}-invoice`));
    expect(rows).toHaveLength(0);
  });

  it("calculates totals on the server and preserves buyer and product snapshots", async () => {
    const creationKey = `successful-${base}-invoice`;
    const [invoice, retriedInvoice] = await Promise.all([
      createDistributorInvoice({
        creationKey, distributorId,
        items: [{ productId, quantity: 3, unitPrice: 19.99 }],
      }, actorId, env),
      createDistributorInvoice({
        creationKey, distributorId,
        items: [{ productId, quantity: 3, unitPrice: 19.99 }],
      }, actorId, env),
    ]);
    expect(retriedInvoice.id).toBe(invoice.id);
    successfulInvoiceId = invoice.id;
    expect(invoice.subtotal).toBe(59.97);
    expect(invoice.vatAmount).toBe(9);
    expect(invoice.totalAmount).toBe(68.97);
    expect(invoice.buyerName).toBe("موزع اختبار");
    expect(invoice.buyerTaxNumber).toBe("310000000000003");
    expect(invoice.buyerCommercialRegistrationNumber).toBe(`CR-${base}`);
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0]).toMatchObject({
      productId, productName: "منتج فاتورة موزع", quantity: 3, unitPrice: 19.99,
      subtotal: 59.97, vatAmount: 9, totalAmount: 68.97,
    });
    const [product] = await db.select({ stockQuantity: productsTable.stockQuantity }).from(productsTable).where(eq(productsTable.id, productId));
    expect(product.stockQuantity).toBe(7);
    const movements = await db.select().from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.eventKey, `distributor-invoice:${invoice.id}:${productId}`));
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ quantityBefore: 10, quantityAfter: 7, quantityChange: -3, totalCost: "12.0000" });
    const journals = await db.select().from(journalEntriesTable).where(and(
      inArray(journalEntriesTable.sourceType, ["distributor_invoice", "distributor_invoice_cogs"]),
      eq(journalEntriesTable.sourceId, String(invoice.id)),
    ));
    expect(journals).toHaveLength(2);
    const saleJournal = journals.find((journal) => journal.sourceType === "distributor_invoice")!;
    const saleLines = await db.select({
      accountCode: accountingAccountsTable.code,
      debit: journalEntryLinesTable.debit,
      credit: journalEntryLinesTable.credit,
    }).from(journalEntryLinesTable)
      .innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
      .where(eq(journalEntryLinesTable.journalEntryId, saleJournal.id));
    expect(saleLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: "1130", debit: "68.9700", credit: "0.0000" }),
      expect.objectContaining({ accountCode: "4100", debit: "0.0000", credit: "59.9700" }),
      expect.objectContaining({ accountCode: "2120", debit: "0.0000", credit: "9.0000" }),
    ]));
  });

  it("records partial and full collections without allowing overpayment", async () => {
    const partial = await createReceivablePayment(successfulInvoiceId, {
      paymentKey: `partial-${base}-payment`,
      paymentDate: "2026-09-20",
      amount: 20,
      paymentMethod: "bank_transfer",
      reference: "BANK-001",
    }, actorId);
    expect(partial).toMatchObject({ invoiceId: successfulInvoiceId, amount: 20, reference: "BANK-001" });
    await expect(createReceivablePayment(successfulInvoiceId, {
      paymentKey: `over-${base}-payment`,
      paymentDate: "2026-09-20",
      amount: 49,
      paymentMethod: "bank_transfer",
    }, actorId)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    const full = await createReceivablePayment(successfulInvoiceId, {
      paymentKey: `full-${base}-payment`,
      paymentDate: "2026-09-21",
      amount: 48.97,
      paymentMethod: "cash",
    }, actorId);
    expect(full.amount).toBe(48.97);
    const rows = await db.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, successfulInvoiceId));
    expect(rows.map((row) => row.amount).sort()).toEqual([20, 48.97]);
    const events = await db.select().from(operationEventsTable).where(and(
      eq(operationEventsTable.sourceType, "receivable_payment"),
      inArray(operationEventsTable.sourceId, rows.map((row) => String(row.id))),
    ));
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.status === "posted" && event.actorId === actorId)).toBe(true);
    const collectionJournals = await db.select({ id: journalEntriesTable.id, sourceId: journalEntriesTable.sourceId })
      .from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.sourceType, "receivable_payment"), inArray(journalEntriesTable.sourceId, rows.map((row) => String(row.id)))));
    const collectionLines = await db.select({
      journalEntryId: journalEntryLinesTable.journalEntryId,
      accountCode: accountingAccountsTable.code,
      debit: journalEntryLinesTable.debit,
      credit: journalEntryLinesTable.credit,
    }).from(journalEntryLinesTable)
      .innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
      .where(inArray(journalEntryLinesTable.journalEntryId, collectionJournals.map((journal) => journal.id)));
    const partialJournalId = collectionJournals.find((journal) => journal.sourceId === String(partial.id))!.id;
    const fullJournalId = collectionJournals.find((journal) => journal.sourceId === String(full.id))!.id;
    expect(collectionLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ journalEntryId: partialJournalId, accountCode: "1120", debit: "20.0000", credit: "0.0000" }),
      expect.objectContaining({ journalEntryId: partialJournalId, accountCode: "1130", debit: "0.0000", credit: "20.0000" }),
      expect.objectContaining({ journalEntryId: fullJournalId, accountCode: "1110", debit: "48.9700", credit: "0.0000" }),
      expect.objectContaining({ journalEntryId: fullJournalId, accountCode: "1130", debit: "0.0000", credit: "48.9700" }),
    ]));
  });
});