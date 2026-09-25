import { useMemo, useState } from 'react';
import {
  getAdminListInventoryQueryKey,
  getAdminListOrdersQueryKey,
  getGetAdminShippingDashboardQueryKey,
  useAdminCreateOrder,
  useAdminListCustomers,
  useAdminListProducts,
  useAdminCreateCustomer,
  useGetAdminMe,
  getAdminListCustomersQueryKey,
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
import { sortProductsForSelection } from '@/lib/product-sort';
import { hasPermission } from '@/lib/permissions';
import { createCustomerSchema, customerPayload, customerCreateError, type CreateCustomerValues } from '@/lib/customer-create';
import { emptyIntakeAddress, type IntakeAddressField } from '@/lib/intake-address';
import { IntakeAddressFields } from './intake-address-fields';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

type Line = { productId: string; quantity: number };

const initialAddress = {
  label: 'المنزل',
  country: 'SA',
  city: 'الرياض',
  nationalAddressShortCode: '',
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
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState<{ id: number; name: string; phone: string } | null>(null);
  const customerForm = useForm<CreateCustomerValues>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: { name: '', phone: '', email: '', profileAddress: emptyIntakeAddress() },
  });

  const { data: currentUser } = useGetAdminMe();
  const { data: customers } = useAdminListCustomers({ status: 'active' });
  const { data: products } = useAdminListProducts({ status: 'active' });
  const createCustomer = useAdminCreateCustomer();
  const createOrder = useAdminCreateOrder();
  const availableProducts = useMemo(
    () => sortProductsForSelection(
      (products ?? []).filter((product) => product.stockQuantity > 0),
      lang,
    ),
    [products, lang],
  );

  const reset = () => {
    setCustomerId('');
    setLines([{ productId: '', quantity: 1 }]);
    setAddress(initialAddress);
    setShippingMethod('admin-standard');
    setPaymentMethod('cash');
    setAdminNotes('');
    setError(null);
    setAddingCustomer(false);
    setCustomerError(null);
    setNewCustomer(null);
    customerForm.reset();
  };

  const saveCustomer = (values: CreateCustomerValues) => {
    if (createCustomer.isPending || !hasPermission(currentUser, 'customers', 'edit')) return;
    setCustomerError(null);
    createCustomer.mutate({ data: customerPayload(values) }, {
      onSuccess: (customer) => {
        setNewCustomer(customer);
        setCustomerId(String(customer.id));
        queryClient.invalidateQueries({ queryKey: getAdminListCustomersQueryKey() });
        customerForm.reset();
        setAddingCustomer(false);
        toast({ title: t('تمت إضافة العميل', 'Customer added') });
      },
      onError: (cause) => setCustomerError(customerCreateError(
        cause,
        t('تحقق من البيانات والصلاحيات ثم حاول مرة أخرى', 'Check the details and permissions, then try again'),
        t('رقم الجوال مسجل لعميل آخر', 'This phone number already belongs to a customer'),
      )),
    });
  };

  const updateLine = (index: number, update: Partial<Line>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...update } : line));
  };

  const submit = () => {
    if (createOrder.isPending) return;
    setError(null);
    if (!customerId || lines.some((line) => !line.productId || line.quantity < 1)) {
      setError(t('اختر العميل والمنتجات والكميات أولاً', 'Select a customer, products, and quantities first'));
      return;
    }
    if (!address.country.trim() || !address.city.trim() ||
      (address.country === 'SA' ? !address.nationalAddressShortCode.trim() :
        !address.district.trim() || !address.street.trim() || !address.buildingNo.trim())) {
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
           label: address.label,
           country: address.country.trim(),
           city: address.city.trim(),
           nationalAddressShortCode: address.country === 'SA' ? address.nationalAddressShortCode.trim() : null,
           district: address.country === 'SA' ? '' : address.district.trim(),
           street: address.country === 'SA' ? '' : address.street.trim(),
           buildingNo: address.country === 'SA' ? '' : address.buildingNo.trim(),
           additionalInfo: address.country === 'SA' ? null : address.additionalInfo.trim() || null,
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
        queryClient.invalidateQueries({ queryKey: getGetAdminShippingDashboardQueryKey() });
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
             <div className="flex items-center justify-between gap-2">
               <Label>{t('العميل', 'Customer')}</Label>
               {hasPermission(currentUser, 'customers', 'edit') && (
                 <Button type="button" size="sm" variant="outline" onClick={() => { setAddingCustomer((value) => !value); setCustomerError(null); }} disabled={createCustomer.isPending}>
                   <Plus className="me-1 h-4 w-4" />{t('إضافة عميل', 'Add customer')}
                 </Button>
               )}
             </div>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder={t('اختر العميل', 'Select customer')} /></SelectTrigger>
              <SelectContent>
                 {newCustomer && !(customers ?? []).some((customer) => customer.id === newCustomer.id) && (
                   <SelectItem value={String(newCustomer.id)}>{newCustomer.name} — <span dir="ltr">{newCustomer.phone}</span></SelectItem>
                 )}
                {(customers ?? []).map((customer) => (
                  <SelectItem key={customer.id} value={String(customer.id)}>
                    {customer.name} — <span dir="ltr">{customer.phone}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
             {addingCustomer && hasPermission(currentUser, 'customers', 'edit') && (
               <Form {...customerForm}>
                 <form onSubmit={customerForm.handleSubmit(saveCustomer)} className="space-y-3 rounded-md border p-4">
                   <FormField control={customerForm.control} name="name" render={({ field }) => (
                     <FormItem><FormLabel>{t('اسم العميل *', 'Customer name *')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                   )} />
                   <FormField control={customerForm.control} name="phone" render={({ field }) => (
                     <FormItem><FormLabel>{t('رقم الجوال *', 'Phone number *')}</FormLabel><FormControl><Input {...field} dir="ltr" type="tel" /></FormControl><FormMessage /></FormItem>
                   )} />
                   <FormField control={customerForm.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>{t('البريد الإلكتروني *', 'Email *')}</FormLabel><FormControl><Input {...field} dir="ltr" type="email" /></FormControl><FormMessage /></FormItem>
                   )} />
                    <IntakeAddressFields id="inline-customer-address" value={customerForm.watch('profileAddress')}
                      onChange={(key: IntakeAddressField, next) => customerForm.setValue(`profileAddress.${key}`, next, { shouldValidate: true })}
                      errors={Object.fromEntries(Object.entries(customerForm.formState.errors.profileAddress ?? {}).map(([key, error]) => [key, typeof error === 'object' && error && 'message' in error ? String(error.message) : undefined]))} />
                   {customerError && <p role="alert" className="text-sm text-destructive">{customerError}</p>}
                   <Button type="submit" disabled={createCustomer.isPending}>{createCustomer.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ العميل', 'Save customer')}</Button>
                 </form>
               </Form>
             )}
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
             <div className="space-y-2">
               <Label>{t('الدولة *', 'Country *')}</Label>
               <Select value={address.country === 'SA' ? 'SA' : 'other'} onValueChange={(value) => setAddress((current) => ({
                 ...current, country: value === 'SA' ? 'SA' : '', nationalAddressShortCode: '',
                 district: '', street: '', buildingNo: '', additionalInfo: '', city: '',
               }))}>
                 <SelectTrigger aria-label={t('الدولة', 'Country')}><SelectValue /></SelectTrigger>
                 <SelectContent>
                   <SelectItem value="SA">{t('السعودية', 'Saudi Arabia')}</SelectItem>
                   <SelectItem value="other">{t('دولة أخرى', 'Other country')}</SelectItem>
                 </SelectContent>
               </Select>
             </div>
             {address.country !== 'SA' && (
               <div className="space-y-2">
                 <Label htmlFor="order-country-name">{t('اسم الدولة *', 'Country name *')}</Label>
                 <Input id="order-country-name" value={address.country} onChange={(event) => setAddress((current) => ({ ...current, country: event.target.value }))} />
               </div>
             )}
             {([
               ['city', t('المدينة *', 'City *')],
               ...(address.country === 'SA'
                 ? [['nationalAddressShortCode', t('الرمز المختصر للعنوان الوطني *', 'National address short code *')]]
                 : [['district', t('الحي *', 'District *')], ['street', t('الشارع *', 'Street *')], ['buildingNo', t('رقم المبنى *', 'Building number *')]]),
             ] as Array<[keyof typeof initialAddress, string]>).map(([field, label]) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={`order-${field}`}>{label}</Label>
                <Input id={`order-${field}`} value={address[field]} onChange={(event) => setAddress((current) => ({ ...current, [field]: event.target.value }))} />
              </div>
            ))}
          </div>
           {address.country !== 'SA' && <div className="space-y-2">
            <Label htmlFor="order-additional-info">{t('معلومات إضافية للعنوان', 'Additional address information')}</Label>
            <Input id="order-additional-info" value={address.additionalInfo} onChange={(event) => setAddress((current) => ({ ...current, additionalInfo: event.target.value }))} />
           </div>}

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