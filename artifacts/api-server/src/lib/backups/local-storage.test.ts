import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalBackupStorage } from "./local-storage";

const temporaryDirectories: string[] = [];

async function storageFixture(privateRoot = "private", additionalRoots: readonly string[] = []) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "local-backup-storage-"));
  temporaryDirectories.push(directory);
  return {
    directory,
    storage: new LocalBackupStorage(directory, privateRoot, additionalRoots),
  };
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function objectFile(directory: string, root: string, key: string) {
  return path.join(directory, ".objects", digest(root), `${digest(key)}.lbk`);
}

function decodeObject(raw: Buffer) {
  expect(raw.subarray(0, 4).toString("utf8")).toBe("LBK2");
  const headerLength = raw.readUInt32BE(4);
  const header = JSON.parse(raw.subarray(8, 8 + headerLength).toString("utf8")) as Record<string, unknown>;
  return { header, payload: raw.subarray(8 + headerLength) };
}

function encodeObject(header: Record<string, unknown>, payload: Buffer) {
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const prefix = Buffer.alloc(8);
  prefix.write("LBK2", 0, "utf8");
  prefix.writeUInt32BE(headerBytes.length, 4);
  return Buffer.concat([prefix, headerBytes, payload]);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

describe("LocalBackupStorage", () => {
  it("persists bytes and metadata, issues a fresh generation, and preserves creation time on overwrite", async () => {
    const fixture = await storageFixture("private", ["public"]);
    const first = await fixture.storage.write("backups/one/manifest.json", Buffer.from("contents"), {
      contentType: "application/json",
      metadata: { source: "test" },
      root: "public",
    });
    const replacement = await new LocalBackupStorage(fixture.directory, "private", ["public"]).write(
      "backups/one/manifest.json",
      Buffer.from("contents"),
      { contentType: "application/json", metadata: { source: "updated" }, root: "public" },
    );

    expect(first.generation).not.toBe(replacement.generation);
    expect(replacement.timeCreated).toBe(first.timeCreated);
    expect(await fixture.storage.read("backups/one/manifest.json", "public")).toMatchObject({
      data: Buffer.from("contents"),
      contentType: "application/json",
      metadata: { source: "updated" },
      generation: replacement.generation,
      timeCreated: first.timeCreated,
    });
    expect(fixture.storage.objectRoots).toEqual(["private", "public"]);
  });

  it("serializes concurrent create-only writes and enforces generation compare-and-swap", async () => {
    const fixture = await storageFixture();
    const secondInstance = new LocalBackupStorage(fixture.directory, "private");
    const options = { contentType: "text/plain", ifGenerationMatch: null };
    const results = await Promise.allSettled([
      fixture.storage.write("shared/object", Buffer.from("first"), options),
      secondInstance.write("shared/object", Buffer.from("second"), options),
    ]);
    const successful = results.filter((result) => result.status === "fulfilled");
    expect(successful).toHaveLength(1);
    const current = (successful[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof fixture.storage.write>>>).value;

    await expect(fixture.storage.write("shared/object", Buffer.from("other"), options)).rejects.toThrow(/precondition/i);
    await expect(
      secondInstance.write("shared/object", Buffer.from("replacement"), {
        contentType: "text/plain",
        ifGenerationMatch: "stale-generation",
      }),
    ).rejects.toThrow(/precondition/i);
    const replaced = await secondInstance.write("shared/object", Buffer.from("replacement"), {
      contentType: "text/plain",
      ifGenerationMatch: current.generation,
    });
    expect(replaced.generation).not.toBe(current.generation);
    expect(replaced.timeCreated).toBe(current.timeCreated);
  });

  it("applies delete generation conditions and treats an absent object as an idempotent delete", async () => {
    const { storage } = await storageFixture();
    await expect(storage.delete("absent", "any-generation")).resolves.toBeUndefined();
    await expect(storage.delete("absent", null)).resolves.toBeUndefined();

    const created = await storage.write("object", Buffer.from("bytes"), { contentType: "application/octet-stream" });
    await expect(storage.delete("object", "stale")).rejects.toThrow(/precondition/i);
    await expect(storage.delete("object", null)).rejects.toThrow(/precondition/i);
    await storage.delete("object", created.generation);
    await expect(storage.read("object")).rejects.toThrow(/does not exist/i);
    await expect(storage.delete("object")).resolves.toBeUndefined();
  });

  it("lists each configured logical root and does not expose files from other roots", async () => {
    const { storage } = await storageFixture("private", ["public", "public"]);
    await storage.write("backups/a/manifest.json", Buffer.from("{}"), { contentType: "application/json" });
    await storage.write("backups/b/manifest.json", Buffer.from("{}"), {
      contentType: "application/json",
      root: "public",
    });

    expect(storage.objectRoots).toEqual(["private", "public"]);
    expect((await storage.list("backups/")).map(({ key, root }) => [key, root])).toEqual([
      ["backups/a/manifest.json", "private"],
      ["backups/b/manifest.json", "public"],
    ]);
    expect(await storage.listRoot("backups/a", "private")).toMatchObject([{ key: "backups/a/manifest.json" }]);
    await expect(storage.listRoot("", "not-configured")).rejects.toThrow(/not configured/i);
  });

  it("rejects traversal keys and logical roots that could escape the configured namespace", async () => {
    expect(() => new LocalBackupStorage("/tmp/local-storage-test", "../private")).toThrow(/invalid/i);
    expect(() => new LocalBackupStorage("/tmp/local-storage-test", "private/../public")).toThrow(/invalid/i);
    const { storage } = await storageFixture();
    for (const key of ["../outside", "/absolute", "folder//item", "folder/./item", "folder\\item"]) {
      await expect(storage.write(key, Buffer.from("unsafe"), { contentType: "text/plain" })).rejects.toThrow(/invalid/i);
    }
  });

  it("refuses symbolic links in the configured directory ancestry and object storage", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "local-backup-symlinks-"));
    temporaryDirectories.push(parent);
    const actual = path.join(parent, "actual");
    const link = path.join(parent, "linked");
    await mkdir(actual);
    await symlink(actual, link);
    const throughLink = new LocalBackupStorage(path.join(link, "backups"));
    await expect(throughLink.list("")).rejects.toThrow(/symbolic link/i);

    const { directory, storage } = await storageFixture();
    const key = "object";
    await storage.write(key, Buffer.from("valid"), { contentType: "text/plain" });
    const target = path.join(directory, "outside");
    await writeFile(target, "outside", { mode: 0o600 });
    const file = await objectFile(directory, "private", key);
    await unlink(file);
    await symlink(target, file);
    await expect(storage.read(key)).rejects.toThrow(/symbolic link|regular file|unsafe/i);
    await expect(storage.list("")).rejects.toThrow(/unsafe|unexpected/i);
  });

  it("detects tampered bytes instead of accepting the on-disk generation", async () => {
    const { directory, storage } = await storageFixture();
    const key = "tamper-me";
    const created = await storage.write(key, Buffer.from("authentic"), { contentType: "text/plain" });
    const file = await objectFile(directory, "private", key);
    const { header, payload } = decodeObject(await readFile(file));
    await writeFile(file, encodeObject(header, Buffer.from("tampered!")), { mode: 0o600 });

    await expect(storage.read(key)).rejects.toThrow(/digest|size/i);
    await expect(storage.list("")).rejects.toThrow(/digest/i);
    await expect(storage.write(key, Buffer.from("replacement"), {
      contentType: "text/plain",
      ifGenerationMatch: created.generation,
    })).rejects.toThrow(/digest|size/i);
    expect(payload.length).toBe(Buffer.from("authentic").length);
  });

  it("preserves manifest generations when intact object files are copied to another directory", async () => {
    const source = await storageFixture();
    const key = "backups/portable/manifest.json";
    const sourceObject = await source.storage.write(key, Buffer.from('{"portable":true}'), {
      contentType: "application/json",
    });
    const destination = await mkdtemp(path.join(os.tmpdir(), "local-backup-portable-"));
    temporaryDirectories.push(destination);
    await cp(path.join(source.directory, ".objects"), path.join(destination, ".objects"), {
      recursive: true,
      preserveTimestamps: true,
    });

    const restoredStorage = new LocalBackupStorage(destination, "private");
    const copied = await restoredStorage.read(key);
    expect(copied.generation).toBe(sourceObject.generation);
    expect(copied.data.toString("utf8")).toBe('{"portable":true}');
    expect((await restoredStorage.list("backups/portable"))[0]?.generation).toBe(sourceObject.generation);
  });

  it("restricts the storage directory, object directories, and object envelopes", async () => {
    const { directory, storage } = await storageFixture();
    const saved = await storage.write("private/object", Buffer.from("private"), { contentType: "text/plain" });
    const directoryStat = await stat(directory);
    const objectDirectoryStat = await stat(path.dirname(await objectFile(directory, "private", "private/object")));
    const fileStat = await stat(await objectFile(directory, "private", "private/object"));
    expect(directoryStat.mode & 0o777).toBe(0o700);
    expect(objectDirectoryStat.mode & 0o777).toBe(0o700);
    expect(fileStat.mode & 0o777).toBe(0o600);
    expect(saved.size).toBe(7);
  });

  it("round-trips a 16 MiB object without base64 stack or format limits", async () => {
    const { storage } = await storageFixture();
    const content = Buffer.alloc(16 * 1024 * 1024, 0xa5);
    const stored = await storage.write("large-object", content, { contentType: "application/octet-stream" });
    const loaded = await storage.read("large-object");
    expect(stored.size).toBe(content.length);
    expect(loaded.data.length).toBe(content.length);
    expect(createHash("sha256").update(loaded.data).digest("hex"))
      .toBe(createHash("sha256").update(content).digest("hex"));
    expect(loaded.generation).toBe(stored.generation);
  });

  it("changes the effective generation after an external valid same-size rewrite retaining the stored UUID", async () => {
    const { directory, storage } = await storageFixture();
    const key = "external-change";
    const original = await storage.write(key, Buffer.from("before!"), { contentType: "text/plain" });
    const file = await objectFile(directory, "private", key);
    const { header, payload } = decodeObject(await readFile(file));
    const replacementPayload = Buffer.from("after!!");
    expect(replacementPayload.length).toBe(payload.length);
    header.sha256 = digest(replacementPayload.toString("utf8"));
    await writeFile(file, encodeObject(header, replacementPayload), { mode: 0o600 });

    const observed = await storage.read(key);
    expect(observed.data).toEqual(replacementPayload);
    expect(observed.generation).not.toBe(original.generation);
    await expect(storage.write(key, Buffer.from("stale"), {
      contentType: "text/plain",
      ifGenerationMatch: original.generation,
    })).rejects.toThrow(/precondition/i);
  });

  it("detects a deterministic atomic replacement during header parsing", async () => {
    const { directory, storage } = await storageFixture();
    const key = "mid-read";
    await storage.write(key, Buffer.from("stable bytes"), { contentType: "text/plain" });
    const file = await objectFile(directory, "private", key);
    const originalParse = JSON.parse.bind(JSON);
    let replaced = false;
    vi.spyOn(JSON, "parse").mockImplementation((...args) => {
      const parsed = originalParse(...args);
      const [text] = args;
      if (!replaced && typeof text === "string" && text.includes(key)) {
        replaced = true;
        const replacement = `${file}.replacement`;
        writeFileSync(replacement, readFileSync(file), { mode: 0o600 });
        renameSync(replacement, file);
      }
      return parsed;
    });

    await expect(storage.read(key)).rejects.toThrow(/changed while it was being read/i);
    expect(replaced).toBe(true);
  });

  it("rejects insecure pre-existing directories without changing their permissions", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "local-backup-insecure-"));
    temporaryDirectories.push(directory);
    await chmod(directory, 0o755);
    const storage = new LocalBackupStorage(directory);
    await expect(storage.list("")).rejects.toThrow(/permissions must be 700/i);
    expect((await stat(directory)).mode & 0o777).toBe(0o755);

    const objectFixture = await storageFixture();
    await objectFixture.storage.write("object", Buffer.from("data"), { contentType: "text/plain" });
    const objectDirectory = path.dirname(await objectFile(objectFixture.directory, "private", "object"));
    await chmod(objectDirectory, 0o755);
    await expect(objectFixture.storage.list("")).rejects.toThrow(/permissions must be 700/i);
    expect((await stat(objectDirectory)).mode & 0o777).toBe(0o755);
  });

  it("does not evict a possibly abandoned lock", async () => {
    const { directory, storage } = await storageFixture();
    const lockPath = path.join(directory, ".backup-storage.lock");
    await mkdir(lockPath, { mode: 0o700 });
    await chmod(lockPath, 0o700);
    let settled = false;
    const pendingWrite = storage.write("wait-for-lock", Buffer.from("safe"), { contentType: "text/plain" })
      .finally(() => { settled = true; });

    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(settled).toBe(false);
    expect((await readdir(directory)).includes(".backup-storage.lock")).toBe(true);
    await rm(lockPath, { recursive: true });
    await expect(pendingWrite).resolves.toMatchObject({ key: "wait-for-lock" });
  });
});