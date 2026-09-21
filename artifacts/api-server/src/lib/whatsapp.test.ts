import { describe, expect, it } from "vitest";
import { decryptWhatsappState, encryptWhatsappState, whatsappText } from "./whatsapp";

describe("WhatsApp session helpers", () => {
  it("encrypts and decrypts state without exposing plaintext", () => {
    const encoded = encryptWhatsappState(JSON.stringify({ token: "private", nested: [1, 2] }), "test-session-secret");
    expect(encoded).not.toContain("private");
    expect(decryptWhatsappState(encoded, "test-session-secret")).toContain("private");
    expect(() => decryptWhatsappState(encoded, "wrong-secret")).toThrow();
  });

  it("extracts useful text labels from messages", () => {
    expect(whatsappText({ conversation: "hello" })).toBe("hello");
    expect(whatsappText({ extendedTextMessage: { text: "reply" } })).toBe("reply");
    expect(whatsappText({ imageMessage: {} })).toBe("📷 صورة");
  });
});