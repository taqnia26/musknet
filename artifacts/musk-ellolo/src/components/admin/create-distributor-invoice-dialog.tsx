import { useMemo, useState } from 'react';
import {
  getAdminListInvoicesQueryKey,
  useAdminCreateDistributorInvoice,
  useAdminListDistributors,
  useAdminListProducts,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Line = { productId: string; quantity: number; unitPrice: number };
const emptyLine = (): Line => ({ productId: '', quantity: 1, unitPrice: 0 });
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function CreateDistributorInvoiceDialog() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [distributorId, setDistributorId] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [creationKey, setCreationKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const { data: distributors } = useAdminListDistributors({ status: 'active' });
  const { data: products } = useAdminListProducts({ status: 'active' });
  const createInvoice = useAdminCreateDistributorInvoice();

  const totals = useMemo(() => {
    const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
    const vat = roundMoney(lines.reduce((sum, line) => sum + roundMoney(line.quantity * line.unitPrice * 0.15), 0));
    return { subtotal, vat, total: roundMoney(subtotal + vat) };
  }, [lines]);

  const reset = () => {
    setDistributorId('');
    setLines([emptyLine()]);
    setCreationKey(crypto.randomUUID());
    setError(null);
  };
  const updateLine = (index: number, update: Partial<Line>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...update } : line));
  };
  const submit = () => {
    setError(null);
    if (!distributorId || lines.some((line) => !line.productId || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || !Number.isFinite(line.unitPrice) || line.unitPrice <= 0)) {
      setError(t('اختر موزعاً وأدخل منتجاً وكمية وسعراً صالحاً لكل بند', 'Select a distributor and enter a valid product, quantity, and price for every line'));
      return;
    }
    if (new Set(lines.map((line) => line.productId)).size !== lines.length) {
      setError(t('لا يمكن تكرار المنتج في الفاتورة', 'A product cannot be repeated in the invoice'));
      return;
    }
    createInvoice.mutate({
      data: {
        creationKey,
        distributorId: Number(distributorId),
        items: lines.map((line) => ({ productId: Number(line.productId), quantity: line.quantity, unitPrice: line.unitPrice })),
      },
    }, {
      onSuccess: (invoice) => {
        queryClient.invalidateQueries({ queryKey: getAdminListInvoicesQueryKey() });
        toast({ title: t('تم إنشاء فاتورة الموزع', 'Distributor invoice created'), description: invoice.invoiceNumber });
        setOpen(false);
        reset();
      },
      onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : t('تعذر إنشاء الفاتورة', 'Unable to create invoice')),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-distributor-invoice"><Plus className="me-2 h-4 w-4" />{t('إضافة فاتورة موزع', 'Add Distributor Invoice')}</Button>
      </DialogTrigger>
      <DialogContent dir={lang === 'ar' ? 'rtl' : 'ltr'} className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader className={lang === 'ar' ? 'text-right' : 'text-left'}>
          <DialogTitle>{t('فاتورة مبيعات موزع', 'Distributor Sales Invoice')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>{t('الموزع النشط', 'Active Distributor')}</Label>
            <Select value={distributorId} onValueChange={setDistributorId}>
              <SelectTrigger data-testid="select-invoice-distributor"><SelectValue placeholder={t('اختر الموزع', 'Select distributor')} /></SelectTrigger>
              <SelectContent>{(distributors ?? []).map((distributor) => <SelectItem key={distributor.id} value={String(distributor.id)}>{distributor.companyName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t('بنود الفاتورة', 'Invoice Items')}</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, emptyLine()])}><Plus className="me-1 h-4 w-4" />{t('إضافة بند', 'Add item')}</Button>
            </div>
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_110px_140px_40px]">
                <Select value={line.productId} onValueChange={(productId) => {
                  const product = products?.find((candidate) => String(candidate.id) === productId);
                  updateLine(index, { productId, unitPrice: product?.price ?? 0 });
                }}>
                  <SelectTrigger><SelectValue placeholder={t('اختر المنتج', 'Select product')} /></SelectTrigger>
                  <SelectContent>{(products ?? []).map((product) => <SelectItem key={product.id} value={String(product.id)} disabled={lines.some((candidate, candidateIndex) => candidateIndex !== index && candidate.productId === String(product.id))}>{lang === 'ar' ? product.nameAr : product.nameEn}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min={1} step={1} value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} aria-label={t('الكمية', 'Quantity')} />
                <Input type="number" min={0.01} step={0.01} value={line.unitPrice || ''} onChange={(event) => updateLine(index, { unitPrice: Number(event.target.value) })} aria-label={t('سعر الوحدة', 'Unit Price')} />
                <Button type="button" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/20 p-4 text-center">
            <div><p className="text-xs text-muted-foreground">{t('قبل الضريبة', 'Subtotal')}</p><p className="font-semibold">{totals.subtotal.toFixed(2)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t('الضريبة 15%', 'VAT 15%')}</p><p className="font-semibold">{totals.vat.toFixed(2)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t('الإجمالي', 'Total')}</p><p className="font-bold text-primary">{totals.total.toFixed(2)}</p></div>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button className="w-full" onClick={submit} disabled={createInvoice.isPending}>{createInvoice.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ وإصدار الفاتورة', 'Save and Issue Invoice')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}