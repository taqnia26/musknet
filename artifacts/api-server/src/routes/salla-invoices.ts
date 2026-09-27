import { Router, type IRouter, type RequestHandler } from "express";
import { count, desc, eq, ilike, or } from "drizzle-orm";
import * as Api from "@workspace/api-zod";
import { db, sallaInvoicesTable } from "@workspace/db";
import { importSallaInvoicePage, SallaImportError } from "../lib/salla-invoice-import";

export function createSallaInvoiceRouter(
  permit: (module: string, action: "view" | "edit" | "delete") => RequestHandler,
): IRouter {
  const router: IRouter = Router();
  router.get("/admin/salla-invoices", permit("invoices", "view"), async (req, res) => {
    const query = Api.AdminListSallaInvoicesQueryParams.safeParse(req.query);
    if (!query.success) { res.status(400).json({ error: "Invalid archive query" }); return; }
    const page = Number(query.data.page ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000) {
      res.status(400).json({ error: "Invalid archive page" }); return;
    }
    const search = query.data.search?.trim();
    if (search && search.length > 100) { res.status(400).json({ error: "Search is too long" }); return; }
    const filter = search
      ? or(ilike(sallaInvoicesTable.invoiceNumber, `%${search}%`), ilike(sallaInvoicesTable.sallaInvoiceId, `%${search}%`), ilike(sallaInvoicesTable.sallaOrderId, `%${search}%`))
      : undefined;
    const [{ total }] = await db.select({ total: count() }).from(sallaInvoicesTable).where(filter);
    const pageSize = 30;
    const rows = await db.select().from(sallaInvoicesTable).where(filter)
      .orderBy(desc(sallaInvoicesTable.issuedOn), desc(sallaInvoicesTable.id))
      .limit(pageSize).offset((page - 1) * pageSize);
    res.setHeader("Cache-Control", "no-store");
    res.json(Api.AdminListSallaInvoicesResponse.parse({
      items: rows.map(row => ({
        ...row,
        subtotal: Number(row.subtotal),
        shippingCost: Number(row.shippingCost),
        codCost: Number(row.codCost),
        discount: Number(row.discount),
        vatAmount: Number(row.vatAmount),
        vatPercent: row.vatPercent == null ? null : Number(row.vatPercent),
        total: Number(row.total),
      })),
      total, page, pageSize,
    }));
  });
  router.post("/admin/salla-invoices/import", permit("invoices", "edit"), permit("integrations", "edit"), async (req, res) => {
    const input = Api.AdminImportSallaInvoicesBody.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Invalid import date range or page" }); return; }
    try {
      const result = await importSallaInvoicePage(input.data);
      res.setHeader("Cache-Control", "no-store");
      res.json(Api.AdminImportSallaInvoicesResponse.parse(result));
    } catch (error) {
      if (error instanceof SallaImportError) {
        req.log.warn({ status: error.status }, "Salla invoice import failed");
        res.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  });
  return router;
}