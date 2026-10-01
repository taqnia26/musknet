import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export const BACKUP_OBJECT_PREFIX = "backups/";
const ARCHIVE_ROOT = BACKUP_OBJECT_PREFIX.slice(0, -1);
const ADVISORY_LOCK = [19861224, 47] as const;
const OPERATION_LOCK_TIMEOUT_MS = 30_000;
const MAX_DATABASE_JSON_BYTES = 256 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_FILES = 100_000;
const MAX_TOTAL_FILE_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_DATABASE_BYTES = 256 * 1024 * 1024;
const ARCHIVE_VERSION = 1;

export type BackupReason = "manual" | "scheduled" | "pre_restore";
export type BackupSummary = {
  rowCount: number;
  tableCount: number;
  fileCount: number;
  bytes: number;
  schemaHash: string;
};
export type BackupInspection = BackupSummary & {
  createdAt: string;
  compatible: boolean;
};

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number | null };
export type BackupDbClient = {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
  release(error?: Error | boolean): void;
};
export type BackupDbPool = { connect(): Promise<BackupDbClient> };

export type StoredObject = {
  key: string;
  size: number;
  generation: string | null;
  contentType: string | null;
  metadata: Record<string, string>;
};
export type BackupObjectStorage = {
  list(prefix: string): Promise<StoredObject[]>;
  read(key: string): Promise<{ data: Buffer; contentType: string | null; metadata: Record<string, string>; generation: string | null }>;
  write(
    key: string,
    data: Buffer,
    options: { contentType: string; metadata?: Record<string, string>; ifGenerationMatch?: string | null },
  ): Promise<StoredObject>;
  delete(key: string, ifGenerationMatch?: string | null): Promise<void>;
};

export type BackupFileRoot = {
  kind: "contracts" | "attached_assets" | "site-assets";
  directory: string;
};

export const BACKUP_EXCLUSIONS = [
  "Production schema and migrations are never restored; the public schema fingerprint must match before data restore.",
  "backup_* control/history tables and admin/owner users, credentials, roles, permissions, security settings, and integration credentials are not overwritten.",
  "Ephemeral admin/owner/influencer sessions and OTP tables are not archived and are cleared on restore, requiring users to sign in again.",
  "External-provider delivery, dispatch, webhook, outbox, and idempotency state is omitted from snapshots and cleared on restore to prevent replay.",
  "WhatsApp auth/session/secrets are retained in place and are not archived or restored.",
  "App Storage backups/ archive objects are excluded from recursive file enumeration.",
  "Only private App Storage under PRIVATE_OBJECT_DIR, LOCAL_CONTRACT_STORAGE_DIR when configured, served attached_assets, and served site-assets are included.",
  "Source code, environment files, Git metadata, dependency trees, and all files outside the configured storage roots are excluded.",
];

export function isBackupObjectPath(rawPath: string) {
  const relative = rawPath.replace(/^\/objects\//, "").replace(/^\/+/, "");
  return relative === ARCHIVE_ROOT || relative.startsWith(BACKUP_OBJECT_PREFIX);
}
type FileSource = "object" | BackupFileRoot["kind"];
type ArchiveFile = {
  source: FileSource;
  path: string;
  archiveObject: string;
  bytes: number;
  sha256: string;
  generation: string;
  contentType: string;
  metadata: Record<string, string>;
};
type TableArchive = { name: string; columns: string[]; rows: (string | null)[][] };
type BackupManifest = {
  format: "replit-business-backup";
  version: number;
  id: string;
  reason: BackupReason;
  actorId: number | null;
  createdAt: string;
  schemaHash: string;
  databaseObject: string;
  databaseGeneration: string;
  databaseSha256: string;
  databaseCompressedBytes: number;
  databaseBytes: number;
  rowCount: number;
  tableCount: number;
  fileCount: number;
  fileBytes: number;
  files: ArchiveFile[];
  tables: { name: string; rowCount: number; columns: string[] }[];
  exclusions: {
    policy: string[];
    tables: { name: string; reason: string }[];
    files: string[];
  };
};
type ColumnInfo = { name: string; type: string; identity: string; generated: string };
type TableInfo = { name: string; kind: string; isPartition: boolean; columns: ColumnInfo[] };
type LocalFile = { root: BackupFileRoot; relativePath: string; absolutePath: string; size: number };

export type BackupEngineOptions = {
  pool: BackupDbPool;
  storage: BackupObjectStorage;
  privateObjectRoot: string;
  fileRoots: BackupFileRoot[];
  now?: () => Date;
  operationLockTimeoutMs?: number;
};

export class BackupEngineError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BackupEngineError";
  }
}

export class BackupRecoveryRequiredError extends BackupEngineError {
  constructor(message = "Restore rollback was incomplete; keep maintenance mode enabled and require operator recovery", options?: ErrorOptions) {
    super(message, options);
    this.name = "BackupRecoveryRequiredError";
  }
}

function sha256(data: Buffer | string) {
  return createHash("sha256").update(data).digest("hex");
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function qualifiedTable(name: string) {
  return `public.${quoteIdentifier(name)}`;
}

function checkBackupId(id: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
    throw new BackupEngineError("Invalid backup identifier");
  }
  return id;
}

function backupPrefix(id: string) {
  return `${ARCHIVE_ROOT}/${checkBackupId(id)}`;
}

function isEphemeralTable(name: string) {
  return (
    /(^|_)(sessions?|session_tokens?|otp_records)$/.test(name) ||
    /(^|_)(webhook_events?|idempotency(_keys)?|outbox|provider_deliveries|deliveries|dispatches)$/.test(name) ||
    /(^|_)(delivery|dispatch|idempotency|outbox|webhook)_/.test(name)
  );
}

function protectedTableReason(name: string): string | null {
  if (name.startsWith("backup_")) return "backup control and history are retained in place";
  if (
    /(^|_)(admin|owner)_(users?|credentials?|roles?|permissions?|integrations?|security|settings?)$/.test(name) ||
    /(^|_)(security_config|auth_config|authentication_config)$/.test(name) ||
    /(^|_)(credentials?|secrets?)$/.test(name) ||
    name === "whatsapp_auth_state" ||
    /whatsapp_(auth|credential|secret|session)/.test(name)
  ) {
    return "security credentials, roles, permissions, or integration configuration are retained in place";
  }
  if (/(^|_)(settings|configuration|config)$/.test(name)) {
    return "provider and security configuration is retained in place";
  }
  return null;
}

function classifyTable(name: string): "restore" | "clear" | "preserve" {
  if (protectedTableReason(name)) return "preserve";
  if (isEphemeralTable(name)) return "clear";
  return "restore";
}

function checkedRootPath(root: BackupFileRoot) {
  if (!path.isAbsolute(root.directory)) {
    throw new BackupEngineError(`Configured ${root.kind} backup path must be absolute`);
  }
  return root.directory;
}

function safeRelativePath(relativePath: string) {
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).some((part) => part === "." || part === ".." || part === "") ||
    relativePath.includes("\0")
  ) {
    throw new BackupEngineError("Backup contains an unsafe file path");
  }
  return relativePath;
}

