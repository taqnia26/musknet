import { Storage } from "@google-cloud/storage";
import type { BackupObjectStorage, StoredObject } from "./engine";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

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
  private readonly bucket;
  private readonly objectPrefix: string;

  constructor(privateRoot: string) {
    const [bucketName, ...prefixParts] = privateRoot.split("/");
    if (!bucketName) throw new Error("PRIVATE_OBJECT_DIR does not contain a bucket name");
    this.objectPrefix = prefixParts.join("/").replace(/\/+$/, "");
    const client = new Storage({
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
    this.bucket = client.bucket(bucketName);
  }

  private fullKey(key: string) {
    if (key.startsWith("/") || key.split("/").some((part) => part === ".." || part === ".")) {
      throw new Error("Invalid private App Storage object key");
    }
    return [this.objectPrefix, key].filter(Boolean).join("/");
  }

  private relativeKey(key: string) {
    const prefix = this.objectPrefix ? `${this.objectPrefix}/` : "";
    if (!key.startsWith(prefix)) throw new Error("App Storage returned an object outside PRIVATE_OBJECT_DIR");
    return key.slice(prefix.length);
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const cleanPrefix = prefix.replace(/^\/+/, "");
    const fullPrefix = this.fullKey(cleanPrefix);
    const [files] = await this.bucket.getFiles({
      prefix: fullPrefix ? `${fullPrefix}${fullPrefix.endsWith("/") ? "" : "/"}` : "",
      autoPaginate: true,
      fields: "items(name,size,generation,contentType,metadata),nextPageToken",
    });
    const result: StoredObject[] = [];
    for (const file of files) {
      const metadata = file.metadata?.size == null ? (await file.getMetadata())[0] : file.metadata;
      const key = this.relativeKey(file.name);
      if (!key || key.endsWith("/")) continue;
      result.push({
        key,
        size: Number(metadata.size ?? 0),
        generation: metadata.generation == null ? null : String(metadata.generation),
        contentType: metadata.contentType ?? null,
        metadata: Object.fromEntries(
          Object.entries((metadata.metadata ?? {}) as Record<string, unknown>)
            .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        ),
      });
    }
    return result.sort((a, b) => a.key.localeCompare(b.key));
  }

  async read(key: string) {
    const file = this.bucket.file(this.fullKey(key));
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
    return {
      data,
      contentType: metadata.contentType ?? null,
      metadata: Object.fromEntries(
        Object.entries((metadata.metadata ?? {}) as Record<string, unknown>)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      ),
      generation: metadata.generation == null ? null : String(metadata.generation),
    };
  }

  async write(
    key: string,
    data: Buffer,
    options: { contentType: string; metadata?: Record<string, string>; ifGenerationMatch?: string | null },
  ) {
    const file = this.bucket.file(this.fullKey(key));
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
    };
  }

  async delete(key: string, ifGenerationMatch?: string | null) {
    await this.bucket.file(this.fullKey(key)).delete({
      ignoreNotFound: true,
      ifGenerationMatch: generationPrecondition(ifGenerationMatch),
    });
  }
}