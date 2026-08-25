import { useSyncExternalStore } from 'react';

type LanguageState = {
  lang: 'ar' | 'en';
  setLang: (lang: 'ar' | 'en') => void;
  t: (ar: string, en: string) => string;
};

const LANG_STORAGE_KEY = 'musk-ellolo-language';

function getStoredLang(): 'ar' | 'en' {
  if (typeof window === 'undefined') return 'ar';
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  return (stored === 'ar' || stored === 'en') ? stored : 'ar';
}

let languageState: LanguageState;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

const initialLang = getStoredLang();

languageState = {
  lang: initialLang,
  setLang: (lang) => {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    languageState = {
      ...languageState,
      lang,
    };
    if (typeof document !== 'undefined') {
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
    notify();
  },
  t: (ar, en) => (languageState.lang === 'ar' ? ar : en),
};

if (typeof document !== 'undefined') {
  document.documentElement.dir = initialLang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = initialLang;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return languageState;
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
