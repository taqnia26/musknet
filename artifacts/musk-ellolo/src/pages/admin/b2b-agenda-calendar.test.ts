import { describe, expect, it } from 'vitest';
import { daysInMonth, eventsInMonth, eventsOnDay, isoDay, monthCells, moveMonth, upcomingEvents } from './b2b-agenda-calendar';

const events = [
  { title: 'Crossing', type: 'occasion', startDate: '2028-12-30', endDate: '2029-01-03' },
  { title: 'Launch', type: 'launch', startDate: '2029-01-04', endDate: '2029-01-04' },
  { title: 'Month-spanning fair', type: 'exhibition', startDate: '2029-01-31', endDate: '2029-02-02' },
  { title: 'Later exhibition', type: 'exhibition', startDate: '2029-03-11', endDate: '2029-03-12' },
  { title: 'Past', type: 'other', startDate: '2028-11-01', endDate: '2028-11-01' },
];

describe('B2B agenda calendar helpers', () => {
  it('navigates across both year boundaries and clamps to supported years', () => {
    expect(moveMonth(2028, 11, 1)).toEqual({ year: 2029, month: 0 });
    expect(moveMonth(2029, 0, -1)).toEqual({ year: 2028, month: 11 });
    expect(moveMonth(1900, 0, -1)).toEqual({ year: 1900, month: 0 });
    expect(moveMonth(2100, 11, 1)).toEqual({ year: 2100, month: 11 });
    expect(moveMonth(2028, 1, 12)).toEqual({ year: 2029, month: 1 });
  });

  it('creates Sunday-first aligned weeks and handles leap days', () => {
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2029, 1)).toBe(28);
    const cells = monthCells(2028, 1);
    expect(cells[0].iso).toBe('2028-01-30');
    expect(cells.filter(cell => cell.inMonth)).toHaveLength(29);
    expect(cells.some(cell => cell.iso === '2028-02-29' && cell.inMonth)).toBe(true);
    expect(isoDay(1900, 0, 1)).toBe('1900-01-01');
  });

  it('maps inclusive multi-day ranges across months and years', () => {
    expect(eventsOnDay(events, '2028-12-31').map(e => e.title)).toEqual(['Crossing']);
    expect(eventsOnDay(events, '2029-01-01').map(e => e.title)).toEqual(['Crossing']);
    expect(eventsOnDay(events, '2029-01-03').map(e => e.title)).toEqual(['Crossing']);
    expect(eventsOnDay(events, '2029-01-05')).toEqual([]);
    expect(eventsOnDay(events, '2029-02-01').map(e => e.title)).toEqual(['Month-spanning fair']);
    expect(eventsInMonth(events, 2029, 0).map(e => e.title)).toEqual(['Crossing', 'Launch', 'Month-spanning fair']);
    expect(eventsInMonth(events, 2029, 1).map(e => e.title)).toEqual(['Month-spanning fair']);
    expect(eventsInMonth(events, 2028, 11).map(e => e.title)).toEqual(['Crossing']);
  });

  it('shows ongoing items as upcoming, excludes ended items, filters exhibitions', () => {
    expect(upcomingEvents(events, 2029, '2029-01-02').map(e => e.title)).toEqual(['Crossing', 'Launch', 'Month-spanning fair', 'Later exhibition']);
    expect(upcomingEvents(events, 2029, '2029-01-04', 'exhibition').map(e => e.title)).toEqual(['Month-spanning fair', 'Later exhibition']);
    expect(upcomingEvents(events, 2029, '2028-12-01').map(e => e.title)).toEqual(['Crossing', 'Launch', 'Month-spanning fair', 'Later exhibition']);
    expect(upcomingEvents(events, 2028, '2029-01-01')).toEqual([]);
  });
});