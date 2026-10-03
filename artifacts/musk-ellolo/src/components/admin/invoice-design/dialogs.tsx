import type { ReactNode } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type Dlg = null | 'publish' | 'reset' | 'discard';

function Confirm(p: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; action: string; busy?: boolean;
  onConfirm: () => void; testId?: string; cancelId?: string; cancel?: string;
}) {
  return (
    <AlertDialog open={p.open} onOpenChange={(o) => !o && p.onClose()}>
      <AlertDialogContent dir="rtl" className="admin-theme">
        <AlertDialogHeader>
          <AlertDialogTitle>{p.title}</AlertDialogTitle>
          <AlertDialogDescription asChild><div className="space-y-2 text-right text-sm leading-6">{p.children}</div></AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel data-testid={p.cancelId}>{p.cancel ?? 'إلغاء'}</AlertDialogCancel>
          <AlertDialogAction disabled={p.busy} data-testid={p.testId} onClick={(e) => { e.preventDefault(); p.onConfirm(); }}>{p.action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type Props = {
  dlg: Dlg; close: () => void; dirty: boolean; leaveOpen: boolean; stay: () => void; leave: () => void;
  publishing: boolean; resetting: boolean; onPublish: () => void; onReset: () => void; onDiscard: () => void;
};
export function EditorDialogs(p: Props) {
  return (
    <>
      <Confirm open={p.dlg === 'publish'} onClose={p.close} title="اعتماد وتطبيق على جميع الفواتير" action={p.publishing ? 'جارٍ الاعتماد...' : 'تأكيد الاعتماد'}
        busy={p.publishing} onConfirm={p.onPublish} testId="button-confirm-publish">
        <p>سيُطبَّق هذا التصميم بصرياً على جميع الفواتير المحلية القديمة والجديدة عند عرضها أو طباعتها.</p>
        <p>لن تتغير أي أرقام أو مبالغ أو حسابات، وملفات PDF التي أُرسلت سابقاً لن تتغير.</p>
        {p.dirty && <p className="text-amber-500">سيتم حفظ تعديلاتك الحالية ضمن عملية الاعتماد.</p>}
      </Confirm>
      <Confirm open={p.dlg === 'reset'} onClose={p.close} title="استعادة التصميم الافتراضي العام" action={p.resetting ? 'جارٍ الاستعادة...' : 'استعادة الافتراضي'}
        busy={p.resetting} onConfirm={p.onReset} testId="button-confirm-reset">
        <p>سيُستبدل التصميم المعتمد والمسودة بالقالب المرجعي الافتراضي لجميع الفواتير، وستُفقد تعديلاتك غير المحفوظة. لا تتغير الأرقام أو الحسابات أو ملفات PDF المرسلة سابقاً.</p>
      </Confirm>
      <Confirm open={p.dlg === 'discard'} onClose={p.close} title="تجاهل التعديلات غير المحفوظة؟" action="تجاهل" onConfirm={p.onDiscard}>
        <p>سيعود المحرر إلى آخر مسودة محفوظة.</p>
      </Confirm>
      <Confirm open={p.leaveOpen} onClose={p.stay} title="مغادرة الصفحة؟" action="مغادرة دون حفظ" cancel="البقاء في المحرر"
        cancelId="button-stay" testId="button-leave" onConfirm={p.leave}>
        <p>لديك تعديلات غير محفوظة على تصميم الفاتورة وستفقدها عند المغادرة.</p>
      </Confirm>
    </>
  );
}
