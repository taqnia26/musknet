import { Router, type Request } from "express";
import { adminFromToken, ensureAdminSeeded, publicAdmin } from "../lib/admin-auth";
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
const permit = (action: "view" | "edit") => async (_req: Request, res: any, next: any) => {
  try {
    const admin = await publicAdmin(res.locals.admin);
    if (!admin.isSuperAdmin && !admin.permissions.includes(`customer-service:${action}`)) {
      res.status(403).json({ error: "Insufficient permission" });
      return;
    }
    next();
  } catch (error) { next(error); }
};

router.get("/admin/whatsapp/status", permit("view"), async (_req, res, next) => {
  try { await whatsappManager.restore(); res.json(whatsappManager.state()); } catch (error) { next(error); }
});
router.post("/admin/whatsapp/connect", permit("edit"), async (_req, res, next) => {
  try { await whatsappManager.start(true); res.json(whatsappManager.state()); } catch (error) { next(error); }
});
router.post("/admin/whatsapp/disconnect", permit("edit"), async (_req, res, next) => {
  try { await whatsappManager.logout(); res.json(whatsappManager.state()); } catch (error) { next(error); }
});
router.get("/admin/whatsapp/chats", permit("view"), async (_req, res, next) => {
  try { res.json(await listWhatsappChats()); } catch (error) { next(error); }
});
router.get("/admin/whatsapp/chats/:jid/messages", permit("view"), async (req, res, next) => {
  try {
    const jid = Array.isArray(req.params.jid) ? req.params.jid[0] : req.params.jid;
    res.json(await listWhatsappMessages(jid));
  } catch (error) { next(error); }
});
router.post("/admin/whatsapp/chats/:jid/messages", permit("edit"), async (req, res, next) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > 4096) { res.status(400).json({ error: "Message text is required" }); return; }
    const jid = Array.isArray(req.params.jid) ? req.params.jid[0] : req.params.jid;
    res.json({ id: await whatsappManager.send(jid, text) });
  } catch (error) { next(error); }
});

export default router;