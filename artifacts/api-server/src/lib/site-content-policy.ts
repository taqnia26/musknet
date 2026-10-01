/**
 * Only the inert custom.* namespace is user-deletable. Operational settings
 * must never be stored under this namespace.
 */
const DELETABLE_SITE_CONTENT_KEY = /^custom\.[a-z0-9][a-z0-9_-]{0,99}$/;

export function canDeleteSiteContentKey(key: string): boolean {
  const match = DELETABLE_SITE_CONTENT_KEY.exec(key);
  // JavaScript's `$` also matches immediately before a final line terminator.
  // Requiring the complete key prevents that behavior from broadening the namespace.
  return match?.[0] === key;
}