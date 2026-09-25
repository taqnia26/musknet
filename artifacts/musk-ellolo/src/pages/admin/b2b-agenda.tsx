import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type AnnualAgendaOccurrence, type AnnualAgendaEventInput, useGetAdminMe, useAdminGetB2bAnnualAgenda, useAdminCreateB2bAgendaEvent, useAdminUpdateB2bAgendaEvent, useAdminDeleteB2bAgendaEvent, getAdminGetB2bAnnualAgendaQueryKey } from '@workspace/api-client-react';
import { useForm } from 'react-hook-form';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import './operations.css';

const types: Record<AnnualAgendaEventInput['type'],[string,string]> = {exhibition:['معرض','Exhibition'],occasion:['مناسبة','Occasion'],holiday:['عطلة','Holiday'],launch:['إطلاق','Launch'],other:['أخرى','Other']};
const builtinsAr: Record<string,string> = {
  'Saudi Founding Day': 'يوم التأسيس السعودي',
  'Saudi National Day': 'اليوم الوطني السعودي',
  'Ramadan begins (estimated)': 'بداية رمضان (تقديري)',
  'Eid al-Fitr (estimated)': 'عيد الفطر (تقديري)',
  'Eid al-Adha (estimated)': 'عيد الأضحى (تقديري)',
};
const blank:AnnualAgendaEventInput = {title:'',type:'exhibition',startDate:'',endDate:'',recurrence:'none',note:null};
export default function AdminB2bAgenda() {
  const {t,lang}=useLanguage();
  const {toast}=useToast();
  const client=useQueryClient();
  const {data:user}=useGetAdminMe();
  const canView=hasPermission(user,'distributors','view');
  const canEdit=hasPermission(user,'distributors','edit');
  const canDelete=hasPermission(user,'distributors','delete');
  const [year,setYear]=useState(new Date().getFullYear());
  const agenda=useAdminGetB2bAnnualAgenda({year},{query:{enabled:canView,queryKey:getAdminGetB2bAnnualAgendaQueryKey({year})}});
  const create=useAdminCreateB2bAgendaEvent();
  const update=useAdminUpdateB2bAgendaEvent();
  const remove=useAdminDeleteB2bAgendaEvent();
  const [editing,setEditing]=useState<AnnualAgendaOccurrence|null>(null);
  const [open,setOpen]=useState(false);
  const form=useForm<AnnualAgendaEventInput>({defaultValues:blank});
  const {register,reset,watch,setValue,handleSubmit}=form;
  const type=watch('type');
  const start=(event?:AnnualAgendaOccurrence)=>{
    setEditing(event||null);
    reset(event?{title:event.title,type:event.type,startDate:event.startDate.slice(0,10),endDate:event.endDate.slice(0,10),recurrence:event.recurrence,note:event.note}: {...blank,startDate:`${year}-01-01`,endDate:`${year}-01-01`});
    setOpen(true);
  };
  const refresh=()=>client.invalidateQueries({queryKey:getAdminGetB2bAnnualAgendaQueryKey()});
  const fail=(error:unknown)=>toast({title:t('تعذر إتمام العملية','Action failed'),description:String((error as Error)?.message||error),variant:'destructive'});
  const save=(values:AnnualAgendaEventInput)=>{
    const data={...values,title:values.title.trim(),recurrence:values.type==='exhibition'?'none' as const:values.recurrence,note:values.note?.trim()||null};
    if(data.endDate<data.startDate) { fail(t('تاريخ النهاية يسبق البداية','End date precedes start date')); return; }
    if(data.type==='exhibition' && (Number(data.startDate.slice(0,4))!==year || Number(data.endDate.slice(0,4))!==year)) { fail(t('أدخل تواريخ المعرض يدوياً داخل السنة المختارة','Enter exhibition dates manually within the selected year')); return; }
    const options={onSuccess:()=>{refresh();setOpen(false);toast({title:t('حُفظ الحدث','Event saved')});},onError:fail};
    if(editing) {
      // An annual occurrence can be projected (Feb 29 appears as Feb 28 in a
      // non-leap year). Unchanged projected dates must not replace its anchor.
      const projectedDatesUnchanged = editing.recurrence==='annual_gregorian'
        && data.recurrence==='annual_gregorian'
        && data.startDate===editing.startDate.slice(0,10)
        && data.endDate===editing.endDate.slice(0,10);
      const {startDate,endDate,...rest}=data;
      update.mutate({id:editing.id,data:projectedDatesUnchanged?rest:{...rest,startDate,endDate}},options);
    } else create.mutate({data},options);
  };
  const destroy=(event:AnnualAgendaOccurrence)=>{if(!window.confirm(t(`حذف ${event.title}؟`,`Delete ${event.title}?`)))return;remove.mutate({id:event.id},{onSuccess:()=>{refresh();toast({title:t('حُذف الحدث','Event deleted')});},onError:fail});};
  const formatDate=(value:string)=>new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString(lang==='ar'?'ar-SA-u-nu-latn':'en-GB',{day:'numeric',month:'short'});
  if(user&&!canView)return <div className="op-panel op-empty">{t('ليس لديك صلاحية لعرض جدول الأعمال','You do not have access to the annual agenda')}</div>;
  return <div className="op-page"><div className="op-header"><div><div className="op-kicker">MUSK ELLOLO / B2B</div><h1 className="op-title">{t('جدول الأعمال السنوي','Annual agenda')}</h1><p className="op-subtitle">{t('المناسبات الوطنية والدينية، المعارض وإطلاقات المنتجات في مشهد واحد.','National and religious dates, exhibitions and launches in one working calendar.')}</p></div>{canEdit&&<Button onClick={()=>start()} data-testid="button-add-agenda-event"><Plus className="me-2 h-4 w-4"/>{t('إضافة حدث','Add event')}</Button>}</div>
    <div className="op-aside mb-5">{t('تواريخ رمضان والعيدين تقديرية ويجب التحقق منها عند الإعلان الرسمي. المعارض لا تتكرر: أدخل موعد كل معرض يدوياً لكل سنة.','Ramadan and Eid dates are estimates; verify against official announcements. Exhibitions never recur: enter each exhibition date manually every year.')}</div>
    <section className="op-panel"><div className="op-panel-head"><div><h2>{t('تقويم السنة','Year at a glance')}</h2><p>{t('مواعيد مدمجة للقراءة فقط وأحداثك الخاصة قابلة للتعديل.','Built-in dates are read-only; your events can be edited.')}</p></div><div className="flex items-center gap-2"><Button variant="outline" size="icon" disabled={year<=1900} aria-label={t('السنة السابقة','Previous year')} onClick={()=>setYear(year-1)} data-testid="button-previous-agenda-year"><ChevronRight className={`h-4 w-4 ${lang==='en'?'rotate-180':''}`}/></Button><input className="op-input w-24 text-center font-semibold" type="number" min={1900} max={2100} value={year} onChange={e=>{const next=Number(e.target.value);if(next>=1900&&next<=2100)setYear(next);}} aria-label={t('السنة','Year')} data-testid="input-agenda-year"/><Button variant="outline" size="icon" disabled={year>=2100} aria-label={t('السنة التالية','Next year')} onClick={()=>setYear(year+1)} data-testid="button-next-agenda-year"><ChevronLeft className={`h-4 w-4 ${lang==='en'?'rotate-180':''}`}/></Button></div></div>
      {agenda.isLoading?<><div className="op-skeleton"/><div className="op-skeleton"/><div className="op-skeleton"/></>:agenda.isError?<div className="op-empty" role="alert"><AlertTriangle/><strong>{t('تعذر تحميل جدول الأعمال','Could not load agenda')}</strong><Button variant="outline" className="mt-4" onClick={()=>agenda.refetch()}>{t('إعادة المحاولة','Retry')}</Button></div>:!agenda.data?.length?<div className="op-empty"><CalendarDays/><strong>{t('لا توجد أحداث لهذه السنة','No events this year')}</strong><p>{t('أضف معرضاً أو مناسبة لبدء تنظيم السنة.','Add an exhibition or occasion to plan the year.')}</p></div>: [...agenda.data].sort((a,b)=>a.startDate.localeCompare(b.startDate)).map(event=><div className="op-row" style={{gridTemplateColumns:'minmax(100px,.35fr) minmax(0,1.7fr) minmax(120px,.6fr) auto'}} key={`${event.source}-${event.id}-${event.startDate}`} data-testid={`row-agenda-${event.id}`}>
        <div className="op-value" dir="ltr">{formatDate(event.startDate)}{event.endDate!==event.startDate && ` — ${formatDate(event.endDate)}`}</div><div><div className="op-value">{event.source==='builtin'&&lang==='ar'?builtinsAr[event.title]??event.title:event.title}</div><div className="op-meta">{event.estimated?t('تاريخ تقديري حسب تقويم أم القرى؛ قد يختلف الإعلان الرسمي.','Estimated from Umm al-Qura; official dates may differ.'):event.note|| (event.source==='builtin'?t('موعد ثابت','Fixed date'):t('حدث مخصص','Custom event'))}</div></div><div className="flex flex-wrap gap-1"><span className="op-chip" data-tone={event.estimated?'warn':event.source==='builtin'?'info':'good'}>{t(...types[event.type])}</span>{event.estimated&&<span className="op-chip" data-tone="warn">{t('تقديري','Estimated')}</span>}{event.recurrence==='annual_gregorian'&&<span className="op-chip">{t('سنوي ميلادي','Annual Gregorian')}</span>}</div><div className="flex gap-1">{event.source==='custom'&&canEdit&&<Button size="icon" variant="ghost" aria-label={t('تعديل','Edit')} onClick={()=>start(event)} data-testid={`button-edit-agenda-${event.id}`}><Pencil className="h-4 w-4"/></Button>}{event.source==='custom'&&canDelete&&<Button size="icon" variant="ghost" aria-label={t('حذف','Delete')} onClick={()=>destroy(event)} disabled={remove.isPending} data-testid={`button-delete-agenda-${event.id}`}><Trash2 className="h-4 w-4 text-destructive"/></Button>}</div>
      </div>)}
    </section>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir={lang==='ar'?'rtl':'ltr'} className="sm:max-w-xl"><DialogHeader><DialogTitle>{editing?t('تعديل الحدث','Edit event'):t('حدث جديد','New event')}</DialogTitle><DialogDescription>{t('الأحداث المخصصة فقط قابلة للتعديل؛ أدخل تواريخ المعارض كل سنة.','Only custom events can be edited. Enter exhibition dates each year.')}</DialogDescription></DialogHeader><Form {...form}><form onSubmit={handleSubmit(save)} className="space-y-4"><label className="op-field">{t('اسم الحدث','Event title')} *<input {...register('title',{required:true})} required maxLength={160} className="op-input" data-testid="input-agenda-title"/></label><div className="grid gap-4 sm:grid-cols-2"><label className="op-field">{t('النوع','Type')}<select {...register('type')} className="op-input" data-testid="select-agenda-type">{Object.entries(types).map(([key,names])=><option key={key} value={key}>{t(...names)}</option>)}</select></label><label className="op-field">{t('التكرار','Recurrence')}<select {...register('recurrence')} disabled={type==='exhibition'} className="op-input" data-testid="select-agenda-recurrence"><option value="none">{t('لا يتكرر','No recurrence')}</option><option value="annual_gregorian">{t('سنوي ميلادي','Annual Gregorian')}</option></select></label><label className="op-field">{t('من','Starts')} *<input {...register('startDate',{required:true})} type="date" required className="op-input" data-testid="input-agenda-start"/></label><label className="op-field">{t('إلى','Ends')} *<input {...register('endDate',{required:true})} type="date" required className="op-input" data-testid="input-agenda-end"/></label></div>{type==='exhibition'&&<p className="text-xs text-muted-foreground">{t('المعارض لا تتكرر تلقائياً. أدخل التاريخ يدوياً لكل سنة.','Exhibitions do not recur automatically. Enter a date for each year.')}</p>}<label className="op-field">{t('ملاحظة','Note')}<textarea {...register('note')} maxLength={2000} rows={3} className="op-input" data-testid="input-agenda-note"/></label><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={()=>setOpen(false)}>{t('إلغاء','Cancel')}</Button><Button type="submit" disabled={create.isPending||update.isPending}>{t('حفظ الحدث','Save event')}</Button></div></form></Form></DialogContent></Dialog>
  </div>;
}