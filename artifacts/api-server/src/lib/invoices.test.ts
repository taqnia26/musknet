import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import {
  accountingAccountsTable, adminUsersTable, categoriesTable, customersTable, db, inventoryBalancesTable, inventoryMovementsTable,
  invoiceItemsTable, invoicesTable, journalEntriesTable, journalEntryAuditTable,
  journalEntryLinesTable, operationEventsTable, orderItemsTable, ordersTable, productsTable, receivablePaymentsTable, wholesaleDistributorsTable,
  uploadedContractFilesTable,
} from "@workspace/db";
import { createDistributorInvoice, createReceivablePayment, DistributorInvoiceConflictError, DistributorInvoiceValidationError, lockDistributorContractSource, updateOrderAndIssueInvoice } from "./invoices";
import { invoiceItemName } from "./invoice-email";

const base = 1_700_000_000 + (Date.now() % 100_000_000);
const customerId = base;
const orderIds = [base + 1, base + 2, base + 3, base + 4];
let distributorId: number;
let inactiveDistributorId: number;
let internationalDistributorId: number;
let concurrentDistributorId: number;
let productId: number;
let actorId: number;
let successfulInvoiceId: number;
const uploadedContractFileIds: number[] = [];

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
  await db.insert(ordersTable).values([
    ...orderIds.slice(0, 3).map(order),
    { ...order(orderIds[3]), total: 130, address: JSON.stringify({ country: "AE" }) },
  ]);
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
    {
      companyName: "موزع دولي للاختبار", contactName: "Tester", phone: `052${String(base).slice(-7)}`,
    },
    {
      companyName: "موزع تزامن العقود", contactName: "Tester", phone: `053${String(base).slice(-7)}`,
    },
  ]).returning({ id: wholesaleDistributorsTable.id, isActive: wholesaleDistributorsTable.isActive });
  distributorId = distributors[0].id;
  inactiveDistributorId = distributors.find((row) => !row.isActive)!.id;
  internationalDistributorId = distributors[2].id;
  concurrentDistributorId = distributors[3].id;
});

