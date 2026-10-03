import { useEffect } from 'react';
import { useAdminCreateCustomerCartLink, type AdminCustomer } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';

export function CustomerCartLinkDialog({ customer, onClose }: { customer: AdminCustomer; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const { mutate, data, isPending, error } = useAdminCreateCustomerCartLink();
  useEffect(() => { mutate({ id: customer.id }); }, [customer.id, mutate]);
  const url = data ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}${data.path}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('تم نسخ رابط السلة', 'Cart link copied') });
    } catch {
      toast({ variant: 'destructive', title: t('تعذر النسخ تلقائياً؛ انسخ الرابط من الخانة', 'Unable to copy automatically; copy the link from the field') });
    }
  };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{t('رابط سلة العميل', 'Customer cart link')} — {customer.name}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">{t('يفتح السلة الحالية بعد تسجيل الدخول بحساب هذا العميل. لا ينسخ طلباً إدارياً ولا ينشئ طلباً أو فاتورة أو تحصيلاً، ولا يرسل رسالة تلقائياً.', 'Opens the current cart after signing in as this customer. Does not copy an admin order, create an order, invoice or collection, or send a message automatically.')}</p>
      {import.meta.env.DEV && <p className="text-sm text-muted-foreground">{t('هذا رابط لبيئة المعاينة الحالية، وليس رابطاً منشوراً للمتجر.', 'This link is for the current preview environment, not the published store.')}</p>}
      {isPending && <p role="status">{t('جاري تجهيز الرابط...', 'Preparing the link...')}</p>}
      {error && <><p role="alert" className="text-sm text-destructive">{(error as { data?: { error?: string } }).data?.error ?? t('تعذر تجهيز الرابط', 'Unable to prepare the link')}</p><Button onClick={() => mutate({ id: customer.id })}>{t('إعادة المحاولة', 'Retry')}</Button></>}
      {data && <>
        <label htmlFor="customer-cart-link" className="text-sm font-medium">{t('الرابط', 'Link')}</label>
        <Input id="customer-cart-link" data-testid="customer-cart-link" dir="ltr" readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
        <p className="text-xs text-muted-foreground">{t('صالح حتى', 'Valid until')} {new Date(data.expiresAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', { timeZone: 'Asia/Riyadh' })}</p>
        <Button onClick={copy} data-testid="copy-customer-cart-link">{t('نسخ رابط السلة', 'Copy cart link')}</Button>
      </>}
    </DialogContent>
  </Dialog>;
}