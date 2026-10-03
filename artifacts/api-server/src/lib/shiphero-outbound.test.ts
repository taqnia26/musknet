import { describe, expect, it, vi } from "vitest";
import { createShipHeroOrder, SHIPHERO_GRAPHQL_URL, SHIPHERO_REFRESH_URL } from "./shiphero-client";
import {
  assertShipHeroProductCreateAllowed,
  buildShipHeroOrderPayload,
  createShipHeroOutboundService,
  ShipHeroOutboundError,
  type ShipHeroDispatchSummary,
  type ShipHeroOrderPreflightInput,
  type ShipHeroOutboundRepository,
} from "./shiphero-outbound";

vi.mock("./shiphero-config", () => {
  class MockShipHeroError extends Error {
    constructor(public readonly status: number, message: string) {
      super(message);
    }
  }
  return {
    ShipHeroError: MockShipHeroError,
    SHIPHERO_TRIGGER_STATUS: "preparing",
    assertShipHeroSendingConfigured: () => undefined,
  };
});

const environment = {
  SHIPHERO_MERCHANT_ID: "merchant-private",
  SHIPHERO_WAREHOUSE_ID: "warehouse-private",
} as NodeJS.ProcessEnv;

function samplePreflight(): ShipHeroOrderPreflightInput {
  return {
    order: {
      id: 22,
      orderNumber: "ORDER-22",
      status: "preparing",
      paymentStatus: "paid",
      shippingMethod: "regular",
      shippingCost: 28,
      address: "{}",
    },
    customer: { name: "A Customer", phone: "+966500000000" },
    address: {
      label: "Home",
      city: "Riyadh",
      country: "Saudi Arabia",
      nationalAddressShortCode: "RIYH1234",
      district: "Olaya",
      street: "King Fahd Road",
      buildingNo: "10",
      postalCode: "12211",
    },
    items: [{
      id: 71,
      productId: 4,
      productName: "Rose Oil",
      quantity: 2,
      unitPrice: 30,
    }],
    mappings: [{
      productId: 4,
      productName: "Partner Rose Oil",
      sku: "ROSE-4",
      registrationKind: "existing",
      remoteProductId: "remote-product-4",
      createStatus: "not_requested",
    }],
    settings: {
      dryShippingCode: "DRY-CODE",
      coldShippingCode: "COLD-CODE",
      coldCoverageCities: ["Riyadh"],
      catalogBaselineMaxId: 9,
    },
    environment,
  };
}

class MockOutboundRepository implements ShipHeroOutboundRepository {
  readonly dispatches = new Map<number, ShipHeroDispatchSummary>();
  readonly input = samplePreflight();
  nextId = 1;
  eligibleBeforeRequest = true;
  readonly productCreateStatuses = new Map<number, string>();
  readonly productRemoteIds = new Map<number, string>();
  failSentPersistenceOnce = false;
  failProductCreatedPersistenceOnce = false;

  async enqueueOrder(orderId: number): Promise<ShipHeroDispatchSummary> {
    const existing = [...this.dispatches.values()].find(dispatch => dispatch.orderId === orderId);
    if (existing) {
      if (existing.status === "blocked") existing.status = "queued";
      return existing;
    }
    const created: ShipHeroDispatchSummary = {
      id: this.nextId++,
      orderId,
      orderNumber: this.input.order.orderNumber,
      status: "queued",
      remoteOrderId: null,
    };
    this.dispatches.set(created.id, created);
    return created;
  }

  async getQueuedDispatchIds(): Promise<number[]> {
    return [...this.dispatches.values()]
      .filter(dispatch => dispatch.status === "queued")
      .map(dispatch => dispatch.id);
  }

  async getDispatch(id: number): Promise<ShipHeroDispatchSummary | null> {
    return this.dispatches.get(id) ?? null;
  }

