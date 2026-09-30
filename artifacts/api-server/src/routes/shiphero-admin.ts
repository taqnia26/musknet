import { Router, type IRouter, type RequestHandler, type Response } from "express";
import { db, productsTable, shipheroDispatchesTable, shipheroProductMappingsTable, shipheroSettingsTable, shipheroWebhookEventsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import * as Api from "@workspace/api-zod";
import { assertShipHeroSendingConfigured, getShipHeroSettings, ShipHeroError, shipHeroReadiness } from "../lib/shiphero-config";
import { createShipHeroProduct, sendShipHeroOrder } from "../lib/shiphero-outbound";

function positiveId(raw: string, res: Response) {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid identifier" });
    return null;
  }
  return id;
}

export function createShipHeroAdminRouter(
  permit: (module: string, action: "view" | "edit" | "delete") => RequestHandler,
): IRouter {
  const router = Router();
  router.get("/admin/shiphero", permit("integrations", "view"), async (_req, res) => {
    const settings = await getShipHeroSettings();
    const canReadOrders = res.locals.admin?.isSuperAdmin || res.locals.permissions?.includes("orders:view");
    const [mappings, dispatches, events] = await Promise.all([
      db.select().from(shipheroProductMappingsTable).orderBy(shipheroProductMappingsTable.productId),
      canReadOrders ? db.select().from(shipheroDispatchesTable).orderBy(desc(shipheroDispatchesTable.id)).limit(50) : [],
      canReadOrders ? db.select().from(shipheroWebhookEventsTable).orderBy(desc(shipheroWebhookEventsTable.id)).limit(50) : [],
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.json(Api.AdminGetShipHeroResponse.parse({
      settings: {
        dryShippingCode: settings.dryShippingCode, coldShippingCode: settings.coldShippingCode,
        coldCoverageCities: settings.coldCoverageCities, statusMappings: settings.statusMappings,
      },
      readiness: shipHeroReadiness(),
      mappings: mappings.map(({ productId, productName, sku, registrationKind, remoteProductId, createStatus }) => ({
        productId, productName, sku, registrationKind, remoteProductId, createStatus,
      })),
      dispatches: dispatches.map(({ id, orderId, orderNumber, status, remoteOrderId, attempts, lastError, sentAt }) => ({
        id, orderId, orderNumber, status, remoteOrderId, attempts, lastError, sentAt: sentAt?.toISOString() ?? null,
      })),
      events: events.map(({ id, messageId, eventType, outcome, detail, eventAt, receivedAt }) => ({
        id, messageId, eventType, outcome, detail, eventAt: eventAt?.toISOString() ?? null, receivedAt: receivedAt.toISOString(),
      })),
    }));
  });
  router.put("/admin/shiphero/settings", permit("integrations", "edit"), async (req, res) => {
    const parsed = Api.AdminUpdateShipHeroSettingsBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid ShipHero settings" }); return; }
    const input = parsed.data;
    if (Object.entries(input.statusMappings).some(([key, value]) => !key.trim() || key.length > 100 ||
      !["ready", "in_transit", "delivered"].includes(value))) {
      res.status(400).json({ error: "Status mappings can only advance to ready, in_transit or delivered" }); return;
    }
    await getShipHeroSettings();
    await db.update(shipheroSettingsTable).set({
      dryShippingCode: input.dryShippingCode?.trim() || null,
      coldShippingCode: input.coldShippingCode?.trim() || null,
      coldCoverageCities: [...new Set(input.coldCoverageCities.map(city => city.trim()).filter(Boolean))],
      statusMappings: input.statusMappings,
    }).where(eq(shipheroSettingsTable.id, "main"));
    res.json(Api.AdminUpdateShipHeroSettingsResponse.parse({ success: true }));
  });
  router.put("/admin/shiphero/mappings/:productId", permit("integrations", "edit"), permit("products", "edit"), async (req, res) => {
    const productId = positiveId(String(req.params.productId), res);
    const parsed = Api.AdminUpsertShipHeroMappingBody.safeParse(req.body);
    if (!productId || !parsed.success) { if (productId) res.status(400).json({ error: "Invalid product mapping" }); return; }
    const input = parsed.data;
    if (!input.productName.trim() || !input.sku.trim()) {
      res.status(400).json({ error: "Confirmed partner product name and SKU cannot be blank" }); return;
    }
    const settings = await getShipHeroSettings();
    if (input.registrationKind === "new" && productId <= settings.catalogBaselineMaxId) {
      res.status(409).json({ error: "Existing catalog products are already registered; map them as existing, never create them again" }); return;
    }
    const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, productId));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }
    try {
      await db.transaction(async tx => {
        await tx.select().from(productsTable).where(eq(productsTable.id, productId)).for("update");
        const [mapping] = await tx.select().from(shipheroProductMappingsTable).where(eq(shipheroProductMappingsTable.productId, productId)).for("update");
        if (mapping && ["sending", "sent", "created", "uncertain"].includes(mapping.createStatus))
          throw new ShipHeroError(409, "Registered or uncertain products cannot be remapped");
        await tx.insert(shipheroProductMappingsTable).values({
          productId, productName: input.productName.trim(), sku: input.sku.trim(), registrationKind: input.registrationKind,
        }).onConflictDoUpdate({
          target: shipheroProductMappingsTable.productId,
          set: { productName: input.productName.trim(), sku: input.sku.trim(), registrationKind: input.registrationKind },
        });
      });
      res.json(Api.AdminUpsertShipHeroMappingResponse.parse({ success: true }));
    } catch (error) {
      if (error instanceof ShipHeroError) { res.status(error.status).json({ error: error.message }); return; }
      if ((error as { cause?: { code?: string }; code?: string }).code === "23505" ||
        (error as { cause?: { code?: string } }).cause?.code === "23505") {
        res.status(409).json({ error: "Partner product mapping is already assigned" }); return;
      }
      throw error;
    }
  });
  router.delete("/admin/shiphero/mappings/:productId", permit("integrations", "delete"), permit("products", "edit"), async (req, res) => {
    const productId = positiveId(String(req.params.productId), res);
    if (!productId) return;
    const deleted = await db.transaction(async tx => {
      const [mapping] = await tx.select().from(shipheroProductMappingsTable).where(eq(shipheroProductMappingsTable.productId, productId)).for("update");
      if (mapping && !["not_requested", "failed"].includes(mapping.createStatus)) return false;
      await tx.delete(shipheroProductMappingsTable).where(eq(shipheroProductMappingsTable.productId, productId));
      return true;
    });
    if (!deleted) { res.status(409).json({ error: "A registered or uncertain product cannot be unmapped" }); return; }
    res.json(Api.AdminDeleteShipHeroMappingResponse.parse({ success: true }));
  });
  router.post("/admin/shiphero/orders/:orderId/send", permit("integrations", "edit"), permit("orders", "edit"), async (req, res) => {
    const orderId = positiveId(String(req.params.orderId), res);
    if (!orderId) return;
    try {
      assertShipHeroSendingConfigured();
      const result = await sendShipHeroOrder(orderId);
      if (result.status !== "sent") {
        throw new ShipHeroError(409, result.status === "uncertain"
          ? "Dispatch outcome is uncertain; reconcile with the warehouse before any retry"
          : "Order was not sent; review the blocked dispatch details");
      }
      res.json(Api.AdminSendShipHeroOrderResponse.parse({ success: true }));
    } catch (error) {
      if (error instanceof ShipHeroError) { res.status(error.status).json({ error: error.message }); return; }
      throw error;
    }
  });
  router.post("/admin/shiphero/products/:productId/create", permit("integrations", "edit"), permit("products", "edit"), async (req, res) => {
    const productId = positiveId(String(req.params.productId), res);
    const parsed = Api.AdminCreateShipHeroProductBody.safeParse(req.body);
    if (!productId || !parsed.success) { if (productId) res.status(400).json({ error: "Confirm that this future product is not registered at the partner" }); return; }
    try {
      assertShipHeroSendingConfigured();
      await createShipHeroProduct(productId, parsed.data.confirmNotRegistered);
      res.json(Api.AdminCreateShipHeroProductResponse.parse({ success: true }));
    } catch (error) {
      if (error instanceof ShipHeroError) { res.status(error.status).json({ error: error.message }); return; }
      throw error;
    }
  });
  return router;
}