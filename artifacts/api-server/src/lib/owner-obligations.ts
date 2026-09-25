import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  accountingAccountsTable, db, journalEntriesTable, journalEntryLinesTable,
  ownerJournalReviewsTable, ownerObligationsTable, ownerObligationEventsTable,
  ownerObligationInstallmentsTable, purchasesTable,
  ownerInstallmentRevisionsTable,
} from "@workspace/db";
import { ensureStandardAccountingChart, exactMoney, postJournalEntry, reverseJournalEntry } from "./accounting";
import { ObjectStorageService } from "./object-storage";

const evidenceStorage = new ObjectStorageService();
export async function verifyOwnerEvidence(path: string) {
  if (!/^\/objects\/owner-evidence\/[a-zA-Z0-9/_-]+$/.test(path)) throw new Error("Upload a private supporting document");
  const metadata = await evidenceStorage.getObjectMetadata(path);
  if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(metadata.contentType ?? "") ||
    metadata.size <= 0 || metadata.size > 10 * 1024 * 1024) throw new Error("Supporting document must be PDF or image, 10 MB maximum");
}

const units = (value: string) => {
  if (!/^\d{1,14}(?:\.\d{1,4})?$/.test(value) || Number(value) <= 0) throw new Error("Positive amount with up to four decimals required");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
};
const formatted = (value: bigint) => `${value / 10000n}.${String(value % 10000n).padStart(4, "0")}`;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const assertDate = (value: string) => { if (!validDate(value)) throw new Error("Valid calendar date required"); return value; };
export const assertAmount = (value: string) => { units(value); return exactMoney(value); };

export async function listObligations() {
  const rows = await db.select().from(ownerObligationsTable).orderBy(desc(ownerObligationsTable.createdAt));
  const events = await db.select().from(ownerObligationEventsTable).orderBy(ownerObligationEventsTable.id);
  const installments = await db.select().from(ownerObligationInstallmentsTable).orderBy(ownerObligationInstallmentsTable.dueDate);
  const revisions = await db.select().from(ownerInstallmentRevisionsTable);
  return rows.map((row) => {
    const related = events.filter((event) => event.obligationId === row.id);
    // Rejected reports are not payments. Pending reports reserve the balance until reviewed.
    const paid = related.filter((event) => event.kind === "payment" && event.status === "approved")
      .reduce((sum, event) => sum + units(event.amount!), 0n);
    const transferred = related.some((event) => event.kind === "transfer" && event.status === "approved");
    return { ...row, paid: formatted(paid), remaining: formatted(units(row.amount) - paid),
      effectiveLiableParty: transferred ? "company" : row.liableParty,
      events: related, installments: installments.filter((item) => item.obligationId === row.id)
        .map((item) => ({ ...item, revisions: revisions.filter((revision) => revision.installmentId === item.id) })) };
  });
}

export async function createObligation(input: { name: string; amount: string; dueDate: string; recurrence: string; liableParty: string; clientKey: string }, ownerId: number) {
  if (!input.name.trim() || input.name.length > 200 || !["once", "monthly"].includes(input.recurrence) ||
    !["owner", "company"].includes(input.liableParty) || !input.clientKey.trim()) throw new Error("Invalid obligation details");
  const normalized = { name: input.name.trim(), amount: assertAmount(input.amount), dueDate: assertDate(input.dueDate),
    recurrence: input.recurrence, liableParty: input.liableParty, clientKey: input.clientKey, createdBy: ownerId };
  const created = (await db.insert(ownerObligationsTable).values({
    ...normalized,
  }).onConflictDoNothing().returning())[0];
  if (created) return created;
  const [existing] = await db.select().from(ownerObligationsTable).where(eq(ownerObligationsTable.clientKey, input.clientKey));
  if (!existing || Object.entries(normalized).some(([key, value]) => existing[key as keyof typeof existing] !== value))
    throw new Error("Request key already used for different obligation");
  return existing;
}

