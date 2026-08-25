import { AdminUser } from '@workspace/api-client-react';

export function hasPermission(user: AdminUser | null | undefined, module: string, action: 'view' | 'edit' | 'delete'): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return user.permissions?.includes(`${module}:${action}`) ?? false;
}
