import * as z from 'zod';

export const emptyIntakeAddress = () => ({
  country: 'SA', city: '', nationalAddressShortCode: '', district: '', street: '',
  buildingNo: '', postalCode: '', additionalNumber: '', additionalInfo: '',
});
export type IntakeAddressValues = ReturnType<typeof emptyIntakeAddress>;
export type IntakeAddressField = keyof IntakeAddressValues;
export const switchIntakeCountry = (country: 'SA' | 'other'): IntakeAddressValues => ({
  ...emptyIntakeAddress(), country: country === 'SA' ? 'SA' : '',
});

export const intakeAddressSchema = z.object({
  country: z.string(), city: z.string(), nationalAddressShortCode: z.string(),
  district: z.string(), street: z.string(), buildingNo: z.string(),
  postalCode: z.string(), additionalNumber: z.string(), additionalInfo: z.string(),
}).superRefine((address, ctx) => {
  const required: IntakeAddressField[] = address.country === 'SA'
    ? ['city', 'nationalAddressShortCode', 'district', 'street', 'buildingNo', 'postalCode', 'additionalNumber']
    : ['city', 'additionalInfo'];
  const region = /^[A-Z]{2}$/.test(address.country)
    ? new Intl.DisplayNames(['en'], { type: 'region' }).of(address.country) : undefined;
  if (!region || region === address.country || region === 'Unknown Region')
    ctx.addIssue({ code: 'custom', path: ['country'], message: 'اختر دولة صالحة / Choose a valid country' });
  required.forEach((key) => {
    if (!address[key].trim()) ctx.addIssue({ code: 'custom', path: [key], message: 'هذا الحقل مطلوب / Required' });
  });
});

export function intakeAddressPayload(address: IntakeAddressValues) {
  const trimmed = Object.fromEntries(Object.entries(address).map(([key, value]) => [key, value.trim()])) as IntakeAddressValues;
  return trimmed.country === 'SA'
    ? { ...trimmed, additionalInfo: null }
    : { ...trimmed, nationalAddressShortCode: null, district: null, street: null, buildingNo: null, postalCode: null, additionalNumber: null };
}