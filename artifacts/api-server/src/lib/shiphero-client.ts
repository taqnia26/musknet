import {
  ShipHeroError,
  assertShipHeroSendingConfigured,
} from "./shiphero-config";

export const SHIPHERO_GRAPHQL_URL = "https://public-api.shiphero.com/graphql";
export const SHIPHERO_REFRESH_URL = "https://public-api.shiphero.com/auth/refresh";

export type ShipHeroOrderInput = {
  order_number: string;
  partner_order_id: string;
  customer_account_id: string;
  shipping_address: {
    first_name: string;
    last_name?: string;
    phone: string;
    address1: string;
    address2: string;
    city: string;
    zip: string;
    country: string;
  };
  line_items: Array<{
    sku: string;
    product_name: string;
    partner_line_item_id: string;
    quantity: number;
    price: string;
    warehouse_id: string;
  }>;
  shipping_lines: { title: string; price: string; method: string };
  currency: "SAR";
};

export type ShipHeroProductInput = {
  customer_account_id: string;
  name: string;
  sku: string;
  // CreateProductInput requires this list. No initial inventory is inferred or synced.
  warehouse_products: [];
};

// The partner has not supplied its Create Order example. Keep the API draft aligned
// with ShipHero's CreateOrderInput schema; the partner release gate still prevents use.
const CREATE_ORDER_MUTATION = `
  mutation ShipHeroCreateOrder($data: CreateOrderInput!) {
    order_create(data: $data) {
      order { id }
    }
  }
`;

// TODO: Confirm the partner warehouse mapping before any product_create call.
const CREATE_PRODUCT_MUTATION = `
  mutation ShipHeroCreateProduct($data: CreateProductInput!) {
    product_create(data: $data) {
      product { id }
    }
  }
`;

export class ShipHeroClientError extends ShipHeroError {
  constructor(message: string, public readonly ambiguous: boolean) {
    super(502, message);
    this.name = "ShipHeroClientError";
  }
}

type TokenCache = {
  accessToken: string;
  expiresAt: number;
  environmentAccessToken: string;
  environmentRefreshToken: string;
};

type RotatedRefreshToken = {
  value: string;
  environmentAccessToken: string;
  environmentRefreshToken: string;
};

let tokenCache: TokenCache | undefined;
let rotatedRefreshToken: RotatedRefreshToken | undefined;

type FetchLike = typeof fetch;
type GraphqlEnvelope = {
  data?: Record<string, unknown>;
  errors?: unknown[];
};

function cleanError(error: unknown, environment: NodeJS.ProcessEnv): string {
  let message = error instanceof Error ? error.message : "ShipHero request failed";
  for (const key of [
    "SHIPHERO_ACCESS_TOKEN",
    "SHIPHERO_REFRESH_TOKEN",
    "SHIPHERO_MERCHANT_ID",
    "SHIPHERO_WAREHOUSE_ID",
    "SHIPHERO_WEBHOOK_SECRET",
  ]) {
    const secret = environment[key];
    if (secret) message = message.split(secret).join("[environment value]");
  }
  return message;
}

function expirationFrom(value: unknown): number {
  const seconds = typeof value === "number" && value > 0 ? value : 3_300;
  return Date.now() + seconds * 1_000;
}

function currentCredentialInputs(environment: NodeJS.ProcessEnv) {
  return {
    environmentAccessToken: environment.SHIPHERO_ACCESS_TOKEN?.trim() ?? "",
    environmentRefreshToken: environment.SHIPHERO_REFRESH_TOKEN?.trim() ?? "",
  };
}

function invalidateCacheForChangedCredentials(environment: NodeJS.ProcessEnv): void {
  const current = currentCredentialInputs(environment);
  if (tokenCache && (
    tokenCache.environmentAccessToken !== current.environmentAccessToken
    || tokenCache.environmentRefreshToken !== current.environmentRefreshToken
  )) {
    tokenCache = undefined;
  }
  if (rotatedRefreshToken && (
    rotatedRefreshToken.environmentAccessToken !== current.environmentAccessToken
    || rotatedRefreshToken.environmentRefreshToken !== current.environmentRefreshToken
  )) {
    rotatedRefreshToken = undefined;
  }
}

