import { useState } from 'react';
import { 
  useAdminListOrders, 
  type AdminOrder,
  useAdminUpdateOrder, 
  AdminOrderUpdateStatus, 
  AdminOrderUpdatePaymentStatus, 
  useGetAdminMe,
  useAdminGetOrder,
  getAdminListOrdersQueryKey,
  getAdminGetOrderQueryKey
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Eye, AlertCircle, ShoppingBag, MapPin, User, Receipt, Truck, Clock3, ClipboardCheck, PackageCheck, Package, Check, Ban, CreditCard, MoreHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { CreateOrderDialog } from '@/components/admin/create-order-dialog';

type OrderStage = 'all' | 'cancelled' | 'awaiting_payment' | 'awaiting_review' | 'processing' | 'ready' | 'completed' | 'shipped' | 'delivered';
function stageOf(order: AdminOrder): OrderStage {
  if (order.status === 'cancelled') return 'cancelled';
  if (order.status === 'new') return order.paymentStatus === 'paid' ? 'awaiting_review' : 'awaiting_payment';
  if (order.status === 'processing' || order.status === 'ready' || order.status === 'completed' || order.status === 'shipped' || order.status === 'delivered') return order.status;
  return 'all';
}

export default function AdminOrders() {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStage>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetAdminMe();
  const { data: orders, isLoading, isError } = useAdminListOrders({ search });
  const updateMutation = useAdminUpdateOrder();
  const visibleOrders = statusFilter === 'all' ? orders : orders?.filter((order) => stageOf(order) === statusFilter);
  const stages = [
    { key: 'cancelled', ar: 'ملغي', en: 'Cancelled', icon: Ban, dot: 'bg-slate-400' },
    { key: 'awaiting_payment', ar: 'بانتظار الدفع', en: 'Awaiting payment', icon: CreditCard, dot: 'bg-rose-500' },
    { key: 'awaiting_review', ar: 'بانتظار المراجعة', en: 'Awaiting review', icon: Clock3, dot: 'bg-slate-500' },
    { key: 'processing', ar: 'قيد التنفيذ', en: 'In progress', icon: ClipboardCheck, dot: 'bg-amber-500' },
    { key: 'ready', ar: 'قيد التسليم', en: 'Ready for handoff', icon: Package, dot: 'bg-sky-500' },
    { key: 'completed', ar: 'تم التنفيذ', en: 'Completed', icon: Check, dot: 'bg-emerald-500' },
    { key: 'shipped', ar: 'جاري التوصيل', en: 'Out for delivery', icon: Truck, dot: 'bg-teal-500' },
    { key: 'delivered', ar: 'تم التوصيل', en: 'Delivered', icon: PackageCheck, dot: 'bg-green-500' },
  ] as const;

  const { data: orderDetail, isLoading: isDetailLoading, isError: isDetailError } = useAdminGetOrder(
    selectedOrderId as number, 
    { 
      query: { 
        enabled: selectedOrderId !== null, 
        queryKey: selectedOrderId ? getAdminGetOrderQueryKey(selectedOrderId) : ['admin-order-null']
      } 
    }
  );

  const handleUpdateStatus = (id: number, status: string) => {
    setUpdateError(null);
    updateMutation.mutate({ id, data: { status: status as AdminOrderUpdateStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListOrdersQueryKey() });
        if (selectedOrderId === id) {
          queryClient.invalidateQueries({ queryKey: getAdminGetOrderQueryKey(id) });
        }
      },
      onError: (error) => setUpdateError(error instanceof Error ? error.message : t('تعذر تحديث الطلب', 'Unable to update order'))
    });
  };

  const handleUpdatePaymentStatus = (id: number, paymentStatus: string) => {
    setUpdateError(null);
    updateMutation.mutate({ id, data: { paymentStatus: paymentStatus as AdminOrderUpdatePaymentStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListOrdersQueryKey() });
        if (selectedOrderId === id) {
          queryClient.invalidateQueries({ queryKey: getAdminGetOrderQueryKey(id) });
        }
      },
      onError: (error) => setUpdateError(error instanceof Error ? error.message : t('تعذر تحديث حالة الدفع', 'Unable to update payment status'))
    });
  };

  const statusMap: Record<string, { label: string, variant: 'default' | 'secondary' | 'destructive' | 'outline', className?: string }> = {
    'new': { label: t('جديد', 'New'), variant: 'default', className: 'bg-primary/20 text-primary hover:bg-primary/30' },
    'processing': { label: t('قيد التجهيز', 'Processing'), variant: 'secondary', className: 'bg-primary/15 text-primary hover:bg-primary/25' },
    'ready': { label: t('قيد التسليم', 'Ready for handoff'), variant: 'secondary' },
    'completed': { label: t('تم التنفيذ', 'Completed'), variant: 'secondary' },
    'shipped': { label: t('مشحون', 'Shipped'), variant: 'outline', className: 'bg-accent/20 text-accent-foreground hover:bg-accent/30 border-accent/30' },
    'delivered': { label: t('تم التوصيل', 'Delivered'), variant: 'default', className: 'bg-success/20 text-success hover:bg-success/30' },
    'cancelled': { label: t('ملغي', 'Cancelled'), variant: 'destructive', className: 'bg-destructive/30 text-destructive-foreground hover:bg-destructive/40' },
  };

  const paymentMap: Record<string, { label: string, variant: 'default' | 'secondary' | 'destructive' | 'outline', className?: string }> = {
    'pending': { label: t('قيد الانتظار', 'Pending'), variant: 'secondary', className: 'bg-accent text-accent-foreground' },
    'paid': { label: t('مدفوع', 'Paid'), variant: 'default', className: 'bg-success text-success-foreground hover:bg-success/90' },
    'failed': { label: t('فشل', 'Failed'), variant: 'destructive' },
    'refunded': { label: t('مسترجع', 'Refunded'), variant: 'outline', className: 'border-destructive text-destructive' },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('طلبات الأفراد', 'Individual Orders')}</h1>
          <p className="text-muted-foreground mt-1">{t('متابعة وإدارة طلبات الأفراد', 'Track and manage individual orders')}</p>
        </div>
        {hasPermission(currentUser, 'orders', 'edit') && <CreateOrderDialog />}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2">
          {stages.map((stage) => {
            const Icon = stage.icon;
            const selected = statusFilter === stage.key;
            return (
              <button key={stage.key} type="button" aria-pressed={selected} data-testid={`order-stage-${stage.key}`}
                onClick={() => setStatusFilter(selected ? 'all' : stage.key)}
                className={`flex min-h-[86px] w-[120px] shrink-0 flex-col justify-between rounded-lg border bg-card p-3 text-start shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-primary ring-1 ring-primary' : ''}`}>
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stage.dot}`} />{t(stage.ar, stage.en)}</span>
                  <span className="font-bold tabular-nums">{isLoading ? '…' : (orders ?? []).filter((order) => stageOf(order) === stage.key).length}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
          <Input 
            placeholder={t('بحث برقم الطلب، اسم العميل...', 'Search orders...')} 
            className="pl-9 rtl:pr-9 rtl:pl-3" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStage)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder={t('تصفية بالحالة', 'Filter by status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('الكل', 'All')}</SelectItem>
            {stages.map((stage) => <SelectItem key={stage.key} value={stage.key}>{t(stage.ar, stage.en)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {updateError && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{updateError}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-card shadow-sm">
        <Table className="min-w-[760px]">
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>{t('رقم الطلب', 'Order #')}</TableHead>
              <TableHead>{t('التاريخ', 'Date')}</TableHead>
              <TableHead>{t('الإجمالي', 'Total')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead>{t('الدفع', 'Payment')}</TableHead>
              <TableHead className="w-[100px] text-end">{t('إجراءات', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : isError ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-destructive">{t('تعذر تحميل الطلبات', 'Could not load orders')}</TableCell></TableRow>
            ) : visibleOrders?.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">{t('لا توجد طلبات', 'No orders found')}</TableCell></TableRow>
            ) : (
              visibleOrders?.map((order) => (
                <TableRow key={order.id} data-testid={`row-order-${order.id}`} className="group hover:bg-muted/10 transition-colors">
                  <TableCell className="font-medium">#{order.orderNumber}</TableCell>
                  <TableCell>{format(new Date(order.createdAt), 'yyyy-MM-dd')}</TableCell>
                  <TableCell className="font-semibold">{order.total.toFixed(2)} {t('ر.س', 'SAR')}</TableCell>
                  <TableCell>
                    <Select disabled={!hasPermission(currentUser, 'orders', 'edit')} value={order.status} onValueChange={(v) => handleUpdateStatus(order.id, v)}>
                      <SelectTrigger className={`h-8 text-xs font-semibold ${statusMap[order.status]?.className || ''} border-0 ring-offset-transparent focus:ring-0 focus:ring-offset-0`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">{t('جديد', 'New')}</SelectItem>
                        <SelectItem value="processing">{t('قيد التجهيز', 'Processing')}</SelectItem>
                        <SelectItem value="ready">{t('قيد التسليم', 'Ready for handoff')}</SelectItem>
                        <SelectItem value="completed">{t('تم التنفيذ', 'Completed')}</SelectItem>
                        <SelectItem value="shipped">{t('مشحون', 'Shipped')}</SelectItem>
                        <SelectItem value="delivered">{t('تم التوصيل', 'Delivered')}</SelectItem>
                        <SelectItem value="cancelled">{t('ملغي', 'Cancelled')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={paymentMap[order.paymentStatus]?.variant || 'default'} className={paymentMap[order.paymentStatus]?.className}>
                      {paymentMap[order.paymentStatus]?.label || order.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('إجراءات الطلب', 'Order actions')}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setSelectedOrderId(order.id)}>
                          <Eye className="me-2 h-4 w-4" />{t('عرض التفاصيل', 'View details')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Dialog open={selectedOrderId === order.id} onOpenChange={(v) => !v && setSelectedOrderId(null)}>
                      <DialogContent
                        dir={lang === 'ar' ? 'rtl' : 'ltr'}
                        className="max-w-4xl max-h-[90vh] max-h-[90dvh] flex flex-col gap-0 p-0 overflow-hidden"
                      >
                        <DialogHeader className={`shrink-0 px-4 sm:px-6 py-4 border-b ${lang === 'ar' ? 'text-right' : 'text-left'}`}>
                          <DialogTitle className="flex min-w-0 w-full items-center gap-2 px-0 text-start text-xl">
                            <ShoppingBag className="h-5 w-5 shrink-0 text-primary" />
                            <span className="min-w-0 flex-1 break-words">{t('تفاصيل الطلب', 'Order Details')}</span>
                            <span dir="ltr" className="min-w-0 max-w-[60%] break-all text-base text-muted-foreground">#{order.orderNumber}</span>
                          </DialogTitle>
                        </DialogHeader>
                        
                        <div data-testid="order-details-scroll" className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 touch-pan-y">
                          {isDetailLoading ? (
                            <div className="flex flex-col items-center justify-center py-12 space-y-4">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                              <p className="text-muted-foreground">{t('جاري جلب التفاصيل...', 'Fetching details...')}</p>
                            </div>
                          ) : isDetailError || !orderDetail ? (
                            <div className="flex flex-col items-center justify-center py-12 text-destructive">
                              <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                              <p className="text-lg font-medium">{t('حدث خطأ أثناء جلب التفاصيل', 'Error loading details')}</p>
                            </div>
                          ) : (
                            <div className="space-y-8 pb-8">
                              {/* Top Metrics & Actions */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-4 col-span-1 md:col-span-2">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-muted/30 p-4 rounded-md border">
                                      <p className="text-xs text-muted-foreground mb-1 font-medium">{t('تاريخ الطلب', 'Order Date')}</p>
                                        <p className="font-semibold text-sm break-words">{format(new Date(orderDetail.createdAt), 'PPpp')}</p>
                                    </div>
                                    <div className="bg-muted/30 p-4 rounded-md border">
                                      <p className="text-xs text-muted-foreground mb-1 font-medium">{t('طريقة الشحن', 'Shipping Method')}</p>
                                        <p className="font-semibold text-sm capitalize break-words">{orderDetail.shippingMethod}</p>
                                    </div>
                                  </div>
                                  {orderDetail.trackingNumber && (
                                    <div className="bg-muted/30 p-4 rounded-md border flex items-center gap-3">
                                      <Truck className="h-5 w-5 text-primary opacity-70" />
                                      <div>
                                        <p className="text-xs text-muted-foreground font-medium">{t('رقم التتبع', 'Tracking Number')}</p>
                                        <p className="font-semibold text-sm break-all">{orderDetail.trackingNumber}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="space-y-3 bg-muted/20 p-4 rounded-md border">
                                  <div className="space-y-1.5">
                                    <p className="text-xs font-medium text-muted-foreground">{t('تحديث حالة الطلب', 'Update Status')}</p>
                                    <Select disabled={!hasPermission(currentUser, 'orders', 'edit')} value={orderDetail.status} onValueChange={(v) => handleUpdateStatus(orderDetail.id, v)}>
                                      <SelectTrigger className="h-8 text-sm">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="new">{t('جديد', 'New')}</SelectItem>
                                        <SelectItem value="processing">{t('قيد التجهيز', 'Processing')}</SelectItem>
                                        <SelectItem value="ready">{t('قيد التسليم', 'Ready for handoff')}</SelectItem>
                                        <SelectItem value="completed">{t('تم التنفيذ', 'Completed')}</SelectItem>
                                        <SelectItem value="shipped">{t('مشحون', 'Shipped')}</SelectItem>
                                        <SelectItem value="delivered">{t('تم التوصيل', 'Delivered')}</SelectItem>
                                        <SelectItem value="cancelled">{t('ملغي', 'Cancelled')}</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1.5">
                                    <p className="text-xs font-medium text-muted-foreground">{t('تحديث حالة الدفع', 'Update Payment')}</p>
                                    <Select disabled={!hasPermission(currentUser, 'orders', 'edit')} value={orderDetail.paymentStatus} onValueChange={(v) => handleUpdatePaymentStatus(orderDetail.id, v)}>
                                      <SelectTrigger className="h-8 text-sm">
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

                              <Separator />

                              {/* Customer & Address */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                  <div className="flex items-center gap-2 mb-4 text-primary">
                                    <User className="h-4 w-4" />
                                    <h3 className="font-bold text-sm tracking-wide uppercase">{t('بيانات العميل', 'Customer Info')}</h3>
                                  </div>
                                  <div className="space-y-3 text-sm">
                                    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
                                      <span className="text-muted-foreground">{t('الاسم', 'Name')}:</span>
                                      <span className="font-medium break-words">{orderDetail.customer.name}</span>
                                    </div>
                                    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
                                      <span className="text-muted-foreground">{t('الهاتف', 'Phone')}:</span>
                                      <span className="font-medium break-all" dir="ltr">{orderDetail.customer.phone}</span>
                                    </div>
                                    {orderDetail.customer.email && (
                                      <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
                                        <span className="text-muted-foreground">{t('البريد الإلكتروني', 'Email')}:</span>
                                        <span className="font-medium break-all">{orderDetail.customer.email}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div>
                                  <div className="flex items-center gap-2 mb-4 text-primary">
                                    <MapPin className="h-4 w-4" />
                                    <h3 className="font-bold text-sm tracking-wide uppercase">{t('عنوان الشحن', 'Shipping Address')}</h3>
                                  </div>
                                  <div className="space-y-3 text-sm">
                                    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
                                      <span className="text-muted-foreground">{t('المدينة/الحي', 'City/District')}:</span>
                                      <span className="font-medium break-words">{orderDetail.orderAddress.city} - {orderDetail.orderAddress.district}</span>
                                    </div>
                                    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
                                      <span className="text-muted-foreground">{t('الشارع', 'Street')}:</span>
                                      <span className="font-medium break-words">{orderDetail.orderAddress.street}</span>
                                    </div>
                                    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
                                      <span className="text-muted-foreground">{t('المبنى', 'Building')}:</span>
                                      <span className="font-medium break-words">{orderDetail.orderAddress.buildingNo}</span>
                                    </div>
                                    {orderDetail.orderAddress.additionalInfo && (
                                      <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
                                        <span className="text-muted-foreground">{t('معلومات إضافية', 'Additional Info')}:</span>
                                        <span className="font-medium text-muted-foreground italic break-words">{orderDetail.orderAddress.additionalInfo}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <Separator />

                              {/* Items Table */}
                              <div>
                                <div className="flex items-center gap-2 mb-4 text-primary">
                                  <Receipt className="h-4 w-4" />
                                  <h3 className="font-bold text-sm tracking-wide uppercase">{t('المنتجات', 'Items')}</h3>
                                </div>
                                <div className="max-w-full border rounded-md overflow-x-auto">
                                  <Table className="min-w-[420px]">
                                    <TableHeader className="bg-muted/30">
                                      <TableRow>
                                        <TableHead>{t('المنتج', 'Product')}</TableHead>
                                        <TableHead className="text-center">{t('الكمية', 'Qty')}</TableHead>
                                        <TableHead className="text-end">{t('سعر الوحدة', 'Unit Price')}</TableHead>
                                        <TableHead className="text-end">{t('المجموع', 'Total')}</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {orderDetail.items.map((item, idx) => (
                                        <TableRow key={idx}>
                                          <TableCell className="font-medium">
                                            <div className="flex items-center gap-3">
                                              {item.imageUrl ? (
                                                <div className="w-10 h-10 rounded-md bg-muted overflow-hidden flex-shrink-0">
                                                  <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                                                </div>
                                              ) : (
                                                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                                                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                              )}
                                              <span className="min-w-0 break-words">{item.productName}</span>
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-center">{item.quantity}</TableCell>
                                          <TableCell className="text-end">{item.unitPrice.toFixed(2)}</TableCell>
                                          <TableCell className="text-end font-semibold">{item.totalPrice.toFixed(2)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>

                              {/* Financial Summary */}
                              <div className="flex flex-col md:flex-row justify-end">
                                  <div className="w-full min-w-0 md:w-1/2 lg:w-1/3 bg-muted/10 p-5 rounded-md border space-y-3">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">{t('المجموع الفرعي', 'Subtotal')}</span>
                                    <span className="font-medium">{orderDetail.subtotal.toFixed(2)} {t('ر.س', 'SAR')}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">{t('تكلفة الشحن', 'Shipping')}</span>
                                    <span className="font-medium">{orderDetail.shippingCost.toFixed(2)} {t('ر.س', 'SAR')}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">{t('الضريبة', 'Tax')}</span>
                                    <span className="font-medium">{orderDetail.tax.toFixed(2)} {t('ر.س', 'SAR')}</span>
                                  </div>
                                  {orderDetail.discount > 0 && (
                                    <div className="flex justify-between text-sm text-success font-medium">
                                      <span className="min-w-0 break-words">{t('الخصم', 'Discount')} {orderDetail.coupon ? `(${orderDetail.coupon.code})` : ''}</span>
                                      <span>-{orderDetail.discount.toFixed(2)} {t('ر.س', 'SAR')}</span>
                                    </div>
                                  )}
                                  <Separator className="my-2" />
                                  <div className="flex justify-between items-center text-base font-bold text-primary">
                                    <span>{t('الإجمالي النهائي', 'Total')}</span>
                                    <span>{orderDetail.total.toFixed(2)} {t('ر.س', 'SAR')}</span>
                                  </div>
                                  <div className="flex justify-between items-center text-xs mt-2">
                                    <span className="text-muted-foreground">{t('طريقة الدفع', 'Payment Method')}</span>
                                    <span className="font-medium capitalize">{orderDetail.paymentMethod}</span>
                                  </div>
                                </div>
                              </div>

                            </div>
                          )}
                        </div>
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

