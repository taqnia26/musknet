import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  annualAgendaEventsTable,
  db,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";
import {
  annualAgendaOccurrenceDate,
  builtinAnnualAgendaOccurrences,
  parseAnnualAgendaInput,
  validateAnnualAgendaEvent,
} from "./annual-agenda";

const fixtureSuffix = Date.now();
const fixtureBase = 1_750_000_000 + (fixtureSuffix % 100_000_000);
const fixtureRoles = [
  { key: "writer", id: fixtureBase, actions: ["view", "edit", "delete"] },
  { key: "editor", id: fixtureBase + 1, actions: ["view", "edit"] },
  { key: "reader", id: fixtureBase + 2, actions: ["view"] },
  { key: "no-access", id: fixtureBase + 3, actions: [] },
] as const;
const fixtureTokens = new Map<string, string>();
const fixtureAuth = (role: string) => ({ Authorization: `Bearer ${fixtureTokens.get(role)}` });

beforeAll(async () => {
  await db.insert(adminPermissionsTable).values(
    ["view", "edit", "delete"].map((action) => ({ module: "distributors", action })),
  ).onConflictDoNothing();
  await db.insert(adminUsersTable).values(await Promise.all(fixtureRoles.map(async ({ key, id }) => ({
    id,
    email: `annual-agenda-${key}-${fixtureSuffix}@example.com`,
    name: `Agenda ${key}`,
    passwordHash: await hashAdminPassword(`agenda-test-${fixtureSuffix}`),
    isSuperAdmin: false,
    isActive: true,
  }))));
  const permissions = await db.select().from(adminPermissionsTable)
    .where(eq(adminPermissionsTable.module, "distributors"));
  await db.insert(adminUserPermissionsTable).values(fixtureRoles.flatMap(({ id, actions }) =>
    permissions.filter((permission) => (actions as readonly string[]).includes(permission.action))
      .map((permission) => ({ adminUserId: id, permissionId: permission.id })),
  ));
  for (const { key, id } of fixtureRoles) fixtureTokens.set(key, await createAdminSession(id));
});

afterAll(async () => {
  await db.delete(annualAgendaEventsTable).where(eq(annualAgendaEventsTable.createdBy, fixtureBase));
  const ids = fixtureRoles.map(({ id }) => id);
  await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminUserId, ids));
  await db.delete(adminUserPermissionsTable).where(inArray(adminUserPermissionsTable.adminUserId, ids));
  await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, ids));
});

describe("B2B annual agenda rules", () => {
  it("rejects impossible calendar dates and invalid ranges", () => {
    const invalidDay = parseAnnualAgendaInput({
      title: "Launch", type: "launch", startDate: "2025-02-29", endDate: "2025-03-01", recurrence: "none",
    });
    expect(invalidDay.error).toContain("valid YYYY-MM-DD");

    const backwards = {
      title: "Launch", type: "launch" as const, startDate: "2025-05-02", endDate: "2025-05-01",
      recurrence: "none" as const, note: null,
    };
    expect(validateAnnualAgendaEvent(backwards)).toContain("End date");
  });

  it("requires exhibitions to be entered manually for each year", () => {
    const exhibition = {
      title: "Trade fair", type: "exhibition" as const, startDate: "2025-05-02", endDate: "2025-05-03",
      recurrence: "annual_gregorian" as const, note: null,
    };
    expect(validateAnnualAgendaEvent(exhibition)).toContain("manually for each year");
  });

  it("maps recurring February 29 events to February 28 in non-leap years", () => {
    expect(annualAgendaOccurrenceDate("2024-02-29", 2025)).toBe("2025-02-28");
    expect(annualAgendaOccurrenceDate("2024-02-29", 2024)).toBe("2024-02-29");
  });

  it("returns fixed holidays plus explicitly estimated Umm al-Qura occurrences", () => {
    const occurrences = builtinAnnualAgendaOccurrences(2025);
    expect(occurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Saudi Founding Day", startDate: "2025-02-22", estimated: false, source: "builtin" }),
      expect.objectContaining({ title: "Saudi National Day", startDate: "2025-09-23", estimated: false, source: "builtin" }),
    ]));
    expect(occurrences.filter((item) => item.estimated)).toHaveLength(3);
    expect(occurrences.filter((item) => item.estimated).every((item) => item.note?.includes("Umm al-Qura"))).toBe(true);
    expect(occurrences.some((item) => item.title.toLowerCase().includes("exhibition"))).toBe(false);
  });
});

