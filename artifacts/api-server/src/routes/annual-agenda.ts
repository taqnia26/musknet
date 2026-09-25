import { Router, type IRouter, type RequestHandler } from "express";
import { and, eq, lte, gte, or } from "drizzle-orm";
import type { AnnualAgendaEvent } from "@workspace/db";

type Guard = (module: string, action: "view" | "edit" | "delete") => RequestHandler;
type EventType = "exhibition" | "occasion" | "holiday" | "launch" | "other";
type Recurrence = "none" | "annual_gregorian";

type EventFields = {
  title: string;
  type: EventType;
  startDate: string;
  endDate: string;
  recurrence: Recurrence;
  note: string | null;
};

const eventTypes: EventType[] = ["exhibition", "occasion", "holiday", "launch", "other"];
const recurrences: Recurrence[] = ["none", "annual_gregorian"];
const inputFields = new Set(["title", "type", "startDate", "endDate", "recurrence", "note"]);
const hijriDateFormatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
  year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC",
});

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateAnnualAgendaEvent(fields: EventFields): string | null {
  if (!fields.title.trim() || fields.title.length > 160) return "Title must contain 1 to 160 characters";
  if (!eventTypes.includes(fields.type)) return "Invalid event type";
  if (!isDate(fields.startDate) || !isDate(fields.endDate)) return "Dates must be valid YYYY-MM-DD calendar dates";
  if (fields.endDate < fields.startDate) return "End date must not be before start date";
  if (!recurrences.includes(fields.recurrence)) return "Invalid recurrence";
  if (fields.type === "exhibition" && fields.recurrence !== "none") {
    return "Exhibition dates are entered manually for each year and cannot recur";
  }
  if (fields.recurrence === "annual_gregorian" && fields.startDate.slice(0, 4) !== fields.endDate.slice(0, 4)) {
    return "Annual recurring events must start and end in the same Gregorian year";
  }
  if (fields.note !== null && (typeof fields.note !== "string" || fields.note.length > 2000)) {
    return "Note must be 2000 characters or fewer";
  }
  return null;
}

export function parseAnnualAgendaInput(value: unknown, partial = false):
  { data: Partial<EventFields>; error?: never } | { data?: never; error: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Expected an event object" };
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !inputFields.has(key))) return { error: "Unknown event fields" };
  if (partial && Object.keys(body).length === 0) return { error: "At least one change is required" };

  const data: Partial<EventFields> = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 160) {
      return { error: "Title must contain 1 to 160 characters" };
    }
    data.title = body.title.trim();
  } else if (!partial) return { error: "Title is required" };

  if (body.type !== undefined) {
    if (typeof body.type !== "string" || !eventTypes.includes(body.type as EventType)) return { error: "Invalid event type" };
    data.type = body.type as EventType;
  } else if (!partial) return { error: "Type is required" };

  for (const key of ["startDate", "endDate"] as const) {
    if (body[key] !== undefined) {
      if (!isDate(body[key])) return { error: `${key} must be a valid YYYY-MM-DD calendar date` };
      data[key] = body[key];
    } else if (!partial) return { error: `${key} is required` };
  }

  if (body.recurrence !== undefined) {
    if (typeof body.recurrence !== "string" || !recurrences.includes(body.recurrence as Recurrence)) {
      return { error: "Invalid recurrence" };
    }
    data.recurrence = body.recurrence as Recurrence;
  } else if (!partial) return { error: "Recurrence is required" };

  if (Object.hasOwn(body, "note")) {
    if (body.note !== null && (typeof body.note !== "string" || body.note.length > 2000)) {
      return { error: "Note must be null or a string of 2000 characters or fewer" };
    }
    data.note = body.note as string | null;
  } else if (!partial) {
    data.note = null;
  }
  return { data };
}