export async function renewMonthlyObligation(id: number, ownerId: number) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${ownerObligationsTable} where ${ownerObligationsTable.id} = ${id} for update`);
    const [parent] = await tx.select().from(ownerObligationsTable).where(eq(ownerObligationsTable.id, id));
    if (!parent || parent.recurrence !== "monthly") throw new Error("Monthly obligation not found");
    const [existing] = await tx.select().from(ownerObligationsTable).where(eq(ownerObligationsTable.renewalOf, id));
    if (existing) return existing;
    let anchor = parent;
    while (anchor.renewalOf) {
      const [previous] = await tx.select().from(ownerObligationsTable).where(eq(ownerObligationsTable.id, anchor.renewalOf));
      if (!previous) throw new Error("Monthly series has a missing source");
      anchor = previous;
    }
    const [year, month] = parent.dueDate.split("-").map(Number);
    const next = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(Number(anchor.dueDate.slice(-2)), lastDay));
    const [created] = await tx.insert(ownerObligationsTable).values({
      name: parent.name, amount: parent.amount, dueDate: next.toISOString().slice(0, 10),
      recurrence: "monthly", liableParty: parent.liableParty, renewalOf: parent.id,
      clientKey: `owner-monthly-renewal:${parent.id}`, createdBy: ownerId,
    }).returning();
    return created;
  });
}

export async function createEvent(input: { obligationId: number; kind: string; amount?: string; eventDate: string; payer?: string; clientKey: string }, ownerId: number) {
    if (!["payment", "transfer"].includes(input.kind) || !input.clientKey.trim() ||
    (input.kind === "payment" && !["owner", "company"].includes(input.payer ?? ""))) throw new Error("Invalid event");
  assertDate(input.eventDate);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${ownerObligationsTable} where ${ownerObligationsTable.id} = ${input.obligationId} for update`);
    const [row] = await tx.select().from(ownerObligationsTable).where(eq(ownerObligationsTable.id, input.obligationId));
    if (!row) throw new Error("Obligation not found");
    const [duplicate] = await tx.select().from(ownerObligationEventsTable).where(eq(ownerObligationEventsTable.clientKey, input.clientKey));
    if (duplicate) {
      if (duplicate.obligationId !== input.obligationId || duplicate.kind !== input.kind ||
        duplicate.eventDate !== input.eventDate || duplicate.payer !== (input.payer ?? null) ||
        duplicate.amount !== (input.kind === "payment" ? assertAmount(input.amount ?? "") : null))
        throw new Error("Request key already used for another event");
      return duplicate;
    }
    const events = await tx.select().from(ownerObligationEventsTable).where(eq(ownerObligationEventsTable.obligationId, row.id));
    if (input.kind === "payment" && input.payer === "company" && row.liableParty === "owner" &&
      !events.some((event) => event.kind === "transfer" && event.status === "approved"))
      throw new Error("Company cannot pay an owner-personal debt before liability transfer is approved");
    if (events.some((event) => event.kind === "transfer" && event.status === "pending")) throw new Error("Resolve the transfer request before another event");
    if (input.kind === "transfer" && events.some((event) => event.kind === "payment" && event.status === "pending"))
      throw new Error("Review pending payments before transferring this debt");
    const remaining = units(row.amount) - events.filter((event) => event.kind === "payment" && ["pending", "approved"].includes(event.status))
      .reduce((sum, event) => sum + units(event.amount!), 0n);
    if (remaining <= 0n) throw new Error("Obligation is already fully paid");
    if (input.kind === "transfer" && (row.liableParty !== "owner" || events.some((event) => event.kind === "transfer" && event.status === "approved")))
      throw new Error("Only an owner debt can be requested for transfer once");
    const amount = input.kind === "payment" ? assertAmount(input.amount ?? "") : formatted(remaining);
    if (units(amount) > remaining) throw new Error("Payment exceeds the remaining amount");
    const [created] = await tx.insert(ownerObligationEventsTable).values({
      obligationId: row.id, kind: input.kind, amount, eventDate: input.eventDate,
      payer: input.kind === "payment" ? input.payer : null, clientKey: input.clientKey, createdByOwner: ownerId,
    }).returning();
    return created;
  });
}

