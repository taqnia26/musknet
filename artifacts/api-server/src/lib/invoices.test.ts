import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import {
  accountingAccountsTable, adminUsersTable, categoriesTable, customersTable, db, inventoryBalancesTable, inventoryMovementsTable,
  invoiceItemsTable, invoicesTable, journalEntriesTable, journalEntryAuditTable,
  journalEntryLinesTable, operationEventsTable, orderItemsTable, ordersTable, productsTable, receivablePaymentsTable, wholesaleDistributorsTable,
  uploadedContractFilesTable, distributorContractsTable, shipmentsTable, shipmentEventsTable, shipheroDispatchesTable,
} from "@workspace/db";
import { cancelCompanyInvoice, createDistributorInvoice, createReceivablePayment, DistributorInvoiceConflictError, DistributorInvoiceValidationError, lockDistributorContractSource, updateOrderAndIssueInvoice } from "./invoices";
import { invoiceItemName } from "./invoice-email";
import { invoiceIssueTimestamp, saudiCalendarDate } from "./invoice-dates";
import { createCompanyInvoice } from "./company-invoices";

const base = 1_700_000_000 + (Date.now() % 100_000_000);
const customerId = base;
const orderIds = [base + 1, base + 2, base + 3, base + 4, base + 5, base + 6, base + 7, base + 8];
let distributorId: number;
let inactiveDistributorId: number;
let internationalDistributorId: number;
let concurrentDistributorId: number;
let paidTestDistributorId: number | undefined;
let creditTestDistributorId: number | undefined;
let productId: number;
let actorId: number;
let successfulInvoiceId: number;
const uploadedContractFileIds: number[] = [];

const generatedContractIds: number[] = [];
async function insertApprovedCreditContract(ownerId: number, companyName: string, contractType = "Saudi distributor agreement", creditLimit = "1000000.00") {
  const [contract] = await db.insert(distributorContractsTable).values({
    contractNumber: `CREDIT-${ownerId}-${base}`,
    distributorId: ownerId,
    contractType,
    status: "final",
    sellerName: "Test seller",
    sellerCrNumber: "123",
    sellerCrDate: "01/01/2027",
    sellerCrIssuer: "Test",
    sellerAddress: "Test address",
    sellerRepName: "Test representative",
    sellerRepTitle: "Manager",
    buyerCompanyName: companyName,
    createdBy: actorId,
    creditLimit,
    creditLimitApprovedBy: actorId,
    creditLimitApprovedAt: new Date(),
    creditLimitApprovalReason: "Reviewed credit limit for invoice test fixture",
  }).returning();
  generatedContractIds.push(contract.id);
  return contract;
}
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
    ...orderIds.slice(4).map((id) => ({ ...order(id), orderSource: "phone" })),
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
  await insertApprovedCreditContract(distributorId, "موزع اختبار");
  await insertApprovedCreditContract(internationalDistributorId, "موزع دولي للاختبار", "Gulf distributor agreement");
});

