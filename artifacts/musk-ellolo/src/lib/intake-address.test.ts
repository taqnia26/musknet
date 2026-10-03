import { describe, expect, it } from 'vitest';
import { createCustomerSchema, customerPayload } from './customer-create';
import { emptyIntakeAddress, intakeAddressPayload, intakeAddressSchema, switchIntakeCountry } from './intake-address';

const sa = { country: 'SA', city: 'Riyadh', nationalAddressShortCode: 'RYDH1234',
  district: 'Olaya', street: 'King Road', buildingNo: '24', postalCode: '12345',
  additionalNumber: '6789', additionalInfo: '' };
const international = { ...emptyIntakeAddress(), country: 'AE', city: 'Dubai', additionalInfo: 'Office 5, Marina Tower' };

describe('manual intake address controls', () => {
  it('requires only the Saudi short code and retains existing hidden fields', () => {
    expect(intakeAddressSchema.safeParse(sa).success).toBe(true);
    expect(intakeAddressSchema.safeParse({ ...emptyIntakeAddress(), nationalAddressShortCode: 'RYDH1234' }).success).toBe(true);
    expect(intakeAddressSchema.safeParse({ ...sa, nationalAddressShortCode: '' }).success).toBe(false);
    expect(intakeAddressPayload(sa)).toMatchObject({ city: 'Riyadh', district: 'Olaya', street: 'King Road', buildingNo: '24', postalCode: '12345', additionalNumber: '6789' });
    expect(intakeAddressPayload({ ...sa, additionalInfo: 'Existing note' }).additionalInfo).toBe('Existing note');
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