function assertReferencedFiles(tables: TableArchive[], files: ArchiveFile[], configuredRoots: Set<FileSource>) {
  const included = new Set(files.map((file) => `${file.source}:${file.path}`));
  const missing = new Set<string>();
  for (const table of tables) {
    if (classifyTable(table.name) !== "restore") continue;
    for (const row of table.rows) {
      for (const cell of row) {
        if (cell === null) continue;
        const references = /\/objects\/([^\s"'<>\\]+)|\/api\/(site-assets|media)\/([^\s"'<>\\]+)/g;
        for (const match of cell.matchAll(references)) {
          const rawPath = (match[1] ?? match[3] ?? "").replace(/[),.;\]}]+$/, "");
          let decoded: string;
          try {
            decoded = decodeURIComponent(rawPath);
          } catch (error) {
            throw new BackupEngineError("Database contains an invalid encoded uploaded-file path", { cause: error });
          }
          if (match[1] !== undefined) {
            if (decoded.startsWith("local/")) {
              const contractRelative = decoded.startsWith("local/contracts/") ? decoded.slice("local/contracts/".length) : "";
              if (!configuredRoots.has("contracts") || !/^[0-9a-f-]{36}$/i.test(contractRelative)) {
                missing.add(`/objects/${decoded} (unsupported local file path or missing LOCAL_CONTRACT_STORAGE_DIR)`);
              } else {
                if (!included.has(`contracts:${contractRelative}`) || !included.has(`contracts:${contractRelative}.json`)) {
                  missing.add(`/objects/${decoded}`);
                }
              }
            } else if (!included.has(`object:${decoded}`)) {
              missing.add(`/objects/${decoded}`);
            }
          } else {
            const kind = match[2] === "site-assets" ? "site-assets" : "attached_assets";
            if (!included.has(`${kind}:${decoded}`)) missing.add(`/api/${match[2]}/${decoded}`);
          }
        }
      }
    }
  }
  if (missing.size) {
    throw new BackupEngineError(`Backup references missing or unsupported uploaded files: ${[...missing].slice(0, 10).join(", ")}`);
  }
}

function normalizeMimeType(value: string | null | undefined, filePath: string) {
  if (value?.trim()) return value.trim().toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  const known: Record<string, string> = {
    ".avif": "image/avif",
    ".css": "text/css",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".gif": "image/gif",
    ".html": "text/html",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".xml": "application/xml",
  };
  return known[ext] ?? "application/octet-stream";
}

async function walkRoot(root: BackupFileRoot): Promise<LocalFile[]> {
  const configured = checkedRootPath(root);
  let rootInfo;
  try {
    rootInfo = await lstat(configured);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && root.kind !== "contracts") return [];
    throw new BackupEngineError(`Required ${root.kind} storage path is unavailable`, { cause: error });
  }
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new BackupEngineError(`Refusing non-directory or symlink ${root.kind} storage`);
  }
  if (root.kind === "contracts" && ((rootInfo.mode & 0o077) !== 0 || (rootInfo.mode & 0o700) !== 0o700)) {
    throw new BackupEngineError("LOCAL_CONTRACT_STORAGE_DIR must have private 700 directory permissions");
  }
  const canonicalRoot = await realpath(configured);
  const result: LocalFile[] = [];
  const visit = async (directory: string, relative: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === "." || entry.name === ".." || entry.name.includes("\0")) {
        throw new BackupEngineError(`Unsafe entry in ${root.kind} storage`);
      }
      const absolutePath = path.join(directory, entry.name);
      const entryStat = await lstat(absolutePath);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entryStat.isSymbolicLink()) {
        throw new BackupEngineError(`Symlink found in ${root.kind} storage: ${childRelative}`);
      }
      if (entryStat.isDirectory()) {
        await visit(absolutePath, childRelative);
      } else if (entryStat.isFile()) {
        const resolved = await realpath(absolutePath);
        if (!resolved.startsWith(`${canonicalRoot}${path.sep}`)) {
          throw new BackupEngineError(`File escapes ${root.kind} storage root`);
        }
        result.push({ root, relativePath: safeRelativePath(childRelative), absolutePath, size: entryStat.size });
      } else {
        throw new BackupEngineError(`Unsupported filesystem entry in ${root.kind} storage`);
      }
    }
  };
  await access(canonicalRoot);
  await visit(canonicalRoot, "");
  return result;
}

async function introspectTables(client: BackupDbClient): Promise<TableInfo[]> {
  const tables = await client.query(`
    SELECT c.relname AS name, c.relkind AS kind, c.relispartition AS "isPartition"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'f')
     ORDER BY c.relname
  `);
  if (tables.rows.some((row) => row.kind === "f")) {
    const unsupported = tables.rows.filter((row) => row.kind === "f").map((row) => String(row.name));
    throw new BackupEngineError(`Foreign tables are unsupported for backups: ${unsupported.join(", ")}`);
  }
  if (tables.rows.some((row) => row.kind === "p")) {
    throw new BackupEngineError("Partitioned parent tables are unsupported by the current backup engine");
  }
  const columns = await client.query(`
    SELECT c.relname AS table_name, a.attname AS column_name,
           format_type(a.atttypid, a.atttypmod) AS type_sql,
           a.attidentity AS identity_kind, a.attgenerated AS generated_kind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND a.attnum > 0
       AND NOT a.attisdropped
     ORDER BY c.relname, a.attnum
  `);
  const byName = new Map<string, TableInfo>();
  for (const row of tables.rows) {
    byName.set(String(row.name), {
      name: String(row.name),
      kind: String(row.kind),
      isPartition: Boolean(row.isPartition),
      columns: [],
    });
  }
  for (const row of columns.rows) {
    const table = byName.get(String(row.table_name));
    if (!table) continue;
    table.columns.push({
      name: String(row.column_name),
      type: String(row.type_sql),
      identity: String(row.identity_kind ?? ""),
      generated: String(row.generated_kind ?? ""),
    });
  }
  return [...byName.values()];
}

