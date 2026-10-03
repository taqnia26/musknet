import { describe, expect, it } from "vitest";
import { createCustomerCartLink, resolveCustomerCartLink } from "./customer-cart-links";

const environment = { SESSION_SECRET: "isolated-cart-link-test-secret" };
const now = Date.UTC(2026, 9, 3);
const tokenOf = (path: string) => new URLSearchParams(path.split("#")[1]).get("link")!;

describe("customer cart pointers", () => {
  it("binds the link to a customer without exposing their identity in the URL", () => {
    const link = createCustomerCartLink(42, environment, now);
    expect(link.path).toMatch(/^\/cart\/open#link=v1\./);
    expect(resolveCustomerCartLink(tokenOf(link.path), environment, now)).toEqual({ customerId: 42, expiresAt: now + 7 * 24 * 60 * 60 * 1000 });
    expect(createCustomerCartLink(42, environment, now).path).not.toBe(link.path);
  });
  it("rejects tampering, a different signing environment, and expired links", () => {
    const token = tokenOf(createCustomerCartLink(42, environment, now).path);
    const parts = token.split(".");
    parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
    expect(() => resolveCustomerCartLink(parts.join("."), environment, now)).toThrow(/غير صالح/);
    expect(() => resolveCustomerCartLink(token, { SESSION_SECRET: "other-test-secret" }, now)).toThrow(/غير صالح/);
    expect(() => resolveCustomerCartLink(token, environment, now + 7 * 24 * 60 * 60 * 1000)).toThrow(/انتهت/);
  });
  it("fails explicitly without a configured secret and for malformed tokens or customer IDs", () => {
    expect(() => createCustomerCartLink(42, {}, now)).toThrow(/غير مكتمل/);
    expect(() => resolveCustomerCartLink("bad", environment, now)).toThrow(/غير صالح/);
    expect(() => createCustomerCartLink(-1, environment, now)).toThrow(/عميل غير صالح/);
  });
});