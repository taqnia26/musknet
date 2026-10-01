import { describe, expect, it } from "vitest";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  BackupEngineError,
  BackupRecoveryRequiredError,
  BACKUP_OBJECT_PREFIX,
  createBackupEngine,
  appAssetRoots,
  isBackupObjectPath,
  privateStorageRoot,
  type BackupDbClient,
  type BackupObjectStorage,
  type StoredObject,
} from "./engine";
import { GcsBackupStorage } from "./gcs-storage";

class MemoryStorage implements BackupObjectStorage {
  readonly objectRoots = ["private-bucket/business", "public-bucket/media"];
  private values = new Map<string, {
    data: Buffer;
    contentType: string;
    metadata: Record<string, string>;
    generation: string;
    timeCreated: string | null;
  }>();
  private generation = 0;
  writes = 0;

  private objectKey(key: string, root?: string) {
    return `${root ?? this.objectRoots[0]}:${key}`;
  }

  async list(prefix: string): Promise<StoredObject[]> {
    return [...this.values.entries()]
      .map(([objectKey, value]) => {
        const separator = objectKey.indexOf(":");
        return { root: objectKey.slice(0, separator), key: objectKey.slice(separator + 1), value };
      })
      .filter(({ key }) => !prefix || key.startsWith(prefix))
      .map(({ root, key, value }) => ({
        key,
        root,
        size: value.data.length,
        generation: value.generation,
        contentType: value.contentType,
        metadata: { ...value.metadata },
        timeCreated: value.timeCreated,
      }));
  }

  async read(key: string, root?: string) {
    const value = this.values.get(this.objectKey(key, root));
    if (!value) throw new Error(`missing fake object ${key}`);
    return {
      data: Buffer.from(value.data),
      contentType: value.contentType,
      metadata: { ...value.metadata },
      generation: value.generation,
      timeCreated: value.timeCreated,
    };
  }

  async write(
    key: string,
    data: Buffer,
    options: { contentType: string; metadata?: Record<string, string>; ifGenerationMatch?: string | null; root?: string },
  ) {
    this.writes += 1;
    const objectKey = this.objectKey(key, options.root);
    if (options.ifGenerationMatch === null && this.values.has(objectKey)) throw new Error("immutable archive object already exists");
    const value = {
      data: Buffer.from(data),
      contentType: options.contentType,
      metadata: { ...options.metadata },
      generation: String(++this.generation),
      timeCreated: options.metadata?.timeCreated ?? null,
    };
    this.values.set(objectKey, value);
    return {
      key,
      root: options.root ?? this.objectRoots[0],
      size: value.data.length,
      generation: value.generation,
      contentType: value.contentType,
      metadata: { ...value.metadata },
      timeCreated: value.timeCreated,
    };
  }

  async delete(key: string, ifGenerationMatch?: string | null, root?: string) {
    const objectKey = this.objectKey(key, root);
    const current = this.values.get(objectKey);
    if (!current) return;
    if (ifGenerationMatch && current.generation !== ifGenerationMatch) throw new Error("generation conflict");
    this.values.delete(objectKey);
  }
}

