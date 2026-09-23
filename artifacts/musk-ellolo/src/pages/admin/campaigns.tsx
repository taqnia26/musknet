import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  type AdminCampaign,
  adminExportCampaignResults,
  getAdminGetCampaignResultsQueryKey,
  getAdminListCampaignsQueryKey,
  useAdminCreateCampaign,
  useAdminGetCampaignResults,
  useAdminListCampaignCouponOptions,
  useAdminListCampaigns,
  useAdminPauseCampaign,
  useAdminUpdateCampaign,
  useGetAdminMe,
} from '@workspace/api-client-react';
import { CalendarDays, DollarSign, Download, Edit2, Megaphone, PauseCircle, Plus, ShoppingCart, TicketCheck, MoreHorizontal } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { Money } from '@/components/money';
import { formatInteger } from '@/lib/formatters';
import { useToast } from '@/hooks/use-toast';
import { hasPermission } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const campaignSchema = z.object({
  name: z.string().trim().min(1),
  channel: z.string().trim().min(1),
  status: z.enum(['draft', 'active', 'paused']),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  couponIds: z.array(z.number()),
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
  message: 'يجب أن يكون تاريخ النهاية بعد البداية',
  path: ['endsAt'],
});

type CampaignForm = z.infer<typeof campaignSchema>;

const initialValues: CampaignForm = {
  name: '',
  channel: 'social',
  status: 'active',
  startsAt: '',
  endsAt: '',
  couponIds: [],
};

const toLocalInput = (value: string) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

function lifecycle(campaign: AdminCampaign) {
  const now = Date.now();
  if (campaign.status === 'paused') return 'paused';
  if (campaign.status === 'draft') return 'draft';
  if (new Date(campaign.endsAt).getTime() < now) return 'ended';
  if (new Date(campaign.startsAt).getTime() > now) return 'scheduled';
  return 'active';
}

