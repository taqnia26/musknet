import { describe, expect, it } from "vitest";
import { nextInvoiceSequenceNumber } from "./invoice-sequence";
import { nextLiveInvoiceNumber } from "./invoices";

describe("monotonic invoice sequence high-water", () => {
  it("allocates above the retained high-water after a restore lowers the live maximum", async () => {
    const restoredHistoricalInvoices = [
      { sequenceNumber: 7, invoiceNumber: "INV-000007", historical: "yes", originalInvoiceNumber: "OLD-INV-42" },
    ];
    const historicalSnapshot = structuredClone(restoredHistoricalInvoices);
    let executeCount = 0;
    let selectCount = 0;
    const tx = {
      select: () => {
        const call = selectCount++;
        if (call === 0) {
          return {
            from: async () => [{ liveMaximum: Math.max(...restoredHistoricalInvoices.map((invoice) => invoice.sequenceNumber)) }],
          };
        }
        return {
          from: () => ({
            where: () => ({ limit: async () => [] }),
          }),
        };
      },
      execute: async () => {
        executeCount++;
        return executeCount === 1 ? { rows: [{ value: "400" }] } : { rows: [] };
      },
    };

    await expect(nextLiveInvoiceNumber(tx, "INV")).resolves.toEqual({
      sequenceNumber: 401,
      invoiceNumber: "INV-000401",
    });
    expect(executeCount).toBe(2); // Read and advance the retained ledger in this transaction.
    expect(restoredHistoricalInvoices).toEqual(historicalSnapshot);
  });

  it("uses the live maximum when it is ahead of the retained high-water", () => {
    expect(nextInvoiceSequenceNumber(900, 400)).toBe(901);
  });

  it("allocates after the high-water when the restored live maximum is lower", () => {
    expect(nextInvoiceSequenceNumber(7, 400)).toBe(401);
  });
});