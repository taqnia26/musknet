import { useEffect, useMemo, useState } from 'react';
import {
  getAdminListInvoicesQueryKey,
  useAdminCreateDistributorInvoice,
  useAdminListDistributors,
  useAdminListContracts,
  useAdminListContractFiles,
  useAdminListProducts,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { Money } from '@/components/money';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sortProductsForSelection } from '@/lib/product-sort';

type Line = { productId: string; quantity: number; unitPrice: number };
type InvoiceContractSource = {
  key: string;
  sourceType: 'generated' | 'uploaded';
  id: number;
  title: string;
  contractType: string;
  discountPercent: number;
  paymentDays: number | null;
  paymentTerm: 'net_days' | 'end_of_month' | 'due_on_issue';
  startDate: string | null;
  endDate: string | null;
  vatRate: number | null;
};
const emptyLine = (): Line => ({ productId: '', quantity: 1, unitPrice: 0 });
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const defaultDueDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return localDateValue(date);
};
const localDateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function CreateDistributorInvoiceDialog() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [distributorId, setDistributorId] = useState('');
  const [contractSourceKey, setContractSourceKey] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [creationKey, setCreationKey] = useState(() => crypto.randomUUID());
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [error, setError] = useState<string | null>(null);
  const { data: distributors } = useAdminListDistributors({ status: 'active' });
  const { data: contracts, isLoading: contractsLoading, isError: contractsError } = useAdminListContracts();
  const { data: uploadedFiles, isLoading: uploadedFilesLoading, isError: uploadedFilesError } = useAdminListContractFiles();
  const { data: products } = useAdminListProducts({ status: 'active' });
  const productOptions = useMemo(() => sortProductsForSelection(products ?? [], lang), [products, lang]);
  const createInvoice = useAdminCreateDistributorInvoice();

  const today = localDateValue(new Date());
  const contractSources = useMemo(() => {
    if (!distributorId) return [];
    const generated: InvoiceContractSource[] = (contracts ?? [])
      .filter((contract) =>
        contract.status === 'final' &&
        contract.distributorId === Number(distributorId) &&
        (!contract.startDate || contract.startDate.slice(0, 10) <= today) &&
        (!contract.endDate || contract.endDate.slice(0, 10) >= today),
      )
      .map((contract) => ({
        key: `generated-${contract.id}`,
        sourceType: 'generated',
        id: contract.id,
        title: contract.contractNumber,
        contractType: contract.contractType,
        discountPercent: Number(contract.marginPercent ?? 0),
        paymentDays: contract.paymentDays ?? null,
        paymentTerm: contract.contractType.includes('نقد') ? 'due_on_issue' : 'net_days',
        startDate: contract.startDate ?? null,
        endDate: contract.endDate ?? null,
        vatRate: contract.vatRate == null ? null : Number(contract.vatRate),
      }));
    const uploaded: InvoiceContractSource[] = (uploadedFiles ?? [])
      .filter((file) =>
        file.ownerType === 'distributor' &&
        file.ownerId === Number(distributorId) &&
        Boolean(file.termsConfirmedAt) &&
        (!file.startDate || file.startDate.slice(0, 10) <= today) &&
        (!file.endDate || file.endDate.slice(0, 10) >= today),
      )
      .map((file) => ({
        key: `uploaded-${file.id}`,
        sourceType: 'uploaded',
        id: file.id,
        title: file.fileName,
        contractType: file.contractType!,
        discountPercent: Number(file.discountPercent ?? 0),
        paymentDays: file.paymentDays ?? null,
        paymentTerm: file.paymentTerm!,
        startDate: file.startDate ?? null,
        endDate: file.endDate ?? null,
        vatRate: null,
      }));
    return [...generated, ...uploaded];
  }, [contracts, uploadedFiles, distributorId, today]);
  const pendingUploadedFiles = useMemo(
    () => (uploadedFiles ?? []).filter((file) =>
      file.ownerType === 'distributor' &&
      file.ownerId === Number(distributorId) &&
      !file.termsConfirmedAt,
    ),
    [uploadedFiles, distributorId],
  );
  const selectedSource = contractSources.find((source) => source.key === contractSourceKey);
  useEffect(() => {
    setContractSourceKey(contractSources.length === 1 ? contractSources[0].key : '');
  }, [distributorId, contractSources]);

  const selectedDistributor = (distributors ?? []).find((distributor) => String(distributor.id) === distributorId);
  const countryCode = (selectedDistributor as (typeof selectedDistributor & { countryCode?: string | null }))?.countryCode?.trim() ?? '';
  const hasValidCountryCode = /^[A-Z]{2}$/.test(countryCode);
  const isGulfContract = Boolean(selectedSource?.contractType.includes('دول الخليج'));
  const isSaudiContract = Boolean(selectedSource?.contractType.includes('السعودية'));
  const taxTreatment = hasValidCountryCode && countryCode !== 'SA' ? 'international' : 'domestic';
  const discountPercent = Math.min(100, Math.max(0, Number(selectedSource?.discountPercent ?? 0) || 0));
  const vatRate = taxTreatment === 'domestic' ? Math.max(0, Number(selectedSource?.vatRate ?? 15) || 0) : 0;
  const contractDueDate = useMemo(() => {
    if (!selectedSource) return '';
    const date = new Date();
    if (selectedSource.paymentTerm === 'end_of_month') {
      return localDateValue(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    }
    const paymentDays = selectedSource.paymentTerm === 'due_on_issue' ? 0 : Math.max(0, selectedSource.paymentDays ?? 0);
    date.setDate(date.getDate() + paymentDays);
    return localDateValue(date);
  }, [selectedSource]);

  const totals = useMemo(() => {
    const amounts = lines.map((line) => {
      const unitCents = Math.round((line.unitPrice + Number.EPSILON) * 100);
      const grossCents = unitCents * line.quantity;
      const discountedGrossCents = Math.round(grossCents * (100 - discountPercent) / 100);
      const netCents = vatRate > 0 ? Math.round(discountedGrossCents * 100 / (100 + vatRate)) : discountedGrossCents;
      return { grossCents, discountedGrossCents, netCents, vatCents: discountedGrossCents - netCents };
    });
    const centsTotal = (key: keyof (typeof amounts)[number]) => amounts.reduce((sum, amount) => sum + amount[key], 0);
    const grossSubtotal = centsTotal('grossCents');
    const discountedGross = centsTotal('discountedGrossCents');
    return {
      grossSubtotal: grossSubtotal / 100,
      discount: (grossSubtotal - discountedGross) / 100,
      subtotal: centsTotal('netCents') / 100,
      vat: centsTotal('vatCents') / 100,
      total: discountedGross / 100,
    };
  }, [discountPercent, lines, vatRate]);

  const reset = () => {
    setDistributorId('');
    setContractSourceKey('');
    setLines([emptyLine()]);
    setCreationKey(crypto.randomUUID());
    setDueDate(defaultDueDate());
    setError(null);
  };
  const updateLine = (index: number, update: Partial<Line>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...update } : line));
  };
  const submit = () => {
    setError(null);
    const effectiveDueDate = selectedSource ? contractDueDate : dueDate;
    if (!distributorId) {
      setError(t('اختر موزعاً وأدخل منتجاً وكمية وسعراً صالحاً لكل بند', 'Select a distributor and enter a valid product, quantity, and price for every line'));
      return;
    }
    if (!selectedDistributor) {
      setError(t('تعذر التحقق من بلد الشركة. أعد تحميل الشركات وحاول مجدداً.', 'Could not verify the company country. Reload the company list and try again.'));
      return;
    }
    if (contractsLoading || uploadedFilesLoading || contractsError || uploadedFilesError) {
      setError(t('تعذر التحقق من العقود المرتبطة. حاول مجدداً قبل إصدار الفاتورة.', 'Could not verify linked contracts. Retry before issuing the invoice.'));
      return;
    }
    if (pendingUploadedFiles.length > 0 && !selectedSource) {
      setError(t('يوجد عقد مرفوع لهذه الشركة بانتظار اعتماد شروطه. اعتمد الشروط من تبويب الملفات المرفوعة قبل إصدار الفاتورة.', 'This company has an uploaded contract waiting for terms approval. Approve its terms in Uploaded Files before issuing an invoice.'));
      return;
    }
    if (contractSources.length > 1 && !selectedSource) {
      setError(t('اختر العقد أو الملف المعتمد الذي ستصدر الفاتورة بموجبه.', 'Select the contract or approved file to issue this invoice under.'));
      return;
    }
    if (isGulfContract && (!hasValidCountryCode || countryCode === 'SA')) {
      setError(countryCode === 'SA'
        ? t('عقد الخليج يتطلب شركة مسجلة خارج المملكة العربية السعودية؛ حدّث دولة الشركة قبل إصدار الفاتورة.', 'A Gulf contract requires a company registered outside Saudi Arabia. Update the company country before issuing the invoice.')
        : t('عقد الخليج يتطلب رمز دولة صالحاً غير محدد أو سعوديّاً. حدّث دولة الشركة برمز ISO-2 قبل إصدار الفاتورة.', 'A Gulf contract requires a valid non-Saudi country code. Set the company ISO-2 country before issuing the invoice.'));
      return;
    }
    if (isSaudiContract && hasValidCountryCode && countryCode !== 'SA') {
      setError(t('عقد المملكة العربية السعودية يتطلب أن تكون دولة الشركة SA. صحح بلد الشركة قبل إصدار الفاتورة.', 'A Saudi contract requires the company country to be SA. Correct the company country before issuing the invoice.'));
      return;
    }
    if (!effectiveDueDate || lines.some((line) => !line.productId || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || !Number.isFinite(line.unitPrice) || line.unitPrice <= 0)) {
      setError(t('أدخل تاريخ استحقاق صالحاً ومنتجاً وكمية وسعراً صالحاً لكل بند', 'Enter a valid due date, product, quantity, and price for every line'));
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
        ...(selectedSource
          ? selectedSource.sourceType === 'uploaded'
            ? { uploadedContractFileId: selectedSource.id, taxTreatment }
            : { contractId: selectedSource.id, taxTreatment }
          : { dueDate, taxTreatment }),
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
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('الموزع النشط', 'Active Distributor')}</Label>
               <Select value={distributorId} onValueChange={(value) => { setDistributorId(value); setContractSourceKey(''); }}>
                <SelectTrigger data-testid="select-invoice-distributor"><SelectValue placeholder={t('اختر الموزع', 'Select distributor')} /></SelectTrigger>
                <SelectContent>{(distributors ?? []).map((distributor) => <SelectItem key={distributor.id} value={String(distributor.id)}>{distributor.companyName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('مصدر شروط الفوترة', 'Invoice terms source')}</Label>
              {contractsLoading || uploadedFilesLoading ? <p className="text-sm text-muted-foreground">{t('جاري تحميل العقود والملفات...', 'Loading contracts and files...')}</p> : contractsError || uploadedFilesError ? (
                <p role="alert" className="text-sm text-destructive">{t('تعذر تحميل العقود أو الملفات المرفوعة. أعد فتح النافذة وحاول مجدداً.', 'Could not load contracts or uploaded files. Reopen the dialog and try again.')}</p>
              ) : !distributorId ? (
                <p className="rounded-md border bg-muted/20 p-2 text-sm text-muted-foreground">{t('اختر الشركة لعرض العقود المتاحة.', 'Select a company to view available contracts.')}</p>
              ) : contractSources.length === 0 ? (
                <p className="rounded-md border bg-muted/20 p-2 text-sm text-muted-foreground">{t('لا يوجد عقد نهائي أو ملف عقد معتمد وساري لهذه الشركة.', 'No final contract or approved active contract file applies to this company.')}</p>
              ) : contractSources.length === 1 ? (
                <p className="rounded-md border bg-muted/20 p-2 text-sm">
                  {contractSources[0].sourceType === 'uploaded' ? t('ملف مرفوع', 'Uploaded file') : t('عقد نهائي', 'Final contract')} · {contractSources[0].title} · {contractSources[0].contractType}
                </p>
              ) : (
                <Select value={contractSourceKey} onValueChange={setContractSourceKey}>
                  <SelectTrigger data-testid="select-invoice-contract-source"><SelectValue placeholder={t('اختر العقد أو الملف المعتمد', 'Select a contract or approved file')} /></SelectTrigger>
                  <SelectContent>{contractSources.map((source) => <SelectItem key={source.key} value={source.key}>{source.sourceType === 'uploaded' ? t('ملف مرفوع', 'Uploaded file') : t('عقد نهائي', 'Final contract')} · {source.title} · {source.contractType}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {pendingUploadedFiles.length > 0 && (
                <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-800">
                  {t(
                    `يوجد ${pendingUploadedFiles.length} ملف عقد بانتظار اعتماد الشروط (${pendingUploadedFiles.map((file) => file.fileName).join('، ')}). ${selectedSource ? 'يمكن إصدار الفاتورة بالمصدر المعتمد المختار؛ اعتمد هذه الملفات لاستخدامها لاحقاً.' : 'اعتمد الشروط من الملفات المرفوعة قبل إصدار الفاتورة.'}`,
                    `${pendingUploadedFiles.length} uploaded contract file(s) await terms approval. ${selectedSource ? 'You can invoice using the selected approved source; approve these files for later use.' : 'Approve the terms in Uploaded Files before issuing an invoice.'}`,
                  )}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-due-date">{t('تاريخ الاستحقاق', 'Due date')}</Label>
              <Input id="invoice-due-date" type="date" value={selectedSource ? contractDueDate : dueDate} onChange={(event) => setDueDate(event.target.value)} readOnly={!!selectedSource} />
              {selectedSource && <p className="text-xs text-muted-foreground">{selectedSource.paymentTerm === 'due_on_issue'
                ? t('فاتورة نقدية: تاريخ الاستحقاق يوم الإصدار', 'Cash terms: due on issue')
                : selectedSource.paymentTerm === 'end_of_month'
                  ? t('احتُسب تاريخ الاستحقاق لنهاية الشهر', 'Due date calculated as end of month')
                  : t(`احتُسب حسب مهلة الدفع في العقد (${selectedSource.paymentDays ?? 0} يوم)`, `Calculated from contract payment terms (${selectedSource.paymentDays ?? 0} days)`)}</p>}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedSource && <>{t('المصدر', 'Source')}: {selectedSource.title} · {t('الخصم', 'Discount')}: {discountPercent}% · </>}
            {taxTreatment === 'international'
              ? t(`دولي وفق دولة الشركة (${countryCode}) — بدون ضريبة قيمة مضافة`, `International from company country (${countryCode}) — no VAT`)
              : t('محلي وفق دولة الشركة (ضريبة القيمة المضافة مشمولة)', 'Domestic from company country (VAT included)')}
          </p>
          {(!hasValidCountryCode) && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800">
            {t('بلد هذه الشركة غير محدد. ستُعامل الفاتورة محلياً فقط؛ حدّث رمز الدولة ISO-2 في بيانات الشركة قبل إصدار فاتورة دولية.', 'This company country is not set. This invoice can be domestic only; update the company ISO-2 country before issuing an international invoice.')}
          </p>}
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
                  <SelectContent>{productOptions.map((product) => <SelectItem key={product.id} value={String(product.id)} disabled={lines.some((candidate, candidateIndex) => candidateIndex !== index && candidate.productId === String(product.id))}>{lang === 'ar' ? product.nameAr : product.nameEn}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min={1} step={1} value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} aria-label={t('الكمية', 'Quantity')} />
              <Input type="number" min={0.01} step={0.01} value={line.unitPrice || ''} onChange={(event) => updateLine(index, { unitPrice: Number(event.target.value) })} aria-label={taxTreatment === 'international' ? t('سعر الوحدة', 'Unit price') : t('سعر الوحدة شامل الضريبة', 'Gross unit price including VAT')} />
                <Button type="button" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <div data-testid="distributor-invoice-totals" className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/20 p-4 text-center">
            <div><p className="text-xs text-muted-foreground">{taxTreatment === 'international' ? t('الإجمالي قبل الخصم', 'Gross before discount') : t('الإجمالي قبل الخصم (شامل الضريبة)', 'Gross before discount (VAT included)')}</p><p className="font-semibold"><Money value={totals.grossSubtotal} lang={lang} fractionDigits={2} /></p></div>
            <div><p className="text-xs text-muted-foreground">{t('الخصم', 'Discount')}{selectedSource ? ` (${discountPercent}%)` : ''}</p><p className="font-semibold"><Money value={-totals.discount} lang={lang} fractionDigits={2} /></p></div>
            {taxTreatment === 'international' ? (
              <div><p className="text-xs text-muted-foreground">{t('الإجمالي بعد الخصم', 'Total after discount')}</p><p className="font-bold text-primary"><Money value={totals.total} lang={lang} fractionDigits={2} /></p></div>
            ) : (
              <>
                <div><p className="text-xs text-muted-foreground">{t('صافي المبلغ قبل الضريبة', 'Net subtotal')}</p><p className="font-semibold"><Money value={totals.subtotal} lang={lang} fractionDigits={2} /></p></div>
                <div><p className="text-xs text-muted-foreground">{vatRate ? t(`ضريبة القيمة المضافة المستخرجة (${vatRate}%)`, `VAT included (${vatRate}%)`) : t('ضريبة القيمة المضافة (0%)', 'VAT (0%)')}</p><p className="font-semibold"><Money value={totals.vat} lang={lang} fractionDigits={2} /></p></div>
                <div><p className="text-xs text-muted-foreground">{t('الإجمالي', 'Total')}</p><p className="font-bold text-primary"><Money value={totals.total} lang={lang} fractionDigits={2} /></p></div>
              </>
            )}
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button className="w-full" onClick={submit} disabled={createInvoice.isPending || contractsLoading || uploadedFilesLoading || (pendingUploadedFiles.length > 0 && !selectedSource)}>{createInvoice.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ وإصدار الفاتورة', 'Save and Issue Invoice')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}