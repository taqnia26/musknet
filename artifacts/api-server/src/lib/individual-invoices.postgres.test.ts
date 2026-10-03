import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, count, eq, inArray } from "drizzle-orm";
import {
  accountingAccountsTable, adminUsersTable, categoriesTable, couponsTable, db, inventoryBalancesTable,
  inventoryMovementsTable, invoiceItemsTable, invoicesTable, journalEntriesTable,
  journalEntryLinesTable, operationEventsTable, ordersTable, productsTable,
  receivablePaymentsTable, shipmentsTable, pool as testPool,
} from "@workspace/db";
import * as Api from "@workspace/api-zod";
import {
  createIndividualInvoice, IndividualInvoiceConflictError, IndividualInvoiceValidationError,
} from "./individual-invoices";
import { createReceivablePayment } from "./invoices";
import { addCalendarDays, saudiCalendarDate } from "./invoice-dates";

const runIntegration = process.env.INDIVIDUAL_INVOICE_POSTGRES_E2E === "true";

describe.runIf(runIntegration)("standalone individual invoice: disposable PostgreSQL", () => {
  const databaseUrl = process.env.DATABASE_URL;
  const expectedDatabase = process.env.INDIVIDUAL_INVOICE_E2E_DATABASE;
  const clusterDirectory = process.env.INDIVIDUAL_INVOICE_E2E_CLUSTER_DIR;
  const base = `ii-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const today = saudiCalendarDate(new Date());
  const environment = {
    VAT_SELLER_LEGAL_NAME: "مؤسسة مسك اللولو للتجارة",
    VAT_REGISTRATION_NUMBER: "300000000000003",
  };
  let pool: typeof testPool;
  let actorId: number;
  let productId: number;
  let collectedProductId: number;
  let discountProductId: number;
  let ordersBefore = 0;

  const parseInvoiceResponse = (invoice: Awaited<ReturnType<typeof createIndividualInvoice>>) =>
    Api.AdminCreateIndividualInvoiceResponse.parse(JSON.parse(JSON.stringify({
      ...invoice,
      vatRate: invoice.vatRate === null ? null : Number(invoice.vatRate),
      contractDiscountPercent: invoice.contractDiscountPercent === null ? null : Number(invoice.contractDiscountPercent),
    })));

  beforeAll(async () => {
    if (!databaseUrl || !expectedDatabase || !clusterDirectory) {
      throw new Error("The isolated individual-invoice PostgreSQL runner must provide database and cluster identity.");
    }
    const target = new URL(databaseUrl);
    expect(["127.0.0.1", "localhost", "::1"]).toContain(target.hostname);
    expect(target.password).toBe("");
    expect(target.pathname.slice(1)).toBe(expectedDatabase);
    expect(expectedDatabase).toMatch(/^individual_invoice_e2e_[a-z0-9_]+$/);
    pool = testPool;
    const identity = await pool.query(`
      SELECT current_database() AS database, current_setting('data_directory') AS "dataDirectory",
             inet_server_addr()::text AS "serverAddress"
    `);
    expect(identity.rows[0]?.database).toBe(expectedDatabase);
    expect(identity.rows[0]?.dataDirectory).toBe(clusterDirectory);
    expect(["127.0.0.1", "::1"]).toContain(String(identity.rows[0]?.serverAddress).split("/")[0]);
    const [orderCount] = await db.select({ value: count() }).from(ordersTable);
    ordersBefore = orderCount.value;

    const [actor] = await db.insert(adminUsersTable).values({
      email: `${base}@test.invalid`,
      name: "Individual Invoice Test",
      passwordHash: "isolated-invoice-test",
      isSuperAdmin: true,
    }).returning({ id: adminUsersTable.id });
    actorId = actor.id;
    const [category] = await db.insert(categoriesTable).values({
      nameAr: "اختبار الفاتورة الفردية",
      nameEn: "Individual invoice test",
      slug: `${base}-category`,
    }).returning({ id: categoriesTable.id });
    const products = await db.insert(productsTable).values([
      {
        nameAr: "منتج إصدار غير مدفوع",
        nameEn: "Unpaid invoice test product",
        slug: `${base}-unpaid`,
        price: 115,
        categoryId: category.id,
        sku: `${base}-UNPAID`,
        stockQuantity: 12,
        averageCost: "4.0000",
      },
      {
        nameAr: "منتج إصدار محصل",
        nameEn: "Collected invoice test product",
        slug: `${base}-collected`,
        price: 115,
        categoryId: category.id,
        sku: `${base}-COLLECTED`,
        stockQuantity: 12,
        averageCost: "5.0000",
      },
      {
        nameAr: "منتج اختبار الخصم",
        nameEn: "Discount invoice test product",
        slug: `${base}-discount`,
        price: 115,
        categoryId: category.id,
        sku: `${base}-DISCOUNT`,
        stockQuantity: 12,
        averageCost: "4.0000",
      },
    ]).returning({ id: productsTable.id });
    productId = products[0].id;
    collectedProductId = products[1].id;
    discountProductId = products[2].id;
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("snapshots sequential coupon/manual discounts, posts discounted revenue, and replays without consuming again", async () => {
    const productId = discountProductId;
    const [coupon] = await db.insert(couponsTable).values({
      code: `${base}-DISCOUNT`.toUpperCase(), discountType: "percentage", discountValue: 10, usageLimit: 1,
    }).returning();
    const input = {
      creationKey: `${base}-discount-key`, buyerName: "مشتري بخصم", buyerPhone: "+966 50 123 4567", buyerAddress: null, buyerTaxNumber: null,
      issueDate: today, items: [{ productId, quantity: 1, unitPrice: 115 }],
      couponCode: coupon.code, discountOverride: { percent: 10, reason: "خصم موثق للمنتجات بعد الكوبون" },
    };
    const [before] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    const results = await Promise.all([1, 2].map(() => createIndividualInvoice(input, actorId, environment)));
    expect(results[0].id).toBe(results[1].id);
    expect(parseInvoiceResponse(results[0])).toMatchObject({
      subtotal: 81, vatAmount: 12.15, totalAmount: 93.15, outstandingAmount: 93.15,
      discountAmount: 21.85, couponDiscountAmount: 11.5, manualDiscountAmount: 10.35,
      manualDiscountPercent: 10, invoiceDiscountPercent: 10, discountOverrideByAdminId: actorId,
      discountOverrideReason: input.discountOverride.reason,
    });
    expect(results[0].items[0]).toMatchObject({ unitPrice: 115, subtotal: 81, vatAmount: 12.15, totalAmount: 93.15 });
    expect((await db.select().from(couponsTable).where(eq(couponsTable.id, coupon.id)))[0].timesUsed).toBe(1);
    expect((await db.select().from(productsTable).where(eq(productsTable.id, productId)))[0]).toMatchObject({ stockQuantity: before.stockQuantity - 1, averageCost: before.averageCost });
    await db.update(couponsTable).set({ isActive: false }).where(eq(couponsTable.id, coupon.id));
    expect((await createIndividualInvoice(input, actorId, environment)).id).toBe(results[0].id);
    await expect(createIndividualInvoice({ ...input, discountOverride: { ...input.discountOverride, percent: 20 } }, actorId, environment)).rejects.toBeInstanceOf(IndividualInvoiceConflictError);
  });

  it("issues unpaid invoices once, replays current payment status, and rejects a conflicting key", async () => {
    const input = {
      creationKey: `${base}-unpaid-creation-key`,
      buyerName: "مشتري مباشر",
      buyerPhone: "+966 50 123 4567",
      buyerAddress: null,
      buyerTaxNumber: null,
      issueDate: today,
      items: [{ productId, quantity: 2, unitPrice: 115 }],
    };
    const first = await createIndividualInvoice(input, actorId, environment);
    const firstContractResponse = parseInvoiceResponse(first);
    expect(firstContractResponse.buyerPhone).toBe(input.buyerPhone);
    await expect(createIndividualInvoice({ ...input, buyerPhone: "+966 50 999 9999" }, actorId, environment))
      .rejects.toThrow(/different invoice details/);
    for (const buyerPhone of ["", "123", "invalid-phone", "1234567890123456"]) {
      await expect(createIndividualInvoice({ ...input, buyerPhone }, actorId, environment)).rejects.toThrow(/phone/);
    }
    expect(firstContractResponse).toMatchObject({
      individual: true,
      orderId: null,
      orderNumber: null,
      distributorId: null,
      distributorName: null,
      exhibitionId: null,
      exhibitionName: null,
      subtotal: 200,
      vatAmount: 30,
      totalAmount: 230,
      paidAmount: 0,
      outstandingAmount: 230,
      paymentStatus: "unpaid",
    });
    expect(saudiCalendarDate(firstContractResponse.issueDatetime)).toBe(today);
    expect(Date.now() - firstContractResponse.issueDatetime.getTime()).toBeLessThan(30_000);
    expect(first.items[0]).toMatchObject({
      productId, quantity: 2, unitPrice: 115, subtotal: 200, vatAmount: 30, totalAmount: 230,
    });

    const replay = await createIndividualInvoice(input, actorId, environment);
    expect(parseInvoiceResponse(replay)).toMatchObject({
      id: first.id,
      individual: true,
      paymentStatus: "unpaid",
      outstandingAmount: 230,
    });
    await expect(createIndividualInvoice({
      ...input, items: [{ productId, quantity: 2, unitPrice: 120 }],
    }, actorId, environment)).rejects.toBeInstanceOf(IndividualInvoiceConflictError);

    const [stored] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, first.id));
    expect(stored).toMatchObject({ individual: true, orderId: null, distributorId: null, exhibitionId: null, dueDate: null });
    const [orderCount] = await db.select({ value: count() }).from(ordersTable);
    expect(orderCount.value).toBe(ordersBefore);
    expect(await db.select().from(shipmentsTable).where(eq(shipmentsTable.invoiceId, first.id))).toHaveLength(0);
    const [stock] = await db.select({ quantity: productsTable.stockQuantity }).from(productsTable).where(eq(productsTable.id, productId));
    expect(stock.quantity).toBe(10);
    const [balance] = await db.select({ available: inventoryBalancesTable.available }).from(inventoryBalancesTable)
      .where(eq(inventoryBalancesTable.productId, productId));
    expect(balance.available).toBe(10);
    const movements = await db.select().from(inventoryMovementsTable).where(and(
      eq(inventoryMovementsTable.sourceType, "individual_invoice"),
      eq(inventoryMovementsTable.sourceId, String(first.id)),
    ));
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      quantityChange: -2, quantityBefore: 12, quantityAfter: 10, totalCost: "8.0000",
    });
    const journals = await db.select().from(journalEntriesTable).where(and(
      inArray(journalEntriesTable.sourceType, ["individual_invoice", "individual_invoice_cogs"]),
      eq(journalEntriesTable.sourceId, String(first.id)),
    ));
    expect(journals.map((entry) => entry.sourceType).sort()).toEqual(["individual_invoice", "individual_invoice_cogs"]);
    const saleEntry = journals.find((entry) => entry.sourceType === "individual_invoice")!;
    const saleLines = await db.select({
      code: accountingAccountsTable.code,
      debit: journalEntryLinesTable.debit,
      credit: journalEntryLinesTable.credit,
    }).from(journalEntryLinesTable)
      .innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
      .where(eq(journalEntryLinesTable.journalEntryId, saleEntry.id));
    expect(saleLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "1130", debit: "230.0000", credit: "0.0000" }),
      expect.objectContaining({ code: "4100", debit: "0.0000", credit: "200.0000" }),
      expect.objectContaining({ code: "2120", debit: "0.0000", credit: "30.0000" }),
    ]));
    const invoiceCount = await db.select({ id: invoicesTable.id }).from(invoicesTable)
      .where(eq(invoicesTable.creationKey, input.creationKey));
    const eventCount = await db.select({ id: operationEventsTable.id }).from(operationEventsTable)
      .where(eq(operationEventsTable.eventKey, `individual-invoice:${first.id}`));
    expect(invoiceCount).toHaveLength(1);
    expect(eventCount).toHaveLength(1);

    await createReceivablePayment(first.id, {
      paymentKey: `${base}-later-payment`,
      paymentDate: today,
      amount: 230,
      paymentMethod: "bank_transfer",
    }, actorId);
    const replayAfterCollection = await createIndividualInvoice(input, actorId, environment);
    expect(replayAfterCollection).toMatchObject({
      id: first.id, paymentStatus: "paid", paidAmount: 230, outstandingAmount: 0,
    });
    expect(await db.select().from(inventoryMovementsTable).where(and(
      eq(inventoryMovementsTable.sourceType, "individual_invoice"),
      eq(inventoryMovementsTable.sourceId, String(first.id)),
    ))).toHaveLength(1);
    expect(await db.select().from(journalEntriesTable).where(and(
      inArray(journalEntriesTable.sourceType, ["individual_invoice", "individual_invoice_cogs"]),
      eq(journalEntriesTable.sourceId, String(first.id)),
    ))).toHaveLength(2);
  });

  it("supports optional collected-at-issuance with a cash or bank account journal and no due date", async () => {
    const issueDate = addCalendarDays(today, -1);
    const collected = await createIndividualInvoice({
      creationKey: `${base}-collected-creation-key`,
      buyerName: "مشتري دفع عند الإصدار",
      buyerPhone: "0501234567",
      buyerAddress: "الرياض",
      buyerTaxNumber: "310000000000003",
      issueDate,
      collected: { paymentDate: today, paymentMethod: "bank_transfer" },
      items: [{ productId: collectedProductId, quantity: 1, unitPrice: 115 }],
    }, actorId, environment);
    const collectedResponse = parseInvoiceResponse(collected);
    expect(collectedResponse).toMatchObject({
      individual: true,
      dueDate: null,
      paymentStatus: "paid",
      paidAmount: 115,
      outstandingAmount: 0,
      payments: [{
        amount: 115,
        paymentMethod: "bank_transfer",
        paymentDate: new Date(`${today}T00:00:00.000Z`),
      }],
    });
    const [line] = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, collected.id));
    expect(line).toMatchObject({ subtotal: 100, vatAmount: 15, totalAmount: 115 });
    const [saleEntry] = await db.select().from(journalEntriesTable).where(and(
      eq(journalEntriesTable.sourceType, "individual_invoice"),
      eq(journalEntriesTable.sourceId, String(collected.id)),
    ));
    const saleLines = await db.select({
      code: accountingAccountsTable.code,
      debit: journalEntryLinesTable.debit,
      credit: journalEntryLinesTable.credit,
    }).from(journalEntryLinesTable)
      .innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
      .where(eq(journalEntryLinesTable.journalEntryId, saleEntry.id));
    expect(saleLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "1130", debit: "115.0000", credit: "0.0000" }),
      expect.objectContaining({ code: "4100", debit: "0.0000", credit: "100.0000" }),
      expect.objectContaining({ code: "2120", debit: "0.0000", credit: "15.0000" }),
    ]));
    expect(saleEntry.entryDate).toBe(issueDate);
    const [collectionEntry] = await db.select().from(journalEntriesTable).where(and(
      eq(journalEntriesTable.sourceType, "receivable_payment"),
      eq(journalEntriesTable.sourceId, String(collectedResponse.payments[0].id)),
    ));
    expect(collectionEntry.entryDate).toBe(today);
    const collectionLines = await db.select({
      code: accountingAccountsTable.code,
      debit: journalEntryLinesTable.debit,
      credit: journalEntryLinesTable.credit,
    }).from(journalEntryLinesTable)
      .innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
      .where(eq(journalEntryLinesTable.journalEntryId, collectionEntry.id));
    expect(collectionLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "1120", debit: "115.0000", credit: "0.0000" }),
      expect.objectContaining({ code: "1130", debit: "0.0000", credit: "115.0000" }),
    ]));
    const collectionEvent = await db.select().from(operationEventsTable).where(eq(
      operationEventsTable.eventKey, `receivable-payment:${collectedResponse.payments[0].id}`,
    ));
    expect(collectionEvent).toHaveLength(1);
    expect(await db.select().from(shipmentsTable).where(eq(shipmentsTable.invoiceId, collected.id))).toHaveLength(0);
  });

  it("passes patterned date strings to service calendar validation before any writes", async () => {
    const impossibleDate = `${Number(today.slice(0, 4)) - 1}-02-30`;
    const common = {
      creationKey: `${base}-invalid-calendar-date`,
      buyerName: "تاريخ غير صالح",
      buyerPhone: "0501234567",
      buyerAddress: null,
      buyerTaxNumber: null,
      issueDate: today,
      items: [{ productId, quantity: 1, unitPrice: 115 }],
    };
    const invalidInputs = [
      { ...common, issueDate: impossibleDate },
      { ...common, dueDate: impossibleDate },
      { ...common, collected: { paymentDate: impossibleDate, paymentMethod: "cash" as const } },
    ];
    for (const rawInput of invalidInputs) {
      const parsedInput = Api.AdminCreateIndividualInvoiceBody.parse(rawInput);
      await expect(createIndividualInvoice(parsedInput, actorId, environment))
        .rejects.toBeInstanceOf(IndividualInvoiceValidationError);
    }
  });

  it("rejects insufficient stock without writing invoice, inventory, event, or journal rows", async () => {
    const creationKey = `${base}-insufficient-stock`;
    const [stockBefore] = await db.select({ quantity: productsTable.stockQuantity })
      .from(productsTable).where(eq(productsTable.id, productId));
    const [balanceBefore] = await db.select({ available: inventoryBalancesTable.available })
      .from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, productId));
    const [movementCountBefore] = await db.select({ value: count() }).from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.productId, productId));
    const [journalCountBefore] = await db.select({ value: count() }).from(journalEntriesTable);
    const [eventCountBefore] = await db.select({ value: count() }).from(operationEventsTable);

    await expect(createIndividualInvoice({
      creationKey,
      buyerName: "مخزون غير كاف",
      buyerPhone: "0501234567",
      buyerAddress: null,
      buyerTaxNumber: null,
      issueDate: today,
      items: [{ productId, quantity: stockBefore.quantity + 1, unitPrice: 115 }],
    }, actorId, environment)).rejects.toBeInstanceOf(IndividualInvoiceConflictError);

    const [stockAfter] = await db.select({ quantity: productsTable.stockQuantity })
      .from(productsTable).where(eq(productsTable.id, productId));
    const [balanceAfter] = await db.select({ available: inventoryBalancesTable.available })
      .from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, productId));
    const [movementCountAfter] = await db.select({ value: count() }).from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.productId, productId));
    const [journalCountAfter] = await db.select({ value: count() }).from(journalEntriesTable);
    const [eventCountAfter] = await db.select({ value: count() }).from(operationEventsTable);
    expect(stockAfter.quantity).toBe(stockBefore.quantity);
    expect(balanceAfter.available).toBe(balanceBefore.available);
    expect(movementCountAfter.value).toBe(movementCountBefore.value);
    expect(journalCountAfter.value).toBe(journalCountBefore.value);
    expect(eventCountAfter.value).toBe(eventCountBefore.value);
    expect(await db.select().from(invoicesTable).where(eq(invoicesTable.creationKey, creationKey))).toHaveLength(0);
  });

  it("serializes concurrent duplicate creation keys to one invoice and one stock deduction", async () => {
    const creationKey = `${base}-concurrent-creation-key`;
    const [stockBefore] = await db.select({ quantity: productsTable.stockQuantity })
      .from(productsTable).where(eq(productsTable.id, productId));
    const input = {
      creationKey,
      buyerName: "إنشاء متزامن",
      buyerPhone: "0501234567",
      buyerAddress: null,
      buyerTaxNumber: null,
      issueDate: today,
      items: [{ productId, quantity: 1, unitPrice: 115 }],
    };
    const [first, replay] = await Promise.all([
      createIndividualInvoice(input, actorId, environment),
      createIndividualInvoice(input, actorId, environment),
    ]);
    expect(replay.id).toBe(first.id);
    expect(await db.select().from(invoicesTable).where(eq(invoicesTable.creationKey, creationKey))).toHaveLength(1);
    const [stockAfter] = await db.select({ quantity: productsTable.stockQuantity })
      .from(productsTable).where(eq(productsTable.id, productId));
    expect(stockAfter.quantity).toBe(stockBefore.quantity - 1);
    expect(await db.select().from(inventoryMovementsTable).where(and(
      eq(inventoryMovementsTable.sourceType, "individual_invoice"),
      eq(inventoryMovementsTable.sourceId, String(first.id)),
    ))).toHaveLength(1);
    expect(await db.select().from(journalEntriesTable).where(and(
      inArray(journalEntriesTable.sourceType, ["individual_invoice", "individual_invoice_cogs"]),
      eq(journalEntriesTable.sourceId, String(first.id)),
    ))).toHaveLength(2);
  });
});