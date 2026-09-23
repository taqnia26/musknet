import { expect, test } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import {
  adminPermissionsTable, adminSessionsTable, adminUserPermissionsTable, adminUsersTable,
  db, whatsappChatsTable, whatsappMessagesTable,
} from "@workspace/db";
import { createAdminSession, hashAdminPassword } from "../../artifacts/api-server/src/lib/admin-auth";

const suffix = Date.now();
const jid = `96650${String(suffix % 100_000_000).padStart(8, "0")}@s.whatsapp.net`;
const lid = `${suffix}@lid`;
const chatJids = [jid, lid];
let adminId: number;
let viewerId: number;
let token: string;
let viewerToken: string;

test.beforeAll(async () => {
  await db.insert(adminPermissionsTable).values(["view", "edit"].map((action) => ({ module: "customer-service", action }))).onConflictDoNothing();
  const [editor, viewer] = await db.insert(adminUsersTable).values([
    { name: "Inbox editor", email: `inbox-editor-${suffix}@example.com`, passwordHash: await hashAdminPassword("inbox-test") },
    { name: "Inbox viewer", email: `inbox-viewer-${suffix}@example.com`, passwordHash: await hashAdminPassword("inbox-test") },
  ]).returning();
  adminId = editor.id;
  viewerId = viewer.id;
  const permissions = await db.select().from(adminPermissionsTable).where(eq(adminPermissionsTable.module, "customer-service"));
  await db.insert(adminUserPermissionsTable).values(permissions.filter((p) => ["view", "edit"].includes(p.action))
    .map((permission) => ({ adminUserId: editor.id, permissionId: permission.id })));
  await db.insert(adminUserPermissionsTable).values({
    adminUserId: viewer.id, permissionId: permissions.find((p) => p.action === "view")!.id,
  });
  token = await createAdminSession(editor.id);
  viewerToken = await createAdminSession(viewer.id);
  await db.insert(whatsappChatsTable).values([
    { jid, phone: jid.split("@")[0], name: "WhatsApp contact", lastMessage: "Hello from WhatsApp", lastMessageAt: new Date(), unread: 2 },
    { jid: lid, phone: "", name: "", lastMessage: "Unknown sender", lastMessageAt: new Date(Date.now() - 60000), unread: 1 },
  ]);
  await db.insert(whatsappMessagesTable).values([
    { id: `inbox-${suffix}-1`, chatJid: jid, text: "Hello from WhatsApp", fromMe: false, timestamp: new Date(Date.now() - 60000) },
    { id: `inbox-${suffix}-2`, chatJid: jid, text: "How can we help?", fromMe: true, timestamp: new Date() },
  ]);
});

test.afterAll(async () => {
  await db.delete(whatsappMessagesTable).where(inArray(whatsappMessagesTable.chatJid, chatJids));
  await db.delete(whatsappChatsTable).where(inArray(whatsappChatsTable.jid, chatJids));
  for (const id of [adminId, viewerId].filter(Boolean)) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, id));
    await db.delete(adminUserPermissionsTable).where(eq(adminUserPermissionsTable.adminUserId, id));
    await db.delete(adminUsersTable).where(eq(adminUsersTable.id, id));
  }
});

