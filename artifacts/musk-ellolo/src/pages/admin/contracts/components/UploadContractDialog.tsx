import React, { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getAdminToken } from '@/lib/auth-token';
import { Loader2, UploadCloud, X, File as FileIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAdminRequestContractFileUpload,
  useAdminCreateContractFile,
  getAdminListContractFilesQueryKey,
  useAdminListDistributors,
  useAdminListCustomers,
  useListInfluencers,
  useAdminListEmployees,
  getAdminListDistributorsQueryKey,
  getAdminListCustomersQueryKey,
  getListInfluencersQueryKey,
  getAdminListEmployeesQueryKey,
  useAdminConfirmUploadedContractTerms,
  UploadedContractFileInputOwnerType,
  UploadedContractFileInputMimeType,
  ContractFileUploadRequestMimeType
} from '@workspace/api-client-react';
import {
  UploadedContractTermsFields,
  blankUploadedContractTerms,
  uploadedContractTermsRequest,
  uploadedContractTermsSchema,
  type UploadedContractTermsValues,
} from './uploaded-contract-terms';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const formSchema = z.object({
  ownerType: z.enum(['distributor', 'customer', 'influencer', 'employee'] as const),
  ownerId: z.string().min(1, 'يجب اختيار المالك'),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const validMimeTypes: Record<string, UploadedContractFileInputMimeType> = {
  'application/pdf': 'application/pdf',
  'application/msword': 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

interface UploadContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadContractDialog({ open, onOpenChange }: UploadContractDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const requestUpload = useAdminRequestContractFileUpload();
  const createFileRecord = useAdminCreateContractFile();
  const confirmUploadedContractTerms = useAdminConfirmUploadedContractTerms();
  const termsForm = useForm<UploadedContractTermsValues>({
    resolver: zodResolver(uploadedContractTermsSchema),
    defaultValues: blankUploadedContractTerms(),
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ownerType: 'distributor',
      ownerId: '',
      notes: '',
    },
  });

  const ownerType = form.watch('ownerType');
  const ownerId = form.watch('ownerId');
  useEffect(() => {
    termsForm.reset(blankUploadedContractTerms());
  }, [ownerType, ownerId, open]);

  // Fetch owners based on selected type
  const { data: distributors, isLoading: loadingDistributors } = useAdminListDistributors(undefined, { query: { enabled: open && ownerType === 'distributor', queryKey: getAdminListDistributorsQueryKey() }});
  const { data: customers, isLoading: loadingCustomers } = useAdminListCustomers(undefined, { query: { enabled: open && ownerType === 'customer', queryKey: getAdminListCustomersQueryKey() }});
  const { data: influencers, isLoading: loadingInfluencers } = useListInfluencers({ query: { enabled: open && ownerType === 'influencer', queryKey: getListInfluencersQueryKey() }});
  const { data: employees, isLoading: loadingEmployees } = useAdminListEmployees(undefined, { query: { enabled: open && ownerType === 'employee', queryKey: getAdminListEmployeesQueryKey() }});

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > MAX_FILE_SIZE) {
      toast({
        title: 'حجم الملف كبير جداً',
        description: 'الحد الأقصى لحجم الملف هو 25 ميجابايت',
        variant: 'destructive',
      });
      return;
    }

    if (!validMimeTypes[selectedFile.type]) {
      toast({
        title: 'صيغة ملف غير مدعومة',
        description: 'يرجى رفع ملف بصيغة PDF أو DOC أو DOCX فقط',
        variant: 'destructive',
      });
      return;
    }

    setFile(selectedFile);
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!file) {
      toast({
        title: 'الملف مطلوب',
        description: 'يرجى اختيار ملف لرفعه',
        variant: 'destructive',
      });
      return;
    }

    const mimeType = validMimeTypes[file.type];
    if (!mimeType) return;

    if (values.ownerType === 'distributor' && !(await termsForm.trigger())) return;

    setUploading(true);
    let uploadStage: 'prepare' | 'storage' | 'record' | 'terms' = 'prepare';
    let createdFile: { id: number; fileName: string } | null = null;
    try {
      // 1. Request upload URL
      const { uploadUrl, objectPath } = await requestUpload.mutateAsync({
        data: {
          fileName: file.name,
          mimeType: mimeType as ContractFileUploadRequestMimeType,
          sizeBytes: file.size,
        }
      });

      // 2. Upload file directly to storage
      uploadStage = 'storage';
       const putFile = () => fetch(uploadUrl, {
        method: 'PUT',
        body: file,
         headers: {
           'Content-Type': mimeType,
           ...(uploadUrl.startsWith('/api/admin/contract-files/uploads/')
             ? { Authorization: `Bearer ${getAdminToken() ?? ''}` }
             : {}),
         },
      });
      let uploadResponse: Response;
      try {
        uploadResponse = await putFile();
      } catch {
        // A signed PUT is safe to retry because it replaces the same object path.
        uploadResponse = await putFile();
      }

      if (!uploadResponse.ok) {
        throw new Error(`تعذر إرسال الملف إلى التخزين (HTTP ${uploadResponse.status})`);
      }

      // 3. Create metadata record in DB
      uploadStage = 'record';
      createdFile = await createFileRecord.mutateAsync({
        data: {
          ownerType: values.ownerType as UploadedContractFileInputOwnerType,
          ownerId: parseInt(values.ownerId, 10),
          fileName: file.name,
          objectPath,
          mimeType,
          sizeBytes: file.size,
          notes: values.notes || null,
        }
      });
      if (values.ownerType === 'distributor') {
        uploadStage = 'terms';
        await confirmUploadedContractTerms.mutateAsync({
          id: createdFile.id,
          data: uploadedContractTermsRequest(termsForm.getValues()),
        });
      }

      queryClient.invalidateQueries({ queryKey: getAdminListContractFilesQueryKey() });
      toast({
        title: values.ownerType === 'distributor' ? 'تم رفع العقد واعتماد شروطه' : 'تم الرفع',
        description: values.ownerType === 'distributor'
          ? 'سيُطبّق العقد تلقائياً على فواتير هذه الشركة'
          : 'تم رفع الملف بنجاح',
      });
      
      onOpenChange(false);
      form.reset();
      termsForm.reset(blankUploadedContractTerms());
      removeFile();
    } catch (error) {
      console.error('Contract upload failed', { stage: uploadStage, error });
      if (createdFile && uploadStage === 'terms') {
        queryClient.invalidateQueries({ queryKey: getAdminListContractFilesQueryKey() });
        toast({
          title: 'تم رفع الملف لكن لم تُعتمد شروطه',
          description: `${createdFile.fileName} محفوظ تحت اسم الشركة. افتح «الملفات المرفوعة» واعتمد شروطه قبل إصدار الفاتورة. ${error instanceof Error ? error.message : ''}`,
          variant: 'destructive',
        });
        onOpenChange(false);
        removeFile();
        return;
      }
      const stageLabel = uploadStage === 'prepare'
        ? 'تعذر تجهيز رابط رفع الملف'
        : uploadStage === 'storage'
          ? 'انقطع رفع الملف إلى التخزين'
          : 'تم رفع الملف لكن تعذر حفظ بيانات العقد';
      const details = error instanceof Error ? error.message : 'خطأ غير معروف';
      toast({
        title: stageLabel,
        description: `${details}. حاول مرة أخرى، وإذا تكرر الخطأ تحقق من الاتصال.`,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const isLoadingOwners = loadingDistributors || loadingCustomers || loadingInfluencers || loadingEmployees;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>رفع عقد جديد</DialogTitle>
          <DialogDescription>
            قم برفع العقود الموقعة أو الملفات القانونية للشركات، العملاء، المشاهير أو الموظفين.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="ownerType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع المالك</FormLabel>
                    <Select onValueChange={(val) => { field.onChange(val); form.setValue('ownerId', ''); }} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر النوع" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="distributor">موزع / شركة</SelectItem>
                        <SelectItem value="customer">عميل</SelectItem>
                        <SelectItem value="influencer">مشهور</SelectItem>
                        <SelectItem value="employee">موظف</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>المالك</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingOwners}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingOwners ? "جاري التحميل..." : "اختر المالك"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ownerType === 'distributor' && distributors?.map(d => (
                          <SelectItem key={d.id} value={d.id.toString()}>
                            {d.companyName} {d.contactName ? `(${d.contactName})` : ''}
                          </SelectItem>
                        ))}
                        {ownerType === 'customer' && customers?.map(c => (
                          <SelectItem key={c.id} value={c.id.toString()}>
                            {c.name} - {c.phone}
                          </SelectItem>
                        ))}
                        {ownerType === 'influencer' && influencers?.map(i => (
                          <SelectItem key={i.id} value={i.id.toString()}>
                            {i.name}
                          </SelectItem>
                        ))}
                        {ownerType === 'employee' && employees?.map(e => (
                          <SelectItem key={e.id} value={e.id.toString()}>
                            {e.name} - {e.nationalId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {ownerType === 'distributor' && (
              <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
                <div>
                  <h3 className="text-sm font-semibold">شروط الفوترة</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    أدخل البنود مرة واحدة كما وردت في العقد؛ ستُطبّق تلقائياً على فواتير هذه الشركة.
                  </p>
                </div>
                <Form {...termsForm}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <UploadedContractTermsFields form={termsForm} idPrefix="upload-terms" />
                  </div>
                </Form>
              </div>
            )}

            <div className="space-y-2">
              <Label>ملف العقد (PDF, DOC, DOCX - حد أقصى 25MB)</Label>
              {!file ? (
                <div 
                  className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud className="h-8 w-8 mb-2" />
                  <p className="text-sm font-medium">اضغط لاختيار ملف</p>
                  <p className="text-xs">أو اسحب الملف وأفلته هنا</p>
                </div>
              ) : (
                <div className="border rounded-lg p-3 flex items-center justify-between bg-muted/30">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="bg-primary/10 p-2 rounded-md shrink-0">
                      <FileIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium truncate" dir="ltr">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={removeFile} className="shrink-0 text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileChange}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ملاحظات (اختياري)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="أضف أي ملاحظات حول هذا العقد..." {...field} className="resize-none" rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
                إلغاء
              </Button>
              <Button type="submit" disabled={uploading || !file}>
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    جاري الرفع...
                  </>
                ) : (
                  'حفظ العقد'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
