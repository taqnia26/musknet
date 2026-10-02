import { useEffect, useState, type FormEvent } from 'react';
import {
  getAdminGetContractQueryKey,
  getAdminListContractFilesQueryKey,
  getAdminListContractsQueryKey,
  useAdminApproveDistributorContractCreditLimit,
  useAdminApproveUploadedContractCreditLimit,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type CreditSource = { kind: 'generated' | 'uploaded'; id: number; creditLimit: number | null; contractCreditLimit?: number | null };

interface CreditLimitApprovalDialogProps {
  source: CreditSource | null;
  onClose: () => void;
  onApproved: () => void;
}

export function CreditLimitApprovalDialog({ source, onClose, onApproved }: CreditLimitApprovalDialogProps) {
  const [creditLimit, setCreditLimit] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const approveGenerated = useAdminApproveDistributorContractCreditLimit();
  const approveUploaded = useAdminApproveUploadedContractCreditLimit();
  const queryClient = useQueryClient();
  const pending = approveGenerated.isPending || approveUploaded.isPending;

  useEffect(() => {
    if (!source) return;
    const currentLimit = source.creditLimit ?? (source.kind === 'generated' ? source.contractCreditLimit ?? null : null);
    setCreditLimit(currentLimit === null ? '' : String(currentLimit));
    setReason('');
    setError(null);
  }, [source]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!source) return;
    const parsedLimit = Number(creditLimit);
    if (!creditLimit.trim() || !Number.isFinite(parsedLimit) || parsedLimit < 0) {
      setError('أدخل حد ائتمان صالحاً لا يقل عن صفر.');
      return;
    }
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10 || trimmedReason.length > 500) {
      setError('سبب المراجعة مطلوب (10–500 حرف).');
      return;
    }

    setError(null);
    try {
      if (source.kind === 'generated') {
        await approveGenerated.mutateAsync({ id: source.id, data: { creditLimit: parsedLimit, reason: trimmedReason } });
        await queryClient.invalidateQueries({ queryKey: getAdminGetContractQueryKey(source.id) });
        await queryClient.invalidateQueries({ queryKey: getAdminListContractsQueryKey() });
      } else {
        await approveUploaded.mutateAsync({ id: source.id, data: { creditLimit: parsedLimit, reason: trimmedReason } });
        await queryClient.invalidateQueries({ queryKey: getAdminListContractFilesQueryKey() });
      }
      onApproved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر اعتماد حد الائتمان. حاول مجدداً.');
    }
  };

  return (
    <Dialog open={Boolean(source)} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>مراجعة حد الائتمان / Review credit limit</DialogTitle>
          <DialogDescription>
            يسجل الاعتماد اسم المراجع والوقت والسبب. لا يغيّر الملف الموقع؛ ويجب أن يطابق اعتماد العقد المولد الحد المذكور فيه.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="credit-limit-amount">حد الائتمان (ر.س)</Label>
            <Input
              id="credit-limit-amount"
              data-testid="input-credit-limit"
              type="number"
              min="0"
              step="0.01"
              value={creditLimit}
              onChange={(event) => setCreditLimit(event.target.value)}
              readOnly={source?.kind === 'generated' && source.contractCreditLimit != null}
              required
            />
            {source?.kind === 'generated' && source.contractCreditLimit != null && (
              <p className="text-xs text-muted-foreground">المبلغ مثبت في نص العقد الموقع ولا يمكن تغييره ضمن سجل الاعتماد.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="credit-limit-reason">سبب المراجعة</Label>
            <Textarea
              id="credit-limit-reason"
              data-testid="input-credit-limit-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={10}
              maxLength={500}
              required
            />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>إلغاء</Button>
            <Button type="submit" data-testid="button-approve-credit-limit" disabled={pending}>
              {pending ? 'جارٍ الحفظ...' : 'اعتماد حد الائتمان'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}