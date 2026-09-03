import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { adminUsersTable, db, ownerSessionsTable, ownerUsersTable } from "@workspace/db";
import app from "../app";
import { createAdminSession } from "../lib/admin-auth";

const ownerEmail = `owner-route-${Date.now()}@example.com`;
const ownerPassword = "owner-route-password";
let ownerToken: string;
let adminToken: string;
let ownerId: number;
let adminId: number;

beforeAll(async () => {
  process.env.OWNER_EMAIL = ownerEmail;
  process.env.OWNER_PASSWORD = ownerPassword;
  process.env.OWNER_NAME = "Route Test Owner";
  process.env.ADMIN_EMAIL = `owner-auth-admin-${Date.now()}@example.com`;
  process.env.ADMIN_PASSWORD = "owner-auth-admin-password";

  await request(app).post("/api/owner/auth/login").send({ email: ownerEmail, password: ownerPassword }).expect(200)
    .then((response) => {
      ownerToken = response.body.token;
      ownerId = response.body.user.id;
    });
  await request(app).get("/api/admin/dashboard").expect(401);
  const [admin] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable)
    .where(eq(adminUsersTable.email, process.env.ADMIN_EMAIL!)).limit(1);
  adminId = admin.id;
  adminToken = await createAdminSession(adminId);
});

afterAll(async () => {
  if (ownerId) {
    await db.delete(ownerSessionsTable).where(eq(ownerSessionsTable.ownerUserId, ownerId));
    await db.delete(ownerUsersTable).where(eq(ownerUsersTable.id, ownerId));
  }
  if (adminId) await db.delete(adminUsersTable).where(eq(adminUsersTable.id, adminId));
  delete process.env.OWNER_EMAIL;
  delete process.env.OWNER_PASSWORD;
  delete process.env.OWNER_NAME;
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
});

describe.sequential("owner route authorization", () => {
  it("creates and reads an owner session through the dedicated endpoints", async () => {
    const me = await request(app)
      .get("/api/owner/auth/me")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(me.body).toMatchObject({
      id: ownerId,
      email: ownerEmail,
      name: "Route Test Owner",
      isActive: true,
    });
    expect(me.body).not.toHaveProperty("passwordHash");
  });

  it("does not accept an admin token as an owner session", async () => {
    const response = await request(app)
      .get("/api/owner/auth/me")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(401);
    expect(response.body.error).toMatch(/owner authentication/i);
  });

  it("does not accept an owner token as an admin session", async () => {
    const response = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(401);
    expect(response.body.error).toMatch(/admin authentication/i);
  });

  it("revokes only the owner session", async () => {
    await request(app)
      .post("/api/owner/auth/logout")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(204);
    await request(app)
      .get("/api/owner/auth/me")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(401);
    await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
  });
});