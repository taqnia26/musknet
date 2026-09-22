import { describe, expect, it } from 'vitest';
import {
  isAdminNavActive,
  isAdminNavItemVisible,
  navStructure,
  visibleAdminNavChildren,
} from './admin-layout';

const group = (labelEn: string) => navStructure.find((item) => item.labelEn === labelEn)!;
const user = (permissions: string[]) => ({ isSuperAdmin: false, permissions });
const visibleLabels = (permissions: string[]) => navStructure
  .filter((item: any) => isAdminNavItemVisible(item, user(permissions)))
  .map((item) => item.labelEn);

describe('admin commercial navigation', () => {
  it('defines the customer, sales, and marketing groups in both languages', () => {
    expect(group('Customers').children?.map(({ labelEn, labelAr }) => [labelEn, labelAr])).toEqual([
      ['Individuals', 'الأفراد'],
      ['Companies', 'الشركات'],
    ]);
    expect(group('Sales').children?.map(({ labelEn, labelAr }) => [labelEn, labelAr])).toEqual([
      ['Online Sales', 'مبيعات الموقع الإلكتروني'],
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

  it('hides every restricted section that the user cannot view', () => {
    const labels = visibleLabels(['site-content:view', 'shipping:view']);
    expect(labels).toContain('Storefront');
    expect(labels).toContain('Shipping');
    expect(labels).not.toContain('Dashboard');
    expect(labels).not.toContain('B2B');
    expect(labels).not.toContain('Customer Service');
    expect(labels).not.toContain('Chatbot');
    expect(labels).not.toContain('Integrations');
  });

  it('shows only the permitted child inside the dashboard group', () => {
    expect(visibleAdminNavChildren(group('Dashboard'), user(['revenue:view'])).map((item: any) => item.labelEn))
      .toEqual(['Detailed Revenue Dashboard']);
    expect(visibleLabels(['revenue:view'])).toContain('Dashboard');
    expect(visibleAdminNavChildren(group('Dashboard'), user(['dashboard:view'])).map((item: any) => item.labelEn))
      .toEqual(['Overview']);
  });

  it('keeps B2B catalog and contracts independently permissioned', () => {
    expect(visibleAdminNavChildren(group('B2B'), user(['distributors:view'])).map((item: any) => item.labelEn))
      .toEqual(['B2B Catalog']);
    expect(visibleAdminNavChildren(group('B2B'), user(['distributors:view', 'contracts:view'])).map((item: any) => item.labelEn))
      .toEqual(['Contracts', 'B2B Catalog']);
    expect(visibleLabels(['contracts:view'])).toContain('B2B');
  });

  it.each([
    ['Customer Service', 'customer-service:view'],
    ['Chatbot', 'chatbot:view'],
    ['Integrations', 'integrations:view'],
  ])('shows %s only for its own permission', (label, permission) => {
    expect(visibleLabels([permission])).toContain(label);
    expect(visibleLabels(['revenue:view'])).not.toContain(label);
  });
});