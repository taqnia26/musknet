import { useState } from 'react';
import {
  getGetOwnerCredentialsSettingsQueryKey,
  useGetOwnerCredentialsSettings,
  useUpdateOwnerCredentialsSettings,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';

export default function OwnerCredentialsSettings() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const status = useGetOwnerCredentialsSettings();
  const update = useUpdateOwnerCredentialsSettings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const currentEmail = email || status.data?.email || '';
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (password.length < 8 || password !== confirmation) {
      setMessage({ ok: false, text: t('تأكد من أن كلمة المرور 8 أحرف على الأقل وأن التأكيد مطابق.', 'Use at least 8 characters and make sure confirmation matches.') });
      return;
    }
    update.mutate({ data: { email: currentEmail, password, passwordConfirmation: confirmation } }, {
      onSuccess: () => {
        setPassword('');
        setConfirmation('');
        setEmail('');
        setMessage({ ok: true, text: t('تم تحديث بيانات دخول المالك بأمان.', 'Owner credentials updated securely.') });
        void queryClient.invalidateQueries({ queryKey: getGetOwnerCredentialsSettingsQueryKey() });
      },
      onError: () => setMessage({ ok: false, text: t('تعذر حفظ بيانات الدخول. تأكد من الصلاحيات والبيانات.', 'Could not save credentials. Check your permissions and values.') }),
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold">{t('بيانات دخول المالك', 'Owner login credentials')}</h1>
        <p className="mt-2 text-muted-foreground">{t('حدّث البريد وكلمة المرور المستخدمة للدخول إلى بوابة المالك. كلمة المرور لا تُعرض أو تُحفظ كنص مكشوف.', 'Update the credentials used by the owner portal. Passwords are never displayed or stored in plain text.')}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />{t('إعدادات الدخول', 'Login settings')}</CardTitle>
          <CardDescription>{status.data?.configured ? t('البيانات مهيأة حالياً.', 'Credentials are currently configured.') : t('لم يتم تهيئة بيانات مخصصة بعد.', 'No custom credentials configured yet.')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2"><Label htmlFor="owner-email">{t('البريد الإلكتروني', 'Email address')}</Label><Input id="owner-email" type="email" required value={currentEmail} onChange={(e) => setEmail(e.target.value)} autoComplete="username" dir="ltr" /></div>
            <div className="space-y-2"><Label htmlFor="owner-password">{t('كلمة المرور الجديدة', 'New password')}</Label><Input id="owner-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" dir="ltr" /></div>
            <div className="space-y-2"><Label htmlFor="owner-password-confirmation">{t('تأكيد كلمة المرور', 'Confirm password')}</Label><Input id="owner-password-confirmation" type="password" required minLength={8} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" dir="ltr" /></div>
            {message && <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-destructive/10 text-destructive'}`}>{message.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{message.text}</div>}
            <Button type="submit" disabled={update.isPending || status.isLoading}>{update.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t('حفظ بيانات المالك', 'Save owner credentials')}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}