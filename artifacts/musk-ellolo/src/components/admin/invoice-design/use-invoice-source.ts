import { useEffect, useMemo, useState } from 'react';
import {
  useAdminListInvoices, useAdminGetInvoiceQr, getAdminGetInvoiceQrQueryKey, getAdminListInvoicesQueryKey,
} from '@workspace/api-client-react';
import { sampleInvoice, type InvoiceFacts } from '@workspace/invoice-document';

export function useInvoiceSource(canInvoices: boolean, serverSampleQr?: string) {
  const [sample, setSample] = useState('short');
  const listQuery = useAdminListInvoices(undefined, {
    query: { enabled: canInvoices, queryKey: getAdminListInvoicesQueryKey() },
  });
  const list = (canInvoices && Array.isArray(listQuery.data) ? listQuery.data : []) as Array<{ id: number; invoiceNumber: string }>;
  const realId = sample.startsWith('inv:') ? Number(sample.slice(4)) : 0;
  const qrQuery = useAdminGetInvoiceQr(realId, {
    query: { enabled: realId > 0, queryKey: getAdminGetInvoiceQrQueryKey(realId) },
  });
  const [realQr, setRealQr] = useState<string | null>(null);
  useEffect(() => {
    const b = qrQuery.data;
    if (realId <= 0 || !(b instanceof Blob)) { setRealQr(null); return undefined; }
    const u = URL.createObjectURL(b);
    setRealQr(u);
    return () => URL.revokeObjectURL(u);
  }, [qrQuery.data, realId]);
  const shortInv = useMemo(() => sampleInvoice(false), []);
  const longInv = useMemo(() => sampleInvoice(true), []);
  const realInv = useMemo(
    () => (realId > 0 ? ((list.find((i) => i.id === realId) ?? null) as unknown as InvoiceFacts | null) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [realId, listQuery.data],
  );
  const sampleQr = serverSampleQr && serverSampleQr.startsWith('data:') ? serverSampleQr : null;
  return {
    sample, setSample, list, shortInv, sampleQr,
    invoice: realInv ?? (sample === 'long' ? longInv : shortInv),
    qrUrl: realInv ? realQr : sampleQr,
  };
}