describe.sequential("B2B annual agenda admin integration", () => {
  const basePath = "/api/admin/b2b/agenda";
  it("supports custom event CRUD, annual occurrences, builtin read-only rules, and distributors permissions", async () => {

    await request(app).get(`${basePath}?year=2025`).expect(401);
    await request(app).get(`${basePath}?year=2025`).set(fixtureAuth("no-access")).expect(403);
    const readerAgenda = await request(app).get(`${basePath}?year=2025`).set(fixtureAuth("reader")).expect(200);
    expect(readerAgenda.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: -1, title: "Saudi Founding Day", source: "builtin" }),
      expect.objectContaining({ id: -2, title: "Saudi National Day", source: "builtin" }),
    ]));
    await request(app).post(basePath).set(fixtureAuth("reader")).send({
      title: "Denied launch", type: "launch", startDate: "2025-10-12", endDate: "2025-10-12", recurrence: "none",
    }).expect(403);

    const eventResponse = await request(app).post(basePath).set(fixtureAuth("writer")).send({
      title: "Annual partner summit", type: "occasion",
      startDate: "2025-10-12", endDate: "2025-10-13",
      recurrence: "annual_gregorian", note: "Partner gathering",
    }).expect(201);
    const eventId = eventResponse.body.id as number;
    expect(eventResponse.body).toMatchObject({
      title: "Annual partner summit", startDate: "2025-10-12", endDate: "2025-10-13",
      recurrence: "annual_gregorian", source: "custom", estimated: false,
    });

    await request(app).post(basePath).set(fixtureAuth("writer")).send({
      title: "Manual trade fair", type: "exhibition",
      startDate: "2025-11-01", endDate: "2025-11-03",
      recurrence: "annual_gregorian",
    }).expect(400);

    const nextYear = await request(app).get(`${basePath}?year=2026`).set(fixtureAuth("reader")).expect(200);
    expect(nextYear.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: eventId, title: "Annual partner summit", startDate: "2026-10-12",
        endDate: "2026-10-13", recurrence: "annual_gregorian",
      }),
    ]));

    const updated = await request(app).patch(`${basePath}/${eventId}`).set(fixtureAuth("editor")).send({
      title: "Updated partner summit", note: "Updated details",
    }).expect(200);
    expect(updated.body).toMatchObject({
      id: eventId, title: "Updated partner summit", note: "Updated details", source: "custom",
    });
    await request(app).delete(`${basePath}/${eventId}`).set(fixtureAuth("editor")).expect(403);
    await request(app).patch(`${basePath}/${eventId}`).set(fixtureAuth("reader")).send({ note: null }).expect(403);

    await request(app).patch(`${basePath}/-1`).set(fixtureAuth("writer")).send({ title: "Altered builtin" }).expect(400);
    await request(app).delete(`${basePath}/-2`).set(fixtureAuth("writer")).expect(400);
    await request(app).delete(`${basePath}/${eventId}`).set(fixtureAuth("writer")).expect(204);

    const afterDelete = await request(app).get(`${basePath}?year=2026`).set(fixtureAuth("reader")).expect(200);
    expect(afterDelete.body).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: eventId, source: "custom" }),
    ]));
  });

  it("preserves a leap-day recurrence anchor when editing unrelated fields", async () => {
    const created = await request(app).post(basePath).set(fixtureAuth("writer")).send({
      title: "Leap gathering", type: "occasion",
      startDate: "2024-02-29", endDate: "2024-02-29",
      recurrence: "annual_gregorian", note: null,
    }).expect(201);
    const id = created.body.id as number;
    const projected = await request(app).get(`${basePath}?year=2027`).set(fixtureAuth("reader")).expect(200);
    expect(projected.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, startDate: "2027-02-28" }),
    ]));
    await request(app).patch(`${basePath}/${id}`).set(fixtureAuth("editor"))
      .send({ note: "Updated from the projected year" }).expect(200);
    const leapYear = await request(app).get(`${basePath}?year=2028`).set(fixtureAuth("reader")).expect(200);
    expect(leapYear.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, startDate: "2028-02-29", note: "Updated from the projected year" }),
    ]));
  });
});