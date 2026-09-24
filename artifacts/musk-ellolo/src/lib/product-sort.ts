type ProductForSelection = {
  categoryId?: number;
  categoryNameAr?: string;
  categoryNameEn?: string;
  nameAr: string;
  nameEn: string;
};

const preferredProductOrder = [
  'رويال مسك',
  'رويال عود',
  'رويال جازمين',
  'ليدي لولو',
  'ايفورا',
  'سولين',
  'لومسك',
  'لونيرا',
  'بيتش موس',
];

const normalizeProductName = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/\s+/g, ' ');
const preferredProductRanks = new Map(
  preferredProductOrder.map((name, index) => [normalizeProductName(name), index]),
);

export function sortProductsForSelection<T extends ProductForSelection>(
  products: readonly T[],
  lang: 'ar' | 'en',
): T[] {
  const categoryPriority = (product: T) => {
    const category = `${product.categoryNameAr ?? ''} ${product.categoryNameEn ?? ''}`.toLocaleLowerCase();
    if (category.includes('عطور الشعر') || category.includes('عطور شعر') || category.includes('hair')) return 1;
    if (category.includes('عطور') || category.includes('perfume')) return 0;
    if (product.categoryId === 1) return 0;
    if (product.categoryId === 2) return 1;
    return 2;
  };

  return [...products].sort((a, b) => {
    const aPreferredRank = preferredProductRanks.get(normalizeProductName(a.nameAr));
    const bPreferredRank = preferredProductRanks.get(normalizeProductName(b.nameAr));
    if (aPreferredRank !== undefined || bPreferredRank !== undefined) {
      if (aPreferredRank === undefined) return 1;
      if (bPreferredRank === undefined) return -1;
      return aPreferredRank - bPreferredRank;
    }

    const priorityDifference = categoryPriority(a) - categoryPriority(b);
    if (priorityDifference !== 0) return priorityDifference;

    const aName = lang === 'ar' ? a.nameAr : a.nameEn;
    const bName = lang === 'ar' ? b.nameAr : b.nameEn;
    return aName.localeCompare(bName, lang === 'ar' ? 'ar' : 'en');
  });
}