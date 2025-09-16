export const API = import.meta.env?.VITE_API_BASE || '/api'; // default to /api in prod, override via VITE_API_BASE

function getToken() {
  return localStorage.getItem('auth_token') || localStorage.getItem('cg_token') || '';
}

export async function fetchJSON(path, init = {}) {
  const headers = new Headers(init.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // Only set JSON content-type if a body is present and no explicit content-type set
  if (!headers.has('Content-Type') && init.body != null && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const opts = { ...init, headers };
  // Ensure cookies (if any) are sent for same-origin; doesn't hurt with Bearer
  if (opts.credentials === undefined) opts.credentials = 'include';

  const res = await fetch(`${API}${path}`, opts);
  if (res.status === 401) {
    try { localStorage.removeItem('auth_token'); localStorage.removeItem('cg_token'); } catch {}
    throw new Error('UNAUTHORIZED');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.status === 204) return null;
  const len = res.headers.get('content-length');
  if (len === '0') return null;
  return res.json();
}

export function apiGet(path) {
  return fetchJSON(path, { method: 'GET' });
}

export function apiPost(path, body = {}) {
  return fetchJSON(path, { method: 'POST', body: JSON.stringify(body) });
}

// FormData helper: uses same API base and does NOT set Content-Type
export async function apiPostForm(path, formData) {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: formData, credentials: 'include' });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Allow both default and named import styles
export default API;

// Optional convenience object if callers want a single import
export const Api = {
  base: API,
  get: apiGet,
  post: apiPost,
  postForm: apiPostForm,
  fetchJSON,
};