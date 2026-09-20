import { useMemo, useState, useRef } from 'react';
import { Coins, Package, Search, Plus, Trash2, Clock, FileStack, type LucideIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminGiftingIssuesQueryKey,
  getGetAdminGiftingIssuesIdQueryKey,
  useAdminListInventory,
  useCreateAdminGiftingIssue,
  useGetAdminGiftingIssues,
  useGetAdminGiftingIssuesId,
} from '@workspace/api-client-react';
import type { GiftingIssue, GiftingIssueCategory, GiftingIssueInputCategory } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { giftingIssueLabels as labels, issueUses } from './gifting-issues-config';
import { formatCurrency, formatInteger } from '@/lib/formatters';

type Line = { productId: string; quantity: string };

const initialForm = {
  lines: [{ productId: '', quantity: '1' }] as Line[],
  category: '' as GiftingIssueInputCategory | '',
  issueDate: '',
  recipientName: '',
  occasion: '',
  reason: '',
};

export default function AdminGiftingIssues() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<GiftingIssueCategory | undefined>();
  const [selected, setSelected] = useState<number | null>(null);
  const [form, setForm] = useState(initialForm);

  const params = { search: search || undefined, category };
  const { data, isLoading, error } = useGetAdminGiftingIssues(params, { query: { retry: false, queryKey: getGetAdminGiftingIssuesQueryKey(params) } });
  const detail = useGetAdminGiftingIssuesId(selected ?? 0, { query: { enabled: selected !== null, queryKey: getGetAdminGiftingIssuesIdQueryKey(selected ?? 0) } });
  const { data: inventory } = useAdminListInventory({ stockStatus: 'all', sort: 'name_asc' });
  const mutation = useCreateAdminGiftingIssue();
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const lastAttemptedFormRef = useRef('');

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const selectedProducts = useMemo(() => {
    if (!inventory) return [];
    return form.lines
      .map(line => inventory.items.find(item => item.id === Number(line.productId)))
      .filter(Boolean);
  }, [inventory, form.lines]);

  const productNeedsCost = selectedProducts.some(product => product && Number(product.averageCost) <= 0);
  const allLinesHaveProduct = form.lines.every(l => l.productId !== '');
  const hasDuplicates = new Set(form.lines.map(l => l.productId).filter(Boolean)).size !== form.lines.filter(l => l.productId).length;

  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, { productId: '', quantity: '1' }] }));

  const updateLine = (index: number, field: keyof Line, value: string) => {
    const newLines = [...form.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setForm(f => ({ ...f, lines: newLines }));
  };

  const removeLine = (index: number) => {
    setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.category || !allLinesHaveProduct) {
      toast({ title: t('تأكد من تعبئة جميع الحقول واختيار المنتجات', 'Ensure all fields are filled and products are selected'), variant: 'destructive' });
      return;
    }

    if (hasDuplicates) {
      toast({ title: t('لا يمكن تكرار نفس المنتج، يرجى دمج الكمية', 'Cannot duplicate the same product, please combine the quantity'), variant: 'destructive' });
      return;
    }

    if ((form.category === 'DAMAGED' || form.category === 'OTHER') && !form.reason.trim()) {
      toast({ title: t('يجب كتابة السبب لهذا الاستخدام', 'A reason is required for this use'), variant: 'destructive' });
      return;
    }

    const linesValid = form.lines.every(l => {
      const q = Number(l.quantity);
      return Number.isSafeInteger(q) && q > 0;
    });

    if (!linesValid) {
      toast({ title: t('أدخل كمية موجبة صحيحة لجميع المنتجات', 'Enter a valid positive quantity for all products'), variant: 'destructive' });
      return;
    }

    if (productNeedsCost) {
      toast({
        title: t('يجب إدخال تكلفة الوحدة أولاً', 'Enter the unit cost first'),
        description: t(
          'من المخزون افتح تفاصيل المنتج، واختر «تسوية إلى رصيد»، ثم أدخل الرصيد الحالي وتكلفة شراء أو تصنيع الوحدة.',
          'In Inventory, open the product details, choose “Set balance”, then enter the current balance and the unit purchase or manufacturing cost.',
        ),
        variant: 'destructive',
      });
      return;
    }

    const validLines = form.lines.map(l => ({
      productId: Number(l.productId),
      quantity: Number(l.quantity)
    }));

    const currentFormState = JSON.stringify(form);
    if (lastAttemptedFormRef.current !== currentFormState) {
      idempotencyKeyRef.current = crypto.randomUUID();
      lastAttemptedFormRef.current = currentFormState;
    }

    mutation.mutate({ data: {
      category: form.category as GiftingIssueInputCategory,
      lines: validLines,
      idempotencyKey: idempotencyKeyRef.current,
      ...(form.issueDate ? { issueDate: form.issueDate } : {}),
      ...(form.recipientName.trim() ? { recipientName: form.recipientName.trim() } : {}),
      ...(form.occasion.trim() ? { occasion: form.occasion.trim() } : {}),
      ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
    } }, {
      onSuccess: async () => {
        setForm(initialForm);
        lastAttemptedFormRef.current = '';
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/admin/gifting-issues'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/admin/inventory'] }),
        ]);
        toast({ title: t('تم تسجيل الحركات بنجاح', 'Movements recorded successfully') });
      },
      onError: (mutationError: unknown) => {
        const err = mutationError as { data?: { error?: string }; message?: string };
        const message = err?.data?.error ?? err?.message ?? '';
        const missingCost = message.includes('positive average cost');
        toast({
          title: missingCost ? t('يجب إدخال تكلفة الوحدة أولاً', 'Enter the unit cost first') : t('تعذر تنفيذ العملية', 'Operation failed'),
          description: missingCost
            ? t(
              'من المخزون افتح تفاصيل المنتج، واختر «تسوية إلى رصيد»، ثم أدخل الرصيد الحالي وتكلفة الشراء.',
              'In Inventory, open product details, choose “Set balance”, and enter current balance and cost.',
            )
            : message,
          variant: 'destructive',
        });
      },
    });
  };

  if (error) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-destructive text-sm font-medium">{t('لا تملك صلاحية عرض هذا السجل.', 'You do not have permission to view this log.')}</div>;

  return (
    <div className="space-y-6 pb-8">
      <header>
        <div className="flex items-center gap-3">
          <FileStack className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">{t('سجل حركة المنتجات', 'Product Movement Log')}</h1>
        </div>
        <p className="mt-2 text-muted-foreground text-[14.5px] max-w-3xl leading-relaxed">
          {t('تسجيل حركات المنتجات كالهدايا، العينات، التالف، وأي منصرفات أخرى مع تقييد تكلفتها الفعلية من المخزون.', 'Record product movements such as gifts, samples, damaged items, and other issues while posting their actual cost from inventory.')}
        </p>
      </header>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
          <CardTitle className="text-lg">{t('عملية جديدة', 'New movement')}</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="grid gap-6">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">{t('التصنيف', 'Category')} *</Label>
                <Select value={form.category} onValueChange={(value) => setForm(f => ({ ...f, category: value as GiftingIssueInputCategory }))}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={t('اختر التصنيف', 'Select category')} />
                  </SelectTrigger>
                  <SelectContent>
                    {issueUses.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {lang === 'ar' ? item.ar : item.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">{t('التاريخ (اختياري)', 'Date (optional)')}</Label>
                <Input className="h-10 text-left" lang="en" dir="ltr" type="date" value={form.issueDate} onChange={(e) => setForm(f => ({ ...f, issueDate: e.target.value }))} />
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">{t('المرسل إليه (اختياري)', 'Recipient (optional)')}</Label>
                <Input className="h-10" value={form.recipientName} onChange={(e) => setForm(f => ({ ...f, recipientName: e.target.value }))} />
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">{t('المناسبة (اختياري)', 'Occasion (optional)')}</Label>
                <Input className="h-10" value={form.occasion} onChange={(e) => setForm(f => ({ ...f, occasion: e.target.value }))} />
              </div>

              {(form.category === 'DAMAGED' || form.category === 'OTHER') && (
                <div className="md:col-span-2 lg:col-span-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-destructive mb-1.5 block">{t('سبب الاستخدام (مطلوب)', 'Reason for use (required)')} *</Label>
                  <Input
                    className="h-10 border-destructive/40 focus-visible:ring-destructive/30"
                    value={form.reason}
                    onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder={t('اكتب السبب هنا...', 'Write the reason here...')}
                  />
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
                <h3 className="font-semibold text-[14px]">{t('المنتجات المشمولة', 'Included Products')}</h3>
                <Button type="button" variant="secondary" size="sm" className="h-8 text-xs font-medium" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5 mr-1.5 rtl:ml-1.5 rtl:mr-0" />
                  {t('إضافة منتج', 'Add Product')}
                </Button>
              </div>

              <div className="p-4 space-y-3">
                {form.lines.map((line, index) => {
                  const product = inventory?.items.find((item) => item.id === Number(line.productId));
                  const productNeedsCost = Boolean(product && Number(product.averageCost) <= 0);
                  const isDuplicate = form.lines.some((l, i) => i !== index && l.productId && l.productId === line.productId);

                  return (
                    <div key={index} className="flex flex-col sm:flex-row gap-3 p-3 bg-background rounded-lg border border-border/50 items-start sm:items-center shadow-sm">
                      <div className="flex-1 w-full">
                        <Select value={line.productId} onValueChange={(value) => updateLine(index, 'productId', value)}>
                          <SelectTrigger className={`h-10 ${isDuplicate ? 'border-destructive/60 ring-destructive/20' : ''}`}>
                            <SelectValue placeholder={t('اختر المنتج', 'Select product')} />
                          </SelectTrigger>
                          <SelectContent>
                            {inventory?.items.map((item) => (
                              <SelectItem key={item.id} value={String(item.id)}>
                                 {lang === 'ar' ? item.nameAr : item.nameEn} — {t('المتاح', 'Available')}: {formatInteger(item.stockQuantity, lang)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isDuplicate && <p className="mt-1 text-[11px] font-medium text-destructive">{t('هذا المنتج مكرر', 'This product is duplicated')}</p>}
                        {product && !isDuplicate && (
                          <p className={`mt-1.5 text-[11.5px] ${productNeedsCost ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                             {productNeedsCost ? t('لا توجد تكلفة للوحدة. أدخلها من المخزون.', 'No unit cost. Enter it from Inventory.') : <>{t('المتاح', 'Available')}: <span className="font-mono">{formatInteger(product.stockQuantity, lang)}</span> · {t('متوسط التكلفة', 'Avg Cost')}: <span className="font-mono">{formatCurrency(product.averageCost, lang)}</span> SAR</>}
                          </p>
                        )}
                      </div>

                      <div className="w-full sm:w-32 flex-shrink-0">
                        <Input
                          type="number"
                          min="1"
                          max={product?.stockQuantity}
                          step="1"
                          className="h-10 font-mono text-center"
                          value={line.quantity}
                          onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                          placeholder={t('الكمية', 'Qty')}
                        />
                      </div>

                      {form.lines.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => removeLine(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                size="lg"
                disabled={mutation.isPending || !allLinesHaveProduct || productNeedsCost || hasDuplicates}
                className="w-full sm:w-auto px-10 font-bold"
              >
                {mutation.isPending ? t('جاري التسجيل...', 'Recording...') : t('تسجيل الحركات', 'Record movements')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
         <SummaryCard icon={FileStack} label={t('عدد العمليات', 'Total Records')} value={formatInteger(summary?.rows, lang)} />
         <SummaryCard icon={Package} label={t('إجمالي الوحدات', 'Total Units')} value={formatInteger(summary?.units, lang)} />
         <SummaryCard icon={Coins} label={t('إجمالي التكلفة', 'Total Cost')} value={`${formatCurrency(summary?.totalCost, lang)} SAR`} />
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute end-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pe-9 h-10"
              placeholder={t('ابحث باسم الشخص أو المنتج...', 'Search person or product...')}
            />
          </div>
          <Select value={category ?? 'all'} onValueChange={(value) => setCategory(value === 'all' ? undefined : value as GiftingIssueCategory)}>
            <SelectTrigger className="sm:w-64 h-10">
              <SelectValue placeholder={t('كل التصنيفات', 'All categories')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('كل التصنيفات', 'All categories')}</SelectItem>
              {Object.entries(labels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{lang === 'ar' ? label.ar : label.en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="bg-muted/10 border-b border-border/40 py-4">
          <CardTitle className="text-lg flex items-center justify-between">
            {t('العمليات المسجلة', 'Recorded movements')}
            <Badge variant="secondary" className="font-mono">{rows.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary mb-3"></div>
              {t('جاري التحميل...', 'Loading...')}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileStack className="h-10 w-10 opacity-20 mx-auto mb-3" />
              {t('لا توجد سجلات مطابقة', 'No matching records')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[120px]">{t('التاريخ', 'Date')}</TableHead>
                    <TableHead>{t('التصنيف', 'Category')}</TableHead>
                    <TableHead>{t('المنتج', 'Product')}</TableHead>
                    <TableHead>{t('الشخص / السبب', 'Person / Reason')}</TableHead>
                    <TableHead className="text-center w-[80px]">{t('الكمية', 'Qty')}</TableHead>
                    <TableHead className="text-right rtl:text-left">{t('التكلفة', 'Cost')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer group hover:bg-muted/30" onClick={() => setSelected(row.id)}>
                      <TableCell className="font-medium text-xs whitespace-nowrap">
                        {new Date(row.issueDate).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal bg-background/50">
                          {labels[row.category]?.[lang] ?? row.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium truncate max-w-[200px] text-sm" title={row.descriptionSnapshot}>{row.descriptionSnapshot}</div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{row.barcode}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{row.recipientName || '—'}</div>
                        {(row.occasion || row.reason) && (
                          <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[180px]">
                            {row.reason || row.occasion}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                         {formatInteger(row.quantity, lang)}
                      </TableCell>
                      <TableCell className="text-right rtl:text-left font-mono font-medium">
                         {formatCurrency(row.totalCost, lang)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-xl">{t('تفاصيل العملية', 'Movement details')}</DialogTitle>
          </DialogHeader>
          {detail.data ? (
            <Detail row={detail.data} lang={lang} />
          ) : (
            <div className="h-40 flex items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary"></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <Card className="border-border/60 shadow-sm overflow-hidden group">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="p-3 rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
          <div className="text-2xl font-bold font-mono tracking-tight">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Detail({ row, lang }: { row: GiftingIssue; lang: 'ar' | 'en' }) {
  return (
    <div className="space-y-4 text-sm mt-2">
      <div className="flex justify-between items-center pb-3 border-b border-border/40">
        <b className="text-base text-foreground">{row.recipientName || '—'}</b>
        <Badge variant="secondary" className="px-2.5 py-0.5">{labels[row.category]?.[lang] ?? row.category}</Badge>
      </div>

      <div>
        <div className="font-semibold text-foreground text-[15px]">{row.descriptionSnapshot}</div>
        <div className="text-xs text-muted-foreground mt-1 font-mono">{row.barcode}</div>
      </div>

      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Clock className="h-3.5 w-3.5" />
        {new Date(row.issueDate).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { dateStyle: 'long', timeStyle: 'short' })}
      </div>

      {(row.occasion || row.reason || row.comment) && (
        <div className="rounded-xl bg-muted/40 border border-border/60 p-4 space-y-3 mt-4">
          {row.occasion && <div><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{lang === 'ar' ? 'المناسبة' : 'Occasion'}</span><div className="mt-1 text-sm">{row.occasion}</div></div>}
          {row.reason && <div><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{lang === 'ar' ? 'السبب' : 'Reason'}</span><div className="mt-1 text-sm">{row.reason}</div></div>}
          {row.comment && <div><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{lang === 'ar' ? 'التعليق' : 'Comment'}</span><div className="mt-1 text-sm">{row.comment}</div></div>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-border/40">
        <div className="bg-muted/20 rounded-lg p-3 text-center border border-border/50">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{lang === 'ar' ? 'الكمية' : 'Quantity'}</div>
           <div className="text-xl font-bold font-mono">{formatInteger(row.quantity, lang)}</div>
        </div>
        <div className="bg-muted/20 rounded-lg p-3 text-center border border-border/50">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{lang === 'ar' ? 'التكلفة' : 'Cost'}</div>
           <div className="text-xl font-bold font-mono">{formatCurrency(row.totalCost, lang)} <span className="text-xs text-muted-foreground ml-1">SAR</span></div>
        </div>
      </div>

      {row.sourceFilename && (
        <div className="text-[11px] text-muted-foreground mt-5 text-center font-mono">
          {lang === 'ar' ? 'المصدر' : 'Source'}: {row.sourceFilename}{row.sourceRow ? ` — ${lang === 'ar' ? 'الصف' : 'Row'} ${row.sourceRow}` : ''}
        </div>
      )}
    </div>
  );
}