class FakeDatabase {
  readonly statements: string[] = [];
  drift = false;
  driftOnRestoreLock = false;
  throwOnCommit = false;
  readonly client: BackupDbClient = {
    query: async (text: string) => {
      this.statements.push(text);
      const query = text.trim();
      if (query.startsWith("LOCK TABLE") && query.includes("ACCESS EXCLUSIVE") && this.driftOnRestoreLock) {
        this.drift = true;
      }
      if (query === "COMMIT" && this.throwOnCommit) throw new Error("connection lost after COMMIT was sent");
      if (query.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }], rowCount: 1 };
      if (query.includes("pg_advisory_unlock")) return { rows: [{ pg_advisory_unlock: true }], rowCount: 1 };
      if (query.startsWith("SELECT c.relname AS name")) {
        return { rows: [{ name: "orders", kind: "r", isPartition: false }], rowCount: 1 };
      }
      if (
        query.startsWith("SELECT c.relname AS table_name, a.attname AS column_name") &&
        query.includes("a.attidentity AS identity_kind")
      ) {
        return {
          rows: [
            { table_name: "orders", column_name: "id", type_sql: "bigint", identity_kind: "" },
            { table_name: "orders", column_name: "amount", type_sql: "numeric(30,3)", identity_kind: "" },
          ],
          rowCount: 2,
        };
      }
      if (query.startsWith("SELECT c.relname AS table_name, a.attname AS column_name, a.attnum")) {
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
  it("uses every configured public App Storage search root without duplicating PRIVATE_OBJECT_DIR", () => {
    const storage = new GcsBackupStorage(
      "/private-bucket/business",
      "/public-bucket/media,/second-public-bucket/assets,/private-bucket/business",
    );
    expect(storage.objectRoots).toEqual([
      "private-bucket/business",
      "public-bucket/media",
      "second-public-bucket/assets",
    ]);
  });

  it("resolves exactly the served source asset roots and refuses missing roots", () => {
    const roots = appAssetRoots(path.resolve(process.cwd(), "artifacts/api-server/src/lib/backups"), {});
    expect(roots.map((root) => [root.kind, root.directory])).toEqual([
      ["attached_assets", path.resolve(process.cwd(), "attached_assets")],
      ["site-assets", path.resolve(process.cwd(), "artifacts/musk-ellolo/public/site-assets")],
    ]);
    expect(() => appAssetRoots("/missing/api-server/src/lib/backups", {})).toThrow(/required served/i);
  });

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
      uploadQuiescenceMs: 0,
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
      uploadQuiescenceMs: 0,
    });

    const created = await engine.runBackup({ id: "snapshot-1", reason: "scheduled", actorId: null });
    expect(created).toMatchObject({ rowCount: 1, tableCount: 1, fileCount: 0, schemaHash: expect.any(String) });
    expect(created.bytes).toBeGreaterThan(0);
    expect(database.statements.some((sql) => sql.trim() === "BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE")).toBe(true);
    expect(database.statements.some((sql) => sql.includes("LOCK TABLE") && sql.includes("IN SHARE MODE"))).toBe(true);
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
      uploadQuiescenceMs: 0,
    });

    const result = await engine.runBackup({ id: "file-snapshot", reason: "manual", actorId: null });
    expect(result.fileCount).toBe(1);
    expect(result.bytes).toBeGreaterThan(5);
    expect(await engine.inspectBackup("file-snapshot")).toMatchObject({ fileCount: 1, compatible: true });
    expect((await storage.read("uploads/products/item.jpg")).data).toEqual(Buffer.from([0, 1, 2, 250, 255]));
  });

  it("archives objects from each configured public search root with root identity", async () => {
    const database = new FakeDatabase();
    const storage = new MemoryStorage();
    await storage.write("uploads/catalog/item.jpg", Buffer.from("public image"), {
      contentType: "image/jpeg",
      root: "public-bucket/media",
    });
    const engine = createBackupEngine({
      pool: database.pool(),
      storage,
      privateObjectRoot: "private-bucket/business",
      fileRoots: [],
      uploadQuiescenceMs: 0,
    });

    const result = await engine.runBackup({ id: "public-root-snapshot", reason: "manual", actorId: null });
    expect(result.fileCount).toBe(1);
    const manifest = await storage.read("backups/public-root-snapshot/manifest.json");
    expect(JSON.parse(manifest.data.toString("utf8")).files).toMatchObject([
      { path: "uploads/catalog/item.jpg", storageRoot: "public-bucket/media" },
    ]);
  });

  it("waits through the configured signed-upload quiescence using injected time", async () => {
    let clock = new Date("2025-01-02T03:04:05.000Z");
    const waits: number[] = [];
    const database = new FakeDatabase();
    const storage = new MemoryStorage();
    const objectPath = "uploads/products/7f0f7cf7-a2b6-4e8e-8f5f-1e57e7b03f12";
    await storage.write(objectPath, Buffer.from("upload"), {
      contentType: "image/jpeg",
      metadata: { timeCreated: new Date(clock.getTime() - 1_000).toISOString() },
    });
    const engine = createBackupEngine({
      pool: database.pool(),
      storage,
      privateObjectRoot: "private-bucket/business",
      fileRoots: [],
      now: () => new Date(clock),
      uploadQuiescenceMs: 30_000,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
        clock = new Date(clock.getTime() + milliseconds);
      },
    });

    await engine.runBackup({ id: "quiescence", reason: "manual", actorId: null });
    expect(waits).toEqual([30_000]);
  });

  it("refuses a schema-incompatible restore before opening a write transaction", async () => {
    const database = new FakeDatabase();
    const storage = new MemoryStorage();
    const engine = createBackupEngine({
      pool: database.pool(),
      storage,
      privateObjectRoot: "private-bucket/business",
      fileRoots: [],
      uploadQuiescenceMs: 0,
    });
    await engine.runBackup({ id: "snapshot-2", reason: "pre_restore", actorId: 7 });
    database.statements.length = 0;
    database.drift = true;

    await expect(engine.runRestore("snapshot-2")).rejects.toThrow(/schema does not match/i);
    expect(database.statements.some((sql) => /^BEGIN\b/.test(sql.trim()))).toBe(false);
  });

  it("rechecks the schema after restore table locks and before changing files or rows", async () => {
    const database = new FakeDatabase();
    const storage = new MemoryStorage();
    const engine = createBackupEngine({
      pool: database.pool(),
      storage,
      privateObjectRoot: "private-bucket/business",
      fileRoots: [],
      uploadQuiescenceMs: 0,
    });
    await engine.runBackup({ id: "snapshot-3", reason: "pre_restore", actorId: 7 });
    const archiveWriteCount = storage.writes;
    database.statements.length = 0;
    database.driftOnRestoreLock = true;

    await expect(engine.runRestore("snapshot-3")).rejects.toThrow(/schema changed before restore acquired its write locks/i);
    expect(storage.writes).toBe(archiveWriteCount);
    const lockIndex = database.statements.findIndex((sql) => sql.includes("ACCESS EXCLUSIVE"));
    const laterSchemaQueryIndex = database.statements.findIndex((sql, index) =>
      index > lockIndex && sql.includes("pg_attrdef"),
    );
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(laterSchemaQueryIndex).toBeGreaterThan(lockIndex);
    expect(database.statements.some((sql) => /^TRUNCATE\b|^INSERT INTO\b/.test(sql.trim()))).toBe(false);
  });

  it("requires operator recovery when the restore COMMIT outcome is ambiguous", async () => {
    const database = new FakeDatabase();
    const engine = createBackupEngine({
      pool: database.pool(),
      storage: new MemoryStorage(),
      privateObjectRoot: "private-bucket/business",
      fileRoots: [],
      uploadQuiescenceMs: 0,
    });
    await engine.runBackup({ id: "ambiguous-commit", reason: "pre_restore", actorId: 7 });
    database.statements.length = 0;
    database.throwOnCommit = true;

    await expect(engine.runRestore("ambiguous-commit")).rejects.toBeInstanceOf(BackupRecoveryRequiredError);
    expect(database.statements.some((sql) => sql.trim() === "COMMIT")).toBe(true);
    expect(database.statements.some((sql) => sql.trim() === "ROLLBACK")).toBe(false);
  });
});