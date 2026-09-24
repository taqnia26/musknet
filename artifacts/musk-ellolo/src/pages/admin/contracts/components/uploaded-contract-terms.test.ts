import { describe, expect, it } from 'vitest';
import {
  blankUploadedContractTerms,
  uploadedContractTermsRequest,
  uploadedContractTermsSchema,
} from './uploaded-contract-terms';

describe('uploaded contract terms dates', () => {
  it('leaves optional dates unset', () => {
    const values = { ...blankUploadedContractTerms(), discountPercent: '10', paymentDays: '30' };
    expect(uploadedContractTermsSchema.safeParse(values).success).toBe(true);
    expect(uploadedContractTermsRequest(values)).toMatchObject({ startDate: null, endDate: null, signedDate: null });
  });

  it('preserves valid calendar dates as ISO strings in the request', () => {
    const values = {
      ...blankUploadedContractTerms(),
      discountPercent: '10',
      paymentDays: '30',
      startDate: '2026-02-28',
      endDate: '2027-03-01',
      signedDate: '2025-12-31',
    };
    expect(uploadedContractTermsSchema.safeParse(values).success).toBe(true);
    expect(uploadedContractTermsRequest(values)).toMatchObject({
      startDate: '2026-02-28',
      endDate: '2027-03-01',
      signedDate: '2025-12-31',
    });
  });

  it('rejects incomplete or impossible typed dates rather than saving the wrong day', () => {
    const values = { ...blankUploadedContractTerms(), discountPercent: '10', paymentDays: '30' };
    for (const startDate of ['2026-2-28', '2026-02-30', '2026-13-01', '2026-02-']) {
      expect(uploadedContractTermsSchema.safeParse({ ...values, startDate }).success).toBe(false);
      expect(uploadedContractTermsSchema.safeParse({ ...values, signedDate: startDate }).success).toBe(false);
    }
  });
});