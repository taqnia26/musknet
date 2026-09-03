import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import * as Api from "@workspace/api-zod";
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import {
  db,
  ownerSessionNotificationsTable,
  ownerSessionsTable,
  ownerUsersTable,
} from "@workspace/db";
import {
  createOwnerSession,
  ensureOwnerSeeded,
  ownerSessionFromToken,
  publicOwner,
  revokeOwnerSession,
  verifyOwnerPassword,
} from "../lib/owner-auth";

const router: IRouter = Router();
const bearer = (req: Request) => {
  const header = req.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
};
const route = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };

router.use("/owner", async (req, res, next) => {
  try {
    await ensureOwnerSeeded();
    if (req.path === "/auth/login") { next(); return; }
     const authenticated = await ownerSessionFromToken(bearer(req));
     if (!authenticated) {
      res.status(401).json({ error: "Owner authentication required" });
      return;
    }
     res.locals.owner = authenticated.user;
     res.locals.ownerSession = authenticated.session;
    next();
  } catch (error) {
    next(error);
  }
});

router.post("/owner/auth/login", route(async (req, res) => {
  const body = Api.OwnerLoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [user] = await db.select().from(ownerUsersTable)
    .where(eq(ownerUsersTable.email, body.data.email.trim().toLowerCase())).limit(1);
  if (!user || !user.isActive || !(await verifyOwnerPassword(body.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const now = new Date();
  await db.update(ownerUsersTable).set({ lastLoginAt: now }).where(eq(ownerUsersTable.id, user.id));
  const created = await createOwnerSession(user.id, req.get("user-agent"));
  req.log.info({
    ownerUserId: user.id,
    sessionId: created.session.id,
    device: created.session.deviceLabel,
    browser: created.session.browser,
    operatingSystem: created.session.operatingSystem,
    notificationChannel: "in_app",
    notificationRecipients: created.notificationCount,
  }, "Owner session created and login alerts queued");
  res.json(Api.OwnerLoginResponse.parse({
    token: created.token,
    user: publicOwner({ ...user, lastLoginAt: now }),
    session: {
      id: created.session.id,
      deviceLabel: created.session.deviceLabel,
      browser: created.session.browser,
      operatingSystem: created.session.operatingSystem,
      expiresAt: created.session.expiresAt,
      createdAt: created.session.createdAt,
      isCurrent: true,
    },
  }));
}));

router.post("/owner/auth/logout", route(async (req, res) => {
  await revokeOwnerSession(bearer(req) ?? "");
  res.sendStatus(204);
}));

router.get("/owner/auth/me", route(async (_req, res) => {
  res.json(Api.GetOwnerMeResponse.parse(publicOwner(res.locals.owner)));
}));

router.get("/owner/sessions", route(async (_req, res) => {
  const owner = res.locals.owner as typeof ownerUsersTable.$inferSelect;
  const currentSession = res.locals.ownerSession as typeof ownerSessionsTable.$inferSelect;
  const sessions = await db.select({
    id: ownerSessionsTable.id,
    deviceLabel: ownerSessionsTable.deviceLabel,
    browser: ownerSessionsTable.browser,
    operatingSystem: ownerSessionsTable.operatingSystem,
    expiresAt: ownerSessionsTable.expiresAt,
    createdAt: ownerSessionsTable.createdAt,
  }).from(ownerSessionsTable)
    .where(and(eq(ownerSessionsTable.ownerUserId, owner.id), gt(ownerSessionsTable.expiresAt, new Date())))
    .orderBy(desc(ownerSessionsTable.createdAt));
  res.json(Api.ListOwnerSessionsResponse.parse(sessions.map((session) => ({
    ...session,
    isCurrent: session.id === currentSession.id,
  }))));
}));

router.delete("/owner/sessions/:id", route(async (req, res) => {
  const owner = res.locals.owner as typeof ownerUsersTable.$inferSelect;
  const sessionId = Number(req.params.id);
  if (!Number.isSafeInteger(sessionId) || sessionId < 1) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }
  const [deleted] = await db.delete(ownerSessionsTable)
    .where(and(eq(ownerSessionsTable.id, sessionId), eq(ownerSessionsTable.ownerUserId, owner.id)))
    .returning({ id: ownerSessionsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Owner session not found" });
    return;
  }
  res.sendStatus(204);
}));

router.post("/owner/sessions/revoke-others", route(async (_req, res) => {
  const owner = res.locals.owner as typeof ownerUsersTable.$inferSelect;
  const currentSession = res.locals.ownerSession as typeof ownerSessionsTable.$inferSelect;
  await db.delete(ownerSessionsTable).where(and(
    eq(ownerSessionsTable.ownerUserId, owner.id),
    ne(ownerSessionsTable.id, currentSession.id),
  ));
  res.sendStatus(204);
}));

router.get("/owner/session-notifications", route(async (_req, res) => {
  const owner = res.locals.owner as typeof ownerUsersTable.$inferSelect;
  const currentSession = res.locals.ownerSession as typeof ownerSessionsTable.$inferSelect;
  const notifications = await db.select({
    id: ownerSessionNotificationsTable.id,
    newSessionId: ownerSessionNotificationsTable.newSessionId,
    deviceLabel: ownerSessionNotificationsTable.deviceLabel,
    browser: ownerSessionNotificationsTable.browser,
    operatingSystem: ownerSessionNotificationsTable.operatingSystem,
    sessionCreatedAt: ownerSessionNotificationsTable.sessionCreatedAt,
    createdAt: ownerSessionNotificationsTable.createdAt,
  }).from(ownerSessionNotificationsTable)
    .where(and(
      eq(ownerSessionNotificationsTable.ownerUserId, owner.id),
      eq(ownerSessionNotificationsTable.recipientSessionId, currentSession.id),
      isNull(ownerSessionNotificationsTable.readAt),
    ))
    .orderBy(desc(ownerSessionNotificationsTable.createdAt));
  res.json(Api.ListOwnerSessionNotificationsResponse.parse(notifications));
}));

router.post("/owner/session-notifications/:id/read", route(async (req, res) => {
  const owner = res.locals.owner as typeof ownerUsersTable.$inferSelect;
  const currentSession = res.locals.ownerSession as typeof ownerSessionsTable.$inferSelect;
  const notificationId = Number(req.params.id);
  if (!Number.isSafeInteger(notificationId) || notificationId < 1) {
    res.status(400).json({ error: "Invalid notification id" });
    return;
  }
  const [updated] = await db.update(ownerSessionNotificationsTable)
    .set({ readAt: new Date() })
    .where(and(
      eq(ownerSessionNotificationsTable.id, notificationId),
      eq(ownerSessionNotificationsTable.ownerUserId, owner.id),
      eq(ownerSessionNotificationsTable.recipientSessionId, currentSession.id),
      isNull(ownerSessionNotificationsTable.readAt),
    ))
    .returning({ id: ownerSessionNotificationsTable.id });
  if (!updated) {
    res.status(404).json({ error: "Owner session notification not found" });
    return;
  }
  res.sendStatus(204);
}));

export default router;