export async function addInstallment(input: { obligationId: number; amount: string; dueDate: string }, ownerId: number) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${ownerObligationsTable} where ${ownerObligationsTable.id} = ${input.obligationId} for update`);
    const [row] = await tx.select().from(ownerObligationsTable).where(eq(ownerObligationsTable.id, input.obligationId));
    if (!row) throw new Error("Obligation not found");
    const events = await tx.select().from(ownerObligationEventsTable).where(eq(ownerObligationEventsTable.obligationId, row.id));
    const remaining = units(row.amount) - events.filter((event) => event.kind === "payment" && ["pending", "approved"].includes(event.status))
      .reduce((sum, event) => sum + units(event.amount!), 0n);
    const scheduled = await tx.select().from(ownerObligationInstallmentsTable).where(eq(ownerObligationInstallmentsTable.obligationId, row.id));
    const amount = assertAmount(input.amount);
    if (units(amount) + scheduled.reduce((sum, item) => sum + units(item.amount), 0n) > remaining) throw new Error("Scheduled amounts exceed remaining debt");
    const [created] = await tx.insert(ownerObligationInstallmentsTable).values({ obligationId: row.id, amount, dueDate: assertDate(input.dueDate), createdBy: ownerId }).returning();
    return created;
  });
}

export async function reviseInstallment(id: number, input: { amount: string; dueDate: string }, ownerId: number) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(ownerObligationInstallmentsTable).where(eq(ownerObligationInstallmentsTable.id, id));
    if (!existing) throw new Error("Installment not found");
    await tx.execute(sql`select id from ${ownerObligationsTable} where ${ownerObligationsTable.id} = ${existing.obligationId} for update`);
    const [current] = await tx.select().from(ownerObligationInstallmentsTable).where(eq(ownerObligationInstallmentsTable.id, id));
    const [obligation] = await tx.select().from(ownerObligationsTable).where(eq(ownerObligationsTable.id, current.obligationId));
    const events = await tx.select().from(ownerObligationEventsTable).where(eq(ownerObligationEventsTable.obligationId, current.obligationId));
    const reserved = events.filter((event) => event.kind === "payment" && ["pending", "approved"].includes(event.status))
      .reduce((sum, event) => sum + units(event.amount!), 0n);
    const installments = await tx.select().from(ownerObligationInstallmentsTable).where(eq(ownerObligationInstallmentsTable.obligationId, current.obligationId));
    const amount = assertAmount(input.amount);
    const dueDate = assertDate(input.dueDate);
    const others = installments.filter((item) => item.id !== id).reduce((sum, item) => sum + units(item.amount), 0n);
    if (others + units(amount) > units(obligation.amount) - reserved) throw new Error("Scheduled amounts exceed unreserved debt");
    if (current.amount === amount && current.dueDate === dueDate) return current;
    const [updated] = await tx.update(ownerObligationInstallmentsTable).set({ amount, dueDate }).where(eq(ownerObligationInstallmentsTable.id, id)).returning();
    await tx.insert(ownerInstallmentRevisionsTable).values({
      installmentId: id, previousAmount: current.amount, previousDate: current.dueDate,
      nextAmount: amount, nextDate: dueDate, changedBy: ownerId,
    });
    return updated;
  });
}

export async function reviewEvent(id: number, input: { decision: "approved" | "rejected"; evidence?: string; accountCode?: string; reason?: string }, actorId: number) {
  if (input.decision === "approved") await verifyOwnerEvidence(input.evidence ?? "");
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${ownerObligationEventsTable} where ${ownerObligationEventsTable.id} = ${id} for update`);
    const [event] = await tx.select().from(ownerObligationEventsTable).where(eq(ownerObligationEventsTable.id, id));
    if (!event || event.status !== "pending") throw new Error("Pending event not found");
    const [row] = await tx.select().from(ownerObligationsTable).where(eq(ownerObligationsTable.id, event.obligationId));
    const [transfer] = await tx.select().from(ownerObligationEventsTable).where(and(eq(ownerObligationEventsTable.obligationId, row.id), eq(ownerObligationEventsTable.kind, "transfer"), eq(ownerObligationEventsTable.status, "approved")));
    if (input.decision === "rejected") {
      if (!input.reason?.trim()) throw new Error("Rejection reason required");
      return (await tx.update(ownerObligationEventsTable).set({ status: "rejected", reason: input.reason.trim(), reviewedBy: actorId, reviewedAt: new Date() }).where(eq(ownerObligationEventsTable.id, id)).returning())[0];
    }
    if (event.kind === "payment" && event.payer === "company" && row.liableParty === "owner" && !transfer)
      throw new Error("Company cannot approve payment of a personal owner debt without approved transfer");
    const companyLiability = row.liableParty === "company" || Boolean(transfer) || event.kind === "transfer";
    let journalEntryId: number | null = null;
    if (companyLiability) {
      if (!input.evidence?.trim() || !input.accountCode?.trim() || !input.reason?.trim()) throw new Error("Evidence, classification and reason required");
      const [account] = await tx.select().from(accountingAccountsTable).where(eq(accountingAccountsTable.code, input.accountCode.trim()));
       if (!account?.isActive || !account.isPosting || ["1120", "2140"].includes(account.code)) throw new Error("Select a posting counter-account other than bank or owner payable");
       if (event.kind === "transfer" && account.code === "2110") throw new Error("Select the actual expense or asset for the transferred debt");
       if (event.kind === "payment" && transfer && account.code !== "2110") throw new Error("Payment of transferred debt must settle the accrued company payable (2110)");
      const credit = event.kind === "transfer" ? "2110" : event.payer === "owner" ? "2140" : "1120";
      const debit = event.kind === "payment" && transfer ? "2110" : account.code;
      if (debit === credit) throw new Error("Counter-account cannot equal the settlement account");
      const entry = await postJournalEntry({
        entryDate: event.eventDate, description: `Owner obligation #${row.id}: ${input.reason.trim()}`,
        createdBy: actorId, sourceType: "owner_obligation_event", sourceId: String(event.id),
        lines: [{ accountCode: debit, debit: event.amount! }, { accountCode: credit, credit: event.amount! }],
      }, tx);
      journalEntryId = entry.id;
    }
    if (!input.evidence?.trim()) throw new Error("Payment or transfer evidence required");
    return (await tx.update(ownerObligationEventsTable).set({
      status: "approved", evidence: input.evidence.trim(), accountCode: input.accountCode?.trim() ?? null,
      reason: input.reason?.trim() ?? null, journalEntryId, reviewedBy: actorId, reviewedAt: new Date(),
    }).where(eq(ownerObligationEventsTable.id, id)).returning())[0];
  });
}

