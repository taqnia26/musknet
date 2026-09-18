import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAdminListPurchases, useAdminCreatePurchase, useAdminArchivePurchase,
  useAdminRequestPurchaseInvoiceUpload, getAdminListPurchasesQueryKey,
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, UserRound, Plus, Archive, FileText, Image as ImageIcon, Search, Upload, Loader2 } from 'lucide-react';
import { getAdminToken } from '@/lib/auth-token';

const categories = [
  ['direct_materials_oils', 'مواد مباشرة وزيوت', 'Direct materials & oils'],
  ['travel_tickets', 'تذاكر سفر', 'Travel tickets'],
  ['meeting_hospitality', 'ضيافة واجتماعات', 'Meeting hospitality'],
  ['shipping', 'شحن', 'Shipping'],
  ['marketing', 'تسويق', 'Marketing'],
  ['utilities', 'مرافق', 'Utilities'],
  ['other', 'أخرى', 'Other'],
] as const;

export default function AdminPurchases() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: purchases, isLoading } = useAdminListPurchases();
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const create = useAdminCreatePurchase({ request: { headers: { 'Idempotency-Key': idempotencyKey } } });
  const archive = useAdminArchivePurchase();
  const requestUpload = useAdminRequestPurchaseInvoiceUpload();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'company_account' | 'owner_account'>('company_account');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function openInvoice(id: number) {
    const response = await fetch(`/api/admin/finance/purchases/${id}/invoice`, {
      headers: { Authorization: `Bearer ${getAdminToken() ?? ''}` },
    });
    if (!response.ok) {
      toast({ title: t('تعذر فتح الفاتورة', 'Could not open invoice'), variant: 'destructive' });
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const filtered = (purchases ?? []).filter((p) =>
    !search.trim() || `${p.title} ${p.description} ${p.category}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let invoiceObjectPath: string | null = null;
    if (file) {
      if (file.size > 10 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast({ title: t('الفاتورة يجب أن تكون PDF أو صورة حتى 10 ميجابايت', 'Invoice must be a PDF or image up to 10 MB'), variant: 'destructive' });
        return;
      }
      setUploading(true);
      try {
        const upload = await requestUpload.mutateAsync({ data: { contentType: file.type, size: file.size } });
        const response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!response.ok) throw new Error('upload');
        invoiceObjectPath = upload.objectPath;
      } catch {
        toast({ title: t('تعذر رفع الفاتورة', 'Invoice upload failed'), variant: 'destructive' });
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    create.mutate({ data: {
      title: String(form.get('title')), description: String(form.get('description')),
      amount: String(form.get('amount')), purchaseDate: String(form.get('purchaseDate')),
      notes: String(form.get('notes') || '') || null, category: String(form.get('category')) as any,
      paymentSource: source, invoiceObjectPath, invoiceContentType: file?.type ?? null, invoiceSize: file?.size ?? null,
    } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListPurchasesQueryKey() });
        setOpen(false); setFile(null); setIdempotencyKey(crypto.randomUUID());
        toast({ title: t('تم تسجيل الشراء وترحيل القيد', 'Purchase recorded and journal posted') });
      },
      onError: () => toast({ title: t('تعذر حفظ الشراء', 'Could not save purchase'), variant: 'destructive' }),
    });
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-3xl font-bold">{t('المشتريات', 'Purchases')}</h1><p className="mt-1 text-muted-foreground">{t('تسجيل مشتريات الشركة وترحيلها محاسبياً', 'Capture purchases and post them to accounting')}</p></div>
      <Button onClick={() => setOpen(true)} className="w-full sm:w-auto"><Plus className="me-2 h-4 w-4" />{t('إضافة شراء', 'Add purchase')}</Button>
    </div>
    <div className="relative max-w-md"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('بحث في المشتريات...', 'Search purchases...')} className="ps-9" /></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {isLoading ? <Card><CardContent className="p-6">{t('جاري التحميل...', 'Loading...')}</CardContent></Card> :
      filtered.map((p) => <Card key={p.id} className={p.archivedAt ? 'opacity-60' : ''}><CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><CardTitle className="text-base">{p.title}</CardTitle><Badge variant={p.archivedAt ? 'secondary' : 'outline'}>{p.archivedAt ? t('مؤرشف', 'Archived') : p.paymentSource === 'owner_account' ? t('على المالك', 'Owner') : t('حساب الشركة', 'Company')}</Badge></div></CardHeader><CardContent className="space-y-2 text-sm"><div className="text-muted-foreground">{p.description}</div><div className="flex justify-between"><span>{p.purchaseDate}</span><strong>{p.amount} SAR</strong></div><Badge variant="outline">{categories.find((c) => c[0] === p.category)?.[lang === 'ar' ? 1 : 2]}</Badge><div className="flex gap-2 pt-2">{p.invoiceObjectPath && <Button variant="outline" size="sm" onClick={() => void openInvoice(p.id)}><FileText className="me-1 h-4 w-4" />{t('الفاتورة', 'Invoice')}</Button>}{!p.archivedAt && <Button variant="ghost" size="sm" onClick={() => archive.mutate({ id: p.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getAdminListPurchasesQueryKey() }) })}><Archive className="me-1 h-4 w-4" />{t('أرشفة', 'Archive')}</Button>}</div></CardContent></Card>)}
    </div>
    {!isLoading && !filtered.length && <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{t('لا توجد مشتريات', 'No purchases found')}</div>}
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setIdempotencyKey(crypto.randomUUID()); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{t('إضافة شراء جديد', 'Add purchase')}</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><label>{t('العنوان', 'Title')}</label><Input name="title" required /></div><div className="space-y-2 sm:col-span-2"><label>{t('الوصف', 'Description')}</label><Textarea name="description" required /></div><div className="space-y-2"><label>{t('المبلغ (ريال)', 'Amount (SAR)')}</label><Input name="amount" type="number" min="0.0001" step="0.0001" required /></div><div className="space-y-2"><label>{t('التاريخ', 'Date')}</label><Input name="purchaseDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></div><div className="space-y-2 sm:col-span-2"><label>{t('التصنيف', 'Category')}</label><select name="category" className="h-10 w-full rounded-md border border-input bg-background px-3" defaultValue="other">{categories.map((c) => <option key={c[0]} value={c[0]}>{lang === 'ar' ? c[1] : c[2]}</option>)}</select></div></div>
      <div className="space-y-2"><label>{t('مصدر الدفع', 'Payment source')}</label><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setSource('company_account')} className={`rounded-xl border p-4 text-center transition ${source === 'company_account' ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'hover:bg-muted'}`}><Building2 className="mx-auto mb-2 h-7 w-7" /><span className="text-sm font-semibold">{t('حساب الشركة', 'Company account')}</span></button><button type="button" onClick={() => setSource('owner_account')} className={`rounded-xl border p-4 text-center transition ${source === 'owner_account' ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'hover:bg-muted'}`}><UserRound className="mx-auto mb-2 h-7 w-7" /><span className="text-sm font-semibold">{t('حساب المالك', 'Owner account')}</span></button></div></div>
      <div className="space-y-2"><label>{t('ملاحظات', 'Notes')}</label><Textarea name="notes" /></div>
      <div className="space-y-2"><label>{t('فاتورة خاصة (اختياري)', 'Private invoice (optional)')}</label><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><Button type="button" variant="outline" className="w-full" onClick={() => fileRef.current?.click()}><Upload className="me-2 h-4 w-4" />{file ? file.name : t('التقاط أو اختيار ملف', 'Capture or choose file')}</Button>{file && <p className="text-xs text-muted-foreground">{file.type.startsWith('image/') ? <ImageIcon className="me-1 inline h-3 w-3" /> : <FileText className="me-1 inline h-3 w-3" />}{(file.size / 1024 / 1024).toFixed(2)} MB</p>}</div>
      <Button className="w-full" type="submit" disabled={uploading || create.isPending}>{uploading || create.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}{t('حفظ وترحيل القيد', 'Save and post journal')}</Button>
    </form></DialogContent></Dialog>
  </div>;
}