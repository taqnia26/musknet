import { useVerifyOtp } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { KeyRound } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function VerifyOtp() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const phone = searchParams.get('phone') || '';
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const verifyOtp = useVerifyOtp();
  
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!phone) {
      setLocation('/auth/register');
    }
  }, [phone, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 4) {
      toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: t('الرمز غير صالح', 'Invalid code') });
      return;
    }

    verifyOtp.mutate({ data: { phone, code } }, {
      onSuccess: (res) => {
        // Token is typically stored by the client layer or in cookies.
        // Orval uses custom-fetch which handles credentials/cookies automatically.
        toast({
          title: t('تم تسجيل الدخول بنجاح', 'Signed in successfully'),
          description: `${t('مرحباً بك', 'Welcome')} ${res.user.name || ''}`,
        });
        
        // Invalidate auth queries
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        
        setLocation('/account');
      },
      onError: (err: any) => {
        toast({
          variant: 'destructive',
          title: t('خطأ', 'Error'),
          description: err.error || t('رمز التحقق غير صحيح', 'Invalid verification code'),
        });
      }
    });
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-background p-4 animate-in fade-in duration-500">
      <div className="w-full max-w-md bg-card p-8 md:p-10 rounded-3xl shadow-xl border">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-primary/5 rounded-full flex items-center justify-center text-primary">
            <KeyRound className="w-8 h-8" />
          </div>
        </div>
        
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-3">{t('رمز التحقق', 'Verification Code')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('أدخل الرمز المكون من ٤ أرقام المرسل إلى', 'Enter the 4-digit code sent to')} <br/>
            <span className="font-bold text-foreground inline-block mt-1" dir="ltr">+966 {phone}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Input 
              type="text" 
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="XXXX"
              className="h-16 text-center text-3xl tracking-[1em] font-bold bg-background"
              required
              autoFocus
              dir="ltr"
            />
          </div>
          
          <Button 
            type="submit" 
            size="lg" 
            className="w-full h-14 rounded-full text-lg"
            disabled={verifyOtp.isPending || code.length < 4}
          >
            {verifyOtp.isPending ? t('جاري التحقق...', 'Verifying...') : t('تأكيد الدخول', 'Confirm')}
          </Button>
          
          <div className="text-center pt-4">
            <button type="button" onClick={() => setLocation('/auth/register')} className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
              {t('تغيير رقم الهاتف', 'Change phone number')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