export async function correctOwnerEvent(id: number, input: { reason: string; evidence: string; entryDate: string }, actorId: number) {
  if (!input.reason.trim()) throw new Error("Correction reason required");
  assertDate(input.entryDate);
  await verifyOwnerEvidence(input.evidence);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${ownerObligationEventsTable} where ${ownerObligationEventsTable.id} = ${id} for update`);
    const [event] = await tx.select().from(ownerObligationEventsTable).where(eq(ownerObligationEventsTable.id, id));
    if (!event || event.status !== "approved") throw new Error("Only an approved, uncorrected event can be corrected");
    const later = await tx.select().from(ownerObligationEventsTable).where(eq(ownerObligationEventsTable.obligationId, event.obligationId));
    if (event.kind === "transfer" && later.some((item) => item.id > id && item.kind === "payment" && item.status === "approved"))
      throw new Error("Correct subsequent approved payments before correcting the transfer");
    if (event.kind === "payment" && later.some((item) => item.id > id && item.kind === "transfer" && item.status === "approved"))
      throw new Error("Correct the subsequent liability transfer before correcting this payment");
    const reversal = event.journalEntryId
      ? await reverseJournalEntry(event.journalEntryId, actorId,
        `Owner event #${id} correction: ${input.reason.trim()} | Evidence: ${input.evidence}`, input.entryDate, tx)
      : null;
    return (await tx.update(ownerObligationEventsTable).set({
      status: "corrected", correctionReason: input.reason.trim(), correctionEvidence: input.evidence,
      correctedBy: actorId, correctedAt: new Date(), reversalEntryId: reversal?.id ?? null,
    }).where(eq(ownerObligationEventsTable.id, id)).returning())[0];
  });
}

