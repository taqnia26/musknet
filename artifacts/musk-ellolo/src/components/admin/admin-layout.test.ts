import { describe, expect, it } from 'vitest';
import {
  isAdminNavActive,
  navStructure,
  visibleAdminNavChildren,
} from './admin-layout';

const group = (labelEn: string) => navStructure.find((item) => item.labelEn === labelEn)!;
const user = (permissions: string[]) => ({ isSuperAdmin: false, permissions });

describe('admin commercial navigation', () => {
  it('defines the customer, sales, and marketing groups in both languages', () => {
    expect(group('Customers').children?.map(({ labelEn, labelAr }) => [labelEn, labelAr])).toEqual([
      ['Individuals', 'الأفراد'],
      ['Companies', 'الشركات'],
    ]);
    expect(group('Sales').children?.map(({ labelEn, labelAr }) => [labelEn, labelAr])).toEqual([
      ['Online Sales', 'مبيعات أونلاين'],
      ['Company Sales', 'مبيعات الشركات'],
      ['Exhibition Sales', 'مبيعات المعارض'],
    ]);
    expect(group('Marketing').children?.map(({ labelEn }) => labelEn)).toEqual(['Campaigns', 'Coupons']);
  });

  it('shows only permitted children and allows a group to remain visible for any permitted child', () => {
    expect(visibleAdminNavChildren(group('Customers'), user(['customers:view'])).map((item: any) => item.labelEn))
      .toEqual(['Individuals']);
    expect(visibleAdminNavChildren(group('Customers'), user(['distributors:view'])).map((item: any) => item.labelEn))
      .toEqual(['Companies']);
    expect(visibleAdminNavChildren(group('Sales'), user(['invoices:view'])).map((item: any) => item.labelEn))
      .toEqual(['Company Sales']);
  });

  it('marks direct and nested commercial routes active without activating siblings', () => {
    expect(isAdminNavActive('/admin/sales/companies', '/admin/sales/companies')).toBe(true);
    expect(isAdminNavActive('/admin/sales/companies', '/admin/sales/companies/42')).toBe(true);
    expect(isAdminNavActive('/admin/sales/online', '/admin/sales/companies')).toBe(false);
  });
});