export default function AdminCampaigns() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetAdminMe();
  const { data: campaigns, isLoading } = useAdminListCampaigns();
  const { data: couponOptions } = useAdminListCampaignCouponOptions();
  const createMutation = useAdminCreateCampaign();
  const updateMutation = useAdminUpdateCampaign();
  const pauseMutation = useAdminPauseCampaign();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCampaign | null>(null);
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [reportChannel, setReportChannel] = useState('all');
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'xlsx' | null>(null);
  const reportParams = {
    ...(reportFrom ? { from: new Date(`${reportFrom}T00:00:00`).toISOString() } : {}),
    ...(reportTo ? { to: new Date(`${reportTo}T23:59:59.999`).toISOString() } : {}),
    ...(reportChannel !== 'all' ? { channel: reportChannel } : {}),
  };
  const { data: results, isLoading: resultsLoading, isError: resultsError } = useAdminGetCampaignResults(reportParams);
  const canEdit = hasPermission(currentUser, 'campaigns', 'edit');

  const form = useForm<CampaignForm>({
    resolver: zodResolver(campaignSchema),
    defaultValues: initialValues,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getAdminListCampaignsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetCampaignResultsQueryKey() });
  };
  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
    form.reset(initialValues);
  };
  const editCampaign = (campaign: AdminCampaign) => {
    setEditing(campaign);
    form.reset({
      name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
      startsAt: toLocalInput(campaign.startsAt),
      endsAt: toLocalInput(campaign.endsAt),
      couponIds: campaign.coupons.map((coupon) => coupon.id),
    });
    setOpen(true);
  };
  const submit = (values: CampaignForm) => {
    const data = {
      ...values,
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
    };
    const options = { onSuccess: () => { refresh(); closeDialog(); } };
    if (editing) updateMutation.mutate({ id: editing.id, data }, options);
    else createMutation.mutate({ data }, options);
  };
  const pause = (campaign: AdminCampaign) => {
    if (!confirm(t(`إيقاف حملة "${campaign.name}"؟`, `Pause "${campaign.name}"?`))) return;
    pauseMutation.mutate({ id: campaign.id }, { onSuccess: refresh });
  };
  const downloadResults = async (format: 'csv' | 'xlsx') => {
    try {
      setExportingFormat(format);
      const blob = await adminExportCampaignResults({ ...reportParams, format });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `campaign-results-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast({ title: t('تم تنزيل التقرير', 'Report downloaded') });
    } catch {
      toast({
        title: t('تعذر تنزيل التقرير', 'Could not download report'),
        description: t('تحقق من الفلاتر والصلاحيات ثم حاول مرة أخرى.', 'Check the filters and permissions, then try again.'),
        variant: 'destructive',
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const activeCount = campaigns?.filter((campaign) => lifecycle(campaign) === 'active').length ?? 0;
  const endedCount = campaigns?.filter((campaign) => lifecycle(campaign) === 'ended').length ?? 0;
  const statusLabels = {
    active: t('نشطة', 'Active'),
    scheduled: t('مجدولة', 'Scheduled'),
    ended: t('منتهية', 'Ended'),
    paused: t('متوقفة', 'Paused'),
    draft: t('مسودة', 'Draft'),
  };
  const channelLabels: Record<string, string> = {
    social: t('الشبكات الاجتماعية', 'Social media'),
    email: t('البريد الإلكتروني', 'Email'),
    influencers: t('المشاهير', 'Influencers'),
    storefront: t('المتجر', 'Storefront'),
    other: t('أخرى', 'Other'),
  };
  const formatNumber = (value: number) => formatInteger(value, lang);
  const formatCurrency = (value: number) => <Money value={value} lang={lang} />;
  const resultByCampaign = new Map(results?.campaigns.map((campaign) => [campaign.id, campaign]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('الحملات التسويقية', 'Marketing campaigns')}</h1>
          <p className="mt-1 text-muted-foreground">{t('نظّم العروض والكوبونات حسب الفترة والقناة', 'Organize offers and coupons by period and channel')}</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={(value) => { if (!value) closeDialog(); else setOpen(true); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-campaign"><Plus className="me-2 h-4 w-4" />{t('حملة جديدة', 'New campaign')}</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{editing ? t('تعديل الحملة', 'Edit campaign') : t('إنشاء حملة', 'Create campaign')}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>{t('اسم الحملة', 'Campaign name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField control={form.control} name="channel" render={({ field }) => (
                      <FormItem><FormLabel>{t('القناة', 'Channel')}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>{Object.entries(channelLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                        </Select><FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem><FormLabel>{t('الحالة', 'Status')}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="active">{t('نشطة', 'Active')}</SelectItem>
                            <SelectItem value="draft">{t('مسودة', 'Draft')}</SelectItem>
                            <SelectItem value="paused">{t('متوقفة', 'Paused')}</SelectItem>
                          </SelectContent>
                        </Select><FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField control={form.control} name="startsAt" render={({ field }) => (
                      <FormItem><FormLabel>{t('تبدأ في', 'Starts at')}</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="endsAt" render={({ field }) => (
                      <FormItem><FormLabel>{t('تنتهي في', 'Ends at')}</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="couponIds" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('الكوبونات المرتبطة', 'Linked coupons')}</FormLabel>
                      <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                        {couponOptions?.length ? couponOptions.map((coupon) => (
                          <label key={coupon.id} className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted">
                            <Checkbox checked={field.value.includes(coupon.id)} onCheckedChange={(checked) => field.onChange(checked ? [...field.value, coupon.id] : field.value.filter((id) => id !== coupon.id))} />
                            <span dir="ltr" className="font-mono text-sm">{coupon.code}</span>
                          </label>
                        )) : <p className="text-sm text-muted-foreground">{t('لا توجد كوبونات نشطة', 'No active coupons')}</p>}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>{t('حفظ الحملة', 'Save campaign')}</Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('إجمالي الحملات', 'Total campaigns')}</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{campaigns?.length ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('نشطة الآن', 'Active now')}</CardTitle></CardHeader><CardContent className="text-3xl font-bold text-emerald-500">{activeCount}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('منتهية', 'Ended')}</CardTitle></CardHeader><CardContent className="text-3xl font-bold text-muted-foreground">{endedCount}</CardContent></Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{t('نتائج الحملات', 'Campaign results')}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t('الطلبات المدفوعة غير الملغاة والمنسوبة إلى كوبونات الحملة خلال فترة تشغيلها', 'Paid, non-cancelled orders attributed to campaign coupons during the campaign period')}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" disabled={resultsLoading || !!exportingFormat || resultsError} onClick={() => downloadResults('csv')}>
                <Download className="me-2 h-4 w-4" />{exportingFormat === 'csv' ? t('جارٍ التنزيل...', 'Downloading...') : 'CSV'}
              </Button>
              <Button variant="outline" size="sm" disabled={resultsLoading || !!exportingFormat || resultsError} onClick={() => downloadResults('xlsx')}>
                <Download className="me-2 h-4 w-4" />{exportingFormat === 'xlsx' ? t('جارٍ التنزيل...', 'Downloading...') : 'Excel'}
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="mb-1 block text-sm font-medium">{t('من تاريخ', 'From')}</label><Input type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} /></div>
            <div><label className="mb-1 block text-sm font-medium">{t('إلى تاريخ', 'To')}</label><Input type="date" value={reportTo} min={reportFrom || undefined} onChange={(event) => setReportTo(event.target.value)} /></div>
            <div><label className="mb-1 block text-sm font-medium">{t('القناة', 'Channel')}</label>
              <Select value={reportChannel} onValueChange={setReportChannel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="all">{t('كل القنوات', 'All channels')}</SelectItem>
                {Object.entries(channelLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent></Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {resultsError && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{t('تعذر تحميل نتائج الحملات. تحقق من الفترة وحاول مرة أخرى.', 'Campaign results could not be loaded. Check the period and try again.')}</div>}
          <div className={`grid gap-3 sm:grid-cols-3 ${resultsError ? 'opacity-50' : ''}`}>
            <div className="rounded-lg border p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><TicketCheck className="h-4 w-4" />{t('استخدامات الكوبونات', 'Coupon uses')}</div><div className="mt-2 text-2xl font-bold">{resultsLoading || resultsError ? '—' : formatNumber(results?.couponUses ?? 0)}</div></div>
            <div className="rounded-lg border p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ShoppingCart className="h-4 w-4" />{t('الطلبات', 'Orders')}</div><div className="mt-2 text-2xl font-bold">{resultsLoading || resultsError ? '—' : formatNumber(results?.orders ?? 0)}</div></div>
            <div className="rounded-lg border p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign className="h-4 w-4" />{t('الإيراد', 'Revenue')}</div><div className="mt-2 text-2xl font-bold text-emerald-600">{resultsLoading || resultsError ? '—' : formatCurrency(results?.revenue ?? 0)}</div></div>
          </div>
          {!!results?.byChannel.length && reportChannel === 'all' && (
            <div>
              <h3 className="mb-2 font-semibold">{t('مقارنة القنوات', 'Channel comparison')}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.byChannel.map((channel) => <div key={channel.channel} className="rounded-lg bg-muted/50 p-3">
                  <div className="font-medium">{channelLabels[channel.channel] ?? channel.channel}</div>
                  <div className="mt-2 flex justify-between text-sm"><span className="text-muted-foreground">{t('الطلبات', 'Orders')}</span><span>{formatNumber(channel.orders)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('الإيراد', 'Revenue')}</span><span className="font-medium">{formatCurrency(channel.revenue)}</span></div>
                </div>)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t('الحملة', 'Campaign')}</TableHead><TableHead>{t('الفترة', 'Period')}</TableHead><TableHead>{t('القناة', 'Channel')}</TableHead>
            <TableHead>{t('الكوبونات', 'Coupons')}</TableHead><TableHead>{t('الاستخدامات', 'Uses')}</TableHead><TableHead>{t('الطلبات', 'Orders')}</TableHead><TableHead>{t('الإيراد', 'Revenue')}</TableHead><TableHead>{t('الحالة', 'Status')}</TableHead><TableHead className="w-[100px]" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
              : !campaigns?.length ? <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground"><Megaphone className="mx-auto mb-2 h-8 w-8 opacity-40" />{t('لا توجد حملات بعد', 'No campaigns yet')}</TableCell></TableRow>
              : campaigns.map((campaign) => {
                const state = lifecycle(campaign);
                const result = resultByCampaign.get(campaign.id);
                return <TableRow key={campaign.id} className={state === 'ended' ? 'opacity-60' : ''} data-testid={`row-campaign-${campaign.id}`}>
                  <TableCell className="font-semibold">{campaign.name}</TableCell>
                  <TableCell><div className="flex items-start gap-2 text-sm"><CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" /><span>{new Date(campaign.startsAt).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US')}<br />{new Date(campaign.endsAt).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US')}</span></div></TableCell>
                  <TableCell>{channelLabels[campaign.channel] ?? campaign.channel}</TableCell>
                  <TableCell><div className="flex max-w-[220px] flex-wrap gap-1">{campaign.coupons.length ? campaign.coupons.map((coupon) => <Badge key={coupon.id} variant="outline" dir="ltr">{coupon.code}</Badge>) : <span className="text-sm text-muted-foreground">—</span>}</div></TableCell>
                  <TableCell>{result ? formatNumber(result.couponUses) : '—'}</TableCell>
                  <TableCell>{result ? formatNumber(result.orders) : '—'}</TableCell>
                  <TableCell className="font-medium">{result ? formatCurrency(result.revenue) : '—'}</TableCell>
                  <TableCell><Badge variant={state === 'active' ? 'default' : state === 'ended' ? 'secondary' : 'outline'} className={state === 'active' ? 'bg-emerald-600' : ''}>{statusLabels[state]}</Badge></TableCell>
                  <TableCell><div className="flex justify-end">
                    {canEdit && <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('المزيد', 'More')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => editCampaign(campaign)}><Edit2 className="h-4 w-4 me-2" />{t('تعديل', 'Edit')}</DropdownMenuItem>
                        {campaign.status === 'active' && state !== 'ended' && <><DropdownMenuSeparator /><DropdownMenuItem disabled={pauseMutation.isPending} onClick={() => pause(campaign)}><PauseCircle className="h-4 w-4 me-2 text-amber-500" />{t('إيقاف', 'Pause')}</DropdownMenuItem></>}
                      </DropdownMenuContent>
                    </DropdownMenu>}
                  </div></TableCell>
                </TableRow>;
              })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}