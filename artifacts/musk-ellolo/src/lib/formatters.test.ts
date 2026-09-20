import { describe, expect, it } from 'vitest';
import { formatCurrency, formatInteger, formatPercent } from './formatters';

describe('admin display formatters', () => {
  it('formats counts without decimal tails', () => {
    expect(formatInteger('1336.00000000')).toBe('1,336');
  });
  it('formats percentages without insignificant zeroes', () => {
    expect(formatPercent('10.0')).toBe('10%');
    expect(formatPercent('10.5')).toBe('10.5%');
  });
  it('formats money with only meaningful decimals', () => {
    expect(formatCurrency('12.50')).toBe('12.5');
  });
  it('renders null values as zero', () => {
    expect(formatInteger(null)).toBe('0');
  });
});