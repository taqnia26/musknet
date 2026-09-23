export const sellerDefaults = {
  sellerName: 'مؤسسة مسك اللولو للتجارة',
  sellerCrNumber: '7003185274',
  sellerCrDate: '02/07/2011',
  sellerCrIssuer: 'وزارة التجارة',
  sellerAddress: 'الرياض، حي السليمانية، شارع امرؤ القيس، مبنى 3394، رقم إضافي 8321، الرمز البريدي 12245، العنوان المختصر RHSD3394',
  sellerRepName: '',
  sellerRepTitle: '',
};

export function sellerProfile(data: unknown): typeof sellerDefaults {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...sellerDefaults };
  const values = data as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(sellerDefaults).map(([key, fallback]) => [key, typeof values[key] === 'string' ? values[key] : fallback]),
  ) as typeof sellerDefaults;
}

export const sellerNumberLabel = (number: string) =>
  number === '7003185274' ? 'الرقم الوطني الموحد' : 'رقم السجل / الرقم الوطني الموحد (حسب الوثيقة)';