import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const lifetimeMs = 7 * 24 * 60 * 60 * 1000;
const purpose = "musk-ellolo:customer-cart:v1";

export class CustomerCartLinkError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}

function key(environment: NodeJS.ProcessEnv) {
  if (!environment.SESSION_SECRET) throw new CustomerCartLinkError("إعداد رابط السلة غير مكتمل", 503);
  return createHash("sha256").update(`${purpose}:${environment.SESSION_SECRET}`).digest();
}

export function createCustomerCartLink(customerId: number, environment: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  if (!Number.isSafeInteger(customerId) || customerId < 1) throw new CustomerCartLinkError("عميل غير صالح");
  const expiresAt = now + lifetimeMs;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(environment), iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ customerId, expiresAt }), "utf8"), cipher.final()]);
  const token = ["v1", iv.toString("base64url"), encrypted.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
  return { path: `/cart/open#link=${token}`, expiresAt: new Date(expiresAt).toISOString() };
}

export function resolveCustomerCartLink(token: string, environment: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  const encryptionKey = key(environment);
  if (token.length > 512 || !/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/.test(token))
    throw new CustomerCartLinkError("رابط السلة غير صالح");
  let claims: { customerId: number; expiresAt: number };
  try {
    const [, ivText, encryptedText, tagText] = token.split(".");
    const iv = Buffer.from(ivText, "base64url");
    const tag = Buffer.from(tagText, "base64url");
    if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encryption framing");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(tag);
    claims = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8"));
    if (!Number.isSafeInteger(claims.customerId) || claims.customerId < 1 || !Number.isSafeInteger(claims.expiresAt))
      throw new Error("Invalid claims");
  } catch {
    throw new CustomerCartLinkError("رابط السلة غير صالح");
  }
  if (claims.expiresAt <= now) throw new CustomerCartLinkError("انتهت صلاحية رابط السلة؛ اطلب رابطاً جديداً من المتجر", 410);
  return claims;
}