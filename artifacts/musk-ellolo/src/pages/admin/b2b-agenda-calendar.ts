import type { AnnualAgendaOccurrence } from '@workspace/api-client-react';

export type AgendaDate = { year: number; month: number; day: number; iso: string; inMonth: boolean };

export function isoDay(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Sunday-first rows, including adjacent-month dates to retain full weeks. */
export function monthCells(year: number, month: number): AgendaDate[] {
  const offset = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const count = Math.ceil((offset + daysInMonth(year, month)) / 7) * 7;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month, index - offset + 1));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    const day = date.getUTCDate();
    return { year: y, month: m, day, iso: isoDay(y, m, day), inMonth: y === year && m === month };
  });
}

export function moveMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + month + delta;
  const nextYear = Math.floor(index / 12);
  if (nextYear < 1900 || nextYear > 2100) return { year, month };
  return { year: nextYear, month: index - nextYear * 12 };
}

export function eventsOnDay<T extends Pick<AnnualAgendaOccurrence, 'startDate' | 'endDate'>>(events: readonly T[], iso: string): T[] {
  return events.filter(event => event.startDate.slice(0, 10) <= iso && event.endDate.slice(0, 10) >= iso);
}

export function eventsInMonth<T extends Pick<AnnualAgendaOccurrence, 'startDate' | 'endDate'>>(events: readonly T[], year: number, month: number): T[] {
  const first = isoDay(year, month, 1);
  const last = isoDay(year, month, daysInMonth(year, month));
  return events.filter(event => event.startDate.slice(0, 10) <= last && event.endDate.slice(0, 10) >= first);
}

/** Events already underway remain relevant until their inclusive end date. */
export function upcomingEvents<T extends Pick<AnnualAgendaOccurrence, 'startDate' | 'endDate' | 'type'>>(
  events: readonly T[], year: number, today: string, type?: T['type'],
): T[] {
  const from = today > `${year}-01-01` ? today : `${year}-01-01`;
  const last = `${year}-12-31`;
  if (from > last) return [];
  return events
    .filter(event => event.startDate.slice(0, 10) <= last && event.endDate.slice(0, 10) >= from && (!type || event.type === type))
    .sort((a, b) => {
      const aStart = a.startDate.slice(0, 10) < from ? from : a.startDate.slice(0, 10);
      const bStart = b.startDate.slice(0, 10) < from ? from : b.startDate.slice(0, 10);
      return aStart.localeCompare(bStart) || a.endDate.localeCompare(b.endDate);
    });
}