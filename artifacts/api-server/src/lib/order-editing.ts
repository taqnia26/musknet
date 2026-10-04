import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db, ordersTable, orderItemsTable, orderAddressesTable, customersTable, productsTable,
  inventoryMovementsTable, shipmentsTable, shipheroDispatchesTable, orderPaymentLinksTable,
  invoicesTable, salesReturnsTable, orderEditAuditsTable, adminUsersTable, couponsTable,
  journalEntriesTable, operationEventsTable, orderAttributionsTable, influencerCouponsTable, influencersTable,
} from "@workspace/db";
import type { OrderEditInput } from "@workspace/api-zod";
import { AccountingConflictError, AccountingNotFoundError, AccountingValidationError, ensureStandardAccountingChart, postJournalEntry } from "./accounting";
import { adjustOperationalBalances } from "./operations";
import { calculateSaleDiscount, validateManualDiscount } from "./sale-discounts";
import { extractVatFromGross } from "./vat";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Order = typeof ordersTable.$inferSelect;
const cents = (n: number) => Math.round(n * 100);
const money = (n: number) => cents(n) / 100;
const conflict = (message: string): never => { throw new AccountingConflictError(message); };

export function orderContact(order: Pick<Order, "adminEditSnapshot">, customer: { name: string; phone: string | null; email?: string | null }) {
  return {
    ...customer,
    name: typeof order.adminEditSnapshot?.customerName === "string" ? order.adminEditSnapshot.customerName : customer.name,
    phone: typeof order.adminEditSnapshot?.customerPhone === "string" ? order.adminEditSnapshot.customerPhone : customer.phone,
  };
}

async function blockedReason(tx: Tx, order: Order) {
  if (!["pending_review", "preparing"].includes(order.status)) return "التعديل متاح قبل التوصيل والإلغاء فقط.";
  if (!["pending", "failed"].includes(order.paymentStatus)) return "لا يمكن تعديل طلب له تحصيل أو استرداد مسجل.";
  if (!["cash", "bank-transfer"].includes(order.paymentMethod)) return "الطلب مرتبط بوسيلة دفع خارجية أو تاريخية؛ لا يمكن تعديل قيمته هنا.";
  if (!order.orderSource) return "مصدر الطلب التاريخي غير موثق؛ يلزم مراجعته قبل تعديل بياناته.";
  if (Math.abs(order.total - money(order.subtotal - order.discount + order.shippingCost)) > 0.01) return "حسابات الطلب التاريخية تحتاج مراجعة قبل إعادة التسعير.";
  const [invoice] = await tx.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.orderId, order.id)).limit(1);
  if (invoice) return "صدرت فاتورة لهذا الطلب؛ لا يمكن إعادة كتابة مستند صادر.";
  const [returned] = await tx.select({ id: salesReturnsTable.id }).from(salesReturnsTable).where(eq(salesReturnsTable.orderId, order.id)).limit(1);
  if (returned) return "الطلب مرتبط بسجل مرتجع؛ يلزم معالجة المرتجع قبل تعديل البنود.";
  const [link] = await tx.select({ id: orderPaymentLinksTable.id }).from(orderPaymentLinksTable).where(eq(orderPaymentLinksTable.orderId, order.id)).limit(1);
  if (link) return "الطلب مرتبط بسجل رابط دفع؛ يلزم تسويته قبل التعديل.";
  const [dispatch] = await tx.select({ id: shipheroDispatchesTable.id }).from(shipheroDispatchesTable).where(eq(shipheroDispatchesTable.orderId, order.id)).for("update").limit(1);
  if (dispatch) return "يوجد سجل إرسال للمستودع الخارجي؛ لا يمكن تغيير الطلب قبل التسوية.";
  const shipments = await tx.select().from(shipmentsTable).where(eq(shipmentsTable.orderId, order.id)).for("update");
  if (shipments.some(s => !["pending", "cancelled"].includes(s.status) || s.trackingNumber || s.carrierShipmentId || s.labelUrl ||
    s.shippedAt || s.deliveredAt || s.integrationStatus !== "not_requested" || s.integrationAttempts > 0)) return "تقدمت الشحنة؛ لا يمكن تعديل بيانات التنفيذ أو المنتجات.";
  return null;
}

