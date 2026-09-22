import { randomUUID } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

let objectStorageClient: Storage | undefined;

function getObjectStorageClient() {
  objectStorageClient ??= new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: "external_account",
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: {
          type: "json",
          subject_token_field_name: "access_token",
        },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
  return objectStorageClient;
}
export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

function parseObjectPath(rawPath: string) {
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const parts = path.split("/");
  if (parts.length < 3) throw new Error("Invalid object storage path");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function signObjectUrl(bucketName: string, objectName: string) {
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method: "PUT",
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to sign product image upload URL (${response.status})`);
  }

  const payload = await response.json() as { signed_url: string };
  return payload.signed_url;
}

export class ObjectStorageService {
  private getPrivateObjectDir() {
    const value = process.env.PRIVATE_OBJECT_DIR;
    if (!value) throw new ObjectStorageConfigurationError();
    return value.replace(/\/+$/, "");
  }

  async createProductImageUpload() {
    return this.createPrivateUpload("uploads/products");
  }

  async createPrivateUpload(prefix: string) {
    const objectPath = `${prefix.replace(/^\/+|\/+$/g, "")}/${randomUUID()}`;
    const fullPath = `${this.getPrivateObjectDir()}/${objectPath}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    return {
      uploadUrl: await signObjectUrl(bucketName, objectName),
      objectPath: `/objects/${objectPath}`,
    };
  }

  async getObjectFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const relativePath = objectPath.slice("/objects/".length);
    const { bucketName, objectName } = parseObjectPath(
      `${this.getPrivateObjectDir()}/${relativePath}`,
    );
    const file = getObjectStorageClient().bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async getObjectMetadata(objectPath: string) {
    const file = await this.getObjectFile(objectPath);
    const [metadata] = await file.getMetadata();
    return { file, contentType: metadata.contentType?.toLowerCase() ?? null, size: Number(metadata.size ?? 0) };
  }

  async pipeObject(file: File, response: import("express").Response) {
    const [metadata] = await file.getMetadata();
    response.setHeader("Content-Type", metadata.contentType || "application/octet-stream");
    if (!response.getHeader("Cache-Control")) response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (metadata.size) response.setHeader("Content-Length", String(metadata.size));
    const stream = file.createReadStream();
    stream.setMaxListeners(20);
    stream.pipe(response);
  }

  async deleteObject(objectPath: string) {
    const file = await this.getObjectFile(objectPath);
    await file.delete();
  }
}

export class ObjectStorageConfigurationError extends Error {
  constructor() {
    super("Product image storage is not configured");
    this.name = "ObjectStorageConfigurationError";
  }
}