export async function ownerJournalReport() {
  const [account] = await db.select().from(accountingAccountsTable).where(eq(accountingAccountsTable.code, "2140"));
  if (!account) return { balance: "0.0000", entries: [], note: "Owner payable account not initialized" };
  const lines = await db.select({ entry: journalEntriesTable, line: journalEntryLinesTable })
    .from(journalEntryLinesTable).innerJoin(journalEntriesTable, eq(journalEntryLinesTable.journalEntryId, journalEntriesTable.id))
    .where(and(eq(journalEntryLinesTable.accountId, account.id), inArray(journalEntriesTable.status, ["posted", "reversed"])))
    .orderBy(journalEntriesTable.entryDate, journalEntriesTable.id);
  const reviews = await db.select().from(ownerJournalReviewsTable);
  const purchases = await db.select({ id: purchasesTable.id, paymentSource: purchasesTable.paymentSource, title: purchasesTable.title }).from(purchasesTable);
  const balance = lines.reduce((sum, { line }) => sum + BigInt(Math.round(Number(line.credit) * 10000)) - BigInt(Math.round(Number(line.debit) * 10000)), 0n);
  return {
    balance: balance < 0n ? `-${formatted(-balance)}` : formatted(balance),
    entries: lines.map(({ entry, line }) => ({
      id: entry.id, entryNumber: entry.entryNumber, entryDate: entry.entryDate, description: entry.description,
      sourceType: entry.sourceType, sourceId: entry.sourceId, status: entry.status,
      debit: line.debit, credit: line.credit,
      sourceDetail: entry.sourceType === "purchase" ? purchases.find((item) => String(item.id) === entry.sourceId) ?? null : null,
      review: reviews.find((review) => review.journalEntryId === entry.id) ?? null,
      projectedBalanceChangeIfReversed: exactMoney(Number(line.debit) - Number(line.credit)),
    })),
    note: "Only documented invalid entries may be reversed. Valid owner-funded purchases remain payable until reimbursed.",
  };
}

export async function reviewOwnerJournal(id: number, input: { decision: "retain" | "reverse"; reason: string; evidence: string; entryDate: string }, actorId: number) {
  if (!input.reason.trim() || !input.evidence.trim()) throw new Error("Reason and evidence required");
  await verifyOwnerEvidence(input.evidence);
  assertDate(input.entryDate);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${journalEntriesTable} where ${journalEntriesTable.id} = ${id} for update`);
    const [entry] = await tx.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, id));
    const [reviewed] = await tx.select().from(ownerJournalReviewsTable).where(eq(ownerJournalReviewsTable.journalEntryId, id));
    if (!entry || entry.status !== "posted" || reviewed || entry.sourceType === "reversal" || entry.reversalOfEntryId !== null)
      throw new Error("Unreviewed original posted journal required; reversal entries cannot be reversed again");
    const [ownerAccount] = await tx.select().from(accountingAccountsTable).where(eq(accountingAccountsTable.code, "2140"));
    const [ownerLine] = await tx.select().from(journalEntryLinesTable).where(and(eq(journalEntryLinesTable.journalEntryId, id), eq(journalEntryLinesTable.accountId, ownerAccount.id)));
    if (!ownerLine || entry.sourceType === "owner_obligation_event") throw new Error("This source needs its own event correction workflow");
    const [purchase] = entry.sourceType === "purchase" ? await tx.select().from(purchasesTable).where(eq(purchasesTable.id, Number(entry.sourceId))) : [null];
    if (input.decision === "reverse" && purchase?.paymentSource === "owner_account" &&
      !/تصحيح|خطأ|مكرر|correct|duplicate|error/i.test(input.reason))
      throw new Error("Document the actual error in this owner-funded purchase; a valid purchase remains payable");
    const reversal = input.decision === "reverse"
      ? await reverseJournalEntry(id, actorId, `${input.reason.trim()} | Evidence: ${input.evidence.trim()}`, input.entryDate, tx) : null;
    return (await tx.insert(ownerJournalReviewsTable).values({
      journalEntryId: id, decision: input.decision, reason: input.reason.trim(), evidence: input.evidence.trim(),
      reviewedBy: actorId, reversalEntryId: reversal?.id ?? null,
    }).returning())[0];
  });
}