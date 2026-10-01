import { Storage } from "@google-cloud/storage";
import type { BackupObjectStorage, StoredObject } from "./engine";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

type StorageRoot = {
  path: string;
  bucket: ReturnType<Storage["bucket"]>;
  prefix: string;
};
type ListedStorageObject = {
  name?: string;
  size?: number | string;
  generation?: number | string;
  contentType?: string | null;
  metadata?: Record<string, unknown>;
  timeCreated?: string | null;
  getMetadata?: () => Promise<[ListedStorageObject]>;
};

function generationPrecondition(generation: string | null | undefined) {
  if (generation === undefined) return undefined;
  if (generation === null) return 0;
  const value = Number(generation);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("App Storage generation cannot be represented safely for a conditional write");
  }
  return value;
}

export class GcsBackupStorage implements BackupObjectStorage {
  readonly objectRoots: readonly string[];
  private readonly roots = new Map<string, StorageRoot>();
  private readonly privateRoot: string;

  constructor(
    privateRoot: string,
    publicSearchPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "",
    authentication = process.env.BACKUP_GCS_AUTH?.trim() || "adc",
  ) {
    if (authentication !== "adc" && authentication !== "replit") {
      throw new Error("BACKUP_GCS_AUTH must be adc or replit");
    }
    const client = authentication === "adc" ? new Storage() : new Storage({
      credentials: {
        audience: "replit",
        subject_token_type: "access_token",
        token_url: `${SIDECAR_ENDPOINT}/token`,
        type: "external_account",
        credential_source: {
          url: `${SIDECAR_ENDPOINT}/credential`,
          format: { type: "json", subject_token_field_name: "access_token" },
        },
        universe_domain: "googleapis.com",
      },
      projectId: "",
    });
    const normalizeRoot = (value: string) => {
      const normalized = value.trim().replace(/^\/+|\/+$/g, "");
      const parts = normalized.split("/");
      if (
        !normalized ||
        parts.some((part) => !part || part === "." || part === "..")
      ) {
        throw new Error("App Storage root is not a valid bucket and prefix path");
      }
      return normalized;
    };
    this.privateRoot = normalizeRoot(privateRoot);
    const configuredRoots = [
      this.privateRoot,
      ...publicSearchPaths.split(/[,\s:]+/).filter(Boolean).map(normalizeRoot),
    ];
    this.objectRoots = [...new Set(configuredRoots)];
    for (const rootPath of this.objectRoots) {
      const [bucketName, ...prefixParts] = rootPath.split("/");
      this.roots.set(rootPath, {
        path: rootPath,
        bucket: client.bucket(bucketName!),
        prefix: prefixParts.join("/").replace(/\/+$/, ""),
      });
    }
  }

  private getRoot(rootPath = this.privateRoot) {
    const root = this.roots.get(rootPath);
    if (!root) throw new Error("Backup object root is not configured in PRIVATE_OBJECT_DIR or PUBLIC_OBJECT_SEARCH_PATHS");
    return root;
  }

  private fullKey(key: string, rootPath?: string) {
    if (key.startsWith("/") || key.split("/").some((part) => part === ".." || part === ".")) {
      throw new Error("Invalid private App Storage object key");
    }
    const root = this.getRoot(rootPath);
    return [root.prefix, key].filter(Boolean).join("/");
  }

  private relativeKey(key: string, root: StorageRoot) {
    const prefix = root.prefix ? `${root.prefix}/` : "";
    if (!key.startsWith(prefix)) throw new Error("App Storage returned an object outside its configured search root");
    return key.slice(prefix.length);
  }

  async list(prefix: string): Promise<StoredObject[]> {
    return this.listFromRoots(prefix, [...this.roots.values()]);
  }

  async listRoot(prefix: string, rootPath: string): Promise<StoredObject[]> {
    return this.listFromRoots(prefix, [this.getRoot(rootPath)]);
  }