afterAll(async () => {
  const distributorInvoices = await db.select({ id: invoicesTable.id }).from(invoicesTable)
    .where(inArray(invoicesTable.distributorId, [distributorId, inactiveDistributorId, internationalDistributorId, concurrentDistributorId]));
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
    await db.delete(operationEventsTable).where(and(
      eq(operationEventsTable.sourceType, "distributor_invoice"),
      inArray(operationEventsTable.sourceId, invoiceIds.map(String)),
    ));
    await db.delete(invoicesTable).where(inArray(invoicesTable.id, invoiceIds));
  }
  if (uploadedContractFileIds.length) {
    await db.delete(uploadedContractFilesTable).where(inArray(uploadedContractFilesTable.id, uploadedContractFileIds));
  }
  await db.delete(wholesaleDistributorsTable).where(inArray(wholesaleDistributorsTable.id, [distributorId, inactiveDistributorId, internationalDistributorId, concurrentDistributorId]));
  await db.delete(inventoryMovementsTable).where(eq(inventoryMovementsTable.productId, productId));
  await db.delete(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, productId));
  const onlineInvoices = await db.select({ id: invoicesTable.id }).from(invoicesTable).where(inArray(invoicesTable.orderId, orderIds));
  if (onlineInvoices.length) await db.delete(invoiceItemsTable).where(inArray(invoiceItemsTable.invoiceId, onlineInvoices.map((invoice) => invoice.id)));
  await db.delete(productsTable).where(eq(productsTable.id, productId));
  await db.delete(invoicesTable).where(inArray(invoicesTable.orderId, orderIds));
  await db.delete(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds));
  await db.delete(operationEventsTable).where(and(
    inArray(operationEventsTable.sourceType, ["order", "order_cancellation"]),
    inArray(operationEventsTable.sourceId, orderIds.map(String)),
  ));
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = 'replica'`);
    const entries = await tx.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(and(
      inArray(journalEntriesTable.sourceId, orderIds.map(String)),
      inArray(journalEntriesTable.sourceType, ["order", "sale_cogs", "sale_revenue_reversal", "sale_cogs_reversal"]),
    ));
    if (entries.length) {
      const entryIds = entries.map((entry) => entry.id);
      await tx.delete(journalEntryAuditTable).where(inArray(journalEntryAuditTable.journalEntryId, entryIds));
      await tx.delete(journalEntryLinesTable).where(inArray(journalEntryLinesTable.journalEntryId, entryIds));
      await tx.delete(journalEntriesTable).where(inArray(journalEntriesTable.id, entryIds));
    }
  });
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
    await db.insert(orderItemsTable).values({
      orderId: orderIds[1], productId, productName: "اسم العرض المحفوظ", quantity: 1,
      unitPrice: 10, totalPrice: 10,
    });
    await db.update(productsTable).set({
      invoiceNameAr: "اسم الفاتورة عند الإصدار",
      invoiceNameEn: "English invoice name at issue",
    }).where(eq(productsTable.id, productId));
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
    const invoice = rows.find((row) => row.orderId === orderIds[1])!;
    const [line] = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoice.id));
    expect(line.productName).toBe("اسم الفاتورة عند الإصدار");
    expect(line.productNameEn).toBe("English invoice name at issue");
    await db.update(productsTable).set({
      invoiceNameAr: "اسم الفاتورة بعد الإصدار",
      invoiceNameEn: "Changed English invoice name",
    }).where(eq(productsTable.id, productId));
    const [preservedInvoiceLine] = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoice.id));
    const [preservedOrderLine] = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderIds[1]));
    expect(preservedInvoiceLine.productName).toBe("اسم الفاتورة عند الإصدار");
    expect(invoiceItemName(preservedInvoiceLine, "ar")).toBe("اسم الفاتورة عند الإصدار");
    expect(invoiceItemName(preservedInvoiceLine, "en")).toBe("English invoice name at issue");
    expect(preservedOrderLine.productName).toBe("اسم العرض المحفوظ");
    await db.update(productsTable).set({
      invoiceNameAr: "منتج فاتورة موزع",
      invoiceNameEn: "Distributor invoice product",
    }).where(eq(productsTable.id, productId));
    expect(rows.every((row) => /^INV-[0-9]+$/.test(row.invoiceNumber))).toBe(true);
  });

  it("preserves legacy totals and destination treatment on late invoice issuance", async () => {
    await db.insert(orderItemsTable).values({
      orderId: orderIds[3], productId, productName: "Legacy display snapshot",
      quantity: 1, unitPrice: 100, totalPrice: 100,
    });
    await updateOrderAndIssueInvoice(orderIds[3], { paymentStatus: "paid" }, {
      VAT_SELLER_LEGAL_NAME: "مؤسسة مسك اللولو للتجارة",
      VAT_REGISTRATION_NUMBER: "300000000000003",
    }, actorId);
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, orderIds[3]));
    expect(invoice).toMatchObject({
      subtotal: 100,
      totalAmount: 130,
      vatAmount: 15,
      taxTreatment: "international",
    });
    expect(Number(invoice.vatRate)).toBe(15);
    const [line] = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoice.id));
    expect(line).toMatchObject({
      subtotal: 100, vatAmount: 15, totalAmount: 115,
      productName: "منتج فاتورة موزع", productNameEn: "Distributor invoice product",
    });
    expect(line.subtotal + line.vatAmount + 15).toBe(invoice.totalAmount);
    await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, orderIds[3]));
  });

  it("cancels legacy and inclusive orders by reversing the posted journal lines", async () => {
    for (const orderId of [orderIds[0], orderIds[3]]) {
      await updateOrderAndIssueInvoice(orderId, { paymentStatus: "paid" }, {
        VAT_SELLER_LEGAL_NAME: "مؤسسة مسك اللولو للتجارة",
        VAT_REGISTRATION_NUMBER: "300000000000003",
      }, actorId);
      await db.insert(orderItemsTable).values({
        orderId, productId, productName: "Cancellation fixture", quantity: 1,
        unitPrice: 10, totalPrice: 10, costSnapshot: "4.0000",
      });
      await db.insert(inventoryMovementsTable).values({
        productId, movementType: "decrease", quantityChange: -1, quantityBefore: 10, quantityAfter: 9,
        reason: `Fulfillment fixture ${orderId}`, unitCost: "4.0000", totalCost: "4.0000",
        sourceType: "order", sourceId: String(orderId), eventKey: `invoice-cancel-fixture:${orderId}`,
      });
      const [saleJournal] = await db.select().from(journalEntriesTable).where(and(
        eq(journalEntriesTable.sourceType, "order"), eq(journalEntriesTable.sourceId, String(orderId)),
      ));
      const originalLines = await db.select({
        accountCode: accountingAccountsTable.code,
        debit: journalEntryLinesTable.debit,
        credit: journalEntryLinesTable.credit,
      }).from(journalEntryLinesTable)
        .innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
        .where(eq(journalEntryLinesTable.journalEntryId, saleJournal.id))
        .orderBy(journalEntryLinesTable.lineNumber);

      await updateOrderAndIssueInvoice(orderId, { status: "cancelled" }, process.env, actorId);
      const [reversal] = await db.select().from(journalEntriesTable).where(and(
        eq(journalEntriesTable.sourceType, "sale_revenue_reversal"), eq(journalEntriesTable.sourceId, String(orderId)),
      ));
      const reversedLines = await db.select({
        accountCode: accountingAccountsTable.code,
        debit: journalEntryLinesTable.debit,
        credit: journalEntryLinesTable.credit,
      }).from(journalEntryLinesTable)
        .innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
        .where(eq(journalEntryLinesTable.journalEntryId, reversal.id))
        .orderBy(journalEntryLinesTable.lineNumber);
      expect(reversedLines).toEqual(originalLines.map((line) => ({
        accountCode: line.accountCode, debit: line.credit, credit: line.debit,
      })));
      await db.update(productsTable).set({ stockQuantity: 10, averageCost: "4.0000" }).where(eq(productsTable.id, productId));
      await db.update(inventoryBalancesTable).set({ available: 10, averageCost: "4.0000" }).where(eq(inventoryBalancesTable.productId, productId));
    }
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
    const request = { creationKey, distributorId, items: [{ productId, quantity: 3, unitPrice: 19.99 }] };
    await expect(createDistributorInvoice({ ...request, distributorId: inactiveDistributorId }, actorId, env))
      .rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    await expect(createDistributorInvoice({ ...request, contractId: 999_999 }, actorId, env))
      .rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    await expect(createDistributorInvoice({ ...request, taxTreatment: "international" }, actorId, env))
      .rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    await expect(createDistributorInvoice({ ...request, dueDate: "2030-01-01" }, actorId, env))
      .rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    await expect(createDistributorInvoice({
      ...request, items: [{ productId, quantity: 3, unitPrice: 20 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    expect(invoice.invoiceNumber).toMatch(/^LC-[0-9]+$/);
    expect(retriedInvoice.invoiceNumber).toBe(invoice.invoiceNumber);
    const [persisted] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id));
    expect(persisted.invoiceNumber).toBe(invoice.invoiceNumber);
    successfulInvoiceId = invoice.id;
    expect(invoice.subtotal).toBe(52.15);
    expect(invoice.vatAmount).toBe(7.82);
    expect(invoice.totalAmount).toBe(59.97);
    expect(invoice.buyerName).toBe("موزع اختبار");
    expect(invoice.buyerTaxNumber).toBe("310000000000003");
    expect(invoice.buyerCommercialRegistrationNumber).toBe(`CR-${base}`);
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0]).toMatchObject({
      productId, productName: "منتج فاتورة موزع", productNameEn: "Distributor invoice product", quantity: 3, unitPrice: 19.99,
      subtotal: 52.15, vatAmount: 7.82, totalAmount: 59.97,
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
      expect.objectContaining({ accountCode: "1130", debit: "59.9700", credit: "0.0000" }),
      expect.objectContaining({ accountCode: "4100", debit: "0.0000", credit: "52.1500" }),
      expect.objectContaining({ accountCode: "2120", debit: "0.0000", credit: "7.8200" }),
    ]));
  });

  it("issues unique LC references for simultaneous different distributor sales", async () => {
    const [first, second] = await Promise.all([
      createDistributorInvoice({
        creationKey: `parallel-a-${base}-invoice`, distributorId,
        items: [{ productId, quantity: 1, unitPrice: 20 }],
      }, actorId, env),
      createDistributorInvoice({
        creationKey: `parallel-b-${base}-invoice`, distributorId,
        items: [{ productId, quantity: 1, unitPrice: 20 }],
      }, actorId, env),
    ]);
    expect(first.invoiceNumber).toMatch(/^LC-[0-9]+$/);
    expect(second.invoiceNumber).toMatch(/^LC-[0-9]+$/);
    expect(first.invoiceNumber).not.toBe(second.invoiceNumber);
    expect(Math.abs(first.sequenceNumber - second.sequenceNumber)).toBe(1);
  });

  it("requires review for pending uploads and applies confirmed uploaded terms by explicit owner", async () => {
    const [pending] = await db.insert(uploadedContractFilesTable).values({
      ownerType: "distributor",
      ownerId: distributorId,
      ownerName: "موزع اختبار",
      fileName: `pending-${base}.pdf`,
      objectPath: `/objects/uploads/contracts/files/pending-${base}`,
      mimeType: "application/pdf",
      sizeBytes: 100,
      uploadedBy: actorId,
    }).returning();
    uploadedContractFileIds.push(pending.id);
    await expect(createDistributorInvoice({
      creationKey: `pending-${base}-invoice`,
      distributorId,
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    await db.delete(uploadedContractFilesTable).where(eq(uploadedContractFilesTable.id, pending.id));
    uploadedContractFileIds.splice(uploadedContractFileIds.indexOf(pending.id), 1);

    const files = await db.insert(uploadedContractFilesTable).values(["first", "second"].map((suffix) => ({
      ownerType: "distributor",
      ownerId: distributorId,
      ownerName: "موزع اختبار",
      fileName: `confirmed-${suffix}-${base}.pdf`,
      objectPath: `/objects/uploads/contracts/files/confirmed-${suffix}-${base}`,
      mimeType: "application/pdf",
      sizeBytes: 100,
      contractType: "Saudi distributor agreement",
      discountPercent: "7.50",
      paymentTerm: "end_of_month",
      paymentDays: null,
      termsConfirmedAt: new Date(),
      termsConfirmedBy: actorId,
      uploadedBy: actorId,
    }))).returning();
    uploadedContractFileIds.push(...files.map((file) => file.id));
    await expect(createDistributorInvoice({
      creationKey: `ambiguous-${base}-invoice`,
      distributorId,
      taxTreatment: "domestic",
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    const invoice = await createDistributorInvoice({
      creationKey: `uploaded-${base}-invoice`,
      distributorId,
      uploadedContractFileId: files[0].id,
      taxTreatment: "domestic",
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env);
    expect(invoice).toMatchObject({
      uploadedContractFileId: files[0].id,
      contractNumber: files[0].fileName,
      contractType: "Saudi distributor agreement",
      contractDiscountPercent: "7.50",
      paymentTerm: "end_of_month",
      paymentDays: null,
    });
    expect(invoice.totalAmount).toBe(18.5);
    const [persisted] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id));
    const issueDateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit",
    }).formatToParts(invoice.issueDatetime);
    const issueYear = Number(issueDateParts.find((part) => part.type === "year")?.value);
    const issueMonth = Number(issueDateParts.find((part) => part.type === "month")?.value);
    const lastDay = new Date(Date.UTC(issueYear, issueMonth, 0)).getUTCDate();
    expect(persisted.dueDate).toBe(`${issueYear}-${String(issueMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);
    await expect(createDistributorInvoice({
      creationKey: `uploaded-${base}-invoice`,
      distributorId,
      uploadedContractFileId: files[1].id,
      taxTreatment: "domestic",
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
  });

  it("waits for a concurrent terms confirmation before resolving invoice sources", async () => {
    const [file] = await db.insert(uploadedContractFilesTable).values({
      ownerType: "distributor",
      ownerId: concurrentDistributorId,
      ownerName: "موزع تزامن العقود",
      fileName: `concurrent-${base}.pdf`,
      objectPath: `/objects/uploads/contracts/files/concurrent-${base}`,
      mimeType: "application/pdf",
      sizeBytes: 100,
      uploadedBy: actorId,
    }).returning();
    uploadedContractFileIds.push(file.id);
    let releaseConfirmation!: () => void;
    let signalLocked!: () => void;
    const confirmationGate = new Promise<void>((resolve) => { releaseConfirmation = resolve; });
    const lockAcquired = new Promise<void>((resolve) => { signalLocked = resolve; });
    const confirmation = db.transaction(async (tx) => {
      await lockDistributorContractSource(tx, concurrentDistributorId);
      signalLocked();
      await confirmationGate;
      await tx.update(uploadedContractFilesTable).set({
        contractType: "Saudi distributor agreement",
        discountPercent: "5.00",
        paymentTerm: "due_on_issue",
        paymentDays: null,
        termsConfirmedAt: new Date(),
        termsConfirmedBy: actorId,
      }).where(eq(uploadedContractFilesTable.id, file.id));
    });
    await lockAcquired;
    const issuance = createDistributorInvoice({
      creationKey: `concurrent-confirmation-${base}-invoice`,
      distributorId: concurrentDistributorId,
      taxTreatment: "domestic",
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env);
    let outcome: "waiting" | "settled" | "timeout" = "timeout";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const lockState = await db.execute(sql`
        select exists (
          select 1 from pg_locks
          where locktype = 'advisory'
            and classid = 752101::oid
            and objid = ${concurrentDistributorId}::oid
            and granted = false
        ) as waiting
      `);
      if (lockState.rows[0]?.waiting) { outcome = "waiting"; break; }
      const alreadySettled = await Promise.race([
        issuance.then(() => true, () => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 10)),
      ]);
      if (alreadySettled) { outcome = "settled"; break; }
    }
    releaseConfirmation();
    await confirmation;
    expect(outcome).toBe("waiting");
    const invoice = await issuance;
    expect(invoice).toMatchObject({
      uploadedContractFileId: file.id,
      contractDiscountPercent: "5.00",
      paymentTerm: "due_on_issue",
      paymentDays: null,
    });
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
      amount: 39.97,
      paymentMethod: "cash",
    }, actorId);
    expect(full.amount).toBe(39.97);
    const rows = await db.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, successfulInvoiceId));
    expect(rows.map((row) => row.amount).sort()).toEqual([20, 39.97]);
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
      expect.objectContaining({ journalEntryId: fullJournalId, accountCode: "1110", debit: "39.9700", credit: "0.0000" }),
      expect.objectContaining({ journalEntryId: fullJournalId, accountCode: "1130", debit: "0.0000", credit: "39.9700" }),
    ]));
  });

  it("requires an explicit non-Saudi country for international invoices", async () => {
    const creationKey = `international-${base}-invoice`;
    const request = {
      creationKey, distributorId: internationalDistributorId, taxTreatment: "international" as const,
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    };
    await expect(createDistributorInvoice(request, actorId, env))
      .rejects.toBeInstanceOf(DistributorInvoiceValidationError);
    await db.update(wholesaleDistributorsTable).set({ countryCode: "SA" })
      .where(eq(wholesaleDistributorsTable.id, internationalDistributorId));
    await expect(createDistributorInvoice(request, actorId, env))
      .rejects.toBeInstanceOf(DistributorInvoiceValidationError);
    await db.update(wholesaleDistributorsTable).set({ countryCode: "AE" })
      .where(eq(wholesaleDistributorsTable.id, internationalDistributorId));
    const invoice = await createDistributorInvoice(request, actorId, env);
    expect(invoice).toMatchObject({ taxTreatment: "international", vatAmount: 0 });
    expect(Number(invoice.vatRate)).toBe(0);
  });
});