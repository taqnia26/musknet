import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { ShipHeroOrderInput, ShipHeroProductInput } from "./shiphero-client";
import { ShipHeroError, SHIPHERO_TRIGGER_STATUS } from "./shiphero-config";

export { SHIPHERO_TRIGGER_STATUS } from "./shiphero-config";
export const SHIPHERO_NATIONAL_ADDRESS_TODO_FIXTURE = "---SHORTCODE";
export const SHIPHERO_NATIONAL_ADDRESS_TODO =
  "TODO (ShipHero integration task): replace ---SHORTCODE only after the partner confirms the National Address Address 2 example.";

export type ShipHeroDispatchStatus = "queued" | "sending" | "sent" | "blocked" | "uncertain" | "skipped" | "failed";

export class ShipHeroOutboundError extends ShipHeroError {
  constructor(public readonly status: number, message: string) {
    super(status, message);
    this.name = "ShipHeroOutboundError";
  }
}

export type ShipHeroProductMappingInput = {
  productId: number;
  productName: string;
  sku: string;
  registrationKind: string;
  remoteProductId?: string | null;
  createStatus: string;
};

export type ShipHeroOrderPreflightInput = {
  order: {
    id: number;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    shippingMethod: string;
    shippingCost: number;
    address: string;
  };
  customer: { name: string; phone: string };
  address: {
    label?: string | null;
    city: string;
    country?: string | null;
    nationalAddressShortCode?: string | null;
    district: string;
    street: string;
    buildingNo: string;
    postalCode?: string | null;
    additionalNumber?: string | null;
    additionalInfo?: string | null;
  };
  items: Array<{
    id: number;
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
  mappings: ShipHeroProductMappingInput[];
  settings: {
    dryShippingCode: string | null;
    coldShippingCode: string | null;
    coldCoverageCities: string[];
    catalogBaselineMaxId: number;
  };
  environment: NodeJS.ProcessEnv;
};

function requireConfiguredValue(value: string | undefined, key: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new ShipHeroOutboundError(503, `${key} is not configured`);
  return normalized;
}

function parseLegacyAddress(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function combineAddressParts(...values: Array<string | null | undefined>): string {
  return values.map(value => value?.trim()).filter(Boolean).join(", ");
}

function formatMoney(value: number, label: string): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new ShipHeroOutboundError(409, `Order has an invalid ${label}`);
  }
  return value.toFixed(2);
}

function countryIsoCode(country: string): string {
  const normalized = country.trim();
  if (/^[A-Za-z]{2}$/.test(normalized)) return normalized.toUpperCase();
  if (/^(saudi arabia|saudi|المملكة العربية السعودية)$/i.test(normalized)) return "SA";
  throw new ShipHeroOutboundError(409, "ShipHero requires the shipping country as an ISO 3166-1 alpha-2 code");
}

function splitRecipientName(fullName: string): { first_name: string; last_name?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] ?? "",
    ...(parts.length > 1 ? { last_name: parts.slice(1).join(" ") } : {}),
  };
}

