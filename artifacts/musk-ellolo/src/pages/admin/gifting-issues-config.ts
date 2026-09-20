import type { GiftingIssueInputCategory } from '@workspace/api-client-react';

export const issueUses: Array<{ value: string; ar: string; en: string }> = [
  { value: 'B2B_EVALUATION', ar: 'تقييم B2B', en: 'B2B Evaluation' },
  { value: 'TESTER', ar: 'تيستر', en: 'Tester' },
  { value: 'VIP_GIFT', ar: 'هدية VIP', en: 'VIP Gift' },
  { value: 'INFLUENCERS', ar: 'المشاهير', en: 'Influencers' },
  { value: 'DAMAGED', ar: 'تالف', en: 'Damaged' },
  { value: 'OTHER', ar: 'أخرى', en: 'Other' },
];

export const giftingIssueLabels: Record<string, { ar: string; en: string }> = {
  VIP: { ar: 'كبار العملاء', en: 'VIP' },
  Sample: { ar: 'عينات', en: 'Samples' },
  Damage: { ar: 'تالف', en: 'Damage' },
  Marketing: { ar: 'تسويق', en: 'Marketing' },
  Tester: { ar: 'تيستر (قديم)', en: 'Tester (legacy)' },
  ...Object.fromEntries(issueUses.map((item) => [item.value, { ar: item.ar, en: item.en }])),
};
