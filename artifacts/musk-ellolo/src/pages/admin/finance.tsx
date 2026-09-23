import { useState, useMemo } from 'react';
import { 
  useAdminGetFinanceSummary,
  useAdminGetFinanceMonthly,
  useAdminListExpenses,
  useAdminCreateExpense,
  useAdminUpdateExpense,
  useAdminDeleteExpense,
  useGetAdminMe,
  getAdminGetFinanceSummaryQueryKey,
  getAdminListExpensesQueryKey
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Edit2, Trash2, DollarSign, TrendingUp, ShoppingBag, PieChart, MoreHorizontal, Eye } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Line, LineChart } from 'recharts';
import { useLocation } from 'wouter';
import { PurchaseReceiptForm } from '@/components/admin/purchase-receipt-form';
import { Money } from '@/components/money';

function OverviewTab() {
  const { t, lang } = useLanguage();
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const { data: summary, isLoading } = useAdminGetFinanceSummary({ from: fromDate, to: toDate });
  const { data: monthly, isLoading: isLoadingMonthly } = useAdminGetFinanceMonthly();

  const chartConfig = {
    revenue: { label: lang === 'ar' ? 'الإيرادات' : 'Revenue', color: 'hsl(var(--success))' },
    expenses: { label: lang === 'ar' ? 'المصروفات' : 'Expenses', color: 'hsl(var(--destructive))' },
    profit: { label: lang === 'ar' ? 'صافي الربح' : 'Net Profit', color: 'hsl(var(--primary))' },
  };

  const chartData = useMemo(() => {
    if (!monthly) return [];
    return monthly.map(m => ({
      month: m.month,
      revenue: m.revenue,
      expenses: m.expenses,
      profit: m.netProfit
    }));
  }, [monthly]);

  return (
    <div className="space-y-6 mt-4">
      <div className="flex items-center gap-4 p-4 bg-card border rounded-md shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">{t('من:', 'From:')}</label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-auto h-9" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">{t('إلى:', 'To:')}</label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-auto h-9" />
        </div>
      </div>

      {isLoading || !summary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Card key={i} className="animate-pulse h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t('الإيرادات', 'Revenue')}</CardTitle>
              <DollarSign className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold"><Money value={summary.revenue} lang={lang} /></div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t('المصروفات', 'Expenses')}</CardTitle>
              <PieChart className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold"><Money value={summary.expenses} lang={lang} /></div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t('صافي الربح', 'Net Profit')}</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold"><Money value={summary.netProfit} lang={lang} /></div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t('الطلبات المكتملة', 'Paid Orders')}</CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.paidOrderCount}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('متوسط الطلب:', 'Avg:')} <Money value={summary.averageOrderValue} lang={lang} /></p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>{t('الأداء الشهري', 'Monthly Performance')}</CardTitle></CardHeader>
        <CardContent>
          {isLoadingMonthly ? <div className="h-[300px] flex items-center justify-center animate-pulse">{t('جاري التحميل...', 'Loading...')}</div> :
           chartData.length === 0 ? <div className="h-[300px] flex items-center justify-center">{t('لا توجد بيانات', 'No data')}</div> : (
             <ChartContainer config={chartConfig} className="h-[350px] w-full">
               <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} />
                 <XAxis dataKey="month" />
                 <YAxis width={80} />
                 <ChartTooltip content={<ChartTooltipContent />} />
                 <ChartLegend content={<ChartLegendContent />} />
                 <Line type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                 <Line type="monotone" dataKey="expenses" stroke="var(--color-expenses)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                 <Line type="monotone" dataKey="profit" stroke="var(--color-profit)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
               </LineChart>
             </ChartContainer>
           )
          }
        </CardContent>
      </Card>
    </div>
  );
}

