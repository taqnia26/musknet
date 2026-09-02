import { useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { AdminLayout } from '@/components/admin/admin-layout';
import AdminLogin from '@/pages/admin/login';
import AdminDashboard from '@/pages/admin/dashboard';
import AdminProducts from '@/pages/admin/products';
import AdminCategories from '@/pages/admin/categories';
import AdminOrders from '@/pages/admin/orders';
import AdminCoupons from '@/pages/admin/coupons';
import AdminCustomers from '@/pages/admin/customers';
import AdminInventory from '@/pages/admin/inventory';
import AdminDistributors from '@/pages/admin/distributors';
import AdminStaff from '@/pages/admin/staff';
import AdminHR from '@/pages/admin/hr';
import AdminFinance from '@/pages/admin/finance';
import AdminManufacturing from '@/pages/admin/manufacturing';
import AdminExhibitions from '@/pages/admin/exhibitions';

export default function AdminRoutes() {
  const [location] = useLocation();

  useEffect(() => {
    document.documentElement.classList.add('admin-route');
    return () => document.documentElement.classList.remove('admin-route');
  }, []);

  if (location === '/admin/login') {
    return <AdminLogin />;
  }

  return (
    <AdminLayout>
      <Switch>
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/products" component={AdminProducts} />
        <Route path="/admin/categories" component={AdminCategories} />
        <Route path="/admin/orders" component={AdminOrders} />
        <Route path="/admin/coupons" component={AdminCoupons} />
        <Route path="/admin/customers" component={AdminCustomers} />
        <Route path="/admin/inventory" component={AdminInventory} />
        <Route path="/admin/distributors" component={AdminDistributors} />
        <Route path="/admin/hr" component={AdminHR} />
        <Route path="/admin/finance" component={AdminFinance} />
        <Route path="/admin/manufacturing" component={AdminManufacturing} />
        <Route path="/admin/exhibitions" component={AdminExhibitions} />
        <Route path="/admin/staff" component={AdminStaff} />
      </Switch>
    </AdminLayout>
  );
}