export function buildShipHeroOrderPayload(input: ShipHeroOrderPreflightInput): ShipHeroOrderInput {
  const { order, customer, settings } = input;
  if (order.status !== SHIPHERO_TRIGGER_STATUS) {
    throw new ShipHeroOutboundError(409, `Order ${order.orderNumber} is not in preparing status`);
  }
  if (order.paymentStatus !== "paid") {
    throw new ShipHeroOutboundError(409, `Order ${order.orderNumber} is not paid`);
  }
  if (input.items.length === 0) {
    throw new ShipHeroOutboundError(409, `Order ${order.orderNumber} has no line items to send`);
  }

  const mappingByProductId = new Map(input.mappings.map(mapping => [mapping.productId, mapping]));
  const unmapped = input.items.filter(item => !mappingByProductId.has(item.productId));
  if (unmapped.length) {
    const names = [...new Set(unmapped.map(item => item.productName))].join(", ");
    throw new ShipHeroOutboundError(409, `ShipHero product mapping is missing for: ${names}`);
  }

  const unavailableNewProducts = input.items.filter(item => {
    const mapping = mappingByProductId.get(item.productId)!;
    return mapping.registrationKind === "new"
      && (mapping.createStatus !== "created" || !mapping.remoteProductId);
  });
  if (unavailableNewProducts.length) {
    const names = [...new Set(unavailableNewProducts.map(item => item.productName))].join(", ");
    throw new ShipHeroOutboundError(409, `New ShipHero product registration is incomplete for: ${names}`);
  }

  const city = input.address.city.trim();
  let shippingCode: string | null;
  if (order.shippingMethod === "regular") {
    shippingCode = settings.dryShippingCode;
    if (!shippingCode?.trim()) {
      throw new ShipHeroOutboundError(409, "ShipHero dry shipping code is not configured");
    }
  } else if (order.shippingMethod === "refrigerated") {
    shippingCode = settings.coldShippingCode;
    if (!shippingCode?.trim()) {
      throw new ShipHeroOutboundError(409, "ShipHero cold shipping code is not configured");
    }
    const coveredCities = new Set(settings.coldCoverageCities.map(value => value.trim().toLocaleLowerCase()));
    if (!city || !coveredCities.has(city.toLocaleLowerCase())) {
      throw new ShipHeroOutboundError(409, `ShipHero cold shipping coverage is not configured for ${city || "the delivery city"}`);
    }
  } else {
    throw new ShipHeroOutboundError(409, `Unsupported shipping method: ${order.shippingMethod}`);
  }

  const legacyAddress = parseLegacyAddress(order.address);
  // Do not infer a partner format from available address data. This exact fixture is
  // intentionally not a live National Address value; the hard release gate stays shut.
  const address2 = SHIPHERO_NATIONAL_ADDRESS_TODO_FIXTURE;
  const address1 = combineAddressParts(
    input.address.buildingNo,
    input.address.street,
    input.address.district,
    input.address.additionalNumber,
    input.address.additionalInfo,
  );
  const rawCountry = input.address.country?.trim() || stringField(legacyAddress.country);
  const country = rawCountry ? countryIsoCode(rawCountry) : "";
  if (!city || !address1 || !country || !customer.name.trim() || !customer.phone.trim()) {
    throw new ShipHeroOutboundError(409, `Order ${order.orderNumber} is missing required ShipHero shipping address or recipient details`);
  }

  const warehouseId = requireConfiguredValue(input.environment.SHIPHERO_WAREHOUSE_ID, "SHIPHERO_WAREHOUSE_ID");
  const merchantId = requireConfiguredValue(input.environment.SHIPHERO_MERCHANT_ID, "SHIPHERO_MERCHANT_ID");

  return {
    order_number: order.orderNumber,
    partner_order_id: String(order.id),
    customer_account_id: merchantId,
    shipping_address: {
      ...splitRecipientName(customer.name),
      phone: customer.phone.trim(),
      address1,
      address2,
      city,
      zip: input.address.postalCode?.trim() || "",
      country,
    },
    line_items: input.items.map(item => {
      const mapping = mappingByProductId.get(item.productId)!;
      return {
        sku: mapping.sku,
        product_name: mapping.productName,
        partner_line_item_id: String(item.id),
        quantity: item.quantity,
        price: formatMoney(item.unitPrice, "line item price"),
        warehouse_id: warehouseId,
      };
    }),
    shipping_lines: {
      title: shippingCode.trim(),
      price: formatMoney(order.shippingCost, "shipping cost"),
      method: shippingCode.trim(),
    },
    currency: "SAR",
  };
}

export type ShipHeroDispatchSummary = {
  id: number;
  orderId: number;
  orderNumber: string;
  status: ShipHeroDispatchStatus;
  remoteOrderId: string | null;
  lastError?: string | null;
};

export type ShipHeroProductCreateCandidate = {
  productId: number;
  productName: string;
  sku: string;
};

type ClaimResult =
  | { kind: "claimed"; dispatchId: number; payload: ShipHeroOrderInput }
  | { kind: "not_queued" }
  | { kind: "blocked"; error: string; status?: number };

