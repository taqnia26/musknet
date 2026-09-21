const cityCountries: Record<string, { ar: string; en: string }> = {
  الرياض: { ar: 'السعودية', en: 'Saudi Arabia' },
  riyadh: { ar: 'السعودية', en: 'Saudi Arabia' },
  جدة: { ar: 'السعودية', en: 'Saudi Arabia' },
  جده: { ar: 'السعودية', en: 'Saudi Arabia' },
  jeddah: { ar: 'السعودية', en: 'Saudi Arabia' },
  مكة: { ar: 'السعودية', en: 'Saudi Arabia' },
  'مكة المكرمة': { ar: 'السعودية', en: 'Saudi Arabia' },
  makkah: { ar: 'السعودية', en: 'Saudi Arabia' },
  mecca: { ar: 'السعودية', en: 'Saudi Arabia' },
  المدينة: { ar: 'السعودية', en: 'Saudi Arabia' },
  'المدينة المنورة': { ar: 'السعودية', en: 'Saudi Arabia' },
  madinah: { ar: 'السعودية', en: 'Saudi Arabia' },
  medina: { ar: 'السعودية', en: 'Saudi Arabia' },
  الدمام: { ar: 'السعودية', en: 'Saudi Arabia' },
  dammam: { ar: 'السعودية', en: 'Saudi Arabia' },
  الخبر: { ar: 'السعودية', en: 'Saudi Arabia' },
  khobar: { ar: 'السعودية', en: 'Saudi Arabia' },
  الظهران: { ar: 'السعودية', en: 'Saudi Arabia' },
  dhahran: { ar: 'السعودية', en: 'Saudi Arabia' },
  الطائف: { ar: 'السعودية', en: 'Saudi Arabia' },
  taif: { ar: 'السعودية', en: 'Saudi Arabia' },
  تبوك: { ar: 'السعودية', en: 'Saudi Arabia' },
  tabuk: { ar: 'السعودية', en: 'Saudi Arabia' },
  أبها: { ar: 'السعودية', en: 'Saudi Arabia' },
  ابها: { ar: 'السعودية', en: 'Saudi Arabia' },
  abha: { ar: 'السعودية', en: 'Saudi Arabia' },
  خميسمشيط: { ar: 'السعودية', en: 'Saudi Arabia' },
  khamismushait: { ar: 'السعودية', en: 'Saudi Arabia' },
  بريدة: { ar: 'السعودية', en: 'Saudi Arabia' },
  buraydah: { ar: 'السعودية', en: 'Saudi Arabia' },
  حائل: { ar: 'السعودية', en: 'Saudi Arabia' },
  hail: { ar: 'السعودية', en: 'Saudi Arabia' },
  جازان: { ar: 'السعودية', en: 'Saudi Arabia' },
  jazan: { ar: 'السعودية', en: 'Saudi Arabia' },
  نجران: { ar: 'السعودية', en: 'Saudi Arabia' },
  najran: { ar: 'السعودية', en: 'Saudi Arabia' },
  الأحساء: { ar: 'السعودية', en: 'Saudi Arabia' },
  الاحساء: { ar: 'السعودية', en: 'Saudi Arabia' },
  alahsa: { ar: 'السعودية', en: 'Saudi Arabia' },
  الجبيل: { ar: 'السعودية', en: 'Saudi Arabia' },
  jubail: { ar: 'السعودية', en: 'Saudi Arabia' },
  دبي: { ar: 'الإمارات', en: 'United Arab Emirates' },
  dubai: { ar: 'الإمارات', en: 'United Arab Emirates' },
  ابوظبي: { ar: 'الإمارات', en: 'United Arab Emirates' },
  أبوظبي: { ar: 'الإمارات', en: 'United Arab Emirates' },
  abudhabi: { ar: 'الإمارات', en: 'United Arab Emirates' },
  الشارقة: { ar: 'الإمارات', en: 'United Arab Emirates' },
  sharjah: { ar: 'الإمارات', en: 'United Arab Emirates' },
  الكويت: { ar: 'الكويت', en: 'Kuwait' },
  kuwait: { ar: 'الكويت', en: 'Kuwait' },
  الدوحة: { ar: 'قطر', en: 'Qatar' },
  doha: { ar: 'قطر', en: 'Qatar' },
  المنامة: { ar: 'البحرين', en: 'Bahrain' },
  manama: { ar: 'البحرين', en: 'Bahrain' },
  مسقط: { ar: 'عُمان', en: 'Oman' },
  muscat: { ar: 'عُمان', en: 'Oman' },
};

function normalizeCity(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s\-_.،,]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه');
}

const normalizedCityCountries = new Map(
  Object.entries(cityCountries).map(([city, country]) => [normalizeCity(city), country]),
);

export function countryForCity(city: string, lang: 'ar' | 'en') {
  const country = normalizedCityCountries.get(normalizeCity(city));
  return country?.[lang] ?? null;
}

type GeocodingResult = {
  country?: string;
};

type GeocodingResponse = {
  results?: GeocodingResult[];
};

const globalCountryCache = new Map<string, string | null>();

export async function lookupCountryForCity(
  city: string,
  lang: 'ar' | 'en',
  signal?: AbortSignal,
) {
  const localCountry = countryForCity(city, lang);
  if (localCountry) return localCountry;

  const trimmedCity = city.trim();
  if (trimmedCity.length < 2) return null;

  const cacheKey = `${lang}:${normalizeCity(trimmedCity)}`;
  if (globalCountryCache.has(cacheKey)) return globalCountryCache.get(cacheKey) ?? null;

  const params = new URLSearchParams({
    name: trimmedCity,
    count: '1',
    language: lang,
    format: 'json',
  });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal });
  if (!response.ok) throw new Error(`City lookup failed (${response.status})`);

  const data = await response.json() as GeocodingResponse;
  const country = data.results?.[0]?.country?.trim() || null;
  globalCountryCache.set(cacheKey, country);
  return country;
}