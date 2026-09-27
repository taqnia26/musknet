import { and, eq } from "drizzle-orm";
import { db, sallaInvoicesTable, type SallaInvoice } from "@workspace/db";
import { z } from "zod/v4";

const SALLA_API = "https://api.salla.dev/admin/v2/orders/invoices";
const amountSchema = z.object({
  amount: z.union([z.number(), z.string()]),
  currency: z.string().min(1),
});
const invoiceSchema = z.object({
  id: z.union([z.number(), z.string()]),
  order_id: z.union([z.number(), z.string()]),
  invoice_number: z.union([z.number(), z.string(), z.null()]).optional(),
  uuid: z.string().nullable().optional(),
  invoice_reference_id: z.union([z.string(), z.number(), z.null()]).optional(),
  qr_code: z.string().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  type: z.string().min(1),
  date: z.string().min(1),
  sub_total: amountSchema,
  shipping_cost: amountSchema.optional(),
  cod_cost: amountSchema.optional(),
  discount: amountSchema.optional(),
  tax: z.object({ amount: amountSchema, percent: z.union([z.number(), z.string()]).nullable().optional() }),
  total: amountSchema,
  items: z.array(z.object({
    name: z.string().min(1),
    sku: z.string().nullable().optional(),
    quantity: z.union([z.number(), z.string()]),
    price: amountSchema,
    total: amountSchema,
  })),
});
const listSchema = z.object({
  success: z.literal(true),
  data: z.array(z.object({ id: z.union([z.number(), z.string()]) })),
  pagination: z.object({
    currentPage: z.number(),
    totalPages: z.number(),
  }),
});
const detailSchema = z.object({ success: z.literal(true), data: invoiceSchema });

export class SallaImportError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

function decimal(raw: number | string): string {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) >= 1e12 || !/^-?\d+(\.\d{1,2})?$/.test(String(raw))) {
    throw new SallaImportError("Salla returned an invalid monetary amount", 502);
  }
  return value.toFixed(2);
}

function toArchive(source: z.infer<typeof invoiceSchema>): typeof sallaInvoicesTable.$inferInsert {
  const currency = source.total.currency;
  const money = (entry?: z.infer<typeof amountSchema>) => {
    if (entry && entry.currency !== currency) throw new SallaImportError("Salla invoice has mixed currencies", 502);
    return decimal(entry?.amount ?? 0);
  };
  const date = source.date.slice(0, 10);
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new SallaImportError("Salla returned an invalid invoice date", 502);
  }
  return {
    sallaInvoiceId: String(source.id),
    sallaOrderId: String(source.order_id),
    invoiceNumber: source.invoice_number == null ? null : String(source.invoice_number),
    invoiceUuid: source.uuid ?? null,
    invoiceReferenceId: source.invoice_reference_id == null ? null : String(source.invoice_reference_id),
    qrCode: source.qr_code ?? null,
    paymentMethod: source.payment_method ?? null,
    invoiceType: source.type,
    issuedOn: date,
    currency,
    subtotal: money(source.sub_total),
    shippingCost: money(source.shipping_cost),
    codCost: money(source.cod_cost),
    discount: money(source.discount),
    vatAmount: money(source.tax.amount),
    vatPercent: source.tax.percent == null ? null : decimal(source.tax.percent),
    total: money(source.total),
    items: source.items.map(item => {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
        throw new SallaImportError("Salla returned an invalid invoice quantity", 502);
      }
      return {
        name: item.name,
        sku: item.sku ?? null,
        quantity,
        unitPrice: Number(money(item.price)),
        total: Number(money(item.total)),
      };
    }),
  };
}

function matches(existing: SallaInvoice, candidate: typeof sallaInvoicesTable.$inferInsert): boolean {
  return existing.invoiceNumber === candidate.invoiceNumber
    && existing.sallaOrderId === candidate.sallaOrderId
    && existing.issuedOn === candidate.issuedOn
    && existing.invoiceType === candidate.invoiceType
    && existing.currency === candidate.currency
    && existing.total === candidate.total
    && existing.vatAmount === candidate.vatAmount
    && existing.invoiceReferenceId === candidate.invoiceReferenceId;
}

