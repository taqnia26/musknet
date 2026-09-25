import { eq, sql } from "drizzle-orm";
import { db, adminUsersTable, customersTable, orderPaymentLinksTable, ordersTable } from "@workspace/db";
import { updateOrderAndIssueInvoice } from "./invoices";
import { ensureAdminSeeded } from "./admin-auth";

const endpoint = "https://api.moyasar.com/v1/invoices";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function credentials() {
  const key = process.env.MOYASAR_SECRET_KEY?.trim();
  if (!key) throw new Error("MOYASAR_SECRET_KEY is not configured");
  return { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` };
}

type ProviderInvoice = {
  id: string; status: string; amount: number; currency: string;
  url?: string; expired_at?: string | null; description?: string;
};

async function providerRequest(path: string, init?: RequestInit): Promise<ProviderInvoice> {
  const response = await fetch(`${endpoint}${path}`, {
    ...init, headers: { ...credentials(), "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(12000),
  });
  const payload = await response.json().catch(() => ({})) as ProviderInvoice & { message?: string };
  if (!response.ok) throw new Error(`Moyasar request failed (${response.status}): ${payload.message ?? "provider error"}`);
  return payload;
}

function matchesOrder(invoice: ProviderInvoice, order: typeof ordersTable.$inferSelect) {
  return invoice.currency === "SAR" && invoice.amount === Math.round(order.total * 100)
    && invoice.description === `Order ${order.orderNumber}`;
}

function safePaymentUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && (parsed.hostname === "moyasar.com" || parsed.hostname.endsWith(".moyasar.com"));
  } catch { return false; }
}

export class PaymentLinkError extends Error {
  constructor(message: string, public statusCode = 409) { super(message); }
}

async function sendPaymentLinkEmail(recipient: string, number: string, url: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.INVOICE_FROM_EMAIL?.trim();
  if (!key || !from) throw new Error("RESEND_API_KEY and INVOICE_FROM_EMAIL are required to send payment links");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [recipient], subject: `رابط دفع الطلب ${number} - Musk Ellolo`,
      html: `<div dir="rtl"><p>رابط دفع الطلب ${number}</p><p><a href="${url}">ادفع الطلب عبر مويسر</a></p><p>يرجى عدم مشاركة الرابط.</p></div>`,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}

export async function issueOrderPaymentLink(orderId: number) {
  // Serialize retries for the same order, including the external request. The row
  // lock on the order is shared with payment posting and cancellation.
  return db.transaction(async tx => {
    await tx.execute(sql`select id from storefront_orders where id = ${orderId} for update`);
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    if (!order) throw new PaymentLinkError("Order not found", 404);
    if (order.status !== "pending_payment" || order.paymentStatus !== "pending" || order.paymentMethod !== "moyasar")
      throw new PaymentLinkError("Only an unpaid Moyasar link order can receive a payment link");
    const [customer] = await tx.select({ email: customersTable.email }).from(customersTable).where(eq(customersTable.id, order.userId));
    const recipient = customer?.email?.trim();
    if (!recipient || !emailPattern.test(recipient)) throw new PaymentLinkError("Customer must have a valid saved email", 400);
    const [previous] = await tx.select().from(orderPaymentLinksTable).where(eq(orderPaymentLinksTable.orderId, orderId));
    let invoice: ProviderInvoice;
    if (previous?.providerInvoiceId) {
      invoice = await providerRequest(`/${encodeURIComponent(previous.providerInvoiceId)}`);
      if (!matchesOrder(invoice, order)) throw new PaymentLinkError("Provider invoice does not match this order");
      if (invoice.status === "paid") throw new PaymentLinkError("Payment has been received; wait for confirmation");
      if (invoice.status === "initiated" && previous.expiresAt && previous.expiresAt > new Date()) {
        if (!previous.paymentUrl || !safePaymentUrl(previous.paymentUrl))
          throw new PaymentLinkError("Provider payment URL is invalid");
        invoice.url = previous.paymentUrl;
      } else if (invoice.status === "initiated") {
        throw new PaymentLinkError("Provider link has not expired yet; retry later");
      } else if (invoice.status === "canceled" || invoice.status === "voided") {
        throw new PaymentLinkError("This invoice was canceled; the order cannot be reissued");
      } else if (!["expired", "failed"].includes(invoice.status)) {
        throw new PaymentLinkError(`Cannot reissue a link in provider status ${invoice.status}`);
      }
    } else invoice = { id: "", status: "expired", amount: 0, currency: "" };

    if (invoice.status !== "initiated") {
      const callbackUrl = process.env.MOYASAR_CALLBACK_URL?.trim();
      if (!callbackUrl || !/^https:\/\/[^/?#]+\/api\/payments\/moyasar\/callback$/.test(callbackUrl))
        throw new PaymentLinkError("MOYASAR_CALLBACK_URL must be a public HTTPS /api/payments/moyasar/callback URL", 503);
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      invoice = await providerRequest("", {
        method: "POST",
        body: JSON.stringify({
          amount: Math.round(order.total * 100), currency: "SAR",
          description: `Order ${order.orderNumber}`, callback_url: callbackUrl,
          expired_at: expiresAt.toISOString(),
        }),
      });
      if (!invoice.id || !invoice.url || !safePaymentUrl(invoice.url) ||
        !invoice.expired_at || Number.isNaN(Date.parse(invoice.expired_at)) || !matchesOrder(invoice, order))
        throw new PaymentLinkError("Moyasar returned an invalid invoice", 502);
      await tx.insert(orderPaymentLinksTable).values({
        orderId, providerInvoiceId: invoice.id, paymentUrl: invoice.url,
        expiresAt: new Date(invoice.expired_at), emailStatus: "pending", emailError: null,
      }).onConflictDoUpdate({
        target: orderPaymentLinksTable.orderId,
        set: { providerInvoiceId: invoice.id, paymentUrl: invoice.url,
          expiresAt: new Date(invoice.expired_at), emailStatus: "pending", emailError: null },
      });
    }
    try {
      await sendPaymentLinkEmail(recipient, order.orderNumber, invoice.url!);
      await tx.update(orderPaymentLinksTable).set({ emailStatus: "sent", emailError: null, sentAt: new Date() })
        .where(eq(orderPaymentLinksTable.orderId, orderId));
      return { sent: true, expiresAt: invoice.expired_at ?? previous?.expiresAt?.toISOString(), status: "sent" };
    } catch (error) {
      await tx.update(orderPaymentLinksTable).set({
        emailStatus: "failed", emailError: error instanceof Error ? error.message : "Email delivery failed",
      }).where(eq(orderPaymentLinksTable.orderId, orderId));
      return { sent: false, expiresAt: invoice.expired_at ?? previous?.expiresAt?.toISOString(), status: "failed" };
    }
  });
}

export async function confirmMoyasarInvoice(invoiceId: string) {
  if (!/^[\da-f-]{36}$/i.test(invoiceId)) throw new PaymentLinkError("Invalid invoice ID", 400);
  // The callback body is not proof of payment. Retrieve the invoice directly
  // using the private key and compare its immutable identity and amount.
  const provider = await providerRequest(`/${invoiceId}`);
  if (provider.id !== invoiceId || provider.status !== "paid") throw new PaymentLinkError("Invoice has not been paid");
  const [link] = await db.select().from(orderPaymentLinksTable).where(eq(orderPaymentLinksTable.providerInvoiceId, invoiceId));
  if (!link) throw new PaymentLinkError("Unknown invoice", 404);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, link.orderId));
  if (!order || !matchesOrder(provider, order)) throw new PaymentLinkError("Invoice does not match order");
  if (order.status === "cancelled" || order.status === "returned") throw new PaymentLinkError("Order is no longer payable");
  if (order.paymentStatus === "paid") return { accepted: true, duplicate: true };
  if (order.status !== "pending_payment") throw new PaymentLinkError("Order is not waiting for payment");
  await ensureAdminSeeded();
  const email = (process.env.ACCOUNTING_SYSTEM_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL)?.trim().toLowerCase();
  if (!email) throw new PaymentLinkError("Accounting system actor is not configured", 503);
  const [actor] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable)
    .where(eq(adminUsersTable.email, email));
  if (!actor) throw new PaymentLinkError("Accounting system actor is unavailable", 503);
  await updateOrderAndIssueInvoice(order.id, { paymentStatus: "paid", status: "pending_review" }, process.env, actor.id, invoiceId);
  return { accepted: true, duplicate: false };
}

export async function cancelUnpaidMoyasarOrder(orderId: number, actorId: number) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order || order.status !== "pending_payment" || order.paymentStatus !== "pending" ||
    order.paymentMethod !== "moyasar") throw new PaymentLinkError("Order is not awaiting a Moyasar payment");
  const [link] = await db.select().from(orderPaymentLinksTable).where(eq(orderPaymentLinksTable.orderId, orderId));
  if (!link?.providerInvoiceId) {
    return updateOrderAndIssueInvoice(orderId, { status: "cancelled" }, process.env, actorId);
  }
  const provider = await providerRequest(`/${encodeURIComponent(link.providerInvoiceId)}`);
  if (provider.id !== link.providerInvoiceId || !matchesOrder(provider, order))
    throw new PaymentLinkError("Provider invoice does not match this order");
  if (provider.status === "paid") throw new PaymentLinkError("Invoice has been paid; confirm payment before handling cancellation");
  if (provider.status === "initiated" || provider.status === "on_hold") {
    const canceled = await providerRequest(`/${encodeURIComponent(link.providerInvoiceId)}/cancel`, { method: "PUT" });
    if (canceled.id !== link.providerInvoiceId || !matchesOrder(canceled, order) ||
      !["canceled", "voided", "expired"].includes(canceled.status))
      throw new PaymentLinkError("Provider did not confirm invoice cancellation");
  } else if (!["canceled", "voided", "expired", "failed"].includes(provider.status)) {
    throw new PaymentLinkError(`Invoice cannot be cancelled while ${provider.status}`);
  }
  return updateOrderAndIssueInvoice(orderId, { status: "cancelled" }, process.env, actorId, undefined, link.providerInvoiceId);
}