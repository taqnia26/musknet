import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import * as Api from "@workspace/api-zod";
import { db, ownerUsersTable } from "@workspace/db";
import {
  createOwnerSession,
  ensureOwnerSeeded,
  ownerFromToken,
  publicOwner,
  revokeOwnerSession,
  verifyOwnerPassword,
} from "../lib/owner-auth";
import { eq } from "drizzle-orm";

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
    const user = await ownerFromToken(bearer(req));
    if (!user) {
      res.status(401).json({ error: "Owner authentication required" });
      return;
    }
    res.locals.owner = user;
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
  const token = await createOwnerSession(user.id);
  res.json(Api.OwnerLoginResponse.parse({ token, user: publicOwner({ ...user, lastLoginAt: now }) }));
}));

router.post("/owner/auth/logout", route(async (req, res) => {
  await revokeOwnerSession(bearer(req) ?? "");
  res.sendStatus(204);
}));

router.get("/owner/auth/me", route(async (_req, res) => {
  res.json(Api.GetOwnerMeResponse.parse(publicOwner(res.locals.owner)));
}));

export default router;