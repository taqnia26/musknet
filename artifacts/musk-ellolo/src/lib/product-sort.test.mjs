import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sortProductsForSelection } from './product-sort.ts';

const products = [
  { id: 1, sku: '6287020840067', nameAr: 'سولين', nameEn: 'Solenn' },
  { id: 2, sku: '6287020840074', nameAr: 'ايفورا', nameEn: 'Evora' },
  { id: 3, sku: '6287020840050', nameAr: 'ليدي لولو', nameEn: 'Lady Lulu' },
  { id: 4, sku: '6287020840036', nameAr: 'رويال جازمين', nameEn: 'Royal Jasmine' },
  { id: 5, sku: '6287020840012', nameAr: 'رويال مسك', nameEn: 'Royal Musk' },
  { id: 6, sku: '6287020840029', nameAr: 'رويال عود', nameEn: 'Royal Oud' },
  { id: 7, sku: '6287020840104', nameAr: 'بيتش موس', nameEn: 'Beach Moss' },
  { id: 8, sku: '6287020840081', nameAr: 'لونيرا', nameEn: 'Lunera' },
  { id: 9, sku: '6287020840098', nameAr: 'لومسك', nameEn: 'Lumisk' },
];

const expected = [5, 6, 4, 3, 2, 1, 9, 8, 7];

test('the requested product order is fixed in both languages', () => {
  for (const lang of ['ar', 'en']) {
    assert.deepEqual(sortProductsForSelection(products, lang).map((product) => product.id), expected);
  }
});

test('editing names, category, and SKU does not move an existing product', () => {
  const edited = products.map((product) => product.id === 4
    ? { ...product, nameAr: 'اسم داخلي مختلف', nameEn: 'New internal name', sku: 'NEW-SKU', categoryId: 99 }
    : product);
  assert.deepEqual(sortProductsForSelection(edited, 'ar').map((product) => product.id), expected);
});

test('new products retain their insertion order when their details change', () => {
  const newer = [
    { id: 20, sku: 'OTHER', nameAr: 'أ', nameEn: 'A', categoryId: 2 },
    { id: 10, sku: 'UNKNOWN', nameAr: 'ب', nameEn: 'B', categoryId: 1 },
  ];
  assert.deepEqual(sortProductsForSelection([...newer, ...products], 'ar').map((product) => product.id), [...expected, 10, 20]);
  newer[0].nameAr = 'منتج مُعدّل';
  newer[0].categoryId = 1;
  assert.deepEqual(sortProductsForSelection([...newer, ...products], 'en').map((product) => product.id), [...expected, 10, 20]);
});

test('known SKU preserves the requested order when products have different IDs', () => {
  const imported = products.map((product) => ({ ...product, id: product.id + 100 }));
  assert.deepEqual(sortProductsForSelection(imported, 'ar').map((product) => product.sku), expected.map((id) => products[id - 1].sku));
});