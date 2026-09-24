import { useState } from 'react';
import { 
  useAdminListContracts, useAdminDeleteContract, useAdminCancelContract, getAdminListContractsQueryKey, useAdminSendContract, DistributorContractStatus,
  useAdminListContractFiles, useAdminDeleteContractFile, getAdminListContractFilesQueryKey, type UploadedContractFile,
   adminDownloadContractFile
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, FileText, Search, Filter, MoreHorizontal, Trash, Ban, CheckCircle, Clock, Send, Eye, Download, UploadCloud } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { UploadContractDialog } from './components/UploadContractDialog';
import { ConfirmUploadedContractTermsDialog } from './components/uploaded-contract-terms';
import { downloadContractPdf, pdfDownloadError } from './download-pdf';

const statusMap: Record<DistributorContractStatus, { label: string, variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: any }> = {
  draft: { label: 'مسودة', variant: 'secondary', icon: FileText },
  seller_signed: { label: 'موقع (البائع)', variant: 'outline', icon: CheckCircle },
  sent: { label: 'مرسل (بانتظار المشتري)', variant: 'default', icon: Clock },
  final: { label: 'نهائي (موقع)', variant: 'secondary', icon: CheckCircle },
  cancelled: { label: 'ملغى', variant: 'destructive', icon: Ban },
};

const ownerTypeMap: Record<string, { label: string }> = {
  distributor: { label: 'موزع / شركة' },
  customer: { label: 'عميل' },
  influencer: { label: 'مشهور' },
  employee: { label: 'موظف' },
};

const formatFileSize = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

