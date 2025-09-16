/**
 * Central API helper for CyberGuard Pro frontend
 */

// Resolve API base:
//  1) Use VITE_API_BASE if provided
//  2) If running on *.cyberguardpro.uk, hit the Render backend directly
//  3) Otherwise (local/dev), use same-origin proxy at /api
const API_BASE =
  (import.meta?.env?.VITE_API_BASE)
    || ((typeof window !== 'undefined' && /\.cyberguardpro\.uk$/.test(window.location.hostname))
          ? 'https://cyberguard-pro-cloud.onrender.com/api'
          : '/api');

let currentToken = null;

export function setToken(t) {
  currentToken = t || '';
  try {
    if (t) localStorage.setItem('auth_token', t);
    else localStorage.removeItem('auth_token');
  } catch {}
}

export function getToken() {
  try {
    return currentToken || localStorage.getItem('auth_token') || localStorage.getItem('cg_token') || '';
  } catch {
    return currentToken || '';
  }
}

export async function fetchJSON(path, init = {}) {
  const headers = new Headers(init.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body != null && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const opts = { ...init, headers };
  if (opts.credentials === undefined) opts.credentials = 'include';

  const url = /^https?:/i.test(path) ? path : `${API_BASE}${path}`;

  let res;
  try {
    res = await fetch(url, opts);
  } catch (_e) {
    throw new Error('Network request failed');
  }

  if (res.status === 204) return null;

  const raw = await res.text();
  const data = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;

  if (res.status === 401) {
    try { localStorage.removeItem('auth_token'); localStorage.removeItem('cg_token'); } catch {}
    throw new Error(data?.error || data?.message || 'UNAUTHORIZED');
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  }

  return data;
}

export function apiGet(path) {
  return fetchJSON(path, { method: 'GET' });
}

export function apiPost(path, body = {}) {
  return fetchJSON(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiPostForm(path, formData) {
  return fetchJSON(path, { method: 'POST', body: formData });
}

export const Api = {
  base: API_BASE,
  get: apiGet,
  post: apiPost,
  postForm: apiPostForm,
  fetchJSON,
};

// Back-compat exports
export { API_BASE as API };   // named export for string base
export default API_BASE;      // default export is the base string
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Api, setToken } from "../lib/api.js";

export default function Login(){
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  async function submit(e){
    e.preventDefault();
    setErr("");
    try{
      const j = await Api.post("/auth/login", { email, password });
      if(!j?.token){
        setErr(j?.error || "Login failed");
        return;
      }
      setToken(j.token);
      navigate("/");
    }catch(e){
      setErr(e?.message || "Network error");
    }
  }

  return (
    <Wrap>
      <Card>
        <h1 style={{margin:"0 0 12px"}}>Login</h1>
        <p style={{opacity:.8,marginTop:-6}}>Sign in to continue</p>
        <form onSubmit={submit} style={{display:"grid",gap:10,marginTop:12}}>
          <label>Email
            <input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={inp}/>
          </label>
          <label>Password
            <input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={inp}/>
          </label>
          {err && <div style={errBox}>{err}</div>}
          <button style={primary}>Sign in</button>
        </form>
        <div style={{marginTop:10,opacity:.8,fontSize:13}}>
          No account? <Link to="/register" style={{color:"#9ecbff"}}>Register</Link>
        </div>
      </Card>
    </Wrap>
  );
}

function Wrap({children}){return <div style={wrap}>{children}</div>;}
function Card({children}){return <div style={card}>{children}</div>;}
const wrap={minHeight:"100vh",display:"grid",placeItems:"center",background:"linear-gradient(180deg,#0b0d12,#131620)",color:"#e6e9ef",
  fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Helvetica,Arial,sans-serif"};
const card={width:"min(420px,92vw)",padding:20,background:"rgba(24,26,34,.8)",border:"1px solid rgba(255,255,255,.08)",borderRadius:14,backdropFilter:"blur(6px)"};
const inp={width:"100%",marginTop:6,padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"inherit"};
const primary={padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};
const errBox={padding:"8px 10px",border:"1px solid #ff6961",background:"#ff69611a",borderRadius:8};
