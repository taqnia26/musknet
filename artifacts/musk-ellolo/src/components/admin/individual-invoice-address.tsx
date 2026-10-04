import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/hooks/use-language';
import { countryForCity } from '@/lib/city-country';

export const INVOICE_COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const name = (code: string, lang: string) => new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
const codes = INVOICE_COUNTRY_CODES;
export const countryDisplayName = (code: string, lang: string) => name(code, lang);
export const emptyInvoiceAddress = () => ({ country: 'SA', city: '', shortCode: '', details: '' });
export type InvoiceAddress = ReturnType<typeof emptyInvoiceAddress>;
export const formatInvoiceAddress = (a: InvoiceAddress, lang: string) =>
  [name(a.country, lang), a.city.trim(), a.country === 'SA' ? a.shortCode.trim().toUpperCase() : a.details.trim()].filter(Boolean).join(' — ');
const normalize = (v: string) => v.trim().toLowerCase().normalize('NFKC').replace(/[أإآ]/g, 'ا').replace(/\s+/g, ' ');

export function IndividualInvoiceAddress({ value, onChange }: { value: InvoiceAddress; onChange: (v: InvoiceAddress) => void }) {
  const { lang, t } = useLanguage();
  const [notice, setNotice] = useState('');
  const current = useRef({ value, onChange });
  current.current = { value, onChange };
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    setNotice('');
    const city = value.city.trim();
    if (city.length < 2) return () => controller.abort();
    const timer = setTimeout(async () => {
      try {
        const local = countryForCity(city, 'en');
        let country = local ? codes.find(c => name(c, 'en') === local) : undefined;
        if (!country) {
          const params = new URLSearchParams({ name: city, count: '10', language: lang, format: 'json' });
          const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal: controller.signal });
          if (!response.ok) throw new Error('lookup');
          const data = await response.json() as { results?: { name: string; country_code: string }[] };
          const matches = new Set((data.results ?? []).filter(r => normalize(r.name) === normalize(city)).map(r => r.country_code));
          if (matches.size === 1) country = [...matches][0];
        }
        if (controller.signal.aborted) return;
        if (country && codes.includes(country)) {
          const next = current.current;
          next.onChange({ ...next.value, country,
            ...(country !== next.value.country ? { shortCode: '', details: '' } : {}) });
          setNotice(t(`تم اختيار ${name(country, 'ar')} حسب المدينة، ويمكنك تغييرها.`, `${name(country, 'en')} selected from the city; you can change it.`));
        } else setNotice(t('تعذر تحديد الدولة دون التباس؛ اخترها من القائمة.', 'Country could not be identified unambiguously; select it manually.'));
      } catch {
        if (!controller.signal.aborted) setNotice(t('تعذر البحث عن المدينة؛ اختر الدولة يدوياً.', 'City lookup unavailable; select the country manually.'));
      }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value.city, lang]);
  return <>
    <div className="space-y-2"><Label htmlFor="invoice-country">{t('الدولة', 'Country')}</Label>
      <select id="invoice-country" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value.country} onChange={e => {
        pending.current?.abort(); setNotice('');
        onChange({ ...value, country: e.target.value, shortCode: '', details: '' });
      }}>{codes.map(code => ({ code, label: name(code, lang) })).sort((a, b) => a.label.localeCompare(b.label, lang)).map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select>
    </div>
    <div className="space-y-2"><Label htmlFor="invoice-city">{t('المدينة', 'City')}</Label><Input id="invoice-city" maxLength={150} value={value.city} onChange={e => onChange({ ...value, city: e.target.value })} /></div>
    {notice && <p role="status" className="sm:col-span-2 text-xs text-muted-foreground">{notice}</p>}
    {value.country === 'SA'
      ? <div className="space-y-2 sm:col-span-2"><Label htmlFor="invoice-short-address">{t('العنوان الوطني المختصر', 'National address short code')}</Label><Input id="invoice-short-address" dir="ltr" maxLength={8} placeholder="ABCD1234" value={value.shortCode} onChange={e => onChange({ ...value, shortCode: e.target.value.toUpperCase().replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))) })} /></div>
      : <div className="space-y-2 sm:col-span-2"><Label htmlFor="invoice-address-details">{t('تفاصيل العنوان', 'Address details')}</Label><Input id="invoice-address-details" maxLength={650} value={value.details} onChange={e => onChange({ ...value, details: e.target.value })} /></div>}
  </>;
}