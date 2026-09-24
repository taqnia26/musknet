import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/hooks/use-language';
import { switchIntakeCountry, type IntakeAddressField, type IntakeAddressValues } from '@/lib/intake-address';

const saFields: Array<[IntakeAddressField, string, string]> = [
  ['nationalAddressShortCode', 'الرمز المختصر للعنوان الوطني', 'National address short code'],
  ['district', 'الحي', 'District'],
  ['street', 'الشارع', 'Street'],
  ['buildingNo', 'رقم المبنى', 'Building number'],
  ['postalCode', 'الرمز البريدي', 'Postal code'],
  ['additionalNumber', 'الرقم الإضافي', 'Additional number'],
];

export function IntakeAddressFields({ value, onChange, errors, id }: {
  value: IntakeAddressValues;
  onChange: (field: IntakeAddressField, next: string) => void;
  errors?: Partial<Record<IntakeAddressField, string>>;
  id: string;
}) {
  const { t } = useLanguage();
  const field = (key: IntakeAddressField, ar: string, en: string) => (
    <div className="min-w-0 space-y-1" key={key}>
      <Label htmlFor={`${id}-${key}`}>{t(ar, en)} *</Label>
      <Input id={`${id}-${key}`} value={value[key]} onChange={(event) => onChange(key, event.target.value)} aria-invalid={!!errors?.[key]} aria-describedby={errors?.[key] ? `${id}-${key}-error` : undefined} />
      {errors?.[key] && <p id={`${id}-${key}-error`} role="alert" className="text-sm text-destructive">{errors[key]}</p>}
    </div>
  );
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <div className="min-w-0 space-y-1">
      <Label htmlFor={`${id}-country-mode`}>{t('الدولة', 'Country')} *</Label>
      <select id={`${id}-country-mode`} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value.country === 'SA' ? 'SA' : 'other'}
        onChange={(event) => {
          const next = switchIntakeCountry(event.target.value === 'SA' ? 'SA' : 'other');
          Object.entries(next).forEach(([key, val]) => onChange(key as IntakeAddressField, val));
        }}>
        <option value="SA">{t('السعودية', 'Saudi Arabia')}</option>
        <option value="other">{t('دولة أخرى', 'Other country')}</option>
      </select>
    </div>
    {value.country !== 'SA' && field('country', 'رمز الدولة ISO-2', 'Country ISO-2 code')}
    {field('city', 'المدينة', 'City')}
    {value.country === 'SA' ? saFields.map(([key, ar, en]) => field(key, ar, en))
      : <div className="sm:col-span-2">{field('additionalInfo', 'العنوان التفصيلي', 'Detailed address')}</div>}
  </div>;
}