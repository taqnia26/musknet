import { useState, useMemo } from 'react';
import { useLanguage } from '@/hooks/use-language';
import { 
  useGetAdminShippingDashboard, 
  getGetAdminShippingDashboardQueryKey,
  useAdminCreateShipment,
  useAdminCreateShippingLabel,
  useAdminUpdateShipment,
  useGetAdminMe,
  ShipmentChannel,
  ShipmentStatus,
  type Shipment,
  getGetAdminMeQueryKey
} from '@workspace/api-client-react';
import { hasPermission } from '@/lib/permissions';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Package,
  Truck,
  MapPin,
  Search,
  Plus,
  RefreshCw,
  MoreVertical,
  Banknote,
  FileText,
  AlertCircle,
  Building,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Users
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
  CartesianGrid,
  Cell
} from 'recharts';
import { format, subDays, formatDistanceToNow } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Shared Utils for Shipping
export function getStatusColor(status: ShipmentStatus) {
  switch (status) {
    case 'delivered': return 'bg-success/10 text-success border-success/20';
    case 'in_transit': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'ready': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
    case 'returned': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    case 'cancelled': return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'pending':
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

export function getStatusLabel(status: ShipmentStatus, lang: string) {
  const map: Record<ShipmentStatus, { ar: string, en: string }> = {
    pending: { ar: 'قيد الانتظار', en: 'Pending' },
    ready: { ar: 'جاهز للشحن', en: 'Ready' },
    in_transit: { ar: 'في الطريق', en: 'In Transit' },
    delivered: { ar: 'تم التوصيل', en: 'Delivered' },
    returned: { ar: 'مرتجع', en: 'Returned' },
    cancelled: { ar: 'ملغي', en: 'Cancelled' }
  };
  return map[status]?.[lang as 'ar' | 'en'] || status;
}

export function getStatusIcon(status: ShipmentStatus) {
  switch (status) {
    case 'delivered': return CheckCircle2;
    case 'in_transit': return Truck;
    case 'ready': return Package;
    case 'returned': return ArrowRightLeft;
    case 'cancelled': return XCircle;
    case 'pending':
    default: return Clock;
  }
}

// Format Currency
const formatMoney = (amount: number, lang: string) => {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
  }).format(amount);
};

// Form Schemas
const shipmentUpdateSchema = z.object({
  destinationCity: z.string().min(1, 'City is required'),
  destinationAddress: z.string().nullable().optional(),
  carrier: z.string().nullable().optional(),
  serviceMethod: z.string().nullable().optional(),
  trackingNumber: z.string().nullable().optional(),
  status: z.enum(['pending', 'ready', 'in_transit', 'delivered', 'returned', 'cancelled']),
  actualCost: z.coerce.number().min(0).nullable().optional(),
  collectedCost: z.coerce.number().min(0).nullable().optional(),
  shippedAt: z.string().nullable().optional(),
  deliveredAt: z.string().nullable().optional(),
});

type ShipmentUpdateValues = z.infer<typeof shipmentUpdateSchema>;

const shipmentInputSchema = z.object({
  sourceId: z.coerce.number().min(1, 'Source ID (Order/Invoice) is required'),
  destinationCity: z.string().min(1, 'City is required'),
  destinationAddress: z.string().nullable().optional(),
  carrier: z.string().nullable().optional(),
  serviceMethod: z.string().nullable().optional(),
  trackingNumber: z.string().nullable().optional(),
  status: z.enum(['pending', 'ready', 'in_transit', 'delivered', 'returned', 'cancelled']).default('pending'),
  actualCost: z.coerce.number().min(0).nullable().optional(),
  collectedCost: z.coerce.number().min(0).nullable().optional(),
  shippedAt: z.string().nullable().optional(),
  deliveredAt: z.string().nullable().optional(),
});

type ShipmentInputValues = z.infer<typeof shipmentInputSchema>;

