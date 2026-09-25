import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import {
  adminUsersTable, db, ownerUsersTable, ownerObligationsTable,
  ownerObligationEventsTable, ownerObligationInstallmentsTable, ownerInstallmentRevisionsTable,
  journalEntryAuditTable, journalEntriesTable, journalEntryLinesTable,
} from "@workspace/db";
import { ensureOwnerSeeded } from "./owner-auth";
import { ObjectStorageService } from "./object-storage";
import {
  addInstallment, correctOwnerEvent, createEvent, createObligation, listObligations, ownerJournalReport,
  renewMonthlyObligation, reviewEvent, reviseInstallment,
} from "./owner-obligations";

const key = `owner-obligation-test-${Date.now()}`;
const created: number[] = [];
let ownerId: number;
let adminId: number;
let originalBalance: string;

beforeAll(async () => {
  await ensureOwnerSeeded();
  ownerId = (await db.select({ id: ownerUsersTable.id }).from(ownerUsersTable).limit(1))[0].id;
  adminId = (await db.select({ id: adminUsersTable.id }).from(adminUsersTable).limit(1))[0].id;
  originalBalance = (await ownerJournalReport()).balance;
});

afterAll(async () => {
  if (created.length) {
    const eventRows = await db.select({ journalEntryId: ownerObligationEventsTable.journalEntryId, reversalEntryId: ownerObligationEventsTable.reversalEntryId })
      .from(ownerObligationEventsTable).where(inArray(ownerObligationEventsTable.obligationId, created));
    const entries = eventRows.map((event) => event.journalEntryId).filter((id): id is number => id !== null);
    const reversals = eventRows.map((event) => event.reversalEntryId).filter((id): id is number => id !== null);
    const allEntries = [...entries, ...reversals];
    if (allEntries.length) {
      await db.execute(sql`alter table journal_entry_lines disable trigger journal_entry_lines_immutable`);
      await db.execute(sql`alter table journal_entries disable trigger journal_entries_immutable`);
    }
    try {
      await db.transaction(async (tx) => {
        if (allEntries.length) {
          await tx.delete(journalEntryAuditTable).where(inArray(journalEntryAuditTable.journalEntryId, allEntries));
          await tx.delete(journalEntryLinesTable).where(inArray(journalEntryLinesTable.journalEntryId, allEntries));
        }
        await tx.delete(ownerObligationEventsTable).where(inArray(ownerObligationEventsTable.obligationId, created));
        if (reversals.length) await tx.delete(journalEntriesTable).where(inArray(journalEntriesTable.id, reversals));
        if (entries.length) await tx.delete(journalEntriesTable).where(inArray(journalEntriesTable.id, entries));
      });
    } finally {
      if (allEntries.length) {
        await db.execute(sql`alter table journal_entry_lines enable trigger journal_entry_lines_immutable`);
        await db.execute(sql`alter table journal_entries enable trigger journal_entries_immutable`);
      }
    }
    const installments = await db.select({ id: ownerObligationInstallmentsTable.id }).from(ownerObligationInstallmentsTable)
      .where(inArray(ownerObligationInstallmentsTable.obligationId, created));
    if (installments.length) await db.delete(ownerInstallmentRevisionsTable)
      .where(inArray(ownerInstallmentRevisionsTable.installmentId, installments.map((item) => item.id)));
    await db.delete(ownerObligationInstallmentsTable).where(inArray(ownerObligationInstallmentsTable.obligationId, created));
    await db.delete(ownerObligationsTable).where(inArray(ownerObligationsTable.id, created));
  }
  expect((await ownerJournalReport()).balance).toBe(originalBalance);
});

