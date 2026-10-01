import { describe, expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import {
  BackupEngineError,
  BACKUP_OBJECT_PREFIX,
  createBackupEngine,
  isBackupObjectPath,
  privateStorageRoot,
  type BackupDbClient,
  type BackupObjectStorage,
  type StoredObject,
} from "./engine";

class MemoryStorage implements BackupObjectStorage {
  private values = new Map<string, { data: Buffer; contentType: string; metadata: Record<string, string>; generation: string }>();
  private generation = 0;

  async list(prefix: string): Promise<StoredObject[]> {
    return [...this.values.entries()]
      .filter(([key]) => !prefix || key.startsWith(prefix))
      .map(([key, value]) => ({
        key,
        size: value.data.length,
        generation: value.generation,
        contentType: value.contentType,
        metadata: { ...value.metadata },
      }));
  }

  async read(key: string) {
    const value = this.values.get(key);
    if (!value) throw new Error(`missing fake object ${key}`);
    return {
      data: Buffer.from(value.data),
      contentType: value.contentType,
      metadata: { ...value.metadata },
      generation: value.generation,
    };
  }

  async write(
    key: string,
    data: Buffer,
    options: { contentType: string; metadata?: Record<string, string>; ifGenerationMatch?: string | null },
  ) {
    if (options.ifGenerationMatch === null && this.values.has(key)) throw new Error("immutable archive object already exists");
    const value = {
      data: Buffer.from(data),
      contentType: options.contentType,
      metadata: { ...options.metadata },
      generation: String(++this.generation),
    };
    this.values.set(key, value);
    return {
      key,
      size: value.data.length,
      generation: value.generation,
      contentType: value.contentType,
      metadata: { ...value.metadata },
    };
  }

  async delete(key: string, ifGenerationMatch?: string | null) {
    const current = this.values.get(key);
    if (!current) return;
    if (ifGenerationMatch && current.generation !== ifGenerationMatch) throw new Error("generation conflict");
    this.values.delete(key);
  }
}

class FakeDatabase {
  readonly statements: string[] = [];
  drift = false;
  readonly client: BackupDbClient = {
    query: async (text: string) => {
      this.statements.push(text);
      const query = text.trim();
      if (query.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }], rowCount: 1 };
      if (query.includes("pg_advisory_unlock")) return { rows: [{ pg_advisory_unlock: true }], rowCount: 1 };
      if (query.startsWith("SELECT c.relname AS name")) {
        return { rows: [{ name: "orders", kind: "r", isPartition: false }], rowCount: 1 };
      }
      if (query.startsWith("SELECT c.relname AS table_name, a.attname AS column_name")) {
        return {
          rows: [
            { table_name: "orders", column_name: "id", type_sql: "bigint", identity_kind: "" },
            { table_name: "orders", column_name: "amount", type_sql: "numeric(30,3)", identity_kind: "" },
          ],
          rowCount: 2,
        };
      }
      if (query.startsWith("SELECT c.relname AS table_name, a.attname, a.attnum")) {
        return {
          rows: [
            { table_name: "orders", column_name: "id", attnum: 1, type_sql: "bigint", attnotnull: true, default_sql: null, attidentity: "", attgenerated: "" },
            { table_name: "orders", column_name: "amount", attnum: 2, type_sql: "numeric(30,3)", attnotnull: false, default_sql: this.drift ? "0" : null, attidentity: "", attgenerated: "" },
          ],
          rowCount: 2,
        };
      }
      if (query.includes("pg_constraint con") || query.includes("pg_index x") || query.includes("pg_trigger t")) {
        return { rows: [], rowCount: 0 };
      }
      if (query.startsWith('SELECT "id"::text AS "id"')) {
        return {
          rows: [{ id: "9007199254740993", amount: "12345678901234567890.125" }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };

  pool() {
    return { connect: async () => this.client };
  }
}

describe("business backup engine", () => {
  it("rejects unsafe private storage paths and unsafe backup ids", async () => {
    expect(privateStorageRoot("/private-bucket/business")).toBe("private-bucket/business");
    expect(() => privateStorageRoot("/private-bucket/../public")).toThrow(BackupEngineError);
    expect(BACKUP_OBJECT_PREFIX).toBe("backups/");
    expect(isBackupObjectPath("/objects/backups/snapshot-1/manifest.json")).toBe(true);
    expect(isBackupObjectPath("uploads/products/example.jpg")).toBe(false);

    const database = new FakeDatabase();
    const engine = createBackupEngine({
      pool: database.pool(),
      storage: new MemoryStorage(),
      privateObjectRoot: "private-bucket/business",
      fileRoots: [],
    });
    await expect(engine.runBackup({ id: "../other", reason: "manual", actorId: null })).rejects.toThrow(BackupEngineError);
  });

  it("archives exact database text values off-database and verifies the private snapshot", async () => {
    const database = new FakeDatabase();
    const storage = new MemoryStorage();
    const engine = createBackupEngine({
      pool: database.pool(),
      storage,
      privateObjectRoot: "private-bucket/business",
      fileRoots: [],
      now: () => new Date("2025-01-02T03:04:05.000Z"),
    });

    const created = await engine.runBackup({ id: "snapshot-1", reason: "scheduled", actorId: null });
    expect(created).toMatchObject({ rowCount: 1, tableCount: 1, fileCount: 0, schemaHash: expect.any(String) });
    expect(created.bytes).toBeGreaterThan(0);
    expect((await storage.list("backups/snapshot-1")).map((item) => item.key).sort()).toEqual([
      "backups/snapshot-1/database.json.gz",
      "backups/snapshot-1/manifest.json",
    ]);
    const compressedDatabase = await storage.read("backups/snapshot-1/database.json.gz");
    expect(gunzipSync(compressedDatabase.data).toString("utf8")).toContain("9007199254740993");
    expect(gunzipSync(compressedDatabase.data).toString("utf8")).toContain("12345678901234567890.125");

    const inspected = await engine.inspectBackup("snapshot-1");
    expect(inspected).toMatchObject({
      rowCount: 1,
      tableCount: 1,
      fileCount: 0,
      createdAt: "2025-01-02T03:04:05.000Z",
      compatible: true,
    });
    expect(JSON.stringify(inspected)).not.toContain("database.json.gz");
  });

  it("copies uploaded App Storage objects into immutable per-snapshot objects and verifies their bytes", async () => {
    const database = new FakeDatabase();
    const storage = new MemoryStorage();
    await storage.write("uploads/products/item.jpg", Buffer.from([0, 1, 2, 250, 255]), {
      contentType: "image/jpeg",
      metadata: { source: "upload" },
    });
    const engine = createBackupEngine({
      pool: database.pool(),
      storage,
      privateObjectRoot: "private-bucket/business",
      fileRoots: [],
    });

    const result = await engine.runBackup({ id: "file-snapshot", reason: "manual", actorId: null });
    expect(result.fileCount).toBe(1);
    expect(result.bytes).toBeGreaterThan(5);
    expect(await engine.inspectBackup("file-snapshot")).toMatchObject({ fileCount: 1, compatible: true });
    expect((await storage.read("uploads/products/item.jpg")).data).toEqual(Buffer.from([0, 1, 2, 250, 255]));
  });

  it("refuses a schema-incompatible restore before opening a write transaction", async () => {
    const database = new FakeDatabase();
    const storage = new MemoryStorage();
    const engine = createBackupEngine({
      pool: database.pool(),
      storage,
      privateObjectRoot: "private-bucket/business",
      fileRoots: [],
    });
    await engine.runBackup({ id: "snapshot-2", reason: "pre_restore", actorId: 7 });
    database.statements.length = 0;
    database.drift = true;

    await expect(engine.runRestore("snapshot-2")).rejects.toThrow(/schema does not match/i);
    expect(database.statements.some((sql) => /^BEGIN\b/.test(sql.trim()))).toBe(false);
  });
});