export default function AdminContractsList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [termsFile, setTermsFile] = useState<UploadedContractFile | null>(null);
  const [activeTab, setActiveTab] = useState('generated');
  const [, setLocation] = useLocation();
  
  const { data: contracts, isLoading: loadingContracts, isError: contractsError } = useAdminListContracts();
  const { data: uploadedFiles, isLoading: loadingUploadedFiles, isError: uploadedFilesError } = useAdminListContractFiles();
  
  const deleteContract = useAdminDeleteContract();
  const cancelContract = useAdminCancelContract();
  const sendContract = useAdminSendContract();
  const deleteContractFile = useAdminDeleteContractFile();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredContracts = contracts?.filter(c => 
    c.buyerCompanyName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.contractNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredUploadedFiles = uploadedFiles?.filter(f => 
    f.fileName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.ownerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteGenerated = (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذا العقد؟')) return;
    
    deleteContract.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListContractsQueryKey() });
          toast({ title: 'تم الحذف', description: 'تم حذف العقد بنجاح' });
        },
        onError: () => {
          toast({ title: 'خطأ', description: 'لا يمكن حذف العقد (قد يكون نهائياً أو مرسلاً)', variant: 'destructive' });
        }
      }
    );
  };

  const handleDeleteUploaded = (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذا الملف؟')) return;
    
    deleteContractFile.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListContractFilesQueryKey() });
          toast({ title: 'تم الحذف', description: 'تم حذف الملف بنجاح' });
        },
        onError: () => {
          toast({ title: 'خطأ', description: 'فشل في حذف الملف', variant: 'destructive' });
        }
      }
    );
  };

  const handleCancelGenerated = (id: number) => {
    if (!confirm('هل أنت متأكد من إلغاء هذا العقد؟')) return;
    
    cancelContract.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListContractsQueryKey() });
          toast({ title: 'تم الإلغاء', description: 'تم إلغاء العقد بنجاح' });
        },
        onError: () => {
          toast({ title: 'خطأ', description: 'فشل في إلغاء العقد', variant: 'destructive' });
        }
      }
    );
  };

  const handleSendGenerated = (id: number) => {
    sendContract.mutate(
      { id },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getAdminListContractsQueryKey() });
          navigator.clipboard.writeText(data.signingUrl);
          toast({ title: 'تم الإرسال', description: 'تم إنشاء رابط التوقيع ونسخه للحافظة بنجاح' });
        },
        onError: () => {
          toast({ title: 'خطأ', description: 'يجب أن يكون العقد موقعاً من البائع أولاً', variant: 'destructive' });
        }
      }
    );
  };

  const handleDownloadGenerated = async (id: number, refNumber: string) => {
    try {
       await downloadContractPdf(id, refNumber);
    } catch (error) {
       toast({ title: 'تعذر تحميل PDF', description: pdfDownloadError(error), variant: 'destructive' });
    }
  };

  const handleDownloadUploaded = async (id: number, fileName: string) => {
    try {
      const blob = await adminDownloadContractFile(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: 'خطأ', description: 'فشل في تحميل الملف', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">العقود / Contracts</h1>
          <p className="text-muted-foreground mt-2">إدارة العقود المنشأة والملفات المرفوعة للشركات والموظفين</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button variant="outline" className="gap-2" onClick={() => setUploadDialogOpen(true)}>
            <UploadCloud className="h-4 w-4" />
            <span>رفع عقد موقّع</span>
          </Button>
          <Button className="gap-2" asChild>
            <Link href="/admin/contracts/new">
              <Plus className="h-4 w-4" />
              <span>إنشاء عقد جديد</span>
            </Link>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <TabsList>
            <TabsTrigger value="generated" className="gap-2">
              <FileText className="h-4 w-4" />
              العقود المنشأة نظامياً
            </TabsTrigger>
            <TabsTrigger value="uploaded" className="gap-2">
              <UploadCloud className="h-4 w-4" />
              الملفات المرفوعة
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative w-full md:w-80">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder={activeTab === 'generated' ? "بحث برقم العقد أو الشركة..." : "بحث باسم الملف أو المالك..."}
                className="pl-4 pr-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" className="gap-2 shrink-0">
              <Filter className="h-4 w-4" />
              تصفية
            </Button>
          </div>
        </div>

        <TabsContent value="generated" className="m-0 focus-visible:outline-none">
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم العقد</TableHead>
                  <TableHead>الشركة (المشتري)</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingContracts ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : contractsError ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-destructive">
                      تعذر تحميل العقود. حدّث الصفحة وحاول مجدداً.
                    </TableCell>
                  </TableRow>
                ) : filteredContracts?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      لا توجد عقود مطابقة للبحث
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContracts?.map((contract) => {
                    const statusInfo = statusMap[contract.status as DistributorContractStatus] || statusMap.draft;
                    const StatusIcon = statusInfo.icon;
                    
                    return (
                      <TableRow key={contract.id}>
                        <TableCell className="font-medium font-mono text-sm" dir="ltr">
                          {contract.contractNumber}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{contract.buyerCompanyName}</div>
                          {contract.buyerRepName && <div className="text-xs text-muted-foreground mt-1">{contract.buyerRepName}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{contract.contractDate ? format(new Date(contract.contractDate), 'yyyy-MM-dd') : '—'}</div>
                          <div className="text-xs text-muted-foreground mt-1">{contract.hijriDateStr || ''}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">{contract.contractType}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={statusInfo.variant}
                            className={contract.status === 'final' ? 'gap-1.5 whitespace-nowrap border-transparent bg-success text-success-foreground' : 'gap-1.5 whitespace-nowrap'}
                          >
                            <StatusIcon className="h-3.5 w-3.5" />
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="إجراءات العقد">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                              <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                              <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setLocation(`/admin/contracts/${contract.id}`)}>
                                <Eye className="h-4 w-4" />
                                عرض التفاصيل
                              </DropdownMenuItem>
                              
                              <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => handleDownloadGenerated(contract.id, contract.contractNumber)}>
                                <Download className="h-4 w-4" />
                                تحميل PDF
                              </DropdownMenuItem>

                              {contract.status === 'seller_signed' && (
                                <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => handleSendGenerated(contract.id)}>
                                  <Send className="h-4 w-4" />
                                  إنشاء رابط للمشتري
                                </DropdownMenuItem>
                              )}
                              
                              <DropdownMenuSeparator />
                              
                              {contract.status !== 'cancelled' && contract.status !== 'final' && (
                                <DropdownMenuItem className="cursor-pointer gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={() => handleCancelGenerated(contract.id)}>
                                  <Ban className="h-4 w-4" />
                                  إلغاء العقد
                                </DropdownMenuItem>
                              )}
                              
                              {contract.status === 'draft' && (
                                <DropdownMenuItem className="cursor-pointer gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={() => handleDeleteGenerated(contract.id)}>
                                  <Trash className="h-4 w-4" />
                                  حذف العقد
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="uploaded" className="m-0 focus-visible:outline-none">
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الملف</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>المالك</TableHead>
                  <TableHead>تاريخ الرفع</TableHead>
                  <TableHead>ملاحظات</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingUploadedFiles ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : uploadedFilesError ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-destructive">
                      تعذر تحميل الملفات المرفوعة. حدّث الصفحة وحاول مجدداً.
                    </TableCell>
                  </TableRow>
                ) : filteredUploadedFiles?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      لا توجد ملفات مرفوعة مطابقة للبحث
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUploadedFiles?.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 p-2 rounded-md shrink-0">
                            <FileText className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium text-sm max-w-[200px] truncate" dir="ltr" title={file.fileName}>
                              {file.fileName}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatFileSize(file.sizeBytes)}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal bg-muted/50">
                          {ownerTypeMap[file.ownerType]?.label || file.ownerType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <span className="font-medium">{file.ownerName}</span>
                          {file.ownerType === 'distributor' && (
                            <div>
                              <Badge
                                data-testid={`uploaded-contract-terms-status-${file.id}`}
                                variant={file.termsConfirmedAt ? 'secondary' : 'outline'}
                                className={file.termsConfirmedAt ? 'border-transparent bg-success text-success-foreground' : 'border-amber-500/40 bg-amber-500/10 text-amber-800'}
                              >
                                {file.termsConfirmedAt ? 'شروط الفوترة معتمدة' : 'بانتظار اعتماد الشروط'}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm" dir="ltr">{format(new Date(file.uploadedAt), 'yyyy-MM-dd HH:mm')}</div>
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate text-sm text-muted-foreground" title={file.notes || ''}>
                        {file.notes || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {file.ownerType === 'distributor' && !file.termsConfirmedAt && (
                            <Button
                              variant="outline"
                              size="sm"
                              data-testid={`button-approve-file-terms-${file.id}`}
                              className="gap-1 whitespace-nowrap"
                              onClick={() => setTermsFile(file)}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              اعتماد الشروط
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="إجراءات الملف">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                            <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => handleDownloadUploaded(file.id, file.fileName)}>
                              <Download className="h-4 w-4" />
                              تحميل الملف
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={() => handleDeleteUploaded(file.id)}>
                              <Trash className="h-4 w-4" />
                              حذف الملف
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <UploadContractDialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} />
      <ConfirmUploadedContractTermsDialog
        file={termsFile}
        open={Boolean(termsFile)}
        onOpenChange={(open) => { if (!open) setTermsFile(null); }}
      />
    </div>
  );
}