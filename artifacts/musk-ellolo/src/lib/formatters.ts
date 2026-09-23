export type DisplayValue = number | string | null | undefined;

/** Convert keyboard/presentation digits without changing stored text elsewhere. */
export function toLatinDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code - (code <= 0x0669 ? 0x0660 : 0x06f0));
  });
}

const toNumber = (value: DisplayValue) => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Keep numerals and separators consistent even when the surrounding UI is Arabic.
const numberLocale = 'en-US';

/** Presentation-only integer formatting for counts and quantities. */
export function formatInteger(value: DisplayValue, _lang: 'ar' | 'en' = 'en') {
  return new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(toNumber(value));
}

/** Presentation-only money formatting; insignificant zeroes are omitted. */
export function formatCurrency(value: DisplayValue, _lang: 'ar' | 'en' = 'en') {
  return new Intl.NumberFormat(numberLocale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

/** Formats a percentage supplied as a number from 0 to 100. */
export function formatPercent(value: DisplayValue, _lang: 'ar' | 'en' = 'en') {
  return `${new Intl.NumberFormat(numberLocale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(toNumber(value))}%`;
}

/** Keep Arabic compact units, but use English digits and punctuation. */
export function formatCompact(value: DisplayValue, lang: 'ar' | 'en' = 'en') {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : numberLocale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(toNumber(value)).replace(/\u066b/g, '.').replace(/\u066c/g, ',');
}