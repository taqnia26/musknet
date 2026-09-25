import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { Coins, Package, Search, Plus, Trash2, Clock, FileStack, Pencil, RotateCcw, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminGiftingIssuesQueryKey,
  getGetAdminGiftingIssueQueryKey,
  getGetAdminTesterAvailabilityQueryKey,
  useAdminListInventory,
  useCreateAdminGiftingIssue,
  useDeleteAdminGiftingIssue,
  useGetAdminGiftingIssues,
  useGetAdminGiftingIssue,
  useGetAdminTesterAvailability,
  useReturnAdminGiftingIssue,
  useUpdateAdminGiftingIssue,
} from '@workspace/api-client-react';
import type { GiftingIssue, GiftingIssueCategory, GiftingIssueInputCategory } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { sortProductsForSelection } from '@/lib/product-sort';
import { countryForCity, lookupCountryForCity } from '@/lib/city-country';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { giftingIssueLabels as labels, issueUses } from './gifting-issues-config';
import { formatInteger } from '@/lib/formatters';
import { Money } from '@/components/money';

type StockSource = 'normal' | 'used_return';
type Line = { productId: string; quantity: string; stockSource: StockSource | '' };

const initialForm = {
  lines: [{ productId: '', quantity: '1', stockSource: 'normal' }] as Line[],
  category: '' as GiftingIssueInputCategory | '',
  issueDate: '',
  recipientName: '',
  city: '',
  country: '',
  occasion: '',
  reason: '',
  comment: '',
};