  async claimQueuedDispatch(
    id: number,
    prepare: (input: ShipHeroOrderPreflightInput) => ReturnType<typeof buildShipHeroOrderPayload>,
  ) {
    const dispatch = this.dispatches.get(id);
    if (!dispatch || dispatch.status !== "queued") return { kind: "not_queued" as const };
    try {
      const payload = prepare(this.input);
      dispatch.status = "sending";
      return { kind: "claimed" as const, dispatchId: id, payload };
    } catch (error) {
      dispatch.status = "blocked";
      dispatch.lastError = error instanceof Error ? error.message : "blocked";
      const status = typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: unknown }).status)
        : undefined;
      return { kind: "blocked" as const, error: dispatch.lastError, status };
    }
  }

  async verifyClaimBeforeNetwork(): Promise<boolean> {
    return this.eligibleBeforeRequest;
  }

  async finishDispatch(
    id: number,
    result: { status: "sent"; remoteOrderId: string } | { status: "blocked" | "uncertain"; error: string; remoteOrderId?: string },
  ): Promise<void> {
    if (result.status === "sent" && this.failSentPersistenceOnce) {
      this.failSentPersistenceOnce = false;
      throw new Error("simulated local DB failure after remote success");
    }
    const dispatch = this.dispatches.get(id)!;
    dispatch.status = result.status;
    if (result.status === "sent") dispatch.remoteOrderId = result.remoteOrderId;
    else {
      dispatch.lastError = result.error;
      if (result.remoteOrderId) dispatch.remoteOrderId = result.remoteOrderId;
    }
  }

  async beginProductCreate(productId: number, _confirm: boolean, assertConfigured: () => void) {
    assertConfigured();
    this.productCreateStatuses.set(productId, "sending");
    return {
      alreadyCreated: false as const,
      candidate: { productId, productName: "Future product", sku: "FUTURE-1" },
    };
  }

  async finishProductCreate(productId: number, result: { status: "created"; remoteProductId: string } | { status: "blocked" | "uncertain"; error: string; remoteProductId?: string }) {
    if (result.status === "created" && this.failProductCreatedPersistenceOnce) {
      this.failProductCreatedPersistenceOnce = false;
      throw new Error("simulated product DB failure after remote success");
    }
    this.productCreateStatuses.set(productId, result.status);
    if (result.remoteProductId) this.productRemoteIds.set(productId, result.remoteProductId);
  }

  async recoverStaleSendingDispatches(): Promise<void> {}
}

describe("ShipHero outbound preflight", () => {
  it("refuses pickup and phone payloads before any remote dispatch", () => {
    const pickup = samplePreflight();
    pickup.order.fulfillmentMethod = "pickup";
    expect(() => buildShipHeroOrderPayload(pickup)).toThrow(/external dispatch is not allowed/);
    const phone = samplePreflight();
    phone.order.orderSource = "phone";
    expect(() => buildShipHeroOrderPayload(phone)).toThrow(/external dispatch is not allowed/);
    const legacy = samplePreflight();
    legacy.order.fulfillmentMethod = null;
    expect(() => buildShipHeroOrderPayload(legacy)).not.toThrow();
  });
  it("allows only paid orders at the preparing trigger status", () => {
    expect(() => buildShipHeroOrderPayload(samplePreflight())).not.toThrow();

    const unpaid = samplePreflight();
    unpaid.order.paymentStatus = "pending";
    expect(() => buildShipHeroOrderPayload(unpaid)).toThrow(/not paid/);

    const early = samplePreflight();
    early.order.status = "pending_review";
    expect(() => buildShipHeroOrderPayload(early)).toThrow(/not in preparing status/);
  });

  it("blocks unmapped line items and names the missing product", () => {
    const input = samplePreflight();
    input.mappings = [];
    expect(() => buildShipHeroOrderPayload(input)).toThrow(/Rose Oil/);
  });

  it("maps regular and cold shipping from settings and enforces configured city coverage", () => {
    const regular = buildShipHeroOrderPayload(samplePreflight());
    expect(regular.shipping_lines.method).toBe("DRY-CODE");
    expect(regular).toMatchObject({
      order_number: "ORDER-22",
      partner_order_id: "22",
      shipping_address: {
        first_name: "A",
        last_name: "Customer",
        country: "SA",
      },
      line_items: [{ price: "30.00" }],
      shipping_lines: { title: "DRY-CODE", price: "28.00" },
      currency: "SAR",
    });
    expect(regular.shipping_address).not.toHaveProperty("name");

    const refrigerated = samplePreflight();
    refrigerated.order.shippingMethod = "refrigerated";
    expect(buildShipHeroOrderPayload(refrigerated).shipping_lines.method).toBe("COLD-CODE");

    refrigerated.address.city = "Jeddah";
    expect(() => buildShipHeroOrderPayload(refrigerated)).toThrow(/coverage is not configured/);
  });

  it("uses only the explicitly marked national-address placeholder fixture", () => {
    const input = samplePreflight();
    const payload = buildShipHeroOrderPayload(input);
    expect(payload.shipping_address.address2).toBe("---SHORTCODE");
  });

  it("prevents product_create for baseline catalog items and for unconfirmed existing products", () => {
    const mapping = {
      productId: 9,
      productName: "Catalog product",
      sku: "CATALOG-9",
      registrationKind: "existing",
      createStatus: "not_requested",
    };
    expect(() => assertShipHeroProductCreateAllowed({
      productId: 9,
      confirmNotRegistered: true,
      mapping,
      baselineMaxId: 9,
    })).toThrow(/installation catalog baseline/);
    expect(() => assertShipHeroProductCreateAllowed({
      productId: 10,
      confirmNotRegistered: true,
      mapping: { ...mapping, productId: 10 },
      baselineMaxId: 9,
    })).toThrow(/explicitly marked new/);
  });

  it("never automatically retries an ambiguous product registration", () => {
    expect(() => assertShipHeroProductCreateAllowed({
      productId: 10,
      confirmNotRegistered: true,
      baselineMaxId: 9,
      mapping: {
        productId: 10,
        productName: "New item",
        sku: "NEW-10",
        registrationKind: "new",
        createStatus: "uncertain",
      },
    })).toThrow(/requires reconciliation/);
  });
});

