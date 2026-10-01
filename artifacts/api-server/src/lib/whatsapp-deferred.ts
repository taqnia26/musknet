import { backupWritePool } from "@workspace/db";
import { withBackupWriteFence } from "./backup-fence";

// Separate from the backup writer fence: this lock serializes FIFO replay between
// API replicas while the shared fence protects the business writes themselves.
const DEFERRED_INGRESS_LOCK = 764_211_906;
export const DEFERRED_WHATSAPP_BATCH_SIZE = 100;

export type DeferredWhatsappEventType =
  | "contacts.upsert"
  | "contacts.update"
  | "messaging-history.set"
  | "messages.upsert";

type QueryClient = {
  query<T extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  release(error?: Error | boolean): void;
};

/** Durable control-plane writes are allowed while backup maintenance is active. */
export async function enqueueDeferredWhatsappEvent(eventType: DeferredWhatsappEventType, payload: unknown) {
  const serialized = JSON.stringify(payload);
  if (serialized === undefined) throw new Error("WhatsApp ingress event was not serializable");
  await backupWritePool.query(
    "INSERT INTO backup_deferred_whatsapp (event_type, payload) VALUES ($1, $2::jsonb)",
    [eventType, serialized],
  );
}

/**
 * Replays durable ingress in FIFO order under both the shared backup writer
 * fence and a cross-replica advisory lock. Handlers must be idempotent because
 * a process can fail after its business writes and before marking the row done.
 */
export async function drainDeferredWhatsappEvents(
  handler: (eventType: DeferredWhatsappEventType, payload: unknown) => Promise<void>,
): Promise<number | undefined> {
  return withBackupWriteFence(async () => {
    const client = await backupWritePool.connect() as QueryClient;
    let locked = false;
    let destroy = false;
    let processed = 0;
    try {
      const lock = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [DEFERRED_INGRESS_LOCK],
      );
      locked = lock.rows[0]?.locked === true;
      if (!locked) return undefined;

      for (;;) {
        if (processed >= DEFERRED_WHATSAPP_BATCH_SIZE) break;
        const next = await client.query<{ id: number; event_type: DeferredWhatsappEventType; payload: unknown }>(
          "SELECT id, event_type, payload FROM backup_deferred_whatsapp WHERE processed_at IS NULL ORDER BY id LIMIT 1",
        );
        const row = next.rows[0];
        if (!row) break;
        try {
          await handler(row.event_type, row.payload);
          await client.query(
            "UPDATE backup_deferred_whatsapp SET processed_at = now(), error = NULL WHERE id = $1 AND processed_at IS NULL",
            [row.id],
          );
          processed++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await client.query(
            "UPDATE backup_deferred_whatsapp SET error = $2 WHERE id = $1 AND processed_at IS NULL",
            [row.id, message.slice(0, 1000)],
          );
          throw error;
        }
      }
      return processed;
    } finally {
      try {
        if (locked) await client.query("SELECT pg_advisory_unlock($1)", [DEFERRED_INGRESS_LOCK]);
      } catch {
        destroy = true;
      }
      client.release(destroy);
    }
  });
}