async function currentSchemaHash(client: BackupDbClient) {
  const [columns, constraints, indexes, triggers, triggerFunctions, enumLabels, domainConstraints, sequences, policies] = await Promise.all([
    client.query(`
      SELECT c.relname AS table_name, a.attname AS column_name, a.attnum,
             format_type(a.atttypid, a.atttypmod) AS type_sql,
             a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS default_sql,
             a.attidentity, a.attgenerated
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
         AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY c.relname, a.attnum
    `),
    client.query(`
      SELECT c.relname AS table_name, con.conname, con.contype, pg_get_constraintdef(con.oid, true) AS definition
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
       ORDER BY c.relname, con.conname
    `),
    client.query(`
      SELECT t.relname AS table_name, i.relname AS index_name, pg_get_indexdef(i.oid) AS definition
        FROM pg_index x
        JOIN pg_class t ON t.oid = x.indrelid
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'public'
       ORDER BY t.relname, i.relname
    `),
    client.query(`
      SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid, true) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND NOT t.tgisinternal
       ORDER BY c.relname, t.tgname
    `),
    client.query(`
      SELECT c.relname AS table_name, t.tgname, pg_get_functiondef(p.oid) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE n.nspname = 'public' AND NOT t.tgisinternal
       ORDER BY c.relname, t.tgname
    `),
    client.query(`
      SELECT t.typname, e.enumsortorder, e.enumlabel
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE n.nspname = 'public'
       ORDER BY t.typname, e.enumsortorder
    `),
    client.query(`
      SELECT t.typname, con.conname, pg_get_constraintdef(con.oid, true) AS definition
        FROM pg_constraint con
        JOIN pg_type t ON t.oid = con.contypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND con.contypid <> 0
       ORDER BY t.typname, con.conname
    `),
    client.query(`
      SELECT c.relname AS sequence_name, s.seqtypid::regtype::text AS sequence_type,
             s.seqstart, s.seqincrement, s.seqmax, s.seqmin, s.seqcache, s.seqcycle
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_sequence s ON s.seqrelid = c.oid
       WHERE n.nspname = 'public' AND c.relkind = 'S'
       ORDER BY c.relname
    `),
    client.query(`
      SELECT c.relname AS table_name, p.polname, p.polcmd, p.polpermissive,
             pg_get_expr(p.polqual, p.polrelid, true) AS using_expression,
             pg_get_expr(p.polwithcheck, p.polrelid, true) AS check_expression,
             ARRAY(
               SELECT COALESCE(r.rolname, 'PUBLIC')
                 FROM unnest(p.polroles) AS policy_role(oid)
                 LEFT JOIN pg_roles r ON r.oid = policy_role.oid
                ORDER BY 1
             ) AS roles
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
       ORDER BY c.relname, p.polname
    `),
  ]);
  return sha256(JSON.stringify([
    columns.rows,
    constraints.rows,
    indexes.rows,
    triggers.rows,
    triggerFunctions.rows,
    enumLabels.rows,
    domainConstraints.rows,
    sequences.rows,
    policies.rows,
  ]));
}

function dbObjectKey(id: string) {
  return `${backupPrefix(id)}/database.json.gz`;
}

function manifestObjectKey(id: string) {
  return `${backupPrefix(id)}/manifest.json`;
}

function parseManifest(data: Buffer, id: string): BackupManifest {
  if (data.length > MAX_MANIFEST_BYTES) throw new BackupEngineError("Backup manifest exceeds the safety limit");
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(data.toString("utf8")) as BackupManifest;
  } catch (error) {
    throw new BackupEngineError("Backup manifest is corrupt", { cause: error });
  }
  if (
    manifest.format !== "replit-business-backup" ||
    manifest.version !== ARCHIVE_VERSION ||
    manifest.id !== id ||
    !Array.isArray(manifest.files) ||
    !Array.isArray(manifest.tables) ||
    !Array.isArray(manifest.exclusions?.tables) ||
    manifest.files.length > MAX_FILES
  ) {
    throw new BackupEngineError("Backup manifest has an unsupported or invalid format");
  }
  return manifest;
}

type VerifiedArchive = {
  manifest: BackupManifest;
  tables: TableArchive[];
  stagedFiles: { record: ArchiveFile; stagedPath: string }[];
  tempDirectory: string;
};

function validateDatabasePayload(value: unknown, manifest: BackupManifest): TableArchive[] {
  if (!Array.isArray(value) || value.length !== manifest.tableCount) {
    throw new BackupEngineError("Backup database payload does not match its manifest");
  }
  const names = new Set<string>();
  const result: TableArchive[] = [];
  for (const table of value as TableArchive[]) {
    if (
      !table ||
      typeof table.name !== "string" ||
      !Array.isArray(table.columns) ||
      !Array.isArray(table.rows) ||
      names.has(table.name)
    ) {
      throw new BackupEngineError("Backup database payload contains an invalid table");
    }
    names.add(table.name);
    for (const row of table.rows) {
      if (!Array.isArray(row) || row.length !== table.columns.length || row.some((cell) => cell !== null && typeof cell !== "string")) {
        throw new BackupEngineError(`Backup rows for ${table.name} are invalid`);
      }
    }
    result.push(table);
  }
  const rowCount = result.reduce((sum, table) => sum + table.rows.length, 0);
  if (rowCount !== manifest.rowCount) throw new BackupEngineError("Backup row count does not match its manifest");
  const tableMetadata = new Map(manifest.tables.map((table) => [table.name, table]));
  if (tableMetadata.size !== result.length) throw new BackupEngineError("Backup table manifest is inconsistent");
  for (const table of result) {
    const metadata = tableMetadata.get(table.name);
    if (
      !metadata ||
      metadata.rowCount !== table.rows.length ||
      JSON.stringify(metadata.columns) !== JSON.stringify(table.columns)
    ) {
      throw new BackupEngineError(`Backup table manifest is inconsistent for ${table.name}`);
    }
  }
  return result;
}