export interface ShipHeroOutboundRepository {
  enqueueOrder(orderId: number, allowBlockedRetry: boolean): Promise<ShipHeroDispatchSummary>;
  getQueuedDispatchIds(): Promise<number[]>;
  getDispatch(id: number): Promise<ShipHeroDispatchSummary | null>;
  claimQueuedDispatch(
    id: number,
    prepare: (input: ShipHeroOrderPreflightInput) => ShipHeroOrderInput,
  ): Promise<ClaimResult>;
  verifyClaimBeforeNetwork(id: number): Promise<boolean>;
  finishDispatch(
    id: number,
    result: { status: "sent"; remoteOrderId: string } | { status: "blocked" | "uncertain"; error: string; remoteOrderId?: string },
  ): Promise<void>;
  beginProductCreate(
    productId: number,
    confirmNotRegistered: boolean,
    assertConfigured: () => void,
  ): Promise<{ alreadyCreated: true; remoteProductId: string } | { alreadyCreated: false; candidate: ShipHeroProductCreateCandidate }>;
  finishProductCreate(
    productId: number,
    result: { status: "created"; remoteProductId: string } | { status: "blocked" | "uncertain"; error: string; remoteProductId?: string },
  ): Promise<void>;
  recoverStaleSendingDispatches(): Promise<void>;
}

export interface ShipHeroOutboundClient {
  createOrder(payload: ShipHeroOrderInput): Promise<{ remoteOrderId: string }>;
  createProduct(input: ShipHeroProductInput): Promise<{ remoteProductId: string }>;
}

export type ShipHeroOutboundDependencies = {
  repository: ShipHeroOutboundRepository;
  client: ShipHeroOutboundClient;
  assertConfigured: () => void;
  environment?: NodeJS.ProcessEnv;
};

function safeErrorMessage(error: unknown, environment: NodeJS.ProcessEnv): string {
  let message = error instanceof Error ? error.message : "ShipHero outbound operation failed";
  for (const key of [
    "SHIPHERO_ACCESS_TOKEN",
    "SHIPHERO_REFRESH_TOKEN",
    "SHIPHERO_MERCHANT_ID",
    "SHIPHERO_WAREHOUSE_ID",
    "SHIPHERO_WEBHOOK_SECRET",
  ]) {
    const value = environment[key];
    if (value) message = message.split(value).join("[environment value]");
  }
  return message;
}

function isAmbiguous(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "ambiguous" in error
    && typeof (error as { ambiguous?: unknown }).ambiguous === "boolean") {
    return Boolean((error as { ambiguous: boolean }).ambiguous);
  }
  // Once a create request begins, any unclassified failure may have followed a
  // successful remote mutation. Default to reconciliation, never a blind retry.
  return true;
}

export function assertShipHeroProductCreateAllowed(input: {
  productId: number;
  confirmNotRegistered: boolean;
  mapping: ShipHeroProductMappingInput | null;
  baselineMaxId: number;
}): ShipHeroProductCreateCandidate {
  if (!input.confirmNotRegistered) {
    throw new ShipHeroOutboundError(400, "Confirm that the product is not registered in ShipHero before creating it");
  }
  if (!input.mapping) {
    throw new ShipHeroOutboundError(409, `ShipHero product mapping is missing for product ${input.productId}`);
  }
  if (input.productId <= input.baselineMaxId) {
    throw new ShipHeroOutboundError(409, "ShipHero product_create is only for products added after the installation catalog baseline");
  }
  if (input.mapping.registrationKind !== "new") {
    throw new ShipHeroOutboundError(409, "ShipHero product_create is only for products explicitly marked new; existing catalog products must not be re-registered");
  }
  if (input.mapping.createStatus === "created" && input.mapping.remoteProductId) {
    return {
      productId: input.productId,
      productName: input.mapping.productName,
      sku: input.mapping.sku,
    };
  }
  if (input.mapping.createStatus === "sending" || input.mapping.createStatus === "uncertain") {
    throw new ShipHeroOutboundError(409, `ShipHero product creation for ${input.mapping.productName} is ambiguous and requires reconciliation; it will not be retried`);
  }
  return {
    productId: input.productId,
    productName: input.mapping.productName,
    sku: input.mapping.sku,
  };
}

