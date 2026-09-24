import { useEffect, useState, type FocusEventHandler, type Ref } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, isValid, parse } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAdminConfirmUploadedContractTerms,
  getAdminListContractFilesQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';

const paymentTerms = ['net_days', 'end_of_month', 'due_on_issue'] as const;
export type UploadedContractPaymentTerm = (typeof paymentTerms)[number];

const isContractDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parse(value, 'yyyy-MM-dd', new Date());
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value;
};

export const uploadedContractTermsSchema = z.object({
  contractType: z.enum([
    'عقد توريد أجل المملكة العربية السعودية',
    'عقد توريد نقد المملكة العربية السعودية',
    'عقد توريد أجل دول الخليج',
    'عقد توريد نقد دول الخليج',
  ]),
  discountPercent: z.string().min(1, 'أدخل نسبة الخصم').refine(
    (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100,
    'أدخل نسبة بين 0 و100',
  ),
  paymentTerm: z.enum(paymentTerms),
  paymentDays: z.string().optional(),
  startDate: z.string().refine((value) => !value || isContractDate(value), 'أدخل التاريخ بصيغة YYYY-MM-DD').optional(),
  endDate: z.string().refine((value) => !value || isContractDate(value), 'أدخل التاريخ بصيغة YYYY-MM-DD').optional(),
}).superRefine((values, context) => {
  if (values.paymentTerm === 'net_days' &&
      (!values.paymentDays || !Number.isSafeInteger(Number(values.paymentDays)) || Number(values.paymentDays) < 1 || Number(values.paymentDays) > 365)) {
    context.addIssue({ code: 'custom', path: ['paymentDays'], message: 'أدخل عدد أيام صحيحاً بين 1 و365' });
  }
  if (values.startDate && values.endDate && values.startDate > values.endDate) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'يجب أن يكون تاريخ الانتهاء بعد تاريخ البداية' });
  }
});

export type UploadedContractTermsValues = z.infer<typeof uploadedContractTermsSchema>;

export const blankUploadedContractTerms = (): UploadedContractTermsValues => ({
  contractType: 'عقد توريد أجل المملكة العربية السعودية',
  discountPercent: '',
  paymentTerm: 'net_days',
  paymentDays: '',
  startDate: '',
  endDate: '',
});

export const uploadedContractTermsRequest = (values: UploadedContractTermsValues) => ({
  contractType: values.contractType,
  discountPercent: Number(values.discountPercent),
  paymentTerm: values.paymentTerm,
  ...(values.paymentTerm === 'net_days' ? { paymentDays: Number(values.paymentDays) } : {}),
  startDate: values.startDate || null,
  endDate: values.endDate || null,
});

