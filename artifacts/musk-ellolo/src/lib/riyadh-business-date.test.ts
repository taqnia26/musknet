import { describe, expect, it } from 'vitest';
import { formatRiyadhBusinessDate } from './riyadh-business-date';

describe('Riyadh business-calendar dates', () => {
  it('uses the Saudi date when an invoice timestamp crosses UTC month-end', () => {
    expect(formatRiyadhBusinessDate('2025-01-31T21:30:00.000Z')).toBe('2025-02-01');
    expect(formatRiyadhBusinessDate('2025-01-31T20:59:59.999Z')).toBe('2025-01-31');
  });
});