export function createShipHeroOutboundService(dependencies: ShipHeroOutboundDependencies) {
  const environment = dependencies.environment ?? process.env;

  async function processDispatch(id: number, propagateUnavailable = false): Promise<ShipHeroDispatchSummary | null> {
    const claim = await dependencies.repository.claimQueuedDispatch(id, input => {
      dependencies.assertConfigured();
      return buildShipHeroOrderPayload({ ...input, environment });
    });
    if (claim.kind === "blocked" && propagateUnavailable && claim.status === 503) {
      throw new ShipHeroOutboundError(503, claim.error);
    }
    if (claim.kind !== "claimed") return dependencies.repository.getDispatch(id);

    // The order/payment status is locked and checked again immediately before the
    // network request. A change after this point cannot cancel an in-flight request.
    if (!await dependencies.repository.verifyClaimBeforeNetwork(id)) {
      await dependencies.repository.finishDispatch(id, {
        status: "blocked",
        error: "Order was cancelled, unpaid, or no longer preparing before the ShipHero request started",
      });
      return dependencies.repository.getDispatch(id);
    }

    let result: { remoteOrderId: string };
    try {
      result = await dependencies.client.createOrder(claim.payload);
    } catch (error) {
      try {
        await dependencies.repository.finishDispatch(id, {
          status: isAmbiguous(error) ? "uncertain" : "blocked",
          error: safeErrorMessage(error, environment),
        });
      } catch {
        throw new ShipHeroOutboundError(503, "ShipHero request outcome could not be saved; dispatch remains sending for reconciliation");
      }
      return dependencies.repository.getDispatch(id);
    }

    try {
      await dependencies.repository.finishDispatch(id, {
        status: "sent",
        remoteOrderId: result.remoteOrderId,
      });
    } catch {
      // Remote creation succeeded. Never mark this retryable; save the ID/status as
      // uncertain if possible. If the DB is unavailable, stale-sending recovery does so.
      try {
        await dependencies.repository.finishDispatch(id, {
          status: "uncertain",
          error: "ShipHero accepted the order but local success persistence failed; reconcile before retrying",
          remoteOrderId: result.remoteOrderId,
        });
      } catch {
        // Leave the committed sending marker intact for stale-sending recovery.
      }
      throw new ShipHeroOutboundError(503, "ShipHero accepted the order but local confirmation failed; it will not be retried automatically");
    }
    return dependencies.repository.getDispatch(id);
  }

  return {
    async sendShipHeroOrder(orderId: number): Promise<ShipHeroDispatchSummary> {
      // Calling this function is the explicit/manual retry for a previously blocked
      // dispatch. Sent, sending, and uncertain rows are never re-enqueued.
      const dispatch = await dependencies.repository.enqueueOrder(orderId, true);
      if (dispatch.status !== "queued") return dispatch;
      return (await processDispatch(dispatch.id, true)) ?? dispatch;
    },

    async processShipHeroDispatchQueue(): Promise<ShipHeroDispatchSummary[]> {
      const ids = await dependencies.repository.getQueuedDispatchIds();
      const results: ShipHeroDispatchSummary[] = [];
      for (const id of ids) {
        const result = await processDispatch(id);
        if (result) results.push(result);
      }
      return results;
    },

    async createShipHeroProduct(
      productId: number,
      confirmNotRegistered: boolean,
    ): Promise<{ status: "created" | "already_created"; remoteProductId: string }> {
      const started = await dependencies.repository.beginProductCreate(
        productId,
        confirmNotRegistered,
        dependencies.assertConfigured,
      );
      if (started.alreadyCreated) {
        return { status: "already_created", remoteProductId: started.remoteProductId };
      }
      const productInput: ShipHeroProductInput = {
        customer_account_id: requireConfiguredValue(environment.SHIPHERO_MERCHANT_ID, "SHIPHERO_MERCHANT_ID"),
        name: started.candidate.productName,
        sku: started.candidate.sku,
        warehouse_products: [],
      };
      let result: { remoteProductId: string };
      try {
        result = await dependencies.client.createProduct(productInput);
      } catch (error) {
        const status = isAmbiguous(error) ? "uncertain" : "blocked";
        try {
          await dependencies.repository.finishProductCreate(productId, {
            status,
            error: safeErrorMessage(error, environment),
          });
        } catch {
          throw new ShipHeroOutboundError(503, "ShipHero product request outcome could not be saved; registration remains sending for reconciliation");
        }
        throw new ShipHeroOutboundError(
          isAmbiguous(error) ? 502 : error instanceof ShipHeroError ? error.status : 422,
          safeErrorMessage(error, environment),
        );
      }
      try {
        await dependencies.repository.finishProductCreate(productId, {
          status: "created",
          remoteProductId: result.remoteProductId,
        });
      } catch (error) {
        try {
          await dependencies.repository.finishProductCreate(productId, {
            status: "uncertain",
            error: "ShipHero accepted the product but local success persistence failed; reconcile before retrying",
            remoteProductId: result.remoteProductId,
          });
        } catch {
          // Sending remains a non-retryable marker if the database is unavailable.
        }
        throw new ShipHeroOutboundError(503, "ShipHero accepted the product but local confirmation failed; it will not be retried automatically");
      }
      return { status: "created", remoteProductId: result.remoteProductId };
    },

    async recoverStaleSendingDispatches(): Promise<void> {
      await dependencies.repository.recoverStaleSendingDispatches();
    },
  };
}

