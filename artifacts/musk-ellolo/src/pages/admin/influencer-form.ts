type Translator = (ar: string, en: string) => string;

export type InfluencerForm = {
  name: string;
  email: string;
  password: string;
  referralCode: string;
  commissionRate: string;
  imageUrl: string;
};

export function validateInfluencerForm(form: InfluencerForm, editing: boolean, t: Translator): string | null {
  if (!form.name.trim() || !form.email.trim() || !form.referralCode.trim() || (!editing && !form.password)) {
    return t('أكمل الاسم والبريد الإلكتروني ورمز الإحالة وكلمة المرور المطلوبة.', 'Enter the required name, email, referral code, and password.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return t('أدخل بريداً إلكترونياً صحيحاً.', 'Enter a valid email address.');
  }
  if (form.password && form.password.length < 8) {
    return t('يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.', 'Password must be at least 8 characters.');
  }
  const rate = Number(form.commissionRate);
  if (!form.commissionRate.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    return t('يجب أن تكون نسبة العمولة بين 0 و100٪. أدخل قيمة صحيحة قبل الحفظ.', 'Commission must be between 0 and 100%. Enter a valid value before saving.');
  }
  return null;
}

export function influencerSaveError(error: unknown, t: Translator, editing: boolean): string {
  const failure = t('تعذر حفظ الحساب. حاول مجدداً.', 'Could not save account. Please try again.');
  if (!error || typeof error !== 'object' || !('status' in error)) return failure;
  const { status, data } = error as { status: unknown; data?: unknown };
  if (status === 401) return t('انتهت جلسة المدير. سجّل الدخول ثم حاول مجدداً.', 'Your admin session has expired. Sign in and try again.');
  if (status === 403) return t('ليس لديك صلاحية تعديل حسابات المشاهير.', 'You do not have permission to edit influencer accounts.');
  if (status === 400) return t('تحقق من بيانات الحساب وكلمة المرور (8 أحرف على الأقل) ثم حاول مجدداً.', 'Check the account details and password (at least 8 characters), then try again.');
  if (status === 409) {
    const reason = data && typeof data === 'object' && 'error' in data ? (data as { error: unknown }).error : null;
    if (reason === 'Influencer email already exists') return t('البريد الإلكتروني مستخدم لحساب مشهور آخر.', 'This email is already used by another influencer.');
    if (reason === 'Influencer referral code already exists') return t('رمز الإحالة مستخدم لحساب مشهور آخر.', 'This referral code is already used by another influencer.');
    return t('البريد الإلكتروني أو رمز الإحالة مستخدم بالفعل.', 'Email or referral code is already in use.');
  }
  return editing ? t('تعذر تحديث الحساب. حاول مجدداً.', 'Could not update account. Please try again.') : failure;
}