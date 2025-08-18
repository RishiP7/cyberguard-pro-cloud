export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

function authHeaders() {
  const t = localStorage.getItem("token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function parse(r) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { error: text || r.statusText }; }
}

export async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`, { headers: { ...authHeaders() } });
  if (!r.ok) throw await parse(r);
  return parse(r);
}

export async function apiPost(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw await parse(r);
  return parse(r);
}

export async function adminGet(path) {
  const r = await fetch(`${API_BASE}${path}`, { headers: { "x-admin-key": "dev_admin_key" } });
  if (!r.ok) throw await parse(r);
  return parse(r);
}