export function createBackupEngine(options: BackupEngineOptions) {
  const now = options.now ?? (() => new Date());
  const lockTimeout = options.operationLockTimeoutMs ?? OPERATION_LOCK_TIMEOUT_MS;
  const configuredRoots = options.fileRoots.map((root) => ({ ...root, directory: checkedRootPath(root) }));
  if (new Set(configuredRoots.map((root) => root.kind)).size !== configuredRoots.length) {
    throw new BackupEngineError("Each local backup root may be configured only once");
  }
  const backupRoot = options.privateObjectRoot.replace(/^\/+|\/+$/g, "");
  if (!backupRoot || backupRoot.split("/").some((part) => part === "." || part === "..")) {
    throw new BackupEngineError("PRIVATE_OBJECT_DIR must name a private App Storage bucket prefix");
  }

  async function withOperationLock<T>(operation: (client: BackupDbClient) => Promise<T>): Promise<T> {
    const client = await options.pool.connect();
    let acquired = false;
    try {
      const started = Date.now();
      while (!acquired) {
        const result = await client.query("SELECT pg_try_advisory_lock($1, $2) AS locked", [...ADVISORY_LOCK]);
        acquired = result.rows[0]?.locked === true;
        if (!acquired) {
          if (Date.now() - started >= lockTimeout) throw new BackupEngineError("Timed out waiting for another backup or restore operation");
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      return await operation(client);
    } finally {
      if (acquired) {
        try {
          await client.query("SELECT pg_advisory_unlock($1, $2)", [...ADVISORY_LOCK]);
        } catch (error) {
          client.release(error instanceof Error ? error : true);
          throw new BackupEngineError("Could not release the backup operation lock; database connection was discarded", {
            cause: error,
          });
        }
      }
      client.release();
    }
  }

  async function captureFiles(id: string): Promise<{ files: ArchiveFile[]; fileBytes: number }> {
    const files: ArchiveFile[] = [];
    let fileBytes = 0;
    const add = async (
      source: FileSource,
      relativePath: string,
      content: Buffer,
      contentType: string,
      metadata: Record<string, string>,
    ) => {
      safeRelativePath(relativePath);
      if (content.length > MAX_FILE_BYTES) throw new BackupEngineError(`File exceeds the 256 MiB backup limit: ${relativePath}`);
      if (files.length >= MAX_FILES) throw new BackupEngineError("Backup exceeds the 100,000-file limit");
      fileBytes += content.length;
      if (fileBytes > MAX_TOTAL_FILE_BYTES) throw new BackupEngineError("Backup file data exceeds the 5 GiB safety limit");
      const digest = sha256(content);
      const archiveObject = `${backupPrefix(id)}/files/${String(files.length).padStart(6, "0")}-${digest}`;
      const uploaded = await options.storage.write(archiveObject, content, {
        contentType,
        metadata: { ...metadata, sha256: digest, backupFile: "true" },
        ifGenerationMatch: null,
      });
      const verified = await options.storage.read(archiveObject);
      if (
        verified.data.length !== content.length ||
        sha256(verified.data) !== digest ||
        !uploaded.generation ||
        verified.generation !== uploaded.generation
      ) {
        throw new BackupEngineError(`Backup object verification failed for ${relativePath}`);
      }
      files.push({
        source,
        path: relativePath,
        archiveObject,
        bytes: content.length,
        sha256: digest,
        generation: uploaded.generation,
        contentType,
        metadata,
      });
    };

    const objects = await options.storage.list("");
    for (const item of objects) {
      if (item.key === ARCHIVE_ROOT || item.key.startsWith(`${ARCHIVE_ROOT}/`)) continue;
      if (item.size > MAX_FILE_BYTES) throw new BackupEngineError(`File exceeds the 256 MiB backup limit: ${item.key}`);
      const loaded = await options.storage.read(item.key);
      if (
        loaded.data.length !== item.size ||
        (item.generation !== null && loaded.generation !== item.generation)
      ) {
        throw new BackupEngineError(`App Storage file changed while it was being backed up: ${item.key}`);
      }
      await add("object", item.key, loaded.data, loaded.contentType ?? "application/octet-stream", loaded.metadata);
    }

    for (const root of configuredRoots) {
      const localFiles = await walkRoot(root);
      for (const file of localFiles) {
        if (file.size > MAX_FILE_BYTES) {
          throw new BackupEngineError(`File exceeds the 256 MiB backup limit: ${file.relativePath}`);
        }
        const content = await readFile(file.absolutePath);
        if (content.length !== file.size) throw new BackupEngineError(`File changed while it was being backed up: ${file.relativePath}`);
        await add(root.kind, file.relativePath, content, normalizeMimeType(null, file.relativePath), {});
      }
    }
    return { files, fileBytes };
  }

  async function readAndVerifyArchive(id: string, expectedSchemaHash?: string): Promise<VerifiedArchive> {
    checkBackupId(id);
    const manifestObject = await options.storage.read(manifestObjectKey(id));
    const manifest = parseManifest(manifestObject.data, id);
    if (
      manifest.databaseObject !== dbObjectKey(id) ||
      !/^[a-f0-9]{64}$/.test(manifest.schemaHash) ||
      !Number.isSafeInteger(manifest.rowCount) ||
      manifest.rowCount < 0 ||
      !Number.isSafeInteger(manifest.tableCount) ||
      manifest.tableCount < 0 ||
      !Number.isSafeInteger(manifest.fileCount) ||
      manifest.fileCount < 0 ||
      !Number.isSafeInteger(manifest.databaseBytes) ||
      manifest.databaseBytes < 0 ||
      !Number.isSafeInteger(manifest.fileBytes) ||
      manifest.fileBytes < 0
    ) {
      throw new BackupEngineError("Backup manifest contains invalid database or file metadata");
    }
    const dataObject = await options.storage.read(manifest.databaseObject);
    if (
      dataObject.data.length !== manifest.databaseCompressedBytes ||
      dataObject.generation !== manifest.databaseGeneration ||
      sha256(dataObject.data) !== manifest.databaseSha256 ||
      dataObject.data.length > MAX_ARCHIVE_DATABASE_BYTES
    ) {
      throw new BackupEngineError("Compressed database archive is missing, oversized, or corrupt");
    }
    let jsonBytes: Buffer;
    try {
      jsonBytes = gunzipSync(dataObject.data, { maxOutputLength: MAX_DATABASE_JSON_BYTES });
    } catch (error) {
      throw new BackupEngineError("Database archive failed decompression or exceeds its safety limit", { cause: error });
    }
    if (jsonBytes.length !== manifest.databaseBytes) throw new BackupEngineError("Database archive size does not match its manifest");
    let rawTables: unknown;
    try {
      rawTables = JSON.parse(jsonBytes.toString("utf8"));
    } catch (error) {
      throw new BackupEngineError("Database archive JSON is corrupt", { cause: error });
    }
    const tables = validateDatabasePayload(rawTables, manifest);
    if (expectedSchemaHash && manifest.schemaHash !== expectedSchemaHash) {
      throw new BackupEngineError("Backup database schema does not match the live database");
    }
    let fileBytes = 0;
    const seen = new Set<string>();
    for (const file of manifest.files) {
      if (
        !file ||
        !["object", "contracts", "attached_assets", "site-assets"].includes(file.source) ||
        typeof file.path !== "string" ||
        typeof file.archiveObject !== "string" ||
        typeof file.contentType !== "string" ||
        !file.metadata ||
        typeof file.metadata !== "object" ||
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        typeof file.generation !== "string" ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 0 ||
        file.bytes > MAX_FILE_BYTES
      ) {
        throw new BackupEngineError("Backup file record is invalid");
      }
      safeRelativePath(file.path);
      if (file.source === "object" && isBackupObjectPath(file.path)) {
        throw new BackupEngineError("Backup manifest attempts to recurse into its archive objects");
      }
      const recordKey = `${file.source}:${file.path}`;
      if (seen.has(recordKey)) throw new BackupEngineError("Backup manifest contains duplicate file paths");
      seen.add(recordKey);
      if (!file.archiveObject.startsWith(`${backupPrefix(id)}/files/`)) {
        throw new BackupEngineError("Backup file object is outside its private archive");
      }
      fileBytes += file.bytes;
      if (fileBytes > MAX_TOTAL_FILE_BYTES) throw new BackupEngineError("Backup files exceed the 5 GiB safety limit");
    }
    if (fileBytes !== manifest.fileBytes || manifest.fileCount !== manifest.files.length) {
      throw new BackupEngineError("Backup file totals do not match the manifest");
    }
    assertReferencedFiles(
      tables,
      manifest.files,
      new Set<FileSource>(["object", ...configuredRoots.map((root) => root.kind)]),
    );
    const tempDirectory = await mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "business-restore-"));
    const stagedFiles: VerifiedArchive["stagedFiles"] = [];
    try {
      for (let index = 0; index < manifest.files.length; index += 1) {
        const record = manifest.files[index]!;
        const stored = await options.storage.read(record.archiveObject);
        if (
          stored.data.length !== record.bytes ||
          sha256(stored.data) !== record.sha256 ||
          stored.generation !== record.generation ||
          (stored.metadata.sha256 && stored.metadata.sha256 !== record.sha256)
        ) {
          throw new BackupEngineError(`Backup file integrity check failed: ${record.path}`);
        }
        const stagedPath = path.join(tempDirectory, String(index));
        await writeFile(stagedPath, stored.data, { mode: 0o600, flag: "wx" });
        stagedFiles.push({ record, stagedPath });
      }
      if (expectedSchemaHash && manifest.schemaHash !== expectedSchemaHash) {
        throw new BackupEngineError("Backup database schema does not match the live database");
      }
      return { manifest, tables, stagedFiles, tempDirectory };
    } catch (error) {
      await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  async function listCurrentObjects() {
    return (await options.storage.list("")).filter((object) => !object.key.startsWith(`${ARCHIVE_ROOT}/`));
  }

  async function listLocalFiles() {
    const files: LocalFile[] = [];
    for (const root of configuredRoots) files.push(...await walkRoot(root));
    return files;
  }

  async function createLocalSnapshot(directory: string, files: LocalFile[]) {
    const saved: { root: BackupFileRoot; relativePath: string; stagedPath: string }[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]!;
      const stagedPath = path.join(directory, `local-${index}`);
      await copyFile(file.absolutePath, stagedPath);
      saved.push({ root: file.root, relativePath: file.relativePath, stagedPath });
    }
    return saved;
  }

  async function writeLocalFile(root: BackupFileRoot, relativePath: string, data: Buffer) {
    const safePath = safeRelativePath(relativePath);
    const base = await realpath(root.directory);
    const target = path.resolve(base, safePath);
    if (!target.startsWith(`${base}${path.sep}`)) throw new BackupEngineError("Restore path escaped its configured root");
    let current = base;
    for (const component of safePath.split("/").slice(0, -1)) {
      current = path.join(current, component);
      try {
        const info = await lstat(current);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new BackupEngineError("Refusing to restore through a symlink");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await mkdir(current, { mode: 0o700 });
      }
    }
    const tempName = `${target}.restore-${randomUUID()}`;
    await writeFile(tempName, data, { mode: 0o600, flag: "wx" });
    await rename(tempName, target);
  }

  async function restoreFiles(archive: VerifiedArchive): Promise<{
    rollback: () => Promise<void>;
    finalize: () => Promise<void>;
  }> {
    const currentObjects = await listCurrentObjects();
    const currentLocals = await listLocalFiles();
    const localSnapshotDir = await mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "business-restore-rollback-"));
    const oldLocals = await createLocalSnapshot(localSnapshotDir, currentLocals);
    const rollbackPrefix = `${backupPrefix(archive.manifest.id)}/restore-rollback/${randomUUID()}`;
    const oldObjects: { key: string; rollbackKey: string; contentType: string; metadata: Record<string, string> }[] = [];
    try {
      for (const object of currentObjects) {
        const current = await options.storage.read(object.key);
        if (current.data.length !== object.size) throw new BackupEngineError(`App Storage file changed before restore: ${object.key}`);
        const rollbackKey = `${rollbackPrefix}/${String(oldObjects.length).padStart(6, "0")}`;
        await options.storage.write(rollbackKey, current.data, {
          contentType: current.contentType ?? "application/octet-stream",
          metadata: current.metadata,
          ifGenerationMatch: null,
        });
        oldObjects.push({
          key: object.key,
          rollbackKey,
          contentType: current.contentType ?? "application/octet-stream",
          metadata: current.metadata,
        });
      }
      const archivedObjectKeys = new Set(
        archive.stagedFiles.filter((item) => item.record.source === "object").map((item) => item.record.path),
      );
      const archivedLocalKeys = new Set(
        archive.stagedFiles
          .filter((item) => item.record.source !== "object")
          .map((item) => `${item.record.source}:${item.record.path}`),
      );
      if ([...archivedObjectKeys].some((key) => key === ARCHIVE_ROOT || key.startsWith(`${ARCHIVE_ROOT}/`))) {
        throw new BackupEngineError("Backup attempts to restore over its private archive prefix");
      }

      try {
        for (const item of archive.stagedFiles) {
          const data = await readFile(item.stagedPath);
          if (item.record.source === "object") {
            await options.storage.write(item.record.path, data, {
              contentType: item.record.contentType,
              metadata: item.record.metadata,
            });
          } else {
            const root = configuredRoots.find((candidate) => candidate.kind === item.record.source);
            if (!root) throw new BackupEngineError(`Backup requires unconfigured ${item.record.source} storage`);
            await writeLocalFile(root, item.record.path, data);
          }
        }
        for (const object of currentObjects) {
          if (!archivedObjectKeys.has(object.key)) await options.storage.delete(object.key, object.generation);
        }
        for (const file of currentLocals) {
          if (!archivedLocalKeys.has(`${file.root.kind}:${file.relativePath}`)) {
            await rm(file.absolutePath);
          }
        }
      } catch (error) {
        await rollbackFiles(oldObjects, oldLocals, currentObjects, currentLocals).catch((rollbackError) => {
          throw new BackupRecoveryRequiredError(undefined, { cause: rollbackError });
        });
        throw error;
      }
      return {
        rollback: async () => {
          await rollbackFiles(oldObjects, oldLocals, currentObjects, currentLocals);
          await rm(localSnapshotDir, { recursive: true, force: true });
        },
        finalize: async () => {
          await Promise.all(oldObjects.map((item) => options.storage.delete(item.rollbackKey).catch((error) => {
            throw new BackupEngineError("Could not remove private restore rollback data", { cause: error });
          })));
          await rm(localSnapshotDir, { recursive: true, force: true });
        },
      };
    } catch (error) {
      if (!(error instanceof BackupRecoveryRequiredError)) {
        await Promise.all(oldObjects.map((item) => options.storage.delete(item.rollbackKey).catch(() => undefined)));
        await rm(localSnapshotDir, { recursive: true, force: true }).catch(() => undefined);
      }
      throw error;
    }
  }

  async function rollbackFiles(
    oldObjects: { key: string; rollbackKey: string; contentType: string; metadata: Record<string, string> }[],
    oldLocals: { root: BackupFileRoot; relativePath: string; stagedPath: string }[],
    currentObjects: StoredObject[],
    currentLocals: LocalFile[],
  ) {
    const originalObjectKeys = new Set(oldObjects.map((item) => item.key));
    for (const object of await listCurrentObjects()) {
      if (!originalObjectKeys.has(object.key)) await options.storage.delete(object.key, object.generation);
    }
    for (const saved of oldObjects) {
      const contents = await options.storage.read(saved.rollbackKey);
      await options.storage.write(saved.key, contents.data, {
        contentType: saved.contentType,
        metadata: saved.metadata,
      });
    }
    const originalLocalKeys = new Set(oldLocals.map((item) => `${item.root.kind}:${item.relativePath}`));
    for (const file of await listLocalFiles()) {
      if (!originalLocalKeys.has(`${file.root.kind}:${file.relativePath}`)) await rm(file.absolutePath);
    }
    for (const file of oldLocals) {
      await writeLocalFile(file.root, file.relativePath, await readFile(file.stagedPath));
    }
    await Promise.all(oldObjects.map((item) => options.storage.delete(item.rollbackKey).catch(() => undefined)));
    void currentObjects;
    void currentLocals;
  }

  async function archiveRows(client: BackupDbClient, tables: TableInfo[]): Promise<{ tables: TableArchive[]; excluded: BackupManifest["exclusions"]["tables"] }> {
    const restorable = tables.filter((table) => classifyTable(table.name) === "restore" && table.columns.length);
    const tableNames = restorable.map((table) => qualifiedTable(table.name));
    if (tableNames.length) await client.query(`LOCK TABLE ${tableNames.join(", ")} IN SHARE MODE`);
    const archived: TableArchive[] = [];
    for (const table of restorable) {
      const names = table.columns.map((column) => column.name);
      const selection = names.map((name) => `${quoteIdentifier(name)}::text AS ${quoteIdentifier(name)}`).join(", ");
      const result = await client.query(`SELECT ${selection} FROM ${qualifiedTable(table.name)}`);
      const rows = result.rows.map((row) => names.map((name) => {
        const value = row[name];
        return value === null || value === undefined ? null : String(value);
      }));
      archived.push({ name: table.name, columns: names, rows });
    }
    const excluded = tables.flatMap((table) => {
      const reason = protectedTableReason(table.name);
      if (reason) return [{ name: table.name, reason }];
      if (classifyTable(table.name) === "clear") return [{ name: table.name, reason: "ephemeral sessions or provider delivery/idempotency state is not restored" }];
      return [];
    });
    return { tables: archived, excluded };
  }

  async function listForeignKeys(client: BackupDbClient) {
    const result = await client.query(`
      SELECT source.relname AS source_table, target.relname AS target_table,
             con.conname AS constraint_name, con.condeferrable AS deferrable
        FROM pg_constraint con
        JOIN pg_class source ON source.oid = con.conrelid
        JOIN pg_namespace sn ON sn.oid = source.relnamespace
        JOIN pg_class target ON target.oid = con.confrelid
        JOIN pg_namespace tn ON tn.oid = target.relnamespace
       WHERE con.contype = 'f' AND sn.nspname = 'public' AND tn.nspname = 'public'
       ORDER BY source.relname, target.relname, con.conname
    `);
    return result.rows.map((row) => ({
      source: String(row.source_table),
      target: String(row.target_table),
      name: String(row.constraint_name),
      deferrable: Boolean(row.deferrable),
    }));
  }

  async function lockRestoreTables(client: BackupDbClient, allTables: TableInfo[]) {
    const mutating = allTables
      .filter((table) => classifyTable(table.name) !== "preserve")
      .map((table) => table.name)
      .sort();
    const mutatingSet = new Set(mutating);
    const foreignKeys = await listForeignKeys(client);
    const unsafeReferences = foreignKeys.filter((key) => mutatingSet.has(key.target) && !mutatingSet.has(key.source));
    if (unsafeReferences.length) {
      throw new BackupEngineError(
        `Restore would alter data referenced by protected tables: ${unsafeReferences.map((item) => `${item.source}.${item.name}`).join(", ")}`,
      );
    }
    const qualifiedNames = mutating.map(qualifiedTable);
    if (qualifiedNames.length) {
      await client.query(`LOCK TABLE ${qualifiedNames.join(", ")} IN ACCESS EXCLUSIVE MODE`);
    }
  }

  function insertionOrder(names: string[], foreignKeys: { source: string; target: string }[]) {
    const included = new Set(names);
    const incoming = new Map(names.map((name) => [name, 0]));
    const children = new Map(names.map((name) => [name, [] as string[]]));
    for (const key of foreignKeys) {
      if (included.has(key.source) && included.has(key.target) && key.source !== key.target) {
        children.get(key.target)!.push(key.source);
        incoming.set(key.source, incoming.get(key.source)! + 1);
      }
    }
    const ready = names.filter((name) => incoming.get(name) === 0).sort();
    const ordered: string[] = [];
    while (ready.length) {
      const current = ready.shift()!;
      ordered.push(current);
      for (const child of children.get(current)!) {
        incoming.set(child, incoming.get(child)! - 1);
        if (incoming.get(child) === 0) {
          ready.push(child);
          ready.sort();
        }
      }
    }
    for (const name of names.sort()) if (!ordered.includes(name)) ordered.push(name);
    return ordered;
  }

  async function clearAndRestoreDatabase(client: BackupDbClient, tables: TableArchive[], allTables: TableInfo[]) {
    const targetNames = allTables.filter((table) => classifyTable(table.name) === "restore").map((table) => table.name);
    const clearNames = allTables.filter((table) => classifyTable(table.name) === "clear").map((table) => table.name);
    const mutating = [...new Set([...targetNames, ...clearNames])].sort();
      const foreignKeys = await listForeignKeys(client);
    const mutatingSet = new Set(mutating);
    const unsafeReferences = foreignKeys.filter((key) => mutatingSet.has(key.target) && !mutatingSet.has(key.source));
    if (unsafeReferences.length) {
      throw new BackupEngineError(
        `Restore would alter data referenced by protected tables: ${unsafeReferences.map((item) => `${item.source}.${item.name}`).join(", ")}`,
      );
    }
    const lockNames = mutating.map(qualifiedTable);
    if (lockNames.length) await client.query(`LOCK TABLE ${lockNames.join(", ")} IN ACCESS EXCLUSIVE MODE`);

    const sequenceFloors: { table: string; column: string; sequence: string; tableMaximum: string | null; sequenceMaximum: string | null }[] = [];
    for (const table of allTables) {
      if (!mutatingSet.has(table.name)) continue;
      for (const column of table.columns) {
        const sequence = await client.query("SELECT pg_get_serial_sequence($1, $2) AS sequence", [`public.${table.name}`, column.name]);
        const sequenceName = sequence.rows[0]?.sequence;
        if (!sequenceName) continue;
        const [tableMaximum, sequenceMaximum] = await Promise.all([
          client.query(`SELECT max(${quoteIdentifier(column.name)})::text AS max_value FROM ${qualifiedTable(table.name)}`),
          client.query("SELECT pg_sequence_last_value($1::regclass)::text AS max_value", [sequenceName]),
        ]);
        sequenceFloors.push({
          table: table.name,
          column: column.name,
          sequence: String(sequenceName),
          tableMaximum: tableMaximum.rows[0]?.max_value == null ? null : String(tableMaximum.rows[0].max_value),
          sequenceMaximum: sequenceMaximum.rows[0]?.max_value == null ? null : String(sequenceMaximum.rows[0].max_value),
        });
      }
    }

    // TRUNCATE is set-based, handles FK cycles among restored business tables, and
    // does not remove or disable the permanent posted-ledger immutability triggers.
    if (lockNames.length) await client.query(`TRUNCATE TABLE ${lockNames.join(", ")}`);
    await client.query("SET CONSTRAINTS ALL DEFERRED");

    const archived = new Map(tables.map((table) => [table.name, table]));
    const schemaByName = new Map(allTables.map((table) => [table.name, table]));
    const ordered = insertionOrder([...archived.keys()], foreignKeys);
    for (const name of ordered) {
      const table = archived.get(name)!;
      const schema = schemaByName.get(name);
      if (!schema) throw new BackupEngineError(`Backup table no longer exists: ${name}`);
      if (JSON.stringify(table.columns) !== JSON.stringify(schema.columns.map((column) => column.name))) {
        throw new BackupEngineError(`Backup columns do not match the live schema for ${name}`);
      }
      const insertIndexes = schema.columns
        .map((column, index) => ({ column, index }))
        .filter(({ column }) => !column.generated);
      if (table.rows.length && !insertIndexes.length) {
        throw new BackupEngineError(`Cannot restore generated-only table ${name}`);
      }
      const quotedColumns = insertIndexes.map(({ column }) => quoteIdentifier(column.name));
      const journalEntries = name === "journal_entries";
      const statusIndex = journalEntries ? table.columns.indexOf("status") : -1;
      const reversalIndex = journalEntries ? table.columns.indexOf("reversal_of_entry_id") : -1;
      const batchSize = Math.max(1, Math.floor(500 / Math.max(1, schema.columns.length)));
      for (let start = 0; start < table.rows.length; start += batchSize) {
        const slice = table.rows.slice(start, start + batchSize);
        const values: unknown[] = [];
        const tuples = slice.map((row) => {
          const cells = insertIndexes.map(({ column, index }) => {
            const value = row[index] ?? null;
            let storedValue = value;
            if (journalEntries && statusIndex >= 0 && ["posted", "reversed"].includes(storedValue ?? "")) storedValue = "draft";
            if (journalEntries && reversalIndex >= 0) storedValue = index === reversalIndex ? null : storedValue;
            values.push(storedValue);
            return `$${values.length}::${column.type}`;
          });
          return `(${cells.join(", ")})`;
        });
        const overrideIdentity = insertIndexes.some(({ column }) => column.identity !== "");
        await client.query(
          `INSERT INTO ${qualifiedTable(name)} (${quotedColumns.join(", ")})${overrideIdentity ? " OVERRIDING SYSTEM VALUE" : ""} VALUES ${tuples.join(", ")}`,
          values,
        );
      }
      if (table.rows.length && journalEntries && statusIndex >= 0) {
        const statusColumn = quoteIdentifier("status");
        const idColumn = quoteIdentifier("id");
        for (const row of table.rows) {
          const oldStatus = row[statusIndex];
          if (!["posted", "reversed"].includes(oldStatus ?? "")) continue;
          const id = row[table.columns.indexOf("id")];
          if (id === undefined || id === null) throw new BackupEngineError("Journal entry archive lacks its primary id");
          const setParts = [`${statusColumn} = $1::${schemaByName.get(name)!.columns.find((col) => col.name === "status")!.type}`];
          const values: unknown[] = [oldStatus, id];
          if (reversalIndex >= 0) {
            setParts.push(`${quoteIdentifier("reversal_of_entry_id")} = $3::${schemaByName.get(name)!.columns[reversalIndex]!.type}`);
            values.push(row[reversalIndex]);
          }
          await client.query(`UPDATE ${qualifiedTable(name)} SET ${setParts.join(", ")} WHERE ${idColumn} = $2`, values);
        }
      }
    }

    // Existing sequences are deliberately never restarted or set below their current
    // value: IDs seen by external systems cannot be reused after restoring an older snapshot.
    for (const floor of sequenceFloors) {
      const restoredMaximum = await client.query(
        `SELECT max(${quoteIdentifier(floor.column)})::text AS max_value FROM ${qualifiedTable(floor.table)}`,
      );
      await client.query(
        `SELECT setval($1::regclass, GREATEST(COALESCE(pg_sequence_last_value($1::regclass), 1), COALESCE($2::bigint, 1), COALESCE($3::bigint, 1), COALESCE($4::bigint, 1)), true)`,
        [floor.sequence, floor.sequenceMaximum, floor.tableMaximum, restoredMaximum.rows[0]?.max_value ?? null],
      );
    }
  }

  async function runBackup(input: { id: string; reason: BackupReason; actorId: number | null }): Promise<BackupSummary> {
    const id = checkBackupId(input.id);
    if (!["manual", "scheduled", "pre_restore"].includes(input.reason)) throw new BackupEngineError("Invalid backup reason");
    if (input.actorId !== null && (!Number.isSafeInteger(input.actorId) || input.actorId < 1)) {
      throw new BackupEngineError("Invalid backup actor identifier");
    }
    return withOperationLock(async (client) => {
      const tables = await introspectTables(client);
      const schemaHash = await currentSchemaHash(client);
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      let committed = false;
      try {
        await client.query("SET LOCAL lock_timeout = '30s'");
        await client.query("SET LOCAL statement_timeout = '120s'");
        const rows = await archiveRows(client, tables);
        const lockedSchemaHash = await currentSchemaHash(client);
        if (lockedSchemaHash !== schemaHash) throw new BackupEngineError("Database schema changed while the backup was locking business tables");
        const payload = Buffer.from(JSON.stringify(rows.tables), "utf8");
        if (payload.length > MAX_DATABASE_JSON_BYTES) throw new BackupEngineError("Database exceeds the 256 MiB backup safety limit");
        const compressed = gzipSync(payload, { level: 9 });
        if (compressed.length > MAX_ARCHIVE_DATABASE_BYTES) throw new BackupEngineError("Compressed database archive exceeds the 256 MiB storage limit");
        const files = await captureFiles(id);
        assertReferencedFiles(
          rows.tables,
          files.files,
          new Set<FileSource>(["object", ...configuredRoots.map((root) => root.kind)]),
        );
        const databaseObject = dbObjectKey(id);
        const uploadedDatabase = await options.storage.write(databaseObject, compressed, {
          contentType: "application/gzip",
          metadata: { sha256: sha256(compressed), backupId: id },
          ifGenerationMatch: null,
        });
        const storedDatabase = await options.storage.read(databaseObject);
        if (
          sha256(storedDatabase.data) !== sha256(compressed) ||
          !uploadedDatabase.generation ||
          storedDatabase.generation !== uploadedDatabase.generation
        ) {
          throw new BackupEngineError("Compressed database object verification failed");
        }
        const rowCount = rows.tables.reduce((sum, table) => sum + table.rows.length, 0);
        const manifest: BackupManifest = {
          format: "replit-business-backup",
          version: ARCHIVE_VERSION,
          id,
          reason: input.reason,
          actorId: input.actorId,
          createdAt: now().toISOString(),
          schemaHash,
          databaseObject,
          databaseGeneration: uploadedDatabase.generation,
          databaseSha256: sha256(compressed),
          databaseCompressedBytes: compressed.length,
          databaseBytes: payload.length,
          rowCount,
          tableCount: rows.tables.length,
          fileCount: files.files.length,
          fileBytes: files.fileBytes,
          files: files.files,
          tables: rows.tables.map(({ name, columns, rows: tableRows }) => ({ name, rowCount: tableRows.length, columns })),
          exclusions: {
            policy: BACKUP_EXCLUSIONS,
            tables: rows.excluded,
            files: [
              `App Storage root: ${backupRoot}; its backups/ prefix is excluded from file enumeration.`,
              ...configuredRoots.map((root) => `${root.kind}: ${root.directory}`),
            ],
          },
        };
        const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
        if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new BackupEngineError("Backup manifest exceeds the 32 MiB safety limit");
        const uploadedManifest = await options.storage.write(manifestObjectKey(id), manifestBytes, {
          contentType: "application/json",
          metadata: { backupId: id, version: String(ARCHIVE_VERSION) },
          ifGenerationMatch: null,
        });
        const verifiedManifest = await options.storage.read(manifestObjectKey(id));
        if (
          !uploadedManifest.generation ||
          verifiedManifest.generation !== uploadedManifest.generation ||
          !verifiedManifest.data.equals(manifestBytes)
        ) {
          throw new BackupEngineError("Backup manifest verification failed");
        }
        await client.query("COMMIT");
        committed = true;
        return {
          rowCount,
          tableCount: rows.tables.length,
          fileCount: files.files.length,
          bytes: payload.length + files.fileBytes,
          schemaHash,
        };
      } catch (error) {
        if (!committed) await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });
  }

  async function inspectBackup(id: string): Promise<BackupInspection> {
    checkBackupId(id);
    const client = await options.pool.connect();
    try {
      const currentHash = await currentSchemaHash(client);
      const archive = await readAndVerifyArchive(id);
      try {
        return {
          rowCount: archive.manifest.rowCount,
          tableCount: archive.manifest.tableCount,
          fileCount: archive.manifest.fileCount,
          bytes: archive.manifest.databaseBytes + archive.manifest.fileBytes,
          schemaHash: archive.manifest.schemaHash,
          createdAt: archive.manifest.createdAt,
          compatible: archive.manifest.schemaHash === currentHash,
        };
      } finally {
        await rm(archive.tempDirectory, { recursive: true, force: true });
      }
    } finally {
      client.release();
    }
  }

  async function runRestore(id: string): Promise<void> {
    checkBackupId(id);
    await withOperationLock(async (client) => {
      const schemaHash = await currentSchemaHash(client);
      const tables = await introspectTables(client);
      // Every archive object, file checksum, path and schema fingerprint is verified,
      // and file contents are staged locally, before a live file or database changes.
      const archive = await readAndVerifyArchive(id, schemaHash);
      const liveTables = tables.filter((table) => classifyTable(table.name) === "restore");
      const liveTableNames = liveTables.map((table) => table.name).sort();
      const archiveTableNames = archive.tables.map((table) => table.name).sort();
      if (JSON.stringify(liveTableNames) !== JSON.stringify(archiveTableNames)) {
        await rm(archive.tempDirectory, { recursive: true, force: true });
        throw new BackupEngineError("Backup business-table set does not match the live database");
      }
      for (const archivedTable of archive.tables) {
        const liveTable = liveTables.find((table) => table.name === archivedTable.name)!;
        if (JSON.stringify(liveTable.columns.map((column) => column.name)) !== JSON.stringify(archivedTable.columns)) {
          await rm(archive.tempDirectory, { recursive: true, force: true });
          throw new BackupEngineError(`Backup table schema does not match live table ${archivedTable.name}`);
        }
      }
      let rollbackFiles: Awaited<ReturnType<typeof restoreFiles>> | undefined;
      let committed = false;
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout = '30s'");
        await client.query("SET LOCAL statement_timeout = '120s'");
        await client.query("SET LOCAL search_path = pg_catalog, public");
        // Prevent business-table writers before the first live file is replaced.
        await lockRestoreTables(client, tables);
        const lockedSchemaHash = await currentSchemaHash(client);
        if (lockedSchemaHash !== archive.manifest.schemaHash) {
          throw new BackupEngineError("Database schema changed before restore acquired its write locks");
        }
        rollbackFiles = await restoreFiles(archive);
        await clearAndRestoreDatabase(client, archive.tables, tables);
        await client.query("COMMIT");
        committed = true;
      } catch (error) {
        let databaseRollbackError: unknown;
        if (!committed) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            databaseRollbackError = rollbackError;
          }
        }
        if (!committed && rollbackFiles) {
          try {
            await rollbackFiles.rollback();
          } catch (rollbackError) {
            throw new BackupRecoveryRequiredError(undefined, { cause: rollbackError });
          }
        }
        if (databaseRollbackError) {
          throw new BackupRecoveryRequiredError(
            "Database rollback could not be confirmed; keep maintenance mode enabled for operator recovery",
            { cause: databaseRollbackError },
          );
        }
        throw error;
      } finally {
        await rm(archive.tempDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
      await rollbackFiles?.finalize();
    });
  }

  async function probeBackupStorage(): Promise<{ ready: boolean; reason: string | null }> {
    try {
      const client = await options.pool.connect();
      try {
        await client.query("SELECT 1");
      } finally {
        client.release();
      }
      await options.storage.list("");
      for (const root of configuredRoots) {
        if (root.kind === "contracts") await walkRoot(root);
        else {
          try {
            await walkRoot(root);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
      }
      return { ready: true, reason: null };
    } catch (error) {
      return {
        ready: false,
        reason: error instanceof Error ? error.message : "Backup storage could not be verified",
      };
    }
  }

  return { runBackup, inspectBackup, runRestore, probeBackupStorage };
}

export function appAssetRoots(moduleDirectory: string, env: NodeJS.ProcessEnv = process.env): BackupFileRoot[] {
  const attachedCandidates = [
    path.resolve(moduleDirectory, "../../../attached_assets"),
    path.resolve(moduleDirectory, "../../../../../attached_assets"),
  ];
  const siteCandidates = [
    path.resolve(moduleDirectory, "../../musk-ellolo/public/site-assets"),
    path.resolve(moduleDirectory, "../../../musk-ellolo/public/site-assets"),
  ];
  const firstExisting = (paths: string[]) => paths.find((candidate) => existsSync(candidate)) ?? paths[0]!;
  const roots: BackupFileRoot[] = [];
  const localContracts = env.LOCAL_CONTRACT_STORAGE_DIR?.trim();
  if (localContracts) roots.push({ kind: "contracts", directory: localContracts });
  roots.push({
    kind: "attached_assets",
    directory: firstExisting(attachedCandidates),
  });
  roots.push({
    kind: "site-assets",
    directory: firstExisting(siteCandidates),
  });
  return roots;
}

export function privateStorageRoot(raw: string | undefined): string {
  if (!raw?.trim()) throw new BackupEngineError("PRIVATE_OBJECT_DIR must be configured for private off-database backup storage");
  const cleaned = raw.trim().replace(/^\/+|\/+$/g, "");
  const parts = cleaned.split("/");
  if (parts.length < 1 || parts.some((part) => !part || part === "." || part === "..")) {
    throw new BackupEngineError("PRIVATE_OBJECT_DIR is not a valid private App Storage path");
  }
  return cleaned;
}

export function createBackupId() {
  return randomUUID();
}