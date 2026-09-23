import { useState, useRef } from 'react';
import { useRoute, Link } from 'wouter';
import { 
  useAdminGetContract, 
  getAdminGetContractQueryKey, 
  useAdminSignContract,
  useAdminRequestContractSignatureUpload,
  useAdminSendContract,
  useAdminCancelContract,
  DistributorContractStatus
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, FileText, CheckCircle, Clock, Ban, Download, PenTool, Upload, Send, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { sellerNumberLabel } from './seller-defaults';
import { downloadContractPdf, pdfDownloadError } from './download-pdf';

const statusMap: Record<DistributorContractStatus, { label: string, variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: any, color: string }> = {
  draft: { label: 'مسودة', variant: 'secondary', icon: FileText, color: 'text-muted-foreground' },
  seller_signed: { label: 'موقع (البائع)', variant: 'outline', icon: CheckCircle, color: 'text-primary' },
  sent: { label: 'مرسل (بانتظار المشتري)', variant: 'default', icon: Clock, color: 'text-blue-500' },
  final: { label: 'نهائي (موقع)', variant: 'secondary', icon: CheckCircle, color: 'text-success' },
  cancelled: { label: 'ملغى', variant: 'destructive', icon: Ban, color: 'text-destructive' },
};

export default function AdminContractDetail() {
  const [, params] = useRoute('/admin/contracts/:id');
  const id = parseInt(params?.id || '0', 10);
  
  const { data: contract, isLoading } = useAdminGetContract(id, { query: { enabled: !!id, queryKey: getAdminGetContractQueryKey(id) } });
  
  const requestUpload = useAdminRequestContractSignatureUpload();
  const signContract = useAdminSignContract();
  const sendContract = useAdminSendContract();
  const cancelContract = useAdminCancelContract();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [signingUrl, setSigningUrl] = useState<string | null>(null);

  if (isLoading) {
    return <div className="flex h-[400px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!contract) {
    return <div className="text-center py-12">لم يتم العثور على العقد</div>;
  }

  const statusInfo = statusMap[contract.status as DistributorContractStatus] || statusMap.draft;
  const StatusIcon = statusInfo.icon;

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true);
       await downloadContractPdf(id, contract.contractNumber);
      toast({ title: 'نجاح', description: 'تم تحميل الملف بنجاح' });
    } catch (err) {
       toast({ title: 'تعذر تحميل PDF', description: pdfDownloadError(err), variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      
      // 1. Request upload URL
      const uploadData = await requestUpload.mutateAsync({
        data: {
          name: file.name,
          size: file.size,
          contentType: file.type as any
        }
      });
      
      // 2. Upload file to signed URL
      await fetch(uploadData.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });
      
      // 3. Sign contract with object path
      await signContract.mutateAsync({
        id,
        data: { signaturePath: uploadData.objectPath }
      });
      
      queryClient.invalidateQueries({ queryKey: getAdminGetContractQueryKey(id) });
      toast({ title: 'تم التوقيع', description: 'تم توقيع العقد من قبل البائع بنجاح' });
    } catch (err) {
      toast({ title: 'خطأ', description: 'فشل في رفع التوقيع أو توقيع العقد', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = () => {
    sendContract.mutate(
      { id },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getAdminGetContractQueryKey(id) });
          setSigningUrl(data.signingUrl);
          toast({ title: 'تم الإرسال', description: 'تم إنشاء رابط التوقيع للمشتري' });
        },
        onError: () => {
          toast({ title: 'خطأ', description: 'لا يمكن إرسال العقد', variant: 'destructive' });
        }
      }
    );
  };

  const handleCancel = () => {
    if (!confirm('هل أنت متأكد من إلغاء هذا العقد؟')) return;
    
    cancelContract.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminGetContractQueryKey(id) });
          toast({ title: 'تم الإلغاء', description: 'تم إلغاء العقد بنجاح' });
        },
        onError: () => {
          toast({ title: 'خطأ', description: 'فشل في إلغاء العقد', variant: 'destructive' });
        }
      }
    );
  };

  const copySigningUrl = () => {
    if (signingUrl) {
      navigator.clipboard.writeText(signingUrl);
      toast({ title: 'تم النسخ', description: 'تم نسخ الرابط للحافظة' });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex items-center gap-4">
        <Link href="/admin/contracts">
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full">
            <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{contract.buyerCompanyName}</h1>
            <Badge
              variant={statusInfo.variant}
              className={contract.status === 'final' ? 'gap-1.5 h-6 border-transparent bg-success text-success-foreground' : 'gap-1.5 h-6'}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {statusInfo.label}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 font-mono text-sm" dir="ltr">{contract.contractNumber}</p>
        </div>
        
        <div className="flex-1" />
        
        <div className="flex gap-2">
          {contract.status === 'draft' && (
            <Link href={`/admin/contracts/${contract.id}/edit`}>
              <Button variant="outline" className="gap-2">
                <PenTool className="h-4 w-4" />
                تعديل العقد
              </Button>
            </Link>
          )}
          
          <Button variant="outline" className="gap-2" onClick={handleDownloadPdf} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            تحميل PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>تفاصيل البائع (الشركة)</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground mb-1">اسم الشركة</div>
                <div className="font-medium">{contract.sellerName}</div>
              </div>
              <div>
                 <div className="text-muted-foreground mb-1">{sellerNumberLabel(contract.sellerCrNumber)}</div>
                <div className="font-medium font-mono">{contract.sellerCrNumber}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">الممثل</div>
                <div className="font-medium">{contract.sellerRepName}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">الصفة</div>
                <div className="font-medium">{contract.sellerRepTitle}</div>
              </div>
              <div className="col-span-2">
                <div className="text-muted-foreground mb-1">العنوان</div>
                <div className="font-medium">{contract.sellerAddress}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>تفاصيل المشتري (الموزع)</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div className="col-span-2 md:col-span-1">
                <div className="text-muted-foreground mb-1">اسم الشركة</div>
                <div className="font-medium">{contract.buyerCompanyName}</div>
              </div>
              <div className="col-span-2 md:col-span-1">
                <div className="text-muted-foreground mb-1">سجل تجاري</div>
                <div className="font-medium font-mono">{contract.buyerCrNumber || '—'}</div>
              </div>
              <div className="col-span-2 md:col-span-1">
                <div className="text-muted-foreground mb-1">الممثل</div>
                <div className="font-medium">{contract.buyerRepName || '—'}</div>
              </div>
              <div className="col-span-2 md:col-span-1">
                <div className="text-muted-foreground mb-1">الصفة</div>
                <div className="font-medium">{contract.buyerRepTitle || '—'}</div>
              </div>
              <div className="col-span-2 md:col-span-1">
                <div className="text-muted-foreground mb-1">الهاتف</div>
                <div className="font-medium font-mono" dir="ltr">{contract.buyerPhone || '—'}</div>
              </div>
              <div className="col-span-2 md:col-span-1">
                <div className="text-muted-foreground mb-1">البريد الإلكتروني</div>
                <div className="font-medium font-mono">{contract.buyerEmail || '—'}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>الشروط التجارية</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground mb-1">نسبة الخصم / الهامش</div>
                <div className="font-medium">{contract.marginPercent ? `${contract.marginPercent}%` : '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">أيام الدفع</div>
                <div className="font-medium">{contract.paymentDays ? `${contract.paymentDays} يوم` : '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">مدة الضمان</div>
                <div className="font-medium">{contract.warrantyMonths ? `${contract.warrantyMonths} شهر` : '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">أيام الفحص</div>
                <div className="font-medium">{contract.inspectionDays ? `${contract.inspectionDays} يوم` : '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">ضريبة القيمة المضافة</div>
                <div className="font-medium">{contract.vatRate ? `${contract.vatRate}%` : '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">غرامة التأخير (أسبوعياً)</div>
                <div className="font-medium">{contract.latePaymentWeeklyRate ? `${contract.latePaymentWeeklyRate}%` : '—'}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-primary/20 bg-primary/5 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">حالة التوقيع</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Seller Signature Status */}
              <div className="relative">
                <div className={`flex items-center gap-3 ${contract.sellerSignedAt ? 'opacity-100' : 'opacity-70'}`}>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${contract.sellerSignedAt ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {contract.sellerSignedAt ? <CheckCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">توقيع البائع (نحن)</div>
                    <div className="text-xs text-muted-foreground">
                      {contract.sellerSignedAt ? 'تم التوقيع' : 'بانتظار التوقيع'}
                    </div>
                  </div>
                </div>
                
                {!contract.sellerSignedAt && contract.status === 'draft' && (
                  <div className="mt-3 ml-11 rtl:ml-0 rtl:mr-11">
                    <input 
                      type="file" 
                      accept="image/png, image/jpeg, image/webp" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleSignatureUpload}
                    />
                    <Button 
                      size="sm" 
                      className="w-full gap-2" 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      رفع التوقيع
                    </Button>
                  </div>
                )}
                
                <div className="absolute top-8 bottom-[-24px] left-3.5 rtl:left-auto rtl:right-3.5 w-px bg-border -z-10" />
              </div>

              {/* Buyer Signature Status */}
              <div className="relative">
                <div className={`flex items-center gap-3 ${contract.buyerSignedAt ? 'opacity-100' : 'opacity-70'}`}>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${contract.buyerSignedAt ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {contract.buyerSignedAt ? <CheckCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">توقيع المشتري</div>
                    <div className="text-xs text-muted-foreground">
                      {contract.buyerSignedAt ? `تم التوقيع (${contract.buyerSignedName})` : 'بانتظار التوقيع'}
                    </div>
                  </div>
                </div>
                
                {!contract.buyerSignedAt && contract.sellerSignedAt && contract.status !== 'cancelled' && (
                  <div className="mt-3 ml-11 rtl:ml-0 rtl:mr-11 space-y-3">
                    {signingUrl ? (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">رابط التوقيع (أرسله للمشتري):</div>
                        <div className="flex gap-2">
                          <Input value={signingUrl} readOnly className="h-8 text-xs font-mono" dir="ltr" />
                          <Button size="sm" variant="secondary" className="px-2" onClick={copySigningUrl}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="secondary"
                        className="w-full gap-2" 
                        onClick={handleSend}
                        disabled={sendContract.isPending}
                      >
                        {sendContract.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        إنشاء رابط المشتري
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {contract.status !== 'cancelled' && contract.status !== 'final' && (
            <Card className="border-destructive/20">
              <CardContent className="pt-6">
                <Button 
                  variant="destructive" 
                  className="w-full gap-2" 
                  onClick={handleCancel}
                  disabled={cancelContract.isPending}
                >
                  <Ban className="h-4 w-4" />
                  إلغاء هذا العقد
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
