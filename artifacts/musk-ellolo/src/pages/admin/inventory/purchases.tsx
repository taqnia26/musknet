import { useLanguage } from '@/hooks/use-language';
import { PurchaseReceiptForm } from '@/components/admin/purchase-receipt-form';
import { PackageOpen } from 'lucide-react';

export default function AdminInventoryPurchases() {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <PackageOpen className="h-7 w-7 text-primary" />
          {t('مشتريات واستلامات المخزون', 'Inventory Purchases & Receipts')}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {t('إدارة استلام البضائع من الموردين وتحديث التكاليف', 'Manage receiving goods from vendors and update costs')}
        </p>
      </div>
      <PurchaseReceiptForm />
    </div>
  );
}
