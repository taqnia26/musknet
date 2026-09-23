import { useState } from 'react';
import {
  useAdminListEmployees,
  useAdminCreateEmployee,
  useAdminUpdateEmployee,
  useGetAdminMe,
  useAdminListAttendance,
  useAdminCreateAttendance,
  useAdminListLeaveRequests,
  useAdminCreateLeaveRequest,
  useAdminUpdateLeaveRequest,
  useAdminListPayroll,
  useAdminCreatePayroll,
  getAdminListEmployeesQueryKey,
  getAdminListAttendanceQueryKey,
  getAdminListLeaveRequestsQueryKey,
  getAdminListPayrollQueryKey
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
import { Search, Plus, Edit2, Check, X, Eye, MoreHorizontal } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const mutationErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.data?.error || error?.message || fallback;

function EmployeesTab({ canEdit }: { canEdit: boolean }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const { data: employees, isLoading } = useAdminListEmployees({ search });
  const queryClient = useQueryClient();
  const createMutation = useAdminCreateEmployee();
  const updateMutation = useAdminUpdateEmployee();
  const { toast } = useToast();

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      nationalId: formData.get('nationalId') as string,
      phone: formData.get('phone') as string,
      email: formData.get('email') as string || null,
      position: formData.get('position') as string,
      department: formData.get('department') as string,
      salary: Number(formData.get('salary')),
      hireDate: formData.get('hireDate') as string,
      isActive: formData.get('isActive') === 'true',
      adminUserId: formData.get('adminUserId') ? Number(formData.get('adminUserId')) : null,
    };

    if (!Number.isFinite(data.salary) || data.salary <= 0) {
      toast({ title: t('الراتب يجب أن يكون أكبر من صفر', 'Salary must be greater than zero'), variant: 'destructive' });
      return;
    }

    if (editingEmployee) {
      updateMutation.mutate({ id: editingEmployee.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListEmployeesQueryKey() });
          setIsOpen(false);
          toast({ title: t('تم الحفظ', 'Saved') });
        }
      });
    } else {
      createMutation.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListEmployeesQueryKey() });
          setIsOpen(false);
          toast({ title: t('تمت الإضافة', 'Added') });
        }
      });
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
          <Input
            placeholder={t('البحث عن موظف...', 'Search employees...')}
            className="pl-9 rtl:pr-9 rtl:pl-3 bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canEdit && (
          <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if (!v) setEditingEmployee(null); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4 me-2" />{t('إضافة موظف', 'Add Employee')}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingEmployee ? t('تعديل', 'Edit') : t('إضافة', 'Add')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الاسم', 'Name')}</label>
                  <Input name="name" required defaultValue={editingEmployee?.name} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الهوية', 'National ID')}</label>
                  <Input name="nationalId" required defaultValue={editingEmployee?.nationalId} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الهاتف', 'Phone')}</label>
                  <Input name="phone" required defaultValue={editingEmployee?.phone} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('البريد الإلكتروني', 'Email')}</label>
                  <Input name="email" type="email" defaultValue={editingEmployee?.email || ''} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('المنصب', 'Position')}</label>
                  <Input name="position" required defaultValue={editingEmployee?.position} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('القسم', 'Department')}</label>
                  <Input name="department" required defaultValue={editingEmployee?.department} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الراتب', 'Salary')}</label>
                   <Input name="salary" type="number" min="0.01" step="0.01" required defaultValue={editingEmployee?.salary} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('تاريخ التعيين', 'Hire Date')}</label>
                  <Input name="hireDate" type="date" required defaultValue={editingEmployee?.hireDate?.split('T')[0]} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('حساب المشرف المرتبط (اختياري)', 'Admin User ID (Optional)')}</label>
                  <Input name="adminUserId" type="number" defaultValue={editingEmployee?.adminUserId || ''} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الحالة', 'Status')}</label>
                  <select name="isActive" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" defaultValue={editingEmployee ? (editingEmployee.isActive ? 'true' : 'false') : 'true'}>
                    <option value="true">{t('نشط', 'Active')}</option>
                    <option value="false">{t('غير نشط', 'Inactive')}</option>
                  </select>
                </div>
                <div className="col-span-2 mt-4 flex justify-end">
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{t('حفظ', 'Save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div className="border rounded-md bg-card shadow-sm overflow-x-auto">
        <Table className="min-w-[800px]">
          <TableHeader>
            <TableRow>
              <TableHead>{t('الاسم', 'Name')}</TableHead>
              <TableHead>{t('تاريخ الانضمام', 'Join Date')}</TableHead>
              <TableHead>{t('المنصب', 'Position')}</TableHead>
              <TableHead>{t('القسم', 'Department')}</TableHead>
              <TableHead>{t('التواصل', 'Contact')}</TableHead>
              <TableHead>{t('الراتب', 'Salary')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead className="text-end"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={8} className="text-center py-12 animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow> :
             !employees?.length ? <TableRow><TableCell colSpan={8} className="text-center py-12">{t('لا توجد بيانات', 'No data')}</TableCell></TableRow> :
             employees.map(emp => (
               <TableRow key={emp.id}>
                 <TableCell className="font-medium">{emp.name}</TableCell>
                 <TableCell>{emp.hireDate ? format(new Date(emp.hireDate), 'yyyy-MM-dd') : '-'}</TableCell>
                 <TableCell>{emp.position}</TableCell>
                 <TableCell>{emp.department}</TableCell>
                 <TableCell dir="ltr" className="text-right rtl:text-left">{emp.phone}</TableCell>
                 <TableCell>{emp.salary}</TableCell>
                 <TableCell>
                    <Badge variant={emp.isActive ? 'default' : 'secondary'} className={emp.isActive ? 'bg-success hover:bg-success/90' : ''}>
                      {emp.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
                    </Badge>
                 </TableCell>
                 <TableCell className="text-end">
                   {canEdit && <DropdownMenu>
                     <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('المزيد', 'More')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                       <DropdownMenuItem onClick={() => { setEditingEmployee(emp); setIsOpen(true); }}><Edit2 className="h-4 w-4 me-2" />{t('تعديل', 'Edit')}</DropdownMenuItem>
                     </DropdownMenuContent>
                   </DropdownMenu>}
                 </TableCell>
               </TableRow>
             ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AttendanceTab({ canEdit }: { canEdit: boolean }) {
  const { t } = useLanguage();
  const { data: attendance, isLoading } = useAdminListAttendance({});
  const { data: employees } = useAdminListEmployees({});
  const [isOpen, setIsOpen] = useState(false);
  const [filterEmp, setFilterEmp] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const queryClient = useQueryClient();
  const createMutation = useAdminCreateAttendance();
  const { toast } = useToast();

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      employeeId: Number(formData.get('employeeId')),
      date: formData.get('date') as string,
      checkInTime: formData.get('checkInTime') as string || null,
      checkOutTime: formData.get('checkOutTime') as string || null,
      status: formData.get('status') as any,
      notes: formData.get('notes') as string || null,
    };
     if (data.checkInTime && data.checkOutTime) {
       const toSeconds = (value: string) => {
         const parts = value.split(':').map(Number);
         return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
       };
       if (toSeconds(data.checkOutTime) <= toSeconds(data.checkInTime)) {
         toast({ title: t('وقت الانصراف يجب أن يكون بعد وقت الحضور', 'Check-out time must be later than check-in time'), variant: 'destructive' });
         return;
       }
     }
    createMutation.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListAttendanceQueryKey() });
        setIsOpen(false);
        toast({ title: t('تم الحفظ', 'Saved') });
       },
        onError: (error) => toast({ title: mutationErrorMessage(error, t('تعذر حفظ الحضور', 'Unable to save attendance')), variant: 'destructive' })
    });
  };

  const getEmpName = (id: number) => employees?.find(e => e.id === id)?.name || id;

  const filteredAttendance = attendance?.filter(record => {
    if (filterEmp && record.employeeId.toString() !== filterEmp) return false;
    if (filterDate && !record.date.startsWith(filterDate)) return false;
    return true;
  });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterEmp}
            onChange={(e) => setFilterEmp(e.target.value)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
            data-testid="select-filter-employee"
          >
            <option value="">{t('كل الموظفين', 'All Employees')}</option>
            {employees?.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <Input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="w-auto h-10"
            data-testid="input-filter-date"
          />
          {(filterEmp || filterDate) && (
            <Button variant="ghost" onClick={() => { setFilterEmp(''); setFilterDate(''); }} data-testid="button-clear-filters">
              <X className="h-4 w-4 me-2" />
              {t('مسح', 'Clear')}
            </Button>
          )}
        </div>
        {canEdit && (
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 me-2" />{t('تسجيل حضور', 'Add Record')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t('تسجيل حضور', 'Add Record')}</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الموظف', 'Employee')}</label>
                  <select name="employeeId" required className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="">{t('اختر موظف...', 'Select employee...')}</option>
                    {employees?.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('التاريخ', 'Date')}</label>
                    <Input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('الحالة', 'Status')}</label>
                    <select name="status" required className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                      <option value="present">{t('حاضر', 'Present')}</option>
                      <option value="absent">{t('غائب', 'Absent')}</option>
                      <option value="late">{t('متأخر', 'Late')}</option>
                      <option value="on_leave">{t('إجازة', 'On Leave')}</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('وقت الحضور', 'Check In')}</label>
                    <Input name="checkInTime" type="time" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('وقت الانصراف', 'Check Out')}</label>
                    <Input name="checkOutTime" type="time" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('ملاحظات', 'Notes')}</label>
                  <Input name="notes" />
                </div>
                <div className="flex justify-end mt-4">
                  <Button type="submit" disabled={createMutation.isPending}>{t('حفظ', 'Save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div className="border rounded-md overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead>{t('الموظف', 'Employee')}</TableHead>
              <TableHead>{t('التاريخ', 'Date')}</TableHead>
              <TableHead>{t('الحضور', 'Check In')}</TableHead>
              <TableHead>{t('الانصراف', 'Check Out')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-12 animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow> :
             !filteredAttendance?.length ? <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">{t('لا توجد بيانات', 'No data')}</TableCell></TableRow> :
             filteredAttendance.map(record => (
               <TableRow key={record.id}>
                 <TableCell className="font-medium">{getEmpName(record.employeeId)}</TableCell>
                 <TableCell>{format(new Date(record.date), 'yyyy-MM-dd')}</TableCell>
                 <TableCell>{record.checkInTime || '-'}</TableCell>
                 <TableCell>{record.checkOutTime || '-'}</TableCell>
                 <TableCell>
                   <Badge variant="outline">{record.status}</Badge>
                 </TableCell>
               </TableRow>
             ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LeaveRequestsTab({ canEdit }: { canEdit: boolean }) {
  const { t } = useLanguage();
  const { data: requests, isLoading } = useAdminListLeaveRequests({});
  const { data: employees } = useAdminListEmployees({});
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const createMutation = useAdminCreateLeaveRequest();
  const updateMutation = useAdminUpdateLeaveRequest();
  const { toast } = useToast();

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      employeeId: Number(formData.get('employeeId')),
      leaveType: formData.get('leaveType') as any,
      startDate: formData.get('startDate') as string,
      endDate: formData.get('endDate') as string,
      reason: formData.get('reason') as string,
      status: 'pending' as any,
    };
     if (data.endDate < data.startDate) {
       toast({ title: t('تاريخ نهاية الإجازة لا يمكن أن يسبق تاريخ البداية', 'Leave end date cannot precede start date'), variant: 'destructive' });
       return;
     }
    createMutation.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListLeaveRequestsQueryKey() });
        setIsOpen(false);
        toast({ title: t('تم الحفظ', 'Saved') });
       },
       onError: (error) => toast({ title: mutationErrorMessage(error, t('تعذر حفظ طلب الإجازة', 'Unable to save leave request')), variant: 'destructive' })
    });
  };

  const handleStatus = (id: number, status: 'approved' | 'rejected') => {
    updateMutation.mutate({ id, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListLeaveRequestsQueryKey() });
        toast({ title: t('تم التحديث', 'Updated') });
      },
      onError: (error) => toast({ title: mutationErrorMessage(error, t('تعذر تحديث طلب الإجازة', 'Unable to update leave request')), variant: 'destructive' })
    });
  };

  const getEmpName = (id: number) => employees?.find(e => e.id === id)?.name || id;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        {canEdit && (
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 me-2" />{t('طلب إجازة', 'Add Request')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t('طلب إجازة', 'Add Request')}</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الموظف', 'Employee')}</label>
                  <select name="employeeId" required className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="">{t('اختر موظف...', 'Select employee...')}</option>
                    {employees?.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('النوع', 'Type')}</label>
                  <select name="leaveType" required className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="annual">{t('سنوية', 'Annual')}</option>
                    <option value="sick">{t('مرضية', 'Sick')}</option>
                    <option value="emergency">{t('طارئة', 'Emergency')}</option>
                    <option value="unpaid">{t('بدون راتب', 'Unpaid')}</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('من', 'Start Date')}</label>
                    <Input name="startDate" type="date" required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('إلى', 'End Date')}</label>
                    <Input name="endDate" type="date" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('السبب', 'Reason')}</label>
                  <Input name="reason" required />
                </div>
                <div className="flex justify-end mt-4">
                  <Button type="submit" disabled={createMutation.isPending}>{t('حفظ', 'Save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div className="border rounded-md overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead>{t('الموظف', 'Employee')}</TableHead>
              <TableHead>{t('النوع', 'Type')}</TableHead>
              <TableHead>{t('الفترة', 'Period')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow> :
             !requests?.length ? <TableRow><TableCell colSpan={5} className="text-center">{t('لا توجد بيانات', 'No data')}</TableCell></TableRow> :
             requests.map(req => (
               <TableRow key={req.id}>
                 <TableCell className="font-medium">{getEmpName(req.employeeId)}</TableCell>
                 <TableCell><Badge variant="outline">{req.leaveType}</Badge></TableCell>
                 <TableCell>{format(new Date(req.startDate), 'yyyy-MM-dd')} - {format(new Date(req.endDate), 'yyyy-MM-dd')}</TableCell>
                 <TableCell>
                   <Badge variant={req.status === 'approved' ? 'default' : req.status === 'rejected' ? 'destructive' : 'secondary'}
                     className={req.status === 'approved' ? 'bg-success text-success-foreground' : ''}
                   >
                     {req.status}
                   </Badge>
                 </TableCell>
                 <TableCell className="text-end">
                   {canEdit && req.status === 'pending' && <DropdownMenu>
                     <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('المزيد', 'More')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                       <DropdownMenuItem className="text-success focus:text-success" onClick={() => handleStatus(req.id, 'approved')} disabled={updateMutation.isPending}><Check className="h-4 w-4 me-2" />{t('موافقة', 'Approve')}</DropdownMenuItem>
                       <DropdownMenuSeparator />
                       <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleStatus(req.id, 'rejected')} disabled={updateMutation.isPending}><X className="h-4 w-4 me-2" />{t('رفض', 'Reject')}</DropdownMenuItem>
                     </DropdownMenuContent>
                   </DropdownMenu>}
                 </TableCell>
               </TableRow>
             ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PayrollTab({ canEdit }: { canEdit: boolean }) {
  const { t } = useLanguage();
  const { data: payroll, isLoading } = useAdminListPayroll({});
  const { data: employees } = useAdminListEmployees({});
  const [isOpen, setIsOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [base, setBase] = useState(0);
  const [deductions, setDeductions] = useState(0);
  const [bonuses, setBonuses] = useState(0);

  const queryClient = useQueryClient();
  const createMutation = useAdminCreatePayroll();
  const { toast } = useToast();

  const handleEmpChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    setSelectedEmp(e.target.value);
    const emp = employees?.find(em => em.id === id);
    if (emp) setBase(emp.salary);
  };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      employeeId: Number(formData.get('employeeId')),
      month: Number(formData.get('month')),
      year: Number(formData.get('year')),
      baseSalary: base,
      deductions,
      bonuses,
      paymentStatus: formData.get('paymentStatus') as any,
      paymentDate: (formData.get('paymentStatus') === 'paid' && formData.get('paymentDate')) ? formData.get('paymentDate') as string : null,
    };
     const employeeId = data.employeeId;
     const netSalary = data.baseSalary + data.bonuses - data.deductions;
     if (!employees?.some(employee => employee.id === employeeId)) {
       toast({ title: t('يجب اختيار موظف صالح', 'Please select a valid employee'), variant: 'destructive' });
       return;
     }
     if (!Number.isInteger(data.month) || data.month < 1 || data.month > 12) {
       toast({ title: t('الشهر يجب أن يكون بين 1 و12', 'Month must be between 1 and 12'), variant: 'destructive' });
       return;
     }
     if (!Number.isInteger(data.year) || data.year < 1900 || data.year > 2200) {
       toast({ title: t('السنة يجب أن تكون رقماً صحيحاً معقولاً', 'Year must be a reasonable integer'), variant: 'destructive' });
       return;
     }
     if (![data.baseSalary, data.bonuses, data.deductions].every(Number.isFinite) ||
         data.baseSalary < 0 || data.bonuses < 0 || data.deductions < 0) {
       toast({ title: t('قيم الرواتب يجب أن تكون غير سالبة', 'Payroll amounts must be non-negative'), variant: 'destructive' });
       return;
     }
     if (netSalary < 0) {
       toast({ title: t('لا يمكن أن يكون صافي الراتب سالباً', 'Computed net salary cannot be negative'), variant: 'destructive' });
       return;
     }
    createMutation.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListPayrollQueryKey() });
        setIsOpen(false);
        toast({ title: t('تم الحفظ', 'Saved') });
       },
       onError: (error) => toast({ title: mutationErrorMessage(error, t('تعذر حفظ مسير الرواتب', 'Unable to save payroll')), variant: 'destructive' })
    });
  };

  const getEmpName = (id: number) => employees?.find(e => e.id === id)?.name || id;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        {canEdit && (
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 me-2" />{t('إضافة مسير رواتب', 'Add Payroll')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t('إضافة مسير رواتب', 'Add Payroll')}</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الموظف', 'Employee')}</label>
                  <select name="employeeId" required value={selectedEmp} onChange={handleEmpChange} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="">{t('اختر موظف...', 'Select employee...')}</option>
                    {employees?.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="input-month">{t('الشهر', 'Month')}</label>
                    <Input id="input-month" name="month" type="number" min="1" max="12" required defaultValue={new Date().getMonth() + 1} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="input-year">{t('السنة', 'Year')}</label>
                    <Input id="input-year" name="year" type="number" min="2000" max="2100" required defaultValue={new Date().getFullYear()} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="input-base">{t('الأساسي', 'Base')}</label>
                    <Input id="input-base" type="number" min="0" step="0.01" value={base} onChange={e => setBase(Number(e.target.value))} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="input-deductions">{t('الخصومات', 'Deductions')}</label>
                    <Input id="input-deductions" type="number" min="0" step="0.01" value={deductions} onChange={e => setDeductions(Number(e.target.value))} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="input-bonuses">{t('المكافآت', 'Bonuses')}</label>
                    <Input id="input-bonuses" type="number" min="0" step="0.01" value={bonuses} onChange={e => setBonuses(Number(e.target.value))} required />
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-md flex justify-between items-center">
                  <span className="font-semibold">{t('الصافي:', 'Net:')}</span>
                  <span className="font-bold text-lg text-primary">{Math.max(0, base + bonuses - deductions)} SAR</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('الحالة', 'Status')}</label>
                    <select name="paymentStatus" required className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                      <option value="pending">{t('معلق', 'Pending')}</option>
                      <option value="paid">{t('مدفوع', 'Paid')}</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('تاريخ الدفع', 'Payment Date')}</label>
                    <Input name="paymentDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <Button type="submit" disabled={createMutation.isPending}>{t('حفظ', 'Save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div className="border rounded-md overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead>{t('الموظف', 'Employee')}</TableHead>
              <TableHead>{t('الشهر/السنة', 'Period')}</TableHead>
              <TableHead>{t('الأساسي', 'Base')}</TableHead>
              <TableHead>{t('المكافآت', 'Bonuses')}</TableHead>
              <TableHead>{t('الخصومات', 'Deductions')}</TableHead>
              <TableHead>{t('الصافي', 'Net')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7} className="text-center py-12 animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow> :
             !payroll?.length ? <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">{t('لا توجد بيانات', 'No data')}</TableCell></TableRow> :
             payroll.map(p => (
               <TableRow key={p.id}>
                 <TableCell className="font-medium">{getEmpName(p.employeeId)}</TableCell>
                 <TableCell>{p.month} / {p.year}</TableCell>
                 <TableCell>{p.baseSalary}</TableCell>
                 <TableCell className="text-success">{p.bonuses}</TableCell>
                 <TableCell className="text-destructive">{p.deductions}</TableCell>
                 <TableCell className="font-bold text-primary">{p.netSalary}</TableCell>
                 <TableCell>
                   <Badge variant={p.paymentStatus === 'paid' ? 'default' : 'secondary'} className={p.paymentStatus === 'paid' ? 'bg-success text-success-foreground' : ''}>
                     {p.paymentStatus}
                   </Badge>
                 </TableCell>
               </TableRow>
             ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function AdminHR() {
  const { t } = useLanguage();
  const { data: currentUser } = useGetAdminMe();
  const canEdit = hasPermission(currentUser, 'hr', 'edit');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('الموارد البشرية', 'HR')}</h1>
        <p className="text-muted-foreground mt-1">{t('إدارة الموظفين والرواتب والحضور', 'Manage employees, payroll, and attendance')}</p>
      </div>

      <Tabs defaultValue="employees" className="w-full">
        <TabsList className="grid grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="employees">{t('الموظفين', 'Employees')}</TabsTrigger>
          <TabsTrigger value="attendance">{t('الحضور', 'Attendance')}</TabsTrigger>
          <TabsTrigger value="leave_requests">{t('الإجازات', 'Leave Requests')}</TabsTrigger>
          <TabsTrigger value="payroll">{t('الرواتب', 'Payroll')}</TabsTrigger>
        </TabsList>
        <TabsContent value="employees"><EmployeesTab canEdit={canEdit} /></TabsContent>
        <TabsContent value="attendance"><AttendanceTab canEdit={canEdit} /></TabsContent>
        <TabsContent value="leave_requests"><LeaveRequestsTab canEdit={canEdit} /></TabsContent>
        <TabsContent value="payroll"><PayrollTab canEdit={canEdit} /></TabsContent>
      </Tabs>
    </div>
  );
}