async function refreshAccessToken(
  environment: NodeJS.ProcessEnv,
  fetcher: FetchLike,
): Promise<string> {
  invalidateCacheForChangedCredentials(environment);
  const credentials = currentCredentialInputs(environment);
  const refreshToken = rotatedRefreshToken?.value ?? credentials.environmentRefreshToken;
  if (!refreshToken) {
    throw new ShipHeroClientError("ShipHero refresh credentials are unavailable", false);
  }

  let response: Response;
  try {
    response = await fetcher(SHIPHERO_REFRESH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ShipHeroClientError("ShipHero token refresh request failed", true);
  }
  if (!response.ok) {
    throw new ShipHeroClientError(`ShipHero token refresh returned HTTP ${response.status}`, response.status >= 500 || response.status === 408);
  }

  let body: Record<string, unknown>;
  try {
    body = await response.json() as Record<string, unknown>;
  } catch {
    throw new ShipHeroClientError("ShipHero token refresh returned an invalid response", true);
  }
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new ShipHeroClientError("ShipHero token refresh response omitted an access token", true);
  }
  if (typeof body.refresh_token === "string" && body.refresh_token) {
    rotatedRefreshToken = { value: body.refresh_token, ...credentials };
  }
  tokenCache = {
    accessToken: body.access_token,
    expiresAt: expirationFrom(body.expires_in),
    ...credentials,
  };
  return tokenCache.accessToken;
}

async function getAccessToken(
  environment: NodeJS.ProcessEnv,
  fetcher: FetchLike,
): Promise<string> {
  invalidateCacheForChangedCredentials(environment);
  if (tokenCache && tokenCache.expiresAt > Date.now() + 5_000) {
    return tokenCache.accessToken;
  }
  const environmentToken = environment.SHIPHERO_ACCESS_TOKEN?.trim();
  if (environmentToken) return environmentToken;
  return refreshAccessToken(environment, fetcher);
}

function extractRemoteId(envelope: GraphqlEnvelope, operation: string): string | null {
  const root = envelope.data?.[operation];
  if (!root || typeof root !== "object") return null;
  const entity = (root as Record<string, unknown>)[operation === "order_create" ? "order" : "product"];
  if (!entity || typeof entity !== "object") return null;
  const id = (entity as Record<string, unknown>).id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

async function graphql(
  operation: "order_create" | "product_create",
  query: string,
  input: unknown,
  environment: NodeJS.ProcessEnv,
  fetcher: FetchLike,
): Promise<string> {
  // This gate is deliberately independent of credentials or saved settings.
  assertShipHeroSendingConfigured(environment);
  invalidateCacheForChangedCredentials(environment);
  let accessToken = await getAccessToken(environment, fetcher);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(SHIPHERO_GRAPHQL_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, variables: { data: input } }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ShipHeroClientError("ShipHero GraphQL request failed", true);
    }

    if (response.status === 401 && attempt === 0
      && (environment.SHIPHERO_REFRESH_TOKEN?.trim() || rotatedRefreshToken)) {
      tokenCache = undefined;
      accessToken = await refreshAccessToken(environment, fetcher);
      continue;
    }
    if (!response.ok) {
      const ambiguous = response.status >= 500 || response.status === 408 || response.status === 429;
      throw new ShipHeroClientError(`ShipHero GraphQL returned HTTP ${response.status}`, ambiguous);
    }

    let envelope: GraphqlEnvelope;
    try {
      envelope = await response.json() as GraphqlEnvelope;
    } catch {
      throw new ShipHeroClientError("ShipHero GraphQL returned an invalid response", true);
    }
    if (envelope.errors?.length) {
      throw new ShipHeroClientError("ShipHero GraphQL rejected the outbound operation", true);
    }
    const remoteId = extractRemoteId(envelope, operation);
    if (!remoteId) {
      throw new ShipHeroClientError("ShipHero response omitted the remote identifier", true);
    }
    return remoteId;
  }
  throw new ShipHeroClientError("ShipHero authorization could not be refreshed", true);
}

export async function createShipHeroOrder(
  input: ShipHeroOrderInput,
  options: { environment?: NodeJS.ProcessEnv; fetcher?: FetchLike } = {},
): Promise<{ remoteOrderId: string }> {
  const environment = options.environment ?? process.env;
  try {
    return {
      remoteOrderId: await graphql(
        "order_create",
        CREATE_ORDER_MUTATION,
        input,
        environment,
        options.fetcher ?? fetch,
      ),
    };
  } catch (error) {
    if (error instanceof ShipHeroError) throw error;
    throw new ShipHeroClientError(cleanError(error, environment), true);
  }
}

// This future operation is only used for explicitly confirmed, newly added products.
// Existing catalog items must never be re-registered with ShipHero.
export async function createShipHeroProduct(
  input: ShipHeroProductInput,
  options: { environment?: NodeJS.ProcessEnv; fetcher?: FetchLike } = {},
): Promise<{ remoteProductId: string }> {
  const environment = options.environment ?? process.env;
  try {
    return {
      remoteProductId: await graphql(
        "product_create",
        CREATE_PRODUCT_MUTATION,
        input,
        environment,
        options.fetcher ?? fetch,
      ),
    };
  } catch (error) {
    if (error instanceof ShipHeroError) throw error;
    throw new ShipHeroClientError(cleanError(error, environment), true);
  }
}