describe("ShipHero outbound queue service with a mocked adapter", () => {
  it("keeps the hard release gate closed even when credentials are supplied", async () => {
    const repository = new MockOutboundRepository();
    const createOrder = vi.fn(async () => ({ remoteOrderId: "remote-1" }));
    const service = createShipHeroOutboundService({
      repository,
      client: {
        createOrder,
        createProduct: vi.fn(async () => ({ remoteProductId: "remote-product" })),
      },
      environment,
      assertConfigured: () => {
        throw new ShipHeroOutboundError(503, "Partner Create Order example and National Address format are pending confirmation. Live sending is disabled.");
      },
    });

    await expect(service.sendShipHeroOrder(22)).rejects.toMatchObject({ status: 503 });
    const [result] = repository.dispatches.values();
    expect(result.status).toBe("blocked");
    expect(result.lastError).toMatch(/live sending is disabled/i);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("sends a queued dispatch once and returns the existing sent record on retries", async () => {
    const repository = new MockOutboundRepository();
    const createOrder = vi.fn(async () => ({ remoteOrderId: "remote-22" }));
    const service = createShipHeroOutboundService({
      repository,
      client: {
        createOrder,
        createProduct: vi.fn(async () => ({ remoteProductId: "remote-product" })),
      },
      environment,
      assertConfigured: () => undefined,
    });

    const first = await service.sendShipHeroOrder(22);
    const retry = await service.sendShipHeroOrder(22);

    expect(first).toMatchObject({ status: "sent", remoteOrderId: "remote-22" });
    expect(retry).toBe(first);
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({
      customer_account_id: "merchant-private",
      shipping_address: expect.objectContaining({ address2: "---SHORTCODE" }),
      line_items: [expect.objectContaining({ sku: "ROSE-4", warehouse_id: "warehouse-private" })],
      shipping_lines: expect.objectContaining({ method: "DRY-CODE" }),
    }));
  });

  it("blocks a cancellation observed at the immediate pre-network recheck", async () => {
    const repository = new MockOutboundRepository();
    repository.eligibleBeforeRequest = false;
    const createOrder = vi.fn(async () => ({ remoteOrderId: "must-not-send" }));
    const service = createShipHeroOutboundService({
      repository,
      client: {
        createOrder,
        createProduct: vi.fn(async () => ({ remoteProductId: "unused" })),
      },
      environment,
      assertConfigured: () => undefined,
    });

    const result = await service.sendShipHeroOrder(22);
    expect(result.status).toBe("blocked");
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("defaults unclassified Create Order errors to uncertain and never blindly retries", async () => {
    const repository = new MockOutboundRepository();
    const createOrder = vi.fn(async () => {
      throw new Error("unclassified transport failure");
    });
    const service = createShipHeroOutboundService({
      repository,
      client: {
        createOrder,
        createProduct: vi.fn(async () => ({ remoteProductId: "unused" })),
      },
      environment,
      assertConfigured: () => undefined,
    });

    const first = await service.sendShipHeroOrder(22);
    const retry = await service.sendShipHeroOrder(22);

    expect(first.status).toBe("uncertain");
    expect(retry.status).toBe("uncertain");
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it("keeps a remote success non-retryable when saving the dispatch fails", async () => {
    const repository = new MockOutboundRepository();
    repository.failSentPersistenceOnce = true;
    const createOrder = vi.fn(async () => ({ remoteOrderId: "remote-created" }));
    const service = createShipHeroOutboundService({
      repository,
      client: {
        createOrder,
        createProduct: vi.fn(async () => ({ remoteProductId: "unused" })),
      },
      environment,
      assertConfigured: () => undefined,
    });

    await expect(service.sendShipHeroOrder(22)).rejects.toMatchObject({ status: 503 });
    const [dispatch] = repository.dispatches.values();
    expect(dispatch).toMatchObject({ status: "uncertain", remoteOrderId: "remote-created" });
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect((await service.sendShipHeroOrder(22)).status).toBe("uncertain");
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it("keeps a remote product success non-retryable when saving it fails", async () => {
    const repository = new MockOutboundRepository();
    repository.failProductCreatedPersistenceOnce = true;
    const createProduct = vi.fn(async () => ({ remoteProductId: "remote-product-created" }));
    const service = createShipHeroOutboundService({
      repository,
      client: {
        createOrder: vi.fn(async () => ({ remoteOrderId: "unused" })),
        createProduct,
      },
      environment,
      assertConfigured: () => undefined,
    });

    await expect(service.createShipHeroProduct(10, true)).rejects.toMatchObject({ status: 503 });
    expect(repository.productCreateStatuses.get(10)).toBe("uncertain");
    expect(repository.productRemoteIds.get(10)).toBe("remote-product-created");
    expect(createProduct).toHaveBeenCalledTimes(1);
    expect(createProduct).toHaveBeenCalledWith({
      customer_account_id: "merchant-private",
      name: "Future product",
      sku: "FUTURE-1",
      warehouse_products: [],
    });
  });

  it("uses ShipHero's documented direct mutation response shape and invalidates token cache on env changes", async () => {
    const originalEnvironment = {
      SHIPHERO_ACCESS_TOKEN: "old-access",
      SHIPHERO_REFRESH_TOKEN: "old-refresh",
      SHIPHERO_MERCHANT_ID: "merchant-private",
      SHIPHERO_WAREHOUSE_ID: "warehouse-private",
    } as NodeJS.ProcessEnv;
    const requests: Array<{ url: string; authorization?: string; body?: Record<string, unknown> }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      const authorization = new Headers(init?.headers).get("authorization") ?? undefined;
      requests.push({ url, authorization, body });
      if (url === SHIPHERO_GRAPHQL_URL && authorization === "Bearer old-access") {
        return new Response(null, { status: 401 });
      }
      if (url === SHIPHERO_REFRESH_URL) {
        return new Response(JSON.stringify({
          access_token: "rotated-access-1",
          refresh_token: "rotated-refresh-1",
          expires_in: 3600,
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        data: { order_create: { order: { id: "remote-order-77" } } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const draftInput = buildShipHeroOrderPayload(samplePreflight());
    const result = await createShipHeroOrder(draftInput, {
      environment: originalEnvironment,
      fetcher,
    });

    expect(result.remoteOrderId).toBe("remote-order-77");
    const graphqlRequest = requests.find(request => request.url === SHIPHERO_GRAPHQL_URL);
    expect(graphqlRequest?.body).toMatchObject({
      variables: { data: { order_number: "ORDER-22", partner_order_id: "22" } },
    });
    expect(graphqlRequest?.body?.query).toContain("order { id }");
    expect(graphqlRequest?.body?.query).not.toContain("request_id");

    const replacementEnvironment = {
      SHIPHERO_REFRESH_TOKEN: "replacement-refresh",
      SHIPHERO_MERCHANT_ID: "merchant-private",
      SHIPHERO_WAREHOUSE_ID: "warehouse-private",
    } as NodeJS.ProcessEnv;
    const replacementRequests: Array<{ url: string; authorization?: string; body?: Record<string, unknown> }> = [];
    const replacementFetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      const authorization = new Headers(init?.headers).get("authorization") ?? undefined;
      replacementRequests.push({ url, authorization, body });
      if (url === SHIPHERO_REFRESH_URL) {
        return new Response(JSON.stringify({
          access_token: "rotated-access-2",
          refresh_token: "rotated-refresh-2",
          expires_in: 3600,
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        data: { order_create: { order: { id: "remote-order-78" } } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    await createShipHeroOrder(draftInput, {
      environment: replacementEnvironment,
      fetcher: replacementFetcher,
    });
    expect(replacementRequests[0]).toMatchObject({
      url: SHIPHERO_REFRESH_URL,
      body: { refresh_token: "replacement-refresh" },
    });
    expect(replacementRequests[1]?.authorization).toBe("Bearer rotated-access-2");
  });
});