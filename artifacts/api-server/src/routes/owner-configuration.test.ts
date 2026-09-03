import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, ownerUsersTable } from "@workspace/db";
import app from "../app";

const configuredOwnerEmail = `owner-config-${Date.now()}@example.com`;

beforeAll(() => {
  process.env.ADMIN_EMAIL = `owner-config-admin-${Date.now()}@example.com`;
  process.env.ADMIN_PASSWORD = "owner-config-admin-password";
  delete process.env.OWNER_EMAIL;
  delete process.env.OWNER_PASSWORD;
});

afterAll(async () => {
  await db.delete(ownerUsersTable).where(eq(ownerUsersTable.email, configuredOwnerEmail));
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.OWNER_EMAIL;
  delete process.env.OWNER_PASSWORD;
});

describe("owner authentication configuration", () => {
  it("does not accept admin credentials when owner credentials are absent", async () => {
    const response = await request(app)
      .post("/api/owner/auth/login")
      .send({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      })
      .expect(503);
    expect(response.body.error).toMatch(/owner authentication is not configured/i);
    expect(response.body).not.toHaveProperty("token");
  });

  it("documents malformed owner credentials as a bad request once configured", async () => {
    process.env.OWNER_EMAIL = configuredOwnerEmail;
    process.env.OWNER_PASSWORD = "owner-config-password";
    await request(app)
      .post("/api/owner/auth/login")
      .send({ email: "not-an-email", password: "short" })
      .expect(400);
  });
});