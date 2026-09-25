import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type ProductionPlan, useGetAdminMe, useAdminListProductionFunding, useAdminSecureProductionFunds, getAdminListProductionFundingQueryKey, getAdminListProductionPlansQueryKey } from '@workspace/api-client-react';
import { Banknote, Check, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import './operations.css';

export default function AdminProductionFunding() {
  const {t,lang} = useLanguage();
  const {toast} = useToast();
  const client = useQueryClient();
  const {data:user} = useGetAdminMe();
  const allowed = hasPermission(user,'finance','view');
  const canEdit = hasPermission(user,'finance','edit');
  const funding = useAdminListProductionFunding({query:{enabled:allowed,queryKey:getAdminListProductionFundingQueryKey()}});
  const secure = useAdminSecureProductionFunds();
  const [selected,setSelected] = useState<ProductionPlan|null>(null);
  const [note,setNote] = useState('');
  const confirm = () => {
    if (!selected) return;
    secure.mutate({id:selected.id,data:{note:note.trim()}},{onSuccess:()=>{
      client.invalidateQueries({queryKey:getAdminListProductionFundingQueryKey()});
      client.invalidateQueries({queryKey:getAdminListProductionPlansQueryKey()});
      setSelected(null);setNote('');toast({title:t('تم تأكيد تأمين الإنتاج','Production funds confirmed')});
    },onError:(error)=>toast({title:t('تعذر التأكيد','Could not confirm'),description:String((error as Error).message),variant:'destructive'})});
  };
  if (user && !allowed) return <div className="op-panel op-empty">{t('ليس لديك صلاحية لعرض تمويل الإنتاج','You do not have access to production funding')}</div>;
  return <div className="op-page"><div className="op-header"><div><div className="op-kicker">MUSK ELLOLO / {t('المالية','FINANCE')}</div><h1 className="op-title">{t('تأمين الإنتاج','Production funding')}</h1><p className="op-subtitle">{t('راجع تكلفة الخطط المعتمدة وأكّد توفر الأموال صراحة قبل الجدولة.','Review approved production costs and explicitly confirm funds before scheduling.')}</p></div></div>
    <div className="op-aside mb-5"><strong className="text-foreground">{t('تأكيد تشغيلي فقط','Operational confirmation only')}</strong><br/>{t('هذا الإجراء يسجل تأكيد توفر الأموال للخطة؛ لا ينفذ تحويلاً مالياً ولا ينشئ قيداً محاسبياً.','This action records fund availability for a plan. It does not transfer money or create a ledger entry.')}</div>
    <section className="op-panel"><div className="op-panel-head"><div><h2>{t('مراجعة خطط الإنتاج','Production plans for review')}</h2><p>{t('تابع حالة التأمين وتاريخ التأكيد لكل خطة.','Track funding status and confirmation date per plan.')}</p></div><span className="op-chip" data-tone="info">{funding.data?.length??'—'} {t('خطة','plans')}</span></div>
      {funding.isLoading?<><div className="op-skeleton"/><div className="op-skeleton"/></>:funding.isError?<div className="op-empty" role="alert"><AlertTriangle/><strong>{t('تعذر تحميل بيانات التأمين','Could not load funding data')}</strong><Button variant="outline" className="mt-4" onClick={()=>funding.refetch()}>{t('إعادة المحاولة','Retry')}</Button></div>:!funding.data?.length?<div className="op-empty"><Banknote/><strong>{t('لا توجد خطط للمراجعة','No plans to review')}</strong><p>{t('ستظهر الخطط هنا عندما تتقدم دورة الإنتاج.','Plans appear here as production planning progresses.')}</p></div>:funding.data.map(plan=><div className="op-row" style={{gridTemplateColumns:'minmax(0,1.5fr) minmax(130px,.8fr) minmax(150px,.8fr) auto'}} key={plan.id} data-testid={`row-funding-${plan.id}`}>
        <div><div className="op-value">{plan.productName}</div><div className="op-meta">{plan.category} · {plan.factory} · #{plan.id}</div></div>
        <div><span className="op-label">{t('التكلفة التقديرية','Estimated cost')}</span><div className="op-value" dir="ltr">{plan.estimatedCost} SAR</div><div className="op-meta">{plan.plannedQuantity.toLocaleString()} {t('وحدة','units')}</div></div>
        <div><span className="op-label">{t('حالة الخطة / التأمين','Plan / funds')}</span><span className="op-chip" data-tone={plan.securedAt?'good':'warn'}>{plan.securedAt?t('تم التأكيد','Confirmed'):t('بانتظار التأكيد','Awaiting confirmation')}</span><div className="op-meta">{plan.securedAt?new Date(plan.securedAt).toLocaleDateString(lang==='ar'?'ar-SA-u-nu-latn':'en-GB'):plan.status.replaceAll('_',' ')}</div>{plan.fundingNote && <div className="op-meta">{plan.fundingNote}</div>}</div>
        {canEdit && !plan.securedAt && plan.status==='approved' && <Button size="sm" onClick={()=>{setSelected(plan);setNote('');}} data-testid={`button-secure-funds-${plan.id}`}><Check className="me-1 h-4 w-4"/>{t('تأكيد توفر الأموال','Confirm funds')}</Button>}
      </div>)}
    </section>
    <Dialog open={!!selected} onOpenChange={open=>{if(!open&&!secure.isPending)setSelected(null);}}><DialogContent dir={lang==='ar'?'rtl':'ltr'}><DialogHeader><DialogTitle>{t('تأكيد تأمين الإنتاج','Confirm production funding')}</DialogTitle><DialogDescription>{selected?.productName} · {selected?.estimatedCost} SAR</DialogDescription></DialogHeader><p className="text-sm text-muted-foreground">{t('أؤكد أن الأموال اللازمة لهذه الخطة متوفرة. لا يعني ذلك إجراء تحويل أو تسجيل قيد مالي.','I confirm the funds for this plan are available. This does not make a transfer or record a financial entry.')}</p><label className="op-field">{t('ملاحظة للمتابعة (اختياري)','Review note (optional)')}<textarea className="op-input" rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} data-testid="input-funding-note"/></label><div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>setSelected(null)} disabled={secure.isPending}>{t('إلغاء','Cancel')}</Button><Button onClick={confirm} disabled={secure.isPending} data-testid="button-confirm-funds">{t('تأكيد توفر الأموال','Confirm funds available')}</Button></div></DialogContent></Dialog>
  </div>;
}