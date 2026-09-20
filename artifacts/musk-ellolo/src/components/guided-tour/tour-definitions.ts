import { hasPermission } from '@/lib/permissions';

export type TourCopy = {
  ar: string;
  en: string;
};

export type GuidedTourStep = {
  id: string;
  target: string;
  title: TourCopy;
  description: TourCopy;
  sidebar?: boolean;
  route?: string;
  module?: string;
  superAdminOnly?: boolean;
};

type AdminUser = NonNullable<Parameters<typeof hasPermission>[0]>;

export function getAdminNavTourKey(item: any) {
  return item.href ?? String(item.labelEn).toLowerCase().replaceAll(' ', '-');
}

export function canSeeAdminNavItem(item: any, user: AdminUser) {
  if (item.superAdminOnly && !user.isSuperAdmin) return false;
  if (item.module && item.module !== 'dashboard' && !hasPermission(user, item.module, 'view')) return false;
  if (!item.children) return true;
  return item.children.some((child: any) => {
    if (child.superAdminOnly && !user.isSuperAdmin) return false;
    return !child.module || child.module === 'dashboard' || hasPermission(user, child.module, 'view');
  });
}

export function getAdminTourSteps(navStructure: any[], user: AdminUser): GuidedTourStep[] {
  const steps: GuidedTourStep[] = [
    {
      id: 'admin-welcome',
      target: '[data-tour="admin-header"]',
      title: { ar: 'مرحباً بك في لوحة الإدارة', en: 'Welcome to the admin console' },
      description: {
        ar: 'تعرّف سريعاً على أدوات الرأس والأقسام المتاحة لك حسب صلاحياتك.',
        en: 'Take a quick look at the header tools and the sections available to your role.',
      },
      route: '/admin',
    },
    {
      id: 'admin-dashboard-content',
      target: 'main h1, main h2, main',
      title: { ar: 'لوحة المتابعة', en: 'Dashboard' },
      description: {
        ar: 'هنا تجد ملخصاً للأداء والإحصائيات الرئيسية لمتجرك.',
        en: 'Here you find a summary of performance and key statistics for your store.',
      },
      route: '/admin',
    },
    {
      id: 'admin-products',
      target: 'main h1, main h2, main',
      title: { ar: 'إدارة المنتجات', en: 'Manage Products' },
      description: {
        ar: 'أضف منتجات جديدة أو عدّل المنتجات الحالية، وتابع المخزون من هنا.',
        en: 'Add new products or edit existing ones, and track inventory from here.',
      },
      route: '/admin/products',
      module: 'products',
    },
    {
      id: 'admin-products-table',
      target: 'main table, main .grid, main',
      title: { ar: 'قائمة المنتجات', en: 'Products List' },
      description: {
        ar: 'استخدم الجدول لاستعراض المنتجات وتصفيتها وتعديل حالتها بسهولة.',
        en: 'Use the table to browse, filter, and easily modify product statuses.',
      },
      route: '/admin/products',
      module: 'products',
    },
    {
      id: 'admin-categories',
      target: 'main h1, main',
      title: { ar: 'الفئات', en: 'Categories' },
      description: {
        ar: 'نظّم منتجاتك في فئات لتسهيل تصفحها من قبل العملاء.',
        en: 'Organize your products into categories to make them easier for customers to browse.',
      },
      route: '/admin/categories',
      module: 'categories',
    },
    {
      id: 'admin-customers-indiv',
      target: 'main h1, main',
      title: { ar: 'العملاء الأفراد', en: 'Individual Customers' },
      description: {
        ar: 'استعرض بيانات عملائك الأفراد، طلباتهم، وسجل تواصلهم.',
        en: 'Review data for your individual customers, their orders, and contact history.',
      },
      route: '/admin/customers/individuals',
      module: 'customers',
    },
    {
      id: 'admin-customers-comp',
      target: 'main h1, main',
      title: { ar: 'الشركات', en: 'Companies' },
      description: {
        ar: 'إدارة حسابات الشركات والعملاء التجاريين وحدود الائتمان.',
        en: 'Manage company accounts, commercial customers, and credit limits.',
      },
      route: '/admin/customers/companies',
      module: 'distributors',
    },
    {
      id: 'admin-influencers',
      target: 'main h1, main',
      title: { ar: 'المشاهير', en: 'Influencers' },
      description: {
        ar: 'تابع أداء حملات المشاهير والعمولات المستحقة لهم.',
        en: 'Track influencer campaign performance and their owed commissions.',
      },
      route: '/admin/influencers',
      module: 'dashboard',
    },
    {
      id: 'admin-staff',
      target: 'main h1, main',
      title: { ar: 'إدارة الموظفين', en: 'Manage Staff' },
      description: {
        ar: 'أضف الموظفين وحدد صلاحياتهم وأدوارهم في النظام.',
        en: 'Add staff and define their permissions and roles in the system.',
      },
      route: '/admin/staff',
      superAdminOnly: true,
    },
    {
      id: 'admin-hr',
      target: 'main h1, main',
      title: { ar: 'الحضور والإجازات', en: 'Attendance & Leaves' },
      description: {
        ar: 'راجع سجلات الحضور وطلبات الإجازة للموظفين.',
        en: 'Review attendance records and leave requests for staff.',
      },
      route: '/admin/hr',
      module: 'hr',
    },
    {
      id: 'admin-sales-online',
      target: 'main h1, main',
      title: { ar: 'مبيعات الأفراد', en: 'Individual Sales' },
      description: {
        ar: 'تابع طلبات المتجر الإلكتروني وحالات الدفع والتجهيز.',
        en: 'Track online store orders, payment statuses, and preparation.',
      },
      route: '/admin/sales/online',
      module: 'orders',
    },
    {
      id: 'admin-sales-comp',
      target: 'main h1, main',
      title: { ar: 'مبيعات الشركات', en: 'Company Sales' },
      description: {
        ar: 'إدارة فواتير الشركات وأوامر الشراء المجمعة.',
        en: 'Manage company invoices and bulk purchase orders.',
      },
      route: '/admin/sales/companies',
      module: 'invoices',
    },
    {
      id: 'admin-sales-exhib',
      target: 'main h1, main',
      title: { ar: 'مبيعات المعارض', en: 'Exhibition Sales' },
      description: {
        ar: 'سجل مبيعات نقاط البيع والمعارض والمخزون المخصص لها.',
        en: 'Record point-of-sale and exhibition sales and their allocated inventory.',
      },
      route: '/admin/sales/exhibitions',
      module: 'exhibitions',
    },
    {
      id: 'admin-marketing',
      target: 'main h1, main',
      title: { ar: 'الحملات', en: 'Campaigns' },
      description: {
        ar: 'أنشئ حملات تسويقية وتابع عائد الاستثمار (ROI) الخاص بها.',
        en: 'Create marketing campaigns and track their return on investment (ROI).',
      },
      route: '/admin/marketing',
      module: 'campaigns',
    },
    {
      id: 'admin-coupons',
      target: 'main h1, main',
      title: { ar: 'الكوبونات', en: 'Coupons' },
      description: {
        ar: 'إصدار كوبونات الخصم وتحديد قواعد استخدامها.',
        en: 'Issue discount coupons and define their usage rules.',
      },
      route: '/admin/marketing/coupons',
      module: 'coupons',
    },
    {
      id: 'admin-whatsapp-inbox',
      target: 'main h1, main',
      title: { ar: 'واتساب خدمة العملاء', en: 'Customer Service WhatsApp' },
      description: {
        ar: 'تواصل مباشرة مع العملاء لحل مشاكلهم والإجابة على استفساراتهم.',
        en: 'Communicate directly with customers to solve issues and answer queries.',
      },
      route: '/admin/whatsapp/inbox',
      module: 'dashboard',
    },
    {
      id: 'admin-shipping-online',
      target: 'main h1, main',
      title: { ar: 'شحنات الأفراد', en: 'Individual Shipments' },
      description: {
        ar: 'تتبع بوليصات الشحن للطلبات الفردية وحالات التوصيل.',
        en: 'Track shipping waybills for individual orders and delivery statuses.',
      },
      route: '/admin/shipping/online',
      module: 'orders',
    },
    {
      id: 'admin-manufacturing',
      target: 'main h1, main',
      title: { ar: 'التصنيع', en: 'Manufacturing' },
      description: {
        ar: 'إدارة أوامر التصنيع واستهلاك المواد الخام لإنتاج المنتجات النهائية.',
        en: 'Manage manufacturing orders and raw material consumption to produce final products.',
      },
      route: '/admin/manufacturing',
      module: 'manufacturing',
    },
    {
      id: 'admin-inventory',
      target: 'main h1, main',
      title: { ar: 'نظرة عامة على المخزون', en: 'Inventory Overview' },
      description: {
        ar: 'مؤشرات سريعة لحالة المستودعات والكميات المتوفرة.',
        en: 'Quick indicators of warehouse status and available quantities.',
      },
      route: '/admin/inventory',
      module: 'inventory',
    },
    {
      id: 'admin-inventory-movements',
      target: 'main h1, main',
      title: { ar: 'سجل الحركات', en: 'Movement Ledger' },
      description: {
        ar: 'تتبع كافة الحركات الواردة والصادرة لضمان دقة الأرصدة.',
        en: 'Track all incoming and outgoing movements to ensure balance accuracy.',
      },
      route: '/admin/inventory/movements',
      module: 'inventory',
    },
    {
      id: 'admin-finance-expenses',
      target: 'main h1, main',
      title: { ar: 'المصروفات', en: 'Expenses' },
      description: {
        ar: 'سجل المصروفات التشغيلية وصنفها لتتبع التدفقات النقدية.',
        en: 'Record operating expenses and categorize them to track cash flows.',
      },
      route: '/admin/finance/expenses',
      module: 'finance',
    },
    {
      id: 'admin-accounting',
      target: 'main h1, main',
      title: { ar: 'المحاسبة', en: 'Accounting' },
      description: {
        ar: 'إدارة شجرة الحسابات والقيود اليومية ومراجعة الميزان.',
        en: 'Manage the chart of accounts, journal entries, and review the balance.',
      },
      route: '/admin/accounting/accounts',
      module: 'accounting',
    },
    {
      id: 'admin-contracts',
      target: 'main h1, main',
      title: { ar: 'العقود', en: 'Contracts' },
      description: {
        ar: 'سجل عقود الموزعين والشركات وحدد شروط التعامل.',
        en: 'Record distributor and company contracts and define terms of business.',
      },
      route: '/admin/contracts',
      module: 'contracts',
    },
    {
      id: 'admin-distributor-catalog',
      target: 'main h1, main',
      title: { ar: 'كتالوج B2B', en: 'B2B Catalog' },
      description: {
        ar: 'حدد المنتجات والأسعار المخصصة للموزعين والعملاء التجاريين.',
        en: 'Define products and custom prices for distributors and commercial clients.',
      },
      route: '/admin/distributor-catalog',
      module: 'distributors',
    },
    {
      id: 'admin-site-content',
      target: 'main h1, main',
      title: { ar: 'محتوى الموقع', en: 'Site Content' },
      description: {
        ar: 'تحديث البنرات، النصوص، وتصميم الواجهة الأمامية للمتجر.',
        en: 'Update banners, texts, and storefront design.',
      },
      route: '/admin/site-content',
      module: 'site-content',
    },
    {
      id: 'admin-integrations',
      target: 'main h1, main',
      title: { ar: 'واجهة التكاملات', en: 'Integrations Shell' },
      description: {
        ar: 'اربط متجرك بخدمات خارجية مثل بوابات الدفع وشركات الشحن.',
        en: 'Connect your store with external services like payment gateways and shipping providers.',
      },
      route: '/admin/integrations',
      module: 'dashboard',
    },
    {
      id: 'admin-owner-credentials',
      target: 'main h1, main',
      title: { ar: 'بيانات دخول المالك', en: 'Owner Credentials' },
      description: {
        ar: 'تعديل بيانات الدخول الخاصة بمالك المتجر بأمان.',
        en: 'Modify the store owner\'s login credentials securely.',
      },
      route: '/admin/settings/owner-credentials',
      superAdminOnly: true,
    },
    {
      id: 'admin-tools',
      target: '[data-tour="admin-tools"]',
      title: { ar: 'أدوات العرض', en: 'Display tools' },
      description: {
        ar: 'غيّر اللغة والمظهر، أو أعد تشغيل هذه الجولة من هنا.',
        en: 'Change the language and theme, or restart this tour from here.',
      },
      route: '/admin',
    }
  ];

  return steps.filter(step => {
    if (step.superAdminOnly && !user.isSuperAdmin) return false;
    if (step.module && step.module !== 'dashboard' && !hasPermission(user, step.module as any, 'view')) return false;
    return true;
  });
}

