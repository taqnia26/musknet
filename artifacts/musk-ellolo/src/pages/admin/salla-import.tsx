import { SallaInvoiceArchive } from '@/components/admin/salla-invoice-archive';
import { useLanguage } from '@/hooks/use-language';

export default function AdminSallaImport() {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t('استيراد سلة', 'Salla Import')}</h1>
      <SallaInvoiceArchive />
    </div>
  );
}