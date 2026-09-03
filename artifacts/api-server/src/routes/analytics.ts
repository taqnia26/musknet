import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import * as Api from "@workspace/api-zod";
import { db, pageViewsTable } from "@workspace/db";

const router: IRouter = Router();

const route = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };

function trafficSource(referrer?: string | null) {
  if (!referrer) return "direct";

  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (/(^|\.)google\.|(^|\.)bing\.|(^|\.)yahoo\.|(^|\.)duckduckgo\./.test(host)) return "search";
    if (/(^|\.)facebook\.|(^|\.)instagram\.|(^|\.)tiktok\.|(^|\.)x\.com$|(^|\.)twitter\./.test(host)) return "social";
    return "referral";
  } catch {
    return "referral";
  }
}

router.post("/analytics/page-view", route(async (req, res) => {
  const parsed = Api.TrackPageViewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { sessionId, path, referrer } = parsed.data;
  await db.insert(pageViewsTable).values({
    sessionKey: sessionId,
    path,
    referrer: referrer || null,
    source: trafficSource(referrer),
  });
  res.sendStatus(204);
}));

export default router;