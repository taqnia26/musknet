import { describe, expect, it } from 'vitest';
import { influencerSaveError, validateInfluencerForm, type InfluencerForm } from './influencer-form';

const translations = (ar: string, en: string) => ({ ar, en });
const form: InfluencerForm = {
  name: 'Test Person', email: 'independent@example.com', referralCode: 'INDEPENDENT',
  password: 'long-enough-password', commissionRate: '10', imageUrl: '',
};

describe('influencer account form', () => {
  it.each(['ar', 'en'] as const)('checks required fields and password length before saving in %s', lang => {
    const t = (ar: string, en: string) => translations(ar, en)[lang];
    expect(validateInfluencerForm({ ...form, password: 'short' }, false, t)).toContain(lang === 'ar' ? '8 أحرف' : '8 characters');
    expect(validateInfluencerForm({ ...form, password: '' }, false, t)).toBeTruthy();
    expect(validateInfluencerForm({ ...form, name: ' ' }, false, t)).toBeTruthy();
    expect(validateInfluencerForm({ ...form, email: 'invalid' }, false, t)).toBeTruthy();
    expect(validateInfluencerForm({ ...form, password: '' }, true, t)).toBeNull();
    expect(validateInfluencerForm(form, false, t)).toBeNull();
  });

  it.each(['ar', 'en'] as const)('shows safe specific server errors in %s', lang => {
    const t = (ar: string, en: string) => translations(ar, en)[lang];
    for (const [status, error, expected] of [
      [401, '', lang === 'ar' ? 'جلسة' : 'session'],
      [403, '', lang === 'ar' ? 'صلاحية' : 'permission'],
      [409, 'Influencer email already exists', lang === 'ar' ? 'البريد الإلكتروني' : 'email'],
      [409, 'Influencer referral code already exists', lang === 'ar' ? 'رمز الإحالة' : 'referral code'],
      [400, 'raw zod trace', lang === 'ar' ? 'كلمة المرور' : 'password'],
    ] as const) {
      expect(influencerSaveError({ status, data: { error } }, t, false)).toContain(expected);
    }
    expect(influencerSaveError({ status: 500, data: { error: 'sensitive database details' } }, t, false)).not.toContain('sensitive');
    expect(influencerSaveError({ status: 409, data: { error: 'internal constraint xyz' } }, t, false)).not.toContain('xyz');
  });
});