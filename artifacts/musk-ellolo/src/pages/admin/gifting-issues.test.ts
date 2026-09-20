import { describe, expect, it } from 'vitest';
import { issueUses } from './gifting-issues-config';

describe('gifting issue form options', () => {
  it('offers only the four approved uses for new issues', () => {
    expect(issueUses.map((item) => item.value)).toEqual([
      'B2B_EVALUATION',
      'TESTER',
      'VIP_GIFT',
      'INFLUENCERS',
    ]);
  });

  it('keeps Arabic and English labels for every new use', () => {
    expect(issueUses.every((item) => item.ar.length > 0 && item.en.length > 0)).toBe(true);
  });
});