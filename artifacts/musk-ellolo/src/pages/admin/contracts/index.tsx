import { useState } from 'react';
import { useAdminListContracts, useAdminDeleteContract, useAdminCancelContract, getAdminListContractsQueryKey, useAdminSendContract, DistributorContractStatus } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, FileText, Search, Filter, MoreHorizontal, Copy, Trash, Ban, CheckCircle, Clock, Send, Eye } from 'lucide-react';
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
import { format } from 'date-fns';

const statusMap: Record<DistributorContractStatus, { label: string, variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: any }> = {
  draft: { label: 'مسودة', variant: 'secondary', icon: FileText },
  seller_signed: { label: 'موقع (البائع)', variant: 'outline', icon: CheckCircle },
  sent: { label: 'مرسل (بانتظار المشتري)', variant: 'default', icon: Clock },
  final: { label: 'نهائي (موقع)', variant: 'secondary', icon: CheckCircle },
  cancelled: { label: 'ملغى', variant: 'destructive', icon: Ban },
};

export default function AdminContractsList() {
  const [searchTerm, setSearchTerm] = useState('');
  
  const { data: contracts, isLoading } = useAdminListContracts();
  const deleteContract = useAdminDeleteContract();
  const cancelContract = useAdminCancelContract();
  const sendContract = useAdminSendContract();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredContracts = contracts?.filter(c => 
    c.buyerCompanyName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.contractNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = (id: number) => {
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

  const handleCancel = (id: number) => {
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

  const handleSend = (id: number) => {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">عقود التوزيع / Contracts</h1>
          <p className="text-muted-foreground mt-2">إدارة العقود القانونية والتجارية للموزعين</p>
        </div>
        <Link href="/admin/contracts/new">
          <Button className="shrink-0 gap-2">
            <Plus className="h-4 w-4" />
            <span>إنشاء عقد جديد</span>
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="بحث باسم الشركة أو رقم العقد..." 
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
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : filteredContracts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  لا توجد عقود مطابقة
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                          <Link href={`/admin/contracts/${contract.id}`}>
                            <DropdownMenuItem className="cursor-pointer gap-2">
                              <Eye className="h-4 w-4" />
                              عرض التفاصيل
                            </DropdownMenuItem>
                          </Link>
                          {contract.status === 'seller_signed' && (
                            <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => handleSend(contract.id)}>
                              <Send className="h-4 w-4" />
                              إنشاء رابط للمشتري
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {contract.status !== 'cancelled' && contract.status !== 'final' && (
                            <DropdownMenuItem className="cursor-pointer gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={() => handleCancel(contract.id)}>
                              <Ban className="h-4 w-4" />
                              إلغاء العقد
                            </DropdownMenuItem>
                          )}
                          {contract.status === 'draft' && (
                            <DropdownMenuItem className="cursor-pointer gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={() => handleDelete(contract.id)}>
                              <Trash className="h-4 w-4" />
                              حذف العقد
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
