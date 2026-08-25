export const AUTH_TOKEN_STORAGE_KEY = 'musk-ellolo-auth-token';
export const ADMIN_TOKEN_STORAGE_KEY = 'musk-ellolo-admin-token';

export function getAuthToken() {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  }
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function saveAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function removeAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
}

export function saveAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
}

export function removeAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
}