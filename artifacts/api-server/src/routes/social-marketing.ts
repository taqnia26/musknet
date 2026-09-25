import { Router, type IRouter, type Request, type RequestHandler, type Response, type NextFunction } from "express";
import { and, desc, eq, ne } from "drizzle-orm";
import { campaignsTable, db, socialPostsTable } from "@workspace/db";
import * as Api from "@workspace/api-zod";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/object-storage";

type Guard = (module: string, action: "view" | "edit" | "delete") => RequestHandler;
type PlannedStatus = "draft" | "scheduled";

const storage = new ObjectStorageService();
const mediaPath = /^\/api\/admin\/social\/media\/[0-9a-f-]{36}$/;
const mediaKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const route = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };

function serialize(row: typeof socialPostsTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function validMedia(urls: string[]) {
  return new Set(urls).size === urls.length && urls.every((url) => {
    if (mediaPath.test(url)) return true;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  });
}

function validPlan(status: PlannedStatus, scheduledAt: Date | null) {
  return status !== "scheduled" || (scheduledAt !== null && !Number.isNaN(scheduledAt.getTime()) && scheduledAt.getTime() > Date.now());
}

function imageMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.subarray(4, 8).toString("ascii") === "ftyp" && ["avif", "avis"].includes(bytes.subarray(8, 12).toString("ascii"))) return "image/avif";
  return null;
}

function idFromParam(raw: string | string[] | undefined, res: Response) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  if (!value || !Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid post id" });
    return null;
  }
  return id;
}

async function campaignExists(id: number | null | undefined) {
  if (id == null) return true;
  return (await db.select({ id: campaignsTable.id }).from(campaignsTable).where(eq(campaignsTable.id, id)).limit(1)).length > 0;
}

