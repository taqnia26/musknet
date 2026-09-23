import { ReplitConnectors } from "@replit/connectors-sdk";

/** Only fixed copy is sent: never include a QR, session credentials, or provider error. */
export async function sendWhatsappDisconnectAlert() {
  const recipient = process.env.ADMIN_EMAIL?.trim();
  if (!recipient) throw new Error("ADMIN_EMAIL is required for WhatsApp connection alerts");
  const body = {
    from: process.env.INVOICE_FROM_EMAIL?.trim() || "Musk Ellolo <onboarding@resend.dev>",
    to: [recipient],
    subject: "تنبيه: انقطع اتصال واتساب الإدارة",
    html: '<div dir="rtl" style="font-family:Arial,sans-serif"><h2>انقطع اتصال واتساب الإدارة</h2><p>لم يعد اتصال واتساب تلقائيًا بعد فترة انتظار. قد يلزم إعادة ربط الجهاز من إعدادات واتساب في لوحة الإدارة لاستئناف رسائل العملاء.</p></div>',
  };
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const response = apiKey
    ? await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    : await new ReplitConnectors().proxy("resend", "/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
  if (!response.ok) throw new Error(`WhatsApp alert provider returned ${response.status}`);
}