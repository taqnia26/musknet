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
import AdminContractsList from '@/pages/admin/contracts/index';
import AdminContractForm from '@/pages/admin/contracts/form';
import AdminContractDetail from '@/pages/admin/contracts/detail';
import AdminSiteContent from '@/pages/admin/site-content/index';
import AdminDistributorCatalog from '@/pages/admin/distributor-catalog/index';
import AdminStaff from '@/pages/admin/staff';
import AdminHR from '@/pages/admin/hr';
import AdminFinance from '@/pages/admin/finance';
import AdminManufacturing from '@/pages/admin/manufacturing';
import AdminExhibitions from '@/pages/admin/exhibitions';
import AdminInvoices from '@/pages/admin/invoices';
import AdminChatbot from '@/pages/admin/chatbot';
import AdminWhatsAppInbox from '@/pages/admin/whatsapp-inbox';
import { AdminWhatsAppSettings, AdminWhatsAppTemplates } from '@/pages/admin/whatsapp-placeholders';
import AdminIntegrations from '@/pages/admin/integrations';
import AdminAccounting from '@/pages/admin/accounting';
import AdminPurchases from '@/pages/admin/purchases';
import AdminGiftingIssues from '@/pages/admin/gifting-issues';

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
        <Route path="/admin/invoices" component={AdminInvoices} />
        <Route path="/admin/coupons" component={AdminCoupons} />
        <Route path="/admin/customers" component={AdminCustomers} />
        <Route path="/admin/inventory" component={AdminInventory} />
        <Route path="/admin/gifting-issues" component={AdminGiftingIssues} />
        <Route path="/admin/distributors" component={AdminDistributors} />
        <Route path="/admin/distributor-catalog" component={AdminDistributorCatalog} />
        <Route path="/admin/contracts" component={AdminContractsList} />
        <Route path="/admin/contracts/new" component={AdminContractForm} />
        <Route path="/admin/contracts/:id/edit" component={AdminContractForm} />
        <Route path="/admin/contracts/:id" component={AdminContractDetail} />
        <Route path="/admin/site-content" component={AdminSiteContent} />
        <Route path="/admin/hr" component={AdminHR} />
        <Route path="/admin/finance" component={AdminFinance} />
        <Route path="/admin/finance/expenses" component={AdminFinance} />
        <Route path="/admin/finance/purchases" component={AdminPurchases} />
        <Route path="/admin/finance/reports" component={AdminFinance} />
        <Route path="/admin/accounting" component={AdminAccounting} />
        <Route path="/admin/accounting/accounts" component={AdminAccounting} />
        <Route path="/admin/accounting/journal-entries" component={AdminAccounting} />
        <Route path="/admin/accounting/trial-balance" component={AdminAccounting} />
        <Route path="/admin/manufacturing" component={AdminManufacturing} />
        <Route path="/admin/exhibitions" component={AdminExhibitions} />
        <Route path="/admin/staff" component={AdminStaff} />
        <Route path="/admin/chatbot" component={AdminChatbot} />
        <Route path="/admin/whatsapp/inbox" component={AdminWhatsAppInbox} />
        <Route path="/admin/whatsapp/templates" component={AdminWhatsAppTemplates} />
        <Route path="/admin/whatsapp/settings" component={AdminWhatsAppSettings} />
        <Route path="/admin/marketing" component={AdminMarketingPlaceholder} />
        <Route path="/admin/integrations" component={AdminIntegrations} />
      </Switch>
    </AdminLayout>
  );
}

function AdminMarketingPlaceholder() {
  return (
    <div className="rounded-xl border bg-card p-8">
      <h1 className="text-3xl font-bold">التسويق / Marketing</h1>
      <p className="mt-2 text-muted-foreground">واجهة الحملات التسويقية ستكون متاحة هنا.</p>
    </div>
  );
}
