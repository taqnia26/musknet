import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';

/** Guards reload, internal link clicks and browser back/forward while dirty. */
export function useLeaveGuard(dirty: boolean) {
  const [, setLocation] = useLocation();
  const [pending, setPending] = useState<string | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const sentinel = useRef(false);

  useEffect(() => {
    if (dirty && !sentinel.current) {
      sentinel.current = true;
      window.history.pushState({ invoiceDesignGuard: true }, '', window.location.href);
    }
    if (!dirty) sentinel.current = false;
  }, [dirty]);

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank') return;
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('/') || href === window.location.pathname) return;
      e.preventDefault(); e.stopPropagation();
      setPending(href);
    };
    const onPop = () => {
      if (!dirtyRef.current) return;
      // Back consumed our sentinel entry: restore it and ask first.
      window.history.pushState({ invoiceDesignGuard: true }, '', window.location.href);
      setPending('::back');
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  const stay = useCallback(() => setPending(null), []);
  const leave = useCallback(() => {
    const target = pending;
    dirtyRef.current = false;
    setPending(null);
    if (target === '::back') window.history.go(-2);
    else if (target) setLocation(target);
  }, [pending, setLocation]);

  return { open: !!pending, stay, leave };
}
