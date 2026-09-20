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
  const welcome: GuidedTourStep = {
    id: 'admin-welcome',
    target: '[data-tour="admin-header"]',
    title: { ar: 'مرحباً بك في لوحة الإدارة', en: 'Welcome to the admin console' },
    description: {
      ar: 'تعرّف سريعاً على أدوات الرأس والأقسام المتاحة لك حسب صلاحياتك.',
      en: 'Take a quick look at the header tools and the sections available to your role.',
    },
  };
  const navigation = navStructure.filter((item) => canSeeAdminNavItem(item, user)).map((item) => ({
    id: `admin-nav-${getAdminNavTourKey(item)}`,
    target: `[data-tour-nav="${getAdminNavTourKey(item)}"]`,
    title: { ar: item.labelAr, en: item.labelEn },
    description: {
      ar: item.children
        ? `افتح مجموعة ${item.labelAr} للوصول إلى الأدوات المتاحة لك.`
        : `انتقل إلى ${item.labelAr} من هنا.`,
      en: item.children
        ? `Open ${item.labelEn} to access the tools available to you.`
        : `Open ${item.labelEn} from here.`,
    },
    sidebar: true,
  }));
  return [welcome, ...navigation, {
    id: 'admin-tools',
    target: '[data-tour="admin-tools"]',
    title: { ar: 'أدوات العرض', en: 'Display tools' },
    description: {
      ar: 'غيّر اللغة والمظهر، أو أعد تشغيل هذه الجولة من زر المساعدة.',
      en: 'Change the language and theme, or restart this tour from the help button.',
    },
  }];
}

export const ownerTourSteps: GuidedTourStep[] = [
  {
    id: 'owner-welcome',
    target: '[data-tour="owner-header"]',
    title: { ar: 'مرحباً بك في لوحة المالك', en: 'Welcome to the owner console' },
    description: { ar: 'هذه اللوحة تجمع ملخص الأعمال وأدوات الحساب.', en: 'This console brings together business summaries and account tools.' },
  },
  {
    id: 'owner-navigation',
    target: '[data-tour="owner-management"]',
    title: { ar: 'أقسام الإدارة', en: 'Management sections' },
    description: { ar: 'استخدم هذه القائمة للتنقل بين المنتجات والالتزامات والفواتير وبقية الأقسام.', en: 'Use this menu to move between products, obligations, invoices, and the other sections.' },
    sidebar: true,
  },
  {
    id: 'owner-security',
    target: '[data-tour="owner-security"]',
    title: { ar: 'الأمان والجلسات', en: 'Security and sessions' },
    description: { ar: 'راجع الأجهزة المسجّلة وألغِ أي جلسة لا تعرفها.', en: 'Review signed-in devices and revoke any session you do not recognize.' },
    sidebar: true,
  },
  {
    id: 'owner-tools',
    target: '[data-tour="owner-tools"]',
    title: { ar: 'أدوات الرأس', en: 'Header tools' },
    description: { ar: 'غيّر المظهر، راقب التنبيهات، أو أعد تشغيل الجولة من زر المساعدة.', en: 'Change the theme, watch notifications, or restart the tour from the help button.' },
  },
];