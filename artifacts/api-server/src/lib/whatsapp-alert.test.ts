import { afterEach, describe, expect, it, vi } from "vitest";
import { sendWhatsappDisconnectAlert } from "./whatsapp-alert";

describe("WhatsApp outage email", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends only fixed instructions to the configured administrator", async () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("INVOICE_FROM_EMAIL", "Alerts <alerts@example.com>");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await sendWhatsappDisconnectAlert();

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(options.body as string);
    expect(body.to).toEqual(["admin@example.com"]);
    expect(body.subject).toContain("واتساب");
    expect(body.html).toContain("إعادة ربط");
    expect(JSON.stringify(body)).not.toContain("test-key");
    expect(body).not.toHaveProperty("attachments");
  });
});