for (const size of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`inbox navigation, labels, refresh, sending, errors and permissions on ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.addInitScript(({ token }) => {
      localStorage.setItem("musk-ellolo-admin-token", token);
      localStorage.setItem("musk-admin-tour-v1", "completed");
    }, { token });
    await page.route("**/api/admin/whatsapp/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ status: "connected", connected: true }),
    }));
    let sent: string | null = null;
    let failSend = false;
    await page.route(`**/api/admin/whatsapp/chats/${encodeURIComponent(jid)}/messages`, async (route) => {
      if (route.request().method() === "POST") {
        if (failSend) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Test connection unavailable" }) });
        sent = route.request().postDataJSON().text;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: `test-sent-${suffix}` }) });
      }
      const response = await route.fetch();
      const messages = await response.json();
      if (sent) messages.push({ id: `test-sent-${suffix}`, chatJid: jid, text: sent, fromMe: true, timestamp: new Date().toISOString(), status: "sent" });
      await route.fulfill({ response, json: messages });
    });
    await page.goto("/admin/whatsapp/inbox");
    const skipTour = page.getByRole("button", { name: /تخطي|Skip/ });
    await expect(skipTour).toBeVisible();
    await skipTour.click();
    await page.goto("/admin/whatsapp/inbox");
    await expect(page.getByTestId(`whatsapp-chat-${jid}`)).toBeVisible();
    await expect(page.getByTestId(`whatsapp-chat-${lid}`)).not.toContainText(lid);
    await page.screenshot({ path: `test-results/whatsapp-inbox-${size.name}.png` });
    await page.getByTestId(`whatsapp-chat-${jid}`).click();
    await expect(page.getByTestId("whatsapp-message-panel")).toContainText("Hello from WhatsApp");
    await page.waitForTimeout(4300);
    await expect(page.getByTestId("whatsapp-message-panel")).toContainText("How can we help?");
    await page.getByTestId("whatsapp-edit-name").click();
    await page.getByTestId("whatsapp-contact-name").fill("Service customer");
    const failRename = (route: import("@playwright/test").Route) => route.fulfill({
      status: 503, contentType: "application/json", body: JSON.stringify({ error: "Save temporarily unavailable" }),
    });
    await page.route(`**/api/admin/whatsapp/chats/${encodeURIComponent(jid)}`, failRename);
    await page.getByRole("button", { name: /حفظ التغييرات|Save changes/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Save temporarily unavailable", { exact: true })).toBeVisible();
    await page.unroute(`**/api/admin/whatsapp/chats/${encodeURIComponent(jid)}`, failRename);
    await page.getByRole("button", { name: /حفظ التغييرات|Save changes/ }).click();
    await expect(page.getByTestId("whatsapp-message-panel")).toContainText("Service customer");
    await page.reload();
    await expect(page.getByTestId(`whatsapp-chat-${jid}`)).toContainText("Service customer");
    await page.getByPlaceholder(/ابحث عن محادثة|Search conversations/).fill("Service customer");
    await expect(page.getByTestId(`whatsapp-chat-${lid}`)).toHaveCount(0);
    await page.getByTestId(`whatsapp-chat-${jid}`).click();
    await page.getByTestId("whatsapp-message-input").fill("Test outgoing message");
    await page.getByTestId("whatsapp-send-message").click();
    await expect(page.getByTestId("whatsapp-message-panel")).toContainText("Test outgoing message");
    failSend = true;
    await page.getByTestId("whatsapp-message-input").fill("Unsent draft");
    await page.getByTestId("whatsapp-send-message").click();
    await expect(page.getByTestId("whatsapp-message-input")).toHaveValue("Unsent draft");
    await page.screenshot({ path: `test-results/whatsapp-inbox-conversation-${size.name}.png` });
    if (size.name === "mobile") await page.getByRole("button", { name: /العودة للمحادثات|Back to conversations/ }).click();
    await page.getByPlaceholder(/ابحث عن محادثة|Search conversations/).fill("");
    await page.route(`**/api/admin/whatsapp/chats/${encodeURIComponent(lid)}/messages`, (route) => route.fulfill({
      status: 503, contentType: "application/json", body: JSON.stringify({ error: "Messages temporarily unavailable" }),
    }));
    await page.getByTestId(`whatsapp-chat-${lid}`).click();
    await expect(page.getByTestId("whatsapp-message-panel")).toContainText("Messages temporarily unavailable");
    await page.addInitScript(({ token }) => localStorage.setItem("musk-ellolo-admin-token", token), { token: viewerToken });
    await page.reload();
    await page.getByTestId(`whatsapp-chat-${jid}`).click();
    await expect(page.getByTestId("whatsapp-edit-name")).toHaveCount(0);
    await expect(page.getByTestId("whatsapp-message-input")).toBeDisabled();
  });
}