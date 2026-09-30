import express, { Router, type IRouter } from "express";
import {
  SHIPHERO_WEBHOOK_BODY_LIMIT,
  SHIPHERO_WEBHOOK_MESSAGE_ID_HEADER,
  SHIPHERO_WEBHOOK_SIGNATURE_HEADER,
  createShipHeroWebhookSignature,
  isValidShipHeroWebhookSignature,
  persistShipHeroWebhookEvent,
  processShipHeroWebhookQueue,
  type ShipHeroWebhookEventInput,
} from "../lib/shiphero-webhooks";
import { redactShipHeroPayload } from "../lib/shiphero-config";

type ShipHeroWebhookRouterDependencies = {
  getSecret?: () => string | undefined;
  verifySignature?: typeof isValidShipHeroWebhookSignature;
  persistEvent?: (input: ShipHeroWebhookEventInput) => Promise<boolean>;
  processQueue?: () => Promise<unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function eventTypeFrom(payload: Record<string, unknown>) {
  const generic = typeof payload.type === "string" ? payload.type.trim() : "";
  const official = typeof payload.webhook_type === "string" ? payload.webhook_type.trim() : "";
  return generic || official || "unknown";
}

export function createShipHeroWebhookRouter(dependencies: ShipHeroWebhookRouterDependencies = {}): IRouter {
  const router: IRouter = Router();
  const getSecret = dependencies.getSecret ?? (() => process.env.SHIPHERO_WEBHOOK_SECRET);
  const verifySignature = dependencies.verifySignature ?? isValidShipHeroWebhookSignature;
  const persistEvent = dependencies.persistEvent ?? persistShipHeroWebhookEvent;
  const processQueue = dependencies.processQueue ?? processShipHeroWebhookQueue;

  router.head("/", (req, res) => {
    const secret = getSecret();
    if (!secret?.trim()) { res.status(503).end(); return; }
    const signature = req.get(SHIPHERO_WEBHOOK_SIGNATURE_HEADER);
    res.status(signature && verifySignature(Buffer.alloc(0), secret, signature) ? 200 : 401).end();
  });
  router.post(
    "/",
    express.raw({ type: "application/json", inflate: false, limit: SHIPHERO_WEBHOOK_BODY_LIMIT }),
    async (req, res) => {
      const secret = getSecret();
      if (!secret?.trim()) {
        res.status(503).json({ error: "Webhook receiver is not configured." });
        return;
      }
      const messageId = req.get(SHIPHERO_WEBHOOK_MESSAGE_ID_HEADER);
      if (!messageId || !messageId.trim() || messageId !== messageId.trim() ||
          messageId.length > 255 || /[\u0000-\u001f\u007f]/.test(messageId)) {
        res.status(400).json({ error: "A valid ShipHero message ID is required." });
        return;
      }
      const signature = req.get(SHIPHERO_WEBHOOK_SIGNATURE_HEADER);
      if (!signature) {
        res.status(401).json({ error: "Invalid webhook signature." });
        return;
      }
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: "Expected an application/json request body." });
        return;
      }
      if (!verifySignature(req.body, secret, signature)) {
        res.status(401).json({ error: "Invalid webhook signature." });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(req.body.toString("utf8"));
      } catch {
        res.status(400).json({ error: "Invalid JSON body." });
        return;
      }
      if (!isRecord(parsed)) {
        res.status(400).json({ error: "Webhook JSON body must be an object." });
        return;
      }

      try {
        const saved = await persistEvent({
          messageId,
          eventType: eventTypeFrom(parsed),
          payload: redactShipHeroPayload(parsed),
        });
        if (saved) {
          // The durable insert is complete before work is handed to the queue.
          setImmediate(() => {
            void processQueue().catch(() => undefined);
          });
        }
        res.status(200).json({ code: "200", Status: "Success" });
      } catch {
        res.status(500).json({ error: "Unable to accept webhook event." });
      }
    },
  );
  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = isRecord(error) && typeof error.status === "number" &&
      (error.status === 413 || error.status === 415) ? error.status : 400;
    res.status(status).json({
      error: status === 413
        ? "Webhook body exceeds the 256 KB limit."
        : status === 415
          ? "Compressed webhook bodies are not accepted."
          : "Unable to read webhook request.",
    });
  });
  return router;
}

export const signShipHeroWebhook = createShipHeroWebhookSignature;
const router = createShipHeroWebhookRouter();
export default router;