function parseOrderAddress(orderAddress: string, normalizedAddress: Record<string, unknown> | undefined) {
  const legacy = parseLegacyAddress(orderAddress);
  const source = normalizedAddress ?? legacy;
  return {
    label: stringField(source.label) || null,
    city: stringField(source.city),
    country: stringField(source.country) || null,
    nationalAddressShortCode: stringField(source.nationalAddressShortCode) || null,
    district: stringField(source.district),
    street: stringField(source.street),
    buildingNo: stringField(source.buildingNo),
    postalCode: stringField(source.postalCode) || null,
    additionalNumber: stringField(source.additionalNumber) || null,
    additionalInfo: stringField(source.additionalInfo) || null,
  };
}

async function createDatabaseRepository(): Promise<ShipHeroOutboundRepository> {
  const schema = await import("@workspace/db");
  const config = await import("./shiphero-config");
  const {
    db,
    customersTable,
    orderAddressesTable,
    orderItemsTable,
    ordersTable,
    productsTable,
    shipheroDispatchesTable,
    shipheroProductMappingsTable,
    shipheroSettingsTable,
  } = schema;
  type Executor = {
    execute: (query: unknown) => Promise<unknown>;
    select: (...args: any[]) => any;
    insert: (table: unknown) => any;
    update: (table: unknown) => any;
  };
  const transaction = <T>(action: (tx: Executor) => Promise<T>) => db.transaction(action as never) as Promise<T>;

  async function lockOrder(tx: Executor, orderId: number): Promise<void> {
    await tx.execute(sql`select id from ${ordersTable} where ${ordersTable.id} = ${orderId} for update`);
  }

  async function findDispatch(tx: Executor, orderId: number, lock = false): Promise<any | undefined> {
    if (lock) {
      await tx.execute(sql`select id from ${shipheroDispatchesTable} where ${shipheroDispatchesTable.orderId} = ${orderId} for update`);
    }
    const [dispatch] = await tx.select().from(shipheroDispatchesTable)
      .where(eq(shipheroDispatchesTable.orderId, orderId)).limit(1);
    return dispatch;
  }

  async function getSnapshot(tx: Executor, order: any, settings: any): Promise<ShipHeroOrderPreflightInput> {
    const [customer] = await tx.select().from(customersTable)
      .where(eq(customersTable.id, order.userId)).limit(1);
    const [address] = await tx.select().from(orderAddressesTable)
      .where(eq(orderAddressesTable.orderId, order.id)).limit(1);
    const items = await tx.select().from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, order.id));
    const ids: number[] = [...new Set<number>(items.map((item: { productId: number }) => item.productId))];
    const mappings = ids.length
      ? await tx.select().from(shipheroProductMappingsTable)
        .where(inArray(shipheroProductMappingsTable.productId, ids))
      : [];
    const catalogItems = items.map((item: any) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));
    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        shippingMethod: order.shippingMethod,
        shippingCost: order.shippingCost,
        address: order.address,
      },
      customer: { name: customer?.name ?? "", phone: customer?.phone ?? "" },
      address: parseOrderAddress(order.address, address),
      items: catalogItems,
      mappings,
      settings: {
        dryShippingCode: settings.dryShippingCode,
        coldShippingCode: settings.coldShippingCode,
        coldCoverageCities: settings.coldCoverageCities ?? [],
        catalogBaselineMaxId: settings.catalogBaselineMaxId,
      },
      environment: process.env,
    };
  }

  function sanitizeMessage(error: unknown): string {
    return safeErrorMessage(error, process.env);
  }

  return {
    async enqueueOrder(orderId, allowBlockedRetry) {
      return transaction(async tx => {
        await lockOrder(tx, orderId);
        const [order] = await tx.select().from(ordersTable)
          .where(eq(ordersTable.id, orderId)).limit(1);
        if (!order) throw new ShipHeroOutboundError(404, `Order ${orderId} was not found`);
        const dispatch = await findDispatch(tx, orderId, true);

        if (dispatch) {
          if (dispatch.status === "sent" || dispatch.status === "sending" || dispatch.status === "uncertain") {
            return dispatch;
          }
          if (dispatch.status === "blocked" && allowBlockedRetry) {
            if (order.status !== SHIPHERO_TRIGGER_STATUS || order.paymentStatus !== "paid") {
              const lastError = `Order ${order.orderNumber} must be paid and preparing before a manual retry`;
              const [updated] = await tx.update(shipheroDispatchesTable)
                .set({ status: "blocked", lastError }).where(eq(shipheroDispatchesTable.id, dispatch.id)).returning();
              return updated;
            }
            const [updated] = await tx.update(shipheroDispatchesTable)
              .set({ status: "queued", lastError: null }).where(eq(shipheroDispatchesTable.id, dispatch.id)).returning();
            return updated;
          }
          if (dispatch.status === "queued"
            && (order.status !== SHIPHERO_TRIGGER_STATUS || order.paymentStatus !== "paid")) {
            const lastError = `Order ${order.orderNumber} must be paid and preparing before ShipHero sending`;
            const [updated] = await tx.update(shipheroDispatchesTable)
              .set({ status: "blocked", lastError }).where(eq(shipheroDispatchesTable.id, dispatch.id)).returning();
            return updated;
          }
          return dispatch;
        }

        if (order.status !== SHIPHERO_TRIGGER_STATUS || order.paymentStatus !== "paid") {
          throw new ShipHeroOutboundError(409, `Order ${order.orderNumber} must be paid and preparing before ShipHero sending`);
        }
        const [created] = await tx.insert(shipheroDispatchesTable).values({
          orderId,
          orderNumber: order.orderNumber,
          status: "queued",
        }).onConflictDoNothing().returning();
        return created ?? await findDispatch(tx, orderId) as ShipHeroDispatchSummary;
      }) as Promise<ShipHeroDispatchSummary>;
    },

    async getQueuedDispatchIds() {
      const rows = await db.select({ id: shipheroDispatchesTable.id })
        .from(shipheroDispatchesTable)
        .where(eq(shipheroDispatchesTable.status, "queued"))
        .orderBy(asc(shipheroDispatchesTable.createdAt))
        .limit(50);
      return rows.map(row => row.id);
    },

    async getDispatch(id) {
      const [dispatch] = await db.select().from(shipheroDispatchesTable)
        .where(eq(shipheroDispatchesTable.id, id)).limit(1);
      return dispatch
        ? { ...dispatch, status: dispatch.status as ShipHeroDispatchStatus } satisfies ShipHeroDispatchSummary
        : null;
    },

    async claimQueuedDispatch(id, prepare) {
      return transaction(async tx => {
        const [unlocked] = await tx.select().from(shipheroDispatchesTable)
          .where(eq(shipheroDispatchesTable.id, id)).limit(1);
        if (!unlocked || unlocked.status !== "queued") return { kind: "not_queued" as const };
        await lockOrder(tx, unlocked.orderId);
        await tx.execute(sql`select id from ${shipheroDispatchesTable} where ${shipheroDispatchesTable.id} = ${id} for update`);
        const [dispatch] = await tx.select().from(shipheroDispatchesTable)
          .where(eq(shipheroDispatchesTable.id, id)).limit(1);
        if (!dispatch || dispatch.status !== "queued") return { kind: "not_queued" as const };
        const [order] = await tx.select().from(ordersTable)
          .where(eq(ordersTable.id, dispatch.orderId)).limit(1);
        if (!order || order.status !== SHIPHERO_TRIGGER_STATUS || order.paymentStatus !== "paid") {
          const error = `Order ${dispatch.orderNumber} must be paid and preparing before ShipHero sending`;
          await tx.update(shipheroDispatchesTable).set({ status: "blocked", lastError: error })
            .where(eq(shipheroDispatchesTable.id, id));
          return { kind: "blocked" as const, error };
        }

        try {
          const settings = await config.getShipHeroSettings();
          const snapshot = await getSnapshot(tx, order, settings);
          const payload = prepare(snapshot);
          const safePayload = config.redactShipHeroPayload(payload, process.env);
          await tx.update(shipheroDispatchesTable).set({
            status: "sending",
            payload: safePayload as never,
            response: {
              sendProtection: {
                phase: "claimed",
                detail: "Order was row-locked and checked as paid/preparing before outbound I/O",
              },
            },
            attempts: dispatch.attempts + 1,
            lastError: null,
            lastAttemptAt: new Date(),
          }).where(eq(shipheroDispatchesTable.id, id));
          return { kind: "claimed" as const, dispatchId: id, payload };
        } catch (error) {
          const message = sanitizeMessage(error);
          const status = error instanceof ShipHeroError ? error.status : undefined;
          await tx.update(shipheroDispatchesTable).set({
            status: "blocked",
            lastError: message,
            lastAttemptAt: new Date(),
          }).where(eq(shipheroDispatchesTable.id, id));
          return { kind: "blocked" as const, error: message, status };
        }
      });
    },

    async verifyClaimBeforeNetwork(id) {
      return transaction(async tx => {
        const [dispatch] = await tx.select().from(shipheroDispatchesTable)
          .where(eq(shipheroDispatchesTable.id, id)).limit(1);
        if (!dispatch || dispatch.status !== "sending") return false;
        await lockOrder(tx, dispatch.orderId);
        const [order] = await tx.select().from(ordersTable)
          .where(eq(ordersTable.id, dispatch.orderId)).limit(1);
        if (!order || order.status !== SHIPHERO_TRIGGER_STATUS || order.paymentStatus !== "paid") {
          return false;
        }
        await tx.update(shipheroDispatchesTable).set({
          response: {
            sendProtection: {
              phase: "immediate-preflight",
              detail: "Order status and payment were row-locked and rechecked immediately before starting the network request",
            },
          },
        }).where(and(eq(shipheroDispatchesTable.id, id), eq(shipheroDispatchesTable.status, "sending")));
        return true;
      });
    },

    async finishDispatch(id, result) {
      const common = {
        updatedAt: new Date(),
        lastError: result.status === "sent" ? null : result.error,
      };
      if (result.status === "sent") {
        await db.update(shipheroDispatchesTable).set({
          ...common,
          status: "sent",
          remoteOrderId: result.remoteOrderId,
          response: {
            remoteOrderId: result.remoteOrderId,
            sendProtection: "Order was rechecked immediately before the request; a later cancellation cannot cancel an in-flight remote request.",
          },
          sentAt: new Date(),
        }).where(and(eq(shipheroDispatchesTable.id, id), eq(shipheroDispatchesTable.status, "sending")));
      } else {
        await db.update(shipheroDispatchesTable).set({
          ...common,
          status: result.status,
          ...(result.remoteOrderId ? { remoteOrderId: result.remoteOrderId } : {}),
          response: {
            ...(result.remoteOrderId ? { remoteOrderId: result.remoteOrderId } : {}),
            sendProtection: "Order was rechecked immediately before the request; any started but unconfirmed remote operation requires reconciliation.",
          },
        }).where(and(eq(shipheroDispatchesTable.id, id), eq(shipheroDispatchesTable.status, "sending")));
      }
    },

    async beginProductCreate(productId, confirmNotRegistered, assertConfigured) {
      const settings = await config.getShipHeroSettings();
      return transaction(async tx => {
        await tx.execute(sql`select id from ${productsTable} where ${productsTable.id} = ${productId} for update`);
        await tx.execute(sql`select product_id from ${shipheroProductMappingsTable} where ${shipheroProductMappingsTable.productId} = ${productId} for update`);
        const [product] = await tx.select().from(productsTable)
          .where(eq(productsTable.id, productId)).limit(1);
        const [mapping] = await tx.select().from(shipheroProductMappingsTable)
          .where(eq(shipheroProductMappingsTable.productId, productId)).limit(1);
        if (!product) throw new ShipHeroOutboundError(404, `Product ${productId} was not found`);
        const candidate = assertShipHeroProductCreateAllowed({
          productId,
          confirmNotRegistered,
          mapping: mapping ?? null,
          baselineMaxId: settings.catalogBaselineMaxId,
        });
        if (mapping.createStatus === "created" && mapping.remoteProductId) {
          return { alreadyCreated: true as const, remoteProductId: mapping.remoteProductId };
        }
        try {
          assertConfigured();
        } catch (error) {
          const message = sanitizeMessage(error);
          await tx.update(shipheroProductMappingsTable).set({
            createStatus: "blocked",
          }).where(eq(shipheroProductMappingsTable.productId, productId));
          throw new ShipHeroOutboundError(503, message);
        }
        await tx.update(shipheroProductMappingsTable).set({ createStatus: "sending" })
          .where(eq(shipheroProductMappingsTable.productId, productId));
        return { alreadyCreated: false as const, candidate };
      });
    },

    async finishProductCreate(productId, result) {
      if (result.status === "created") {
        await db.update(shipheroProductMappingsTable).set({
          createStatus: "created",
          remoteProductId: result.remoteProductId,
        }).where(and(
          eq(shipheroProductMappingsTable.productId, productId),
          eq(shipheroProductMappingsTable.createStatus, "sending"),
        ));
      } else {
        await db.update(shipheroProductMappingsTable).set({
          createStatus: result.status,
          ...(result.remoteProductId ? { remoteProductId: result.remoteProductId } : {}),
        }).where(and(
          eq(shipheroProductMappingsTable.productId, productId),
          eq(shipheroProductMappingsTable.createStatus, "sending"),
        ));
      }
    },

    async recoverStaleSendingDispatches() {
      const threshold = new Date(Date.now() - 120_000);
      await db.update(shipheroDispatchesTable).set({
        status: "uncertain",
        lastError: "Prior outbound worker stopped while the remote result was ambiguous; reconcile before retrying",
      }).where(and(
        eq(shipheroDispatchesTable.status, "sending"),
        lt(shipheroDispatchesTable.lastAttemptAt, threshold),
      ));
    },
  };
}

