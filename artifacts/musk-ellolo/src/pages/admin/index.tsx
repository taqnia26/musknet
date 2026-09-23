import { useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { AdminLayout } from '@/components/admin/admin-layout';
import AdminLogin from '@/pages/admin/login';
import AdminDashboard from '@/pages/admin/dashboard';
import AdminRevenueAnalytics from '@/pages/admin/revenue-analytics';
import AdminProducts from '@/pages/admin/products';
import AdminCategories from '@/pages/admin/categories';
import AdminOrders from '@/pages/admin/orders';
import AdminCoupons from '@/pages/admin/coupons';
import AdminCustomers from '@/pages/admin/customers';
import AdminInventory from '@/pages/admin/inventory';
import AdminInventoryLocations from '@/pages/admin/inventory/locations';
import AdminInventoryTransfers from '@/pages/admin/inventory/transfers';
import AdminInventoryCounts from '@/pages/admin/inventory/cycle-counts';
import AdminInventoryMovements from '@/pages/admin/inventory/movements';
import AdminInventoryReports from '@/pages/admin/inventory/reports';
import AdminInventoryPurchases from '@/pages/admin/inventory/purchases';
import AdminNotFound from '@/pages/admin/not-found';
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
import AdminInvoices, { AdminOnlineInvoices, AdminExhibitionInvoices } from '@/pages/admin/invoices';
import AdminChatbot from '@/pages/admin/chatbot';
import AdminWhatsAppInbox from '@/pages/admin/whatsapp-inbox';
import { AdminWhatsAppSettings, AdminWhatsAppTemplates } from '@/pages/admin/whatsapp-placeholders';
import AdminIntegrations from '@/pages/admin/integrations';
import AdminAccounting from '@/pages/admin/accounting';
import AdminPurchases from '@/pages/admin/purchases';
import AdminWalletBilling from '@/pages/admin/wallet-billing';
import AdminGiftingIssues from '@/pages/admin/gifting-issues';
import OwnerCredentialsSettings from '@/pages/admin/owner-credentials';
import AdminInfluencers from '@/pages/admin/influencers';
import AdminCampaigns from '@/pages/admin/campaigns';
import AdminOnlineShipping from '@/pages/admin/shipping/online';
import AdminB2BShipping from '@/pages/admin/shipping/b2b';

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
        <Route path="/admin/customers/individuals" component={AdminCustomers} />
        <Route path="/admin/customers/companies" component={AdminDistributors} />
        <Route path="/admin/sales/online" component={AdminOnlineInvoices} />
        <Route path="/admin/sales/companies" component={AdminInvoices} />
        <Route path="/admin/sales/exhibitions" component={AdminExhibitionInvoices} />
        <Route path="/admin/marketing/coupons" component={AdminCoupons} />
        <Route path="/admin/revenue-analytics" component={AdminRevenueAnalytics} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/products" component={AdminProducts} />
        <Route path="/admin/categories" component={AdminCategories} />
        <Route path="/admin/orders" component={AdminOrders} />
        <Route path="/admin/shipping/online" component={AdminOnlineShipping} />
        <Route path="/admin/shipping/b2b" component={AdminB2BShipping} />
        <Route path="/admin/invoices" component={AdminInvoices} />
        <Route path="/admin/coupons" component={AdminCoupons} />
        <Route path="/admin/influencers" component={AdminInfluencers} />
        <Route path="/admin/customers" component={AdminCustomers} />
        <Route path="/admin/inventory/locations" component={AdminInventoryLocations} />
        <Route path="/admin/inventory/balances">
          {() => <AdminInventory titleKey="balances" />}
        </Route>
        <Route path="/admin/inventory/purchases" component={AdminInventoryPurchases} />
        <Route path="/admin/inventory/transfers" component={AdminInventoryTransfers} />
        <Route path="/admin/inventory/counts" component={AdminInventoryCounts} />
        <Route path="/admin/inventory/movements" component={AdminInventoryMovements} />
        <Route path="/admin/inventory/reports" component={AdminInventoryReports} />
        <Route path="/admin/inventory">
          {() => <AdminInventory titleKey="overview" />}
        </Route>
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
        <Route path="/admin/wallet-billing" component={AdminWalletBilling} />
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
        <Route path="/admin/marketing" component={AdminCampaigns} />
        <Route path="/admin/integrations" component={AdminIntegrations} />
        <Route path="/admin/settings/owner-credentials" component={OwnerCredentialsSettings} />
        <Route component={AdminNotFound} />
      </Switch>
    </AdminLayout>
  );
}
