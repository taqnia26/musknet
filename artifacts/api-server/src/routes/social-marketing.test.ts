import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  db,
  socialPostsTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";
import { ObjectStorageService } from "../lib/object-storage";

const suffix = Date.now();
const userIds: number[] = [];
const postIds: number[] = [];
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
let editor: string;
let viewer: string;
let outsider: string;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `social-root-${suffix}@example.com`;
  process.env.ADMIN_PASSWORD = "social-test-password";
  const rights = ["view", "edit", "delete"] as const;
  await db.insert(adminPermissionsTable).values(rights.map((action) => ({ module: "campaigns", action }))).onConflictDoNothing();
  const passwordHash = await hashAdminPassword("social-test-password");
  const users = await db.insert(adminUsersTable).values([
    { email: `social-editor-${suffix}@example.com`, name: "Social Editor", passwordHash },
    { email: `social-viewer-${suffix}@example.com`, name: "Social Viewer", passwordHash },
    { email: `social-outsider-${suffix}@example.com`, name: "Social Outsider", passwordHash },
  ]).returning();
  userIds.push(...users.map((user) => user.id));
  const permissions = await db.select().from(adminPermissionsTable);
  const permission = (action: string) => {
    const found = permissions.find((right) => right.module === "campaigns" && right.action === action);
    if (!found) throw new Error(`Missing campaigns permission: ${action}`);
    return found.id;
  };
  await db.insert(adminUserPermissionsTable).values([
    ...rights.map((action) => ({ adminUserId: users[0].id, permissionId: permission(action) })),
    { adminUserId: users[1].id, permissionId: permission("view") },
  ]);
  [editor, viewer, outsider] = await Promise.all(users.map((user) => createAdminSession(user.id)));
});

afterAll(async () => {
  if (postIds.length) await db.delete(socialPostsTable).where(inArray(socialPostsTable.id, postIds));
  if (userIds.length) {
    await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminUserId, userIds));
    await db.delete(adminUserPermissionsTable).where(inArray(adminUserPermissionsTable.adminUserId, userIds));
    await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, userIds));
  }
});