// Components
export function ShippingDashboardBase({ channel }: { channel: ShipmentChannel }) {
  const { lang, t } = useLanguage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // State
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('30d');
  const pageSize = 20;

  // Derive dates
  const dateParams = useMemo(() => {
    const today = new Date();
    let fromDate = new Date();
    
    switch (dateRange) {
      case '7d': fromDate = subDays(today, 7); break;
      case '30d': fromDate = subDays(today, 30); break;
      case '90d': fromDate = subDays(today, 90); break;
      case 'all': return {};
    }
    
    return {
      from: format(fromDate, 'yyyy-MM-dd'),
      to: format(today, 'yyyy-MM-dd')
    };
  }, [dateRange]);

  // Query
  const dashboardParams = {
    channel,
    page,
    pageSize,
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter as ShipmentStatus : undefined,
    city: cityFilter !== 'all' ? cityFilter : undefined,
    ...dateParams
  };
  const { data, isLoading, isError, refetch } = useGetAdminShippingDashboard(dashboardParams, {
    query: {
      queryKey: getGetAdminShippingDashboardQueryKey(dashboardParams),
    }
  });

  const { data: user } = useGetAdminMe({
    query: {
      queryKey: getGetAdminMeQueryKey(),
    }
  });
  
  const canEdit = channel === 'online' 
    ? hasPermission(user, 'orders', 'edit') 
    : hasPermission(user, 'invoices', 'edit');

  // Mutations
  const updateShipment = useAdminUpdateShipment({
    mutation: {
      onSuccess: () => {
        toast({
          title: t('تم التحديث بنجاح', 'Updated successfully'),
          description: t('تم تحديث الشحنة', 'Shipment has been updated'),
        });
        setEditOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetAdminShippingDashboardQueryKey() });
      },
      onError: (err) => {
        toast({
          variant: 'destructive',
          title: t('خطأ', 'Error'),
          description: t('فشل في التحديث', 'Failed to update'),
        });
      }
    }
  });

  const createShipment = useAdminCreateShipment({
    mutation: {
      onSuccess: () => {
        toast({
          title: t('تمت الإضافة بنجاح', 'Added successfully'),
          description: t('تم تسجيل الشحنة', 'Shipment has been registered'),
        });
        setRegisterOpen(false);
        registerForm.reset({ status: 'pending' });
        queryClient.invalidateQueries({ queryKey: getGetAdminShippingDashboardQueryKey() });
      },
      onError: (err) => {
        toast({
          variant: 'destructive',
          title: t('خطأ', 'Error'),
          description: t('فشل في إضافة الشحنة', 'Failed to register shipment'),
        });
      }
    }
  });

  const createLabel = useAdminCreateShippingLabel({
    mutation: {
      onSuccess: () => {
        toast({
          title: t('تم إصدار البوليصة', 'Shipping label created'),
          description: t('تم حفظ رقم التتبع وتكلفة الناقل تلقائياً', 'Tracking and carrier cost were saved automatically'),
        });
        queryClient.invalidateQueries({ queryKey: getGetAdminShippingDashboardQueryKey() });
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : t('تعذر الاتصال بالناقل', 'Could not reach the carrier');
        toast({
          variant: 'destructive',
          title: t('فشل إصدار البوليصة', 'Label creation failed'),
          description: message,
        });
        queryClient.invalidateQueries({ queryKey: getGetAdminShippingDashboardQueryKey() });
      },
    },
  });

  // Edit Dialog State
  const [editOpen, setEditOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  // Register Dialog State
  const [registerOpen, setRegisterOpen] = useState(false);

  // Forms
  const editForm = useForm<ShipmentUpdateValues>({
    resolver: zodResolver(shipmentUpdateSchema),
  });

  const registerForm = useForm<ShipmentInputValues>({
    resolver: zodResolver(shipmentInputSchema),
    defaultValues: {
      status: 'pending'
    }
  });

  // Handlers
  const handleEditClick = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    editForm.reset({
      destinationCity: shipment.destinationCity,
      destinationAddress: shipment.destinationAddress,
      carrier: shipment.carrier,
      serviceMethod: shipment.serviceMethod,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      actualCost: shipment.actualCost,
      collectedCost: shipment.collectedCost,
      shippedAt: shipment.shippedAt ? shipment.shippedAt.substring(0, 16) : undefined,
      deliveredAt: shipment.deliveredAt ? shipment.deliveredAt.substring(0, 16) : undefined,
    });
    setEditOpen(true);
  };

  const onEditSubmit = (values: ShipmentUpdateValues) => {
    if (!selectedShipment) return;
    
    updateShipment.mutate({
      id: selectedShipment.id,
      data: values
    });
  };

  const onRegisterSubmit = (values: ShipmentInputValues) => {
    createShipment.mutate({
      data: {
        ...values,
        channel: channel as any
      }
    });
  };

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-[50vh]">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">{t('حدث خطأ', 'An error occurred')}</h2>
        <p className="text-muted-foreground mb-4">{t('تعذر تحميل بيانات الشحن', 'Could not load shipping data')}</p>
        <Button onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry')}</Button>
      </div>
    );
  }

  const isB2B = channel === 'b2b';
  const pageTitle = isB2B ? t('شحنات B2B', 'B2B Shipments') : t('شحنات المتجر', 'Online Shipments');
  const sourceLabel = isB2B ? t('رقم الفاتورة', 'Invoice No.') : t('رقم الطلب', 'Order No.');

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-muted-foreground">{t('إدارة وتتبع عمليات الشحن والتوصيل', 'Manage and track shipping operations')}</p>
        </div>
        
        <div className="flex items-center gap-2">
          {canEdit && (
            <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
                  {t('تسجيل شحنة جديدة', 'Register New Shipment')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>{t('تسجيل شحنة', 'Register Shipment')}</DialogTitle>
                  <DialogDescription>
                    {isB2B 
                      ? t('تسجيل بيانات شحن لفاتورة B2B', 'Register shipping data for B2B invoice')
                      : t('تسجيل بيانات شحن لطلب متجر', 'Register shipping data for online order')}
                  </DialogDescription>
                </DialogHeader>
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={registerForm.control}
                        name="sourceId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{sourceLabel} (ID)</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('الحالة', 'Status')}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t('اختر الحالة', 'Select status')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="pending">{t('قيد الانتظار', 'Pending')}</SelectItem>
                                <SelectItem value="ready">{t('جاهز للشحن', 'Ready')}</SelectItem>
                                <SelectItem value="in_transit">{t('في الطريق', 'In Transit')}</SelectItem>
                                <SelectItem value="delivered">{t('تم التوصيل', 'Delivered')}</SelectItem>
                                <SelectItem value="returned">{t('مرتجع', 'Returned')}</SelectItem>
                                <SelectItem value="cancelled">{t('ملغي', 'Cancelled')}</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={registerForm.control}
                        name="destinationCity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('المدينة', 'City')}</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="carrier"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('شركة الشحن', 'Carrier')}</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={registerForm.control}
                      name="destinationAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('العنوان تفصيلاً', 'Full Address')}</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={registerForm.control}
                        name="trackingNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('رقم التتبع', 'Tracking No.')}</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="serviceMethod"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('نوع الخدمة', 'Service Method')}</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={registerForm.control}
                        name="actualCost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('التكلفة الفعلية', 'Actual Cost')} (SAR)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="collectedCost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('المبلغ المحصل من العميل', 'Collected Cost')} (SAR)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setRegisterOpen(false)}>
                        {t('إلغاء', 'Cancel')}
                      </Button>
                      <Button type="submit" disabled={createShipment.isPending}>
                        {createShipment.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('تسجيل', 'Register')}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
          
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('إجمالي الشحنات', 'Total Shipments')}</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '-' : data?.summary.shipmentCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('في الفترة المحددة', 'In selected period')}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isB2B ? t('عدد الموزعين', 'Unique Distributors') : t('عدد العملاء', 'Unique Customers')}
            </CardTitle>
            {isB2B ? <Building className="h-4 w-4 text-muted-foreground" /> : <Users className="h-4 w-4 text-muted-foreground" />}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '-' : data?.summary.uniqueParties}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('استلموا شحنات', 'Received shipments')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('التكلفة الفعلية', 'Actual Cost')}</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '-' : formatMoney(data?.summary.totalActualCost || 0, lang)}</div>
            <p className="text-xs text-muted-foreground mt-1 text-destructive">
              {t('تكلفة شركات الشحن', 'Carrier costs')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('المبلغ المحصل', 'Collected')}</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '-' : formatMoney(data?.summary.totalCollectedCost || 0, lang)}</div>
            <p className="text-xs text-muted-foreground mt-1 text-success">
              {t('تم تحصيله من العملاء', 'Collected from customers')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('متوسط التكلفة', 'Average Cost')}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '-' : formatMoney(data?.summary.averageActualCost || 0, lang)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('للشحنة الواحدة', 'Per shipment')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Charts */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('حجم الشحنات (يومياً)', 'Shipping Volume (Daily)')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              {isLoading || !data ? (
                <div className="h-full flex items-center justify-center border rounded-md bg-muted/20 animate-pulse">
                  <div className="text-muted-foreground text-sm">{t('جاري التحميل...', 'Loading...')}</div>
                </div>
              ) : data.trend.length === 0 ? (
                <div className="h-full flex items-center justify-center border rounded-md bg-muted/20">
                  <div className="text-muted-foreground text-sm">{t('لا توجد بيانات', 'No data')}</div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorShipments" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => format(new Date(val), 'dd MMM')}
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      labelFormatter={(val) => format(new Date(val), 'dd MMM yyyy')}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="shipments" 
                      name={t('الشحنات', 'Shipments')}
                      stroke="hsl(var(--primary))" 
                      fillOpacity={1} 
                      fill="url(#colorShipments)" 
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>{t('حالة الشحنات', 'Shipment Statuses')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
               {isLoading || !data ? (
                <div className="h-full flex items-center justify-center border rounded-md bg-muted/20 animate-pulse">
                  <div className="text-muted-foreground text-sm">{t('جاري التحميل...', 'Loading...')}</div>
                </div>
              ) : data.statuses.length === 0 ? (
                <div className="h-full flex items-center justify-center border rounded-md bg-muted/20">
                  <div className="text-muted-foreground text-sm">{t('لا توجد بيانات', 'No data')}</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {data.statuses.map((status) => {
                    const total = data.summary.shipmentCount || 1;
                    const percent = Math.round((status.count / total) * 100);
                    return (
                      <div key={status.key} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium flex items-center gap-2">
                            <span className={cn(
                              "w-2.5 h-2.5 rounded-full inline-block",
                              status.key === 'delivered' ? "bg-success" :
                              status.key === 'in_transit' ? "bg-blue-500" :
                              status.key === 'cancelled' ? "bg-destructive" :
                              status.key === 'ready' ? "bg-yellow-500" :
                              "bg-muted-foreground"
                            )}></span>
                            {lang === 'ar' ? status.labelAr : status.labelEn}
                          </span>
                          <span className="text-muted-foreground font-mono">{status.count} ({percent}%)</span>
                        </div>
                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full rounded-full",
                              status.key === 'delivered' ? "bg-success" :
                              status.key === 'in_transit' ? "bg-blue-500" :
                              status.key === 'cancelled' ? "bg-destructive" :
                              status.key === 'ready' ? "bg-yellow-500" :
                              "bg-muted-foreground"
                            )}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t('أكثر الوجهات نشاطاً', 'Top Destinations')}</CardTitle>
            <CardDescription>{t('توزيع الشحنات حسب المدينة أو الوجهة', 'Shipment distribution by city or destination')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] w-full">
              {isLoading || !data ? (
                <div className="h-full rounded-md bg-muted/20 animate-pulse" />
              ) : data.destinations.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  {t('لا توجد بيانات وجهات', 'No destination data')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.destinations} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="key" width={90} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="count" name={t('الشحنات', 'Shipments')} radius={[0, 6, 6, 0]}>
                      {data.destinations.map((destination, index) => (
                        <Cell key={destination.key} fill={index === 0 ? 'hsl(var(--primary))' : 'hsl(var(--accent))'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle>{t('سجل الشحنات', 'Shipments Log')}</CardTitle>
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full md:w-64">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:right-3 rtl:left-auto ltr:left-3 ltr:right-auto" />
                <Input 
                  placeholder={t('بحث (رقم تتبع، اسم)...', 'Search (Tracking, Name)...')} 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="rtl:pr-9 ltr:pl-9"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t('الحالة', 'Status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('جميع الحالات', 'All Statuses')}</SelectItem>
                  <SelectItem value="pending">{t('قيد الانتظار', 'Pending')}</SelectItem>
                  <SelectItem value="ready">{t('جاهز للشحن', 'Ready')}</SelectItem>
                  <SelectItem value="in_transit">{t('في الطريق', 'In Transit')}</SelectItem>
                  <SelectItem value="delivered">{t('تم التوصيل', 'Delivered')}</SelectItem>
                  <SelectItem value="returned">{t('مرتجع', 'Returned')}</SelectItem>
                  <SelectItem value="cancelled">{t('ملغي', 'Cancelled')}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t('المدينة', 'City')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('جميع المدن', 'All Cities')}</SelectItem>
                  {data?.cities?.map(city => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t('الفترة', 'Period')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">{t('آخر 7 أيام', 'Last 7 days')}</SelectItem>
                  <SelectItem value="30d">{t('آخر 30 يوم', 'Last 30 days')}</SelectItem>
                  <SelectItem value="90d">{t('آخر 90 يوم', 'Last 90 days')}</SelectItem>
                  <SelectItem value="all">{t('كل الوقت', 'All time')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-y">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[100px]">{t('المرجع', 'Ref')}</TableHead>
                  <TableHead>{isB2B ? t('الشركة/الموزع', 'Company') : t('العميل', 'Customer')}</TableHead>
                  <TableHead>{t('الوجهة', 'Destination')}</TableHead>
                  <TableHead>{t('الناقل', 'Carrier')}</TableHead>
                  <TableHead>{t('الحالة', 'Status')}</TableHead>
                  <TableHead className="text-right">{t('التكلفة الفعلية', 'Actual Cost')}</TableHead>
                  <TableHead className="text-right">{t('المحصل', 'Collected')}</TableHead>
                  <TableHead className="text-right">{t('تاريخ الشحن', 'Shipped At')}</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell><div className="h-5 w-16 bg-muted rounded animate-pulse"></div></TableCell>
                      <TableCell><div className="h-5 w-32 bg-muted rounded animate-pulse"></div></TableCell>
                      <TableCell><div className="h-5 w-24 bg-muted rounded animate-pulse"></div></TableCell>
                      <TableCell><div className="h-5 w-20 bg-muted rounded animate-pulse"></div></TableCell>
                      <TableCell><div className="h-6 w-24 bg-muted rounded-full animate-pulse"></div></TableCell>
                      <TableCell><div className="h-5 w-16 bg-muted rounded animate-pulse mr-auto"></div></TableCell>
                      <TableCell><div className="h-5 w-16 bg-muted rounded animate-pulse mr-auto"></div></TableCell>
                      <TableCell><div className="h-5 w-24 bg-muted rounded animate-pulse mr-auto"></div></TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  ))
                ) : data?.items?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      {t('لا توجد شحنات مطابقة', 'No shipments found')}
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.items?.map((shipment) => {
                    const StatusIcon = getStatusIcon(shipment.status);
                    const isOvercharged = (shipment.actualCost || 0) > (shipment.collectedCost || 0) + 1; // +1 margin
                    
                    return (
                      <TableRow key={shipment.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-xs">
                          {shipment.referenceNumber}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{shipment.partyName}</div>
                          <div className="text-xs text-muted-foreground flex gap-1 items-center mt-0.5">
                            {shipment.orderId ? `Order #${shipment.orderId}` : shipment.invoiceId ? `Inv #${shipment.invoiceId}` : ''}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            {shipment.destinationCity}
                          </div>
                          {shipment.destinationAddress && (
                            <div className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate" title={shipment.destinationAddress}>
                              {shipment.destinationAddress}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{shipment.carrier || '-'}</div>
                          {shipment.trackingNumber && (
                            <div className="text-xs font-mono text-primary mt-0.5 tracking-wider">
                              {shipment.trackingNumber}
                            </div>
                          )}
                          {shipment.integrationStatus === 'failed' && (
                            <div className="mt-1 max-w-[180px] truncate text-xs text-destructive" title={shipment.integrationError || undefined}>
                              {shipment.integrationError || t('فشل الربط', 'Integration failed')}
                            </div>
                          )}
                          {shipment.integrationStatus === 'processing' && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {t('جارٍ الاتصال بالناقل…', 'Contacting carrier…')}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("gap-1 whitespace-nowrap", getStatusColor(shipment.status))}>
                            <StatusIcon className="h-3 w-3" />
                            {getStatusLabel(shipment.status, lang)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={cn(
                            "font-medium", 
                            isOvercharged ? "text-destructive" : ""
                          )}>
                            {shipment.actualCost ? formatMoney(shipment.actualCost, lang) : '-'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {shipment.collectedCost ? formatMoney(shipment.collectedCost, lang) : '-'}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {shipment.shippedAt ? (
                            <div title={format(new Date(shipment.shippedAt), 'PPp', { locale: lang === 'ar' ? ar : enUS })}>
                              {formatDistanceToNow(new Date(shipment.shippedAt), { addSuffix: true, locale: lang === 'ar' ? ar : enUS })}
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel>{t('إجراءات', 'Actions')}</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {canEdit && (
                                <DropdownMenuItem onClick={() => handleEditClick(shipment)}>
                                  {t('تحديث الشحنة', 'Update Shipment')}
                                </DropdownMenuItem>
                              )}
                              {canEdit && shipment.integrationStatus !== 'active' && (
                                <DropdownMenuItem
                                  disabled={createLabel.isPending}
                                  onClick={() => createLabel.mutate({
                                    id: shipment.id,
                                    data: {
                                      carrier: 'smsa',
                                      serviceMethod: shipment.serviceMethod || 'standard',
                                    },
                                  })}
                                >
                                  {shipment.integrationStatus === 'failed'
                                    ? t('إعادة محاولة إصدار البوليصة', 'Retry label creation')
                                    : t('إصدار بوليصة SMSA', 'Create SMSA label')}
                                </DropdownMenuItem>
                              )}
                              {shipment.labelUrl && (
                                <DropdownMenuItem asChild>
                                  <a href={shipment.labelUrl} target="_blank" rel="noreferrer">
                                    {t('فتح البوليصة', 'Open label')}
                                  </a>
                                </DropdownMenuItem>
                              )}
                              {shipment.events.length > 0 && (
                                <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
                                  {t('آخر تحديث:', 'Last event:')} {shipment.events[0].eventType}
                                </DropdownMenuLabel>
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
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-sm text-muted-foreground">
                {t('صفحة', 'Page')} {page} {t('من', 'of')} {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || isLoading}
                >
                  <ChevronRight className="h-4 w-4 rtl:hidden" />
                  <ChevronLeft className="h-4 w-4 hidden rtl:block" />
                  <span className="sr-only">Previous</span>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || isLoading}
                >
                  <ChevronLeft className="h-4 w-4 rtl:hidden" />
                  <ChevronRight className="h-4 w-4 hidden rtl:block" />
                  <span className="sr-only">Next</span>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t('تحديث بيانات الشحن', 'Update Shipping Data')}</DialogTitle>
            <DialogDescription>
              {selectedShipment?.referenceNumber} - {selectedShipment?.partyName}
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('الحالة', 'Status')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('اختر الحالة', 'Select status')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pending">{t('قيد الانتظار', 'Pending')}</SelectItem>
                          <SelectItem value="ready">{t('جاهز للشحن', 'Ready')}</SelectItem>
                          <SelectItem value="in_transit">{t('في الطريق', 'In Transit')}</SelectItem>
                          <SelectItem value="delivered">{t('تم التوصيل', 'Delivered')}</SelectItem>
                          <SelectItem value="returned">{t('مرتجع', 'Returned')}</SelectItem>
                          <SelectItem value="cancelled">{t('ملغي', 'Cancelled')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="carrier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('شركة الشحن', 'Carrier')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="trackingNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('رقم التتبع', 'Tracking No.')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="serviceMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('نوع الخدمة', 'Service Method')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/20">
                <FormField
                  control={editForm.control}
                  name="actualCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-destructive font-medium">{t('التكلفة الفعلية (فاتورة الناقل)', 'Actual Cost (Carrier Invoice)')}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="collectedCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-success font-medium">{t('المحصل من العميل', 'Collected from Customer')}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <FormField
                  control={editForm.control}
                  name="destinationCity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('المدينة', 'City')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="shippedAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('تاريخ الشحن', 'Shipped At')}</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  {t('إلغاء', 'Cancel')}
                </Button>
                <Button type="submit" disabled={updateShipment.isPending}>
                  {updateShipment.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('حفظ التغييرات', 'Save Changes')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
