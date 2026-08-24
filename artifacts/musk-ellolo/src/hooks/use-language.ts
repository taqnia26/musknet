import { useSyncExternalStore } from 'react';

type LanguageState = {
  lang: 'ar' | 'en';
  setLang: (lang: 'ar' | 'en') => void;
  t: (ar: string, en: string) => string;
};

let languageState: LanguageState;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

languageState = {
  lang: 'ar',
  setLang: (lang) => {
    languageState = {
      ...languageState,
      lang,
    };
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    notify();
  },
  t: (ar, en) => (languageState.lang === 'ar' ? ar : en),
};

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
