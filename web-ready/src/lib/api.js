export const API = import.meta.env?.VITE_API_BASE || '/api'; // environment override, defaults to /api

function getToken() {
  return localStorage.getItem('auth_token') || localStorage.getItem('cg_token') || '';
}

export async function fetchJSON(path, init = {}) {
  const headers = new Headers(init.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body != null) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (res.status === 401) {
    try { localStorage.removeItem('auth_token'); localStorage.removeItem('cg_token'); } catch {}
    // Optional: location.assign('/login');
    throw new Error('UNAUTHORIZED');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Safely handle empty bodies (e.g., 204 or explicit zero-length)
  if (res.status === 204) return null;
  const contentLength = res.headers.get('content-length');
  if (contentLength === '0') return null;
  return res.json();
}
export function apiGet(path) {
  // same-origin '/api', cookies will be sent automatically (same-origin default)
  return fetchJSON(path, { method: 'GET' });
}

export function apiPost(path, body = {}) {
  return fetchJSON(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// Optional: when sending FormData (no Content-Type header):
export async function apiPostForm(path, formData) {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('cg_token') || '';
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // do NOT set Content-Type when using FormData
  const res = await fetch(`/api${path}`, { method: 'POST', headers, body: formData });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}