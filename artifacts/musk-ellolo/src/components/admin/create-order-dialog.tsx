import { useMemo, useState } from 'react';
import {
  getAdminListInventoryQueryKey,
  getAdminListOrdersQueryKey,
  useAdminCreateOrder,
  useAdminListCustomers,
  useAdminListProducts,
  type AdminOrderInputPaymentMethod,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Line = { productId: string; quantity: number };

const initialAddress = {
  label: 'المنزل',
  city: 'الرياض',
  district: '',
  street: '',
  buildingNo: '',
  additionalInfo: '',
};

export function CreateOrderDialog() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: 1 }]);
  const [address, setAddress] = useState(initialAddress);
  const [shippingMethod, setShippingMethod] = useState('admin-standard');
  const [paymentMethod, setPaymentMethod] = useState<AdminOrderInputPaymentMethod>('cash');
  const [adminNotes, setAdminNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: customers } = useAdminListCustomers({ status: 'active' });
  const { data: products } = useAdminListProducts({ status: 'active' });
  const createOrder = useAdminCreateOrder();
  const availableProducts = useMemo(
    () => (products ?? []).filter((product) => product.stockQuantity > 0),
    [products],
  );

  const reset = () => {
    setCustomerId('');
    setLines([{ productId: '', quantity: 1 }]);
    setAddress(initialAddress);
    setShippingMethod('admin-standard');
    setPaymentMethod('cash');
    setAdminNotes('');
    setError(null);
  };

  const updateLine = (index: number, update: Partial<Line>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...update } : line));
  };

  const submit = () => {
    setError(null);
    if (!customerId || lines.some((line) => !line.productId || line.quantity < 1)) {
      setError(t('اختر العميل والمنتجات والكميات أولاً', 'Select a customer, products, and quantities first'));
      return;
    }
    if (!address.city.trim() || !address.district.trim() || !address.street.trim() || !address.buildingNo.trim()) {
      setError(t('أكمل عنوان الشحن', 'Complete the shipping address'));
      return;
    }
    const productIds = lines.map((line) => line.productId);
    if (new Set(productIds).size !== productIds.length) {
      setError(t('لا يمكن تكرار المنتج في الطلب', 'A product cannot be repeated in the order'));
      return;
    }

    createOrder.mutate({
      data: {
        userId: Number(customerId),
        items: lines.map((line) => ({ productId: Number(line.productId), quantity: line.quantity })),
        orderAddress: {
          ...address,
          additionalInfo: address.additionalInfo.trim() || null,
          isDefault: false,
        },
        shippingMethod,
        paymentMethod,
        adminNotes: adminNotes.trim() || null,
      },
    }, {
      onSuccess: (order) => {
        queryClient.invalidateQueries({ queryKey: getAdminListOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAdminListInventoryQueryKey() });
        toast({
          title: t('تم إنشاء الطلب', 'Order created'),
          description: `${t('رقم الطلب', 'Order number')}: ${order.orderNumber}`,
        });
        setOpen(false);
        reset();
      },
      onError: (mutationError) => {
        const message = mutationError instanceof Error ? mutationError.message : t('تعذر إنشاء الطلب', 'Unable to create order');
        setError(message);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="me-2 h-4 w-4" />
          {t('إنشاء طلب', 'Create order')}
        </Button>
      </DialogTrigger>
      <DialogContent dir={lang === 'ar' ? 'rtl' : 'ltr'} className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader className={lang === 'ar' ? 'text-right' : 'text-left'}>
          <DialogTitle>{t('إنشاء طلب جديد', 'Create a new order')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label>{t('العميل', 'Customer')}</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder={t('اختر العميل', 'Select customer')} /></SelectTrigger>
              <SelectContent>
                {(customers ?? []).map((customer) => (
                  <SelectItem key={customer.id} value={String(customer.id)}>
                    {customer.name} — <span dir="ltr">{customer.phone}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t('المنتجات', 'Products')}</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, { productId: '', quantity: 1 }])}>
                <Plus className="me-1 h-4 w-4" />{t('إضافة منتج', 'Add product')}
              </Button>
            </div>
            {lines.map((line, index) => {
              const selected = availableProducts.find((product) => String(product.id) === line.productId);
              return (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_100px_40px] gap-2">
                  <Select value={line.productId} onValueChange={(productId) => updateLine(index, { productId })}>
                    <SelectTrigger><SelectValue placeholder={t('اختر منتجاً', 'Select product')} /></SelectTrigger>
                    <SelectContent>
                      {availableProducts.map((product) => (
                        <SelectItem key={product.id} value={String(product.id)} disabled={lines.some((candidate, candidateIndex) => candidateIndex !== index && candidate.productId === String(product.id))}>
                          {lang === 'ar' ? product.nameAr : product.nameEn} ({product.stockQuantity})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    max={selected?.stockQuantity}
                    value={line.quantity}
                    onChange={(event) => updateLine(index, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                    aria-label={t('الكمية', 'Quantity')}
                  />
                  <Button type="button" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {([
              ['city', t('المدينة', 'City')],
              ['district', t('الحي', 'District')],
              ['street', t('الشارع', 'Street')],
              ['buildingNo', t('رقم المبنى', 'Building number')],
            ] as const).map(([field, label]) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={`order-${field}`}>{label}</Label>
                <Input id={`order-${field}`} value={address[field]} onChange={(event) => setAddress((current) => ({ ...current, [field]: event.target.value }))} />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-additional-info">{t('معلومات إضافية للعنوان', 'Additional address information')}</Label>
            <Input id="order-additional-info" value={address.additionalInfo} onChange={(event) => setAddress((current) => ({ ...current, additionalInfo: event.target.value }))} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('طريقة الشحن', 'Shipping method')}</Label>
              <Select value={shippingMethod} onValueChange={setShippingMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin-standard">{t('توصيل قياسي', 'Standard delivery')}</SelectItem>
                  <SelectItem value="pickup">{t('استلام', 'Pickup')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('طريقة الدفع', 'Payment method')}</Label>
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as AdminOrderInputPaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('نقدي', 'Cash')}</SelectItem>
                  <SelectItem value="bank-transfer">{t('تحويل بنكي', 'Bank transfer')}</SelectItem>
                  <SelectItem value="moyasar">{t('ميسر', 'Moyasar')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-admin-notes">{t('ملاحظات داخلية', 'Internal notes')}</Label>
            <Textarea id="order-admin-notes" value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('إلغاء', 'Cancel')}</Button>
            <Button type="button" onClick={submit} disabled={createOrder.isPending}>
              {createOrder.isPending ? t('جاري الإنشاء...', 'Creating...') : t('إنشاء الطلب', 'Create order')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}