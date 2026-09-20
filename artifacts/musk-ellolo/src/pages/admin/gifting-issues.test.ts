import { describe, expect, it } from 'vitest';
import { issueUses } from './gifting-issues-config';

describe('product movement form options', () => {
  it('offers all approved movement types', () => {
    expect(issueUses.map((item) => item.value)).toEqual([
      'B2B_EVALUATION',
      'TESTER',
      'VIP_GIFT',
      'INFLUENCERS',
      'DAMAGED',
      'OTHER',
    ]);
  });

  it('keeps Arabic and English labels for every new use', () => {
    expect(issueUses.every((item) => item.ar.length > 0 && item.en.length > 0)).toBe(true);
  });
});