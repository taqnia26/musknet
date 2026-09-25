import { and, eq, ilike, sql } from "drizzle-orm";
import { invoicesTable, journalEntriesTable, receivablePaymentsTable } from "@workspace/db";

// Called under the company invoice row lock, immediately before a later collection is posted.
export async function reconcileHistoricalPayment(
  distributorId: number,
  payment: { paymentDate: string; amount: number; reference?: string | null },
  executor: any,
): Promise<string[]> {
  const imported = await executor.select({ id: journalEntriesTable.id }).from(journalEntriesTable)
    .where(and(eq(journalEntriesTable.sourceType, "historical_import"),
      sql`to_char(${journalEntriesTable.entryDate}, 'YYYY-MM') = ${payment.paymentDate.slice(0, 7)}`));
  const similar = await executor.select({ id: receivablePaymentsTable.id }).from(receivablePaymentsTable)
    .innerJoin(invoicesTable, eq(receivablePaymentsTable.invoiceId, invoicesTable.id))
    .where(and(eq(invoicesTable.distributorId, distributorId),
      eq(receivablePaymentsTable.paymentDate, payment.paymentDate),
      eq(receivablePaymentsTable.amount, payment.amount)));
  const reference = payment.reference?.trim();
  const matchingReferences = reference
    ? await executor.select({ id: journalEntriesTable.id }).from(journalEntriesTable)
      .where(ilike(journalEntriesTable.description, `%${reference.replace(/[%_]/g, "\\$&")}%`))
    : [];
  return [
    ...imported.map((row: { id: number }) => `Master Sales journal #${row.id}`),
    ...similar.map((row: { id: number }) => `Possible existing collection #${row.id}`),
    ...matchingReferences.map((row: { id: number }) => `Receipt journal #${row.id}`),
  ];
}