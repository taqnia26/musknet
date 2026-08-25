import { useState } from 'react';
import { useAdminListOrders, useAdminUpdateOrder, AdminListOrdersStatus, AdminOrderUpdateStatus, AdminOrderUpdatePaymentStatus, useGetAdminMe } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { getAdminListOrdersQueryKey } from '@workspace/api-client-react';
import { format } from 'date-fns';

export default function AdminOrders() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdminListOrdersStatus>('all');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetAdminMe();
  const { data: orders, isLoading } = useAdminListOrders({ search, status: statusFilter !== 'all' ? statusFilter : undefined });
  const updateMutation = useAdminUpdateOrder();

  const handleUpdateStatus = (id: number, status: string) => {
    updateMutation.mutate({ id, data: { status: status as AdminOrderUpdateStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListOrdersQueryKey() });
        if (selectedOrder && selectedOrder.id === id) {
          setSelectedOrder({ ...selectedOrder, status });
        }
      }
    });
  };

  const handleUpdatePaymentStatus = (id: number, paymentStatus: string) => {
    updateMutation.mutate({ id, data: { paymentStatus: paymentStatus as AdminOrderUpdatePaymentStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListOrdersQueryKey() });
        if (selectedOrder && selectedOrder.id === id) {
          setSelectedOrder({ ...selectedOrder, paymentStatus });
        }
      }
    });
  };

  const statusMap: Record<string, { label: string, variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    'new': { label: t('جديد', 'New'), variant: 'default' },
    'processing': { label: t('قيد التجهيز', 'Processing'), variant: 'secondary' },
    'shipped': { label: t('مشحون', 'Shipped'), variant: 'outline' },
    'delivered': { label: t('تم التوصيل', 'Delivered'), variant: 'outline' },
    'cancelled': { label: t('ملغي', 'Cancelled'), variant: 'destructive' },
  };

  const paymentMap: Record<string, { label: string, variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    'pending': { label: t('قيد الانتظار', 'Pending'), variant: 'secondary' },
    'paid': { label: t('مدفوع', 'Paid'), variant: 'default' },
    'failed': { label: t('فشل', 'Failed'), variant: 'destructive' },
    'refunded': { label: t('مسترجع', 'Refunded'), variant: 'outline' },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('الطلبات', 'Orders')}</h1>
          <p className="text-muted-foreground mt-1">{t('متابعة وإدارة طلبات العملاء', 'Track and manage customer orders')}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
          <Input 
            placeholder={t('رقم الطلب...', 'Search orders...')} 
            className="pl-9 rtl:pr-9 rtl:pl-3" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AdminListOrdersStatus)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder={t('تصفية بالحالة', 'Filter by status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('الكل', 'All')}</SelectItem>
            <SelectItem value="new">{t('جديد', 'New')}</SelectItem>
            <SelectItem value="processing">{t('قيد التجهيز', 'Processing')}</SelectItem>
            <SelectItem value="shipped">{t('مشحون', 'Shipped')}</SelectItem>
            <SelectItem value="delivered">{t('تم التوصيل', 'Delivered')}</SelectItem>
            <SelectItem value="cancelled">{t('ملغي', 'Cancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('رقم الطلب', 'Order #')}</TableHead>
              <TableHead>{t('التاريخ', 'Date')}</TableHead>
              <TableHead>{t('الإجمالي', 'Total')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead>{t('الدفع', 'Payment')}</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : orders?.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t('لا توجد طلبات', 'No orders found')}</TableCell></TableRow>
            ) : (
              orders?.map((order) => (
                <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                  <TableCell className="font-medium">#{order.orderNumber}</TableCell>
                  <TableCell>{format(new Date(order.createdAt), 'yyyy-MM-dd')}</TableCell>
                  <TableCell>{order.total} SAR</TableCell>
                  <TableCell>
                    <Badge variant={statusMap[order.status]?.variant || 'default'}>
                      {statusMap[order.status]?.label || order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={paymentMap[order.paymentStatus]?.variant || 'default'}>
                      {paymentMap[order.paymentStatus]?.label || order.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Dialog open={selectedOrder?.id === order.id} onOpenChange={(v) => !v && setSelectedOrder(null)}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(order)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>{t('تفاصيل الطلب', 'Order Details')} #{selectedOrder?.orderNumber}</DialogTitle>
                        </DialogHeader>
                        {selectedOrder && (
                          <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground mb-1">{t('تاريخ الطلب', 'Order Date')}</p>
                                <p className="font-medium">{format(new Date(selectedOrder.createdAt), 'PPpp')}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">{t('الإجمالي', 'Total')}</p>
                                <p className="font-medium text-lg">{selectedOrder.total} SAR</p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <p className="text-sm font-medium">{t('تحديث حالة الطلب', 'Update Status')}</p>
                                <Select disabled={!hasPermission(currentUser, 'orders', 'edit')} value={selectedOrder.status} onValueChange={(v) => handleUpdateStatus(selectedOrder.id, v)}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="new">{t('جديد', 'New')}</SelectItem>
                                    <SelectItem value="processing">{t('قيد التجهيز', 'Processing')}</SelectItem>
                                    <SelectItem value="shipped">{t('مشحون', 'Shipped')}</SelectItem>
                                    <SelectItem value="delivered">{t('تم التوصيل', 'Delivered')}</SelectItem>
                                    <SelectItem value="cancelled">{t('ملغي', 'Cancelled')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <p className="text-sm font-medium">{t('تحديث حالة الدفع', 'Update Payment')}</p>
                                <Select disabled={!hasPermission(currentUser, 'orders', 'edit')} value={selectedOrder.paymentStatus} onValueChange={(v) => handleUpdatePaymentStatus(selectedOrder.id, v)}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">{t('قيد الانتظار', 'Pending')}</SelectItem>
                                    <SelectItem value="paid">{t('مدفوع', 'Paid')}</SelectItem>
                                    <SelectItem value="failed">{t('فشل', 'Failed')}</SelectItem>
                                    <SelectItem value="refunded">{t('مسترجع', 'Refunded')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
