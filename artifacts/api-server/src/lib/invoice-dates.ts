export function saudiCalendarDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Preserve the real issuance instant for today's invoices and their ZATCA QR.
// Backdated dates keep a noon UTC placeholder rather than impersonating a new issuance.
export function invoiceIssueTimestamp(issueDate: string, now: Date) {
  return issueDate === saudiCalendarDate(now) ? now : new Date(`${issueDate}T12:00:00.000Z`);
}

export function addCalendarDays(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dueDateFromContract(issueDate: Date, contractType: string, paymentDays: number) {
  const issueDateSaudi = saudiCalendarDate(issueDate);
  if (/نقد|cash/i.test(contractType)) return issueDateSaudi;
  return addCalendarDays(issueDateSaudi, paymentDays);
}

export const defaultCompanyDueDate = () => addCalendarDays(saudiCalendarDate(new Date()), 30);