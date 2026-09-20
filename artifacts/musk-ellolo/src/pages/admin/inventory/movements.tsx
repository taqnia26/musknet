import { useLanguage } from '@/hooks/use-language';
import { useAdminListInventoryMovements, useAdminListInventory, getAdminListInventoryMovementsQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export default function AdminInventoryMovements() {
  const { t } = useLanguage();
  const [productId, setProductId] = useState('');
  const { data: inventory } = useAdminListInventory();
  const selected = inventory?.items.find((item) => String(item.id) === productId) ?? inventory?.items[0];
  const { data: movements = [], isLoading, isError } = useAdminListInventoryMovements(selected?.id ?? 0, { query: { enabled: Boolean(selected?.id), queryKey: getAdminListInventoryMovementsQueryKey(selected?.id ?? 0) } });
  return <Card>
    <CardHeader><CardTitle>{t('سجل حركات المخزون', 'Inventory movement ledger')}</CardTitle><Input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder={t('معرف المنتج للتصفية', 'Filter by product ID')} /></CardHeader>
    <CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('التاريخ', 'Date')}</TableHead><TableHead>{t('المنتج', 'Product')}</TableHead><TableHead>{t('التغيير', 'Change')}</TableHead><TableHead>{t('قبل/بعد', 'Before/after')}</TableHead><TableHead>{t('المصدر', 'Source')}</TableHead></TableRow></TableHeader><TableBody>
      {isLoading ? <TableRow><TableCell colSpan={5} className="text-center">{t('جاري التحميل', 'Loading')}</TableCell></TableRow> : isError ? <TableRow><TableCell colSpan={5} className="text-center text-destructive">{t('تعذر التحميل', 'Could not load')}</TableCell></TableRow> : !movements.length ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t('لا توجد حركات', 'No movements')}</TableCell></TableRow> : movements.map((row) => <TableRow key={row.id}><TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell><TableCell>#{row.productId}</TableCell><TableCell>{row.quantityChange}</TableCell><TableCell>{row.quantityBefore} → {row.quantityAfter}</TableCell><TableCell>{row.sourceType || row.reason || '—'}</TableCell></TableRow>)}
    </TableBody></Table></CardContent>
  </Card>;
}