afterAll(async () => {
  const testDistributorIds = [distributorId, inactiveDistributorId, internationalDistributorId, concurrentDistributorId, paidTestDistributorId, creditTestDistributorId]
    .filter((id): id is number => Number.isSafeInteger(id));
  const distributorInvoices = await db.select({ id: invoicesTable.id }).from(invoicesTable)
    .where(inArray(invoicesTable.distributorId, testDistributorIds));
  if (distributorInvoices.length) {
    const invoiceIds = distributorInvoices.map((row) => row.id);
    await db.delete(shipmentsTable).where(inArray(shipmentsTable.invoiceId, invoiceIds));
    const payments = await db.select({ id: receivablePaymentsTable.id }).from(receivablePaymentsTable)
      .where(inArray(receivablePaymentsTable.invoiceId, invoiceIds));
    await db.delete(inventoryMovementsTable).where(and(
      inArray(inventoryMovementsTable.sourceType, ["distributor_invoice", "distributor_invoice_cancellation"]),
      inArray(inventoryMovementsTable.sourceId, invoiceIds.map(String)),
    ));
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = 'replica'`);
      const entries = await tx.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(and(
        or(
          and(inArray(journalEntriesTable.sourceType, ["distributor_invoice", "distributor_invoice_cogs", "historical_company_invoice"]),
            inArray(journalEntriesTable.sourceId, invoiceIds.map(String))),
          and(eq(journalEntriesTable.sourceType, "reversal"), sql`${journalEntriesTable.reversalOfEntryId} in (
            select id from journal_entries where source_type in ('distributor_invoice', 'distributor_invoice_cogs', 'historical_company_invoice')
              and source_id in (${sql.join(invoiceIds.map(id => sql`${String(id)}`), sql`, `)})
          )`),
          and(eq(journalEntriesTable.sourceType, "receivable_payment"), inArray(journalEntriesTable.sourceId, payments.map(payment => String(payment.id)))),
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
    await db.delete(operationEventsTable).where(and(
      eq(operationEventsTable.sourceType, "distributor_invoice_cancellation"),
      inArray(operationEventsTable.sourceId, invoiceIds.map(String)),
    ));
    await db.delete(invoicesTable).where(inArray(invoicesTable.id, invoiceIds));
  }
  if (uploadedContractFileIds.length) {
    await db.delete(uploadedContractFilesTable).where(inArray(uploadedContractFilesTable.id, uploadedContractFileIds));
  }
  if (generatedContractIds.length) await db.delete(distributorContractsTable).where(inArray(distributorContractsTable.id, generatedContractIds));
  await db.delete(wholesaleDistributorsTable).where(inArray(wholesaleDistributorsTable.id, testDistributorIds));
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
    const rows = await db.select().from(invoicesTable).where(inArray(invoicesTable.orderId, orderIds.slice(0, 3)));
    expect(rows).toHaveLength(3);
    const sequences = rows.map((row) => row.sequenceNumber).sort((a, b) => a - b);
    expect(sequences).toEqual([sequences[0], sequences[0] + 1, sequences[0] + 2]);
    expect(new Set(rows.map((row) => row.invoiceNumber)).size).toBe(3);
    const [invoice] = rows.filter((row) => row.orderId === orderIds[1]);
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
      if (orderId === orderIds[0]) await db.insert(shipmentsTable).values({
        channel: "online", orderId, destinationCity: "Riyadh", status: "pending",
      });
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
      if (orderId === orderIds[0]) expect((await db.select().from(shipmentsTable).where(eq(shipmentsTable.orderId, orderId)))[0].status).toBe("cancelled");
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

describe.sequential("phone order delivery invoices", () => {
  const environment = {
    VAT_SELLER_LEGAL_NAME: "مؤسسة مسك اللولو للتجارة",
    VAT_REGISTRATION_NUMBER: "300000000000003",
  };

  it("collects before delivery without an invoice, rolls back failed delivery, and issues once under concurrent delivery", async () => {
    const id = orderIds[4];
    await db.insert(orderItemsTable).values({
      orderId: id, productId, productName: "Phone fixture", quantity: 1,
      unitPrice: 100, totalPrice: 100, costSnapshot: "7.0000",
    });
    const [stockBefore] = await db.select({ stock: productsTable.stockQuantity }).from(productsTable).where(eq(productsTable.id, productId));
    const collected = await updateOrderAndIssueInvoice(id, { paymentStatus: "paid" }, {}, actorId);
    expect(collected?.paymentStatus).toBe("paid");
    expect(await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, id))).toHaveLength(0);
    await expect(updateOrderAndIssueInvoice(id, { status: "delivered" }, environment, actorId)).rejects.toThrow(/Phone orders/);
    await updateOrderAndIssueInvoice(id, { status: "preparing" }, environment, actorId);
    await updateOrderAndIssueInvoice(id, { status: "out_for_delivery" }, environment, actorId);
    expect(await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, id))).toHaveLength(0);
    await expect(updateOrderAndIssueInvoice(id, { status: "delivered" }, {
      VAT_SELLER_LEGAL_NAME: environment.VAT_SELLER_LEGAL_NAME,
    }, actorId)).rejects.toThrow(/VAT_REGISTRATION_NUMBER/);
    const [notDelivered] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    expect(notDelivered.status).toBe("out_for_delivery");
    expect(await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, id))).toHaveLength(0);
    await Promise.all([
      updateOrderAndIssueInvoice(id, { status: "delivered" }, environment, actorId),
      updateOrderAndIssueInvoice(id, { status: "delivered" }, environment, actorId),
    ]);
    const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, id));
    expect(invoices).toHaveLength(1);
    expect(await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoices[0].id))).toHaveLength(1);
    expect(await db.select().from(journalEntriesTable).where(and(
      eq(journalEntriesTable.sourceType, "order"), eq(journalEntriesTable.sourceId, String(id)),
    ))).toHaveLength(1);
    const [stockAfter] = await db.select({ stock: productsTable.stockQuantity }).from(productsTable).where(eq(productsTable.id, productId));
    expect(stockAfter.stock).toBe(stockBefore.stock);
    await expect(updateOrderAndIssueInvoice(id, { status: "preparing" }, environment, actorId)).rejects.toThrow(/Phone orders/);
  });

  it("issues on unpaid delivery and reuses that invoice when payment is later collected", async () => {
    const id = orderIds[5];
    await db.insert(orderItemsTable).values({
      orderId: id, productId, productName: "Unpaid phone fixture", quantity: 1,
      unitPrice: 100, totalPrice: 100, costSnapshot: "7.0000",
    });
    await updateOrderAndIssueInvoice(id, { status: "preparing" }, environment, actorId);
    await updateOrderAndIssueInvoice(id, { status: "out_for_delivery" }, environment, actorId);
    const delivered = await updateOrderAndIssueInvoice(id, { status: "delivered" }, environment, actorId);
    expect(delivered?.paymentStatus).toBe("pending");
    const [first] = await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, id));
    expect(first).toBeDefined();
    await updateOrderAndIssueInvoice(id, { paymentStatus: "paid" }, environment, actorId);
    const afterCollection = await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, id));
    expect(afterCollection).toHaveLength(1);
    expect(afterCollection[0].id).toBe(first.id);
  });

  it("keeps fixed-fee phone pickup local and issues its invoice once only on delivery", async () => {
    const id = orderIds[6];
    await db.update(ordersTable).set({
      fulfillmentMethod: "pickup", shippingCost: 25, discount: 19, tax: 13.83, total: 106,
      couponCode: "SNAPSHOT-COUPON", couponDiscountType: "percentage", couponDiscountValue: 10,
      couponDiscountAmount: "10.00", manualDiscountPercent: "10.00", manualDiscountAmount: "9.00",
      manualDiscountReason: "خصم موثق على المنتجات بعد الكوبون", manualDiscountByAdminId: actorId, manualDiscountAt: new Date(),
      address: JSON.stringify({ country: "AE", taxTreatment: "domestic" }),
    }).where(eq(ordersTable.id, id));
    await db.insert(orderItemsTable).values({
      orderId: id, productId, productName: "Phone pickup fixture", quantity: 1,
      unitPrice: 100, totalPrice: 100, costSnapshot: "7.0000",
    });
    await updateOrderAndIssueInvoice(id, { paymentStatus: "paid" }, environment, actorId);
    await updateOrderAndIssueInvoice(id, { status: "preparing" }, environment, actorId);
    await updateOrderAndIssueInvoice(id, { status: "out_for_delivery" }, environment, actorId);
    expect(await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, id))).toHaveLength(0);
    expect(await db.select().from(shipmentsTable).where(eq(shipmentsTable.orderId, id))).toHaveLength(0);
    await Promise.all([
      updateOrderAndIssueInvoice(id, { status: "delivered" }, environment, actorId),
      updateOrderAndIssueInvoice(id, { status: "delivered" }, environment, actorId),
    ]);
    const issued = await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, id));
    expect(issued).toHaveLength(1);
    expect(Number(issued[0].vatAmount)).toBe(13.83);
    expect(Number(issued[0].totalAmount)).toBe(106);
    expect(issued[0]).toMatchObject({
      couponDiscountAmount: "10.00", manualDiscountAmount: "9.00",
      invoiceDiscountPercent: "10.00", discountOverrideByAdminId: actorId,
    });
    const lines = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, issued[0].id));
    expect(lines[0]).toMatchObject({ totalAmount: 81, vatAmount: 10.57, subtotal: 70.43 });
  });

  it("does not queue admin pickup for a carrier when preparation begins", async () => {
    const id = orderIds[7];
    await db.update(ordersTable).set({ orderSource: "admin", fulfillmentMethod: "pickup", shippingCost: 25, tax: 16.3, total: 125 }).where(eq(ordersTable.id, id));
    await db.insert(orderItemsTable).values({
      orderId: id, productId, productName: "Admin pickup fixture", quantity: 1,
      unitPrice: 100, totalPrice: 100, costSnapshot: "7.0000",
    });
    const preparing = await updateOrderAndIssueInvoice(id, { status: "preparing" }, environment, actorId);
    expect(preparing?.status).toBe("preparing");
    expect(await db.select().from(shipheroDispatchesTable).where(eq(shipheroDispatchesTable.orderId, id))).toHaveLength(0);
    expect(await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, id))).toHaveLength(0);
  });
});

describe.sequential("distributor invoice issuance", () => {
  const env = {
    VAT_SELLER_LEGAL_NAME: "مؤسسة مسك اللولو للتجارة",
    VAT_REGISTRATION_NUMBER: "300000000000003",
  };

  it("retains a final generated contract before its start and records its invoice-only discount", async () => {
    const [contract] = await db.insert(distributorContractsTable).values({
      contractNumber: `BACKDATED-${base}`, distributorId, contractType: "Saudi distributor agreement",
      status: "final", sellerName: "Test seller", sellerCrNumber: "123", sellerCrDate: "01/01/2027",
      sellerCrIssuer: "Test", sellerAddress: "Test address", sellerRepName: "Test representative",
      sellerRepTitle: "Manager", buyerCompanyName: "موزع اختبار", createdBy: actorId,
      marginPercent: "7.50", startDate: new Date("2025-01-01T12:00:00Z"),
      endDate: new Date("2025-12-31T12:00:00Z"),
      creditLimit: "1000.00",
      creditLimitApprovedBy: actorId,
      creditLimitApprovedAt: new Date(),
      creditLimitApprovalReason: "Reviewed credit limit for historical invoice fixture",
    }).returning();
    generatedContractIds.push(contract.id);
    const today = saudiCalendarDate(new Date());
    await expect(createCompanyInvoice({
      creationKey: `generated-expired-current-${base}`, distributorId, contractId: contract.id,
      issueDate: today, dueDate: today, items: [{ productId, quantity: 1, unitPrice: 115 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    const request = {
      creationKey: `generated-prior-${base}`, distributorId, contractId: contract.id,
      issueDate: "2001-02-01", dueDate: "2001-03-01",
      discountOverride: { percent: 20, reason: "Approved single-invoice historical discount" },
      items: [{ productId, quantity: 1, unitPrice: 115 }],
    };
    const beforeStock = (await db.select({ stock: productsTable.stockQuantity }).from(productsTable).where(eq(productsTable.id, productId)))[0].stock;
    const created = await createCompanyInvoice(request, actorId, env);
    const [stored] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, created.id));
    expect(stored).toMatchObject({
      historical: "yes", contractId: contract.id, contractNumber: contract.contractNumber,
      contractDiscountPercent: "7.50", invoiceDiscountPercent: "20.00",
      appliedDiscountPercent: "20.00",
      discountOverrideOutsideContractPeriod: true, discountOverrideByAdminId: actorId,
      subtotal: 80, vatAmount: 12, totalAmount: 92, discountAmount: 23, qrCodeData: "",
    });
    expect(stored.discountOverrideAt).toBeInstanceOf(Date);
    expect((await db.select().from(productsTable).where(eq(productsTable.id, productId)))[0].stockQuantity).toBe(beforeStock);
    expect(await db.select().from(shipmentsTable).where(eq(shipmentsTable.invoiceId, created.id))).toHaveLength(0);
    expect((await createCompanyInvoice(request, actorId, env)).id).toBe(created.id);
    await expect(createCompanyInvoice({ ...request, discountOverride: { percent: 21, reason: request.discountOverride.reason } }, actorId, env))
      .rejects.toBeInstanceOf(DistributorInvoiceConflictError);
  });

  it("rejects an inactive distributor without saving anything", async () => {
    await expect(createDistributorInvoice({
      creationKey: `inactive-${base}-invoice`, distributorId: inactiveDistributorId,
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
      startDate: saudiCalendarDate(new Date()),
      paymentTerm: "end_of_month",
      paymentDays: null,
      termsConfirmedAt: new Date(),
      termsConfirmedBy: actorId,
      creditLimit: "1000000.00",
      creditLimitApprovedBy: actorId,
      creditLimitApprovedAt: new Date(),
      creditLimitApprovalReason: "Reviewed credit limit for uploaded file test fixture",
      uploadedBy: actorId,
    }))).returning();
    uploadedContractFileIds.push(...files.map((file) => file.id));
    await expect(createDistributorInvoice({
      creationKey: `ambiguous-${base}-invoice`,
      distributorId,
      taxTreatment: "domestic",
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    const issueDate = saudiCalendarDate(new Date());
    const dueDate = new Date(Date.parse(`${issueDate}T12:00:00.000Z`) + 17 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const invoice = await createCompanyInvoice({
      creationKey: `uploaded-${base}-invoice`,
      distributorId,
      uploadedContractFileId: files[0].id,
      issueDate,
      dueDate,
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env);
    const [persisted] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id));
    expect(persisted).toMatchObject({
      uploadedContractFileId: files[0].id,
      contractNumber: files[0].fileName,
      contractType: "Saudi distributor agreement",
      contractDiscountPercent: "7.50",
      appliedDiscountPercent: "7.50",
      paymentTerm: "end_of_month",
      paymentDays: null,
      dueDate,
      taxTreatment: "domestic",
      totalAmount: 18.5,
    });
    const overrideRequest = {
      creationKey: `discount-override-${base}-invoice`,
      distributorId,
      uploadedContractFileId: files[0].id,
      issueDate,
      dueDate,
      discountOverride: { percent: 25, reason: "خصم استثنائي معتمد لهذه الفاتورة فقط" },
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    };
    const overridden = await createCompanyInvoice(overrideRequest, actorId, env);
    const [savedOverride] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, overridden.id));
    expect(savedOverride).toMatchObject({
      contractDiscountPercent: "7.50",
      appliedDiscountPercent: "25.00",
      invoiceDiscountPercent: "25.00",
      discountOverrideReason: overrideRequest.discountOverride.reason,
      discountOverrideByAdminId: actorId,
      totalAmount: 15,
      discountAmount: 5,
    });
    expect(savedOverride.discountOverrideAt).toBeInstanceOf(Date);
    expect(savedOverride.discountOverrideOutsideContractPeriod).toBe(false);
    const [unchangedContract] = await db.select().from(uploadedContractFilesTable).where(eq(uploadedContractFilesTable.id, files[0].id));
    expect(unchangedContract.discountPercent).toBe("7.50");
    const priorInvoice = await createCompanyInvoice({
      creationKey: `prior-contract-${base}-invoice`,
      distributorId,
      uploadedContractFileId: files[0].id,
      issueDate: "2000-04-17",
      dueDate: "2000-05-17",
      discountOverride: { percent: 25, reason: "Historical invoice-specific approved discount" },
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env);
    const [savedPrior] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, priorInvoice.id));
    expect(savedPrior).toMatchObject({
      historical: "yes",
      uploadedContractFileId: files[0].id,
      contractDiscountPercent: "7.50",
      appliedDiscountPercent: "25.00",
      invoiceDiscountPercent: "25.00",
      discountOverrideByAdminId: actorId,
      discountOverrideOutsideContractPeriod: true,
      discountAmount: 5,
      totalAmount: 15,
    });
    expect(savedPrior.discountOverrideAt).toBeInstanceOf(Date);
    expect(savedPrior.qrCodeData).toBe("");
    const contractRatePrior = await createCompanyInvoice({
      creationKey: `prior-contract-rate-${base}-invoice`,
      distributorId,
      uploadedContractFileId: files[0].id,
      issueDate: "2000-04-17",
      dueDate: "2000-05-17",
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env);
    const [savedContractRatePrior] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, contractRatePrior.id));
    expect(savedContractRatePrior).toMatchObject({
      historical: "yes",
      uploadedContractFileId: files[0].id,
      contractDiscountPercent: "7.50",
      appliedDiscountPercent: "7.50",
      invoiceDiscountPercent: null,
      discountOverrideOutsideContractPeriod: null,
      discountAmount: 1.5,
      totalAmount: 18.5,
    });
    const [stillUnchanged] = await db.select().from(uploadedContractFilesTable).where(eq(uploadedContractFilesTable.id, files[0].id));
    expect(stillUnchanged.discountPercent).toBe("7.50");
    const unchangedRate = await createCompanyInvoice({
      creationKey: `unchanged-${base}-invoice`, distributorId, uploadedContractFileId: files[0].id,
      issueDate: "2000-04-18", dueDate: "2000-05-18",
      discountOverride: { percent: 7.5 }, items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env);
    const [unchangedSaved] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, unchangedRate.id));
    expect(unchangedSaved).toMatchObject({ appliedDiscountPercent: "7.50", invoiceDiscountPercent: null, discountOverrideReason: null, discountOverrideOutsideContractPeriod: null });
    expect((await createCompanyInvoice({
      creationKey: `unchanged-${base}-invoice`, distributorId, uploadedContractFileId: files[0].id,
      issueDate: "2000-04-18", dueDate: "2000-05-18",
      discountOverride: { percent: 7.5 }, items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env)).id).toBe(unchangedRate.id);
    await db.update(uploadedContractFilesTable).set({ startDate: "1999-01-01", endDate: "1999-12-31" }).where(eq(uploadedContractFilesTable.id, files[0].id));
    const afterEnd = await createCompanyInvoice({
      creationKey: `expired-${base}-invoice`, distributorId, uploadedContractFileId: files[0].id,
      issueDate: "2000-04-19", dueDate: "2000-05-19",
      discountOverride: { percent: 10, reason: "Approved historical exception after contract end" },
      items: [{ productId, quantity: 2, unitPrice: 19.99 }],
    }, actorId, env);
    const [expiredSaved] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, afterEnd.id));
    expect(expiredSaved).toMatchObject({
      uploadedContractFileId: files[0].id, contractDiscountPercent: "7.50", appliedDiscountPercent: "10.00", invoiceDiscountPercent: "10.00",
      discountOverrideOutsideContractPeriod: true, totalAmount: 35.98, discountAmount: 4,
      subtotal: 31.29, vatAmount: 4.69,
    });
    const historicalJournal = await db.select().from(journalEntriesTable).where(and(
      eq(journalEntriesTable.sourceType, "historical_company_invoice"), eq(journalEntriesTable.sourceId, String(afterEnd.id)),
    ));
    expect(historicalJournal).toHaveLength(1);
    const journalLines = await db.select({ code: accountingAccountsTable.code, debit: journalEntryLinesTable.debit, credit: journalEntryLinesTable.credit })
      .from(journalEntryLinesTable).innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
      .where(eq(journalEntryLinesTable.journalEntryId, historicalJournal[0].id));
    expect(journalLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "1130", debit: "35.9800" }),
      expect.objectContaining({ code: "4100", credit: "31.2900" }),
      expect.objectContaining({ code: "2120", credit: "4.6900" }),
    ]));
    expect(await db.select().from(shipmentsTable).where(eq(shipmentsTable.invoiceId, afterEnd.id))).toHaveLength(0);
    expect(await db.select().from(inventoryMovementsTable).where(and(eq(inventoryMovementsTable.sourceType, "distributor_invoice"), eq(inventoryMovementsTable.sourceId, String(afterEnd.id))))).toHaveLength(0);
    expect((await createCompanyInvoice({
      creationKey: `expired-${base}-invoice`, distributorId, uploadedContractFileId: files[0].id,
      issueDate: "2000-04-19", dueDate: "2000-05-19",
      discountOverride: { percent: 10, reason: "Approved historical exception after contract end" },
      items: [{ productId, quantity: 2, unitPrice: 19.99 }],
    }, actorId, env)).id).toBe(afterEnd.id);
    await expect(createCompanyInvoice({
      creationKey: `expired-${base}-invoice`, distributorId, uploadedContractFileId: files[0].id,
      issueDate: "2000-04-19", dueDate: "2000-05-19",
      discountOverride: { percent: 11, reason: "Approved historical exception after contract end" },
      items: [{ productId, quantity: 2, unitPrice: 19.99 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    await db.update(uploadedContractFilesTable).set({ startDate: issueDate, endDate: null }).where(eq(uploadedContractFilesTable.id, files[0].id));
    expect((await createCompanyInvoice(overrideRequest, actorId, env)).id).toBe(overridden.id);
    await expect(createCompanyInvoice({
      ...overrideRequest, discountOverride: { percent: 30, reason: overrideRequest.discountOverride.reason },
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    await expect(createCompanyInvoice({
      ...overrideRequest, creationKey: `invalid-override-${base}`, discountOverride: { percent: 30, reason: "short" },
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceValidationError);
    await expect(createDistributorInvoice({
      creationKey: `uploaded-${base}-invoice`, distributorId, uploadedContractFileId: files[1].id,
      taxTreatment: "domestic", items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
  });

  it("enforces company-wide outstanding exposure across contract sources after collections", async () => {
    const [company] = await db.insert(wholesaleDistributorsTable).values({
      companyName: `Credit exposure test ${base}`,
      contactName: "Credit reviewer test",
      phone: `056${String(base).slice(-7)}`,
    }).returning({ id: wholesaleDistributorsTable.id });
    creditTestDistributorId = company.id;
    const generated = await insertApprovedCreditContract(company.id, `Credit exposure test ${base}`, "Saudi distributor agreement", "50.00");
    const today = saudiCalendarDate(new Date());
    const first = await createCompanyInvoice({
      creationKey: `credit-first-${base}`,
      distributorId: company.id,
      contractId: generated.id,
      issueDate: today,
      dueDate: today,
      items: [{ productId, quantity: 1, unitPrice: 40 }],
    }, actorId, env);
    await createReceivablePayment(first.id, {
      paymentKey: `credit-first-payment-${base}`,
      paymentDate: today,
      amount: 15,
      paymentMethod: "bank_transfer",
    }, actorId);
    const second = await createCompanyInvoice({
      creationKey: `credit-second-${base}`,
      distributorId: company.id,
      contractId: generated.id,
      issueDate: today,
      dueDate: today,
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env);
    await expect(createCompanyInvoice({
      creationKey: `credit-over-limit-${base}`,
      distributorId: company.id,
      contractId: generated.id,
      issueDate: today,
      dueDate: today,
      items: [{ productId, quantity: 1, unitPrice: 6 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);

    const [uploaded] = await db.insert(uploadedContractFilesTable).values({
      ownerType: "distributor",
      ownerId: company.id,
      ownerName: `Credit exposure test ${base}`,
      fileName: `credit-exposure-${base}.pdf`,
      objectPath: `/objects/uploads/contracts/files/credit-exposure-${base}`,
      mimeType: "application/pdf",
      sizeBytes: 100,
      contractType: "Saudi distributor agreement",
      discountPercent: "0",
      paymentTerm: "due_on_issue",
      termsConfirmedAt: new Date(),
      termsConfirmedBy: actorId,
      creditLimit: "50.00",
      creditLimitApprovedBy: actorId,
      creditLimitApprovedAt: new Date(),
      creditLimitApprovalReason: "Reviewed uploaded credit limit for exposure test",
      uploadedBy: actorId,
    }).returning();
    uploadedContractFileIds.push(uploaded.id);
    await expect(createCompanyInvoice({
      creationKey: `credit-cross-source-over-limit-${base}`,
      distributorId: company.id,
      uploadedContractFileId: uploaded.id,
      issueDate: today,
      dueDate: today,
      items: [{ productId, quantity: 1, unitPrice: 6 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);

    await cancelCompanyInvoice(second.id, "Release exposure in credit limit test", actorId);
    const afterCancellation = await createCompanyInvoice({
      creationKey: `credit-cross-source-after-cancel-${base}`,
      distributorId: company.id,
      uploadedContractFileId: uploaded.id,
      issueDate: today,
      dueDate: today,
      items: [{ productId, quantity: 1, unitPrice: 6 }],
    }, actorId, env);
    const [afterCancellationRecord] = await db.select({ uploadedContractFileId: invoicesTable.uploadedContractFileId })
      .from(invoicesTable).where(eq(invoicesTable.id, afterCancellation.id));
    expect(afterCancellationRecord.uploadedContractFileId).toBe(uploaded.id);
    expect(first.outstandingAmount).toBe(40);
    await createReceivablePayment(first.id, {
      paymentKey: `credit-first-final-payment-${base}`,
      paymentDate: today,
      amount: first.outstandingAmount - 15,
      paymentMethod: "bank_transfer",
    }, actorId);
    const firstPayments = await db.select({ amount: receivablePaymentsTable.amount }).from(receivablePaymentsTable)
      .where(eq(receivablePaymentsTable.invoiceId, first.id));
    const [firstRecord] = await db.select({ totalAmount: invoicesTable.totalAmount }).from(invoicesTable)
      .where(eq(invoicesTable.id, first.id));
    expect(firstPayments.reduce((sum, payment) => sum + payment.amount, 0)).toBe(Number(firstRecord.totalAmount));
    await cancelCompanyInvoice(afterCancellation.id, "Release exposure in credit limit test", actorId);
    await db.update(distributorContractsTable).set({ creditLimit: "0.00" }).where(eq(distributorContractsTable.id, generated.id));
    const fullyCollected = await createCompanyInvoice({
      creationKey: `credit-fully-collected-${base}`,
      distributorId: company.id,
      contractId: generated.id,
      issueDate: today,
      dueDate: today,
      collected: true,
      paymentDate: today,
      paymentMethod: "cash",
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env);
    expect(fullyCollected.outstandingAmount).toBe(0);
    await db.update(productsTable).set({ stockQuantity: 10 }).where(eq(productsTable.id, productId));
    await db.update(inventoryBalancesTable).set({ available: 10 }).where(eq(inventoryBalancesTable.productId, productId));
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
        creditLimit: "1000000.00",
        creditLimitApprovedBy: actorId,
        creditLimitApprovedAt: new Date(),
        creditLimitApprovalReason: "Reviewed credit limit for concurrent uploaded file fixture",
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

  it("posts an immediately collected current invoice once and reports it paid", async () => {
    const creationKey = `company-paid-${base}-invoice`;
    const [paidTestDistributor] = await db.insert(wholesaleDistributorsTable).values({
      companyName: `Paid invoice test ${base}`, contactName: "Tester", phone: `054${String(base).slice(-7)}`,
    }).returning({ id: wholesaleDistributorsTable.id });
    paidTestDistributorId = paidTestDistributor.id;
    await insertApprovedCreditContract(paidTestDistributorId, `Paid invoice test ${base}`);
    const today = saudiCalendarDate(new Date());
    const input = {
      creationKey,
      distributorId: paidTestDistributorId,
      issueDate: today,
      dueDate: today,
      collected: true,
      paymentDate: today,
      paymentMethod: "bank_transfer" as const,
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    };
    const [invoice, replay] = await Promise.all([
      createCompanyInvoice(input, actorId, env),
      createCompanyInvoice(input, actorId, env),
    ]);
    expect(replay.id).toBe(invoice.id);
    expect(invoice).toMatchObject({ paidAmount: 20, outstandingAmount: 0, paymentStatus: "paid" });
    const [storedInvoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id));
    expect(Math.abs(storedInvoice.issueDatetime.getTime() - Date.now())).toBeLessThan(60_000);
    const payments = await db.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, invoice.id));
    expect(payments).toHaveLength(1);
    const receiptJournals = await db.select().from(journalEntriesTable).where(and(
      eq(journalEntriesTable.sourceType, "receivable_payment"),
      eq(journalEntriesTable.sourceId, String(payments[0].id)),
    ));
    expect(receiptJournals).toHaveLength(1);
    await db.update(productsTable).set({ stockQuantity: 10 }).where(eq(productsTable.id, productId));
    await db.update(inventoryBalancesTable).set({ available: 10 }).where(eq(inventoryBalancesTable.productId, productId));
  });

  it("uses the real instant for a morning Riyadh issuance instead of an afternoon placeholder", () => {
    const morning = new Date("2026-09-27T06:15:00.000Z"); // 09:15 in Riyadh
    expect(invoiceIssueTimestamp("2026-09-27", morning)).toEqual(morning);
    expect(invoiceIssueTimestamp("2026-09-26", morning).toISOString()).toBe("2026-09-26T12:00:00.000Z");
  });

  it("classifies past issue dates as historical with mixed catalog and snapshot lines and no original number", async () => {
    const issueDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dueDate = new Date(Date.parse(`${issueDate}T12:00:00.000Z`) + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const paymentDate = new Date(Date.parse(`${issueDate}T12:00:00.000Z`) + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [catalogProduct] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    const [beforeMovementCount] = await db.select({ count: sql<number>`count(*)` }).from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.productId, productId));
    await db.update(productsTable).set({ isActive: false }).where(eq(productsTable.id, productId));
    try {
      const invoice = await createCompanyInvoice({
        creationKey: `company-historical-${base}-invoice`,
        distributorId: paidTestDistributorId!,
        issueDate,
        dueDate,
        collected: true,
        paymentDate,
        paymentMethod: "cash",
        items: [
          { productId, quantity: 1, unitPrice: 20 },
          { productName: `Historical snapshot ${base}`, sku: `HIST-${base}`, quantity: 1, unitPrice: 10 },
        ],
      }, actorId, env);
      expect(invoice).toMatchObject({
        historical: "yes",
        originalInvoiceNumber: null,
        paidAmount: 30,
        outstandingAmount: 0,
        paymentStatus: "paid",
      });
      expect(invoice.invoiceNumber).toMatch(/^LC-[0-9]+$/);
      const [stored] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id));
      expect(stored.sequenceNumber).toBeLessThan(0);
      expect(stored.dueDate).toBe(dueDate);
      expect(invoice.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          productId,
          productName: catalogProduct.invoiceNameAr,
          productNameEn: catalogProduct.invoiceNameEn,
          sku: catalogProduct.sku,
        }),
        expect.objectContaining({
          productId: null,
          productName: `Historical snapshot ${base}`,
          sku: `HIST-${base}`,
        }),
      ]));
      const [afterMovementCount] = await db.select({ count: sql<number>`count(*)` }).from(inventoryMovementsTable)
        .where(eq(inventoryMovementsTable.productId, productId));
      expect(afterMovementCount.count).toBe(beforeMovementCount.count);
    } finally {
      await db.update(productsTable).set({ isActive: catalogProduct.isActive }).where(eq(productsTable.id, productId));
    }
  });

  it("rejects invalid company invoice dates and incomplete collection details", async () => {
    const today = saudiCalendarDate(new Date());
    const yesterday = new Date(Date.parse(`${today}T12:00:00.000Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await expect(createCompanyInvoice({
      creationKey: `bad-due-${base}-invoice`,
      distributorId: paidTestDistributorId!,
      issueDate: today,
      dueDate: yesterday,
      items: [{ productId, quantity: 1, unitPrice: 10 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceValidationError);
    await expect(createCompanyInvoice({
      creationKey: `bad-payment-${base}-invoice`,
      distributorId: paidTestDistributorId!,
      issueDate: today,
      dueDate: today,
      collected: true,
      items: [{ productId, quantity: 1, unitPrice: 10 }],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceValidationError);
    const tomorrow = new Date(Date.parse(`${today}T12:00:00.000Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const futurePaymentKey = `future-payment-${base}-invoice`;
    await expect(createCompanyInvoice({
      creationKey: futurePaymentKey,
      distributorId: paidTestDistributorId!,
      issueDate: today,
      dueDate: today,
      collected: true,
      paymentDate: tomorrow,
      paymentMethod: "cash",
      items: [{ productId, quantity: 1, unitPrice: 10 }],
    }, actorId, env)).rejects.toThrow("paymentDate cannot be in the future");
    expect(await db.select().from(invoicesTable).where(eq(invoicesTable.creationKey, futurePaymentKey))).toHaveLength(0);
    await expect(createCompanyInvoice({
      creationKey: `duplicate-snapshot-${base}-invoice`,
      distributorId: paidTestDistributorId!,
      issueDate: yesterday,
      dueDate: today,
      items: [
        { productName: "Repeated historical snapshot", sku: "DUP-1", quantity: 1, unitPrice: 10 },
        { productName: "Repeated historical snapshot", sku: "DUP-1", quantity: 1, unitPrice: 10 },
      ],
    }, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceValidationError);
  });

  it("voids an uncollected live invoice once and balances receivable, VAT, revenue, COGS and stock", async () => {
    const request = { creationKey: `void-${base}-invoice`, distributorId: paidTestDistributorId!, items: [{ productId, quantity: 1, unitPrice: 23 }] };

    const before = (await db.select().from(productsTable).where(eq(productsTable.id, productId)))[0];
    const invoice = await createDistributorInvoice(request, actorId, env);
    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.invoiceId, invoice.id));
    expect(shipment.status).toBe("pending");
    const [sale] = await db.select().from(journalEntriesTable).where(and(eq(journalEntriesTable.sourceType, "distributor_invoice"), eq(journalEntriesTable.sourceId, String(invoice.id))));
    const [cogs] = await db.select().from(journalEntriesTable).where(and(eq(journalEntriesTable.sourceType, "distributor_invoice_cogs"), eq(journalEntriesTable.sourceId, String(invoice.id))));
    const [outgoing] = await db.select().from(inventoryMovementsTable).where(eq(inventoryMovementsTable.eventKey, `distributor-invoice:${invoice.id}:${productId}`));
    const [cancelled, other] = await Promise.allSettled([
      cancelCompanyInvoice(invoice.id, "Incorrect company purchase order", actorId),
      cancelCompanyInvoice(invoice.id, "Incorrect company purchase order", actorId),
    ]);
    expect([cancelled, other].filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect([cancelled, other].filter(result => result.status === "rejected")).toHaveLength(1);
    const [stored] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id));
    expect(stored).toMatchObject({ cancellationReason: "Incorrect company purchase order", cancelledByAdminId: actorId, invoiceNumber: invoice.invoiceNumber });
    expect(stored.cancelledAt).toBeInstanceOf(Date);
    expect(stored.archivedAt).toBeInstanceOf(Date);
    expect(stored.archivedByAdminId).toBe(actorId);
    expect((await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, shipment.id)))[0].status).toBe("cancelled");
    const reversals = await db.select().from(journalEntriesTable).where(inArray(journalEntriesTable.reversalOfEntryId, [sale.id, cogs.id]));
    expect(reversals).toHaveLength(2);
    for (const original of [sale, cogs]) {
      const reversal = reversals.find(row => row.reversalOfEntryId === original.id)!;
      expect(reversal.entryDate).toBe(saudiCalendarDate(new Date()));
      const ledger = async (id: number) => db.select({ code: accountingAccountsTable.code, debit: journalEntryLinesTable.debit, credit: journalEntryLinesTable.credit })
        .from(journalEntryLinesTable).innerJoin(accountingAccountsTable, eq(accountingAccountsTable.id, journalEntryLinesTable.accountId))
        .where(eq(journalEntryLinesTable.journalEntryId, id)).orderBy(journalEntryLinesTable.lineNumber);
      expect(await ledger(reversal.id)).toEqual((await ledger(original.id)).map(line => ({ ...line, debit: line.credit, credit: line.debit })));
    }
    const [returned] = await db.select().from(inventoryMovementsTable).where(eq(inventoryMovementsTable.eventKey, `distributor-invoice-cancellation:${invoice.id}:${productId}`));
    expect(returned).toMatchObject({ quantityChange: 1, unitCost: outgoing.unitCost, totalCost: outgoing.totalCost });
    const [after] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    expect(after.stockQuantity).toBe(before.stockQuantity);
    await expect(createReceivablePayment(invoice.id, { paymentKey: `void-payment-${base}`, amount: 1, paymentDate: saudiCalendarDate(new Date()), paymentMethod: "cash" }, actorId))
      .rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    await expect(createDistributorInvoice(request, actorId, env)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    expect((await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id)))[0].sequenceNumber).toBe(invoice.sequenceNumber);
  });

  it("rejects collections and carrier activity without partially changing an invoice", async () => {
    await expect(cancelCompanyInvoice(successfulInvoiceId, "Collected invoice cannot be voided", actorId)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    const invoice = await createDistributorInvoice({ creationKey: `shipped-${base}-invoice`, distributorId: paidTestDistributorId!, items: [{ productId, quantity: 1, unitPrice: 20 }] }, actorId, env);
    const [shipment] = await db.update(shipmentsTable).set({ integrationAttempts: 1 }).where(eq(shipmentsTable.invoiceId, invoice.id)).returning();
    await db.insert(shipmentEventsTable).values({ shipmentId: shipment.id, carrier: "test", eventType: "label_request", outcome: "failed" });
    await expect(cancelCompanyInvoice(invoice.id, "Already attempted carrier shipment", actorId)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    await db.update(shipmentsTable).set({ integrationAttempts: 0, trackingNumber: "TRACKED-TEST", status: "pending" }).where(eq(shipmentsTable.id, shipment.id));
    await expect(cancelCompanyInvoice(invoice.id, "Already assigned tracking number", actorId)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    await db.update(shipmentsTable).set({ trackingNumber: null, status: "ready" }).where(eq(shipmentsTable.id, shipment.id));
    await expect(cancelCompanyInvoice(invoice.id, "Shipment already marked ready", actorId)).rejects.toBeInstanceOf(DistributorInvoiceConflictError);
    expect((await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id)))[0].cancelledAt).toBeNull();
    expect(await db.select().from(inventoryMovementsTable).where(eq(inventoryMovementsTable.sourceType, "distributor_invoice_cancellation"))).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceId: String(invoice.id) })]));
  });

  it("serializes cancellation against a collection and leaves only one outcome", async () => {
    const invoice = await createDistributorInvoice({
      creationKey: `payment-race-${base}-invoice`, distributorId: paidTestDistributorId!,
      items: [{ productId, quantity: 1, unitPrice: 20 }],
    }, actorId, env);
    const [voidResult, paymentResult] = await Promise.allSettled([
      cancelCompanyInvoice(invoice.id, "Incorrect payment race invoice", actorId),
      createReceivablePayment(invoice.id, {
        paymentKey: `payment-race-${base}`, paymentDate: saudiCalendarDate(new Date()),
        amount: 5, paymentMethod: "bank_transfer",
      }, actorId),
    ]);
    expect([voidResult.status, paymentResult.status].sort()).toEqual(["fulfilled", "rejected"]);
    const [record] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id));
    const payments = await db.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, invoice.id));
    expect(Boolean(record.cancelledAt)).toBe(payments.length === 0);
  });

  it("cancels a pending order shipment even without fulfilled stock", async () => {
    const id = orderIds[2];
    await db.update(ordersTable).set({ paymentMethod: "cod" }).where(eq(ordersTable.id, id));
    await db.insert(shipmentsTable).values({ channel: "online", orderId: id, destinationCity: "Riyadh", status: "pending" });
    const result = await updateOrderAndIssueInvoice(id, { status: "cancelled" }, process.env, actorId);
    expect(result?.status).toBe("cancelled");
    expect((await db.select().from(shipmentsTable).where(eq(shipmentsTable.orderId, id)))[0].status).toBe("cancelled");
    await expect(updateOrderAndIssueInvoice(id, { status: "cancelled" }, process.env, actorId)).resolves.toMatchObject({ status: "cancelled" });
    await db.delete(shipmentsTable).where(eq(shipmentsTable.orderId, id));
  });
});
