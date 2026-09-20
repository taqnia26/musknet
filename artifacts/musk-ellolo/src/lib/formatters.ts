export type DisplayValue = number | string | null | undefined;

const toNumber = (value: DisplayValue) => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const localeFor = (lang: 'ar' | 'en' = 'en') => lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';

/** Presentation-only integer formatting for counts and quantities. */
export function formatInteger(value: DisplayValue, lang: 'ar' | 'en' = 'en') {
  return new Intl.NumberFormat(localeFor(lang), { maximumFractionDigits: 0 }).format(toNumber(value));
}

/** Presentation-only money formatting; insignificant zeroes are omitted. */
export function formatCurrency(value: DisplayValue, lang: 'ar' | 'en' = 'en') {
  return new Intl.NumberFormat(localeFor(lang), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

/** Formats a percentage supplied as a number from 0 to 100. */
export function formatPercent(value: DisplayValue, lang: 'ar' | 'en' = 'en') {
  return `${new Intl.NumberFormat(localeFor(lang), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(toNumber(value))}%`;
}