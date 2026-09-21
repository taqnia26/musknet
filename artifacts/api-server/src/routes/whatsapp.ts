import { Router, type Request } from "express";
import { adminFromToken, ensureAdminSeeded } from "../lib/admin-auth";
import { listWhatsappChats, listWhatsappMessages, whatsappManager } from "../lib/whatsapp";

const router = Router();
const bearer = (req: Request) => {
  const value = req.headers.authorization;
  return value?.startsWith("Bearer ") ? value.slice(7) : undefined;
};
router.use("/admin/whatsapp", async (req, res, next) => {
  try {
    await ensureAdminSeeded();
    const user = await adminFromToken(bearer(req));
    if (!user) { res.status(401).json({ error: "Admin authentication required" }); return; }
    res.locals.admin = user;
    next();
  } catch (error) { next(error); }
});
const superOnly = (_req: Request, res: any, next: any) => {
  if (!res.locals.admin?.isSuperAdmin) { res.status(403).json({ error: "Super administrator access required" }); return; }
  next();
};

router.get("/admin/whatsapp/status", async (_req, res, next) => {
  try { await whatsappManager.restore(); res.json(whatsappManager.state()); } catch (error) { next(error); }
});
router.post("/admin/whatsapp/connect", superOnly, async (_req, res, next) => {
  try { await whatsappManager.start(true); res.json(whatsappManager.state()); } catch (error) { next(error); }
});
router.post("/admin/whatsapp/disconnect", superOnly, async (_req, res, next) => {
  try { await whatsappManager.logout(); res.json(whatsappManager.state()); } catch (error) { next(error); }
});
router.get("/admin/whatsapp/chats", async (_req, res, next) => {
  try { res.json(await listWhatsappChats()); } catch (error) { next(error); }
});
router.get("/admin/whatsapp/chats/:jid/messages", async (req, res, next) => {
  try { res.json(await listWhatsappMessages(req.params.jid)); } catch (error) { next(error); }
});
router.post("/admin/whatsapp/chats/:jid/messages", async (req, res, next) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > 4096) { res.status(400).json({ error: "Message text is required" }); return; }
    res.json({ id: await whatsappManager.send(req.params.jid, text) });
  } catch (error) { next(error); }
});

export default router;