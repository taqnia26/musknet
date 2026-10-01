/**
 * Only the inert custom.* namespace is user-deletable. Operational settings
 * must never be stored under this namespace.
 */
const DELETABLE_SITE_CONTENT_KEY = /^custom\.[a-z0-9][a-z0-9_-]{0,99}$/;
const SENSITIVE_NAME = /(?:financial|finance|secret|credential|password|token|private[-_]?key|api[-_]?key|authentication|authorization|session|cookie|bank|iban|swift|account|routing|card|cvv|cvc|invoice|payment|payroll|salary|wage|balance|ledger|accounting|cost|revenue|profit|tax|amount|price|كلمة\s*(?:ال)?(?:مرور|سر)|رمز\s*(?:ال)?وصول|مفتاح\s*(?:api|ال\s*api|سري|خاص)|(?:الحساب|حساب)\s*(?:ال)?(?:بنكي|مصرفي)|[اأإآ]?يبان|(?:ال)?فاتورة|(?:ال)?رصيد|(?:ال)?مبلغ|(?:ال)?دفعة|(?:ال)?مدفوعات|(?:ال)?تحويل|(?:ال)?بطاقة|(?:ال)?راتب|(?:ال)?أجور|(?:ال)?تكلفة|(?:ال)?سعر|(?:ال)?إيراد|(?:ال)?ربح|(?:ال)?ضريبة)/iu;
const SENSITIVE_VALUE = [
  /\b(?:bearer|basic)\s+[a-z0-9._~+/-]{16,}/i,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password|secret)\s*[:=]\s*["']?\S+/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:sk|pk)_(?:live|test)_[a-z0-9_-]{12,}\b/i,
  /\beyJ[a-z0-9_-]{10,}\.eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\b/i,
  /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/i,
];
const MAX_NODES = 10_000;
const MAX_DEPTH = 32;
const MAX_JSON_TEXT_LENGTH = 1_000_000;

function containsLongNumericValue(value: string): boolean {
  for (const match of value.matchAll(/[\p{Nd}][\p{Nd}\s().-]{7,}[\p{Nd}]/gu)) {
    if ([...match[0]].filter((character) => /\p{Nd}/u.test(character)).length >= 9) return true;
  }
  return false;
}

export function canDeleteSiteContentKey(key: string): boolean {
  const match = DELETABLE_SITE_CONTENT_KEY.exec(key);
  // JavaScript's `$` also matches immediately before a final line terminator.
  // Requiring the complete key prevents that behavior from broadening the namespace.
  return match?.[0] === key;
}

/**
 * Archives are durable backups, so only inert custom content without secret or
 * financial fields is eligible. Unknown and malformed values fail closed.
 */
export function canArchiveSiteContent(key: string, data: unknown): boolean {
  if (!canDeleteSiteContentKey(key) || SENSITIVE_NAME.test(key.slice("custom.".length))) return false;

  const pending: Array<{ value: unknown; depth: number }> = [{ value: data, depth: 0 }];
  let visited = 0;
  while (pending.length > 0) {
    const { value, depth } = pending.pop()!;
    visited += 1;
    if (visited > MAX_NODES || depth > MAX_DEPTH) return false;

    if (typeof value === "string") {
      if (SENSITIVE_VALUE.some((pattern) => pattern.test(value)) || containsLongNumericValue(value)) return false;
      const trimmed = value.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        if (value.length > MAX_JSON_TEXT_LENGTH) return false;
        try {
          const parsed: unknown = JSON.parse(value);
          if (parsed === null || typeof parsed !== "object") return false;
          if (pending.length + visited + 1 > MAX_NODES) return false;
          pending.push({ value: parsed, depth: depth + 1 });
        } catch {
          return false;
        }
      }
      continue;
    }
    if (value === null || typeof value === "boolean") continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value) || Math.abs(value) >= 100_000_000) return false;
      continue;
    }
    if (Array.isArray(value)) {
      if (pending.length + visited + value.length > MAX_NODES) return false;
      for (const item of value) pending.push({ value: item, depth: depth + 1 });
      continue;
    }
    if (typeof value === "object") {
      const entries = Object.entries(value);
      if (pending.length + visited + entries.length > MAX_NODES) return false;
      for (const [name, nested] of entries) {
        if (SENSITIVE_NAME.test(name)) return false;
        pending.push({ value: nested, depth: depth + 1 });
      }
      continue;
    }
    return false;
  }
  return true;
}