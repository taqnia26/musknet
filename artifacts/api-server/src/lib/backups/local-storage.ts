import { createHash, randomUUID } from "node:crypto";
import { constants, type BigIntStats, type Stats } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import type { BackupObjectStorage, StoredObject } from "./engine";

const MAGIC = Buffer.from("LBK2");
const HEADER_PREFIX_SIZE = 8;
const HEADER_FORMAT = "local-backup-object-v2";
const MAX_HEADER_BYTES = 2 * 1024 * 1024;
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_RETRY_MS = 10;
const MAX_METADATA_BYTES = 1024 * 1024;

type LocalHeader = {
  format: typeof HEADER_FORMAT;
  root: string;
  key: string;
  size: number;
  generation: string;
  timeCreated: string;
  contentType: string;
  metadata: Record<string, string>;
  sha256: string;
};

type LocalObject = {
  header: LocalHeader;
  effectiveGeneration: string;
  data?: Buffer;
};

class MissingObjectError extends Error {
  constructor(key: string) {
    super(`Local backup object does not exist: ${key}`);
    this.name = "MissingObjectError";
  }
}

function hash(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function validLogicalName(value: string, description: string) {
  if (
    !value ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Invalid local backup ${description}`);
  }
  return value;
}

function objectReadLimit(key: string) {
  if (key.endsWith("/manifest.json")) return 32 * 1024 * 1024;
  if (key.endsWith("/database.json.gz")) return 256 * 1024 * 1024;
  return 256 * 1024 * 1024;
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as NodeJS.ErrnoException).code
    : undefined;
}

function sameLockStat(left: Stats, right: Stats) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function sameObjectStat(left: BigIntStats, right: BigIntStats) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function objectStatToken(stat: BigIntStats) {
  return [
    stat.dev.toString(),
    stat.ino.toString(),
    stat.size.toString(),
    stat.mode.toString(),
    stat.nlink.toString(),
    stat.mtimeNs.toString(),
    stat.ctimeNs.toString(),
  ].join(":");
}

function portableGeneration(header: LocalHeader, headerBytes: Buffer) {
  return hash(Buffer.concat([Buffer.from(`${header.generation}:`, "utf8"), headerBytes]));
}

function checkedMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Corrupt local backup object metadata");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([, item]) => typeof item !== "string")) {
    throw new Error("Corrupt local backup object metadata");
  }
  const metadata = Object.fromEntries(entries) as Record<string, string>;
  if (Buffer.byteLength(JSON.stringify(metadata), "utf8") > MAX_METADATA_BYTES) {
    throw new Error("Local backup object metadata exceeds its configured limit");
  }
  return metadata;
}

async function syncDirectory(directory: string) {
  const handle = await open(directory, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function assertPrivateDirectoryStat(stat: Stats | BigIntStats) {
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Local backup storage path contains a non-directory or symbolic link");
  }
  const mode = typeof stat.mode === "bigint" ? Number(stat.mode & 0o777n) : stat.mode & 0o777;
  if (mode !== 0o700) {
    throw new Error("Local backup storage directory permissions must be 700; refusing to chmod an existing directory");
  }
}

function assertPrivateObjectStat(stat: BigIntStats) {
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Local backup object is not a regular file");
  }
  if ((stat.mode & 0o777n) !== 0o600n || stat.nlink !== 1n) {
    throw new Error("Local backup object permissions or link count are unsafe");
  }
}

async function readExactly(
  handle: Awaited<ReturnType<typeof open>>,
  length: number,
  position: number,
) {
  const buffer = Buffer.allocUnsafe(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
    if (bytesRead === 0) throw new Error("Truncated local backup object envelope");
    offset += bytesRead;
  }
  return buffer;
}

function parseHeader(bytes: Buffer): LocalHeader {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Corrupt local backup object header");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Corrupt local backup object header");
  }
  const candidate = value as Partial<LocalHeader>;
  if (
    candidate.format !== HEADER_FORMAT ||
    typeof candidate.root !== "string" ||
    typeof candidate.key !== "string" ||
    !Number.isSafeInteger(candidate.size) ||
    (candidate.size as number) < 0 ||
    typeof candidate.generation !== "string" ||
    !candidate.generation ||
    typeof candidate.timeCreated !== "string" ||
    Number.isNaN(Date.parse(candidate.timeCreated)) ||
    typeof candidate.contentType !== "string" ||
    Buffer.byteLength(candidate.contentType, "utf8") > 16 * 1024 ||
    typeof candidate.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(candidate.sha256)
  ) {
    throw new Error("Corrupt local backup object header");
  }
  const metadata = checkedMetadata(candidate.metadata);
  return { ...candidate, metadata } as LocalHeader;
}

export class LocalBackupStorage implements BackupObjectStorage {
  readonly objectRoots: readonly string[];
  private readonly baseDirectory: string;
  private readonly privateRoot: string;
  private readonly seenObjectStats = new Map<string, string>();

  constructor(directory: string, privateRoot = "local", additionalRoots: readonly string[] = []) {
    if (!directory.trim()) throw new Error("Local backup storage directory must be configured");
    this.baseDirectory = path.resolve(directory);
    this.privateRoot = validLogicalName(privateRoot, "root");
    this.objectRoots = Object.freeze(
      [...new Set([this.privateRoot, ...additionalRoots.map((root) => validLogicalName(root, "root"))])],
    );
  }

  private getRoot(root?: string) {
    const selected = root ?? this.privateRoot;
    if (!this.objectRoots.includes(selected)) {
      throw new Error("Local backup root is not configured");
    }
    return selected;
  }

  private validateKey(key: string) {
    return validLogicalName(key, "object key");
  }

  private async ensureBaseDirectory() {
    const parsed = path.parse(this.baseDirectory);
    let current = parsed.root;
    const components = this.baseDirectory.slice(parsed.root.length).split(path.sep).filter(Boolean);
    for (let index = 0; index < components.length; index += 1) {
      current = path.join(current, components[index]!);
      const isBase = index === components.length - 1;
      let created = false;
      let currentStat: Stats;
      try {
        currentStat = await lstat(current);
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
        try {
          await mkdir(current, { mode: 0o700 });
          created = true;
        } catch (createError) {
          if (errorCode(createError) !== "EEXIST") throw createError;
        }
        currentStat = await lstat(current);
      }
      if (!currentStat.isDirectory() || currentStat.isSymbolicLink()) {
        throw new Error("Local backup storage path contains a non-directory or symbolic link");
      }
      if (created) {
        await chmod(current, 0o700);
        currentStat = await lstat(current);
      }
      if (isBase) assertPrivateDirectoryStat(currentStat);
      if (created) await syncDirectory(path.dirname(current));
    }
  }

  private async ensurePrivateDirectory(directory: string, parentDirectory: string) {
    let created = false;
    try {
      await mkdir(directory, { mode: 0o700 });
      created = true;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }
    let directoryStat = await lstat(directory);
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      throw new Error("Local backup storage path contains a non-directory or symbolic link");
    }
    if (created) {
      await chmod(directory, 0o700);
      directoryStat = await lstat(directory);
    }
    assertPrivateDirectoryStat(directoryStat);
    if (created) await syncDirectory(parentDirectory);
  }

  private async ensureObjectDirectory(root: string) {
    const objectsDirectory = path.join(this.baseDirectory, ".objects");
    await this.ensurePrivateDirectory(objectsDirectory, this.baseDirectory);
    const directory = path.join(objectsDirectory, hash(root));
    await this.ensurePrivateDirectory(directory, objectsDirectory);
    return directory;
  }

  private objectPath(directory: string, key: string) {
    return path.join(directory, `${hash(key)}.lbk`);
  }

  private seenStatKey(root: string, key: string) {
    return `${root}\0${key}`;
  }

  private async acquireLock() {
    await this.ensureBaseDirectory();
    const lockPath = path.join(this.baseDirectory, ".backup-storage.lock");
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (true) {
      try {
        await mkdir(lockPath, { mode: 0o700 });
        await chmod(lockPath, 0o700);
        await syncDirectory(this.baseDirectory);
        const stat = await lstat(lockPath);
        assertPrivateDirectoryStat(stat);
        return { lockPath, stat };
      } catch (error) {
        if (errorCode(error) !== "EEXIST") throw error;
        let stat: Stats;
        try {
          stat = await lstat(lockPath);
        } catch (lockError) {
          if (errorCode(lockError) === "ENOENT") continue;
          throw lockError;
        }
        if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) {
          throw new Error("Local backup storage lock is not a safe private directory");
        }
        if (Date.now() >= deadline) {
          throw new Error("Local backup storage lock is held; refusing to evict a possibly abandoned lock");
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
      }
    }
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const lock = await this.acquireLock();
    try {
      return await operation();
    } finally {
      const current = await lstat(lock.lockPath);
      if (!current.isDirectory() || current.isSymbolicLink() || !sameLockStat(lock.stat, current)) {
        throw new Error("Local backup storage lock changed ownership; refusing to remove it");
      }
      await rmdir(lock.lockPath);
      await syncDirectory(this.baseDirectory);
    }
  }

  private async readEnvelope(
    filePath: string,
    root: string,
    expectedKey?: string,
    includeData = true,
  ): Promise<LocalObject> {
    let beforePath: BigIntStats;
    try {
      beforePath = await lstat(filePath, { bigint: true });
    } catch (error) {
      if (errorCode(error) === "ENOENT") throw new MissingObjectError(expectedKey ?? filePath);
      throw error;
    }
    assertPrivateObjectStat(beforePath);

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      try {
        handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      } catch (error) {
        if (errorCode(error) === "ENOENT" || errorCode(error) === "ELOOP") {
          throw new Error("Local backup object changed while it was being read");
        }
        throw error;
      }
      const before = await handle.stat({ bigint: true });
      assertPrivateObjectStat(before);
      if (!sameObjectStat(beforePath, before)) {
        throw new Error("Local backup object changed while it was being read");
      }
      const maximumFileSize = 256 * 1024 * 1024 + MAX_HEADER_BYTES + HEADER_PREFIX_SIZE;
      if (before.size > BigInt(maximumFileSize) || before.size < BigInt(HEADER_PREFIX_SIZE)) {
        throw new Error("Local backup object exceeds its configured read limit or is truncated");
      }

      const prefix = await readExactly(handle, HEADER_PREFIX_SIZE, 0);
      if (!prefix.subarray(0, MAGIC.length).equals(MAGIC)) {
        throw new Error("Corrupt local backup object file signature");
      }
      const headerLength = prefix.readUInt32BE(MAGIC.length);
      if (headerLength === 0 || headerLength > MAX_HEADER_BYTES) {
        throw new Error("Corrupt local backup object header length");
      }
      const payloadOffset = HEADER_PREFIX_SIZE + headerLength;
      if (BigInt(payloadOffset) > before.size) {
        throw new Error("Truncated local backup object header");
      }
      const headerBytes = await readExactly(handle, headerLength, HEADER_PREFIX_SIZE);
      const header = parseHeader(headerBytes);
      const key = this.validateKey(header.key);
      if (header.root !== root || (expectedKey !== undefined && key !== expectedKey)) {
        throw new Error("Local backup object identity does not match its storage path");
      }
      if (header.size > objectReadLimit(key)) {
        throw new Error("Local backup object exceeds its configured read limit");
      }
      if (BigInt(header.size) !== before.size - BigInt(payloadOffset)) {
        throw new Error("Local backup object payload length does not match its header");
      }

      const seenStatKey = this.seenStatKey(root, key);
      const currentStatToken = objectStatToken(before);
      const mustVerifyPayload =
        includeData ||
        (this.seenObjectStats.has(seenStatKey) &&
          this.seenObjectStats.get(seenStatKey) !== currentStatToken);
      let data: Buffer | undefined;
      if (mustVerifyPayload) {
        data = await readExactly(handle, header.size, payloadOffset);
        if (hash(data) !== header.sha256) {
          throw new Error("Local backup object digest does not match its stored bytes");
        }
      }

      // Recheck after parsing and payload verification so replacement during either phase is visible.
      const after = await handle.stat({ bigint: true });
      let afterPath: BigIntStats;
      try {
        afterPath = await lstat(filePath, { bigint: true });
      } catch {
        throw new Error("Local backup object changed while it was being read");
      }
      if (!sameObjectStat(before, after) || !sameObjectStat(before, afterPath)) {
        throw new Error("Local backup object changed while it was being read");
      }
      const finalStatToken = objectStatToken(after);
      this.seenObjectStats.set(seenStatKey, finalStatToken);
      return {
        header,
        data,
        effectiveGeneration: portableGeneration(header, headerBytes),
      };
    } finally {
      await handle?.close();
    }
  }

  private listedObject(object: LocalObject): StoredObject {
    return {
      key: object.header.key,
      size: object.header.size,
      generation: object.effectiveGeneration,
      contentType: object.header.contentType,
      metadata: { ...object.header.metadata },
      root: object.header.root,
      timeCreated: object.header.timeCreated,
    };
  }

  private async listDirectory(directory: string, root: string, prefix: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    const result: StoredObject[] = [];
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.name.startsWith(".tmp-")) {
        if (entry.isSymbolicLink() || !entry.isFile()) {
          throw new Error("Unsafe temporary file in local backup storage");
        }
        continue;
      }
      if (!entry.isFile() || entry.isSymbolicLink() || !/^[a-f0-9]{64}\.lbk$/.test(entry.name)) {
        throw new Error("Unexpected or unsafe entry in local backup storage");
      }
      const object = await this.readEnvelope(fullPath, root, undefined, false);
      if (`${hash(object.header.key)}.lbk` !== entry.name) {
        throw new Error("Local backup object filename does not match its key");
      }
      if (object.header.key.startsWith(prefix)) result.push(this.listedObject(object));
    }
    return result;
  }

  private async atomicWrite(filePath: string, directory: string, header: LocalHeader, data: Buffer) {
    const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
    if (headerBytes.length === 0 || headerBytes.length > MAX_HEADER_BYTES) {
      throw new Error("Local backup object header exceeds its configured limit");
    }
    const prefix = Buffer.alloc(HEADER_PREFIX_SIZE);
    MAGIC.copy(prefix, 0);
    prefix.writeUInt32BE(headerBytes.length, MAGIC.length);
    const temporaryPath = path.join(directory, `.tmp-${process.pid}-${randomUUID()}`);
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.chmod(0o600);
      await handle.writeFile(prefix);
      await handle.writeFile(headerBytes);
      await handle.writeFile(data);
      await handle.sync();
    } catch (error) {
      await handle.close();
      throw error;
    }
    await handle.close();
    await rename(temporaryPath, filePath);
    await syncDirectory(directory);
  }

  async list(prefix: string): Promise<StoredObject[]> {
    await this.ensureBaseDirectory();
    const roots = [...this.objectRoots];
    const directories = new Map<string, string>();
    for (const root of roots) directories.set(root, await this.ensureObjectDirectory(root));
    return this.withLock(async () => {
      const result: StoredObject[] = [];
      for (const root of roots) {
        result.push(...await this.listDirectory(directories.get(root)!, root, prefix));
      }
      return result.sort((a, b) => a.key.localeCompare(b.key) || a.root!.localeCompare(b.root!));
    });
  }

  async listRoot(prefix: string, rootPath: string): Promise<StoredObject[]> {
    const root = this.getRoot(rootPath);
    await this.ensureBaseDirectory();
    const directory = await this.ensureObjectDirectory(root);
    return this.withLock(async () =>
      (await this.listDirectory(directory, root, prefix)).sort((a, b) => a.key.localeCompare(b.key)),
    );
  }

  async read(key: string, rootPath?: string) {
    const validKey = this.validateKey(key);
    const root = this.getRoot(rootPath);
    await this.ensureBaseDirectory();
    const directory = await this.ensureObjectDirectory(root);
    return this.withLock(async () => {
      const object = await this.readEnvelope(this.objectPath(directory, validKey), root, validKey);
      return {
        data: object.data!,
        contentType: object.header.contentType,
        metadata: { ...object.header.metadata },
        generation: object.effectiveGeneration,
        timeCreated: object.header.timeCreated,
      };
    });
  }

  async write(
    key: string,
    data: Buffer,
    options: {
      contentType: string;
      metadata?: Record<string, string>;
      ifGenerationMatch?: string | null;
      root?: string;
    },
  ): Promise<StoredObject> {
    const validKey = this.validateKey(key);
    const root = this.getRoot(options.root);
    if (!Buffer.isBuffer(data)) throw new Error("Local backup object data must be a Buffer");
    if (typeof options.contentType !== "string" || Buffer.byteLength(options.contentType, "utf8") > 16 * 1024) {
      throw new Error("Invalid local backup object content type");
    }
    const content = Buffer.from(data);
    if (content.length > objectReadLimit(validKey)) {
      throw new Error("Local backup object exceeds its configured read limit");
    }
    const metadata = checkedMetadata(options.metadata ?? {});
    await this.ensureBaseDirectory();
    const directory = await this.ensureObjectDirectory(root);
    return this.withLock(async () => {
      const filePath = this.objectPath(directory, validKey);
      let previous: LocalObject | undefined;
      try {
        previous = await this.readEnvelope(filePath, root, validKey);
      } catch (error) {
        if (!(error instanceof MissingObjectError)) throw error;
      }
      if (options.ifGenerationMatch === null && previous) {
        throw new Error("Local backup object generation precondition failed: object already exists");
      }
      if (
        typeof options.ifGenerationMatch === "string" &&
        previous?.effectiveGeneration !== options.ifGenerationMatch
      ) {
        throw new Error("Local backup object generation precondition failed");
      }
      const header: LocalHeader = {
        format: HEADER_FORMAT,
        root,
        key: validKey,
        size: content.length,
        generation: randomUUID(),
        timeCreated: previous?.header.timeCreated ?? new Date().toISOString(),
        contentType: options.contentType,
        metadata,
        sha256: hash(content),
      };
      const filePathForCommit = this.objectPath(directory, validKey);
      await this.atomicWrite(filePathForCommit, directory, header, content);
      const committed = await this.readEnvelope(filePathForCommit, root, validKey);
      if (
        committed.header.generation !== header.generation ||
        committed.header.sha256 !== header.sha256
      ) {
        throw new Error("Local backup object changed immediately after it was written");
      }
      return this.listedObject(committed);
    });
  }

  async delete(key: string, ifGenerationMatch?: string | null, rootPath?: string): Promise<void> {
    const validKey = this.validateKey(key);
    const root = this.getRoot(rootPath);
    await this.ensureBaseDirectory();
    const directory = await this.ensureObjectDirectory(root);
    await this.withLock(async () => {
      const filePath = this.objectPath(directory, validKey);
      let current: LocalObject;
      try {
        current = await this.readEnvelope(filePath, root, validKey);
      } catch (error) {
        if (error instanceof MissingObjectError) return;
        throw error;
      }
      if (
        ifGenerationMatch === null ||
        (typeof ifGenerationMatch === "string" && current.effectiveGeneration !== ifGenerationMatch)
      ) {
        throw new Error("Local backup object generation precondition failed");
      }
      await unlink(filePath);
      await syncDirectory(directory);
    });
  }
}