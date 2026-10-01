import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminBackupsQueryKey, getPreviewAdminBackupRestoreQueryKey, useCreateAdminBackup, useGetAdminBackups,
  useGetAdminMe, usePreviewAdminBackupRestore, useRestoreAdminBackup, useUnlockAdminBackups,
  useUpdateAdminBackupSchedule,
} from '@workspace/api-client-react';
import type { BackupRecord } from '@workspace/api-client-react';
import { arabicBackupPolicy } from './backup-policy';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, CalendarClock, DatabaseBackup, History, Loader2, Lock, LockOpen, RotateCcw, ShieldAlert } from 'lucide-react';

const TZ = 'Asia/Riyadh';
type Freq = 'once' | 'daily' | 'weekly';
const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function fmtDate(value: string | null | undefined, lang: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
function riyadhDay(value: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(value));
}
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export default function AdminBackups() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useGetAdminMe();
  const isSuper = Boolean(me?.isSuperAdmin);

  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const unlockingRef = useRef(false);
  const createRef = useRef(false);
  const scheduleRef = useRef(false);
  const restoreRef = useRef(false);

  const headers = useMemo(() => (token ? { 'X-Backup-Access': token } : undefined), [token]);
  const req = useMemo(() => ({ headers: headers ?? {} }), [headers]);

  const lock = useCallback((reason?: string) => {
    setToken(null); setExpiresAt(null); setPassword('');
    queryClient.removeQueries({ queryKey: getGetAdminBackupsQueryKey() });
    queryClient.removeQueries({ queryKey: ['/api/admin/backups'], exact: false });
    if (reason) setUnlockError(reason);
  }, [queryClient]);

  // Lock when the signed-in admin changes or is not a superadmin.
  const adminId = me?.id;
  const lastAdmin = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (lastAdmin.current !== undefined && lastAdmin.current !== adminId) lock();
    lastAdmin.current = adminId;
  }, [adminId, lock]);
  useEffect(() => { if (me && !isSuper) lock(); }, [me, isSuper, lock]);
  useEffect(() => () => { setToken(null); }, []);

  // Lock at expiry.
  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    const id = window.setTimeout(() => lock(t('انتهت مدة الوصول. أدخل كلمة المرور من جديد.', 'Access expired. Enter the password again.')), Math.max(ms, 0));
    return () => window.clearTimeout(id);
  }, [expiresAt, lock, t]);

  const unlock = useUnlockAdminBackups();
  const create = useCreateAdminBackup({ request: req });
  const saveSchedule = useUpdateAdminBackupSchedule({ request: req });
  const restore = useRestoreAdminBackup({ request: req });

  const dash = useGetAdminBackups({
    query: {
      queryKey: getGetAdminBackupsQueryKey(), enabled: Boolean(token), retry: false,
      refetchInterval: token ? 3000 : false, refetchOnWindowFocus: false,
    },
    request: req,
  });

  const errStatus = (dash.error as { status?: number } | null)?.status;
  useEffect(() => {
    if (errStatus === 401 || errStatus === 403) lock(t('انتهت صلاحية الوصول إلى النسخ الاحتياطية. أدخل كلمة المرور من جديد.', 'Backup access is no longer valid. Enter the password again.'));
  }, [errStatus, lock, t]);

  function errText(e: unknown) {
    const err = e as { status?: number; data?: { error?: string; code?: string } } | null;
    const code = err?.data?.code ?? err?.data?.error;
    const map: Record<string, [string, string]> = {
      invalid_password: ['كلمة المرور غير صحيحة.', 'Incorrect password.'],
      busy: ['توجد عملية نسخ أو استعادة قيد التنفيذ.', 'Another backup or restore is already running.'],
      storage_unavailable: ['مساحة التخزين غير جاهزة.', 'Backup storage is not ready.'],
      maintenance: ['النظام في وضع الصيانة.', 'System is in maintenance mode.'],
      rate_limited: ['محاولات كثيرة. انتظر قليلاً.', 'Too many attempts. Wait a moment.'],
    };
    if (code && map[code]) return t(map[code][0], map[code][1]);
    if (err?.status === 401) return t('كلمة المرور غير صحيحة أو انتهت الجلسة.', 'Incorrect password or session expired.');
    if (err?.status === 403) return t('غير مصرح لك بهذه العملية.', 'You are not permitted to do this.');
    if (err?.status === 429) return t('محاولات كثيرة. انتظر قليلاً.', 'Too many attempts. Wait a moment.');
    if (err?.status === 409) return t('توجد عملية قيد التنفيذ.', 'An operation is already running.');
    return t('تعذر تنفيذ العملية. لم يتم تأكيد نجاحها.', 'The action failed. Success was not confirmed.');
  }

  async function doUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (unlockingRef.current || !password) return;
    unlockingRef.current = true; setUnlockError('');
    const pw = password; setPassword('');
    try {
      const res = await unlock.mutateAsync({ data: { password: pw } });
      setToken(res.accessToken); setExpiresAt(res.expiresAt);
    } catch (err) { setUnlockError(errText(err)); }
    finally { unlockingRef.current = false; }
  }

  const data = dash.data;
  const busy = Boolean(data?.runtime.busy) || Boolean(data?.runtime.maintenance);
  const storageReady = Boolean(data?.storage.ready);
  const [label, setLabel] = useState('');

  async function doCreate() {
    if (createRef.current || busy || !storageReady) return;
    createRef.current = true;
    try {
      await create.mutateAsync({ data: label.trim() ? { label: label.trim() } : {} });
      setLabel('');
      toast({ title: t('بدأ إنشاء النسخة. سيظهر النجاح عند اكتمالها فعلياً.', 'Backup started. Success shows once it truly completes.') });
      void dash.refetch();
    } catch (err) {
      toast({ title: t('تعذر بدء النسخ', 'Could not start backup'), description: errText(err), variant: 'destructive' });
    } finally { createRef.current = false; }
  }

  // Schedule form
  const [sEnabled, setSEnabled] = useState(false);
  const [sFreq, setSFreq] = useState<Freq>('daily');
  const [sDate, setSDate] = useState('');
  const [sTime, setSTime] = useState('03:00');
  const [sDay, setSDay] = useState(0);
  const schedInit = useRef(false);
  useEffect(() => {
    if (data && !schedInit.current) {
      schedInit.current = true;
      const s = data.schedule;
      setSEnabled(s.enabled); setSFreq(s.frequency); setSDate(s.localDate ?? ''); setSTime(s.localTime || '03:00'); setSDay(s.weekday ?? 0);
    }
  }, [data]);
  useEffect(() => { if (!token) schedInit.current = false; }, [token]);

  async function doSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (scheduleRef.current) return;
    if (sEnabled && sFreq === 'once' && !sDate) {
      toast({ title: t('اختر تاريخ التنفيذ', 'Pick a run date'), variant: 'destructive' }); return;
    }
    scheduleRef.current = true;
    try {
      await saveSchedule.mutateAsync({ data: {
        enabled: sEnabled, frequency: sFreq, localDate: sFreq === 'once' ? sDate || null : null,
        localTime: sTime, weekday: sFreq === 'weekly' ? sDay : null, timeZone: TZ,
      } });
      toast({ title: t('تم حفظ الجدولة على الخادم', 'Schedule saved on the server') });
      void dash.refetch();
    } catch (err) {
      toast({ title: t('تعذر حفظ الجدولة', 'Could not save schedule'), description: errText(err), variant: 'destructive' });
    } finally { scheduleRef.current = false; }
  }

  // History filter
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const all = data?.backups ?? [];
  const filtered = all.filter((b) => {
    const d = riyadhDay(b.createdAt);
    return (!from || d >= from) && (!to || d <= to);
  });

  // Restore flow
  const [target, setTarget] = useState<BackupRecord | null>(null);
  const [rPw, setRPw] = useState('');
  const [rConfirm, setRConfirm] = useState('');
  const [rError, setRError] = useState('');
  const preview = usePreviewAdminBackupRestore(target?.id ?? '', {
    query: { queryKey: getPreviewAdminBackupRestoreQueryKey(target?.id ?? ''), enabled: Boolean(token && target), retry: false, refetchOnWindowFocus: false },
    request: req,
  });
  const pv = preview.data;
  const canRestore = Boolean(target && pv && pv.compatible && pv.id === target.id && !busy && UUID_RE.test(rConfirm) && rConfirm.toLowerCase() === target.id.toLowerCase() && rPw.length > 0);
  const closeRestore = () => { if (restoreRef.current) return; setTarget(null); setRPw(''); setRConfirm(''); setRError(''); };
  async function doRestore(e: React.FormEvent) {
    e.preventDefault();
    if (!target || !canRestore || restoreRef.current) return;
    restoreRef.current = true; setRError('');
    const pw = rPw; setRPw('');
    try {
      await restore.mutateAsync({ id: target.id, data: { password: pw, confirmation: rConfirm } });
      toast({ title: t('بدأت الاستعادة بعد إنشاء نسخة أمان. تابع الحالة أدناه.', 'Restore started after a safety backup. Follow the status below.') });
      restoreRef.current = false; closeRestore();
      void dash.refetch();
    } catch (err) { setRError(errText(err)); }
    finally { restoreRef.current = false; }
  }

  const reasonLabel = (r: string) => ({
    manual: t('يدوي', 'Manual'), scheduled: t('مجدول', 'Scheduled'),
    pre_restore: t('أمان قبل الاستعادة', 'Pre-restore safety'), restore: t('عملية استعادة', 'Restore job'),
  } as Record<string, string>)[r] ?? r;
  const statusLabel = (s: string) => ({
    queued: t('في الانتظار', 'Queued'), running: t('قيد التنفيذ', 'Running'),
    completed: t('مكتمل', 'Completed'), failed: t('فشل', 'Failed'),
  } as Record<string, string>)[s] ?? s;
  const days = [t('الأحد', 'Sunday'), t('الاثنين', 'Monday'), t('الثلاثاء', 'Tuesday'), t('الأربعاء', 'Wednesday'), t('الخميس', 'Thursday'), t('الجمعة', 'Friday'), t('السبت', 'Saturday')];

  if (meLoading) return <div className="space-y-4"><div className="h-10 w-64 animate-pulse rounded bg-muted" /><div className="h-48 animate-pulse rounded-xl bg-muted" /></div>;
  if (!isSuper) {
    return <div className="rounded-xl border border-dashed p-10 text-center" data-testid="text-backups-forbidden"><ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><h1 className="text-xl font-bold">{t('هذا القسم للمشرف الأعلى فقط', 'Superadmin only')}</h1><p className="mt-1 text-muted-foreground">{t('لا تملك صلاحية الوصول إلى النسخ الاحتياطية.', 'You do not have access to backups.')}</p></div>;
  }

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-3xl font-bold">{t('النسخ الاحتياطي', 'Backups')}</h1><p className="mt-1 text-muted-foreground">{t('نسخ كامل للبيانات والملفات المرفوعة، مع جدولة واستعادة من أي نسخة سابقة', 'Full data and uploaded-file backups, scheduling, and restore from any earlier snapshot')}</p></div>
      {token && <Button variant="outline" onClick={() => lock()} data-testid="button-lock-backups"><Lock className="me-2 h-4 w-4" />{t('قفل القسم', 'Lock section')}</Button>}
    </div>
  );

  if (!token) {
    return <div className="space-y-6">{header}
      <Card className="mx-auto max-w-md"><CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />{t('القسم مقفل', 'Section locked')}</CardTitle><CardDescription>{t('أدخل كلمة مرور المالك لفتح النسخ الاحتياطية. لا تُحفظ في المتصفح ويُمسح الوصول عند القفل أو الانتهاء.', 'Enter the owner password to unlock backups. It is never stored in the browser; access clears on lock or expiry.')}</CardDescription></CardHeader>
        <CardContent><form onSubmit={doUnlock} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="backup-password">{t('كلمة مرور المالك', 'Owner password')}</Label><Input id="backup-password" data-testid="input-backup-password" type="password" autoComplete="off" dir="ltr" maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {unlockError && <p role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-unlock-error"><AlertTriangle className="h-4 w-4 shrink-0" />{unlockError}</p>}
          <Button type="submit" className="w-full" disabled={!password || unlock.isPending} data-testid="button-unlock-backups">{unlock.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <LockOpen className="me-2 h-4 w-4" />}{t('فتح القسم', 'Unlock')}</Button>
        </form></CardContent></Card></div>;
  }

  if (dash.isLoading) return <div className="space-y-6">{header}<div className="h-32 animate-pulse rounded-xl bg-muted" /><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>;
  if (dash.isError || !data) {
    return <div className="space-y-6">{header}<div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center"><p className="mb-3 text-destructive">{t('تعذر تحميل النسخ الاحتياطية.', 'Could not load backups.')}</p><Button variant="outline" onClick={() => void dash.refetch()} data-testid="button-retry-backups">{t('إعادة المحاولة', 'Retry')}</Button></div></div>;
  }

  const running = all.find((b) => b.id === data.runtime.jobId) ?? all.find((b) => b.status === 'running' || b.status === 'queued');
  const restorable = (b: BackupRecord) => b.status === 'completed' && (b.reason === 'manual' || b.reason === 'scheduled' || b.reason === 'pre_restore');

  return <div className="space-y-6">
    {header}
    {expiresAt && <p className="text-xs text-muted-foreground">{t('ينتهي الوصول:', 'Access expires:')} {fmtDate(expiresAt, lang)}</p>}

    {!data.storage.ready && <div role="alert" className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" data-testid="text-storage-unavailable"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{t('مساحة التخزين غير متاحة، لذلك النسخ والجدولة معطلان.', 'Backup storage is unavailable, so backups and scheduling are disabled.')} {data.storage.reason}</span></div>}
    {data.runtime.maintenance && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800" data-testid="text-maintenance">{t('النظام في وضع الصيانة أثناء عملية نسخ أو استعادة. توجد فترة انتظار أمان مدتها 15 دقيقة لانتهاء روابط رفع الملفات السابقة قبل بدء النسخ. الاستعادة تشمل نسخة أمان وفترة انتظار أخرى، وقد تستغرق 30 دقيقة أو أكثر. لا تغلق الخادم أثناء العملية.', 'The system is in maintenance mode during a backup or restore. A 15-minute safety wait lets previously issued upload URLs expire before copying. Restore includes a safety backup and another wait, and can take 30 minutes or more. Keep the server running.')}</div>}
    {data.runtime.busy && <div className="flex items-center gap-2 rounded-xl border bg-muted/50 p-4 text-sm" data-testid="text-runtime-busy"><Loader2 className="h-4 w-4 animate-spin" /><span>{t('عملية قيد التنفيذ:', 'Operation in progress:')} {data.runtime.operation ?? ''} {running ? `(${statusLabel(running.status)})` : ''}</span></div>}

    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><DatabaseBackup className="h-5 w-5" />{t('نسخة فورية', 'Back up now')}</CardTitle><CardDescription>{t('تشمل بيانات قاعدة البيانات والملفات المرفوعة.', 'Includes database data and uploaded files.')}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="backup-label">{t('تسمية (اختياري)', 'Label (optional)')}</Label><Input id="backup-label" data-testid="input-backup-label" maxLength={100} value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <Button onClick={() => void doCreate()} disabled={busy || !storageReady || create.isPending} className="w-full sm:w-auto" data-testid="button-create-backup">{create.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <DatabaseBackup className="me-2 h-4 w-4" />}{t('إنشاء نسخة الآن', 'Create backup')}</Button>
          <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground"><p className="mb-1 font-semibold">{t('نطاق النسخة وسياسة الاستعادة:', 'Backup scope and restore policy:')}</p><ul className="list-disc ps-5">{data.exclusions.map((x) => <li key={x}>{t(arabicBackupPolicy(x), x)}</li>)}</ul></div>
        </CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" />{t('الجدولة', 'Schedule')}</CardTitle><CardDescription>{t(`بتوقيت الرياض (${TZ}).`, `Riyadh time (${TZ}).`)}</CardDescription></CardHeader>
        <CardContent><form onSubmit={doSchedule} className="space-y-4">
          <div className="flex items-center justify-between"><Label htmlFor="sch-enabled">{t('تفعيل الجدولة', 'Enable schedule')}</Label><Switch id="sch-enabled" data-testid="switch-schedule-enabled" checked={sEnabled} disabled={!storageReady} onCheckedChange={setSEnabled} /></div>
          <div className="grid grid-cols-3 gap-2">{(['once', 'daily', 'weekly'] as Freq[]).map((f) => <button key={f} type="button" data-testid={`button-freq-${f}`} onClick={() => setSFreq(f)} className={`rounded-lg border p-2 text-sm transition ${sFreq === f ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'hover:bg-muted'}`}>{f === 'once' ? t('مرة واحدة', 'Once') : f === 'daily' ? t('يومياً', 'Daily') : t('أسبوعياً', 'Weekly')}</button>)}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {sFreq === 'once' && <div className="space-y-2"><Label htmlFor="sch-date">{t('التاريخ', 'Date')}</Label><Input id="sch-date" data-testid="input-schedule-date" type="date" dir="ltr" value={sDate} onChange={(e) => setSDate(e.target.value)} /></div>}
            {sFreq === 'weekly' && <div className="space-y-2"><Label htmlFor="sch-day">{t('اليوم', 'Weekday')}</Label><select id="sch-day" data-testid="select-schedule-weekday" className="h-10 w-full rounded-md border border-input bg-background px-3" value={sDay} onChange={(e) => setSDay(Number(e.target.value))}>{days.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div>}
            <div className="space-y-2"><Label htmlFor="sch-time">{t('الوقت', 'Time')}</Label><Input id="sch-time" data-testid="input-schedule-time" type="time" dir="ltr" required value={sTime} onChange={(e) => setSTime(e.target.value)} /></div>
          </div>
          <Button type="submit" disabled={!storageReady || saveSchedule.isPending} data-testid="button-save-schedule">{saveSchedule.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t('حفظ الجدولة', 'Save schedule')}</Button>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>{t('التشغيل التالي:', 'Next run:')} <span data-testid="text-next-run">{fmtDate(data.schedule.nextRunAt, lang)}</span> · {t('آخر تشغيل:', 'Last run:')} {fmtDate(data.schedule.lastRunAt, lang)}</p>
            <p>{t('يجب أن يكون الخادم قيد التشغيل لتنفيذ النسخ في موعده؛ إن فات الموعد يُنفذ عند أول تشغيل لاحق. لا نضمن بقاء الخادم نشطاً في الاستضافة ذاتية التوسع.', 'The server must be running for on-time backups; a missed run is caught up at the next start. We do not guarantee the server stays awake on autoscaling hosts.')}</p>
          </div>
        </form></CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />{t('سجل النسخ', 'Backup history')}</CardTitle>
      <div className="flex flex-wrap items-end gap-3 pt-2">
        <div className="space-y-1"><Label htmlFor="f-from" className="text-xs">{t('من', 'From')}</Label><Input id="f-from" data-testid="input-filter-from" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="f-to" className="text-xs">{t('إلى', 'To')}</Label><Input id="f-to" data-testid="input-filter-to" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        {(from || to) && <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>{t('مسح التصفية', 'Clear')}</Button>}
      </div></CardHeader>
      <CardContent className="space-y-3">
        {!filtered.length && <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground" data-testid="text-no-backups">{all.length ? t('لا نسخ ضمن هذه التواريخ', 'No backups in this range') : t('لا توجد نسخ بعد', 'No backups yet')}</div>}
        {filtered.map((b) => <div key={b.id} className="rounded-xl border p-4" data-testid={`row-backup-${b.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2"><strong className="break-words">{b.label || reasonLabel(b.reason)}</strong><Badge variant="outline">{reasonLabel(b.reason)}</Badge><Badge variant={b.status === 'failed' ? 'destructive' : b.status === 'completed' ? 'secondary' : 'outline'} data-testid={`status-backup-${b.id}`}>{(b.status === 'running' || b.status === 'queued') && <Loader2 className="me-1 h-3 w-3 animate-spin" />}{statusLabel(b.status)}</Badge></div>
              <p className="text-xs text-muted-foreground">{fmtDate(b.createdAt, lang)}{b.completedAt ? ` → ${fmtDate(b.completedAt, lang)}` : ''}</p>
              {b.status === 'completed' && <p className="text-xs text-muted-foreground">{b.rowCount.toLocaleString('en')} {t('سجل', 'rows')} · {b.tableCount} {t('جدول', 'tables')} · {b.fileCount} {t('ملف', 'files')} · {fmtBytes(b.bytes)}</p>}
              {b.error && <p className="text-xs text-destructive">{b.error}</p>}
              <p dir="ltr" className="break-all text-start font-mono text-[11px] text-muted-foreground">{b.id}</p>
            </div>
            {restorable(b) && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setTarget(b); setRError(''); setRConfirm(''); setRPw(''); }} data-testid={`button-restore-${b.id}`}><RotateCcw className="me-2 h-4 w-4" />{t('استعادة', 'Restore')}</Button>}
          </div></div>)}
      </CardContent></Card>

    <Dialog open={Boolean(target)} onOpenChange={(o) => { if (!o) closeRestore(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'} data-testid="dialog-restore">
        <DialogHeader className="text-start"><DialogTitle>{t('استعادة نسخة احتياطية', 'Restore backup')}</DialogTitle>
          <DialogDescription>{target ? `${target.label || reasonLabel(target.reason)} — ${fmtDate(target.createdAt, lang)}` : ''}</DialogDescription></DialogHeader>
        {target && <form onSubmit={doRestore} className="space-y-4">
          <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />{t('تحذير', 'Warning')}</p>
            <p>{t('ستستبدل الاستعادة الطلبات والفواتير والمخزون والمحتوى الحالية ببيانات هذه النسخة. لا تُلغى أحداث الدفع أو الشحن الخارجية. لا تُستعاد الأسرار وبيانات الاعتماد وحالة تسليم المزودين والرموز. تُنشأ نسخة أمان للنظام إلزامياً قبل الاستعادة.', 'Restoring replaces current orders, invoices, inventory and content with this snapshot. External payment and carrier events are not undone. Security data, credentials, provider delivery state, codes and secrets are not restored. A mandatory system safety backup is created first.')}</p>
          </div>
          {preview.isLoading && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
          {preview.isError && <p role="alert" className="text-sm text-destructive" data-testid="text-preview-error">{t('تعذر التحقق من النسخة. لا يمكن الاستعادة.', 'Could not verify this backup. Restore is not possible.')} <button type="button" className="underline" onClick={() => void preview.refetch()}>{t('إعادة المحاولة', 'Retry')}</button></p>}
          {pv && <div className="rounded-lg bg-muted/60 p-3 text-sm" data-testid="text-restore-preview">
            <p>{pv.rowCount.toLocaleString('en')} {t('سجل', 'rows')} · {pv.tableCount} {t('جدول', 'tables')} · {pv.fileCount} {t('ملف', 'files')} · {fmtBytes(pv.bytes)}</p>
            {!pv.compatible && <p className="mt-1 font-semibold text-destructive">{t('غير متوافقة:', 'Incompatible:')} {pv.reason}</p>}
            {pv.exclusions.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{t('سياسة الاستعادة:', 'Restore policy:')} {pv.exclusions.map((x) => t(arabicBackupPolicy(x), x)).join('، ')}</p>}
          </div>}
          <div className="space-y-2"><Label htmlFor="restore-pw">{t('كلمة مرور المالك', 'Owner password')}</Label><Input id="restore-pw" data-testid="input-restore-password" type="password" autoComplete="off" dir="ltr" maxLength={256} value={rPw} onChange={(e) => setRPw(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="restore-confirm">{t('اكتب معرّف النسخة بالضبط للتأكيد', 'Type the exact backup ID to confirm')}</Label><p dir="ltr" className="break-all text-start font-mono text-xs text-muted-foreground">{target.id}</p><Input id="restore-confirm" data-testid="input-restore-confirmation" dir="ltr" autoComplete="off" value={rConfirm} onChange={(e) => setRConfirm(e.target.value.trim())} /></div>
          {rError && <p role="alert" className="text-sm text-destructive" data-testid="text-restore-error">{rError}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={closeRestore} disabled={restore.isPending} data-testid="button-restore-cancel">{t('إلغاء', 'Cancel')}</Button>
            <Button type="submit" variant="destructive" disabled={!canRestore || restore.isPending} data-testid="button-restore-confirm">{restore.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t('استعادة هذه النسخة', 'Restore this backup')}</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  </div>;
}
