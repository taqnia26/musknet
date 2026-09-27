import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  type AnnualAgendaOccurrence, type AnnualAgendaEventInput, useGetAdminMe,
  useAdminGetB2bAnnualAgenda, useAdminCreateB2bAgendaEvent,
  useAdminUpdateB2bAgendaEvent, useAdminDeleteB2bAgendaEvent,
  getAdminGetB2bAnnualAgendaQueryKey,
} from '@workspace/api-client-react';
import { useForm } from 'react-hook-form';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { daysInMonth, eventsInMonth, eventsOnDay, isoDay, monthCells, moveMonth, upcomingEvents } from './b2b-agenda-calendar';
import './operations.css';

const types: Record<AnnualAgendaEventInput['type'], [string, string]> = {
  exhibition: ['معرض', 'Exhibition'], occasion: ['مناسبة', 'Occasion'],
  holiday: ['عطلة', 'Holiday'], launch: ['إطلاق', 'Launch'], other: ['أخرى', 'Other'],
};
const builtinsAr: Record<string, string> = {
  'Saudi Founding Day': 'يوم التأسيس السعودي',
  'Saudi National Day': 'اليوم الوطني السعودي',
  'Ramadan begins (estimated)': 'بداية رمضان (تقديري)',
  'Eid al-Fitr (estimated)': 'عيد الفطر (تقديري)',
  'Eid al-Adha (estimated)': 'عيد الأضحى (تقديري)',
};
const blank: AnnualAgendaEventInput = { title: '', type: 'exhibition', startDate: '', endDate: '', recurrence: 'none', note: null };
const today = new Date();
const currentYear = Math.min(2100, Math.max(1900, today.getFullYear()));
const todayIso = isoDay(today.getFullYear(), today.getMonth(), today.getDate());
const daysAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AdminB2bAgenda() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const client = useQueryClient();
  const { data: user, isLoading: userLoading } = useGetAdminMe();
  const canView = hasPermission(user, 'distributors', 'view');
  const canEdit = hasPermission(user, 'distributors', 'edit');
  const canDelete = hasPermission(user, 'distributors', 'delete');
  const [year, setYear] = useState(currentYear);
  const [yearDraft, setYearDraft] = useState(String(currentYear));
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(todayIso);
  const monthSectionRef = useRef<HTMLElement>(null);
  const agenda = useAdminGetB2bAnnualAgenda({ year }, { query: { enabled: canView, queryKey: getAdminGetB2bAnnualAgendaQueryKey({ year }) } });
  const create = useAdminCreateB2bAgendaEvent();
  const update = useAdminUpdateB2bAgendaEvent();
  const remove = useAdminDeleteB2bAgendaEvent();
  const [editing, setEditing] = useState<AnnualAgendaOccurrence | null>(null);
  const [open, setOpen] = useState(false);
  const form = useForm<AnnualAgendaEventInput>({ defaultValues: blank });
  const { register, reset, watch, setValue, handleSubmit } = form;
  const type = watch('type');
  const events = agenda.data ?? [];
  const dayEvents = eventsOnDay(events, selectedDay);
  const upcoming = upcomingEvents(events, year, todayIso);
  const exhibitions = upcomingEvents(events, year, todayIso, 'exhibition');
  const locale = lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB';
  const monthName = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toLocaleDateString(locale, { month: 'long' });
  const formatDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const range = (event: AnnualAgendaOccurrence) => formatDate(event.startDate) + (event.startDate.slice(0, 10) === event.endDate.slice(0, 10) ? '' : ` — ${formatDate(event.endDate)}`);
  const title = (event: AnnualAgendaOccurrence) => event.source === 'builtin' && lang === 'ar' ? builtinsAr[event.title] ?? event.title : event.title;
  const changeYear = (next: number, nextMonth = month) => {
    if (!Number.isInteger(next) || next < 1900 || next > 2100) return;
    setYear(next);
    setYearDraft(String(next));
    setMonth(nextMonth);
    setSelectedDay(next === today.getFullYear() && nextMonth === today.getMonth() ? todayIso : isoDay(next, nextMonth, 1));
  };
  const commitYear = () => {
    const next = Number(yearDraft);
    if (/^\d{4}$/.test(yearDraft) && Number.isInteger(next) && next >= 1900 && next <= 2100) changeYear(next);
    else { setYearDraft(String(year)); toast({ title: t('اختر سنة بين 1900 و2100', 'Choose a year from 1900 to 2100'), variant: 'destructive' }); }
  };
  const navigateMonth = (delta: number) => {
    const next = moveMonth(year, month, delta);
    changeYear(next.year, next.month);
  };
  const selectDate = (iso: string, y: number, m: number) => {
    if (y !== year) changeYear(y, m);
    else setMonth(m);
    setSelectedDay(iso);
  };
  const selectOverviewDate = (iso: string, m: number) => {
    selectDate(iso, year, m);
    monthSectionRef.current?.scrollIntoView({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    });
  };
  const start = (event?: AnnualAgendaOccurrence, date = selectedDay) => {
    if (!canEdit) return;
    setEditing(event ?? null);
    reset(event ? {
      title: event.title, type: event.type, startDate: event.startDate.slice(0, 10),
      endDate: event.endDate.slice(0, 10), recurrence: event.recurrence, note: event.note,
    } : { ...blank, startDate: date, endDate: date });
    setOpen(true);
  };
  const refresh = () => client.invalidateQueries({ queryKey: getAdminGetB2bAnnualAgendaQueryKey() });
  const fail = (error: unknown) => toast({ title: t('تعذر إتمام العملية', 'Action failed'), description: String((error as Error)?.message || error), variant: 'destructive' });
  const save = (values: AnnualAgendaEventInput) => {
    const data = { ...values, title: values.title.trim(), recurrence: values.type === 'exhibition' ? 'none' as const : values.recurrence, note: values.note?.trim() || null };
    if (!data.title || data.title.length > 160) { fail(t('أدخل اسماً صالحاً للحدث', 'Enter a valid event title')); return; }
    const isValidDay = (value: string) => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      return !!match && Number(match[2]) >= 1 && Number(match[2]) <= 12
        && Number(match[3]) >= 1 && Number(match[3]) <= daysInMonth(Number(match[1]), Number(match[2]) - 1);
    };
    if (!isValidDay(data.startDate) || !isValidDay(data.endDate) || data.endDate < data.startDate) {
      fail(t('تحقق من تاريخ البداية والنهاية', 'Check the start and end dates')); return;
    }
    if (data.type === 'exhibition' && (Number(data.startDate.slice(0, 4)) !== year || Number(data.endDate.slice(0, 4)) !== year)) {
      fail(t('يجب أن يقع المعرض بالكامل في السنة المختارة', 'Exhibition dates must fall within the selected year')); return;
    }
    const options = { onSuccess: () => { void refresh(); setOpen(false); toast({ title: t('حُفظ الحدث', 'Event saved') }); }, onError: fail };
    if (editing) {
      // A projected annual Feb 29 occurrence may be Feb 28 in a non-leap year.
      // Leave the original anchor untouched when projected dates were not edited.
      const projectedDatesUnchanged = editing.recurrence === 'annual_gregorian'
        && data.recurrence === 'annual_gregorian'
        && data.startDate === editing.startDate.slice(0, 10)
        && data.endDate === editing.endDate.slice(0, 10);
      const { startDate, endDate, ...rest } = data;
      update.mutate({ id: editing.id, data: projectedDatesUnchanged ? rest : { ...rest, startDate, endDate } }, options);
    } else create.mutate({ data }, options);
  };
  const destroy = (event: AnnualAgendaOccurrence) => {
    if (!canDelete || !window.confirm(t(`حذف ${title(event)}؟`, `Delete ${title(event)}?`))) return;
    remove.mutate({ id: event.id }, { onSuccess: () => { void refresh(); toast({ title: t('حُذف الحدث', 'Event deleted') }); }, onError: fail });
  };
  const eventRow = (event: AnnualAgendaOccurrence, context: string) => (
    <div className="ag-list-item" key={`${context}-${event.source}-${event.id}-${event.startDate}`} data-testid={context === 'day' ? `row-agenda-${event.id}` : `row-agenda-${context}-${event.id}`}>
      <span className="op-chip" data-tone={event.estimated ? 'warn' : event.type === 'exhibition' ? 'good' : 'info'}>{t(...types[event.type])}</span>
      <div>
        <strong>{title(event)}</strong>
        <p dir="auto">{range(event)}</p>
        {event.note && <p>{event.note}</p>}
        {event.estimated && <p>{t('تاريخ تقديري، راجع الإعلان الرسمي', 'Estimated date; check official announcement')}</p>}
        {event.recurrence === 'annual_gregorian' && <p>{t('يتكرر سنوياً', 'Repeats annually')}</p>}
      </div>
      {event.source === 'custom' && <div className="ag-list-actions">
        {canEdit && <Button size="icon" variant="ghost" aria-label={t(`تعديل ${title(event)}`, `Edit ${title(event)}`)} onClick={() => start(event)} data-testid={context === 'day' ? `button-edit-agenda-${event.id}` : `button-edit-agenda-${context}-${event.id}`}><Pencil className="h-3.5 w-3.5" /></Button>}
        {canDelete && <Button size="icon" variant="ghost" aria-label={t(`حذف ${title(event)}`, `Delete ${title(event)}`)} onClick={() => destroy(event)} disabled={remove.isPending} data-testid={context === 'day' ? `button-delete-agenda-${event.id}` : `button-delete-agenda-${context}-${event.id}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
      </div>}
    </div>
  );
  if (user && !canView) return <div className="op-panel op-empty">{t('ليس لديك صلاحية لعرض جدول الأعمال', 'You do not have access to the annual agenda')}</div>;
  const busy = userLoading || agenda.isLoading;
  const dayLabel = new Date(`${selectedDay}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return <div className="op-page b2b-agenda" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <header className="op-header"><div><div className="op-kicker">MUSK ELLOLO / B2B</div><h1 className="op-title">{t('جدول أعمال السنة', 'Annual agenda')}</h1><p className="op-subtitle">{t('خطّط للمناسبات والمعارض وإطلاقات المنتجات، يوماً بيوم.', 'Plan occasions, exhibitions and launches, day by day.')}</p></div>
      {canEdit && <Button onClick={() => start()} data-testid="button-add-agenda-event"><Plus className="me-2 h-4 w-4" />{t('إضافة حدث', 'Add event')}</Button>}</header>
    <div className="ag-toolbar">
      <div className="ag-year-control"><span className="ag-year-label">{t('سنة العمل', 'Planning year')}</span>
        <Button variant="outline" size="icon" disabled={year <= 1900} aria-label={t('السنة السابقة', 'Previous year')} onClick={() => changeYear(year - 1)} data-testid="button-previous-agenda-year"><ChevronLeft className={`h-4 w-4 ${lang === 'ar' ? 'rotate-180' : ''}`} /></Button>
        <input className="op-input" type="text" inputMode="numeric" maxLength={4} value={yearDraft} onChange={e => setYearDraft(e.target.value)} onBlur={commitYear} onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }} aria-label={t('السنة', 'Year')} data-testid="input-agenda-year" />
        <Button variant="outline" size="icon" disabled={year >= 2100} aria-label={t('السنة التالية', 'Next year')} onClick={() => changeYear(year + 1)} data-testid="button-next-agenda-year"><ChevronRight className={`h-4 w-4 ${lang === 'ar' ? 'rotate-180' : ''}`} /></Button>
      </div>
      <span className="op-meta">{t('الأحداث المضمنة للقراءة فقط · المعارض تُدخل لكل سنة', 'Built-in dates are read-only · exhibitions are entered each year')}</span>
    </div>
    {agenda.isError && !busy ? <div className="op-panel op-empty" role="alert"><AlertTriangle /><strong>{t('تعذر تحميل جدول الأعمال', 'Could not load agenda')}</strong><Button variant="outline" className="mt-4" onClick={() => agenda.refetch()} data-testid="button-retry-agenda">{t('إعادة المحاولة', 'Retry')}</Button></div> :
      <>
      <div className="ag-featured">
        <section className="op-panel" aria-label={t('الأحداث القادمة', 'Upcoming events')}><div className="ag-section-heading"><div><h2>{t('الأحداث القادمة', 'Upcoming events')}</h2><p>{t('من الآن حتى نهاية السنة المختارة', 'From now through the selected year')}</p></div><span className="op-chip">{upcoming.length}</span></div>
          {busy ? <div className="op-skeleton" /> : upcoming.length ? <div className="ag-list">{upcoming.map(e => eventRow(e, 'upcoming'))}</div> : <p className="ag-rail-empty">{events.length ? t('لا توجد أحداث قادمة في هذه السنة.', 'No upcoming events in this year.') : t('لا توجد أحداث لهذه السنة بعد.', 'No events recorded for this year yet.')}</p>}
        </section>
        <section className="op-panel" aria-label={t('المعارض القادمة', 'Upcoming exhibitions')}><div className="ag-section-heading"><div><h2>{t('المعارض القادمة', 'Upcoming exhibitions')}</h2><p>{t('مواعيد تُضاف يدوياً لكل سنة', 'Dates entered manually each year')}</p></div><span className="op-chip" data-tone="good">{exhibitions.length}</span></div>
          {busy ? <div className="op-skeleton" /> : exhibitions.length ? <div className="ag-list">{exhibitions.map(e => eventRow(e, 'exhibition'))}</div> : <p className="ag-rail-empty">{t('لا توجد معارض قادمة لهذه السنة.', 'No upcoming exhibitions for this year.')}</p>}
          <p className="ag-muted-note">{t('تواريخ رمضان والعيدين تقديرية حتى الإعلان الرسمي.', 'Ramadan and Eid dates are estimates until officially announced.')}</p>
        </section>
      </div>
      <div className="ag-layout">
        <div className="ag-main">
          <section className="op-panel ag-overview" aria-label={t('نظرة على السنة', 'Year overview')}>
            <div className="ag-section-heading"><div><h2>{t('السنة في لمحة', 'Year at a glance')}</h2><p>{t('اختر شهراً أو يوماً للانتقال إليه', 'Select a month or day to explore')}</p></div><span className="op-chip">{year}</span></div>
            {busy ? <div className="ag-mini-grid">{Array.from({ length: 12 }, (_, i) => <div className="op-skeleton" key={i} />)}</div> :
              <div className="ag-mini-grid" data-testid="grid-agenda-year">{Array.from({ length: 12 }, (_, m) => {
                const count = eventsInMonth(events, year, m).length;
                return <div className="ag-mini" data-active={month === m} key={m}>
                  <button type="button" className="ag-mini-title" onClick={() => selectOverviewDate(isoDay(year, m, 1), m)} data-testid={`button-agenda-month-${m + 1}`}><span>{monthName(year, m)}</span><span className="op-meta">{count || '—'}</span></button>
                  <div className="ag-mini-week">{(lang === 'ar' ? daysAr : daysEn).map(day => <span key={day}>{day.slice(0, lang === 'ar' ? 1 : 2)}</span>)}</div>
                  <div className="ag-mini-days">{monthCells(year, m).map(cell => {
                    const matches = cell.inMonth ? eventsOnDay(events, cell.iso) : [];
                    return cell.inMonth ? <button type="button" key={cell.iso} className="ag-mini-day" data-event={matches.length > 0} data-exhibition={matches.some(e => e.type === 'exhibition')} data-selected={selectedDay === cell.iso} data-today={todayIso === cell.iso} aria-label={formatDate(cell.iso)} aria-pressed={selectedDay === cell.iso} onClick={() => selectOverviewDate(cell.iso, m)} data-testid={`button-agenda-overview-${cell.iso}`}>{cell.day}</button> : <span key={cell.iso} aria-hidden="true" />;
                  })}</div>
                </div>;
              })}</div>}
          </section>
          <section ref={monthSectionRef} className="op-panel ag-monthly" aria-label={t('تقويم الشهر', 'Monthly calendar')}>
            <div className="ag-section-heading"><div><p>{t('تقويم الشهر', 'MONTHLY CALENDAR')}</p><h2 className="ag-month-title" data-testid="text-agenda-month">{monthName(year, month)} <span dir="ltr">{year}</span></h2></div>
              <div className="ag-month-control"><Button variant="outline" size="icon" disabled={year === 1900 && month === 0} aria-label={t('الشهر السابق', 'Previous month')} onClick={() => navigateMonth(-1)} data-testid="button-previous-agenda-month"><ChevronLeft className={`h-4 w-4 ${lang === 'ar' ? 'rotate-180' : ''}`} /></Button><Button variant="outline" size="icon" disabled={year === 2100 && month === 11} aria-label={t('الشهر التالي', 'Next month')} onClick={() => navigateMonth(1)} data-testid="button-next-agenda-month"><ChevronRight className={`h-4 w-4 ${lang === 'ar' ? 'rotate-180' : ''}`} /></Button></div></div>
            <div className="ag-weekdays">{(lang === 'ar' ? daysAr : daysEn).map(day => <span key={day}>{day}</span>)}</div>
            {busy ? <div className="ag-skeleton-grid" aria-label={t('جار تحميل التقويم', 'Loading calendar')}>{Array.from({ length: 35 }, (_, i) => <div className="op-skeleton" key={i} />)}</div> :
              <div className="ag-days" data-testid="grid-agenda-month">{monthCells(year, month).map(cell => {
                const matches = cell.inMonth ? eventsOnDay(events, cell.iso) : [];
                return <button type="button" key={cell.iso} className="ag-day" disabled={!cell.inMonth} data-outside={!cell.inMonth} data-selected={selectedDay === cell.iso} data-today={todayIso === cell.iso} aria-pressed={cell.inMonth ? selectedDay === cell.iso : undefined} aria-label={`${formatDate(cell.iso)}${matches.length ? `, ${matches.length} ${t('أحداث', 'events')}` : ''}`} onClick={() => selectDate(cell.iso, cell.year, cell.month)} data-testid={`button-agenda-day-${cell.iso}`}>
                  <span className="ag-date">{cell.day}</span><span className="ag-day-events" data-has-events={matches.length > 0} data-exhibition={matches.some(e => e.type === 'exhibition')}>{matches.slice(0, 2).map(event => <span key={`${event.source}-${event.id}`} className="ag-event-pill" data-type={event.type} data-estimated={event.estimated}>{title(event)}</span>)}{matches.length > 2 && <span className="ag-more">+{matches.length - 2} {t('أخرى', 'more')}</span>}</span>
                </button>;
              })}</div>}
          </section>
        </div>
        <aside className="ag-rail">
          <section className="op-panel" aria-label={t('تفاصيل اليوم', 'Selected day details')}><div className="ag-section-heading"><div><p>{t('اليوم المحدد', 'SELECTED DAY')}</p><h2 className="ag-detail-date" data-testid="text-agenda-selected-day">{dayLabel}</h2></div><CalendarDays className="h-5 w-5 text-muted-foreground" /></div>
            {busy ? <div className="op-skeleton" /> : dayEvents.length ? <div className="ag-list">{dayEvents.map(e => eventRow(e, 'day'))}</div> : <p className="ag-rail-empty">{t('لا توجد أحداث في هذا اليوم.', 'No events scheduled for this day.')}</p>}
            {canEdit && <div className="ag-muted-note"><Button size="sm" variant="outline" onClick={() => start(undefined, selectedDay)} data-testid="button-add-agenda-on-day"><Plus className="me-1 h-3.5 w-3.5" />{t('أضف حدثاً لهذا اليوم', 'Add event to this day')}</Button></div>}
          </section>
        </aside>
      </div></>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir={lang === 'ar' ? 'rtl' : 'ltr'} className="sm:max-w-xl"><DialogHeader><DialogTitle>{editing ? t('تعديل الحدث', 'Edit event') : t('حدث جديد', 'New event')}</DialogTitle><DialogDescription>{t('الأحداث المخصصة قابلة للتعديل. أدخل المعارض لكل سنة على حدة.', 'Custom events can be edited. Enter exhibitions separately each year.')}</DialogDescription></DialogHeader>
      <Form {...form}><form onSubmit={handleSubmit(save)} className="space-y-4"><label className="op-field">{t('اسم الحدث', 'Event title')} *<input {...register('title', { required: true, maxLength: 160 })} required maxLength={160} className="op-input" data-testid="input-agenda-title" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="op-field">{t('النوع', 'Type')}<select {...register('type', { onChange: e => { if (e.target.value === 'exhibition') setValue('recurrence', 'none'); } })} className="op-input" data-testid="select-agenda-type">{Object.entries(types).map(([key, names]) => <option key={key} value={key}>{t(...names)}</option>)}</select></label><label className="op-field">{t('التكرار', 'Recurrence')}<select {...register('recurrence')} disabled={type === 'exhibition'} className="op-input" data-testid="select-agenda-recurrence"><option value="none">{t('لا يتكرر', 'No recurrence')}</option><option value="annual_gregorian">{t('سنوي ميلادي', 'Annual Gregorian')}</option></select></label>
          <label className="op-field">{t('من', 'Starts')} *<input {...register('startDate', { required: true })} type="date" required min={type === 'exhibition' ? `${year}-01-01` : undefined} max={type === 'exhibition' ? `${year}-12-31` : undefined} className="op-input" data-testid="input-agenda-start" /></label><label className="op-field">{t('إلى', 'Ends')} *<input {...register('endDate', { required: true })} type="date" required min={type === 'exhibition' ? `${year}-01-01` : undefined} max={type === 'exhibition' ? `${year}-12-31` : undefined} className="op-input" data-testid="input-agenda-end" /></label></div>
        {type === 'exhibition' && <p className="text-xs text-muted-foreground">{t('يجب أن يقع المعرض بالكامل داخل السنة المختارة ولا يتكرر تلقائياً.', 'The entire exhibition must fall within the selected year; it never repeats automatically.')}</p>}
        <label className="op-field">{t('ملاحظة', 'Note')}<textarea {...register('note')} maxLength={2000} rows={3} className="op-input" data-testid="input-agenda-note" /></label>
        <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={() => setOpen(false)} data-testid="button-cancel-agenda">{t('إلغاء', 'Cancel')}</Button><Button type="submit" disabled={create.isPending || update.isPending} data-testid="button-save-agenda">{t('حفظ الحدث', 'Save event')}</Button></div>
      </form></Form></DialogContent></Dialog>
  </div>;
}