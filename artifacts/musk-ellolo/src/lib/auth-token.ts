export const AUTH_TOKEN_STORAGE_KEY = 'musk-ellolo-auth-token';
export const ADMIN_TOKEN_STORAGE_KEY = 'musk-ellolo-admin-token';
export const OWNER_TOKEN_STORAGE_KEY = 'musk-ellolo-owner-token';
export const INFLUENCER_TOKEN_STORAGE_KEY = 'musk-ellolo-influencer-token';

export function getAuthToken() {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  }
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/owner')) {
    return localStorage.getItem(OWNER_TOKEN_STORAGE_KEY);
  }
  if (typeof window !== 'undefined' && (window.location.pathname.startsWith('/influencer') || window.location.pathname.startsWith('/infulancer'))) {
    return localStorage.getItem(INFLUENCER_TOKEN_STORAGE_KEY);
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

export function getOwnerToken() {
  return localStorage.getItem(OWNER_TOKEN_STORAGE_KEY);
}

export function saveOwnerToken(token: string) {
  localStorage.setItem(OWNER_TOKEN_STORAGE_KEY, token);
}

export function removeOwnerToken() {
  localStorage.removeItem(OWNER_TOKEN_STORAGE_KEY);
}
export function saveInfluencerToken(token: string) { localStorage.setItem(INFLUENCER_TOKEN_STORAGE_KEY, token); }
export function removeInfluencerToken() { localStorage.removeItem(INFLUENCER_TOKEN_STORAGE_KEY); }