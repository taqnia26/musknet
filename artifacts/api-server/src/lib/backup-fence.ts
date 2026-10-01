import { backupWritePool } from "@workspace/db";
import { getMaintenanceState } from "./backup-control";

const WRITE_FENCE = 764_211_904;

/** Separate connections keep admission locks from starving business queries. */
export async function acquireBackupWriteFence(): Promise<(() => Promise<void>) | null> {
  const client = await backupWritePool.connect();
  let locked = false;
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock_shared($1) AS locked", [WRITE_FENCE],
    );
    locked = result.rows[0]?.locked === true;
    if (!locked || (await getMaintenanceState()).maintenance) {
      if (locked) await client.query("SELECT pg_advisory_unlock_shared($1)", [WRITE_FENCE]);
      client.release();
      return null;
    }
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      try {
        await client.query("SELECT pg_advisory_unlock_shared($1)", [WRITE_FENCE]);
        client.release();
      } catch { client.release(true); }
    };
  } catch (error) {
    // Destroy rather than pooling a connection that might still own a lock.
    client.release(true);
    throw error;
  }
}

export async function withBackupWriteFence<T>(handler: () => Promise<T>): Promise<T | undefined> {
  const release = await acquireBackupWriteFence();
  if (!release) return undefined;
  try { return await handler(); } finally { await release(); }
}

/** The worker enables maintenance first, then drains all admitted writers. */
export async function withExclusiveBackupFence<T>(handler: () => Promise<T>): Promise<T> {
  const client = await backupWritePool.connect();
  let locked = false;
  let destroy = false;
  try {
    await client.query("SET statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_lock($1)", [WRITE_FENCE]);
    locked = true;
    await client.query("SET statement_timeout = 0");
    return await handler();
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock($1)", [WRITE_FENCE]);
      await client.query("RESET statement_timeout");
    } catch { destroy = true; }
    client.release(destroy);
  }
}