let defaultServicePromise: Promise<ReturnType<typeof createShipHeroOutboundService>> | undefined;

async function getDefaultService() {
  defaultServicePromise ??= (async () => {
    const [{ assertShipHeroSendingConfigured }, { createShipHeroOrder, createShipHeroProduct }] = await Promise.all([
      import("./shiphero-config"),
      import("./shiphero-client"),
    ]);
    const repository = await createDatabaseRepository();
    return createShipHeroOutboundService({
      repository,
      assertConfigured: () => assertShipHeroSendingConfigured(process.env),
      client: {
        createOrder: payload => createShipHeroOrder(payload, { environment: process.env }),
        createProduct: input => createShipHeroProduct(input, { environment: process.env }),
      },
    });
  })();
  return defaultServicePromise;
}

export async function sendShipHeroOrder(orderId: number): Promise<ShipHeroDispatchSummary> {
  return (await getDefaultService()).sendShipHeroOrder(orderId);
}

export async function createShipHeroProduct(
  productId: number,
  confirmNotRegistered: boolean,
): Promise<{ status: "created" | "already_created"; remoteProductId: string }> {
  return (await getDefaultService()).createShipHeroProduct(productId, confirmNotRegistered);
}

export async function processShipHeroDispatchQueue(): Promise<ShipHeroDispatchSummary[]> {
  return (await getDefaultService()).processShipHeroDispatchQueue();
}

let workerTimer: ReturnType<typeof setInterval> | undefined;

export function startShipHeroOutboundWorker(intervalMs = 5_000): () => void {
  if (workerTimer) return () => {
    if (workerTimer) clearInterval(workerTimer);
    workerTimer = undefined;
  };

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { withBackupWriteFence } = await import("./backup-fence");
      await withBackupWriteFence(async () => {
        const service = await getDefaultService();
        await service.recoverStaleSendingDispatches();
        await service.processShipHeroDispatchQueue();
      });
    } catch (error) {
      const { logger } = await import("./logger");
      logger.error({ error: safeErrorMessage(error, process.env) }, "ShipHero outbound worker iteration failed");
    } finally {
      running = false;
    }
  };
  void tick();
  workerTimer = setInterval(() => void tick(), intervalMs);
  workerTimer.unref?.();
  return () => {
    if (workerTimer) clearInterval(workerTimer);
    workerTimer = undefined;
  };
}