function gregorianDate(year: number, monthDay: string): string {
  const month = Number(monthDay.slice(0, 2));
  const day = Number(monthDay.slice(2));
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, maxDay)).padStart(2, "0")}`;
}

export function annualAgendaOccurrenceDate(originalDate: string, year: number): string {
  return gregorianDate(year, originalDate.slice(5, 7) + originalDate.slice(8, 10));
}

export type AgendaOccurrence = {
  id: number;
  title: string;
  type: EventType;
  startDate: string;
  endDate: string;
  recurrence: Recurrence;
  note: string | null;
  source: "builtin" | "custom";
  estimated: boolean;
};

const fixedBuiltins = [
  { id: -1, title: "Saudi Founding Day", date: "02-22" },
  { id: -2, title: "Saudi National Day", date: "09-23" },
] as const;

export function builtinAnnualAgendaOccurrences(year: number): AgendaOccurrence[] {
  const fixed = fixedBuiltins.map(({ id, title, date }) => {
    const startDate = `${year}-${date}`;
    return {
      id, title, type: "holiday" as const, startDate, endDate: startDate,
      recurrence: "annual_gregorian" as const, note: null, source: "builtin" as const, estimated: false,
    };
  });

  const islamicDays = new Map<string, { title: string; type: EventType }>([
    ["9-1", { title: "Ramadan begins (estimated)", type: "occasion" }],
    ["10-1", { title: "Eid al-Fitr (estimated)", type: "holiday" }],
    ["12-10", { title: "Eid al-Adha (estimated)", type: "holiday" }],
  ]);
  const estimated: AgendaOccurrence[] = [];
  const lastDay = new Date(Date.UTC(year, 11, 31));
  for (let day = new Date(Date.UTC(year, 0, 1)); day <= lastDay; day.setUTCDate(day.getUTCDate() + 1)) {
    const parts = hijriDateFormatter.formatToParts(day);
    const hijriMonth = Number(parts.find((part) => part.type === "month")?.value);
    const hijriDay = Number(parts.find((part) => part.type === "day")?.value);
    const details = islamicDays.get(`${hijriMonth}-${hijriDay}`);
    if (!details) continue;
    const startDate = day.toISOString().slice(0, 10);
    estimated.push({
      id: -estimated.length - 3, title: details.title, type: details.type, startDate, endDate: startDate,
      recurrence: "none", note: "Estimated from the Umm al-Qura calendar; actual dates may vary by official announcement.",
      source: "builtin", estimated: true,
    });
  }
  return [...fixed, ...estimated].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function customOccurrence(row: AnnualAgendaEvent, year: number): AgendaOccurrence | null {
  let startDate = row.startDate;
  let endDate = row.endDate;
  if (row.recurrence === "annual_gregorian") {
    startDate = annualAgendaOccurrenceDate(row.startDate, year);
    endDate = annualAgendaOccurrenceDate(row.endDate, year);
  } else if (row.endDate < `${year}-01-01` || row.startDate > `${year}-12-31`) {
    return null;
  }
  return {
    id: row.id, title: row.title, type: row.type as EventType, startDate, endDate,
    recurrence: row.recurrence as Recurrence, note: row.note, source: "custom", estimated: false,
  };
}

function customRecord(row: AnnualAgendaEvent): AgendaOccurrence {
  return {
    id: row.id, title: row.title, type: row.type as EventType, startDate: row.startDate, endDate: row.endDate,
    recurrence: row.recurrence as Recurrence, note: row.note, source: "custom", estimated: false,
  };
}

function idFromRequest(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  return value && Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function createAnnualAgendaRouter(permit: Guard): IRouter {
  const router: IRouter = Router();

  router.get("/admin/b2b/agenda", permit("distributors", "view"), async (req, res): Promise<void> => {
    const rawYear = req.query.year;
    const year = typeof rawYear === "string" && /^\d{4}$/.test(rawYear) ? Number(rawYear) : NaN;
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      res.status(400).json({ error: "year must be a Gregorian calendar year from 1900 through 2100" });
      return;
    }
    const { annualAgendaEventsTable, db } = await import("@workspace/db");
    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;
    const rows = await db.select().from(annualAgendaEventsTable).where(or(
      eq(annualAgendaEventsTable.recurrence, "annual_gregorian"),
      and(lte(annualAgendaEventsTable.startDate, endOfYear), gte(annualAgendaEventsTable.endDate, startOfYear)),
    ));
    const occurrences = [
      ...builtinAnnualAgendaOccurrences(year),
      ...rows.map((row) => customOccurrence(row, year)).filter((event): event is AgendaOccurrence => event !== null),
    ].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
    res.json(occurrences);
  });

  router.post("/admin/b2b/agenda", permit("distributors", "edit"), async (req, res): Promise<void> => {
    const parsed = parseAnnualAgendaInput(req.body);
    if (!parsed.data) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const input = parsed.data as EventFields;
    const invalid = validateAnnualAgendaEvent(input);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }
    const adminId = (res.locals.admin as { id: number }).id;
    const { annualAgendaEventsTable, db } = await import("@workspace/db");
    const [row] = await db.insert(annualAgendaEventsTable).values({
      ...input, createdBy: adminId,
    }).returning();
    res.status(201).json(customRecord(row));
  });

  router.patch("/admin/b2b/agenda/:id", permit("distributors", "edit"), async (req, res): Promise<void> => {
    const id = idFromRequest(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid custom agenda event id" });
      return;
    }
    const parsed = parseAnnualAgendaInput(req.body, true);
    if (!parsed.data) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { annualAgendaEventsTable, db } = await import("@workspace/db");
    const [existing] = await db.select().from(annualAgendaEventsTable)
      .where(eq(annualAgendaEventsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Custom agenda event not found" });
      return;
    }
    const merged: EventFields = {
      title: parsed.data.title ?? existing.title,
      type: parsed.data.type ?? existing.type as EventType,
      startDate: parsed.data.startDate ?? existing.startDate,
      endDate: parsed.data.endDate ?? existing.endDate,
      recurrence: parsed.data.recurrence ?? existing.recurrence as Recurrence,
      note: parsed.data.note === undefined ? existing.note : parsed.data.note,
    };
    const invalid = validateAnnualAgendaEvent(merged);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }
    const [row] = await db.update(annualAgendaEventsTable)
      .set({ ...merged, updatedAt: new Date() })
      .where(eq(annualAgendaEventsTable.id, id)).returning();
    res.json(customRecord(row));
  });

  router.delete("/admin/b2b/agenda/:id", permit("distributors", "delete"), async (req, res): Promise<void> => {
    const id = idFromRequest(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid custom agenda event id" });
      return;
    }
    const { annualAgendaEventsTable, db } = await import("@workspace/db");
    const [deleted] = await db.delete(annualAgendaEventsTable)
      .where(eq(annualAgendaEventsTable.id, id)).returning({ id: annualAgendaEventsTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Custom agenda event not found" });
      return;
    }
    res.status(204).end();
  });

  return router;
}