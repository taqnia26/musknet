import { useLanguage } from '@/hooks/use-language';
import { AccountLayout } from './account-layout';
import { useListAddresses, useCreateAddress, useDeleteAddress, getListAddressesQueryKey } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const addressSchema = z.object({
  label: z.string().min(1, 'مطلوب / Required'),
  city: z.string().min(2, 'مطلوب / Required'),
  district: z.string().min(2, 'مطلوب / Required'),
  street: z.string().min(2, 'مطلوب / Required'),
  buildingNo: z.string().min(1, 'مطلوب / Required'),
  additionalInfo: z.string().optional(),
  isDefault: z.boolean().optional(),
});

type AddressFormValues = z.infer<typeof addressSchema>;

export default function Addresses() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: addresses, isLoading } = useListAddresses();
  
  const createAddress = useCreateAddress();
  const deleteAddress = useDeleteAddress();
  
  const [isAdding, setIsAdding] = useState(false);

  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      label: '', city: '', district: '', street: '', buildingNo: '', additionalInfo: '', isDefault: false
    }
  });

  const onSubmit = (data: AddressFormValues) => {
    createAddress.mutate({ data }, {
      onSuccess: () => {
        toast({ title: t('تمت الإضافة', 'Added Successfully') });
        queryClient.invalidateQueries({ queryKey: getListAddressesQueryKey() });
        setIsAdding(false);
        form.reset();
      },
      onError: () => {
        toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: t('حدث خطأ أثناء الإضافة', 'Error adding address') });
      }
    });
  };

  const handleDelete = (id: number) => {
    deleteAddress.mutate({ addressId: id }, {
      onSuccess: () => {
        toast({ title: t('تم الحذف', 'Deleted Successfully') });
        queryClient.invalidateQueries({ queryKey: getListAddressesQueryKey() });
      }
    });
  };

  return (
    <AccountLayout title={t('عناوين التوصيل', 'Shipping Addresses')}>
      
      {!isAdding && (
        <div className="mb-8">
          <Button onClick={() => setIsAdding(true)} className="rounded-full">
            <Plus className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
            {t('إضافة عنوان جديد', 'Add New Address')}
          </Button>
        </div>
      )}

      {isAdding && (
        <div className="bg-background p-6 rounded-2xl border mb-8 animate-in fade-in slide-in-from-top-4">
          <h3 className="font-bold text-lg mb-6">{t('عنوان جديد', 'New Address')}</h3>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="label" render={({ field }) => (
                  <FormItem><FormLabel>{t('اسم العنوان (المنزل، العمل)', 'Address Label')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem><FormLabel>{t('المدينة', 'City')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="district" render={({ field }) => (
                  <FormItem><FormLabel>{t('الحي', 'District')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="street" render={({ field }) => (
                  <FormItem><FormLabel>{t('الشارع', 'Street')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="buildingNo" render={({ field }) => (
                  <FormItem><FormLabel>{t('رقم المبنى', 'Building No')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="additionalInfo" render={({ field }) => (
                  <FormItem><FormLabel>{t('معلومات إضافية', 'Additional Info')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="flex gap-4">
                <Button type="submit" disabled={createAddress.isPending}>
                  {createAddress.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ العنوان', 'Save Address')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsAdding(false)}>
                  {t('إلغاء', 'Cancel')}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1,2].map(i => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
        </div>
      ) : !addresses || addresses.length === 0 ? (
        !isAdding && (
          <div className="text-center p-12 bg-background rounded-2xl border border-dashed text-muted-foreground">
            <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{t('لم تقم بإضافة أي عناوين حتى الآن.', 'You haven\'t added any addresses yet.')}</p>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {addresses.map(address => (
            <div key={address.id} className="bg-background border rounded-2xl p-6 relative group">
              {address.isDefault && (
                <span className="absolute top-4 right-4 rtl:left-4 rtl:right-auto bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                  {t('الافتراضي', 'Default')}
                </span>
              )}
              <h3 className="font-bold text-lg mb-2">{address.label}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {address.buildingNo} {address.street}, {address.district}<br/>
                {address.city}<br/>
                {address.additionalInfo && <span>{address.additionalInfo}</span>}
              </p>
              
              <div className="mt-6 pt-4 border-t flex justify-end">
                <button 
                  onClick={() => handleDelete(address.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 text-sm"
                  disabled={deleteAddress.isPending}
                >
                  <Trash2 className="w-4 h-4" /> {t('حذف', 'Delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AccountLayout>
  );
}