export function createSocialMarketingRouter(permit: Guard): IRouter {
  const router: IRouter = Router();

  router.get("/admin/social/posts", permit("campaigns", "view"), route(async (_req, res) => {
    const rows = await db.select().from(socialPostsTable).orderBy(desc(socialPostsTable.createdAt), desc(socialPostsTable.id));
    res.json(Api.AdminListSocialPostsResponse.parse(rows.map(serialize)));
  }));

  router.post("/admin/social/posts", permit("campaigns", "edit"), route(async (req, res) => {
    const parsed = Api.AdminCreateSocialPostBody.strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const input = parsed.data;
    if (new Set(input.platforms).size !== input.platforms.length || !validMedia(input.mediaUrls)) {
      res.status(400).json({ error: "Invalid platforms or media paths" }); return;
    }
    if (!validPlan(input.status, input.scheduledAt ?? null)) {
      res.status(400).json({ error: "Choose a future date for planned content" }); return;
    }
    if (!await campaignExists(input.campaignId)) {
      res.status(400).json({ error: "Campaign does not exist" }); return;
    }
    const [post] = await db.insert(socialPostsTable).values({
      title: input.title.trim(),
      caption: input.caption.trim(),
      platforms: input.platforms,
      mediaUrls: input.mediaUrls,
      status: input.status,
      scheduledAt: input.status === "scheduled" ? input.scheduledAt : null,
      campaignId: input.campaignId ?? null,
      createdBy: (res.locals.admin as { id: number }).id,
    }).returning();
    res.status(201).json(Api.AdminCreateSocialPostResponse.parse(serialize(post)));
  }));

  router.patch("/admin/social/posts/:id", permit("campaigns", "edit"), route(async (req, res) => {
    const id = idFromParam(req.params.id, res); if (!id) return;
    const parsed = Api.AdminUpdateSocialPostBody.strict().safeParse(req.body);
    if (!parsed.success || !Object.keys(req.body ?? {}).length) {
      res.status(400).json({ error: parsed.success ? "At least one change is required" : parsed.error.message }); return;
    }
    const input = parsed.data;
    const [existing] = await db.select().from(socialPostsTable).where(eq(socialPostsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
    if (existing.status === "published_manual") { res.status(409).json({ error: "Published content cannot be edited" }); return; }
    const status = input.status ?? existing.status as PlannedStatus;
    const scheduledAt = input.scheduledAt === undefined ? existing.scheduledAt : input.scheduledAt;
    const platforms = input.platforms ?? existing.platforms;
    const mediaUrls = input.mediaUrls ?? existing.mediaUrls;
    if (new Set(platforms).size !== platforms.length || !validMedia(mediaUrls)) {
      res.status(400).json({ error: "Invalid platforms or media paths" }); return;
    }
    const dateChanged = input.scheduledAt !== undefined && input.scheduledAt?.getTime() !== existing.scheduledAt?.getTime();
    if (status === "scheduled" && (!scheduledAt || ((dateChanged || existing.status !== "scheduled") && !validPlan(status, scheduledAt)))) {
      res.status(400).json({ error: "Choose a future date for planned content" }); return;
    }
    if (!await campaignExists(input.campaignId)) {
      res.status(400).json({ error: "Campaign does not exist" }); return;
    }
    const [post] = await db.update(socialPostsTable).set({
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.caption !== undefined ? { caption: input.caption.trim() } : {}),
      platforms,
      mediaUrls,
      status,
      scheduledAt: status === "scheduled" ? scheduledAt : null,
      ...(input.campaignId !== undefined ? { campaignId: input.campaignId } : {}),
      updatedAt: new Date(),
    }).where(and(eq(socialPostsTable.id, id), ne(socialPostsTable.status, "published_manual"))).returning();
    if (!post) { res.status(409).json({ error: "Content was published while editing" }); return; }
    res.json(Api.AdminUpdateSocialPostResponse.parse(serialize(post)));
  }));

  router.delete("/admin/social/posts/:id", permit("campaigns", "delete"), route(async (req, res) => {
    const id = idFromParam(req.params.id, res); if (!id) return;
    const [deleted] = await db.delete(socialPostsTable)
      .where(and(eq(socialPostsTable.id, id), ne(socialPostsTable.status, "published_manual"))).returning({ id: socialPostsTable.id });
    if (!deleted) {
      const [existing] = await db.select({ id: socialPostsTable.id }).from(socialPostsTable).where(eq(socialPostsTable.id, id)).limit(1);
      res.status(existing ? 409 : 404).json({ error: existing ? "Published content cannot be deleted" : "Post not found" }); return;
    }
    res.status(204).end();
  }));

  router.post("/admin/social/posts/:id/published-manually", permit("campaigns", "edit"), route(async (req, res) => {
    const id = idFromParam(req.params.id, res); if (!id) return;
    const [post] = await db.update(socialPostsTable)
      .set({ status: "published_manual", publishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(socialPostsTable.id, id), ne(socialPostsTable.status, "published_manual"))).returning();
    if (!post) {
      const [existing] = await db.select({ id: socialPostsTable.id }).from(socialPostsTable).where(eq(socialPostsTable.id, id)).limit(1);
      res.status(existing ? 409 : 404).json({ error: existing ? "Content already marked as published" : "Post not found" }); return;
    }
    res.json(Api.AdminMarkSocialPostPublishedManuallyResponse.parse(serialize(post)));
  }));

  router.post("/admin/social/media/upload-url", permit("campaigns", "edit"), route(async (req, res) => {
    const parsed = Api.AdminRequestSocialMediaUploadBody.strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(parsed.data.contentType)) {
      res.status(400).json({ error: "Only JPG, PNG, WebP and AVIF images are supported" }); return;
    }
    const upload = await storage.createPrivateUpload("uploads/marketing");
    res.json(Api.AdminRequestSocialMediaUploadResponse.parse({
      ...upload, imageUrl: `/api/admin/social/media/${upload.objectPath.split("/").at(-1)}`,
    }));
  }));

  router.get("/admin/social/media/:key", permit("campaigns", "view"), route(async (req, res) => {
    const key = req.params.key;
    if (typeof key !== "string" || !mediaKey.test(key)) { res.status(404).json({ error: "Image not found" }); return; }
    try {
      const { file, size, contentType } = await storage.getObjectMetadata(`/objects/uploads/marketing/${key}`);
      if (size < 1 || size > 10 * 1024 * 1024) { res.status(415).json({ error: "Unsupported image" }); return; }
      const [bytes] = await file.download();
      const mime = imageMime(bytes);
      if (!mime || mime !== contentType) { res.status(415).json({ error: "Unsupported image" }); return; }
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Length", bytes.length);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "sandbox");
      res.setHeader("Cache-Control", "private, no-store");
      res.end(bytes);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "Image not found" }); return; }
      throw error;
    }
  }));

  return router;
}