import { Link } from 'wouter';
import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageCircle, Phone, RefreshCw, Unplug } from 'lucide-react';
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
  const [state, setState] = useState<{ status: string; qr: string | null }>({ status: 'disconnected', qr: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = async (path: string, init?: RequestInit) => {
    const response = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken() ?? ''}`, ...(init?.headers ?? {}) } });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Request failed');
    return response.json();
  };
  const refresh = async () => { try { setState(await api('/admin/whatsapp/status')); setError(null); } catch (cause) { setError(cause instanceof Error ? cause.message : t('تعذر تحميل حالة الاتصال', 'Could not load connection status')); } };
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 3500); return () => window.clearInterval(timer); }, []);
  const connect = async () => { setBusy(true); try { await api('/admin/whatsapp/connect', { method: 'POST' }); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : t('تعذر بدء الربط', 'Could not start pairing')); } finally { setBusy(false); } };
  const disconnect = async () => { if (!window.confirm(t('هل تريد فصل حساب واتساب؟ ستحتاج لمسح QR من جديد عند الربط.', 'Disconnect WhatsApp? You will need to scan a new QR code to reconnect.'))) return; setBusy(true); try { await api('/admin/whatsapp/disconnect', { method: 'POST' }); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : t('تعذر فصل واتساب', 'Could not disconnect WhatsApp')); } finally { setBusy(false); } };
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Phone className="h-6 w-6" />
        </div>
        <CardTitle>{t('واتساب الإدارة العامة', 'General Administration WhatsApp')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-muted-foreground">{t('اربط حساب واتساب بزنس عبر رمز QR مثل واتساب ويب، ثم اعرض المحادثات من صندوق الوارد.', 'Pair your WhatsApp Business account with a QR code like WhatsApp Web, then manage conversations from the inbox.')}</p>
        <div className="rounded-xl border bg-muted/30 p-4">
          <div className="flex items-center justify-between"><span className="font-semibold">{t('حالة الاتصال', 'Connection status')}</span><span data-testid="whatsapp-connection-status" className={state.status === 'connected' ? 'text-success' : 'text-muted-foreground'}>{state.status === 'connected' ? t('متصل', 'Connected') : state.status === 'qr' ? t('بانتظار مسح QR', 'Waiting for QR scan') : state.status === 'connecting' ? t('جاري الاتصال', 'Connecting') : t('غير متصل', 'Disconnected')}</span></div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          {state.qr && <div className="mt-5 text-center"><img data-testid="whatsapp-pairing-qr" src={state.qr} alt={t('رمز ربط واتساب', 'WhatsApp pairing QR code')} className="mx-auto rounded-lg border bg-white p-2" /><p className="mt-3 text-sm text-muted-foreground">{t('افتح واتساب بزنس ← الأجهزة المرتبطة ← ربط جهاز، ثم امسح الرمز.', 'Open WhatsApp Business → Linked devices → Link a device, then scan this code.')}</p></div>}
        </div>
        <div className="flex gap-2">
          {state.status === 'connected' ? <Button data-testid="whatsapp-disconnect-button" variant="destructive" onClick={() => void disconnect()} disabled={busy}><Unplug className="me-2 h-4 w-4" />{t('فصل الجهاز', 'Disconnect')}</Button> : <Button data-testid="whatsapp-pairing-button" onClick={() => void connect()} disabled={busy}><RefreshCw className="me-2 h-4 w-4" />{busy ? t('جاري البدء...', 'Starting...') : t('بدء الربط وإظهار QR', 'Start pairing')}</Button>}
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