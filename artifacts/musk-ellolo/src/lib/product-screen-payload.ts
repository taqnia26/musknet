/**
 * Inventory quantities are managed outside the product screen. Never send
 * hidden/stale thresholds when saving; new products start without opening stock.
 */
export function productScreenPayload<T extends object>(values: T) {
  const {
    stockQuantity: _stock,
    reorderPoint: _reorder,
    targetStockQuantity: _target,
    ...details
  } = values as T & {
    stockQuantity?: number;
    reorderPoint?: number;
    targetStockQuantity?: number;
  };
  return {
    create: { ...details, stockQuantity: 0 },
    update: details,
  };
}