export function cleanOrderEditAddress(input: OrderEditInput["orderAddress"]) {
  const country = input.country?.trim().toUpperCase();
  if (!country || !/^[A-Z]{2}$/.test(country)) throw new AccountingValidationError("اختر دولة صالحة للعنوان.");
  const name = new Intl.DisplayNames(["en"], { type: "region" }).of(country);
  if (!name || name === country || name === "Unknown Region") throw new AccountingValidationError("دولة العنوان غير صالحة.");
  const code = input.nationalAddressShortCode?.trim().toUpperCase() || null;
  if (country === "SA" && !/^[A-Z]{4}[0-9]{4}$/.test(code ?? "")) throw new AccountingValidationError("العنوان المختصر السعودي يجب أن يكون أربعة أحرف وأربعة أرقام.");
  if (country !== "SA" && (code || !input.city?.trim() || !input.district?.trim() || !input.street?.trim() || !input.buildingNo?.trim()))
    throw new AccountingValidationError("أكمل تفاصيل العنوان الدولي دون كود سعودي.");
  return {
    label: input.label?.trim() || "", country, city: input.city?.trim() || "", district: input.district?.trim() || "",
    street: input.street?.trim() || "", buildingNo: input.buildingNo?.trim() || "", nationalAddressShortCode: code,
    postalCode: input.postalCode?.trim() || null, additionalNumber: input.additionalNumber?.trim() || null,
    additionalInfo: input.additionalInfo?.trim() || null, isDefault: input.isDefault ?? false,
  };
}

export async function getOrderEditor(orderId: number, tx: Tx = db as unknown as Tx) {
  const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) throw new AccountingNotFoundError("الطلب غير موجود.");
  const [customer] = await tx.select().from(customersTable).where(eq(customersTable.id, order.userId));
  if (!customer) throw new AccountingNotFoundError("حساب العميل غير موجود.");
  const contact = orderContact(order, customer);
  const items = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId)).orderBy(orderItemsTable.id);
  const [storedAddress] = await tx.select().from(orderAddressesTable).where(eq(orderAddressesTable.orderId, orderId));
  let address: Record<string, unknown> = {};
  try { address = JSON.parse(order.address); } catch { /* Missing historical address remains visibly empty. */ }
  if (storedAddress) address = storedAddress;
  const text = (key: string) => typeof address[key] === "string" ? address[key] as string : "";
  const reason = await blockedReason(tx, order);
  const history = await tx.select({
    id: orderEditAuditsTable.id, actorName: adminUsersTable.name, editedAt: orderEditAuditsTable.editedAt,
    beforeSnapshot: orderEditAuditsTable.beforeSnapshot, afterSnapshot: orderEditAuditsTable.afterSnapshot,
  }).from(orderEditAuditsTable).innerJoin(adminUsersTable, eq(adminUsersTable.id, orderEditAuditsTable.actorId))
    .where(eq(orderEditAuditsTable.orderId, orderId)).orderBy(sql`${orderEditAuditsTable.id} desc`);
  return {
    orderNumber: order.orderNumber, eligible: reason === null, blockedReason: reason,
    values: {
      requestKey: randomUUID(), expectedUpdatedAt: order.updatedAt.toISOString(),
      items: items.map(i => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
      customerName: contact.name, customerPhone: contact.phone ?? "", adminNotes: order.adminNotes,
      fulfillmentMethod: order.fulfillmentMethod ?? "delivery", shippingMethod: order.shippingMethod,
      shippingCost: order.shippingCost, paymentMethod: order.paymentMethod, couponCode: order.couponCode,
      discountOverride: { percent: Number(order.manualDiscountPercent ?? 0), reason: order.manualDiscountReason ?? "" },
      orderAddress: {
        label: text("label"), city: text("city"), country: text("country") || null,
        district: text("district"), street: text("street"), buildingNo: text("buildingNo"),
        nationalAddressShortCode: text("nationalAddressShortCode") || null,
        postalCode: text("postalCode") || null, additionalNumber: text("additionalNumber") || null,
        additionalInfo: text("additionalInfo") || null, isDefault: address.isDefault === true,
      },
    },
    history,
  };
}

