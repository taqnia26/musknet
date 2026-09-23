import { useMemo, useState } from 'react';
import {
  useAdminCreatePurchaseReceipt,
  getAdminListPurchaseReceiptsQueryKey,
  getGetOwnerOperationsSummaryQueryKey,
  useAdminCreatePurchaseReceiptPayment,
  useAdminListPurchaseReceipts,
  useAdminListProducts,
  useAdminPostPurchaseReceipt,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { Money } from '@/components/money';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sortProductsForSelection } from '@/lib/product-sort';

type ReceiptLine = { productId: string; quantity: string; unitCost: string };

export function PurchaseReceiptForm() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const { data: products = [] } = useAdminListProducts({});
  const productOptions = useMemo(() => sortProductsForSelection(products, lang), [products, lang]);
  const { data: receipts = [], isLoading: receiptsLoading } = useAdminListPurchaseReceipts();
  const createMutation = useAdminCreatePurchaseReceipt();
  const postMutation = useAdminPostPurchaseReceipt();
  const paymentMutation = useAdminCreatePurchaseReceiptPayment();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<ReceiptLine[]>([{ productId: '', quantity: '1', unitCost: '0' }]);
  const [paymentReceiptId, setPaymentReceiptId] = useState<number | null>(null);
  const [paymentKeys, setPaymentKeys] = useState<Record<number, string>>({});

  const updateLine = (index: number, patch: Partial<ReceiptLine>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const cleanLines = lines.map((line) => ({
      productId: Number(line.productId),
      quantity: Number(line.quantity),
      unitCost: Number(line.unitCost),
    }));
    if (cleanLines.some((line) => !Number.isInteger(line.productId) || line.productId < 1 || !Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isFinite(line.unitCost) || line.unitCost < 0)) {
      toast({ title: t('تحقق من بنود الاستلام', 'Check receipt lines'), description: t('اختر منتجًا وأدخل كمية وتكلفة صحيحتين لكل بند.', 'Choose a product and valid quantity/cost for every line.'), variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      data: {
        receiptNumber: String(form.get('receiptNumber') || '').trim(),
        vendorName: String(form.get('vendorName') || '').trim(),
        vendorReference: String(form.get('vendorReference') || '').trim() || null,
        receiptDate: String(form.get('receiptDate')),
        paymentStatus: String(form.get('paymentStatus')) as 'unpaid' | 'paid' | 'partial',
        paymentSource: String(form.get('paymentSource')) as 'company_account' | 'owner_account',
        paidAmount: Number(form.get('paidAmount') || 0),
        paymentReference: String(form.get('paymentReference') || '').trim() || null,
        lines: cleanLines,
      },
    }, {
      onSuccess: (receipt) => {
        postMutation.mutate({ id: receipt.id }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getAdminListPurchaseReceiptsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetOwnerOperationsSummaryQueryKey() });
            toast({ title: t('تم استلام وترحيل المشتريات', 'Purchase receipt posted'), description: t('تم تحديث المخزون والتكلفة والالتزام المالي.', 'Inventory, weighted cost and payable were updated.') });
            (event.currentTarget as HTMLFormElement).reset();
            setLines([{ productId: '', quantity: '1', unitCost: '0' }]);
          },
          onError: (error) => toast({ title: t('تم إنشاء المسودة ولم تُرحّل', 'Draft created but not posted'), description: String((error as Error).message), variant: 'destructive' }),
        });
      },
      onError: (error) => toast({ title: t('تعذر إنشاء الاستلام', 'Could not create receipt'), description: String((error as Error).message), variant: 'destructive' }),
    });
  };

  const busy = createMutation.isPending || postMutation.isPending;
  const postedReceipts = receipts.filter((receipt) => receipt.status === 'posted');
  const selectedReceipt = postedReceipts.find((receipt) => receipt.id === paymentReceiptId);
  const remaining = selectedReceipt
    ? Math.max(0, Number(selectedReceipt.amount) - Number(selectedReceipt.paidAmount ?? 0))
    : 0;

  const submitPayment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedReceipt) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get('amount'));
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.0001) {
      toast({
        title: t('مبلغ السداد غير صحيح', 'Invalid payment amount'),
        description: t('لا يمكن أن يتجاوز السداد الرصيد المتبقي.', 'Payment cannot exceed the remaining balance.'),
        variant: 'destructive',
      });
      return;
    }
    const paymentKey = paymentKeys[selectedReceipt.id] ?? `purchase-payment-${selectedReceipt.id}-${crypto.randomUUID()}`;
    if (!paymentKeys[selectedReceipt.id]) setPaymentKeys((current) => ({ ...current, [selectedReceipt.id]: paymentKey }));
    paymentMutation.mutate({
      id: selectedReceipt.id,
      data: {
        paymentKey,
        paymentDate: String(form.get('paymentDate')),
        amount,
        paymentSource: String(form.get('paymentSource')) as 'company_account' | 'owner_account',
        paymentReference: String(form.get('paymentReference') || '').trim() || null,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListPurchaseReceiptsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetOwnerOperationsSummaryQueryKey() });
        setPaymentReceiptId(null);
        setPaymentKeys((current) => {
          const next = { ...current };
          delete next[selectedReceipt.id];
          return next;
        });
        toast({ title: t('تم تسجيل السداد', 'Payment recorded') });
      },
      onError: (error) => toast({
        title: t('تعذر تسجيل السداد', 'Could not record payment'),
        description: String((error as Error).message),
        variant: 'destructive',
      }),
    });
  };

  return (
    <div className="mt-4 space-y-5">
      <Card>
      <CardHeader><CardTitle>{t('استلام مشتريات مرتبط', 'Linked purchase receipt')}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1 text-sm"><span>{t('رقم الاستلام', 'Receipt number')}</span><Input name="receiptNumber" required placeholder="GRN-0001" /></label>
            <label className="space-y-1 text-sm"><span>{t('المورد', 'Vendor')}</span><Input name="vendorName" required /></label>
            <label className="space-y-1 text-sm"><span>{t('مرجع المورد', 'Vendor reference')}</span><Input name="vendorReference" /></label>
            <label className="space-y-1 text-sm"><span>{t('تاريخ الاستلام', 'Receipt date')}</span><Input name="receiptDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
            <label className="space-y-1 text-sm"><span>{t('حالة السداد', 'Payment status')}</span><select name="paymentStatus" defaultValue="unpaid" className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="unpaid">{t('آجل', 'Unpaid')}</option><option value="partial">{t('جزئي', 'Partial')}</option><option value="paid">{t('مدفوع', 'Paid')}</option></select></label>
            <label className="space-y-1 text-sm"><span>{t('مصدر السداد', 'Payment source')}</span><select name="paymentSource" defaultValue="company_account" className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="company_account">{t('حساب الشركة', 'Company account')}</option><option value="owner_account">{t('حساب المالك', 'Owner account')}</option></select></label>
            <label className="space-y-1 text-sm"><span>{t('المبلغ المدفوع', 'Paid amount')}</span><Input name="paidAmount" type="number" min="0" step="0.01" defaultValue="0" /></label>
            <label className="space-y-1 text-sm"><span>{t('مرجع السداد', 'Payment reference')}</span><Input name="paymentReference" /></label>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="font-medium">{t('بنود الاستلام', 'Receipt lines')}</h3><Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { productId: '', quantity: '1', unitCost: '0' }])}><Plus className="me-2 h-4 w-4" />{t('إضافة بند', 'Add line')}</Button></div>
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-[1fr_140px_160px_auto]">
                <select value={line.productId} onChange={(event) => updateLine(index, { productId: event.target.value })} className="h-10 rounded-md border bg-background px-3 text-sm" required>
                  <option value="">{t('اختر المنتج', 'Select product')}</option>
                  {productOptions.map((product) => <option key={product.id} value={product.id}>{lang === 'ar' ? product.nameAr : product.nameEn}</option>)}
                </select>
                <Input type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} aria-label={t('الكمية', 'Quantity')} />
                <Input type="number" min="0" step="0.0001" value={line.unitCost} onChange={(event) => updateLine(index, { unitCost: event.target.value })} aria-label={t('تكلفة الوحدة', 'Unit cost')} />
                <Button type="button" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
          </div>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? t('جاري الترحيل...', 'Posting...') : t('حفظ وترحيل الاستلام', 'Save & post receipt')}</Button></div>
        </form>
      </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('الاستلامات المرحّلة والسداد', 'Posted receipts & settlement')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('تنعكس الدفعات على الالتزامات والملخص الموحد، مع مفتاح ثابت يمنع التكرار.', 'Payments update liabilities and the unified summary, using a stable idempotency key.')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {receiptsLoading ? <p className="text-sm text-muted-foreground">{t('جاري تحميل الاستلامات...', 'Loading receipts...')}</p> : postedReceipts.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{t('لا توجد استلامات مرحّلة.', 'No posted receipts yet.')}</p>
          ) : (
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40"><tr>
                  <th className="p-3 text-start">{t('الاستلام', 'Receipt')}</th>
                  <th className="p-3 text-start">{t('المورد / المرجع', 'Vendor / reference')}</th>
                  <th className="p-3 text-end">{t('الإجمالي', 'Total')}</th>
                  <th className="p-3 text-end">{t('المدفوع', 'Paid')}</th>
                  <th className="p-3 text-end">{t('المتبقي', 'Remaining')}</th>
                  <th className="p-3 text-start">{t('الحالة', 'Status')}</th>
                  <th className="p-3 text-end">{t('إجراء', 'Action')}</th>
                </tr></thead>
                <tbody>
                  {postedReceipts.map((receipt) => {
                    const total = Number(receipt.amount);
                    const paid = Number(receipt.paidAmount ?? 0);
                    const outstanding = Math.max(0, total - paid);
                    const reference = (receipt as typeof receipt & { vendorReference?: string | null }).vendorReference;
                    return (
                      <tr key={receipt.id} className="border-t">
                        <td className="p-3"><div className="font-medium">{receipt.receiptNumber}</div><div className="text-xs text-muted-foreground">{receipt.receiptDate.slice(0, 10)}</div></td>
                        <td className="p-3"><div>{receipt.vendorName}</div><div className="text-xs text-muted-foreground">{reference || receipt.paymentReference || '—'}</div></td>
                        <td className="p-3 text-end"><Money value={total} lang={lang} fractionDigits={2} /></td>
                        <td className="p-3 text-end"><Money value={paid} lang={lang} fractionDigits={2} /></td>
                        <td className="p-3 text-end font-medium"><Money value={outstanding} lang={lang} fractionDigits={2} /></td>
                        <td className="p-3">{receipt.paymentStatus}</td>
                        <td className="p-3 text-end">{outstanding > 0 ? <Button size="sm" variant="outline" onClick={() => setPaymentReceiptId(receipt.id)}>{t('تسجيل سداد', 'Record payment')}</Button> : <span className="text-xs text-muted-foreground">{t('مغلق', 'Settled')}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {selectedReceipt && (
            <form onSubmit={submitPayment} className="rounded-md border bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between"><h3 className="font-medium">{t(`سداد ${selectedReceipt.receiptNumber}`, `Settle ${selectedReceipt.receiptNumber}`)}</h3><span className="text-sm text-muted-foreground">{t('المتبقي', 'Remaining')}: <Money value={remaining} lang={lang} fractionDigits={2} /></span></div>
              <div className="grid gap-4 md:grid-cols-4">
                <label className="space-y-1 text-sm"><span>{t('التاريخ', 'Date')}</span><Input name="paymentDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
                <label className="space-y-1 text-sm"><span>{t('المبلغ', 'Amount')}</span><Input name="amount" type="number" min="0.01" max={remaining} step="0.01" required defaultValue={remaining.toFixed(2)} /></label>
                <label className="space-y-1 text-sm"><span>{t('المصدر', 'Source')}</span><select name="paymentSource" defaultValue="company_account" className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="company_account">{t('حساب الشركة', 'Company account')}</option><option value="owner_account">{t('حساب المالك', 'Owner account')}</option></select></label>
                <label className="space-y-1 text-sm"><span>{t('مرجع السداد', 'Payment reference')}</span><Input name="paymentReference" /></label>
              </div>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setPaymentReceiptId(null)}>{t('إلغاء', 'Cancel')}</Button><Button type="submit" disabled={paymentMutation.isPending}>{paymentMutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ السداد', 'Save payment')}</Button></div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}