import type { SalesReturnCondition, SalesReturnSourceType } from '@workspace/api-client-react';

export const CONDITIONS: SalesReturnCondition[] = ['new', 'opened', 'damaged'];

export type DraftLine = { key: string; itemId: string; quantity: string; condition: '' | SalesReturnCondition };

export function errorText(error: unknown, fallback: string): string {
  const data = (error as { data?: { error?: unknown } | null } | null)?.data;
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function serializeDraft(reason: string, lines: DraftLine[]) {
  return JSON.stringify([reason.trim(), lines.map((l) => [l.itemId, l.quantity, l.condition])]);
}

export function sourceModule(type: SalesReturnSourceType) {
  return type === 'company' ? 'company-orders' : 'orders';
}

export function newLineKey() {
  return `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Predicate-based invalidation of every cache a completed return can change. */
export const COMPLETION_KEY_PREFIXES = [
  '/api/admin/sales-returns',
  '/api/admin/inventory',
  '/api/admin/products',
  '/api/admin/orders',
  '/api/admin/company-orders',
  '/api/products',
  '/api/orders',
];

/** Recorded stock condition label; null/undefined is never treated as "new". */
export function stockConditionLabel(c: SalesReturnCondition | null | undefined, t: (ar: string, en: string) => string) {
  if (c === 'new') return t('جديد', 'New');
  if (c === 'opened') return t('مفتوح', 'Opened');
  if (c === 'damaged') return t('تالف', 'Damaged');
  return t('غير مسجلة', 'Unknown / not recorded');
}