  private async listFromRoots(prefix: string, roots: StorageRoot[]) {
    const cleanPrefix = prefix.replace(/^\/+/, "");
    const result: StoredObject[] = [];
    for (const root of roots) {
      const fullPrefix = [root.prefix, cleanPrefix].filter(Boolean).join("/");
      const [files] = await root.bucket.getFiles({
        prefix: fullPrefix ? `${fullPrefix}${fullPrefix.endsWith("/") ? "" : "/"}` : "",
        autoPaginate: true,
        fields: "items(name,size,generation,contentType,metadata,timeCreated),nextPageToken",
      });
      for (const file of files) {
        // Supplying `fields` makes google-cloud/storage return raw API objects
        // instead of File instances, so support both response shapes.
        const listed = file as unknown as ListedStorageObject;
        const metadata = typeof listed.getMetadata !== "function"
          ? listed
          : listed.metadata?.size == null
            ? (await listed.getMetadata())[0]
            : listed.metadata;
        if (!metadata || typeof listed.name !== "string") {
          throw new Error("App Storage returned incomplete metadata while listing a configured root");
        }
        const key = this.relativeKey(listed.name, root);
        if (!key || key.endsWith("/")) continue;
        result.push({
          key,
          size: Number(metadata.size ?? 0),
          generation: metadata.generation == null ? null : String(metadata.generation),
          contentType: typeof metadata.contentType === "string" ? metadata.contentType : null,
          metadata: Object.fromEntries(
            Object.entries(metadata.metadata ?? {})
              .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
          ),
          root: root.path,
          timeCreated: typeof metadata.timeCreated === "string" ? metadata.timeCreated : null,
        });
      }
    }
    return result.sort((a, b) => a.key.localeCompare(b.key) || a.root!.localeCompare(b.root!));
  }

  async read(key: string, rootPath?: string) {
    const root = this.getRoot(rootPath);
    const file = root.bucket.file(this.fullKey(key, root.path));
    const [metadata] = await file.getMetadata();
    const maximum = key.endsWith("/manifest.json")
      ? 32 * 1024 * 1024
      : key.endsWith("/database.json.gz")
        ? 256 * 1024 * 1024
        : 256 * 1024 * 1024;
    if (Number(metadata.size ?? 0) > maximum) {
      throw new Error("Private backup object exceeds its configured read limit");
    }
    const [data] = await file.download();
    const [afterDownload] = await file.getMetadata();
    if (
      metadata.generation == null ||
      afterDownload.generation == null ||
      String(afterDownload.generation) !== String(metadata.generation)
    ) {
      throw new Error("App Storage object changed while it was being read");
    }
    return {
      data,
      contentType: metadata.contentType ?? null,
      metadata: Object.fromEntries(
        Object.entries((metadata.metadata ?? {}) as Record<string, unknown>)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      ),
      generation: metadata.generation == null ? null : String(metadata.generation),
      timeCreated: metadata.timeCreated ?? null,
    };
  }

  async write(
    key: string,
    data: Buffer,
    options: { contentType: string; metadata?: Record<string, string>; ifGenerationMatch?: string | null; root?: string },
  ) {
    const root = this.getRoot(options.root);
    const file = root.bucket.file(this.fullKey(key, root.path));
    await file.save(data, {
      resumable: false,
      contentType: options.contentType,
      metadata: { metadata: options.metadata },
      preconditionOpts: { ifGenerationMatch: generationPrecondition(options.ifGenerationMatch) },
    });
    const [metadata] = await file.getMetadata();
    return {
      key,
      size: Number(metadata.size ?? 0),
      generation: metadata.generation == null ? null : String(metadata.generation),
      contentType: metadata.contentType ?? null,
      metadata: Object.fromEntries(
        Object.entries((metadata.metadata ?? {}) as Record<string, unknown>)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      ),
      root: root.path,
      timeCreated: metadata.timeCreated ?? null,
    };
  }

  async delete(key: string, ifGenerationMatch?: string | null, rootPath?: string) {
    const root = this.getRoot(rootPath);
    await root.bucket.file(this.fullKey(key, root.path)).delete({
      ignoreNotFound: true,
      ifGenerationMatch: generationPrecondition(ifGenerationMatch),
    });
  }
}