function ContractDateField({
  value,
  onChange,
  onBlur,
  inputRef,
  name,
  id,
  calendarLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: FocusEventHandler<HTMLInputElement>;
  inputRef: Ref<HTMLInputElement>;
  name: string;
  id: string;
  calendarLabel: string;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const selected = isContractDate(value) ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  return (
    <div className="flex min-w-0 items-center gap-2" dir="ltr">
      <FormControl>
        <Input
          id={id}
          data-testid={id}
          ref={inputRef}
          name={name}
          onBlur={onBlur}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="YYYY-MM-DD"
          className="min-w-0 flex-1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </FormControl>
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" aria-label={calendarLabel}>
            <CalendarDays className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] p-0" align="center" collisionPadding={12} dir="rtl">
          <Calendar
            className="w-full"
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              onChange(date ? format(date, 'yyyy-MM-dd') : '');
              setCalendarOpen(false);
            }}
            captionLayout="dropdown"
            startMonth={new Date(1900, 0)}
            endMonth={new Date(2100, 11)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function UploadedContractTermsFields({
  form,
  idPrefix,
}: {
  form: ReturnType<typeof useTermsForm>;
  idPrefix: string;
}) {
  const paymentTerm = form.watch('paymentTerm');
  return (
    <>
      <FormField control={form.control} name="contractType" render={({ field }) => (
        <FormItem>
          <FormLabel>نوع العقد</FormLabel>
          <Select value={field.value} onValueChange={(value) => {
            field.onChange(value);
            if (value.includes('نقد')) form.setValue('paymentTerm', 'due_on_issue', { shouldValidate: true });
            else if (form.getValues('paymentTerm') === 'due_on_issue') form.setValue('paymentTerm', 'net_days', { shouldValidate: true });
          }}>
            <FormControl><SelectTrigger data-testid={`${idPrefix}-contract-type`}><SelectValue placeholder="اختر نوع العقد" /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="عقد توريد أجل المملكة العربية السعودية">عقد توريد أجل المملكة العربية السعودية</SelectItem>
              <SelectItem value="عقد توريد نقد المملكة العربية السعودية">عقد توريد نقد المملكة العربية السعودية</SelectItem>
              <SelectItem value="عقد توريد أجل دول الخليج">عقد توريد أجل دول الخليج</SelectItem>
              <SelectItem value="عقد توريد نقد دول الخليج">عقد توريد نقد دول الخليج</SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="discountPercent" render={({ field }) => (
        <FormItem>
          <FormLabel>نسبة الخصم (%)</FormLabel>
          <FormControl><Input {...field} id={`${idPrefix}-discount-percent`} data-testid={`${idPrefix}-discount-percent`} type="number" min="0" max="100" step="0.01" inputMode="decimal" /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="paymentTerm" render={({ field }) => (
        <FormItem>
          <FormLabel>موعد السداد</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl><SelectTrigger data-testid={`${idPrefix}-payment-term`}><SelectValue /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="net_days">بعد عدد من الأيام</SelectItem>
              <SelectItem value="end_of_month">نهاية الشهر الميلادي</SelectItem>
              <SelectItem value="due_on_issue">نقداً / يوم إصدار الفاتورة</SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} />
      {paymentTerm === 'net_days' && (
        <FormField control={form.control} name="paymentDays" render={({ field }) => (
          <FormItem>
            <FormLabel>أيام السداد</FormLabel>
            <FormControl><Input {...field} id={`${idPrefix}-payment-days`} data-testid={`${idPrefix}-payment-days`} type="number" min="1" max="365" step="1" inputMode="numeric" value={field.value ?? ''} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      )}
      <FormField control={form.control} name="startDate" render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={`${idPrefix}-start-date`}>تاريخ بداية العقد (اختياري)</FormLabel>
          <ContractDateField id={`${idPrefix}-start-date`} calendarLabel="اختر تاريخ بداية العقد" name={field.name} inputRef={field.ref} onBlur={field.onBlur} value={field.value ?? ''} onChange={field.onChange} />
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="endDate" render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={`${idPrefix}-end-date`}>تاريخ نهاية العقد (اختياري)</FormLabel>
          <ContractDateField id={`${idPrefix}-end-date`} calendarLabel="اختر تاريخ نهاية العقد" name={field.name} inputRef={field.ref} onBlur={field.onBlur} value={field.value ?? ''} onChange={field.onChange} />
          <FormMessage />
        </FormItem>
      )} />
    </>
  );
}

function useTermsForm() {
  return useForm<UploadedContractTermsValues>({
    resolver: zodResolver(uploadedContractTermsSchema),
    defaultValues: blankUploadedContractTerms(),
  });
}

type UploadedFileForTerms = {
  id: number;
  fileName: string;
  ownerName: string;
  ownerType: string;
  termsConfirmedAt?: string | null;
};

export function ConfirmUploadedContractTermsDialog({
  file,
  open,
  onOpenChange,
}: {
  file: UploadedFileForTerms | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirmTerms = useAdminConfirmUploadedContractTerms();
  const form = useTermsForm();

  useEffect(() => {
    form.reset(blankUploadedContractTerms());
  }, [file?.id, open]);

  const submit = form.handleSubmit((values) => {
    if (!file || file.ownerType !== 'distributor' || file.termsConfirmedAt) return;
    confirmTerms.mutate({
      id: file.id,
      data: uploadedContractTermsRequest(values),
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListContractFilesQueryKey() });
        toast({ title: 'تم اعتماد شروط العقد', description: 'سيُطبّق العقد تلقائياً على فواتير هذه الشركة' });
        onOpenChange(false);
      },
      onError: (error) => {
        const cause = error as { data?: { error?: string }; message?: string };
        toast({ title: 'تعذر اعتماد شروط العقد', description: cause.data?.error ?? cause.message ?? 'تحقق من البيانات ثم حاول مجدداً', variant: 'destructive' });
      },
    });
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!confirmTerms.isPending) onOpenChange(next); }}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="text-right">
          <DialogTitle>اعتماد شروط الفوترة للعقد المرفوع</DialogTitle>
          <DialogDescription>
            راجع بنود العقد مرة واحدة. بعد الاعتماد سيُستخدم تلقائياً لفواتير الشركة، وتُحفظ شروط كل فاتورة كما صدرت.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
          <p><span className="text-muted-foreground">الشركة: </span><span className="font-medium">{file?.ownerName}</span></p>
          <p dir="ltr" className="text-right"><span className="text-muted-foreground">الملف: </span><span className="font-mono">{file?.fileName}</span></p>
        </div>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <UploadedContractTermsFields form={form} idPrefix={`uploaded-terms-${file?.id ?? 'new'}`} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={confirmTerms.isPending}>إلغاء</Button>
              <Button type="submit" data-testid="button-confirm-uploaded-contract-terms" disabled={confirmTerms.isPending || !file || file.ownerType !== 'distributor' || Boolean(file.termsConfirmedAt)}>
                {confirmTerms.isPending ? 'جارٍ الاعتماد...' : 'اعتماد الشروط وربط العقد'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}