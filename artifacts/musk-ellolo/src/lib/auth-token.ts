export const AUTH_TOKEN_STORAGE_KEY = 'musk-ellolo-auth-token';

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function saveAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}