export default function AdminGiftingIssues() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<GiftingIssueCategory | undefined>();
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<GiftingIssue | null>(null);
  const [returning, setReturning] = useState<GiftingIssue | null>(null);
  const [returnForm, setReturnForm] = useState({ quantity: '1', condition: 'new' as 'new' | 'used' });
  const [editForm, setEditForm] = useState({ category: '' as GiftingIssueCategory | '', quantity: '', issueDate: '', recipientName: '', city: '', country: '', occasion: '', reason: '', comment: '' });
  const [form, setForm] = useState(initialForm);
  const [cityLookupPending, setCityLookupPending] = useState(false);
  const [editCityLookupPending, setEditCityLookupPending] = useState(false);

  const params = { search: search || undefined, category };
  const { data, isLoading, error } = useGetAdminGiftingIssues(params, { query: { retry: false, queryKey: getGetAdminGiftingIssuesQueryKey(params) } });
  const detail = useGetAdminGiftingIssue(selected ?? 0, { query: { enabled: selected !== null, queryKey: getGetAdminGiftingIssueQueryKey(selected ?? 0) } });
  const { data: inventory } = useAdminListInventory({ stockStatus: 'all', sort: 'name_asc' });
  const mutation = useCreateAdminGiftingIssue();
  const updateMutation = useUpdateAdminGiftingIssue();
  const deleteMutation = useDeleteAdminGiftingIssue();
  const returnMutation = useReturnAdminGiftingIssue();
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const lastAttemptedFormRef = useRef('');
  const returnIdempotencyKeyRef = useRef(crypto.randomUUID());
  const lastAttemptedReturnRef = useRef('');

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const productOptions = useMemo(() => {
    if (!inventory) return [];
    return sortProductsForSelection(inventory.items, lang);
  }, [inventory, lang]);

  const productNeedsCost = form.lines.some(line => {
    const product = inventory?.items.find(item => item.id === Number(line.productId));
    return product && line.stockSource !== 'used_return' && Number(product.averageCost) <= 0;
  });
  const allLinesHaveProduct = form.lines.every(l => l.productId !== '');
  const hasDuplicates = new Set(form.lines.filter(l => l.productId).map(l => `${l.productId}:${l.stockSource}`)).size !== form.lines.filter(l => l.productId).length;
  const isTesterMovement = form.category === 'TESTER' || form.category === 'B2B_EVALUATION';

  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, { productId: '', quantity: '1', stockSource: isTesterMovement ? '' : 'normal' }] }));

  const updateLine = (index: number, field: keyof Line, value: string) => {
    setForm(current => ({
      ...current,
      lines: current.lines.map((line, i) => i === index
        ? { ...line, [field]: value, ...(field === 'productId' && isTesterMovement ? { stockSource: '' as const } : {}) }
        : line),
    }));
  };

  const removeLine = (index: number) => {
    setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }));
  };

  const splitOpenedTesterLine = (index: number, available: number) => {
    setForm(current => {
      const line = current.lines[index];
      const requested = Number(line?.quantity);
      if (!line || line.stockSource !== 'used_return' || !Number.isSafeInteger(requested) ||
        !Number.isSafeInteger(available) || available < 0 || requested <= available) return current;
      const remainder = requested - available;
      const lines = [...current.lines];
      if (available > 0) lines[index] = { ...line, quantity: String(available) };
      else lines[index] = { ...line, quantity: String(remainder), stockSource: 'normal' };
      if (available > 0) {
        const normalIndex = lines.findIndex((item, i) => i !== index && item.productId === line.productId && item.stockSource === 'normal');
        if (normalIndex >= 0) {
          lines[normalIndex] = { ...lines[normalIndex], quantity: String(Number(lines[normalIndex].quantity) + remainder) };
        } else {
          lines.splice(index + 1, 0, { ...line, quantity: String(remainder), stockSource: 'normal' });
        }
      }
      return { ...current, lines };
    });
  };

  const updateCity = (city: string) => {
    const detectedCountry = countryForCity(city, lang);
    setForm((current) => ({
      ...current,
      city,
      ...(detectedCountry ? { country: detectedCountry } : {}),
    }));
  };

  const updateEditCity = (city: string) => {
    const detectedCountry = countryForCity(city, lang);
    setEditForm((current) => ({
      ...current,
      city,
      ...(detectedCountry ? { country: detectedCountry } : {}),
    }));
  };

  useEffect(() => {
    const city = form.city.trim();
    if (city.length < 2 || countryForCity(city, lang)) {
      setCityLookupPending(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCityLookupPending(true);
      void lookupCountryForCity(city, lang, controller.signal)
        .then((country) => {
          if (country) setForm((current) => current.city.trim() === city ? { ...current, country } : current);
        })
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn('Could not identify city country', error);
        })
        .finally(() => {
          if (!controller.signal.aborted) setCityLookupPending(false);
        });
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.city, lang]);

  useEffect(() => {
    const city = editForm.city.trim();
    if (!editing || city.length < 2 || countryForCity(city, lang)) {
      setEditCityLookupPending(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setEditCityLookupPending(true);
      void lookupCountryForCity(city, lang, controller.signal)
        .then((country) => {
          if (country) setEditForm((current) => current.city.trim() === city ? { ...current, country } : current);
        })
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn('Could not identify edit city country', error);
        })
        .finally(() => {
          if (!controller.signal.aborted) setEditCityLookupPending(false);
        });
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [editForm.city, editing, lang]);

  const openEdit = (row: GiftingIssue) => {
    setSelected(row.id);
    setEditing(row);
    setEditForm({
      category: row.category,
      quantity: String(row.quantity),
      issueDate: new Date(row.issueDate).toISOString().slice(0, 10),
      recipientName: row.recipientName ?? '',
      city: row.city ?? '',
      country: row.country ?? '',
      occasion: row.occasion ?? '',
      reason: row.reason ?? '',
      comment: row.comment ?? '',
    });
  };

  const openReturn = (row: GiftingIssue) => {
    returnIdempotencyKeyRef.current = crypto.randomUUID();
    lastAttemptedReturnRef.current = '';
    setReturning(row);
    setReturnForm({
      quantity: String(row.quantity - row.returnedQuantity),
      condition: row.stockSource === 'used_return' || row.returnCondition === 'used' ? 'used' : 'new',
    });
  };

  const saveEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !editForm.category) return;
    const quantity = Number(editForm.quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      toast({ title: t('أدخل كمية موجبة صحيحة', 'Enter a valid positive quantity'), variant: 'destructive' });
      return;
    }
    const updateData = {
      category: editForm.category,
      quantity,
      issueDate: editForm.issueDate,
      recipientName: editForm.recipientName.trim() || null,
      city: editForm.city.trim() || null,
      country: editForm.country.trim() || null,
      occasion: editForm.occasion.trim() || null,
      reason: editForm.reason.trim() || null,
      comment: editForm.comment.trim(),
    };
    updateMutation.mutate({ id: editing.id, data: updateData }, {
      onSuccess: async () => {
        setEditing(null);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/admin/gifting-issues'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/admin/inventory'] }),
        ]);
        toast({ title: t('تم تعديل الحركة بنجاح', 'Movement updated successfully') });
      },
      onError: (cause: unknown) => {
        const error = cause as { data?: { error?: string }; message?: string };
        toast({ title: t('تعذر تعديل الحركة', 'Could not update movement'), description: error.data?.error ?? error.message, variant: 'destructive' });
      },
    });
  };

  const removeMovement = (row: GiftingIssue) => {
    if (!window.confirm(t('سيتم حذف الحركة وإعادة الكمية إلى مصدر مخزونها وعكس أثرها المحاسبي. هل تريد المتابعة؟', 'This will remove the movement, restore its original stock source, and reverse its accounting effect. Continue?'))) return;
    deleteMutation.mutate({ id: row.id }, {
      onSuccess: async () => {
        if (selected === row.id) setSelected(null);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/admin/gifting-issues'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/admin/inventory'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/admin/gifting-issues/tester-availability'] }),
        ]);
        toast({ title: t('تم حذف الحركة وإعادة الكمية للمخزون', 'Movement removed and inventory restored') });
      },
      onError: (cause: unknown) => {
        const error = cause as { data?: { error?: string }; message?: string };
        toast({ title: t('تعذر حذف الحركة', 'Could not remove movement'), description: error.data?.error ?? error.message, variant: 'destructive' });
      },
    });
  };

  const submitReturn = (event: React.FormEvent) => {
    event.preventDefault();
    if (!returning) return;
    const quantity = Number(returnForm.quantity);
    const outstanding = returning.quantity - returning.returnedQuantity;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > outstanding) {
      toast({ title: t('أدخل كمية صحيحة ضمن الكمية المتبقية', 'Enter a valid quantity within the outstanding amount'), variant: 'destructive' });
      return;
    }
    if (returning.stockSource === 'used_return' && returnForm.condition === 'new') {
      toast({ title: t('التستر المفتوح يعود دائمًا لمخزون التيستر المفتوح', 'An opened tester must return to opened-tester stock'), variant: 'destructive' });
      return;
    }
    const attempt = JSON.stringify({ id: returning.id, quantity, condition: returnForm.condition });
    if (lastAttemptedReturnRef.current !== attempt) {
      returnIdempotencyKeyRef.current = crypto.randomUUID();
      lastAttemptedReturnRef.current = attempt;
    }
    returnMutation.mutate({ id: returning.id, data: {
      quantity,
      condition: returnForm.condition,
      idempotencyKey: returnIdempotencyKeyRef.current,
    } }, {
      onSuccess: async () => {
        setReturning(null);
        lastAttemptedReturnRef.current = '';
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/admin/gifting-issues'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/admin/inventory'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/admin/gifting-issues/tester-availability'] }),
        ]);
        toast({ title: t('تم استرجاع الكمية وتحديث المخزون', 'Return recorded and inventory updated') });
      },
      onError: (cause: unknown) => {
        const error = cause as { data?: { error?: string }; message?: string };
        toast({ title: t('تعذر تسجيل الاسترجاع', 'Could not record return'), description: error.data?.error ?? error.message, variant: 'destructive' });
      },
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.category || !allLinesHaveProduct) {
      toast({ title: t('تأكد من تعبئة جميع الحقول واختيار المنتجات', 'Ensure all fields are filled and products are selected'), variant: 'destructive' });
      return;
    }

    if (hasDuplicates) {
      toast({ title: t('لا يمكن تكرار نفس المنتج من نفس مصدر المخزون', 'Cannot repeat a product with the same stock source'), variant: 'destructive' });
      return;
    }

    if (isTesterMovement && form.lines.some(line => !line.stockSource)) {
      toast({ title: t('اختر مصدر المخزون لكل تستر', 'Select the stock source for each tester'), variant: 'destructive' });
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
      quantity: Number(l.quantity),
      stockSource: l.stockSource === 'used_return' ? 'used_return' as const : 'normal' as const,
    }));

    const currentFormState = JSON.stringify(form);
    if (lastAttemptedFormRef.current !== currentFormState) {
      idempotencyKeyRef.current = crypto.randomUUID();
      lastAttemptedFormRef.current = currentFormState;
    }

    const createData = {
      category: form.category as GiftingIssueInputCategory,
      lines: validLines,
      idempotencyKey: idempotencyKeyRef.current,
      ...(form.issueDate ? { issueDate: form.issueDate } : {}),
      ...(form.recipientName.trim() ? { recipientName: form.recipientName.trim() } : {}),
      ...(form.city.trim() ? { city: form.city.trim() } : {}),
      ...(form.country.trim() ? { country: form.country.trim() } : {}),
      ...(form.occasion.trim() ? { occasion: form.occasion.trim() } : {}),
      ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
      comment: form.comment.trim(),
    };
    mutation.mutate({ data: createData }, {
      onSuccess: async () => {
        setForm(initialForm);
        lastAttemptedFormRef.current = '';
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/admin/gifting-issues'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/admin/inventory'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/admin/gifting-issues/tester-availability'] }),
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
                <Select value={form.category} onValueChange={(value) => setForm(f => ({
                  ...f,
                  category: value as GiftingIssueInputCategory,
                  lines: f.lines.map(line => ({
                    ...line,
                    stockSource: value === 'TESTER' || value === 'B2B_EVALUATION'
                      ? (f.category === 'TESTER' || f.category === 'B2B_EVALUATION' ? line.stockSource : '')
                      : 'normal',
                  })),
                }))}>
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
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">{t('الاسم (اختياري)', 'Name (optional)')}</Label>
                <Input className="h-10" value={form.recipientName} onChange={(e) => setForm(f => ({ ...f, recipientName: e.target.value }))} />
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">{t('المدينة (اختياري)', 'City (optional)')}</Label>
                <Input className="h-10" value={form.city} onChange={(e) => updateCity(e.target.value)} placeholder={t('مثال: الرياض', 'Example: Riyadh')} />
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">{t('الدولة (اختياري)', 'Country (optional)')}</Label>
                <Input className="h-10" value={form.country} onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))} placeholder={cityLookupPending ? t('جارٍ تحديد الدولة...', 'Identifying country...') : t('تُعبأ تلقائيًا من المدينة', 'Filled automatically from city')} />
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">{t('المناسبة (اختياري)', 'Occasion (optional)')}</Label>
                <Input className="h-10" value={form.occasion} onChange={(e) => setForm(f => ({ ...f, occasion: e.target.value }))} />
              </div>

              {(form.category === 'DAMAGED' || form.category === 'OTHER') && (
                <div className="md:col-span-2 lg:col-span-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-destructive mb-1.5 block">{t('السبب (مطلوب)', 'Reason (required)')} *</Label>
                  <Input
                    className="h-10 border-destructive/40 focus-visible:ring-destructive/30"
                    value={form.reason}
                    onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder={t('اكتب السبب هنا...', 'Write the reason here...')}
                  />
                </div>
              )}
              <div className="md:col-span-2 lg:col-span-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">{t('ملاحظة / تعليق (اختياري)', 'Note / comment (optional)')}</Label>
                <Input
                  className="h-10"
                  maxLength={500}
                  value={form.comment}
                  onChange={(e) => setForm(f => ({ ...f, comment: e.target.value }))}
                  placeholder={t('أضف ملاحظة منفصلة عن السبب...', 'Add a note separate from the reason...')}
                />
              </div>
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
                  const productNeedsCost = Boolean(product && line.stockSource !== 'used_return' && Number(product.averageCost) <= 0);
                  const isDuplicate = form.lines.some((l, i) => i !== index && l.productId && l.productId === line.productId && l.stockSource === line.stockSource);

                  return (
                    <div key={index} className="flex flex-col sm:flex-row gap-3 p-3 bg-background rounded-lg border border-border/50 items-start sm:items-center shadow-sm">
                      <div className="flex-1 w-full">
                        <Select value={line.productId} onValueChange={(value) => updateLine(index, 'productId', value)}>
                          <SelectTrigger className={`h-10 ${isDuplicate ? 'border-destructive/60 ring-destructive/20' : ''}`}>
                            <SelectValue placeholder={t('اختر المنتج', 'Select product')} />
                          </SelectTrigger>
                          <SelectContent>
                            {productOptions.map((item) => (
                              <SelectItem key={item.id} value={String(item.id)}>
                                 {lang === 'ar' ? item.nameAr : item.nameEn} — {t('المتاح', 'Available')}: {formatInteger(item.stockQuantity, lang)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isDuplicate && <p className="mt-1 text-[11px] font-medium text-destructive">{t('هذا المنتج مكرر', 'This product is duplicated')}</p>}
                        {product && !isDuplicate && (
                          <p className={`mt-1.5 text-[11.5px] ${productNeedsCost ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                             {productNeedsCost ? t('لا توجد تكلفة للوحدة. أدخلها من المخزون.', 'No unit cost. Enter it from Inventory.') : <>{t('المخزون الرئيسي', 'Main stock')}: <span className="font-mono">{formatInteger(product.stockQuantity, lang)}</span> · {t('متوسط التكلفة', 'Avg Cost')}: <Money value={product.averageCost} lang={lang} /></>}
                          </p>
                        )}
                        {isTesterMovement && line.productId && (
                          <TesterSourceSelector
                            productId={Number(line.productId)}
                            value={line.stockSource}
                            onChange={(value) => updateLine(index, 'stockSource', value)}
                            quantity={line.quantity}
                            onSplit={(available) => splitOpenedTesterLine(index, available)}
                            lang={lang}
                          />
                        )}
                      </div>

                      <div className="w-full sm:w-32 flex-shrink-0">
                        <Input
                          type="number"
                          min="1"
                          max={line.stockSource === 'normal' ? product?.stockQuantity : undefined}
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
         <SummaryCard icon={Coins} label={t('إجمالي التكلفة', 'Total Cost')} value={<Money value={summary?.totalCost} lang={lang} />} />
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
                    <TableHead>{t('الشخص / التفاصيل', 'Person / details')}</TableHead>
                    <TableHead>{t('المدينة', 'City')}</TableHead>
                    <TableHead>{t('الدولة', 'Country')}</TableHead>
                    <TableHead className="text-center w-[80px]">{t('الكمية', 'Qty')}</TableHead>
                    <TableHead className="text-right rtl:text-left">{t('التكلفة', 'Cost')}</TableHead>
                    <TableHead className="w-[100px] text-center">{t('الإجراءات', 'Actions')}</TableHead>
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
                         {(row.category === 'B2B_EVALUATION' || row.category === 'TESTER' || row.category === 'INFLUENCERS') && (
                           <div className="mt-1 text-[11px] text-muted-foreground">
                             {row.stockSource === 'used_return' ? t('من تيستر مفتوح', 'From opened-tester stock') : t('من المخزون الرئيسي', 'From main stock')}
                           </div>
                         )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{row.recipientName || '—'}</div>
                        <div className="mt-0.5 max-w-[180px] space-y-0.5 text-[11px] text-muted-foreground">
                          {row.reason && <div className="truncate"><span className="font-medium">{t('السبب:', 'Reason:')}</span> {row.reason}</div>}
                          {row.comment && <div className="truncate"><span className="font-medium">{t('ملاحظة:', 'Note:')}</span> {row.comment}</div>}
                          {row.occasion && <div className="truncate"><span className="font-medium">{t('المناسبة:', 'Occasion:')}</span> {row.occasion}</div>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{row.city || '—'}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{row.country || '—'}</TableCell>
                      <TableCell className="text-center font-mono">
                         <div>{formatInteger(row.quantity, lang)}</div>
                         {(row.category === 'B2B_EVALUATION' || row.category === 'INFLUENCERS') && (
                           <div className="mt-1 text-[10px] text-muted-foreground whitespace-nowrap">
                             {t('مسترجع', 'Returned')}: {formatInteger(row.returnedQuantity, lang)}/{formatInteger(row.quantity, lang)} · {row.returnCondition
                               ? row.returnCondition === 'new' ? t('جديد', 'New') : row.returnCondition === 'used' ? t('مفتوح', 'Opened') : t('جديد ومفتوح', 'New and opened')
                               : t('غير مسترجع', 'Not returned')}
                           </div>
                         )}
                      </TableCell>
                      <TableCell className="text-right rtl:text-left font-mono font-medium">
                         <Money value={row.totalCost} lang={lang} />
                      </TableCell>
                      <TableCell>
                         <div className="flex items-center justify-center">
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t('المزيد', 'More actions')} onClick={(event) => event.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                             <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                               <DropdownMenuItem disabled={row.returnedQuantity > 0} onClick={() => openEdit(row)}><Pencil className="h-4 w-4 mr-2" />{t('تعديل', 'Edit')}</DropdownMenuItem>
                                {(row.category === 'B2B_EVALUATION' || row.category === 'INFLUENCERS') && row.returnedQuantity < row.quantity && <DropdownMenuItem onClick={() => openReturn(row)}><RotateCcw className="h-4 w-4 mr-2" />{t('استرجاع', 'Return')}</DropdownMenuItem>}
                               <DropdownMenuSeparator />
                               <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={deleteMutation.isPending || row.returnedQuantity > 0} onClick={() => removeMovement(row)}><Trash2 className="h-4 w-4 mr-2" />{t('حذف', 'Delete')}</DropdownMenuItem>
                             </DropdownMenuContent>
                           </DropdownMenu>
                         </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={selected !== null} onOpenChange={(open) => {
        if (!open) {
          setSelected(null);
          setEditing(null);
        }
      }}>
        <DialogContent className={editing ? 'sm:max-w-[560px] max-h-[90vh] overflow-y-auto' : 'sm:max-w-[450px]'}>
          <DialogHeader>
            <DialogTitle className="text-xl">{editing ? t('تعديل بيانات الحركة', 'Edit movement details') : t('تفاصيل العملية', 'Movement details')}</DialogTitle>
          </DialogHeader>
          {editing ? (
          <form onSubmit={saveEdit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{t('التصنيف', 'Category')}</Label>
                <Select value={editForm.category} onValueChange={(value) => setEditForm((current) => ({ ...current, category: value as GiftingIssueCategory }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{lang === 'ar' ? label.ar : label.en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('التاريخ', 'Date')}</Label>
                <Input className="mt-1.5" type="date" dir="ltr" value={editForm.issueDate} onChange={(e) => setEditForm((current) => ({ ...current, issueDate: e.target.value }))} />
              </div>
              <div>
                <Label>{t('الكمية', 'Quantity')}</Label>
                <Input className="mt-1.5 font-mono" type="number" min="1" step="1" value={editForm.quantity} onChange={(e) => setEditForm((current) => ({ ...current, quantity: e.target.value }))} />
              </div>
              <div>
                <Label>{t('الشخص / المستلم', 'Person / recipient')}</Label>
                <Input className="mt-1.5" value={editForm.recipientName} onChange={(e) => setEditForm((current) => ({ ...current, recipientName: e.target.value }))} />
              </div>
              <div>
                <Label>{t('المناسبة', 'Occasion')}</Label>
                <Input className="mt-1.5" value={editForm.occasion} onChange={(e) => setEditForm((current) => ({ ...current, occasion: e.target.value }))} />
              </div>
              <div>
                <Label>{t('المدينة', 'City')}</Label>
                <Input className="mt-1.5" value={editForm.city} onChange={(e) => updateEditCity(e.target.value)} placeholder={t('مثال: الرياض', 'Example: Riyadh')} />
              </div>
              <div>
                <Label>{t('الدولة', 'Country')}</Label>
                <Input className="mt-1.5" value={editForm.country} onChange={(e) => setEditForm((current) => ({ ...current, country: e.target.value }))} placeholder={editCityLookupPending ? t('جارٍ تحديد الدولة...', 'Identifying country...') : t('تُعبأ تلقائيًا من المدينة', 'Filled automatically from city')} />
              </div>
            </div>
            <div>
              <Label>{t('السبب', 'Reason')}</Label>
              <Input className="mt-1.5" maxLength={500} value={editForm.reason} onChange={(e) => setEditForm((current) => ({ ...current, reason: e.target.value }))} />
            </div>
            <div>
              <Label>{t('ملاحظة / تعليق', 'Note / comment')}</Label>
              <Input className="mt-1.5" maxLength={500} value={editForm.comment} onChange={(e) => setEditForm((current) => ({ ...current, comment: e.target.value }))} />
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              {t('عند تعديل الكمية، يُحدّث المخزون والتكلفة والقيد المحاسبي تلقائيًا. لا يمكن تغيير المنتج من هذه النافذة.', 'Changing the quantity automatically updates inventory, cost, and accounting. The product cannot be changed here.')}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t('إلغاء', 'Cancel')}</Button>
              <Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ التعديل', 'Save changes')}</Button>
            </div>
          </form>
          ) : detail.data ? (
            <>
              <Detail row={detail.data} lang={lang} />
              <div className="flex justify-end">
                <Button type="button" variant="outline" disabled={detail.data.returnedQuantity > 0} onClick={() => openEdit(detail.data!)}>
                  <Pencil className="h-4 w-4 mr-2" />{t('تعديل البيانات', 'Edit details')}
                </Button>
              </div>
            </>
          ) : (
            <div className="h-40 flex items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary"></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={returning !== null} onOpenChange={(open) => !open && setReturning(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t('استرجاع حركة قابلة للاسترجاع', 'Return movement')}</DialogTitle>
          </DialogHeader>
          {returning && (
            <form onSubmit={submitReturn} className="grid gap-4">
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <div className="font-semibold">{returning.descriptionSnapshot}</div>
                <div className="mt-1 text-muted-foreground">
                  {t('المتبقي للاسترجاع', 'Outstanding to return')}: {formatInteger(returning.quantity - returning.returnedQuantity, lang)}
                </div>
              </div>
              <div>
                <Label>{t('حالة المنتج', 'Product condition')}</Label>
                <Select value={returnForm.condition} onValueChange={(condition) => setReturnForm(current => ({ ...current, condition: condition as 'new' | 'used' }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                     <SelectItem value="new" disabled={returning.stockSource === 'used_return'}>{t('جديد — يعود للمخزون الرئيسي', 'New — return to main stock')}</SelectItem>
                     <SelectItem value="used">{t('مفتوح — يعود لمخزون تيستر مفتوح', 'Opened — return to opened-tester stock')}</SelectItem>
                  </SelectContent>
                </Select>
                 {returning.stockSource === 'used_return' && (
                   <p className="mt-1.5 text-xs text-muted-foreground">
                     {t('هذا التستر صُرف أصلًا من المخزون المفتوح، لذلك لا يمكن إرجاعه كمنتج جديد.', 'This tester was issued from opened stock and cannot return as a new product.')}
                   </p>
                 )}
              </div>
              <div>
                <Label>{t('الكمية المسترجعة', 'Returned quantity')}</Label>
                <Input className="mt-1.5 font-mono" type="number" min="1" max={returning.quantity - returning.returnedQuantity} step="1" value={returnForm.quantity} onChange={(event) => setReturnForm(current => ({ ...current, quantity: event.target.value }))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setReturning(null)}>{t('إلغاء', 'Cancel')}</Button>
                <Button type="submit" disabled={returnMutation.isPending}>{returnMutation.isPending ? t('جارٍ الاسترجاع...', 'Returning...') : t('تأكيد الاسترجاع', 'Confirm return')}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TesterSourceSelector({ productId, value, onChange, quantity, onSplit, lang }: {
  productId: number;
  value: StockSource | '';
  onChange: (value: StockSource) => void;
  quantity: string;
  onSplit: (available: number) => void;
  lang: 'ar' | 'en';
}) {
  const params = { productId };
  const { data, isLoading } = useGetAdminTesterAvailability(params, { query: { enabled: productId > 0, queryKey: getGetAdminTesterAvailabilityQueryKey(params) } });
  const requested = Number(quantity);
  const openedAvailable = data?.usedReturnAvailable ?? 0;
  const shortage = value === 'used_return' && Number.isSafeInteger(requested) && requested > openedAvailable && !!data;
  const remainder = requested - openedAvailable;
  const canUseMain = remainder <= (data?.normalAvailable ?? 0);
  return (
    <div className="mt-2 space-y-2">
      <Select value={value} onValueChange={(next) => onChange(next as StockSource)}>
        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={lang === 'ar' ? 'اختر مصدر التستر' : 'Choose tester stock source'} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="normal">
            {lang === 'ar' ? 'المخزون الرئيسي (جديد)' : 'Main stock (new)'} — {isLoading ? '…' : formatInteger(data?.normalAvailable ?? 0, lang)}
          </SelectItem>
          <SelectItem value="used_return" disabled={!data || openedAvailable <= 0}>
            {lang === 'ar' ? 'مخزون تيستر مفتوح' : 'Opened tester stock'} — {isLoading ? '…' : formatInteger(openedAvailable, lang)}
          </SelectItem>
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">
        {lang === 'ar' ? 'اختر المصدر يدويًا؛ التستر المفتوح لا يُحسب ضمن المخزون الرئيسي.' : 'Choose the source manually; opened testers are separate from main stock.'}
      </p>
      {shortage && (
        <div role="alert" className="rounded-md border border-amber-400/50 bg-amber-50 p-2.5 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <p>{lang === 'ar'
            ? `المطلوب ${formatInteger(requested, lang)}، والمتوفر من التيستر المفتوح ${formatInteger(openedAvailable, lang)}.`
            : `Requested ${formatInteger(requested, lang)}; opened-tester stock has ${formatInteger(openedAvailable, lang)}.`}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2 h-auto whitespace-normal text-start"
            disabled={!canUseMain} onClick={() => onSplit(openedAvailable)}>
            {openedAvailable > 0
              ? (lang === 'ar' ? `اصرف ${formatInteger(remainder, lang)} من المخزون الرئيسي` : `Issue ${formatInteger(remainder, lang)} from main stock`)
              : (lang === 'ar' ? 'اصرف الكمية من المخزون الرئيسي' : 'Issue from main stock')}
          </Button>
          {!canUseMain && <p className="mt-1.5">{lang === 'ar' ? 'المخزون الرئيسي لا يكفي للكمية المتبقية؛ خفّض الكمية قبل الصرف.' : 'Main stock cannot cover the remainder; reduce the quantity first.'}</p>}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
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
        {(row.category === 'B2B_EVALUATION' || row.category === 'TESTER' || row.category === 'INFLUENCERS') && (
          <div className="mt-1 text-xs text-muted-foreground">
            {lang === 'ar' ? 'مصدر الصرف' : 'Issued from'}: {row.stockSource === 'used_return'
              ? (lang === 'ar' ? 'مخزون تيستر مفتوح' : 'Opened-tester stock')
              : (lang === 'ar' ? 'المخزون الرئيسي' : 'Main stock')}
          </div>
        )}
      </div>

      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Clock className="h-3.5 w-3.5" />
        {new Date(row.issueDate).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { dateStyle: 'long', timeStyle: 'short' })}
      </div>

      {(row.occasion || row.reason || row.comment) && (
        <div className="rounded-xl bg-muted/40 border border-border/60 p-4 space-y-3 mt-4">
          {row.occasion && <div><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{lang === 'ar' ? 'المناسبة' : 'Occasion'}</span><div className="mt-1 text-sm">{row.occasion}</div></div>}
          {row.reason && <div><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{lang === 'ar' ? 'السبب' : 'Reason'}</span><div className="mt-1 text-sm">{row.reason}</div></div>}
          {row.comment && <div><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{lang === 'ar' ? 'ملاحظة / تعليق' : 'Note / comment'}</span><div className="mt-1 text-sm">{row.comment}</div></div>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-border/40">
        <div className="bg-muted/20 rounded-lg p-3 text-center border border-border/50">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{lang === 'ar' ? 'الكمية' : 'Quantity'}</div>
           <div className="text-xl font-bold font-mono">{formatInteger(row.quantity, lang)}</div>
        </div>
        <div className="bg-muted/20 rounded-lg p-3 text-center border border-border/50">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{lang === 'ar' ? 'التكلفة' : 'Cost'}</div>
           <div className="text-xl font-bold font-mono"><Money value={row.totalCost} lang={lang} /></div>
        </div>
      </div>
      {(row.category === 'B2B_EVALUATION' || row.category === 'INFLUENCERS') && (
        <div className="rounded-lg border bg-muted/20 p-3 text-xs">
          <div className="font-medium">{labels[row.category]?.[lang] ?? row.category} · {lang === 'ar' ? 'حالة الاسترجاع' : 'Return status'}</div>
          <div className="mt-1">{lang === 'ar' ? 'المسترجع' : 'Returned'}: {formatInteger(row.returnedQuantity, lang)} / {formatInteger(row.quantity, lang)}
           {row.returnCondition ? ` · ${row.returnCondition === 'new' ? (lang === 'ar' ? 'جديد' : 'New') : row.returnCondition === 'used' ? (lang === 'ar' ? 'مفتوح' : 'Opened') : (lang === 'ar' ? 'جديد ومفتوح' : 'New and opened')}` : ''}
          </div>
          {row.returnedQuantity < row.quantity && <div className="mt-1 text-muted-foreground">
            {lang === 'ar' ? 'المتبقي للاسترجاع' : 'Still returnable'}: {formatInteger(row.quantity - row.returnedQuantity, lang)}
          </div>}
        </div>
      )}

      {row.sourceFilename && (
        <div className="text-[11px] text-muted-foreground mt-5 text-center font-mono">
          {lang === 'ar' ? 'المصدر' : 'Source'}: {row.sourceFilename}{row.sourceRow ? ` — ${lang === 'ar' ? 'الصف' : 'Row'} ${row.sourceRow}` : ''}
        </div>
      )}
    </div>
  );
}
