import { describe, expect, it } from 'vitest';
import { formatCompact, formatCurrency, formatInteger, formatPercent, toLatinDigits } from './formatters';

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
  it('always uses English digits in Arabic counts, money and percentages', () => {
    expect(formatInteger(1234, 'ar')).toBe('1,234');
    expect(formatCurrency(1234.5, 'ar')).toBe('1,234.5');
    expect(formatPercent(12.5, 'ar')).toBe('12.5%');
    expect(formatCompact(1200, 'ar')).not.toMatch(/[٠-٩۰-۹٫٬]/);
  });
  it('normalizes Arabic and Persian keyboard digits without changing other text', () => {
    expect(toLatinDigits('سعر ٣٩٩٫٥٠ و ۴۲')).toBe('سعر 399٫50 و 42');
  });
});