export const ownerTourSteps: GuidedTourStep[] = [
  {
    id: 'owner-welcome',
    target: '[data-tour="owner-header"]',
    title: { ar: 'مرحباً بك في لوحة المالك', en: 'Welcome to the owner console' },
    description: { ar: 'هذه اللوحة تجمع ملخص الأعمال وأدوات الحساب.', en: 'This console brings together business summaries and account tools.' },
    route: '/owner',
  },
  {
    id: 'owner-overview',
    target: 'main h1, main',
    title: { ar: 'نظرة عامة', en: 'Overview' },
    description: { ar: 'ملخص كميات وقيم المخزون وأبرز العمليات المرحّلة.', en: 'Summary of inventory quantities, values, and key posted operations.' },
    route: '/owner',
  },
  {
    id: 'owner-products',
    target: 'main h1, main',
    title: { ar: 'المنتجات', en: 'Products' },
    description: { ar: 'استعرض بيانات المخزون الكلي والفعلي من الجداول الأصلية.', en: 'Review total and actual inventory data from the original tables.' },
    route: '/owner/products',
  },
  {
    id: 'owner-obligations',
    target: 'main h1, main',
    title: { ar: 'الالتزامات', en: 'Obligations' },
    description: { ar: 'تابع الالتزامات المالية والقيود المرتبطة بها لضمان دقة الحسابات.', en: 'Track financial liabilities and their associated journals to ensure accurate accounting.' },
    route: '/owner/obligations',
  },
  {
    id: 'owner-manufacturing',
    target: 'main h1, main',
    title: { ar: 'التصنيع', en: 'Manufacturing' },
    description: { ar: 'الكميات التي تم تصنيعها واستهلاكها وفقاً للبيانات المعتمدة.', en: 'Quantities manufactured and consumed according to approved data.' },
    route: '/owner/manufacturing',
  },
  {
    id: 'owner-invoices',
    target: 'main h1, main',
    title: { ar: 'الفواتير', en: 'Invoices' },
    description: { ar: 'استعرض الفواتير الصادرة للموزعين والعملاء.', en: 'Review invoices issued to distributors and customers.' },
    route: '/owner/invoices',
  },
  {
    id: 'owner-security',
    target: 'main h1, main',
    title: { ar: 'الأمان والجلسات', en: 'Security and sessions' },
    description: { ar: 'راجع الأجهزة المسجّلة وألغِ أي جلسة لا تعرفها.', en: 'Review signed-in devices and revoke any session you do not recognize.' },
    route: '/owner/security',
  },
  {
    id: 'owner-tools',
    target: '[data-tour="owner-tools"]',
    title: { ar: 'أدوات الرأس', en: 'Header tools' },
    description: { ar: 'غيّر المظهر، راقب التنبيهات، أو أعد تشغيل الجولة من زر المساعدة.', en: 'Change the theme, watch notifications, or restart the tour from the help button.' },
    route: '/owner',
  },
];
