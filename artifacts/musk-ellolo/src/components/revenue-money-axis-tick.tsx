import React from 'react';
import { Money } from './money';

type AxisTickProps = {
  x?: number;
  y?: number;
  payload?: { value: number };
  lang: 'ar' | 'en';
  orientation: 'horizontal' | 'vertical';
};

/** Recharts ticks are SVG nodes; foreignObject lets the shared currency component render inside them. */
export function RevenueMoneyAxisTick({ x = 0, y = 0, payload, lang, orientation }: AxisTickProps) {
  if (payload?.value == null) return null;
  const vertical = orientation === 'vertical';
  return (
    <foreignObject
      x={vertical ? x - 95 : x - 48}
      y={vertical ? y - 10 : y + 8}
      width={vertical ? 90 : 96}
      height={22}
    >
      <div
        className={`text-[11px] text-muted-foreground ${vertical ? 'text-right' : 'text-center'}`}
      >
        <Money value={payload.value} lang={lang} compact />
      </div>
    </foreignObject>
  );
}