function ExpensesTab({ canEdit, canDelete }: { canEdit: boolean, canDelete: boolean }) {
  const { t, lang } = useLanguage();
  const { data: expenses, isLoading } = useAdminListExpenses({});
  const [isOpen, setIsOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  
  const queryClient = useQueryClient();
  const createMutation = useAdminCreateExpense();
  const updateMutation = useAdminUpdateExpense();
  const deleteMutation = useAdminDeleteExpense();
  const { toast } = useToast();

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      category: formData.get('category') as any,
      amount: Number(formData.get('amount')),
      description: formData.get('description') as string,
      expenseDate: formData.get('expenseDate') as string,
      receiptUrl: formData.get('receiptUrl') as string || null,
    };

    if (editingExpense) {
      updateMutation.mutate({ id: editingExpense.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListExpensesQueryKey() });
          setIsOpen(false);
          toast({ title: t('تم الحفظ', 'Saved') });
        }
      });
    } else {
      createMutation.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListExpensesQueryKey() });
          setIsOpen(false);
          toast({ title: t('تمت الإضافة', 'Added') });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm(t('هل أنت متأكد من الحذف بشكل نهائي؟', 'Are you sure you want to hard delete?'))) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListExpensesQueryKey() });
          toast({ title: t('تم الحذف', 'Deleted') });
        }
      });
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        {canEdit && (
          <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if (!v) setEditingExpense(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 me-2" />{t('إضافة مصروف', 'Add Expense')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingExpense ? t('تعديل مصروف', 'Edit Expense') : t('إضافة مصروف', 'Add Expense')}</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('التصنيف', 'Category')}</label>
                  <select name="category" required defaultValue={editingExpense?.category || 'other'} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="rent">{t('إيجار', 'Rent')}</option>
                    <option value="salaries">{t('رواتب', 'Salaries')}</option>
                    <option value="utilities">{t('مرافق', 'Utilities')}</option>
                    <option value="marketing">{t('تسويق', 'Marketing')}</option>
                    <option value="shipping">{t('شحن', 'Shipping')}</option>
                    <option value="other">{t('أخرى', 'Other')}</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('المبلغ', 'Amount')}</label>
                    <Input name="amount" type="number" step="0.01" min="0.01" required defaultValue={editingExpense?.amount} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('التاريخ', 'Date')}</label>
                    <Input name="expenseDate" type="date" required defaultValue={editingExpense?.expenseDate?.split('T')[0] || new Date().toISOString().split('T')[0]} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الوصف', 'Description')}</label>
                  <Input name="description" required defaultValue={editingExpense?.description} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('رابط الإيصال', 'Receipt URL')}</label>
                  <Input name="receiptUrl" type="url" defaultValue={editingExpense?.receiptUrl || ''} />
                </div>
                <div className="flex justify-end mt-4">
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{t('حفظ', 'Save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('التاريخ', 'Date')}</TableHead>
              <TableHead>{t('التصنيف', 'Category')}</TableHead>
              <TableHead>{t('الوصف', 'Description')}</TableHead>
              <TableHead>{t('المبلغ', 'Amount')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow> : 
             !expenses?.length ? <TableRow><TableCell colSpan={5} className="text-center">{t('لا توجد بيانات', 'No data')}</TableCell></TableRow> :
             expenses.map(exp => (
               <TableRow key={exp.id}>
                 <TableCell>{format(new Date(exp.expenseDate), 'yyyy-MM-dd')}</TableCell>
                 <TableCell><Badge variant="outline">{exp.category}</Badge></TableCell>
                 <TableCell>{exp.description}</TableCell>
                  <TableCell className="font-semibold"><Money value={exp.amount} lang={lang} /></TableCell>
                 <TableCell className="text-end">
                   <DropdownMenu>
                     <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('المزيد', 'More')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                       {exp.receiptUrl && <DropdownMenuItem asChild><a href={exp.receiptUrl} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4 me-2" />{t('عرض الإيصال', 'View receipt')}</a></DropdownMenuItem>}
                       {canEdit && <DropdownMenuItem onClick={() => { setEditingExpense(exp); setIsOpen(true); }}><Edit2 className="h-4 w-4 me-2" />{t('تعديل', 'Edit')}</DropdownMenuItem>}
                       {canEdit && canDelete && <DropdownMenuSeparator />}
                       {canDelete && <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={deleteMutation.isPending} onClick={() => handleDelete(exp.id)}><Trash2 className="h-4 w-4 me-2" />{t('حذف', 'Delete')}</DropdownMenuItem>}
                     </DropdownMenuContent>
                   </DropdownMenu>
                 </TableCell>
               </TableRow>
             ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function MonthlyTab() {
  const { t, lang } = useLanguage();
  const { data: monthly, isLoading } = useAdminGetFinanceMonthly();

  return (
    <div className="space-y-4 mt-4">
      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('الشهر', 'Month')}</TableHead>
              <TableHead>{t('الإيرادات', 'Revenue')}</TableHead>
              <TableHead>{t('المصروفات', 'Expenses')}</TableHead>
              <TableHead>{t('الطلبات', 'Orders')}</TableHead>
              <TableHead>{t('الصافي', 'Net Profit')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow> : 
             !monthly?.length ? <TableRow><TableCell colSpan={5} className="text-center">{t('لا توجد بيانات', 'No data')}</TableCell></TableRow> :
             monthly.map(m => (
               <TableRow key={m.month}>
                 <TableCell className="font-medium">{m.month}</TableCell>
                  <TableCell className="text-success"><Money value={m.revenue} lang={lang} /></TableCell>
                  <TableCell className="text-destructive"><Money value={m.expenses} lang={lang} /></TableCell>
                 <TableCell>{m.paidOrderCount}</TableCell>
                 <TableCell className={`font-bold ${m.netProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    <Money value={m.netProfit} lang={lang} />
                 </TableCell>
               </TableRow>
             ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function AdminFinance() {
  const { t } = useLanguage();
  const [location] = useLocation();
  const { data: currentUser } = useGetAdminMe();
  const canEdit = hasPermission(currentUser, 'finance', 'edit');
  const canDelete = hasPermission(currentUser, 'finance', 'delete');
  const initialTab = location.endsWith('/expenses') ? 'expenses' : location.endsWith('/reports') ? 'monthly' : location.endsWith('/purchases') ? 'purchases' : 'overview';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('المالية', 'Finance')}</h1>
        <p className="text-muted-foreground mt-1">{t('إدارة المصروفات والتقارير المالية', 'Manage expenses and financial reports')}</p>
      </div>

      <Tabs key={initialTab} defaultValue={initialTab} className="w-full">
        <TabsList className="grid grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="overview">{t('نظرة عامة', 'Overview')}</TabsTrigger>
          <TabsTrigger value="expenses">{t('المصروفات', 'Expenses')}</TabsTrigger>
          <TabsTrigger value="monthly">{t('تقارير شهرية', 'Monthly')}</TabsTrigger>
          <TabsTrigger value="purchases">{t('المشتريات', 'Purchases')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="expenses"><ExpensesTab canEdit={canEdit} canDelete={canDelete} /></TabsContent>
        <TabsContent value="monthly"><MonthlyTab /></TabsContent>
        <TabsContent value="purchases"><PurchaseReceiptForm /></TabsContent>
      </Tabs>
    </div>
  );
}