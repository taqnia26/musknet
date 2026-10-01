import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ConfirmationAction = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
};

/**
 * Holds the requested action until explicitly confirmed. The synchronous refs
 * guard both rapid clicks and the entire asynchronous mutation, not just renders.
 */
export function useDestructiveConfirmation() {
  const { t, lang } = useLanguage();
  const [request, setRequest] = useState<ConfirmationAction | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<ConfirmationAction | null>(null);
  const executingRef = useRef(false);
  const mountedRef = useRef(true);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current = null;
    };
  }, []);

  const confirmAction = useCallback((action: ConfirmationAction) => {
    if (!mountedRef.current || requestRef.current || executingRef.current) return;
    requestRef.current = action;
    setError(null);
    setRequest(action);
  }, []);

  const cancel = useCallback(() => {
    if (executingRef.current) return;
    requestRef.current = null;
    setRequest(null);
    setError(null);
  }, []);

  const execute = async () => {
    const action = requestRef.current;
    if (!action || executingRef.current) return;
    executingRef.current = true;
    setExecuting(true);
    setError(null);
    try {
      await action.onConfirm();
      if (mountedRef.current && requestRef.current === action) {
        requestRef.current = null;
        setRequest(null);
      }
    } catch (cause) {
      if (mountedRef.current && requestRef.current === action) {
        const apiError = cause as { data?: { error?: unknown }; message?: unknown } | null;
        const detail = apiError?.data?.error ?? apiError?.message;
        setError(typeof detail === 'string' ? detail : t('تعذر تنفيذ العملية. لم يتم تأكيد نجاحها.', 'The action failed. Its success has not been confirmed.'));
      }
    } finally {
      executingRef.current = false;
      if (mountedRef.current) setExecuting(false);
    }
  };

  const confirmationDialog = (
    <AlertDialog open={request !== null} onOpenChange={(open) => { if (!open) cancel(); }}>
      <AlertDialogContent
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className="w-[calc(100%-2rem)] max-w-lg"
        data-testid="destructive-confirmation-dialog"
        aria-busy={executing}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => { if (executingRef.current) event.preventDefault(); }}
      >
        <AlertDialogHeader className="text-start sm:text-start">
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-wrap break-words">{request?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive" data-testid="text-destructive-confirmation-error">{error}</p>}
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel ref={cancelRef} type="button" disabled={executing} onClick={cancel} data-testid="button-destructive-cancel">
            {error ? t('إغلاق', 'Close') : t('رجوع دون تنفيذ', 'Go back without changes')}
          </AlertDialogCancel>
          {/* A plain button keeps the alert open and locked during the mutation. */}
          <Button type="button" variant="destructive" disabled={executing} onClick={() => void execute()} data-testid="button-destructive-confirm">
            {executing && <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />}
            {executing ? t('جارٍ التنفيذ...', 'Processing...') : request?.confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmAction, confirmationDialog, isConfirming: request !== null };
}