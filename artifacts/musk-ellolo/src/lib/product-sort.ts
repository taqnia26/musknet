type ProductForSelection = {
  id?: number;
  sku?: string | null;
  nameAr: string;
  nameEn: string;
};

// These catalog identifiers keep the requested order even when names,
// categories, or prices change. The ID also covers edits to a product's SKU.
const preferredProducts = [
  { id: 5, sku: '6287020840012' }, // Royal Musk
  { id: 6, sku: '6287020840029' }, // Royal Oud
  { id: 4, sku: '6287020840036' }, // Royal Jasmine
  { id: 3, sku: '6287020840050' }, // Lady Lulu
  { id: 2, sku: '6287020840074' }, // Evora
  { id: 1, sku: '6287020840067' }, // Solenn
  { id: 9, sku: '6287020840098' }, // Lumisk
  { id: 8, sku: '6287020840081' }, // Lunera
  { id: 7, sku: '6287020840104' }, // Beach Moss
];

const rankBySku = new Map(preferredProducts.map(({ sku }, index) => [sku, index]));
const rankById = new Map(preferredProducts.map(({ id }, index) => [id, index]));

export function sortProductsForSelection<T extends ProductForSelection>(
  products: readonly T[],
  _lang: 'ar' | 'en',
): T[] {
  return [...products].sort((a, b) => {
    const aRank = (a.id === undefined ? undefined : rankById.get(a.id)) ?? (a.sku ? rankBySku.get(a.sku.trim()) : undefined);
    const bRank = (b.id === undefined ? undefined : rankById.get(b.id)) ?? (b.sku ? rankBySku.get(b.sku.trim()) : undefined);
    if (aRank !== undefined || bRank !== undefined) {
      return (aRank ?? Infinity) - (bRank ?? Infinity);
    }
    // Newly created products follow their immutable ID, not mutable details.
    // Without IDs, preserve the order supplied by the API (stable sort).
    if (a.id !== undefined && b.id !== undefined) return a.id - b.id;
    return 0;
  });
}