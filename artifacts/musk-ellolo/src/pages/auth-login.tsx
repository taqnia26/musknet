import { useRequestOtp } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Smartphone } from 'lucide-react';
import { safeReturnTo } from '@/lib/safe-return-to';

export default function Login() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const returnTo = safeReturnTo(new URLSearchParams(searchString).get('returnTo'), '/account');
  const { toast } = useToast();
  
  const [phone, setPhone] = useState('');
  const requestOtp = useRequestOtp();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 8) {
      toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: t('رقم الهاتف غير صالح', 'Invalid phone number') });
      return;
    }

    requestOtp.mutate({ data: { phone } }, {
      onSuccess: (res) => {
        // Pass phone to next step via sessionStorage or similar, here we'll just encode in URL for simplicity
        setLocation(`/auth/verify-otp?phone=${encodeURIComponent(phone)}&returnTo=${encodeURIComponent(returnTo)}`);
        
        // Show dev code if available (for testing)
        if (res.devCode) {
          toast({
            title: 'Development Mode',
            description: `Your OTP is: ${res.devCode}`,
            duration: 10000,
          });
        }
      },
      onError: (err: any) => {
        toast({
          variant: 'destructive',
          title: t('خطأ', 'Error'),
          description: err.error || t('حدث خطأ أثناء إرسال الرمز', 'Error sending code'),
        });
      }
    });
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-background p-4 animate-in fade-in duration-500">
      <div className="w-full max-w-md bg-card p-8 md:p-10 rounded-3xl shadow-xl border">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-primary/5 rounded-full flex items-center justify-center text-primary">
            <Smartphone className="w-8 h-8" />
          </div>
        </div>
        
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-3">{t('تسجيل الدخول', 'Sign In')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('أدخل رقم هاتفك لتسجيل الدخول أو إنشاء حساب جديد', 'Enter your phone number to sign in or create a new account')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold block" dir={document.documentElement.dir}>
              {t('رقم الهاتف', 'Phone Number')}
            </label>
            <div className="relative" dir="ltr">
              <Input 
                type="tel" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5X XXX XXXX"
                className="h-14 pl-16 text-lg tracking-widest bg-background"
                required
              />
              <div className="absolute left-0 top-0 bottom-0 w-14 flex items-center justify-center border-r text-sm text-muted-foreground font-medium bg-muted/20 rounded-l-md">
                +966
              </div>
            </div>
          </div>
          
          <Button 
            type="submit" 
            size="lg" 
            className="w-full h-14 rounded-full text-lg"
            disabled={requestOtp.isPending || phone.length < 8}
          >
            {requestOtp.isPending ? t('جاري الإرسال...', 'Sending...') : t('إرسال رمز التحقق', 'Send Verification Code')}
          </Button>
        </form>
      </div>
    </div>
  );
}
