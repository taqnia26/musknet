import { describe, expect, it } from 'vitest';
import { sellerDefaults, sellerNumberLabel, sellerProfile } from './seller-defaults';

describe('new contract seller defaults', () => {
  it('uses only documented legal information and leaves representative fields blank', () => {
    expect(sellerProfile(undefined)).toEqual(sellerDefaults);
    expect(sellerDefaults.sellerCrNumber).toBe('7003185274');
    expect(sellerDefaults.sellerAddress).toContain('RHSD3394');
    expect(sellerDefaults.sellerRepName).toBe('');
    expect(sellerDefaults.sellerRepTitle).toBe('');
    expect(sellerNumberLabel(sellerDefaults.sellerCrNumber)).toBe('الرقم الوطني الموحد');
  });

  it('preserves centrally edited values, including intentionally empty values', () => {
    expect(sellerProfile({ sellerName: 'اسم المدير', sellerAddress: '', sellerRepName: 'الممثل المعتمد' })).toMatchObject({
      sellerName: 'اسم المدير', sellerAddress: '', sellerRepName: 'الممثل المعتمد',
      sellerCrNumber: '7003185274',
    });
  });
});