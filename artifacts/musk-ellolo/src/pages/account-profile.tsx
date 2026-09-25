import { useLanguage } from '@/hooks/use-language';
import { AccountLayout } from './account-layout';
import { useGetCurrentUser, useUpdateProfile, getGetCurrentUserQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useEffect } from 'react';

const profileSchema = z.object({
  name: z.string().min(2, 'الاسم قصير جداً / Name too short'),
  email: z.string().email('بريد غير صالح / Invalid email').or(z.literal('')).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function Profile() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const updateProfile = useUpdateProfile();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      email: '',
    }
  });

  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name || '',
        email: user.email || '',
      });
    }
  }, [user, form]);

  const onSubmit = (data: ProfileFormValues) => {
    updateProfile.mutate({ data }, {
      onSuccess: (updatedUser) => {
        toast({ title: t('تم تحديث الملف الشخصي', 'Profile Updated') });
        queryClient.setQueryData(getGetCurrentUserQueryKey(), updatedUser);
      },
      onError: () => {
        toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: t('حدث خطأ أثناء التحديث', 'Error updating profile') });
      }
    });
  };

  return (
    <AccountLayout title={t('الملف الشخصي', 'Profile')}>
      <div className="max-w-xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            
            <div className="space-y-6">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('الاسم الكريم', 'Full Name')}</FormLabel>
                  <FormControl><Input {...field} className="h-12 bg-background" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('البريد الإلكتروني (اختياري)', 'Email (Optional)')}</FormLabel>
                  <FormControl><Input type="email" {...field} className="h-12 bg-background" dir="ltr" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('رقم الجوال', 'Phone Number')}</label>
                <div className="flex items-center gap-4">
                  <Input value={user?.phone || ''} disabled className="h-12 bg-muted/50 cursor-not-allowed" dir="ltr" />
                  <span className="text-xs font-bold px-3 py-1 bg-green-100 text-green-800 rounded-full shrink-0">
                    {t('موثق', 'Verified')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{t('لا يمكن تغيير رقم الجوال بعد التوثيق.', 'Phone number cannot be changed after verification.')}</p>
              </div>
            </div>

            <Button type="submit" size="lg" className="rounded-full" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ التعديلات', 'Save Changes')}
            </Button>
          </form>
        </Form>
      </div>
    </AccountLayout>
  );
}
