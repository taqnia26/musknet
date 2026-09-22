import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'musk-admin-mask-numeric';
const listeners = new Set<() => void>();

const getSnapshot = () =>
  typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === 'true';

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const maskNumericString = (value: string) =>
  value.replace(/[0-9٠-٩۰-۹]/g, '*');

export function useAdminNumericMask() {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const toggle = () => {
    window.localStorage.setItem(STORAGE_KEY, String(!enabled));
    listeners.forEach((listener) => listener());
  };
  return { enabled, toggle };
}