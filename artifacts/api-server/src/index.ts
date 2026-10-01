import app from "./app";
import { logger } from "./lib/logger";
import { whatsappManager } from "./lib/whatsapp";
import { getShipHeroSettings } from "./lib/shiphero-config";
import { startShipHeroOutboundWorker } from "./lib/shiphero-outbound";
import { startShipHeroWebhookWorker } from "./lib/shiphero-webhooks";
import { startBackupWorker } from "./lib/backup-control";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startBackupWorker();
  void whatsappManager.restore().catch(() => logger.warn("Could not restore WhatsApp connection"));
  void getShipHeroSettings().then(() => {
    startShipHeroOutboundWorker();
    startShipHeroWebhookWorker();
  }).catch(() => logger.error("Could not initialize ShipHero integration tables"));
});
