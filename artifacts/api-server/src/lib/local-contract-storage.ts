import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, open, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, type Readable } from "node:stream";
import type { Response } from "express";
import { ObjectNotFoundError, ObjectStorageConfigurationError } from "./object-storage";

const PREFIX = "/objects/local/contracts/";
const MAX_SIZE = 25 * 1024 * 1024;
const MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Ticket = { mimeType: string; size: number; expires: number };
export type LocalContractFile = { path: string; contentType: string; size: number };

export function isLocalContractPath(objectPath: string) {
  return objectPath.startsWith("/objects/local/");
}

function idFromPath(objectPath: string) {
  const id = objectPath.startsWith(PREFIX) ? objectPath.slice(PREFIX.length) : "";
  if (!UUID.test(id)) throw new ObjectNotFoundError();
  return id;
}

function matchesType(buffer: Buffer, mimeType: string) {
  if (mimeType === "application/pdf") return buffer.subarray(0, 5).equals(Buffer.from("%PDF-"));
  if (mimeType === "application/msword") return buffer.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"));
  return buffer.subarray(0, 4).equals(Buffer.from("504b0304", "hex")) && buffer.includes(Buffer.from("word/document.xml"));
}

export class LocalContractStorage {
  private tickets = new Map<string, Ticket>();

  private async directory() {
    const configured = process.env.LOCAL_CONTRACT_STORAGE_DIR?.trim();
    if (!configured || !path.isAbsolute(configured)) {
      throw new ObjectStorageConfigurationError("اضبط LOCAL_CONTRACT_STORAGE_DIR على مجلد دائم بمسار مطلق للملفات الخاصة.");
    }
    try {
      const info = await lstat(configured);
      if (!info.isDirectory() || (info.mode & 0o077) !== 0 || (info.mode & 0o700) !== 0o700) throw new Error("Unsafe storage directory");
      await access(configured, constants.R_OK | constants.W_OK | constants.X_OK);
      return await realpath(configured);
    } catch {
      throw new ObjectStorageConfigurationError("مجلد العقود المحلي غير موجود أو غير قابل للكتابة أو صلاحياته غير خاصة (يجب أن تكون 700).");
    }
  }

  async createUpload(mimeType: string, size: number) {
    const directory = await this.directory();
    if (!MIME_TYPES.has(mimeType) || size < 1 || size > MAX_SIZE) throw new Error("Invalid contract upload");
    const probe = path.join(directory, `.write-check-${randomUUID()}`);
    try {
      const handle = await open(probe, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await handle.close();
      await unlink(probe);
    } catch {
      await unlink(probe).catch(() => undefined);
      throw new ObjectStorageConfigurationError("مجلد العقود المحلي غير قابل للكتابة. تحقق من القرص والصلاحيات قبل الرفع.");
    }
    for (const [key, ticket] of this.tickets) {
      if (ticket.expires < Date.now()) this.tickets.delete(key);
    }
    const id = randomUUID();
    this.tickets.set(id, { mimeType, size, expires: Date.now() + 15 * 60_000 });
    return { uploadUrl: `/api/admin/contract-files/uploads/${id}`, objectPath: `${PREFIX}${id}` };
  }

  async upload(id: string, contentType: string, input: Readable) {
    const ticket = this.tickets.get(id);
    if (!UUID.test(id) || !ticket || ticket.expires < Date.now()) return false;
    if (ticket.mimeType !== contentType.toLowerCase().split(";")[0].trim()) throw new InvalidContractFileError();
    const directory = await this.directory();
    const filePath = path.join(directory, id);
    let size = 0;
    let created = false;
    try {
      const handle = await open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      created = true;
      await pipeline(input, new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          size += chunk.length;
          callback(size > MAX_SIZE || size > ticket.size ? new InvalidContractFileError() : null, chunk);
        },
      }), handle.createWriteStream());
      if (size !== ticket.size) throw new InvalidContractFileError();
      const buffer = await readFile(filePath);
      if (!matchesType(buffer, ticket.mimeType)) throw new InvalidContractFileError();
      await writeFile(`${filePath}.json`, JSON.stringify({ contentType: ticket.mimeType }), { flag: "wx", mode: 0o600 });
      this.tickets.delete(id);
      return true;
    } catch (error) {
      if (created) {
        await unlink(filePath).catch(() => undefined);
        await unlink(`${filePath}.json`).catch(() => undefined);
      }
      throw error;
    }
  }

  async getMetadata(objectPath: string): Promise<LocalContractFile> {
    const directory = await this.directory();
    const id = idFromPath(objectPath);
    const filePath = path.join(directory, id);
    try {
      const [info, metadataInfo] = await Promise.all([lstat(filePath), lstat(`${filePath}.json`)]);
      if (!info.isFile() || !metadataInfo.isFile() || info.size < 1 || info.size > MAX_SIZE) throw new ObjectNotFoundError();
      const metadata = JSON.parse(await readFile(`${filePath}.json`, "utf8")) as { contentType: string };
      if (!MIME_TYPES.has(metadata.contentType)) throw new ObjectNotFoundError();
      return { path: filePath, contentType: metadata.contentType, size: info.size };
    } catch (error) {
      if (error instanceof ObjectStorageConfigurationError) throw error;
      throw new ObjectNotFoundError();
    }
  }

  async pipe(file: LocalContractFile, response: Response) {
    // Recheck the file before opening, and don't follow a replaced symlink.
    const handle = await open(file.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size !== file.size) {
      await handle.close();
      throw new ObjectNotFoundError();
    }
    response.setHeader("Content-Type", file.contentType);
    response.setHeader("Content-Length", String(file.size));
    const stream = handle.createReadStream({ autoClose: true });
    stream.on("error", (error) => response.destroy(error));
    stream.pipe(response);
  }

  async delete(objectPath: string) {
    const file = await this.getMetadata(objectPath);
    await unlink(file.path);
    await unlink(`${file.path}.json`);
  }
}

export class InvalidContractFileError extends Error {
  constructor() {
    super("ملف العقد غير صالح أو لا يطابق النوع والحجم المطلوبين (الحد الأقصى 25 MB).");
  }
}