describe.sequential("owner obligation ledger safeguards", () => {
  it("starts without imported obligation rows and rejects reusing a key with different contents", async () => {
    expect((await listObligations()).filter((row) => row.name.startsWith(key))).toHaveLength(0);
    const input = { name: `${key}-one`, amount: "10.0000", dueDate: "2026-12-01",
      recurrence: "once", liableParty: "owner", clientKey: `${key}-create` };
    const row = await createObligation(input, ownerId);
    created.push(row.id);
    expect((await createObligation(input, ownerId)).id).toBe(row.id);
    await expect(createObligation({ ...input, amount: "11.0000" }, ownerId)).rejects.toThrow(/different obligation/);
  });

  it("reserves concurrent partial payments, prevents overpayment, and keeps retries idempotent", async () => {
    const id = created[0];
    const make = (amount: string, suffix: string) => createEvent({
      obligationId: id, kind: "payment", amount, eventDate: "2026-12-02",
      payer: "owner", clientKey: `${key}-${suffix}`,
    }, ownerId);
    const results = await Promise.allSettled([make("7.0000", "a"), make("7.0000", "b")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const accepted = (results.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof make>>>).value;
    expect((await make("7.0000", accepted.clientKey.slice(key.length + 1))).id).toBe(accepted.id);
    await expect(make("6.0000", "over")).rejects.toThrow(/exceeds/);
    await expect(createEvent({ obligationId: id, kind: "transfer", eventDate: "2026-12-02", clientKey: `${key}-transfer` }, ownerId))
      .rejects.toThrow(/pending payments/);
    await expect(reviewEvent(accepted.id, { decision: "approved", evidence: "receipt number" }, adminId))
      .rejects.toThrow(/supporting document/);
    await reviewEvent(accepted.id, { decision: "rejected", reason: "No verifiable receipt" }, adminId);
    const [row] = (await listObligations()).filter((item) => item.id === id);
    expect(row.paid).toBe("0.0000");
    expect(row.remaining).toBe("10.0000");
    expect((await make("10.0000", "full")).amount).toBe("10.0000");
  });

  it("keeps an audit history when changing a scheduled installment", async () => {
    const row = await createObligation({ name: `${key}-schedule`, amount: "20.0000", dueDate: "2026-12-01",
      recurrence: "monthly", liableParty: "company", clientKey: `${key}-schedule-create` }, ownerId);
    created.push(row.id);
    const installment = await addInstallment({ obligationId: row.id, amount: "5.0000", dueDate: "2026-12-10" }, ownerId);
    await reviseInstallment(installment.id, { amount: "7.0000", dueDate: "2026-12-15" }, ownerId);
    const [current] = (await listObligations()).filter((item) => item.id === row.id);
    expect(current.installments[0].revisions).toMatchObject([
      { previousAmount: "5.0000", nextAmount: "7.0000", previousDate: "2026-12-10", nextDate: "2026-12-15" },
    ]);
    await expect(reviseInstallment(installment.id, { amount: "21.0000", dueDate: "2026-12-15" }, ownerId))
      .rejects.toThrow(/Scheduled amounts/);
  });

  it("creates one distinct debt per monthly occurrence, without copying payments", async () => {
    const parent = created[1];
    const january = await renewMonthlyObligation(parent, ownerId);
    created.push(january.id);
    expect(january.dueDate).toBe("2027-01-01");
    expect(january.renewalOf).toBe(parent);
    expect((await renewMonthlyObligation(parent, ownerId)).id).toBe(january.id);
    const february = await renewMonthlyObligation(january.id, ownerId);
    created.push(february.id);
    expect(february.dueDate).toBe("2027-02-01");
    expect((await listObligations()).find((row) => row.id === february.id)?.paid).toBe("0.0000");
  });

  it("posts a balanced owner-funded company payment once after document review", async () => {
    const row = await createObligation({ name: `${key}-company`, amount: "4.0000", dueDate: "2026-12-01",
      recurrence: "once", liableParty: "company", clientKey: `${key}-company-create` }, ownerId);
    created.push(row.id);
    const event = await createEvent({ obligationId: row.id, kind: "payment", amount: "4.0000",
      eventDate: "2026-12-02", payer: "owner", clientKey: `${key}-company-payment` }, ownerId);
    const mock = vi.spyOn(ObjectStorageService.prototype, "getObjectMetadata").mockResolvedValue({
      file: {} as Awaited<ReturnType<ObjectStorageService["getObjectFile"]>>,
      contentType: "application/pdf", size: 300,
    });
    try {
      const review = await reviewEvent(event.id, {
        decision: "approved", evidence: "/objects/owner-evidence/test-document",
        accountCode: "6190", reason: "Test company cost paid by owner",
      }, adminId);
      expect(review.journalEntryId).toBeTypeOf("number");
      expect((await ownerJournalReport()).balance).not.toBe(originalBalance);
      await expect(reviewEvent(event.id, { decision: "approved", evidence: review.evidence!, accountCode: "6190" }, adminId))
        .rejects.toThrow(/Pending event not found/);
      const lines = await db.select().from(journalEntryLinesTable).where(eq(journalEntryLinesTable.journalEntryId, review.journalEntryId!));
      expect(lines).toHaveLength(2);
      expect(lines.reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0)).toBe(0);
      const corrected = await correctOwnerEvent(event.id, {
        reason: "Original receipt was erroneous", evidence: "/objects/owner-evidence/correction-document", entryDate: "2026-12-03",
      }, adminId);
      expect(corrected.status).toBe("corrected");
      expect(corrected.reversalEntryId).toBeTypeOf("number");
      const after = (await listObligations()).find((item) => item.id === row.id)!;
      expect(after.paid).toBe("0.0000");
      expect(after.remaining).toBe("4.0000");
      expect((await ownerJournalReport()).balance).toBe(originalBalance);
      await expect(correctOwnerEvent(event.id, {
        reason: "again", evidence: "/objects/owner-evidence/correction-document", entryDate: "2026-12-03",
      }, adminId)).rejects.toThrow(/Only an approved/);
    } finally { mock.mockRestore(); }
  });

  it("blocks a company-bank payment for an owner-personal debt before transfer approval", async () => {
    const row = await createObligation({ name: `${key}-personal`, amount: "2.0000", dueDate: "2026-12-01",
      recurrence: "once", liableParty: "owner", clientKey: `${key}-personal-create` }, ownerId);
    created.push(row.id);
    await expect(createEvent({ obligationId: row.id, kind: "payment", amount: "1.0000",
      eventDate: "2026-12-02", payer: "company", clientKey: `${key}-company-on-personal` }, ownerId))
      .rejects.toThrow(/Company cannot pay/);
    expect((await listObligations()).find((item) => item.id === row.id)?.remaining).toBe("2.0000");
    expect((await ownerJournalReport()).balance).toBe(originalBalance);
  });
});