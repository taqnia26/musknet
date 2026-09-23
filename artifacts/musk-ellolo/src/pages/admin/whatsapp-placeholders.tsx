import { Link } from 'wouter';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MessageCircle, Phone, RefreshCw, Unplug, Smartphone } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAdminToken } from '@/lib/auth-token';

function WhatsAppPlaceholder({
  titleAr,
  titleEn,
  descriptionAr,
  descriptionEn,
  icon: Icon,
}: {
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  icon: typeof MessageCircle;
}) {
  const { t } = useLanguage();
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <CardTitle>{t(titleAr, titleEn)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-muted-foreground">{t(descriptionAr, descriptionEn)}</p>
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {t('إدارة القوالب لم تُفعّل بعد. استخدم صندوق الوارد للمحادثات المتصلة.', 'Template management is not implemented yet. Use the inbox for connected conversations.')}
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/whatsapp/inbox">{t('فتح صندوق المحادثات', 'Open inbox')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function AdminWhatsAppTemplates() {
  return (
    <WhatsAppPlaceholder
      titleAr="قوالب WhatsApp"
      titleEn="WhatsApp templates"
      descriptionAr="جهّز القوالب النصية التي يمكن استخدامها لاحقاً في المحادثات."
      descriptionEn="Prepare message templates that can be used in conversations later."
      icon={MessageCircle}
    />
  );
}

export function AdminWhatsAppSettings() {
  const { t } = useLanguage();
  const [state, setState] = useState<{ status: string; qr: string | null; lastError?: string | null; connectionAlerted?: boolean; previouslyConnected?: boolean }>({ status: 'disconnected', qr: null, lastError: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const api = async (path: string, init?: RequestInit) => {
    const response = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken() ?? ''}`, ...(init?.headers ?? {}) } });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Request failed');
    return response.json();
  };
  const refresh = async () => {
    const id = ++requestId.current;
    try {
      const next = await api('/admin/whatsapp/status');
      if (id === requestId.current) { setState(next); setError(null); }
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : t('تعذر تحميل حالة الاتصال', 'Could not load connection status'));
    }
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3500);
    return () => { window.clearInterval(timer); requestId.current++; };
  }, []);
  const connect = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    const id = ++requestId.current;
    setState(current => ({ ...current, status: 'connecting', qr: null, lastError: null }));
    try {
      const next = await api('/admin/whatsapp/connect', { method: 'POST' });
      if (id === requestId.current) setState(next);
      await refresh();
    } catch (cause) { setState(current => ({ ...current, status: 'disconnected', qr: null })); setError(cause instanceof Error ? cause.message : t('تعذر بدء الربط', 'Could not start pairing')); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (busy || !window.confirm(t('هل تريد فصل حساب واتساب؟ ستحتاج لمسح QR من جديد عند الربط.', 'Disconnect WhatsApp? You will need to scan a new QR code to reconnect.'))) return;
    setBusy(true); ++requestId.current;
    try { setState(await api('/admin/whatsapp/disconnect', { method: 'POST' })); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('تعذر فصل واتساب', 'Could not disconnect WhatsApp')); }
    finally { setBusy(false); }
  };
  const connected = state.status === 'connected';
  const pairing = state.status === 'qr' && !!state.qr;
  const inProgress = state.status === 'connecting' || state.status === 'completing';
  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Phone className="h-6 w-6" />
        </div>
        <CardTitle>{t('واتساب الإدارة العامة', 'General Administration WhatsApp')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-muted-foreground">{t('اربط حساب واتساب بزنس عبر رمز QR مثل واتساب ويب، ثم اعرض المحادثات من صندوق الوارد.', 'Pair your WhatsApp Business account with a QR code like WhatsApp Web, then manage conversations from the inbox.')}</p>
        <div className="rounded-xl border bg-muted/30 p-4 sm:p-6" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{t('حالة الاتصال', 'Connection status')}</span><span data-testid="whatsapp-connection-status" className={connected ? 'font-semibold text-success' : 'text-muted-foreground'}>{connected ? t('متصل', 'Connected') : pairing ? t('بانتظار مسح الرمز', 'Waiting for scan') : state.status === 'completing' ? t('جارٍ إكمال الاتصال', 'Finishing connection') : state.status === 'connecting' ? t('جارٍ إنشاء الرمز أو استعادة الاتصال', 'Generating code or reconnecting') : t('غير متصل', 'Disconnected')}</span></div>
          {(state.lastError || error) && <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{state.lastError || error} {t('يمكنك الضغط على بدء الربط للمحاولة مجددًا.', 'Press Start pairing to try again.')}</p>}
          {state.connectionAlerted && !connected && <p data-testid="whatsapp-disconnect-alert" role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{t('استمر انقطاع واتساب وأُرسل تنبيه للمسؤول. قد تحتاج إلى إعادة ربط الجهاز لاستئناف رسائل العملاء.', 'WhatsApp remains disconnected and an administrator was alerted. You may need to pair the device again to resume customer messages.')}</p>}
          {pairing && <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-center">
            <div className="shrink-0 rounded-xl border bg-white p-3 shadow-sm"><img data-testid="whatsapp-pairing-qr" src={state.qr!} alt={t('رمز ربط واتساب', 'WhatsApp pairing QR code')} className="h-auto w-[min(70vw,288px)] max-w-[288px]" /></div>
            <div className="max-w-xs space-y-3 text-start text-sm"><Smartphone className="h-7 w-7 text-primary" /><h3 className="text-base font-semibold">{t('اربط جهازك بواتساب', 'Link your device with WhatsApp')}</h3>
              <ol className="list-inside list-decimal space-y-2 text-muted-foreground">
                <li>{t('افتح واتساب أو واتساب بزنس على هاتفك.', 'Open WhatsApp or WhatsApp Business on your phone.')}</li>
                <li>{t('انتقل إلى الأجهزة المرتبطة ← ربط جهاز.', 'Go to Linked devices → Link a device.')}</li>
                <li>{t('وجّه كاميرا هاتفك إلى هذا الرمز.', 'Point your phone camera at this code.')}</li>
              </ol><p className="text-muted-foreground">{t('سيُحدّث الرمز تلقائيًا عند تغيّره.', 'The code updates automatically when it changes.')}</p>
            </div>
          </div>}
          {inProgress && <div className="mt-6 flex items-center gap-3 rounded-lg border bg-background p-5 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 shrink-0 animate-spin" />{state.status === 'completing' ? t('تم مسح الرمز؛ نتحقق من فتح الجلسة...', 'Code scanned; waiting for the session to open...') : t('يرجى الانتظار حتى يظهر رمز الربط...', 'Please wait for the pairing code...')}</div>}
          {connected && <div className="mt-6 flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-5 text-success"><CheckCircle2 className="h-6 w-6" />{t('واتساب متصل وجاهز للاستخدام.', 'WhatsApp is connected and ready.')}</div>}
        </div>
        <div className="flex gap-2">
          {connected ? <Button data-testid="whatsapp-disconnect-button" variant="destructive" onClick={() => void disconnect()} disabled={busy}><Unplug className="me-2 h-4 w-4" />{t('فصل الجهاز', 'Disconnect')}</Button> : <Button data-testid="whatsapp-pairing-button" onClick={() => void connect()} disabled={busy || ((pairing || inProgress) && !error && !state.lastError)}><RefreshCw className="me-2 h-4 w-4" />{busy ? t('جارٍ البدء...', 'Starting...') : t('بدء الربط وإظهار الرمز', 'Start pairing')}</Button>}
          {busy && <Loader2 className="h-5 w-5 animate-spin self-center text-muted-foreground" />}
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
          <div className="text-sm text-muted-foreground">{t('حساب واتساب بزنس', 'WhatsApp Business account')}</div>
          <div className="mt-1 text-sm">{t('ستظهر المحادثات الجديدة في صندوق الوارد بعد الاتصال.', 'New conversations will appear in the inbox after connection.')}</div>
        </div>
      </CardContent>
    </Card>
  );
}