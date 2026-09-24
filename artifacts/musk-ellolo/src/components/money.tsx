import React, { type CSSProperties } from 'react';
import { formatCurrency, type DisplayValue } from '../lib/formatters';

const symbolUrl = `${import.meta.env.BASE_URL}site-assets/saudi-riyal-symbol.svg`;

/** Uses the official artwork as a mask so the mark inherits its surrounding text color. */
export function RiyalSymbol({ className = '' }: { className?: string }) {
  const style: CSSProperties = {
    maskImage: `url("${symbolUrl}")`,
    WebkitMaskImage: `url("${symbolUrl}")`,
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
    backgroundColor: 'currentColor',
    printColorAdjust: 'exact',
    WebkitPrintColorAdjust: 'exact',
  };
  return <span aria-hidden="true" className={`inline-block h-[1em] w-[0.9em] shrink-0 align-[-0.12em] ${className}`} style={style} />;
}

export function Money({
  value,
  lang = 'en',
  fractionDigits,
  minimumFractionDigits,
  maximumFractionDigits,
  className = '',
}: {
  value: DisplayValue;
  lang?: 'ar' | 'en';
  fractionDigits?: number;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  className?: string;
}) {
  const formatted = fractionDigits === undefined && minimumFractionDigits === undefined && maximumFractionDigits === undefined
    ? formatCurrency(value, lang)
    : new Intl.NumberFormat('en-US', {
        minimumFractionDigits: fractionDigits ?? minimumFractionDigits ?? 0,
        maximumFractionDigits: fractionDigits ?? maximumFractionDigits ?? 2,
      }).format(Number(value ?? 0));
  return (
    <span className={`inline-flex items-baseline gap-[0.2em] whitespace-nowrap ${className}`} dir="ltr"
      role="img" aria-label={`${formatted} ${lang === 'ar' ? 'ريال سعودي' : 'Saudi riyals'}`}>
      {lang === 'ar' && <RiyalSymbol />}
      <span aria-hidden="true">{formatted}</span>
      {lang === 'en' && <span aria-hidden="true">SAR</span>}
    </span>
  );
}