import { describe, expect, it } from "vitest";
import { dueDateFromContract, saudiCalendarDate } from "./invoice-dates";

describe("Saudi contract invoice due dates", () => {
  const issueDatetime = new Date("2026-01-01T22:30:00.000Z");

  it("uses the Saudi-local invoice date for cash contracts", () => {
    expect(saudiCalendarDate(issueDatetime)).toBe("2026-01-02");
    expect(dueDateFromContract(issueDatetime, "عقد توريد نقد المملكة العربية السعودية", 30)).toBe("2026-01-02");
  });

  it("adds payment days as calendar days from the Saudi-local invoice date for credit contracts", () => {
    expect(dueDateFromContract(issueDatetime, "عقد توريد أجل المملكة العربية السعودية", 30)).toBe("2026-02-01");
  });
});