describe("social content planning", () => {
  const draft = {
    title: "Launch perfume",
    caption: "Discover the new scent",
    platforms: ["instagram", "facebook"],
    mediaUrls: [],
    status: "draft",
  };

  it("persists drafts and plans, and never claims automatic publishing", async () => {
    const created = await request(app).post("/api/admin/social/posts").set(auth(editor)).send(draft).expect(201);
    postIds.push(created.body.id);
    expect(created.body).toMatchObject({ ...draft, publishedAt: null, scheduledAt: null });
    const listed = await request(app).get("/api/admin/social/posts").set(auth(viewer)).expect(200);
    expect(listed.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id })]));

    await request(app).patch(`/api/admin/social/posts/${created.body.id}`).set(auth(editor))
      .send({ status: "scheduled", scheduledAt: "2020-01-01T12:00:00.000Z" }).expect(400);
    const planned = await request(app).patch(`/api/admin/social/posts/${created.body.id}`).set(auth(editor))
      .send({ status: "scheduled", scheduledAt: "2032-01-01T12:00:00.000Z" }).expect(200);
    expect(planned.body).toMatchObject({ status: "scheduled", scheduledAt: "2032-01-01T12:00:00.000Z", publishedAt: null });
    await db.update(socialPostsTable).set({ scheduledAt: new Date("2020-01-01T12:00:00.000Z") })
      .where(eq(socialPostsTable.id, created.body.id));
    const corrected = await request(app).patch(`/api/admin/social/posts/${created.body.id}`).set(auth(editor))
      .send({ caption: "Corrected copy for an overdue plan" }).expect(200);
    expect(corrected.body.scheduledAt).toBe("2020-01-01T12:00:00.000Z");
    await request(app).patch(`/api/admin/social/posts/${created.body.id}`).set(auth(editor))
      .send({ scheduledAt: "2021-01-01T12:00:00.000Z" }).expect(400);

    const published = await request(app).post(`/api/admin/social/posts/${created.body.id}/published-manually`)
      .set(auth(editor)).expect(200);
    expect(published.body.status).toBe("published_manual");
    expect(published.body.publishedAt).toEqual(expect.any(String));
    await request(app).patch(`/api/admin/social/posts/${created.body.id}`).set(auth(editor))
      .send({ title: "Altered history" }).expect(409);
    await request(app).delete(`/api/admin/social/posts/${created.body.id}`).set(auth(editor)).expect(409);
  });

  it("enforces authorization, valid platforms, and media ownership", async () => {
    await request(app).get("/api/admin/social/posts").expect(401);
    await request(app).get("/api/admin/social/posts").set(auth(outsider)).expect(403);
    await request(app).post("/api/admin/social/posts").set(auth(viewer)).send(draft).expect(403);
    await request(app).post("/api/admin/social/posts").set(auth(editor))
      .send({ ...draft, platforms: ["instagram", "instagram"] }).expect(400);
    await request(app).post("/api/admin/social/posts").set(auth(editor))
      .send({ ...draft, mediaUrls: ["http://other.example/image.jpg"] }).expect(400);
    const created = await request(app).post("/api/admin/social/posts").set(auth(editor))
      .send({ ...draft, mediaUrls: ["https://cdn.example/image.jpg", "/api/admin/social/media/12345678-1234-1234-1234-123456789abc"] }).expect(201);
    postIds.push(created.body.id);
    expect(created.body.mediaUrls).toHaveLength(2);
    await request(app).delete(`/api/admin/social/posts/${created.body.id}`).set(auth(viewer)).expect(403);
    await request(app).delete(`/api/admin/social/posts/${created.body.id}`).set(auth(editor)).expect(204);
  });

  it("keeps draft images private and rejects dangerous uploaded bytes", async () => {
    const key = "12345678-1234-1234-1234-123456789abc";
    const path = `/api/admin/social/media/${key}`;
    await request(app).get(`/api/storage/objects/uploads/marketing/${key}`).expect(404);
    await request(app).get(path).expect(401);
    await request(app).get(path).set(auth(outsider)).expect(403);

    const bytes = Buffer.from("<script>alert('unsafe')</script>");
    const spy = vi.spyOn(ObjectStorageService.prototype, "getObjectMetadata").mockResolvedValue({
      contentType: "image/png", size: bytes.length, file: { download: async () => [bytes] },
    } as never);
    try {
      await request(app).get(path).set(auth(viewer)).expect(415);
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
      spy.mockResolvedValue({ contentType: "image/png", size: png.length, file: { download: async () => [png] } } as never);
      const response = await request(app).get(path).set(auth(viewer)).expect(200);
      expect(response.headers["content-type"]).toMatch(/^image\/png/);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["cache-control"]).toBe("private, no-store");
    } finally {
      spy.mockRestore();
    }
  });

  it.skipIf(process.env.RUN_STORAGE_INTEGRATION !== "1")("uploads and privately serves a real image", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRk0AAAAASUVORK5CYII=", "base64");
    await request(app).post("/api/admin/social/media/upload-url").set(auth(viewer))
      .send({ contentType: "image/png", size: png.length }).expect(403);
    const signed = await request(app).post("/api/admin/social/media/upload-url").set(auth(editor))
      .send({ contentType: "image/png", size: png.length }).expect(200);
    const put = await fetch(signed.body.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: png });
    expect(put.ok).toBe(true);
    try {
      const result = await request(app).get(signed.body.imageUrl).set(auth(viewer)).expect(200);
      expect(result.headers["content-type"]).toMatch(/^image\/png/);
    } finally {
      await new ObjectStorageService().deleteObject(signed.body.objectPath);
    }
  }, 30_000);
});