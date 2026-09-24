import { describe, expect, it } from 'vitest';
import { createCustomerSchema, customerPayload } from './customer-create';
import { emptyIntakeAddress, intakeAddressPayload, intakeAddressSchema, switchIntakeCountry } from './intake-address';

const sa = { country: 'SA', city: 'Riyadh', nationalAddressShortCode: 'RYDH1234',
  district: 'Olaya', street: 'King Road', buildingNo: '24', postalCode: '12345',
  additionalNumber: '6789', additionalInfo: '' };
const international = { ...emptyIntakeAddress(), country: 'AE', city: 'Dubai', additionalInfo: 'Office 5, Marina Tower' };

describe('manual intake address controls', () => {
  it('requires each Saudi field and clears international details when switching country', () => {
    expect(intakeAddressSchema.safeParse(sa).success).toBe(true);
    for (const key of ['city', 'nationalAddressShortCode', 'district', 'street', 'buildingNo', 'postalCode', 'additionalNumber'] as const)
      expect(intakeAddressSchema.safeParse({ ...sa, [key]: '' }).success).toBe(false);
    expect(intakeAddressPayload(sa).additionalInfo).toBeNull();
    expect(switchIntakeCountry('SA')).toEqual(emptyIntakeAddress());
  });

  it('requires a valid non-Saudi country and detailed address, excludes stale Saudi fields', () => {
    expect(intakeAddressSchema.safeParse(international).success).toBe(true);
    expect(intakeAddressSchema.safeParse({ ...international, additionalInfo: '' }).success).toBe(false);
    expect(intakeAddressSchema.safeParse({ ...international, country: 'ZZ' }).success).toBe(false);
    expect(intakeAddressPayload(international).nationalAddressShortCode).toBeNull();
    expect(switchIntakeCountry('other')).toEqual({ ...emptyIntakeAddress(), country: '' });
    expect(createCustomerSchema.safeParse({ name: 'Name', phone: '966501234567', email: '', profileAddress: sa }).success).toBe(false);
    expect(customerPayload({ name: 'Name', phone: '+966 50 123 4567', email: 'a@example.com', profileAddress: international }))
      .toMatchObject({ phone: '966501234567', profileAddress: { country: 'AE', district: null, additionalInfo: 'Office 5, Marina Tower' } });
  });
});