async function sallaGet(path: string, token: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${SALLA_API}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new SallaImportError("Could not reach Salla; retry this page", 502);
  }
  if (response.status === 401 || response.status === 403) {
    throw new SallaImportError("Salla access expired or lacks orders.read permission", 503);
  }
  if (!response.ok) throw new SallaImportError(`Salla API returned HTTP ${response.status}`, 502);
  const body = await response.text();
  if (body.length > 2_000_000) throw new SallaImportError("Salla response exceeds the allowed size", 502);
  try { return JSON.parse(body) as unknown; }
  catch { throw new SallaImportError("Salla returned invalid JSON", 502); }
}

export async function importSallaInvoicePage(input: { fromDate: string; toDate: string; page: number }) {
  const token = process.env.SALLA_ACCESS_TOKEN;
  if (!token) throw new SallaImportError("Salla access is not configured", 503);
  const from = Date.parse(`${input.fromDate}T00:00:00Z`);
  const to = Date.parse(`${input.toDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)
    || new Date(from).toISOString().slice(0, 10) !== input.fromDate
    || new Date(to).toISOString().slice(0, 10) !== input.toDate || from > to) {
    throw new SallaImportError("Invalid date range", 400);
  }
  const query = new URLSearchParams({
    from_date: input.fromDate, to_date: input.toDate,
    per_page: "30", page: String(input.page),
  });
  const listing = listSchema.safeParse(await sallaGet(`?${query}`, token));
  if (!listing.success) throw new SallaImportError("Salla returned an unexpected invoice list", 502);
  const { data, pagination } = listing.data;
  if (pagination.currentPage !== input.page || !Number.isInteger(pagination.totalPages) || pagination.totalPages < 0) {
    throw new SallaImportError("Salla returned invalid pagination", 502);
  }
  const records: Array<typeof sallaInvoicesTable.$inferInsert> = [];
  // Fetch details before any writes: a malformed invoice must not leave a half-imported page.
  for (let i = 0; i < data.length; i += 5) {
    const group = await Promise.all(data.slice(i, i + 5).map(async ({ id }) => {
      const invoice = detailSchema.safeParse(await sallaGet(`/${encodeURIComponent(String(id))}`, token));
      if (!invoice.success || String(invoice.data.data.id) !== String(id)) {
        throw new SallaImportError("Salla returned unexpected invoice details", 502);
      }
      return toArchive(invoice.data.data);
    }));
    records.push(...group);
  }
  let imported = 0;
  let skipped = 0;
  await db.transaction(async tx => {
    for (const record of records) {
      const [existing] = await tx.select().from(sallaInvoicesTable)
        .where(eq(sallaInvoicesTable.sallaInvoiceId, record.sallaInvoiceId)).limit(1);
      if (existing) {
        if (!matches(existing, record)) throw new SallaImportError(`Previously imported invoice ${record.sallaInvoiceId} differs from Salla`, 409);
        skipped++;
        continue;
      }
      const inserted = await tx.insert(sallaInvoicesTable).values(record).onConflictDoNothing().returning();
      if (inserted.length) { imported++; continue; }
      const [concurrent] = await tx.select().from(sallaInvoicesTable)
        .where(and(eq(sallaInvoicesTable.sallaInvoiceId, record.sallaInvoiceId))).limit(1);
      if (!concurrent || !matches(concurrent, record)) throw new SallaImportError("Concurrent Salla invoice import conflicted", 409);
      skipped++;
    }
  });
  return {
    imported, skipped, page: input.page, totalPages: pagination.totalPages,
    nextPage: input.page < pagination.totalPages ? input.page + 1 : null,
  };
}