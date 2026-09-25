import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { type AdminSocialPost, type AdminSocialPlatform, getAdminListSocialPostsQueryKey, useAdminCreateSocialPost, useAdminUpdateSocialPost, useAdminRequestSocialMediaUpload, useAdminListCampaigns } from '@workspace/api-client-react';
import { ArrowUpRight, CalendarDays, Check, ImageIcon, ImagePlus, LayoutGrid, Link2, ListFilter, Plus, Radio, X } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { getAdminToken } from '@/lib/auth-token';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import './marketing.css';

export const platforms = ['instagram', 'facebook', 'tiktok', 'x', 'linkedin'] as const;
export const platformName: Record<AdminSocialPlatform, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', x: 'X', linkedin: 'LinkedIn' };
export const toLocal = (value: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
export const displayDate = (value: string | null, lang: string, options?: Intl.DateTimeFormatOptions) => value ? new Date(value).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', options || { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function MarketingImage({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    setImageUrl(null);
    if (!src.startsWith('/api/admin/social/media/')) { setImageUrl(src); return; }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    fetch(src, { signal: controller.signal, headers: { Authorization: `Bearer ${getAdminToken() ?? ''}` } })
      .then(async response => {
        if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/')) throw new Error('Image unavailable');
        return response.blob();
      })
      .then(blob => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => { if (!controller.signal.aborted) setImageUrl(null); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);
  return imageUrl
    ? <img src={imageUrl} alt={alt} className={className} />
    : <div role="img" aria-label={alt} className={`flex items-center justify-center bg-muted ${className}`}><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>;
}

export function Status({ status }: { status: AdminSocialPost['status'] }) {
  const { t } = useLanguage();
  return <span className={`mk-status mk-status-${status}`} data-testid={`status-${status}`}>{status === 'draft' ? t('مسودة', 'Draft') : status === 'scheduled' ? t('مخطط للنشر', 'Planned') : t('نُشر يدوياً', 'Manually published')}</span>;
}

const tabs = [
  { href: '/admin/marketing/overview', ar: 'نظرة عامة', en: 'Overview', icon: LayoutGrid },
  { href: '/admin/marketing/content', ar: 'المحتوى', en: 'Content', icon: ListFilter },
  { href: '/admin/marketing/calendar', ar: 'التقويم', en: 'Calendar', icon: CalendarDays },
  { href: '/admin/marketing/channels', ar: 'القنوات', en: 'Channels', icon: Radio },
];
export function MarketingShell({ title, description, eyebrow, action, children }: { title: string; description: string; eyebrow: string; action?: ReactNode; children: ReactNode }) {
  const { lang, t } = useLanguage();
  const [location] = useLocation();
  return <div className="mk-workspace mx-auto max-w-[1440px] space-y-6 pb-12" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <div className="flex flex-col gap-5 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
      <div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.24em] text-accent">{t('مسك اللولو / استوديو التسويق', 'MUSK ELLOLO / MARKETING STUDIO')}</div><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p></div>
      {action}
    </div>
    <nav aria-label={t('أقسام التسويق', 'Marketing sections')} className="flex gap-1 overflow-x-auto border-b border-border pb-px">
      {tabs.map(tab => <Link key={tab.href} href={tab.href} data-testid={`link-marketing-${tab.en.toLowerCase()}`} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold transition-colors ${location === tab.href ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><tab.icon className="h-4 w-4" />{lang === 'ar' ? tab.ar : tab.en}</Link>)}
    </nav>
    <div className="sr-only">{eyebrow}</div>
    {children}
  </div>;
}

export function LoadBlock({ error, loading, retry, children }: { error: boolean; loading: boolean; retry: () => void; children: ReactNode }) {
  const { t } = useLanguage();
  if (loading) return <div className="space-y-3" role="status" aria-label={t('جاري التحميل', 'Loading')}><div className="mk-shimmer h-28 rounded-2xl" /><div className="mk-shimmer h-48 rounded-2xl" /><div className="mk-shimmer h-28 rounded-2xl" /></div>;
  if (error) return <div role="alert" className="mk-surface p-8 text-center"><p className="font-semibold">{t('تعذر تحميل بيانات التسويق', 'Could not load marketing data')}</p><p className="mt-1 text-sm text-muted-foreground">{t('تحقق من الاتصال والصلاحيات ثم حاول مجدداً.', 'Check your connection and permissions, then try again.')}</p><Button variant="outline" className="mt-4" onClick={retry} data-testid="button-retry-marketing">{t('إعادة المحاولة', 'Try again')}</Button></div>;
  return <>{children}</>;
}

export function EmptyBlock({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="mk-surface flex flex-col items-center justify-center px-6 py-16 text-center"><div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-accent/10"><Plus className="h-6 w-6 text-accent" /></div><h3 className="font-semibold">{title}</h3><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().min(1).max(5000),
  platforms: z.array(z.enum(platforms)).min(1),
  mediaUrls: z.array(z.string().max(400).refine(value => {
    if (/^\/api\/admin\/social\/media\/[0-9a-f-]{36}$/.test(value)) return true;
    try { const parsed = new URL(value); return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password; }
    catch { return false; }
  })).max(6),
  status: z.enum(['draft', 'scheduled']),
  scheduledAt: z.string(),
  campaignId: z.string(),
}).refine(v => v.status !== 'scheduled' || (v.scheduledAt !== '' && !Number.isNaN(new Date(v.scheduledAt).getTime())), { path: ['scheduledAt'], message: 'Choose a valid date / اختر تاريخاً صالحاً' });
type Values = z.infer<typeof schema>;
const blank: Values = { title: '', caption: '', platforms: ['instagram'], mediaUrls: [], status: 'draft', scheduledAt: '', campaignId: 'none' };

export function Composer({ open, onOpenChange, post, date }: { open: boolean; onOpenChange: (value: boolean) => void; post?: AdminSocialPost | null; date?: Date | null }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const client = useQueryClient();
  const campaigns = useAdminListCampaigns();
  const create = useAdminCreateSocialPost();
  const update = useAdminUpdateSocialPost();
  const upload = useAdminRequestSocialMediaUpload();
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: blank });
  const { reset } = form;
  const media = form.watch('mediaUrls');
  const selectedPlatforms = form.watch('platforms');
  const status = form.watch('status');
  useEffect(() => {
    if (!open) return;
    reset(post ? { title: post.title, caption: post.caption, platforms: post.platforms, mediaUrls: post.mediaUrls, status: post.status === 'scheduled' ? 'scheduled' : 'draft', scheduledAt: toLocal(post.scheduledAt), campaignId: post.campaignId === null ? 'none' : String(post.campaignId) } : { ...blank, status: date ? 'scheduled' : 'draft', scheduledAt: date ? toLocal(date.toISOString()) : '' });
    setUrl('');
  }, [open, post, date, reset]);
  const fail = () => toast({ title: t('تعذر إتمام العملية', 'Action failed'), description: t('راجع البيانات أو حاول مرة أخرى.', 'Review the details or try again.'), variant: 'destructive' });
  const save = (v: Values) => {
    const unchangedPlan = post?.status === 'scheduled' && toLocal(post.scheduledAt) === v.scheduledAt;
    if (v.status === 'scheduled' && !unchangedPlan && new Date(v.scheduledAt).getTime() <= Date.now()) {
      form.setError('scheduledAt', { message: t('اختر موعداً مستقبلياً', 'Choose a future date') }); return;
    }
    const data = { title: v.title.trim(), caption: v.caption.trim(), platforms: v.platforms, mediaUrls: v.mediaUrls, status: v.status, scheduledAt: v.status === 'scheduled' ? unchangedPlan ? post.scheduledAt : new Date(v.scheduledAt).toISOString() : null, campaignId: v.campaignId === 'none' ? null : Number(v.campaignId) };
    const options = { onSuccess: () => { client.invalidateQueries({ queryKey: getAdminListSocialPostsQueryKey() }); toast({ title: t('تم حفظ المحتوى', 'Content saved') }); onOpenChange(false); }, onError: fail };
    if (post) update.mutate({ id: post.id, data }, options);
    else create.mutate({ data }, options);
  };
  const addUrl = () => {
    const trimmed = url.trim();
    try { const parsed = new URL(trimmed); if (parsed.protocol !== 'https:' || parsed.username || parsed.password || media.length >= 6 || trimmed.length > 400) throw Error(); form.setValue('mediaUrls', [...media, trimmed], { shouldValidate: true }); setUrl(''); }
    catch { toast({ title: t('أدخل رابط صورة صالحاً (الحد ٦)', 'Enter a valid image URL (maximum 6)'), variant: 'destructive' }); }
  };
  const files = async (list: FileList | null) => {
    if (!list?.length) return;
    const selected = Array.from(list);
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    if (media.length + selected.length > 6 || selected.some(f => !allowed.includes(f.type) || f.size > 10 * 1024 * 1024 || f.size === 0)) {
      toast({ title: t('الصور: حتى ٦ ملفات، ١٠ م.ب لكل ملف (JPEG/PNG/WebP/AVIF)', 'Images: up to 6 files, 10 MB each (JPEG/PNG/WebP/AVIF)'), variant: 'destructive' }); return;
    }
    setUploading(true);
    const urls = [...media];
    try {
      for (const file of selected) {
        const signed = await upload.mutateAsync({ data: { contentType: file.type, size: file.size } });
        const res = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!res.ok) throw new Error('Upload failed');
        urls.push(signed.imageUrl);
        form.setValue('mediaUrls', [...urls], { shouldValidate: true });
      }
      toast({ title: t('تم رفع الصور', 'Images uploaded') });
    } catch { fail(); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  return <Dialog open={open} onOpenChange={v => { if (!uploading && !create.isPending && !update.isPending) onOpenChange(v); }}>
    <DialogContent dir={lang === 'ar' ? 'rtl' : 'ltr'} className="max-h-[94dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>{post ? t('تعديل المحتوى', 'Edit content') : t('قطعة محتوى جديدة', 'New content piece')}</DialogTitle><DialogDescription>{t('جهّز النص والمرئيات للنشر اليدوي. الجدولة خطة تحريرية فقط ولا تنشر تلقائياً.', 'Prepare copy and assets for manual publishing. Scheduling is an editorial plan, not automatic publishing.')}</DialogDescription></DialogHeader>
      <Form {...form}><form onSubmit={form.handleSubmit(save)} className="space-y-5" data-testid="form-social-post">
        <FormField control={form.control} name="title" render={({ field }) => <FormItem><FormLabel>{t('العنوان الداخلي', 'Internal title')} *</FormLabel><FormControl><Input data-testid="input-post-title" maxLength={120} placeholder={t('مثال: إطلاق المجموعة الجديدة', 'e.g. Collection launch')} {...field} /></FormControl><FormMessage /></FormItem>} />
        <FormField control={form.control} name="caption" render={({ field }) => <FormItem><FormLabel>{t('نص المنشور', 'Post caption')} *</FormLabel><FormControl><Textarea data-testid="input-post-caption" maxLength={5000} rows={6} placeholder={t('اكتب النص الذي سينسخه الفريق عند النشر...', 'Write the copy your team will publish manually...')} {...field} /></FormControl><div className="text-end text-xs text-muted-foreground">{field.value.length} / 5000</div><FormMessage /></FormItem>} />
        <div><p className="mb-2 text-sm font-medium">{t('القنوات المستهدفة', 'Target platforms')} *</p><div className="flex flex-wrap gap-2">{platforms.map(p => <button type="button" key={p} data-testid={`button-platform-${p}`} aria-pressed={selectedPlatforms.includes(p)} onClick={() => form.setValue('platforms', selectedPlatforms.includes(p) ? selectedPlatforms.filter(x => x !== p) : [...selectedPlatforms, p], { shouldValidate: true })} className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${selectedPlatforms.includes(p) ? 'border-accent bg-accent/10 text-foreground' : 'border-border text-muted-foreground hover:border-accent/50'}`}>{selectedPlatforms.includes(p) && <Check className="me-1 inline h-3 w-3" />}{platformName[p]}</button>)}</div>{form.formState.errors.platforms && <p role="alert" className="mt-1 text-xs text-destructive">{t('اختر قناة واحدة على الأقل', 'Choose at least one platform')}</p>}</div>
        <div className="space-y-3"><div className="flex items-center justify-between"><p className="text-sm font-medium">{t('الصور', 'Images')}</p><span className="text-xs text-muted-foreground">{media.length} / 6</span></div>
          {media.length > 0 && <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{media.map((src, i) => <div key={`${src}-${i}`} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"><MarketingImage src={src} alt={t(`الصورة ${i + 1}`, `Image ${i + 1}`)} className="h-full w-full object-cover" /><button type="button" data-testid={`button-remove-image-${i}`} onClick={() => form.setValue('mediaUrls', media.filter((_, n) => n !== i), { shouldValidate: true })} className="absolute end-1 top-1 rounded-full bg-background/90 p-1" aria-label={t('إزالة الصورة', 'Remove image')}><X className="h-3 w-3" /></button></div>)}</div>}
          <input ref={fileRef} data-testid="input-upload-images" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={e => files(e.target.files)} />
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={uploading || media.length >= 6} onClick={() => fileRef.current?.click()} data-testid="button-upload-images"><ImagePlus className="me-2 h-4 w-4" />{uploading ? t('جارٍ الرفع...', 'Uploading...') : t('رفع صور', 'Upload images')}</Button><div className="flex min-w-[170px] flex-1 gap-2"><Input type="url" data-testid="input-image-url" aria-label={t('رابط الصورة', 'Image URL')} placeholder={t('أو الصق رابط صورة', 'Or paste an image URL')} value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }} /><Button type="button" size="icon" variant="outline" onClick={addUrl} disabled={!url || media.length >= 6} aria-label={t('أضف الرابط', 'Add URL')} data-testid="button-add-image-url"><Link2 className="h-4 w-4" /></Button></div></div><p className="text-xs text-muted-foreground">{t('JPEG أو PNG أو WebP أو AVIF · حتى ١٠ م.ب للصورة', 'JPEG, PNG, WebP or AVIF · 10 MB per image')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="campaignId" render={({ field }) => <FormItem><FormLabel>{t('الحملة المرتبطة', 'Linked campaign')}</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger data-testid="select-post-campaign"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">{t('بدون حملة', 'No campaign')}</SelectItem>{campaigns.data?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
          <FormField control={form.control} name="status" render={({ field }) => <FormItem><FormLabel>{t('حالة التحرير', 'Editorial status')}</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger data-testid="select-post-status"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="draft">{t('مسودة', 'Draft')}</SelectItem><SelectItem value="scheduled">{t('مخطط للنشر يدوياً', 'Planned for manual publication')}</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
        </div>
        {status === 'scheduled' && <FormField control={form.control} name="scheduledAt" render={({ field }) => <FormItem><FormLabel>{t('موعد النشر المخطط', 'Planned publication date')} *</FormLabel><FormControl><Input type="datetime-local" data-testid="input-post-scheduled-at" {...field} /></FormControl><FormMessage /></FormItem>} />}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-cancel-post">{t('إلغاء', 'Cancel')}</Button><Button type="submit" disabled={uploading || create.isPending || update.isPending} data-testid="button-save-post">{create.isPending || update.isPending ? t('جارٍ الحفظ...', 'Saving...') : t('حفظ المحتوى', 'Save content')}<ArrowUpRight className="ms-2 h-4 w-4" /></Button></div>
      </form></Form>
    </DialogContent>
  </Dialog>;
}

export function PlatformTags({ items }: { items: AdminSocialPlatform[] }) { return <div className="flex flex-wrap gap-1">{items.map(p => <span className="mk-platform" key={p}>{platformName[p]}</span>)}</div>; }