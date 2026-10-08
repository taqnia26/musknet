import { useMemo, useState } from 'react';
import { formatInvoiceNumber } from '@workspace/invoice-document/core';
import {
  getAdminListInvoicesQueryKey,
  getAdminGetCompanyInvoiceSellerConfigurationQueryKey,
  useAdminListDistributors,
  useAdminListContracts,
  useAdminListContractFiles,
  useAdminListProducts,
  useAdminCreateCompanyInvoice,
  useAdminGetCompanyInvoiceSellerConfiguration,
  type CompanyInvoiceInput,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sortProductsForSelection } from '@/lib/product-sort';
import { formatRiyadhBusinessDate } from '@/lib/riyadh-business-date';

type Line = { id: string; productId: string; productName: string; sku: string; manualSnapshot: boolean; quantity: string; unitPrice: string };
type ContractOption = { key: string; label: string; contractId?: number; uploadedContractFileId?: number; contractType: string; discountPercent: number; vatRate: number | null; startDate?: string | null; endDate?: string | null };
const dateInRiyadh = () => formatRiyadhBusinessDate(new Date());
const dateAfter = (date: string, days: number) => {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}`;
};
const blankLine = (): Line => ({ id: crypto.randomUUID(), productId: '', productName: '', sku: '', manualSnapshot: false, quantity: '1', unitPrice: '' });
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function CreateCompanyInvoiceDialog() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [distributorId, setDistributorId] = useState('');
  const [issueDate, setIssueDate] = useState(dateInRiyadh);
  const [dueDate, setDueDate] = useState(() => dateAfter(dateInRiyadh(), 30));
  const [originalInvoiceNumber, setOriginalInvoiceNumber] = useState('');
  const [contractKey, setContractKey] = useState('');
  const [overridePercent, setOverridePercent] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [collected, setCollected] = useState(false);
  const [showShipping, setShowShipping] = useState(false);
  const [paymentDate, setPaymentDate] = useState(dateInRiyadh);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('bank_transfer');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [creationKey, setCreationKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: distributors, isLoading: distributorsLoading, isError: distributorsError } = useAdminListDistributors({ status: 'active' });
  const { data: contracts, isLoading: contractsLoading, isError: contractsError } = useAdminListContracts();
  const { data: contractFiles, isLoading: filesLoading, isError: filesError } = useAdminListContractFiles();
  const { data: products, isLoading: productsLoading, isError: productsError } = useAdminListProducts();
  const createInvoice = useAdminCreateCompanyInvoice();
  const productOptions = useMemo(() => sortProductsForSelection(products ?? [], lang), [products, lang]);
  const sellerConfigurationQuery = useAdminGetCompanyInvoiceSellerConfiguration({
    query: { queryKey: getAdminGetCompanyInvoiceSellerConfigurationQueryKey(), staleTime: 5 * 60 * 1000, refetchOnMount: 'always' },
  });
  const sellerConfiguration = sellerConfigurationQuery.data;
  const today = dateInRiyadh();
  const isHistorical = validDate(issueDate) && issueDate < today;
  const availableProducts = useMemo(() => productOptions.filter(product => isHistorical || product.isActive), [isHistorical, productOptions]);

  const contractOptions = useMemo<ContractOption[]>(() => {
    if (!distributorId) return [];
    const generated = (contracts ?? [])
      .filter(contract => contract.status === 'final' && contract.distributorId === Number(distributorId)
         && (isHistorical || ((!contract.startDate || contract.startDate.slice(0, 10) <= today)
         && (!contract.endDate || contract.endDate.slice(0, 10) >= today))))
      .map(contract => ({
        key: `contract-${contract.id}`,
        contractId: contract.id,
        label: `${contract.contractNumber} · ${contract.contractType}`,
        contractType: contract.contractType,
        discountPercent: Number(contract.marginPercent ?? 0),
        vatRate: contract.vatRate == null ? null : Number(contract.vatRate),
        startDate: contract.startDate?.slice(0, 10),
        endDate: contract.endDate?.slice(0, 10),
      }));
    const uploaded = (contractFiles ?? [])
      .filter(file => file.ownerType === 'distributor' && file.ownerId === Number(distributorId)
        && Boolean(file.termsConfirmedAt)
         && (isHistorical || ((!file.startDate || file.startDate.slice(0, 10) <= today)
         && (!file.endDate || file.endDate.slice(0, 10) >= today))))
      .map(file => ({
        key: `file-${file.id}`,
        uploadedContractFileId: file.id,
        label: `${t('ملف مرفوع', 'Uploaded file')}: ${file.fileName}`,
        contractType: file.contractType ?? '',
        discountPercent: Number(file.discountPercent ?? 0),
        vatRate: null,
        startDate: file.startDate,
        endDate: file.endDate,
      }));
    return [...generated, ...uploaded];
  }, [contracts, contractFiles, distributorId, t, today, isHistorical]);
  const selectedContract = contractOptions.find(option => option.key === contractKey);
  const missingSelectedSource = Boolean(contractKey && !selectedContract);
  const periodWarning = selectedContract && validDate(issueDate)
    ? selectedContract.startDate && issueDate < selectedContract.startDate ? 'before'
      : selectedContract.endDate && issueDate > selectedContract.endDate ? 'after' : null
    : null;
  const pendingUploadedFiles = useMemo(() => (contractFiles ?? []).filter(file =>
    !isHistorical && file.ownerType === 'distributor' && file.ownerId === Number(distributorId) && !file.termsConfirmedAt,
  ), [contractFiles, distributorId, isHistorical]);
  const selectedDistributor = distributors?.find(item => String(item.id) === distributorId);
  const countryCode = selectedDistributor?.countryCode?.trim().toUpperCase() ?? '';
  const validCountryCode = /^[A-Z]{2}$/.test(countryCode);
  const taxTreatment = validCountryCode && countryCode !== 'SA' ? 'international' : 'domestic';
  const contractType = selectedContract?.contractType ?? '';
  const isGulfContract = contractType.includes('دول الخليج');
  const isSaudiContract = contractType.includes('السعودية');
  const contractDiscount = Number(selectedContract?.discountPercent ?? 0);
  const discountPercent = overridePercent === '' ? contractDiscount : Number(overridePercent);
  const discountChanged = discountPercent !== contractDiscount;
  const vatRate = taxTreatment === 'international' ? 0 : Math.max(0, Number(selectedContract?.vatRate ?? 15) || 0);
  const totals = useMemo(() => {
    const amounts = lines.map(line => {
      const unitCents = Math.round((Number(line.unitPrice) + Number.EPSILON) * 100);
      const grossCents = unitCents * Number(line.quantity || 0);
      const discountedGrossCents = Math.round(grossCents * (100 - discountPercent) / 100);
      const discountCents = grossCents - discountedGrossCents;
      const netCents = vatRate > 0 ? Math.round(discountedGrossCents * 100 / (100 + vatRate)) : discountedGrossCents;
      return { grossCents, discountCents, netCents, vatCents: discountedGrossCents - netCents, totalCents: discountedGrossCents };
    });
    const sum = (field: keyof (typeof amounts)[number]) => amounts.reduce((total, item) => total + (Number.isFinite(item[field]) ? item[field] : 0), 0);
    return {
      gross: sum('grossCents') / 100,
      discount: sum('discountCents') / 100,
      subtotal: sum('netCents') / 100,
      vat: sum('vatCents') / 100,
      total: sum('totalCents') / 100,
    };
  }, [discountPercent, lines, vatRate]);

  const reset = () => {
    setShowShipping(false);
    const today = dateInRiyadh();
    setDistributorId('');
    setIssueDate(today);
    setDueDate(dateAfter(today, 30));
    setOriginalInvoiceNumber('');
    setContractKey('');
    setOverridePercent('');
    setOverrideReason('');
    setCollected(false);
    setPaymentDate(today);
    setPaymentMethod('bank_transfer');
    setLines([blankLine()]);
    setCreationKey(crypto.randomUUID());
    setError(null);
  };

  const rotateCreationKey = () => setCreationKey(crypto.randomUUID());
  const updateLine = (id: string, update: Partial<Line>) => {
    rotateCreationKey();
    setLines(current => current.map(line => line.id === id ? { ...line, ...update } : line));
  };
  const submit = async () => {
    setError(null);
    if (!distributorId || !(distributors ?? []).some(item => String(item.id) === distributorId)
      || !validDate(issueDate) || !validDate(dueDate) || dueDate < issueDate || issueDate > dateInRiyadh()
       || (collected && (!validDate(paymentDate) || paymentDate > dateInRiyadh()))
      || (isHistorical && originalInvoiceNumber.trim().length > 100)
      || lines.length < 1 || lines.length > 100
      || lines.some(line => !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) < 1
        || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) <= 0 || Math.round(Number(line.unitPrice) * 100) !== Number(line.unitPrice) * 100
        || (isHistorical ? !line.productId && (!line.productName.trim() || line.productName.trim().length > 200) : !line.productId))) {
      setError(t('تحقق من الشركة والتواريخ وبنود الفاتورة. يجب إدخال كمية وسعر صالحين لكل بند.', 'Check the company, dates, and invoice lines. Each line needs a valid quantity and unit price.'));
      return;
    }
    if (!sellerConfiguration?.available || !sellerConfiguration.sellerName || !sellerConfiguration.sellerVatNumber) {
      setError(t('لا يمكن الحفظ دون بيانات بائع موثوقة. تحقق من إعدادات البائع ثم أعد المحاولة.', 'Saving is disabled because verified seller details are unavailable. Check seller configuration and retry.'));
      return;
    }
    if (contractsLoading || filesLoading || contractsError || filesError) {
      setError(t('تعذر التحقق من العقود المرتبطة. حاول مجدداً قبل إصدار الفاتورة.', 'Could not verify linked contracts. Retry before issuing the invoice.'));
      return;
    }
    if (missingSelectedSource) {
      setError(t('المصدر المحدد لم يعد متاحاً. اختر عقداً معتمداً أو أزل الاختيار صراحةً.', 'The selected source is no longer available. Select an approved source or explicitly choose no contract.'));
      return;
    }
    if (pendingUploadedFiles.length && !selectedContract) {
      setError(t('يوجد ملف عقد لهذه الشركة بانتظار اعتماد الشروط. اعتمد الشروط قبل الإصدار أو اختر مصدراً معتمداً.', 'An uploaded contract for this company is awaiting approved terms. Approve the terms or select an approved source before issuing.'));
      return;
    }
    if (isGulfContract && (!validCountryCode || countryCode === 'SA')) {
      setError(t('عقد الخليج يتطلب رمز دولة صالحاً غير سعودي للشركة.', 'A Gulf contract requires a valid non-Saudi company country code.'));
      return;
    }
    if (isSaudiContract && validCountryCode && countryCode !== 'SA') {
      setError(t('عقد المملكة العربية السعودية يتطلب أن تكون دولة الشركة SA.', 'A Saudi contract requires the company country to be SA.'));
      return;
    }
    if (!Number.isFinite(discountPercent) || discountPercent < 0 ||
       discountPercent > 100 || Math.round(discountPercent * 100) !== discountPercent * 100 ||
       (discountChanged && (overrideReason.trim().length < 10 || overrideReason.trim().length > 500))) {
      setError(t('الخصم الاستثنائي يحتاج نسبة بين 0 و100 وسبباً مكتوباً من 10 إلى 500 حرف.', 'A discount override requires a percentage from 0 to 100 and a written reason of 10–500 characters.'));
      return;
    }
    setPending(true);
    try {
      const data = {
        showShipping,
        creationKey,
        issueDate,
        dueDate,
        distributorId: Number(distributorId),
        ...(selectedContract?.contractId ? { contractId: selectedContract.contractId } : {}),
        ...(selectedContract?.uploadedContractFileId ? { uploadedContractFileId: selectedContract.uploadedContractFileId } : {}),
         ...(discountChanged ? { discountOverride: { percent: discountPercent, reason: overrideReason.trim() } } : {}),
        ...(isHistorical && originalInvoiceNumber.trim() ? { originalInvoiceNumber: originalInvoiceNumber.trim() } : {}),
        collected,
        ...(collected ? { paymentDate, paymentMethod } : {}),
        items: lines.map(line => isHistorical
          ? line.productId
            ? { productId: Number(line.productId), ...(products?.find(product => String(product.id) === line.productId)?.isActive === false ? { productName: line.productName.trim() } : {}), quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) }
            : { productName: line.productName.trim(), sku: line.sku || undefined, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) }
          : { productId: Number(line.productId), quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) }),
      } satisfies CompanyInvoiceInput;
      const result = await createInvoice.mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getAdminListInvoicesQueryKey() });
      toast({
        title: isHistorical ? t('تم تسجيل الفاتورة السابقة', 'Prior invoice recorded') : t('تم إنشاء فاتورة الشركة', 'Company invoice created'),
        description: formatInvoiceNumber(result?.invoiceNumber),
      });
      setOpen(false);
      reset();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      if (message.includes('Reconciliation required:')) {
        setError(`${t('يلزم مراجعة الفاتورة أو التحصيل مع السجلات السابقة قبل الحفظ. تعارض:', 'Review the invoice or collection against existing records before saving. Conflict:')} ${message.split('Reconciliation required:')[1].trim()}`);
      } else if (message.includes('Creation key belongs to a different') || message.includes('Repeated historical snapshot')) {
        setError(t('تعارضت هذه العملية مع فاتورة أو تحصيل سابق؛ راجع السجل ثم أعد المحاولة.', 'This operation conflicts with a prior invoice or collection. Review the records before trying again.'));
      } else {
        setError(message || t('تعذر إنشاء الفاتورة', 'Unable to create invoice'));
      }
    } finally {
      setPending(false);
    }
  };

  const queryError = distributorsError || productsError;
  return (
    <Dialog open={open} onOpenChange={next => { if (pending && !next) return; setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-company-invoice"><Plus className="me-2 h-4 w-4" />{t('إضافة فاتورة', 'Add Invoice')}</Button>
      </DialogTrigger>
      <DialogContent dir={lang === 'ar' ? 'rtl' : 'ltr'} className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto">
        <DialogHeader className={lang === 'ar' ? 'text-right' : 'text-left'}>
          <DialogTitle>{t('إضافة فاتورة شركة', 'Add Company Invoice')}</DialogTitle>
          <p className="text-sm text-muted-foreground">{isHistorical
            ? t('تسجيل مرجعي لفاتورة سابقة؛ لن يصدر النظام فاتورة ضريبية جديدة أو يغيّر المخزون.', 'Internal record of a prior invoice; this does not issue a new tax invoice or change inventory.')
            : t('سيحسب النظام الإجماليات والضريبة وهوية البائع عند الحفظ.', 'Totals, tax, and seller identity are calculated by the system when saved.')}</p>
        </DialogHeader>
        <fieldset disabled={pending} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company-invoice-issue-date">{t('تاريخ الإصدار', 'Issue date')}</Label>
              <Input id="company-invoice-issue-date" data-testid="input-company-invoice-issue-date" type="date" value={issueDate} onChange={event => { rotateCreationKey(); setIssueDate(event.target.value); }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-invoice-due-date">{t('تاريخ الاستحقاق', 'Due date')}</Label>
              <Input id="company-invoice-due-date" data-testid="input-company-invoice-due-date" type="date" value={dueDate} onChange={event => { rotateCreationKey(); setDueDate(event.target.value); }} />
            </div>
            <div className="space-y-2">
              <Label>{t('الشركة', 'Company')}</Label>
              <Select value={distributorId} onValueChange={value => { rotateCreationKey(); setDistributorId(value); setContractKey(''); setOverridePercent(''); setOverrideReason(''); }}>
                <SelectTrigger data-testid="select-company-invoice-distributor"><SelectValue placeholder={t('اختر الشركة', 'Select company')} /></SelectTrigger>
                <SelectContent>{(distributors ?? []).map(item => <SelectItem key={item.id} value={String(item.id)}>{item.companyName}</SelectItem>)}</SelectContent>
              </Select>
              {distributorsLoading && <p className="text-xs text-muted-foreground">{t('جاري تحميل الشركات...', 'Loading companies...')}</p>}
            </div>
            {isHistorical && <div className="space-y-2">
              <Label htmlFor="company-invoice-original-number">{t('رقم الفاتورة الأصلي (اختياري)', 'Original invoice number (optional)')}</Label>
              <Input id="company-invoice-original-number" data-testid="input-company-invoice-original-number" value={originalInvoiceNumber} maxLength={100} onChange={event => { rotateCreationKey(); setOriginalInvoiceNumber(event.target.value); }} />
              <p className="text-xs text-muted-foreground">{t('سيُعرض كمرجع داخلي منفصل عن رقم الفاتورة المسجل في النظام.', 'Shown as an internal reference, separate from the invoice number recorded in this system.')}</p>
            </div>}
            <div className="space-y-2 sm:col-span-2">
              <Label>{t('العقد أو الملف المعتمد (اختياري)', 'Contract or approved file (optional)')}</Label>
              {isHistorical && <p className="text-xs text-muted-foreground">{t('يظهر العقد المعتمد كمرجع لهذا التسجيل حتى لو سبق تاريخ الفاتورة تاريخ العقد؛ لا يعني ذلك أنه كان سارياً حينها ولا يغير شروطه.', 'The approved contract is a reference for this prior record even when the invoice predates it; it is not a claim that it was effective then and its terms are unchanged.')}</p>}
              {contractsLoading || filesLoading ? <p className="text-sm text-muted-foreground">{t('جاري تحميل العقود...', 'Loading contracts...')}</p> : contractsError || filesError
                ? <p role="alert" className="text-sm text-destructive">{t('تعذر تحميل العقود والملفات المرفوعة.', 'Could not load contracts and uploaded files.')}</p>
                : <Select value={contractKey || 'none'} onValueChange={value => { rotateCreationKey(); setContractKey(value === 'none' ? '' : value); setOverridePercent(''); setOverrideReason(''); }} disabled={!distributorId}>
                  <SelectTrigger data-testid="select-company-invoice-contract"><SelectValue placeholder={t('بدون عقد', 'No contract')} /></SelectTrigger>
                  <SelectContent><SelectItem value="none">{t('بدون عقد', 'No contract')}</SelectItem>{contractOptions.map(option => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}</SelectContent>
                </Select>}
              {missingSelectedSource && <p role="alert" className="text-sm text-destructive">{t('المصدر المحدد لم يعد متاحاً؛ أعد اختياره أو اختر بدون عقد.', 'Selected source is unavailable; select another or explicitly choose no contract.')}</p>}
              {periodWarning && <p role="alert" data-testid="warning-company-invoice-contract-period" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-900">{periodWarning === 'before'
                ? t(`تاريخ الفاتورة يسبق بدء العقد (${selectedContract?.startDate}). هذا مرجع فقط ولا يثبت سريان العقد حينها.`, `Invoice date is before the contract starts (${selectedContract?.startDate}). This is a reference only, not proof it was effective then.`)
                : t(`تاريخ الفاتورة بعد انتهاء العقد (${selectedContract?.endDate}). هذا مرجع فقط ولا يثبت سريان العقد حينها.`, `Invoice date is after the contract ends (${selectedContract?.endDate}). This is a reference only, not proof it was effective then.`)}</p>}
              {pendingUploadedFiles.length > 0 && <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-800">{t(
                `يوجد ${pendingUploadedFiles.length} ملف عقد بانتظار اعتماد الشروط (${pendingUploadedFiles.map(file => file.fileName).join('، ')}).`,
                `${pendingUploadedFiles.length} uploaded contract file(s) await terms approval (${pendingUploadedFiles.map(file => file.fileName).join(', ')}).`,
              )}</p>}
            </div>
            <div className="space-y-3 sm:col-span-2 rounded-md border p-3">
              <p className="text-sm">{t(`خصم العقد: ${selectedContract?.discountPercent ?? 0}% (لا يُعدل العقد)`, `Contract discount: ${selectedContract?.discountPercent ?? 0}% (contract remains unchanged)`)}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="company-invoice-override-percent">{t('خصم الفاتورة (%)', 'Invoice discount (%)')}</Label>
                  <Input id="company-invoice-override-percent" data-testid="input-company-invoice-override-percent" type="number" min="0" max="100" step="0.01" value={overridePercent === '' ? String(contractDiscount) : overridePercent} onChange={event => { rotateCreationKey(); setOverridePercent(event.target.value); }} />
                </div>
                <div className="space-y-1.5"><Label htmlFor="company-invoice-override-reason">{discountChanged ? t('سبب الاستثناء (إلزامي)', 'Override reason (required)') : t('سبب الاستثناء (عند تغيير النسبة فقط)', 'Override reason (only if rate changes)')}</Label>
                  <Input id="company-invoice-override-reason" data-testid="input-company-invoice-override-reason" maxLength={500} required={discountChanged} value={overrideReason} onChange={event => { rotateCreationKey(); setOverrideReason(event.target.value); }} />
                </div>
              </div>
            </div>
          </div>

          <div className={`rounded-md border p-3 text-sm ${sellerConfiguration ? 'bg-muted/20' : 'border-destructive/50 bg-destructive/5'}`} data-testid="company-invoice-seller-summary">
            <p className="font-medium">{t('بيانات البائع المستخدمة عند الإصدار', 'Seller identity used for issuance')}</p>
            {sellerConfigurationQuery.isLoading
              ? <p className="mt-1 text-muted-foreground">{t('جاري تحميل إعدادات البائع...', 'Loading seller configuration...')}</p>
              : sellerConfiguration?.available && sellerConfiguration.sellerName && sellerConfiguration.sellerVatNumber
                ? <p className="mt-1 text-muted-foreground">{sellerConfiguration.sellerName} · {t('الرقم الضريبي', 'VAT')}: <span dir="ltr" className="font-mono">{sellerConfiguration.sellerVatNumber}</span></p>
                : <p role="alert" data-testid="warning-company-invoice-seller-unavailable" className="mt-1 text-destructive">{t('تعذر تحميل بيانات البائع الموثوقة. لا يمكن حفظ الفاتورة حتى تتوفر بيانات اسم البائع ورقمه الضريبي.', 'Verified seller details are unavailable. The invoice cannot be saved until the seller name and VAT number can be loaded.')}{sellerConfigurationQuery.error?.message ? ` ${sellerConfigurationQuery.error.message}` : ''}</p>}
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label>{isHistorical ? t('البنود كما تظهر في الفاتورة السابقة', 'Lines as shown on the prior invoice') : t('بنود الفاتورة', 'Invoice items')}</Label>
              <Button type="button" data-testid="button-add-company-invoice-line" variant="outline" size="sm" disabled={lines.length >= 100} onClick={() => { rotateCreationKey(); setLines(current => [...current, blankLine()]); }}><Plus className="me-1 h-4 w-4" />{t('إضافة بند', 'Add item')}</Button>
            </div>
            {lines.map((line, index) => <div key={line.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_110px_140px_40px]">
              <Select value={isHistorical && line.manualSnapshot ? '__manual__' : line.productId} onValueChange={value => {
                if (value === '__manual__') {
                  updateLine(line.id, { productId: '', productName: '', sku: '', manualSnapshot: true });
                  return;
                }
                const product = products?.find(item => String(item.id) === value);
                updateLine(line.id, {
                  productId: value,
                   productName: product ? (product.invoiceNameAr || product.nameAr) : '',
                  sku: product?.sku ?? '',
                  manualSnapshot: false,
                  unitPrice: product ? String(product.price) : '',
                });
              }}>
                <SelectTrigger data-testid={`select-company-invoice-product-${index}`}><SelectValue placeholder={productsLoading ? t('جاري تحميل المنتجات...', 'Loading products...') : t('اختر المنتج', 'Select product')} /></SelectTrigger>
                <SelectContent>
                  {isHistorical && <SelectItem value="__manual__">{t('منتج غير موجود في السجل', 'Product missing from catalog')}</SelectItem>}
                  {availableProducts.map(product => <SelectItem key={product.id} value={String(product.id)} disabled={lines.some(other => other.id !== line.id && other.productId === String(product.id))}>{lang === 'ar' ? product.invoiceNameAr || product.nameAr : product.invoiceNameEn || product.nameEn}{!product.isActive ? ` · ${t('متوقف', 'Discontinued')}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
              {isHistorical && (line.manualSnapshot || (products ?? []).some(product => String(product.id) === line.productId && !product.isActive)) && <Input
                aria-label={t('اسم المنتج في الفاتورة الأصلية', 'Product name on original invoice')}
                data-testid={`input-historical-product-name-${index}`}
                value={line.productName}
                maxLength={200}
                placeholder={t('اسم المنتج الأصلي', 'Original product name')}
                onChange={event => updateLine(line.id, { productName: event.target.value })}
              />}
              <Input data-testid={`input-company-invoice-quantity-${index}`} type="number" min={1} step={1} value={line.quantity} onChange={event => updateLine(line.id, { quantity: event.target.value })} aria-label={t('الكمية', 'Quantity')} />
              <Input data-testid={`input-company-invoice-unit-price-${index}`} type="number" min={0.01} step={0.01} value={line.unitPrice} onChange={event => updateLine(line.id, { unitPrice: event.target.value })} aria-label={t('سعر الوحدة', 'Unit price')} />
              <Button type="button" variant="ghost" size="icon" aria-label={t('حذف البند', 'Remove line')} disabled={lines.length === 1} onClick={() => { rotateCreationKey(); setLines(current => current.filter(item => item.id !== line.id)); }}><Trash2 className="h-4 w-4" /></Button>
            </div>)}
          </section>

          <section className="rounded-lg border bg-muted/20 p-4" data-testid="company-invoice-totals-preview">
            <dl className="divide-y divide-border/70 text-sm">
              <div className="flex items-center justify-between gap-4 py-2 first:pt-0">
                <dt>{t('الإجمالي قبل الخصم:', 'Total before discount:')}</dt>
                <dd className="shrink-0 font-semibold tabular-nums"><Money value={totals.gross} lang={lang} fractionDigits={2} /></dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <dt>{t('الخصم', 'Discount')} ({Number.isFinite(discountPercent) ? discountPercent : 0}%):</dt>
                <dd className="shrink-0 font-semibold tabular-nums"><Money value={-totals.discount} lang={lang} fractionDigits={2} /></dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <dt>{t('الإجمالي بعد الخصم:', 'Total after discount:')}</dt>
                <dd className="shrink-0 font-semibold tabular-nums"><Money value={totals.total} lang={lang} fractionDigits={2} /></dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <dt>{t(`ضريبة القيمة المضافة (${vatRate}%):`, `VAT (${vatRate}%):`)}</dt>
                <dd className="shrink-0 font-semibold tabular-nums"><Money value={totals.vat} lang={lang} fractionDigits={2} /></dd>
              </div>
              <div className="flex items-center justify-between gap-4 pt-3 text-base font-bold text-primary">
                <dt>{t('الإجمالي المستحق:', 'Amount due:')}</dt>
                <dd className="shrink-0 tabular-nums"><Money value={totals.total} lang={lang} fractionDigits={2} /></dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t(
              'الأسعار شاملة الضريبة؛ مبلغ الضريبة موضح ضمن الإجمالي بعد الخصم ولا يُضاف إليه مرة أخرى. المبالغ تقديرية ويعيد النظام حسابها عند الحفظ.',
              'Prices include VAT; the tax shown is already part of the total after discount, not added again. The system recalculates the final amounts on save.',
            )}</p>
          </section>

          <section className="space-y-3 rounded-md border p-4">
            <button type="button" data-testid="toggle-company-invoice-collected" aria-pressed={collected} onClick={() => { rotateCreationKey(); setCollected(value => !value); }} className="flex items-center gap-2 text-sm font-medium">
              <span className={`h-4 w-4 rounded border ${collected ? 'border-primary bg-primary' : 'border-input'}`} aria-hidden="true">{collected && <span className="block text-center text-xs text-primary-foreground">✓</span>}</span>
              {t('تم تحصيل الفاتورة بالكامل', 'Invoice collected in full')}
            </button>
            {collected && <div className="grid gap-3 sm:grid-cols-2">
               <div className="space-y-1.5"><Label htmlFor="company-invoice-payment-date">{t('تاريخ التحصيل', 'Collection date')}</Label><Input id="company-invoice-payment-date" data-testid="input-company-invoice-payment-date" type="date" max={today} value={paymentDate} onChange={event => { rotateCreationKey(); setPaymentDate(event.target.value); }} /></div>
              <div className="space-y-1.5"><Label>{t('طريقة الدفع', 'Payment method')}</Label><Select value={paymentMethod} onValueChange={value => { if (value === 'cash' || value === 'bank_transfer') { rotateCreationKey(); setPaymentMethod(value); } }}><SelectTrigger data-testid="select-company-invoice-payment-method"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bank_transfer">{t('تحويل بنكي', 'Bank transfer')}</SelectItem><SelectItem value="cash">{t('نقداً', 'Cash')}</SelectItem></SelectContent></Select></div>
            </div>}
          </section>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" data-testid="company-invoice-show-shipping" className="h-4 w-4" disabled={pending} checked={showShipping} onChange={e => { rotateCreationKey(); setShowShipping(e.target.checked); }} />{t('إظهار الشحن في الفاتورة', 'Show shipping on invoice')}</label>
            <p className="text-xs text-muted-foreground">{t('مخفي افتراضياً. عند التفعيل يظهر عنوان العميل إذا لم توجد شحنة مرتبطة.', 'Hidden by default. When enabled, the customer address is used if no shipment is linked.')}</p>
          </div>
          {error && <p role="alert" data-testid="company-invoice-error" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <Button data-testid="button-submit-company-invoice" className="w-full" onClick={submit} disabled={pending || queryError || productsLoading || distributorsLoading || contractsLoading || filesLoading || !sellerConfiguration?.available}>
            {pending ? t('جاري الحفظ...', 'Saving...') : isHistorical ? t('حفظ التسجيل الداخلي', 'Save internal record') : t('حفظ وإصدار الفاتورة', 'Save and issue invoice')}
          </Button>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}