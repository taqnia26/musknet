import { adminGetContractPdf } from '@workspace/api-client-react';

export async function downloadContractPdf(id: number, contractNumber: string): Promise<void> {
  const blob = await adminGetContractPdf(id, { responseType: 'blob' });
  if (!(blob instanceof Blob) || blob.size < 5 || !blob.type.toLowerCase().startsWith('application/pdf') ||
      new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer()) !== '%PDF-') {
    throw new Error('استجاب الخادم بملف غير صالح بصيغة PDF. حاول مجدداً أو تواصل مع المسؤول.');
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `contract-${contractNumber}.pdf`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Keep the object URL alive until the browser has started the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export function pdfDownloadError(error: unknown): string {
  if (error instanceof Error) {
    const status = 'status' in error ? Number(error.status) : 0;
    if (status === 401) return 'انتهت جلسة المدير. سجّل الدخول ثم حاول مجدداً.';
    if (status === 403) return 'ليس لديك صلاحية تنزيل هذا العقد.';
    if (status === 404) return 'العقد غير موجود أو لم يعد متاحاً.';
    return error.message;
  }
  return 'تعذر تنزيل ملف العقد. حاول مجدداً.';
}