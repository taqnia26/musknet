import { useEffect, useState } from 'react';
import { useAdminListSiteContent, useAdminUpsertSiteContent, getAdminListSiteContentQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Save, Building2, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const defaultSellerLegalProfile = {
  sellerName: '',
  sellerCrNumber: '',
  sellerCrDate: '',
  sellerCrIssuer: '',
  sellerAddress: '',
  sellerRepName: '',
  sellerRepTitle: ''
};

export default function AdminSiteContent() {
  const { data: content, isLoading } = useAdminListSiteContent();
  const upsert = useAdminUpsertSiteContent();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [localItems, setLocalItems] = useState<{ key: string; data: string; isNew?: boolean }[]>([]);
  const [sellerLegalProfile, setSellerLegalProfile] = useState(defaultSellerLegalProfile);

  useEffect(() => {
    if (content) {
      setLocalItems(content.filter(c => c.key !== 'seller_legal_profile').map(c => ({
        key: c.key,
        data: typeof c.data === 'string' ? c.data : JSON.stringify(c.data, null, 2)
      })));

      const legalProfile = content.find(c => c.key === 'seller_legal_profile');
      if (legalProfile && typeof legalProfile.data === 'object' && legalProfile.data) {
        setSellerLegalProfile({ ...defaultSellerLegalProfile, ...(legalProfile.data as any) });
      }
    }
  }, [content]);

  const handleSave = () => {
    // Validate legal profile fields
    const requiredLegalFields = [
      { key: 'sellerName', label: 'اسم الشركة / المؤسسة' },
      { key: 'sellerCrNumber', label: 'رقم السجل التجاري' },
      { key: 'sellerCrDate', label: 'تاريخ السجل' },
      { key: 'sellerCrIssuer', label: 'مصدر السجل' },
      { key: 'sellerAddress', label: 'العنوان الوطني / مقر الشركة' },
      { key: 'sellerRepName', label: 'الممثل القانوني الافتراضي' },
      { key: 'sellerRepTitle', label: 'صفة الممثل الافتراضي' },
    ];

    const missingFields = requiredLegalFields.filter(f => !sellerLegalProfile[f.key as keyof typeof defaultSellerLegalProfile]?.trim());
    if (missingFields.length > 0) {
      toast({
        title: 'حقول مطلوبة مفقودة / Missing required fields',
        description: `الرجاء تعبئة: ${missingFields.map(f => f.label).join('، ')}`,
        variant: 'destructive'
      });
      return;
    }

    try {
      const itemsToSave = localItems.map(item => {
        let parsedData: unknown = item.data;
        if (typeof item.data === 'string' && (item.data.trim().startsWith('{') || item.data.trim().startsWith('['))) {
          try {
            parsedData = JSON.parse(item.data);
          } catch (e) {
            // Keep as string if parsing fails
          }
        }
        return {
          key: item.key,
          data: parsedData
        };
      });

      // Always include the seller_legal_profile in the upsert
      itemsToSave.push({
        key: 'seller_legal_profile',
        data: sellerLegalProfile
      });

      upsert.mutate(
        { data: { items: itemsToSave } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getAdminListSiteContentQueryKey() });
            toast({ title: 'تم الحفظ', description: 'تم حفظ المحتوى بنجاح / Content saved successfully' });
          },
          onError: (error: any) => {
            toast({
              title: 'خطأ / Error',
              description: error?.response?.data?.error || error?.message || 'فشل في حفظ المحتوى / Failed to save content',
              variant: 'destructive'
            });
          }
        }
      );
    } catch (err: any) {
      toast({
        title: 'خطأ / Error',
        description: err?.message || 'حدث خطأ أثناء حفظ البيانات / An error occurred while saving',
        variant: 'destructive'
      });
    }
  };

  const handleAdd = () => {
    setLocalItems([{ key: '', data: '', isNew: true }, ...localItems]);
  };

  const handleRemove = (index: number) => {
    const newItems = [...localItems];
    newItems.splice(index, 1);
    setLocalItems(newItems);
  };

  const updateItem = (index: number, field: 'key' | 'data', value: string) => {
    const newItems = [...localItems];
    newItems[index][field] = value;
    setLocalItems(newItems);
  };

  const updateSellerField = (field: keyof typeof defaultSellerLegalProfile, value: string) => {
    setSellerLegalProfile(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return <div className="flex h-[200px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">محتوى الموقع / Site Content</h1>
          <p className="text-muted-foreground mt-2">إدارة نصوص ومحتويات الموقع (Staging) والبيانات المركزية</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
            إضافة مفتاح جديد
          </Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin rtl:ml-2 rtl:mr-0" />}
            <Save className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
            حفظ التغييرات
          </Button>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>البيانات القانونية المركزية للشركة</CardTitle>
          </div>
          <CardDescription>هذه البيانات ستستخدم افتراضياً عند إنشاء عقود التوزيع الجديدة</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="sellerName">اسم الشركة / المؤسسة *</Label>
            <Input
              id="sellerName"
              name="sellerName"
              required
              value={sellerLegalProfile.sellerName}
              onChange={(e) => updateSellerField('sellerName', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sellerCrNumber">رقم السجل التجاري *</Label>
            <Input
              id="sellerCrNumber"
              name="sellerCrNumber"
              required
              value={sellerLegalProfile.sellerCrNumber}
              onChange={(e) => updateSellerField('sellerCrNumber', e.target.value)}
              dir="ltr"
              className="text-right"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sellerCrDate">تاريخ السجل *</Label>
            <Input
              id="sellerCrDate"
              name="sellerCrDate"
              required
              value={sellerLegalProfile.sellerCrDate}
              onChange={(e) => updateSellerField('sellerCrDate', e.target.value)}
              dir="ltr"
              className="text-right"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sellerCrIssuer">مصدر السجل *</Label>
            <Input
              id="sellerCrIssuer"
              name="sellerCrIssuer"
              required
              value={sellerLegalProfile.sellerCrIssuer}
              onChange={(e) => updateSellerField('sellerCrIssuer', e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="sellerAddress">العنوان الوطني / مقر الشركة *</Label>
            <Input
              id="sellerAddress"
              name="sellerAddress"
              required
              value={sellerLegalProfile.sellerAddress}
              onChange={(e) => updateSellerField('sellerAddress', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sellerRepName">الممثل القانوني الافتراضي *</Label>
            <Input
              id="sellerRepName"
              name="sellerRepName"
              required
              value={sellerLegalProfile.sellerRepName}
              onChange={(e) => updateSellerField('sellerRepName', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sellerRepTitle">صفة الممثل الافتراضي *</Label>
            <Input
              id="sellerRepTitle"
              name="sellerRepTitle"
              required
              value={sellerLegalProfile.sellerRepTitle}
              onChange={(e) => updateSellerField('sellerRepTitle', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-bold">محتويات عامة (Key/Value)</h2>
        <div className="grid gap-4">
          {localItems.map((item, index) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-4">
                    <div className="space-y-2">
                      <Label>المفتاح (Key)</Label>
                      <Input
                        value={item.key}
                        onChange={(e) => updateItem(index, 'key', e.target.value)}
                        disabled={!item.isNew}
                        className="font-mono text-left"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>القيمة (Data / JSON)</Label>
                      <Textarea
                        value={item.data}
                        onChange={(e) => updateItem(index, 'data', e.target.value)}
                        rows={typeof item.data === 'string' && (item.data.trim().startsWith('{') || item.data.trim().startsWith('[')) ? 6 : 2}
                        className="font-mono text-left"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="shrink-0 mt-8" aria-label="المزيد"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleRemove(index)}><Trash2 className="h-4 w-4 mr-2" />حذف</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
          {localItems.length === 0 && (
            <div className="text-center py-12 text-muted-foreground border rounded-xl border-dashed">
              لا يوجد محتوى إضافي. أضف مفتاحاً جديداً للبدء.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}