export function canonicalOrderEdit(value: unknown): string {
  return canonical(value);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function saveOrderEditor(orderId: number, input: OrderEditInput, actorId: number) {
  validateManualDiscount(input.discountOverride);
  if (new Set(input.items.map(i => i.productId)).size !== input.items.length) throw new AccountingValidationError("لا تكرر المنتج في أكثر من سطر.");
  if (!input.customerName.trim() || !/^(?=(?:\D*\d){8,15}\D*$)\+?[\d ().-]+$/.test(input.customerPhone.trim()))
    throw new AccountingValidationError("الاسم ورقم الجوال الصحيح مطلوبان.");
  const address = cleanOrderEditAddress(input.orderAddress);
  if (input.fulfillmentMethod === "pickup" && input.shippingCost !== 25) throw new AccountingValidationError("رسوم الاستلام ثابتة 25 ريالاً.");
  await ensureStandardAccountingChart();
  await db.transaction(async tx => {
    // A key shared across orders cannot race into two successful edits.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`order-edit:${input.requestKey}`}))`);
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).for("update");
    if (!order) throw new AccountingNotFoundError("الطلب غير موجود.");
    const [previous] = await tx.select().from(orderEditAuditsTable).where(eq(orderEditAuditsTable.requestKey, input.requestKey));
    if (previous) {
      if (previous.orderId !== orderId || previous.actorId !== actorId || canonical(previous.afterSnapshot.request) !== canonical(input))
        conflict("مفتاح الحفظ مستخدم لتعديل مختلف.");
      return;
    }
    const reason = await blockedReason(tx, order);
    if (reason) conflict(reason);
    if (order.updatedAt.toISOString() !== input.expectedUpdatedAt) conflict("تغير الطلب منذ فتحه. أعد فتح التعديل لتحميل النسخة الحالية.");
    const before = await getOrderEditor(orderId, tx);
    const oldItems = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId)).orderBy(orderItemsTable.id);
    if (new Set(oldItems.map(i => i.productId)).size !== oldItems.length) conflict("الطلب التاريخي يحتوي أسطراً مكررة تحتاج مراجعة.");
    const [fulfillment] = await tx.select().from(operationEventsTable).where(and(eq(operationEventsTable.sourceType, "order"), eq(operationEventsTable.sourceId, String(orderId))));
    if (!fulfillment || fulfillment.status !== "posted") conflict("لا توجد تكلفة خروج موثقة لهذا الطلب؛ يلزم مراجعة المخزون أولاً.");
    const [baseJournal] = await tx.select().from(journalEntriesTable).where(and(
      eq(journalEntriesTable.status, "posted"),
      sql`((${journalEntriesTable.sourceType} = 'sale_cogs' and ${journalEntriesTable.sourceId} = ${String(orderId)})
        or (${journalEntriesTable.sourceType} = 'order_edit_cogs' and ${journalEntriesTable.sourceId} in
          (select id::text from order_edit_audits where order_id = ${orderId})))`,
    )).limit(1);
    if (oldItems.some(i => Number(i.costSnapshot) > 0) && !baseJournal) conflict("قيد تكلفة الطلب مفقود؛ يلزم مراجعته قبل التعديل.");
    const productIds = [...new Set([...oldItems.map(i => i.productId), ...input.items.map(i => i.productId)])].sort((a, b) => a - b);
    for (const id of productIds) await tx.execute(sql`select id from ${productsTable} where id = ${id} for update`);
    const products = await tx.select().from(productsTable).where(inArray(productsTable.id, productIds));
    const oldById = new Map(oldItems.map(i => [i.productId, i]));
    const newById = new Map(input.items.map(i => [i.productId, i]));
    const subtotal = money(input.items.reduce((sum, i) => sum + money(i.quantity * i.unitPrice), 0));
    const code = input.couponCode?.trim().toUpperCase() || null;
    const percent = input.discountOverride.percent;
    let discount: Awaited<ReturnType<typeof calculateSaleDiscount>>;
    const [currentCoupon] = code ? await tx.select().from(couponsTable)
      .where(sql`lower(trim(${couponsTable.code}))=lower(${code})`).for("update") : [];
    if (code && code === order.couponCode?.toUpperCase() && currentCoupon &&
      (currentCoupon.freeShipping || currentCoupon.perCustomerLimit != null || currentCoupon.maxDiscount != null ||
       currentCoupon.allowedCountries.length || currentCoupon.excludedProductIds.length)) {
      discount = await calculateSaleDiscount(tx, subtotal, code, percent, false, {
        customerId: order.userId, country: input.fulfillmentMethod === "pickup" ? "SA" : address.country,
        items: input.items, excludeOrderId: order.id, alreadyRedeemed: true,
      });
    } else if (code && code === order.couponCode?.toUpperCase()) {
      if (!order.couponDiscountType || order.couponDiscountValue === null) conflict("تفاصيل الكوبون التاريخية غير مكتملة.");
      // Keep the already-consumed coupon's original terms, even after expiry.
      const base = cents(subtotal);
      const couponCents = Math.min(base, Math.round(order.couponDiscountType === "percentage" ? base * order.couponDiscountValue! / 100 : order.couponDiscountValue! * 100));
      const manualCents = Math.round((base - couponCents) * percent / 100);
      discount = {
        productSubtotal: subtotal, couponCode: code, couponDiscountType: order.couponDiscountType,
        couponDiscountValue: order.couponDiscountValue, couponDiscountAmount: couponCents / 100,
        manualDiscountPercent: percent, manualDiscountAmount: manualCents / 100,
        discountAmount: (couponCents + manualCents) / 100, productsTotal: (base - couponCents - manualCents) / 100,
        couponId: null, freeShipping: false, couponExcludedProductIds: [],
      };
    } else {
      // Lock both coupon rows consistently before reserving/releasing usage.
      const codes = [code, order.couponCode].filter((v): v is string => !!v).sort();
      for (const c of codes) await tx.execute(sql`select id from ${couponsTable} where lower(trim(${couponsTable.code})) = lower(${c}) for update`);
      discount = await calculateSaleDiscount(tx, subtotal, code, percent, true, {
        customerId: order.userId, country: input.fulfillmentMethod === "pickup" ? "SA" : address.country,
        items: input.items, excludeOrderId: order.id,
      });
      if (order.couponCode) await tx.update(couponsTable).set({ timesUsed: sql`greatest(0, ${couponsTable.timesUsed} - 1)` }).where(eq(couponsTable.code, order.couponCode));
    }
    if (discount.freeShipping && input.fulfillmentMethod !== "pickup") input.shippingCost = 0;
    const total = money(discount.productsTotal + input.shippingCost);
    const tax = address.country === "SA" || input.fulfillmentMethod === "pickup" ? extractVatFromGross(cents(total), 15).vatCents / 100 : 0;
    const [audit] = await tx.insert(orderEditAuditsTable).values({
      orderId, requestKey: input.requestKey, actorId,
      beforeSnapshot: { values: before.values, subtotal: order.subtotal, total: order.total, tax: order.tax },
      afterSnapshot: { request: input, subtotal, total, tax, discount: discount.discountAmount },
    }).returning();
    let costDelta = 0;
    for (const productId of productIds) {
      const product = products.find(p => p.id === productId);
      if (!product) conflict(`المنتج ${productId} غير موجود.`);
      const p = product!;
      const old = oldById.get(productId);
      const next = newById.get(productId);
      const oldQuantity = old?.quantity ?? 0;
      const newQuantity = next?.quantity ?? 0;
      const delta = newQuantity - oldQuantity;
      if (next && (!p.isActive || !p.sellable)) conflict(`المنتج ${p.nameAr} غير متاح للبيع.`);
      if (delta > p.stockQuantity) conflict(`المخزون غير كافٍ للمنتج ${p.nameAr}.`);
      const oldCost = Number(old?.costSnapshot ?? 0);
      const outboundCost = Number(p.averageCost);
      if (![oldCost, outboundCost].every(c => Number.isFinite(c) && c >= 0)) conflict("تكلفة المنتج غير صالحة.");
      const unitCost = delta > 0 ? outboundCost : oldCost;
      const lineCostDelta = delta * unitCost;
      costDelta += lineCostDelta;
      const newCost = newQuantity > 0 ? (oldQuantity * oldCost + lineCostDelta) / newQuantity : 0;
      if (delta !== 0) {
        const quantityAfter = p.stockQuantity - delta;
        const averageCost = delta < 0 && quantityAfter > 0
          ? (p.stockQuantity * outboundCost - lineCostDelta) / quantityAfter : outboundCost;
        await adjustOperationalBalances(tx, p.id, -delta, averageCost, p.stockQuantity);
        await tx.update(productsTable).set({ stockQuantity: quantityAfter, averageCost: averageCost.toFixed(4) }).where(eq(productsTable.id, p.id));
        await tx.insert(inventoryMovementsTable).values({
          productId: p.id, movementType: delta > 0 ? "decrease" : "increase", quantityChange: -delta,
          quantityBefore: p.stockQuantity, quantityAfter, unitCost: unitCost.toFixed(4), totalCost: Math.abs(lineCostDelta).toFixed(4),
          reason: `Order edit ${order.orderNumber}`, sourceType: "order_edit", sourceId: String(audit.id),
          eventKey: `order-edit:${audit.id}:${p.id}`, performedBy: actorId,
        });
      }
      if (!next && old) await tx.delete(orderItemsTable).where(eq(orderItemsTable.id, old.id));
      else if (next) {
        const values = { quantity: next.quantity, unitPrice: next.unitPrice, totalPrice: money(next.quantity * next.unitPrice), costSnapshot: newCost.toFixed(4) };
        if (old) await tx.update(orderItemsTable).set(values).where(eq(orderItemsTable.id, old.id));
        else await tx.insert(orderItemsTable).values({ ...values, orderId, productId, productName: p.invoiceNameAr?.trim() || p.nameAr });
      }
    }
    // Reconcile rounded document costs, not a rounded sum of delta movements.
    // Otherwise successive fractional-cost edits can accumulate a cent of drift.
    const revisedItems = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
    costDelta = (cents(revisedItems.reduce((sum, i) => sum + i.quantity * Number(i.costSnapshot), 0))
      - cents(oldItems.reduce((sum, i) => sum + i.quantity * Number(i.costSnapshot), 0))) / 100;
    if (cents(Math.abs(costDelta)) > 0) await postJournalEntry({
      entryDate: new Date().toISOString().slice(0, 10), description: `Order edit cost ${order.orderNumber}`, createdBy: actorId,
      sourceType: "order_edit_cogs", sourceId: String(audit.id),
      lines: costDelta > 0 ? [{ accountCode: "5100", debit: money(costDelta) }, { accountCode: "1140", credit: money(costDelta) }]
        : [{ accountCode: "1140", debit: money(-costDelta) }, { accountCode: "5100", credit: money(-costDelta) }],
    }, tx);
    await tx.insert(operationEventsTable).values({
      eventKey: `order-edit:${audit.id}`, kind: "sale_fulfillment", status: "posted", sourceType: "order_edit",
      sourceId: String(audit.id), actorId, payload: { orderId, costDelta, auditId: audit.id },
    });
    await tx.update(ordersTable).set({
      subtotal, shippingCost: input.shippingCost, discount: discount.discountAmount, tax, total,
      couponCode: discount.couponCode, couponDiscountType: discount.couponDiscountType, couponDiscountValue: discount.couponDiscountValue,
      couponDiscountAmount: discount.couponDiscountAmount.toFixed(2),
      manualDiscountPercent: percent > 0 ? percent.toFixed(2) : null,
      manualDiscountAmount: percent > 0 ? discount.manualDiscountAmount.toFixed(2) : null,
      manualDiscountReason: percent > 0 ? input.discountOverride.reason!.trim() : null,
      manualDiscountByAdminId: percent > 0 ? actorId : null, manualDiscountAt: percent > 0 ? new Date() : null,
      address: JSON.stringify({ ...address, taxTreatment: address.country === "SA" || input.fulfillmentMethod === "pickup" ? "domestic" : "international" }), adminNotes: input.adminNotes?.trim() || null,
      fulfillmentMethod: input.fulfillmentMethod, shippingMethod: input.shippingMethod, paymentMethod: input.paymentMethod,
      adminEditSnapshot: { customerName: input.customerName.trim(), customerPhone: input.customerPhone.trim() },
    }).where(eq(ordersTable.id, orderId));
    await tx.insert(orderAddressesTable).values({ ...address, orderId }).onConflictDoUpdate({ target: orderAddressesTable.orderId, set: address });
    const localShipments = await tx.select().from(shipmentsTable).where(eq(shipmentsTable.orderId, orderId));
    if (localShipments.length > 1) conflict("للطلب عدة شحنات؛ يلزم مراجعتها قبل التعديل.");
    if (input.fulfillmentMethod === "pickup") {
      await tx.update(shipmentsTable).set({ status: "cancelled" }).where(eq(shipmentsTable.orderId, orderId));
    } else {
      const shipment = {
        recipientName: input.customerName.trim(), recipientPhone: input.customerPhone.trim(),
        shippingScope: address.country === "SA" ? "domestic" as const : "international" as const,
        destinationCountry: address.country, destinationCity: address.city,
        destinationDistrict: address.country === "SA" ? null : address.district,
        destinationStreet: address.country === "SA" ? null : address.street,
        destinationBuildingNumber: address.country === "SA" ? null : address.buildingNo,
        destinationAdditionalDetails: address.country === "SA" ? null : address.additionalInfo,
        nationalAddressShortCode: address.nationalAddressShortCode,
        destinationAddress: address.country === "SA" ? address.nationalAddressShortCode : [address.city, address.district, address.street, address.buildingNo].join(", "),
        serviceMethod: input.shippingMethod, collectedCost: input.shippingCost, status: "pending" as const,
      };
      if (localShipments[0]) await tx.update(shipmentsTable).set(shipment).where(eq(shipmentsTable.id, localShipments[0].id));
      else await tx.insert(shipmentsTable).values({ ...shipment, channel: "online", orderId });
    }
    if (code !== order.couponCode) {
      await tx.delete(orderAttributionsTable).where(and(eq(orderAttributionsTable.orderId, orderId), eq(orderAttributionsTable.source, "coupon")));
      if (discount.couponId) {
        const [linked] = await tx.select({ influencerId: influencersTable.id, commissionRate: influencersTable.commissionRate })
          .from(influencerCouponsTable).innerJoin(influencersTable, eq(influencersTable.id, influencerCouponsTable.influencerId))
          .where(and(eq(influencerCouponsTable.couponId, discount.couponId), eq(influencersTable.isActive, true))).limit(1);
        if (linked) await tx.insert(orderAttributionsTable).values({ orderId, influencerId: linked.influencerId, source: "coupon", commissionRate: linked.commissionRate, commissionAmount: money(total * linked.commissionRate / 100) }).onConflictDoNothing();
      }
    }
    await tx.update(orderAttributionsTable).set({ commissionAmount: sql`${total} * ${orderAttributionsTable.commissionRate} / 100` }).where(eq(orderAttributionsTable.orderId, orderId));
  });
  return getOrderEditor(orderId);
}