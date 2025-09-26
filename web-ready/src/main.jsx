import Login from "./pages/Login.jsx";
// --- API base path ---
const API_BASE = (typeof globalThis !== 'undefined' && globalThis.API_BASE)
  ? globalThis.API_BASE
  : ((typeof window !== 'undefined' && window.location.hostname.includes('onrender.com'))
      ? 'https://cyberguard-pro-cloud.onrender.com/api'
      : '/api');
/* === SAFETY BOOTSTRAP (do not remove) ================================
   Ensures required React/Router imports and minimal API helpers exist.
   This prevents blank screens when a module didn't tree-shake in.
===================================================================== */
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";

/* Define globals only if they aren't already defined in this bundle */
/// eslint-disable-next-line no-var
var apiGet = (typeof apiGet !== "undefined")
  ? apiGet
  : async function apiGet(path){
      const token = (typeof localStorage!=="undefined" && localStorage.getItem("token")) || "";
      const url = `${API_BASE}${path.startsWith("/") ? path : "/" + path}`;
      const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials:"include" });
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { ok:false, error:t }; }
      if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { detail: j });
      return j;
    };

/// eslint-disable-next-line no-var
var API = (typeof API !== "undefined")
  ? API
  : {
      async get(path){ return apiGet(path); },
      async post(path, body){
        const token = (typeof localStorage!=="undefined" && localStorage.getItem("token")) || "";
        const url = `${API_BASE}${path.startsWith("/") ? path : "/" + path}`;
        const r = await fetch(url, {
          method:"POST",
          headers:{ "content-type":"application/json", ...(token? { Authorization:`Bearer ${token}` } : {}) },
          credentials:"include",
          body: JSON.stringify(body||{})
        });
        const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { ok:false, error:t }; }
        if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { detail: j });
        return j;
      },
      async postWithKey(path, body, key){
        const url = `${API_BASE}${path.startsWith("/") ? path : "/" + path}`;
        const r = await fetch(url, {
          method:"POST",
          headers:{ "content-type":"application/json", ...(key? { "x-api-key": key } : {}) },
          credentials:"include",
          body: JSON.stringify(body||{})
        });
        const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { ok:false, error:t }; }
        if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { detail: j });
        return j;
      }
    };

/* Minimal ErrorBoundary if one is not already defined */
if (typeof ErrorBoundary === "undefined") {
  // define a lightweight error boundary component
  // eslint-disable-next-line no-unused-vars
  class ErrorBoundaryInner extends React.Component {
    constructor(props){ super(props); this.state = { hasError:false, error:null }; }
    static getDerivedStateFromError(error){ return { hasError:true, error }; }
    componentDidCatch(err, info){ try{ console.error("[ErrorBoundary]", err, info); }catch{} }
    render(){
      if (this.state.hasError) {
        return (
          <div style={{padding:16}}>
            <h2 style={{marginTop:0}}>Something went wrong.</h2>
            <pre style={{whiteSpace:"pre-wrap"}}>{String(this.state.error)}</pre>
          </div>
        );
      }
      return this.props.children;
    }
  }
  // expose as ErrorBoundary for the rest of the file
  // eslint-disable-next-line no-var
  var ErrorBoundary = ErrorBoundaryInner;
}
// --- Runtime shims: prevent ReferenceError when optional screens aren't bundled ---
/* eslint-disable no-var */
// If these components are not present in the current build, provide safe fallbacks.
try {
  if (typeof Account === 'undefined') {
    var Account = function Account(props){
      return (typeof React !== 'undefined')
        ? React.createElement('div', { style:{ padding:16 } }, 'Account module is not available in this build.')
        : null;
    };
    try { globalThis.Account = Account; } catch(_e) {}
  }
} catch(_e) {}

try {
  if (typeof Policy === 'undefined') {
    var Policy = function Policy(props){
      return (typeof React !== 'undefined')
        ? React.createElement('div', { style:{ padding:16 } }, 'Policy module is not available in this build.')
        : null;
    };
    try { globalThis.Policy = Policy; } catch(_e) {}
  }
} catch(_e) {}

try {
  if (typeof Layout === 'undefined') {
    var Layout = function Layout(props){
      return (typeof React !== 'undefined')
        ? React.createElement('div', { style:{ padding:16 } }, props && props.children)
        : null;
    };
    try { globalThis.Layout = Layout; } catch(_e) {}
  }
} catch(_e) {}
/* eslint-enable no-var */
// --- Runtime safety shims (prevent ReferenceError if optional screens weren't bundled) ---
/* eslint-disable no-var */
var __R = (typeof globalThis !== 'undefined' && globalThis.React) ? globalThis.React : null;
var Account = (typeof globalThis !== 'undefined' && typeof globalThis.Account === 'function')
  ? globalThis.Account
  : function AccountFallback(){ return __R ? __R.createElement('div',{style:{padding:16}}, __R.createElement('h1',null,'Account')) : null; };
var Policy = (typeof globalThis !== 'undefined' && typeof globalThis.Policy === 'function')
  ? globalThis.Policy
  : function PolicyFallback(){ return __R ? __R.createElement('div',{style:{padding:16}}, __R.createElement('h1',null,'Policy')) : null; };
/* eslint-enable no-var */
// Safe Policy fallback to avoid ReferenceError
var Policy = (typeof Policy !== 'undefined')
  ? Policy
  : ((typeof window !== 'undefined' && window.Policy)
      ? window.Policy
      : function Policy(){ return null; });
// --- Boot guard: ensure we never hit /me without a token ---
(function guardTokenOnBoot(){
  try {
    // Allow auth-related pages to load without a token
    var path = (typeof window !== 'undefined' && window.location && window.location.pathname) || '/';
    var isAuthPage = /^\/(login|register|auth)(\b|\/|$)/.test(path);

    // If no token and not already on an auth page, redirect to /login immediately
    var token = (typeof localStorage !== 'undefined' && localStorage.getItem('token')) || '';
    if (!token && !isAuthPage) {
      if (typeof window !== 'undefined' && window.location) {
        window.location.replace('/login');
      }
    }
  } catch (e) {
    // non-fatal: never block boot if guard fails
    try { console.warn('[boot-guard] skipped', e && (e.message || e)); } catch(_e) {}
  }
})();
// Ensure the UI uses a single, consistent token key.
// Migrate any older keys (auth_token, cg_token) -> token on startup.
(() => {
  try {
    const t =
      (typeof localStorage !== "undefined" && (
        localStorage.getItem("token") ||
        localStorage.getItem("auth_token") ||
        localStorage.getItem("cg_token") ||
        localStorage.getItem("authToken")
      )) || "";
    if (t && t.trim()) {
      localStorage.setItem("token", t);
      localStorage.removeItem("auth_token");
      localStorage.removeItem("cg_token");
      localStorage.removeItem("authToken");
    }
  } catch (_e) {
    // ignore
  }
})();

// Hard guard: if no token, don’t boot the app UI; send to login.
// This prevents unauthenticated boots that spam 401s.
(() => {
  try {
    const t = (typeof localStorage !== "undefined" && localStorage.getItem("token")) || "";
    const path = (typeof window !== "undefined" && window.location && window.location.pathname) || "/";
    const isAuthRoute =
      /^\/(login|admin-login)$/.test(path) ||
      path.startsWith("/auth/");
    if (!t && !isAuthRoute) {
      // Replace instead of push to avoid back button loops
      window.location.replace("/login");
    }
  } catch (_e) {
    // ignore; fail open (app may still render and show its own login)
  }
})();
// build: bump

// --- BrandLogo: tries overrides + common paths, falls back to text ---
function BrandLogo(){
  const override =
    (typeof window!=='undefined' && (window.LOGO_URL ||
      (typeof localStorage!=='undefined' && localStorage.getItem('logo_url')))) || '';
  const candidates = [
    override,
    '/brand/logo.png',
    '/logo.svg',
    '/logo.png',
    '/logo192.png',
    '/assets/logo.svg',
    '/assets/logo.png'
  ].filter(Boolean);

  const [idx, setIdx] = React.useState(0);
  const src = candidates[idx] || '';

  // Fallback to text if nothing is available
  if (!src) return <h2 style={{margin:0,fontSize:18}}>Cyber Guard Pro</h2>;

  // IMPORTANT: keep width:auto and objectFit:contain so it never squashes
  return (
    <img
      src={src}
      alt="Cyber Guard Pro"
      style={{ height: 64, width: 'auto', objectFit: 'contain', display: 'block', maxWidth: 'none' }}
      onError={()=>{ if (idx < candidates.length-1) setIdx(idx+1); }}
    />
  );
}
// ===== KeysCard component =====
function KeysCard() {
  const [keys, setKeys] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [justCreated, setJustCreated] = useState(null);
  const [copied, setCopied] = useState(null);
  const [toast, setToast] = useState("");
  // Success box style for green success messages
  const successBox = {marginTop:8,padding:'8px 10px',border:'1px solid #7bd88f55',background:'#7bd88f22',borderRadius:8};
  useEffect(() => {
    setLoading(true);
    apiGet("/apikeys")
      .then((j) => setKeys(j?.keys || []))
      .catch((e) => setErr(e.error || "Failed to load keys"))
      .finally(()=>setLoading(false));
  }, []);
  async function createKey() {
    setMsg(""); setErr(""); setLoading(true);
    async function tryCreate(path){
      const r = await apiPost(path, {});
      if(r?.api_key){ return r; }
      throw new Error(r?.error || 'Create returned no key');
    }
    try {
      let r;
      try { r = await tryCreate("/apikeys"); }
      catch(_e){ r = await tryCreate("/apikeys/create"); }
      localStorage.setItem("api_key", r.api_key);
      setMsg("API key created and saved to localStorage.api_key");
      setJustCreated(r.api_key);
      setToast("API key created");
      setTimeout(()=>setToast(""), 1500);
      const j = await apiGet("/apikeys");
      setKeys(j?.keys || []);
      setTimeout(()=>setJustCreated(null), 2500);
    } catch (e) {
      setErr(e.error || e.message || "key create failed");
      setToast("Key create failed");
      setTimeout(()=>setToast(""), 1500);
    } finally { setLoading(false); }
  }
  async function revokeKey(id) {
    setMsg(""); setErr(""); setLoading(true);
    try {
      await apiPost(`/apikeys/revoke`, { id });
      setMsg("Key revoked");
      setToast("Key revoked");
      setTimeout(()=>setToast(""), 1500);
      const j = await apiGet("/apikeys");
      setKeys(j?.keys || []);
    } catch (e) {
      setErr(e.error || "revoke failed");
      setToast("Revoke failed");
      setTimeout(()=>setToast(""), 1500);
    } finally { setLoading(false); }
  }

  return (
    <div style={{ ...card, marginTop: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>API Keys</div>
      <button style={btn} onClick={createKey} disabled={loading}>{loading ? 'Please wait…' : 'Create API Key'}</button>
      <div style={{ marginTop: 10 }}>
        
  {err && (
    <div style={{ marginTop:8, padding:"8px 10px", border:"1px solid #ff7a7a88", background:"#ff7a7a22", borderRadius:8 }}>
      {String(err)}
    </div>
  )}
  {msg && (
    <div style={successBox}>
      {String(msg)}
    </div>
  )}
  
        <div>
          {(keys || []).length === 0 && <div style={{ opacity: .7 }}>No keys yet.</div>}
          {keys.map((k) => (
            <div
              key={k.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 0",
                borderBottom: "1px solid rgba(255,255,255,.06)",
                background: (justCreated===k.id ? 'rgba(123,216,143,.12)' : 'transparent')
              }}
            >
              <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{k.id}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, opacity: .7 }}>{k.revoked ? "revoked" : "active"}</span>
                <button
                  style={{...btn, padding:'4px 10px', fontSize:12}}
                  disabled={loading}
                  onClick={async()=>{
                    try{
                      await navigator.clipboard.writeText(k.id);
                      setCopied(k.id);
                      setToast("Copied");
                      setTimeout(()=>setToast(""), 1200);
                      setTimeout(()=>setCopied(null),1500);
                    }catch(_e){}
                  }}
                >Copy</button>
                {copied===k.id && <span style={{fontSize:12, opacity:.8}}>Copied!</span>}
                {!k.revoked && (
                  <button style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => revokeKey(k.id)} disabled={loading}>
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ opacity: .8, fontSize: 13, marginTop: 8 }}>
        API keys are used for authenticating integrations and automations.
      </div>
      {toast && (
        <div style={{position:'fixed',bottom:20,left:'50%',transform:'translateX(-50%)',padding:'8px 12px',border:'1px solid rgba(255,255,255,.2)',background:'rgba(0,0,0,.7)',borderRadius:8,zIndex:1000}}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ===== AdminTenantKeys component =====
function AdminTenantKeys({ selected }) {
  const [keys, setKeys] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    apiGet(`/admin/tenant/${encodeURIComponent(selected)}/keys`)
      .then((j) => setKeys(j?.keys || []))
      .catch((e) => setErr(e.error || "Failed to load keys"))
      .finally(()=>setLoading(false));
  }, [selected]);
  async function rotateKey() {
    setMsg(""); setErr(""); setLoading(true);
    try {
      const r = await apiPost('/admin/tenants/rotate-key', { tenant_id: selected });
      setMsg(r?.api_key ? `New API key: ${r.api_key}` : 'Key rotated');
      const j = await apiGet(`/admin/tenant/${encodeURIComponent(selected)}/keys`);
      setKeys(j?.keys || []);
    } catch (e) {
      setErr(e.error || "rotate failed");
    } finally { setLoading(false); }
  }
  async function revokeKey(id) {
    setMsg(""); setErr(""); setLoading(true);
    try {
      await apiPost('/admin/revoke-key', { id });
      setMsg("Key revoked");
      const j = await apiGet(`/admin/tenant/${encodeURIComponent(selected)}/keys`);
      setKeys(j?.keys || []);
    } catch (e) {
      setErr(e.error || "revoke failed");
    } finally { setLoading(false); }
  }
  if (!selected) return null;
  const successBox = {marginTop:8,padding:'8px 10px',border:'1px solid #7bd88f55',background:'#7bd88f22',borderRadius:8};
  return (
    <div style={{ ...card }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>API Keys</div>
        <button onClick={rotateKey} style={btn} disabled={loading}>{loading ? 'Please wait…' : 'Rotate Key'}</button>
      </div>
      <div style={{ marginTop: 8 }}>
        {err && <div style={{marginTop:8,padding:'8px 10px',border:'1px solid #ff7a7a88',background:'#ff7a7a22',borderRadius:8}}>{String(err)}</div>}
        {msg && <div style={successBox}>{String(msg)}</div>}
        {(!keys || !keys.length) && <div style={{ opacity: .7 }}>No keys yet.</div>}
        {keys.map(k => (
          <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: "center", padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{k.id}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, opacity: .7 }}>{k.revoked ? 'revoked' : 'active'}</span>
              <button
                style={{...btn, padding:'4px 10px', fontSize:12}}
                disabled={loading}
                onClick={async()=>{
                  try{
                    await navigator.clipboard.writeText(k.id);
                    setCopied(k.id);
                    setTimeout(()=>setCopied(null),1500);
                  }catch(_e){}
                }}
              >Copy</button>
              {copied===k.id && <span style={{fontSize:12, opacity:.8}}>Copied!</span>}
              {!k.revoked && (
                <button style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => revokeKey(k.id)} disabled={loading}>
                  Revoke
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ opacity: .8, fontSize: 13, marginTop: 8 }}>
        Manage API keys for this tenant.
      </div>
    </div>
  );
}


const card={
  padding:16,
  border:"1px solid rgba(255,255,255,.14)",
  borderRadius:14,
  background:"linear-gradient(180deg, rgba(28,30,38,.72), rgba(22,24,30,.64))",
  boxShadow:"0 10px 30px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.06)",
  backdropFilter:"blur(10px)"
};
const btn={
  padding:"10px 14px",
  borderRadius:12,
  border:"1px solid #2b6dff66",
  background:"linear-gradient(180deg, #3b82f6, #1f6feb)",
  color:"#fff",
  cursor:"pointer",
  boxShadow:"0 8px 18px rgba(31,111,235,.28), inset 0 1px 0 rgba(255,255,255,.15)",
  transition:"transform .06s ease, box-shadow .12s ease"
};
const pre={
  whiteSpace:"pre-wrap",
  padding:12,
  border:"1px solid rgba(255,255,255,.14)",
  borderRadius:12,
  background:"linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.04))",
  marginTop:12,
  boxShadow:"inset 0 1px 0 rgba(255,255,255,.06)"
};
const errBox={
  padding:"10px 12px",
  border:"1px solid #ff6b6b99",
  background:"linear-gradient(180deg, #ff6b6b22, #ff6b6b18)",
  borderRadius:12,
  margin:"10px 0"
};

const badgeSA={
  marginRight:8,
  padding:'4px 10px',
  border:'1px solid #7bd88f66',
  background:'linear-gradient(180deg, #7bd88f33, #7bd88f22)',
  borderRadius:999,
  fontSize:12,
  boxShadow:"inset 0 1px 0 rgba(255,255,255,.1)"
};

// ---- Trial Notice Bar ----
function TrialNotice({ me }){
  const t = (me?.trial && typeof me.trial.active === 'boolean') ? me.trial : trialInfo(me);
  const actualPlan = String(me?.plan_actual || me?.plan || '').toLowerCase();
  const adminPreview = (typeof localStorage!=='undefined' && (localStorage.getItem('admin_plan_preview')||'')).toLowerCase();
  if (!(t?.active && (actualPlan === 'basic' || actualPlan === 'pro') && adminPreview !== 'pro_plus')) return null;
  return (
    <div style={{margin:'8px 0 12px',padding:'8px 10px',border:'1px solid #c69026',background:'#c6902615',borderRadius:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div>
        <b>Pro+ trial</b> — <b>{t.days_left}</b> day{t.days_left===1?'':'s'} left. Enjoy all features during your trial.
      </div>
      <Link to="/account" style={{padding:'6px 10px',borderRadius:8,border:'1px solid #2b6dff55',background:'#2b6dff',color:'#fff',textDecoration:'none'}}>Switch plan</Link>
    </div>
  );
}




class ErrorCatcher extends React.Component{
  constructor(p){ super(p); this.state={}; }
  componentDidCatch(e,info){ console.error("ErrorBoundary", e, info); this.props.onError(e); }
  render(){ return this.props.children; }
}
function trialInfo(me){
  // Prefer server-provided trial object if present
  if (me?.trial && typeof me.trial.active === 'boolean') {
    return {
      active: !!me.trial.active,
      days_left: Number(me.trial.days_left ?? 0),
      ends_at: me.trial.ends_at ?? null
    };
  }
  // Fallback to epoch seconds field
  const ends = Number(me?.trial_ends_at || 0);
  if (!ends) return { active:false, days_left:0, ends_at:null };
  const now = Math.floor(Date.now()/1000);
  const left = Math.max(0, ends - now);
  return { active: left > 0, days_left: Math.ceil(left/86400), ends_at: ends };
}
// ---- Trial Countdown Badge ----
function TrialCountdownBadge({ me }) {
  // Replicates logic from trialInfo and showTrialBadge in Layout
  const info = trialInfo(me);
  const actualPlan = String(me?.plan_actual || me?.plan || '').toLowerCase();
  const adminPreview = (typeof localStorage !== 'undefined' && (localStorage.getItem('admin_plan_preview') || '')).toLowerCase();
  const show = info.active && (actualPlan === 'basic' || actualPlan === 'pro') && adminPreview !== 'pro_plus';
  if (!show) return null;
  return (
    <Link
      to="/account"
      style={{
        marginRight: 8,
        padding: '4px 10px',
        border: '1px solid #c69026',
        background: 'linear-gradient(180deg,#c6902633,#c690261a)',
        borderRadius: 999,
        fontSize: 12,
        color: '#fff',
        textDecoration: 'none',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08)'
      }}
      title="Your Pro+ trial is active — click to manage plan"
    >
      Pro+ trial ({info.days_left}d left)
    </Link>
  );
}

// ---- Billing: Payment Issue Banner ----
function PaymentIssueBanner({ me }) {
  try {
    const status = String(me?.billing_status || '').toLowerCase();
    // Allow super admins to simulate via localStorage for testing
    const adminFlag = (typeof localStorage !== 'undefined' && localStorage.getItem('admin_billing_flag')) || '';
    const flag = adminFlag ? adminFlag.toLowerCase() : status;
    const show = flag === 'past_due' || flag === 'payment_failed';
    if (!show) return null;

    const msg = flag === 'past_due'
      ? 'Your subscription is past due — please update your payment method.'
      : 'A recent payment failed — please update your payment method.';

    async function openPortal() {
      try {
        const j = await apiGet('/billing/portal');
        const url = j?.url;
        if (url) window.open(url, '_blank', 'noopener');
      } catch (_e) {
        alert('Unable to open billing portal right now.');
      }
    }

    return (
      <div style={{margin:'8px 0 12px',padding:'10px 12px',border:'1px solid #ffb84d',background:'#ffb84d1a',borderRadius:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <b>Billing issue</b> — {msg}
        </div>
        <button onClick={openPortal} style={{padding:'6px 10px',borderRadius:8,border:'1px solid #2b6dff55',background:'#2b6dff',color:'#fff',cursor:'pointer'}}>
          Fix payment
        </button>
      </div>
    );
  } catch (_e) {
    return null;
  }
}
// ---- Admin Ops: Retention ----
function AdminOpsRetention(){
  const [me, setMe] = React.useState(null);
  const [buckets, setBuckets] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");

  React.useEffect(()=>{ apiGet('/me').then(setMe).catch(()=>setMe(null)); },[]);

  async function load(){
    setErr(""); setLoading(true);
    try{
      const j = await apiGet('/admin/ops/usage/buckets');
      setBuckets(j?.buckets || {});
    }catch(e){ setErr(e?.error || 'Failed to load buckets'); }
    finally{ setLoading(false); }
  }

  // --- Usage Counts Exact API Example ---
  // Example usage for /admin/ops/usage/counts endpoint (see backend route)
  // To use: call apiGet('/admin/ops/usage/counts')
  React.useEffect(()=>{ load(); },[]);

  async function preview(){
    setErr(""); setMsg(""); setLoading(true);
    try{
      const j = await apiGet('/admin/ops/retention/preview');
      setMsg(`Preview → alerts: ${j?.pending?.alerts ?? 0}, usage_events: ${j?.pending?.usage_events ?? 0}`);
    }catch(e){ setErr(e?.error || 'Preview failed'); }
    finally{ setLoading(false); }
  }

  async function runPurge(){
    setErr(""); setMsg(""); setLoading(true);
    try{
      const j = await apiPost('/admin/ops/retention/run', {});
      setMsg(`Deleted → alerts: ${j?.deleted?.alerts_deleted ?? 0}, usage_events: ${j?.deleted?.usage_events_deleted ?? 0}`);
      await load();
    }catch(e){ setErr(e?.error || 'Run failed'); }
    finally{ setLoading(false); }
  }

  async function seed(){
    setErr(""); setMsg(""); setLoading(true);
    try{
      const j = await fetch(`${API_BASE}/admin/ops/seed/usage?days_ago=200&count=2000`, {
        method:'POST', headers: { ...authHeaders(), ...adminPreviewHeaders() }
      }).then(r=>r.json());
      if(!j?.ok) throw j;
      setMsg('Seeded 2000 usage events ~200 days ago');
      await load();
    }catch(e){ setErr(e?.error || 'Seed failed'); }
    finally{ setLoading(false); }
  }

  if(!me) return <div style={{padding:16}}>Loading…</div>;
  if(!(me.is_super || me.role === 'owner')) return <div style={{padding:16}}>Access denied.</div>;

  const cardS = { padding:16, border:'1px solid rgba(255,255,255,.12)', borderRadius:12, background:'rgba(255,255,255,.04)' };
  const ghost = { padding:'8px 12px', borderRadius:10, border:'1px solid rgba(255,255,255,.2)', background:'transparent', color:'#e6e9ef', cursor:'pointer' };

  return (
    <div style={{padding:16}}>
      <h1 style={{marginTop:0}}>Ops ▸ Retention</h1>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:12}}>
        <div style={cardS}>
          <div style={{fontWeight:700}}>Usage Buckets</div>
          <div style={{marginTop:8}}>
            {loading && <div style={{opacity:.8}}>Loading…</div>}
            {buckets && (
              <ul style={{listStyle:'none',padding:0,margin:0}}>
                <li>{'<90d'}: {buckets['<90d'] ?? 0}</li>
                <li>{'90-180d'}: {buckets['90-180d'] ?? 0}</li>
                <li>{'>180d'}: {buckets['>180d'] ?? 0}</li>
              </ul>
            )}
            {!buckets && !loading && <div style={{opacity:.8}}>No data yet.</div>}
          </div>
          <div style={{marginTop:10,display:'flex',gap:8,flexWrap:'wrap'}}>
            <button style={ghost} onClick={load} disabled={loading}>Refresh</button>
            <button style={ghost} onClick={preview} disabled={loading}>Preview purge</button>
            <button style={ghost} onClick={runPurge} disabled={loading}>Run purge</button>
            <button style={ghost} onClick={seed} disabled={loading}>Seed 2k @200d</button>
          </div>
            {msg && <div style={{marginTop:8, padding:'8px 10px', border:'1px solid #7bd88f66', background:'#7bd88f22', borderRadius:8}}>{msg}</div>}
          {err && <div style={{marginTop:8, padding:'8px 10px', border:'1px solid #ff7a7a88', background:'#ff7a7a22', borderRadius:8}}>{String(err)}</div>}
        </div>
      </div>
    </div>
  );
}
// ---- Admin Ops: Audit (runs viewer) ----
function AdminOpsAudit(){
  const [me, setMe] = React.useState(null);
  const [runs, setRuns] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [type, setType] = React.useState(""); // optional filter
  const [limit, setLimit] = React.useState(25);
  const [showBadSig, setShowBadSig] = React.useState(false);

  React.useEffect(()=>{ apiGet('/me').then(setMe).catch(()=>setMe(null)); },[]);

  async function load(){
    setErr(""); setLoading(true);
    try{
      const qs = new URLSearchParams();
      if (type) qs.set('type', type);
      if (limit) qs.set('limit', String(limit));
      if (showBadSig) qs.set('show_bad_sig', '1'); // include bad-sig rows when toggled on
      const path = `/admin/ops/runs${qs.toString()?`?${qs.toString()}`:''}`;
      const j = await apiGet(path);
      setRuns(Array.isArray(j?.runs) ? j.runs : []);
    }catch(e){ setErr(e?.error || 'Failed to load runs'); }
    finally{ setLoading(false); }
  }

  React.useEffect(()=>{ load(); },[]);

  if(!me) return <div style={{padding:16}}>Loading…</div>;
  if(!(me.is_super || me.role === 'owner')) return <div style={{padding:16}}>Access denied.</div>;

  const cardS = { padding:16, border:'1px solid rgba(255,255,255,.12)', borderRadius:12, background:'rgba(255,255,255,.04)' };
  const ghost = { padding:'8px 12px', borderRadius:10, border:'1px solid rgba(255,255,255,.2)', background:'transparent', color:'#e6e9ef', cursor:'pointer' };
  const thS = { textAlign:'left', padding:'8px 6px', borderBottom:'1px solid rgba(255,255,255,.12)', opacity:.8 };
  const tdS = { padding:'8px 6px', borderBottom:'1px solid rgba(255,255,255,.06)' };

  return (
    <div style={{padding:16}}>
      <h1 style={{marginTop:0}}>Ops ▸ Audit</h1>
      <div style={{...cardS, marginBottom:12}}>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <label style={{display:'flex', alignItems:'center', gap:6}}>
            <span style={{opacity:.8, fontSize:12}}>Type</span>
            <select value={type} onChange={e=>setType(e.target.value)} style={{padding:'6px 8px',borderRadius:8,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.14)',color:'#e6e9ef'}}>
              <option value="">(all)</option>
              <option value="retention_run">retention_run</option>
              <option value="seed_usage">seed_usage</option>
              <option value="backup_diag">backup_diag</option>
            </select>
          </label>
          <label style={{display:'flex', alignItems:'center', gap:6}}>
            <span style={{opacity:.8, fontSize:12}}>Limit</span>
            <input type="number" min="1" max="200" value={limit} onChange={e=>setLimit(Number(e.target.value||25))} style={{width:90,padding:'6px 8px',borderRadius:8,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.14)',color:'#e6e9ef'}} />
          </label>
          <label style={{display:'flex', alignItems:'center', gap:6}}>
            <input
              type="checkbox"
              checked={showBadSig}
              onChange={e=>setShowBadSig(e.target.checked)}
            />
            <span style={{opacity:.8, fontSize:12}}>Show webhook signature errors</span>
          </label>
          <button style={ghost} onClick={load} disabled={loading}>{loading? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      <div style={cardS}>
        <div style={{fontWeight:700, marginBottom:8}}>Audit log</div>
        {err && <div style={{marginBottom:8, padding:'8px 10px', border:'1px solid #ff7a7a88', background:'#ff7a7a22', borderRadius:8}}>{String(err)}</div>}
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <th style={thS}>When (UTC)</th>
                <th style={thS}>Type</th>
                <th style={thS}>Details</th>
              </tr>
            </thead>
            <tbody>
              {(!runs || runs.length===0) && (
                <tr><td style={tdS} colSpan={3}>
                  {loading ? 'Loading…' : 'No runs found.'}
                </td></tr>
              )}
              {runs && runs.map((r,i)=>{
                const when = (()=>{
                  const t = r.created_at; // seconds epoch
                  if (typeof t === 'string' && t.includes('T')) return t;
                  const n = Number(t||0) * 1000; return new Date(n).toISOString();
                })();
                const details = (r.details && typeof r.details === 'object') ? JSON.stringify(r.details) : String(r.details||'');
                return (
                  <tr key={r.id || i}>
                    <td style={tdS}>{when}</td>
                    <td style={tdS}><code>{r.run_type || '-'}</code></td>
                    <td style={tdS}><code style={{whiteSpace:'pre-wrap'}}>{details}</code></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
// ---- Admin Trial Control ----
function AdminTrialControl(){
  const [me, setMe] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");

  React.useEffect(()=>{ apiGet('/me').then(m=>setMe({...m, trial: trialInfo(m)})).catch(()=>setMe(null)); },[]);

function LiveStatusTicker({ inline = false }) {
  const [msgs, setMsgs] = React.useState([]);
  async function refresh(){
    setErr(""); setMsg(""); setLoading(true);
    try{ const m = await apiGet('/me'); setMe({...m, trial: trialInfo(m)}); }
    catch(e){ setErr(e?.error || 'Failed to load /me'); }
    finally{ setLoading(false); }
  }

  async function start(days=7){
    setErr(""); setMsg(""); setLoading(true);
    try{
      const j = await apiPost('/admin/trial/start', { days });
      setMsg(`Trial started for ${days} day${days===1?'':'s'}.`);
      await refresh();
      // let the rest of the app know
      window.dispatchEvent(new Event('me-updated'));
    }catch(e){ setErr(e?.error || 'Failed to start trial'); }
    finally{ setLoading(false); }
  }

  async function endNow(){
    setErr(""); setMsg(""); setLoading(true);
    try{
      await apiPost('/admin/trial/end', {});
      setMsg('Trial ended.');
      await refresh();
      window.dispatchEvent(new Event('me-updated'));
    }catch(e){ setErr(e?.error || 'Failed to end trial'); }
    finally{ setLoading(false); }
  }

  if(!me) return <div style={{padding:16}}>Loading…</div>;
  if(!(me.is_super || me.role === 'owner')) return <div style={{padding:16}}>Access denied.</div>;

  const planActual = String(me?.plan_actual || me?.plan || '').toLowerCase();
  const tri = me.trial || {active:false, days_left:0, ends_at:null};
  const cardS = { padding:16, border:'1px solid rgba(255,255,255,.12)', borderRadius:12, background:'rgba(255,255,255,.04)' };
  const ghost = { padding:'8px 12px', borderRadius:10, border:'1px solid rgba(255,255,255,.2)', background:'transparent', color:'#e6e9ef', cursor:'pointer' };

  return (
    <div style={{padding:16}}>
      <h1 style={{marginTop:0}}>Ops ▸ Trial Control</h1>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:12}}>
        <div style={cardS}>
          <div style={{fontWeight:700}}>Tenant status</div>
          <div style={{marginTop:8}}>
            <div><b>plan</b>: <code>{String(me.plan||'')}</code></div>
            <div><b>plan_actual</b>: <code>{String(me.plan_actual||me.plan||'')}</code></div>
            <div><b>effective_plan</b>: <code>{String(me.effective_plan||planActual)}</code></div>
            <div style={{marginTop:6}}>
              <b>trial</b>: {tri.active ? 'active' : 'inactive'}
              {tri.active && (
                <>
                  {' • days_left: '}<b>{Number(tri.days_left||0)}</b>
                  {tri.ends_at ? <> {' • ends_at: '}<code>{typeof tri.ends_at==='string'?tri.ends_at:new Date(Number(tri.ends_at||0)*1000).toISOString()}</code></> : null}
                </>
              )}
            </div>
          </div>
          <div style={{marginTop:10,display:'flex',gap:8,flexWrap:'wrap'}}>
            <button style={ghost} onClick={refresh} disabled={loading}>Refresh</button>
            <button style={ghost} onClick={()=>start(7)} disabled={loading || !(planActual==='basic'||planActual==='pro')}>Start 7‑day trial</button>
            <button style={ghost} onClick={endNow} disabled={loading || !tri.active}>End trial</button>
          </div>
          {msg && <div style={{marginTop:8, padding:'8px 10px', border:'1px solid #7bd88f66', background:'#7bd88f22', borderRadius:8}}>{msg}</div>}
          {err && <div style={{marginTop:8, padding:'8px 10px', border:'1px solid #ff7a7a88', background:'#ff7a7a22', borderRadius:8}}>{String(err)}</div>}
        </div>
      </div>
    </div>
  );
}

// ---- Admin Console (sidebar wrapper) ----
function AdminConsolePage({ page }){
  const [me, setMe] = React.useState(null);
  React.useEffect(()=>{ apiGet('/me').then(setMe).catch(()=>setMe(null)); },[]);
  if(!me) return <div style={{padding:16}}>Loading…</div>;
  if(!(me.is_super || me.role === 'owner')) return <div style={{padding:16}}>Access denied.</div>;

  const wrap = { display:'grid', gridTemplateColumns:'220px 1fr', gap:12 };
  const side = { padding:12, border:'1px solid rgba(255,255,255,.12)', borderRadius:12, background:'rgba(255,255,255,.04)', position:'sticky', top:86, height:'fit-content' };
  const link = { display:'block', padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.12)', textDecoration:'none', color:'#e6e9ef', marginBottom:8, background:'rgba(255,255,255,.03)' };

  return (
    <div style={{padding:16}}>
      <h1 style={{marginTop:0}}>Admin Console</h1>
      <div style={wrap}>
        <div style={side}>
          <Link to="/admin/console/trial" style={link}>Trial Control</Link>
          <Link to="/admin/console/retention" style={link}>Data Retention</Link>
          <Link to="/admin/console/audit" style={link}>Audit Log</Link>
        </div>
        <div>
          {page === 'trial' && <AdminTrialControl/>}
          {page === 'retention' && <AdminOpsRetention/>}
          {page === 'audit' && <AdminOpsAudit/>}
        </div>
      </div>
    </div>
  );
}
// ---------- Layout ----------
function SuperAdminBanner({ me }) {
  if (!me?.is_super) return null;
  return (
    <div style={{
      padding:'6px 10px',
      border:'1px solid #7bd88f55',
      background:'linear-gradient(180deg,#7bd88f22,#7bd88f18)',
      borderRadius:10,
      margin:'8px 0 12px',
      display:'flex',
      alignItems:'center',
      gap:10
    }}>
      <b>Super Admin</b>
      <span style={{opacity:.8, fontSize:12}}>Preview plan as:</span>
      <select
        defaultValue={typeof localStorage!=='undefined' ? (localStorage.getItem('admin_plan_preview') || '') : ''}
        onChange={e=>{
          const v = e.target.value;
          if (typeof localStorage !== 'undefined') {
            if (v) localStorage.setItem('admin_plan_preview', v);
            else localStorage.removeItem('admin_plan_preview');
          }
          alert('Plan preview set. Reloading…');
          location.reload();
        }}
        style={{padding:'4px 8px',borderRadius:8,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.14)',color:'#e6e9ef'}}
      >
        <option value="">(tenant actual)</option>
        <option value="trial">trial</option>
        <option value="basic">basic</option>
        <option value="pro">pro</option>
        <option value="pro_plus">pro+</option>
      </select>

      <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}>
        <input
          type="checkbox"
          defaultChecked={typeof localStorage!=='undefined' && localStorage.getItem('admin_override')==='1'}
          onChange={e=>{
            if (typeof localStorage !== 'undefined') {
              if (e.target.checked) localStorage.setItem('admin_override','1');
              else localStorage.removeItem('admin_override');
            }
            alert('Override updated. Reloading…');
            location.reload();
          }}
        />
        Bypass paywall
      </label>
    </div>
);
  }

function AIDock({ me }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [messages, setMessages] = React.useState([]);

  async function ask() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const targetTenant = (me?.is_super && localStorage.getItem('admin_target_tenant')) || undefined;
      const path = (me?.is_super && targetTenant) ? '/admin/ai/ask' : '/ai/ask';
      const body = (me?.is_super && targetTenant) ? { question: q, tenant_id: targetTenant } : { question: q };
      const r = await API.post(path, body);
      setMessages(m => [...m, { role: 'user', content: q }, { role: 'assistant', content: r?.answer || JSON.stringify(r) }]);
      setQ("");
    } catch (_e) {
      setMessages(m => [...m, { role: 'user', content: q }, { role: 'assistant', content: 'Sorry — assistant failed.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={()=>setOpen(true)}
        style={{
          position:'fixed', right:16, bottom:16, zIndex:1000,
          padding:'10px 14px', borderRadius:999, border:'1px solid #2b6dff55',
          background:'#1f6feb', color:'#fff', cursor:'pointer',
          boxShadow:'0 10px 24px rgba(31,111,235,.28)'
        }}
      >
        AI Assistant
      </button>

      {open && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1100,
          display:'flex', alignItems:'flex-end', justifyContent:'flex-end'
        }}>
          <div style={{
            width:'min(420px, 96vw)', height:'min(70vh, 720px)', margin:16,
            background:'linear-gradient(180deg, rgba(28,30,38,.92), rgba(22,24,30,.9))',
            border:'1px solid rgba(255,255,255,.12)', borderRadius:16,
            display:'grid', gridTemplateRows:'auto 1fr auto'
          }}>
            <div style={{padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,.12)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div><b>AI Security Assistant</b>{me?.is_super ? <span style={{marginLeft:8,opacity:.8,fontSize:12}}>(admin)</span> : null}</div>
              <button onClick={()=>setOpen(false)} style={{padding:'6px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)', background:'transparent',color:'#e6e9ef',cursor:'pointer'}}>Close</button>
            </div>
            <div style={{padding:12, overflow:'auto'}}>
              {messages.length === 0 && <div style={{opacity:.8}}>Ask about setup, errors, or “how do I…”</div>}
              {messages.map((m,i)=>(
                <div key={i} style={{margin:'8px 0'}}>
                  <div style={{fontSize:12,opacity:.7}}>{m.role}</div>
                  <div>{m.content}</div>
                </div>
              ))}
            </div>
            <div style={{padding:12, borderTop:'1px solid rgba(255,255,255,.12)'}}>
              <form onSubmit={(e)=>{ e.preventDefault(); ask(); }}>
                <input
                  value={q}
                  onChange={e=>setQ(e.target.value)}
                  placeholder="Ask anything about CyberGuard Pro…"
                  style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid rgba(255,255,255,.15)',background:'rgba(255,255,255,.06)',color:'inherit'}}
                  disabled={busy}
                />
                <div style={{marginTop:8, display:'flex', gap:8}}>
                  <button disabled={busy} style={{padding:'8px 12px',borderRadius:10,border:'1px solid #2b6dff66',background:'#1f6feb',color:'#fff',cursor:'pointer'}}>
                    {busy ? 'Thinking…' : 'Ask'}
                  </button>
                  {me?.is_super && (
                    <input
                      placeholder="(optional) tenant id for support"
                      defaultValue={localStorage.getItem('admin_target_tenant') || ''}
                      onChange={e=>{ if(e.target.value) localStorage.setItem('admin_target_tenant', e.target.value); else localStorage.removeItem('admin_target_tenant'); }}
                      style={{flex:1,padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.06)',color:'inherit'}}
                    />
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// --- Top-right badges (role / status / trial / logout) ---
function TopBadges(){
  const [me, setMe] = React.useState(null);

  const API_BASE = (typeof globalThis !== 'undefined' && globalThis.API_BASE)
  ? globalThis.API_BASE
  : ((typeof window !== 'undefined' && window.location.hostname.includes('onrender.com'))
      ? 'https://cyberguard-pro-cloud.onrender.com/api'
      : '/api');

  React.useEffect(()=>{
    (async()=>{
      try{
        const token = (typeof localStorage!=='undefined' && localStorage.getItem('token')) || '';
        const r = await fetch(`${API_BASE}/me`, { headers:{ Authorization:`Bearer ${token}` }, credentials: 'include' });
        const t = await r.text(); let j; try{ j=JSON.parse(t);}catch{j=null;}
        if (j && typeof j === 'object') setMe(j);
      }catch(_e){}
    })();
  },[]);

  const chip = { display:'inline-flex', alignItems:'center', gap:6, border:'1px solid rgba(255,255,255,.18)', borderRadius:999, padding:'4px 10px', background:'rgba(255,255,255,.04)', fontSize:12, marginLeft:8 };

  function logout(){
    try { localStorage.removeItem('token'); } catch(_e){}
    window.location.href = '/login';
  }

  const role = me?.is_super ? 'Super Admin' : (me?.role ? String(me.role) : '');
  const billing = me?.billing_status ? String(me.billing_status) : '';
  const trial = me?.trial?.active ? `${me.trial.days_left ?? ''} day${(me.trial.days_left===1)?'':'s'} left` : '';

  return (
    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
      {role ? <span style={chip}>{role}</span> : null}
      {billing ? <span style={chip}>{billing}</span> : null}
      {me?.trial?.active ? <span style={{...chip, borderColor:'#c69026', background:'#c6902615'}}>trial — {trial}</span> : null}
      <button onClick={logout} style={{...chip, cursor:'pointer'}}>Logout</button>
    </div>
  );
}
function Layout({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#090b10', color: '#e6e9ef' }}>
      {/* Sidebar */}
      <div
        style={{
          width: 232,
          background: 'rgba(8,10,14,0.95)',
          borderRight: '1px solid rgba(255,255,255,.12)',
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          position: 'sticky',
          top: 0,
          height: '100vh'
        }}
      >
        <BrandLogo/>

        <style>{`
          .side-link {
            display: inline-block;
            padding: 8px 10px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,.12);
            text-decoration: none;
            color: #e6e9ef;
            background: rgba(255,255,255,.03);
            transition: all .18s ease;
          }
          .side-link:hover {
            box-shadow: 0 0 18px rgba(47,161,255,.35), inset 0 0 10px rgba(123,216,143,.12);
            border-color: rgba(123,216,143,.45);
            transform: translateX(2px);
          }
          .side-link.active {
            background: linear-gradient(90deg, rgba(37,161,255,.18), rgba(123,216,143,.18));
            border-color: rgba(37,161,255,.55);
          }
        `}</style>

        <nav style={{display:'grid', gap:8, marginTop:8}}>
          <Link className="side-link" to="/">Dashboard</Link>
          <Link className="side-link" to="/alerts">Alerts</Link>
          <Link className="side-link" to="/integrations">Integrations</Link>
          <Link className="side-link" to="/policy">Policy</Link>
<Link className="side-link" to="/autonomy">Autonomy</Link>
<Link className="side-link" to="/test">Test</Link>
<Link className="side-link" to="/support">Support</Link>
<Link className="side-link" to="/pricing">Pricing</Link>
          <Link className="side-link" to="/account">Account</Link>
          {typeof localStorage !== 'undefined' && localStorage.getItem('token') ? (
            <Link className="side-link" to="/admin">Admin</Link>
          ) : null}
        </nav>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: 16 }}>
        <div style={{display:'flex', justifyContent:'flex-end', marginBottom:8}}>
          <TopBadges />
        </div>
        {(typeof localStorage!=='undefined' && localStorage.getItem('token')) ? children : <AuthLogin/>}
      </div>
    </div>
  );
}
const inp={width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"inherit",marginBottom:10};
// --- UI: Loading skeletons ---
function SkeletonLine({ width='100%', height=12, radius=8 }){
  const css = `@keyframes shimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}`;
  return (
    <div style={{position:'relative',overflow:'hidden',width,height,borderRadius:radius,background:'rgba(255,255,255,.06)'}}>
      <style dangerouslySetInnerHTML={{__html: css}} />
      <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.12), rgba(255,255,255,0))',backgroundSize:'200px 100%',animation:'shimmer 1.2s linear infinite'}}/>
    </div>
  );
}
function SkeletonCard(){
  return (
    <div style={{padding:14,border:'1px solid rgba(255,255,255,.12)',borderRadius:12,background:'rgba(255,255,255,.04)'}}>
      <SkeletonLine width="60%" height={10} />
      <div style={{height:8}}/>
      <SkeletonLine width="90%" height={22} />
      <div style={{height:8}}/>
      <SkeletonLine width="80%" height={10} />
    </div>
  );
}
// --- Futuristic Empty State ---
function EmptyStateFx({ title="No data", subtitle="", actionHref, actionLabel }) {
  const styleTag = `
    @keyframes fxPulse { 
      0%{opacity:.4;transform:scale(1)}
      50%{opacity:1;transform:scale(1.02)}
      100%{opacity:.4;transform:scale(1)}
    }
    @keyframes fxGrid {
      0%{background-position:0 0,0 0}
      100%{background-position:60px 30px,120px 60px}
    }
  `;
  return (
    <div style={{
      border:'1px dashed rgba(255,255,255,.25)',
      borderRadius:12,
      padding:24,
      textAlign:'center',
      position:'relative',
      overflow:'hidden',
      background:'rgba(255,255,255,.02)',
    }}>
      <style dangerouslySetInnerHTML={{__html:styleTag}}/>
      <div style={{
        position:'absolute', inset:0, opacity:.08,
        backgroundImage:'linear-gradient(transparent 96%, rgba(123,216,143,.25) 100%), linear-gradient(90deg, transparent 96%, rgba(123,216,143,.25) 100%)',
        backgroundSize:'60px 60px, 60px 60px',
        animation:'fxGrid 22s linear infinite'
      }}/>
      <div style={{position:'relative'}}>
        <div style={{fontWeight:700, fontSize:16, marginBottom:6}}>{title}</div>
        {subtitle && <div style={{opacity:.8, fontSize:13, marginBottom:12}}>{subtitle}</div>}
        {actionHref && <a href={actionHref} style={{padding:'8px 12px',borderRadius:8,border:'1px solid rgba(255,255,255,.25)',background:'rgba(255,255,255,.05)',textDecoration:'none',color:'#e6e9ef'}}>{actionLabel||'Learn more'}</a>}
      </div>
    </div>
  );
}
// --- Futuristic Dashboard helpers ---
function Sparkline({ points=[], width=120, height=36 }){
  const h = height, w = width;
  const max = Math.max(1, ...points);
  const path = points.map((v,i)=>{
    const x = (i/(points.length-1||1))*w;
    const y = h - (v/max)*h;
    return `${i===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{display:'block'}}>
      <defs>
        <linearGradient id="glow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7bd88f"/>
          <stop offset="100%" stopColor="#1f6feb"/>
        </linearGradient>
      </defs>
      <path d={path} fill="none" stroke="url(#glow)" strokeWidth="2" />
    </svg>
  );
}

function MiniTrend({ points=[], label='7d trend' }){
  return (
    <div style={{marginTop:4}}>
      <div style={{opacity:.7,fontSize:11,marginBottom:2}}>{label}</div>
      <Sparkline points={points} width={140} height={28} />
    </div>
  );
}

function FuturisticStat({ title, value, sub, series }){
  const cardS={
    padding:14,
    border:'1px solid rgba(123,216,143,.35)',
    borderRadius:14,
    background:'linear-gradient(180deg, rgba(20,24,30,.72), rgba(12,14,18,.64))',
    boxShadow:'0 8px 24px rgba(0,0,0,.28), 0 0 24px rgba(123,216,143,.12) inset',
    position:'relative',
    overflow:'hidden'
  };
  const glowLine={position:'absolute',inset:0,background:'radial-gradient(120px 40px at 20% 0%, rgba(31,111,235,.18), transparent)',pointerEvents:'none'};
  return (
    <div className="fx-tilt" style={cardS}>
      <div style={glowLine}/>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{opacity:.75,fontSize:12}}>{title}</div>
        <div style={{width:120}}>{Array.isArray(series)&&series.length>1 ? <Sparkline points={series}/> : null}</div>
      </div>
      <div style={{fontSize:24,fontWeight:800,marginTop:4}}>{value}</div>
      {sub && <div style={{opacity:.8,fontSize:12,marginTop:4}}>{sub}</div>}
    </div>
  );
}

// --- Dashboard Visuals: Risk gauge + Integration health strip ---
function RiskGauge({ value=0, size=120 }){
  const pct = Math.max(0, Math.min(100, Number(value)||0));
  const r = (size/2) - 8; // padding
  const c = size/2;
  const circ = 2*Math.PI*r;
  const dash = (pct/100)*circ;
  const rest = circ - dash;
  // color: low=green, med=blue, high=amber, critical=red
  const color = pct>=80? '#ef4444' : pct>=60? '#f59e0b' : pct>=30? '#3b82f6' : '#22c55e';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
      <g transform={`rotate(-90 ${c} ${c})`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${dash} ${rest}`} />
      </g>
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" style={{fontSize:20,fontWeight:800,fill:'#e6e9ef'}}>{Math.round(pct)}</text>
    </svg>
  );
}

function IntegrationHealthStrip({ items=[] }){
  const names = ['email','edr','dns','ueba','cloud'];
  const map = {};
  (items||[]).forEach(i=>{ map[String(i.type||'').toLowerCase()] = i; });
  const dot = (ok)=>({display:'inline-block',width:8,height:8,borderRadius:999,background: ok? '#22c55e' : '#f59e0b', boxShadow: ok? '0 0 10px #22c55e88':'0 0 10px #f59e0b88'});
  const chip = {display:'inline-flex',alignItems:'center',gap:6,padding:'4px 8px',border:'1px solid rgba(255,255,255,.16)',borderRadius:999,background:'rgba(255,255,255,.04)'};
  return (
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      {['email','edr','dns','ueba','cloud'].map(n=>{
        const it = map[n];
        const status = it?.status || 'unknown';
        const ok = status==='connected' || status==='ok';
        const title = it ? `${n}: ${status}` : `${n}: not configured`;
        return (
          <span key={n} style={chip} title={title}>
            <span style={dot(ok)} />
            <span style={{textTransform:'uppercase',fontSize:11,opacity:.85}}>{n}</span>
          </span>
        );
      })}
    </div>
  );
}

function AIPulseHero({ stats }) {
  const today = stats?.alerts_24h ?? stats?.day_events ?? 0;
  const api = stats?.api_calls_30d ?? stats?.month_events ?? 0;
  const styleTag = `@keyframes gridMove{0%{background-position:0 0,0 0}100%{background-position:60px 30px,120px 60px}}@keyframes pulse{0%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.04)}100%{opacity:.6;transform:scale(1)}}`;
  const wrap={
    position:'relative', padding:16,
    border:'1px solid rgba(255,255,255,.14)', borderRadius:16,
    background:'linear-gradient(180deg, rgba(14,16,22,.82), rgba(10,12,16,.76))',
    boxShadow:'0 16px 40px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.06)',
    overflow:'hidden'
  };
  const grid={
    position:'absolute', inset:0,
    backgroundImage:'linear-gradient(transparent 96%, rgba(123,216,143,.12) 100%), linear-gradient(90deg, transparent 96%, rgba(123,216,143,.12) 100%)',
    backgroundSize:'60px 60px, 60px 60px',
    animation:'gridMove 18s linear infinite', opacity:.28
  };
  const pulseDot={position:'absolute',right:16,top:16,width:10,height:10,borderRadius:999,background:'#7bd88f',boxShadow:'0 0 12px #7bd88f88',animation:'pulse 1.6s ease-in-out infinite'};
  return (
    <div style={wrap}>
      <style dangerouslySetInnerHTML={{__html: styleTag}} />
      <div style={grid}/>
      <div style={pulseDot} title="AI online"/>
      <div style={{position:'relative'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div>
            <div style={{opacity:.85,fontSize:12}}>CYBERGUARD AI — LIVE</div>
            <div style={{fontSize:22,fontWeight:800,marginTop:4}}>Monitoring in real‑time</div>
          </div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            <div style={{padding:'6px 10px',border:'1px solid rgba(255,255,255,.18)',borderRadius:999,background:'rgba(255,255,255,.05)'}}>Threats analyzed (24h): <b>{today}</b></div>
            <div style={{padding:'6px 10px',border:'1px solid rgba(255,255,255,.18)',borderRadius:999,background:'rgba(255,255,255,.05)'}}>API events (30d): <b>{api}</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BillingStatusChip({ me }){
  try{
    const raw = (me && (me.billing_status || me.billingStatus)) || "";
    const status = String(raw).toLowerCase();
    if(!status) return null;
    const color = status === "active" ? "#22c55e"
                : status === "past_due" ? "#f59e0b"
                : status === "payment_failed" ? "#ef4444"
                : "rgba(255,255,255,.8)";
    return (
      <span
        style={{
          display:"inline-flex",
          alignItems:"center",
          border:`1px solid ${color}88`,
          color,
          borderRadius:999,
          padding:"2px 8px",
          fontSize:12,
          background:"rgba(255,255,255,.04)"
        }}
        title={`billing: ${status}`}
      >
        {status.replace(/_/g," ")}
      </span>
    );
  }catch(_e){ return null; }
}

function Dashboard(){
  const [me,setMe]=useState(null);
  const [stats,setStats]=useState(null);
  const [alerts,setAlerts]=useState([]);
  const [conn, setConn] = useState([]);
  const [err,setErr]=useState(null);
  const [askBusy, setAskBusy] = React.useState(false);
  const [askQ, setAskQ] = React.useState("");
  const [askMsg, setAskMsg] = React.useState("");

  useEffect(()=>{
    (async()=>{
      try{
        const m = await apiGet("/me"); setMe(m);
        const u = await apiGet("/usage"); setStats(u);
        const a = await apiGet("/alerts"); setAlerts(a.alerts||[]);
        try { const s = await apiGet('/integrations/status'); setConn(s?.items||[]); } catch(_e) {}
      }catch(e){ setErr(e.error||"API error"); }
    })();
  },[]);
  if(err) return <div style={{padding:16}}>{err}</div>;
  if(!me) return <div style={{padding:16}}>Loading…</div>;

// --- Small UI helpers ---
function EmptyStateFx({ title, subtitle, actionHref, actionLabel }) {
  return (
    <div style={{
      padding:20,
      border:'1px dashed rgba(255,255,255,.15)',
      borderRadius:12,
      background:'rgba(255,255,255,.02)',
      textAlign:'center'
    }}>
      <div style={{fontWeight:600, marginBottom:4}}>{title}</div>
      {subtitle && <div style={{opacity:.75, fontSize:13, marginBottom:8}}>{subtitle}</div>}
      {actionHref && (
        <a href={actionHref} style={{
          fontSize:12,
          border:'1px solid rgba(255,255,255,.2)',
          borderRadius:8,
          padding:'6px 10px',
          textDecoration:'none',
          color:'#e6e9ef'
        }}>{actionLabel||'Learn more'}</a>
      )}
    </div>
  );
}
// make Dashboard visible to the runtime guard
try {
  if (typeof globalThis !== 'undefined') {
    if (!globalThis.Dashboard) globalThis.Dashboard = Dashboard;
    if (!globalThis.DashboardWithOnboarding) globalThis.DashboardWithOnboarding = Dashboard;
  }
} catch (_e) {}

// Build small series arrays for sparklines (fallback to simple trending values)
  const seriesAlerts = (()=>{
    const n = Number(stats?.alerts_24h||0);
    const base = Math.max(2, Math.round(n/6));
    return [base, base+1, base-1, base+2, base, base+3, Math.max(0,n-base*5)];
  })();
  const seriesApi = (()=>{
    const n = Number(stats?.api_calls_30d || stats?.month_events || 0);
    const base = Math.max(4, Math.round(n/10));
    return [base-2, base, base+1, base-1, base+2, base+3, base-1, base+2];
  })();
const seriesRisk = (()=>{
  const arr = (alerts||[]).slice(0,32).map(a=>normalizeRisk(a?.score)).filter(n=>isFinite(n));
  if(arr.length<4) return seriesAlerts;
  const step = Math.ceil(arr.length/8);
  const pts=[]; for(let i=0;i<arr.length;i+=step){
    pts.push(Math.round(arr.slice(i,i+step).reduce((s,n)=>s+n,0)/Math.max(1,Math.min(step,arr.length-i))));
  }
  return pts.slice(-8);
})();
  // Compute overall risk from recent alerts (avg score of last 20 alerts)
  const overallRisk = (function(){
    const arr = (alerts||[]).slice(0,20).map(a=>normalizeRisk(a?.score)).filter(n=>isFinite(n)&&n>=0);
    if(!arr.length) return 0;
    const avg = arr.reduce((s,n)=>s+n,0)/arr.length;
    return Math.max(0, Math.min(100, Math.round(avg)));
  })();

  async function quickAsk(e){
    e?.preventDefault();
    if(!askQ.trim()) return;
    setAskBusy(true); setAskMsg("");
    try{
      const r = await API.post('/ai/ask', { question: askQ });
      setAskMsg(r?.answer || 'No answer');
      setAskQ('');
    }catch(_e){ setAskMsg('Sorry — assistant failed.'); }
    finally{ setAskBusy(false); }
  }

  // Quick AI suggested questions (dynamic)
  function askSuggestion(q){
    if(!q) return; setAskQ(q); setTimeout(()=>quickAsk(), 0);
  }
  const aiSuggestions = (function(){
    const arr = [];
    const recent = (alerts||[]).slice(0,5);
    const recentTop = recent.filter(a=>Number(a?.score||0)>=60).length;
    const riskDir = (seriesRisk?.[seriesRisk.length-1]||0) - (seriesRisk?.[0]||0);
    if(recentTop>0) arr.push(`Explain the top ${Math.min(3,recentTop)} high‑risk alerts in the last day.`);
    if(riskDir>0) arr.push('Why is risk trending up this week?'); else arr.push('What drove the drop in risk this week?');
    arr.push('Which users or domains are most targeted by phishing right now?');
    if((conn||[]).length) arr.push('Any integrations failing or missing configuration?');
    else arr.push('What integrations should I connect first to improve coverage?');
    arr.push('Recommend specific policy changes to reduce risk by 20%.');
    return arr.slice(0,4);
  })();

  return (
  <div style={{position:'relative'}}>
    <h1 className="neon-title" style={{marginTop:0}}>Dashboard</h1>
{/* Futuristic ambient background */}
<style>{`
  @keyframes nebula { 
    0%{background-position:0 0, 0 0} 
    50%{background-position:240px 140px, -180px -100px} 
    100%{background-position:0 0, 0 0} 
  }
`}</style>
<div
  aria-hidden="true"
  style={{
    position:'absolute',
    inset:0,
    zIndex:0,
    pointerEvents:'none',
    opacity:.14,
    backgroundImage:
      'radial-gradient(640px 320px at 18% 8%, rgba(31,111,235,.38), transparent 60%), ' +
      'radial-gradient(560px 280px at 86% 24%, rgba(123,216,143,.32), transparent 60%)',
    backgroundRepeat:'no-repeat',
    animation:'nebula 28s ease-in-out infinite'
  }}
/>

      {/* AI Pulse hero */}
      <div className="fade-in" style={{position:'relative', zIndex:1}}><AIPulseHero stats={stats} /></div>

      {/* Futuristic stats */}
      <div className="fade-in" style={{position:'relative', zIndex:1, display:'grid',gridTemplateColumns:'repeat(4, minmax(200px,1fr))',gap:12, marginTop:12}}>
        <FuturisticStat
  title="Tenant"
  value={me.name||'-'}
  sub={
    <span>
      Plan: {me.plan || '-'}
      {me?.billing_status ? (
        <span style={{marginLeft:6, verticalAlign:'middle'}}>
          <BillingStatusChip me={me} />
        </span>
      ) : null}
    </span>
  }
/>
        <FuturisticStat title="API calls (30d)" value={stats?.api_calls_30d ?? stats?.month_events ?? '-'} series={seriesApi} />
        <FuturisticStat title="Alerts (24h)" value={stats?.alerts_24h ?? '-'} series={seriesAlerts} />
        <div className="fx-tilt"
  title="Overall risk = average of the last 20 alert scores (0–100). Higher is riskier."
  style={{
    padding:14,
    border:'1px solid rgba(123,216,143,.35)',
    borderRadius:14,
    background:'linear-gradient(180deg, rgba(20,24,30,.72), rgba(12,14,18,.64))',
    boxShadow:'0 8px 24px rgba(0,0,0,.28), 0 0 24px rgba(123,216,143,.12) inset',
    display:'grid',
    gridTemplateColumns:'auto 1fr',
    gap:10,
    alignItems:'center'
  }}
>
  <RiskGauge value={overallRisk} size={88} />
  <div>
    <div style={{opacity:.75,fontSize:12,display:'flex',alignItems:'center',gap:6}}>
      Overall risk
      <span
        style={{fontSize:12,opacity:.8,border:'1px solid rgba(255,255,255,.25)',borderRadius:999,padding:'0 6px'}}
        title="Average of last 20 alert scores"
      >
        ?
      </span>
    </div>
    <div style={{fontSize:22,fontWeight:800,marginTop:4}}>{overallRisk}</div>
    <div style={{opacity:.8,fontSize:12,marginTop:4}}>avg threat score (last 20)</div>
<MiniTrend points={seriesRisk} label="7d risk trend" />
<div style={{marginTop:6}}>
  <Link
    to="/alerts?sort=score_desc"
        style={{fontSize:12,textDecoration:'none',border:'1px solid rgba(255,255,255,.18)',padding:'4px 8px',borderRadius:8,color:'#e6e9ef'}}
      >
        View details →
      </Link>
    </div>
  </div>
</div> 
      </div>

      <div style={{position:'relative', zIndex:1, marginTop:10}}>
        <IntegrationHealthStrip items={conn} />
        {Array.isArray(conn) && conn.length===0 && (
          <div style={{margin:'8px 0 12px'}}>
            <EmptyStateFx
              title="No integrations connected"
              subtitle="Connect your email, EDR, DNS or cloud to unlock full protection."
              actionHref="/integrations"
              actionLabel="Connect integrations"
            />
          </div>
        )}
      </div>

      {/* Quick AI ask */}
      <div style={{position:'relative', zIndex:1, marginTop:12, display:'grid', gridTemplateColumns:'2fr 3fr', gap:12}}>
        <div style={{...card}}>
          <div style={{fontWeight:700, marginBottom:8}}>Ask AI</div>
          <form onSubmit={quickAsk} style={{display:'grid', gap:8}}>
            <input
              value={askQ}
              onChange={e=>setAskQ(e.target.value)}
              placeholder="e.g., Why was the last email flagged?"
              style={{padding:'10px 12px',borderRadius:10,border:'1px solid rgba(255,255,255,.15)',background:'rgba(255,255,255,.06)',color:'inherit'}}
              disabled={askBusy}
            />
            {/* Suggested AI questions */}
            <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:2}}>
              {aiSuggestions.map((q,i)=> (
                <button
  key={i}
  type="button"
  className="ghost"
  style={{
    padding:'4px 8px',
    borderRadius:999,
    border:'1px solid rgba(255,255,255,.2)',
    background:'rgba(255,255,255,.04)',
    color:'#e6e9ef',
    fontSize:12,
    cursor:'pointer'
  }}
  onClick={()=>askSuggestion(q)}
  disabled={askBusy}
>
  {q}
</button>
              ))}
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <button style={btn} disabled={askBusy}>{askBusy? 'Thinking…' : 'Ask'}</button>
              <span style={{opacity:.85,fontSize:12}}>{askMsg}</span>
            </div>
          </form>
        </div>

        {/* Recent alerts modern list */}
        <div style={{...card}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div className="neon-title-sm" style={{fontWeight:700}}>Recent alerts</div>
            <Link to="/alerts" style={{textDecoration:'none', padding:'6px 10px', border:'1px solid rgba(255,255,255,.18)', borderRadius:8, color:'#e6e9ef'}}>View all</Link>
          </div>
          <div style={{marginTop:8, maxHeight:260, overflow:'auto'}}>
            {(alerts||[]).slice(0,6).map((a)=>{
              const n = normalizeRisk(a?.score);
              const sev = n>=80? '#ef4444' : n>=60? '#f59e0b' : n>=30? '#3b82f6' : '#22c55e';
              return (
                <div key={a.id} className="fx-row" style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,alignItems:'center',padding:'8px 10px',borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                  <div>
                    <div style={{fontWeight:600}}>{a?.event?.type || a?.evt_type || 'alert'}</div>
                    <div style={{opacity:.8,fontSize:12}}>{a?.subject || a?.preview || a?.summary || '—'}</div>
                  </div>
                  <span style={{padding:'2px 8px',border:`1px solid ${sev}88`,color:sev,borderRadius:999,fontSize:12}}>{n||0}</span>
                </div>
              );
            })}
            {(!alerts || alerts.length===0) && (
  <EmptyStateFx
    title="No alerts yet"
    subtitle="Alerts will appear here once threats are detected."
    actionHref="/test"
    actionLabel="Send a sample alert"
  />
)}
          </div>
        </div>
      </div>
    </div>
  );
}
function Stat({title,value}){ return <div style={card}><div style={{opacity:.75,fontSize:13}}>{title}</div><div style={{fontSize:22,fontWeight:700,marginTop:6}}>{value}</div></div>; }


function Block({title,children,disabled}){
  return (
    <div style={{...card, opacity: disabled ? 0.8 : 1}}>
      <div style={{fontWeight:700,marginBottom:6}}>{title}</div>
      {children}
    </div>
  );
}
function Code({children}){ return <pre style={pre}>{children}</pre>; }

function Policy(){
  const [p,setP]=useState(null);
  const [msg,setMsg]=useState("");
  const [err,setErr]=useState("");
  useEffect(()=>{ apiGet("/policy").then(setP).catch(e=>setErr(e.error||"API error")); },[]);
  async function save(){
    try{
      const r = await apiPost("/policy", p);
      setP(r); setMsg("Saved");
      setTimeout(()=>setMsg(""),1500);
    }catch(e){ setErr(e.error||"Save failed"); }
  }
  if(err) return <div>{err}</div>;
  if(!p) return <div>Loading…</div>;
  const row={display:"grid",gridTemplateColumns:"1fr 200px",alignItems:"center",gap:10,margin:"8px 0"};
  const field={padding:"8px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.05)",color:"inherit"};
  return (
    <div>
      <h1 style={{marginTop:0}}>Policy</h1>
      <div style={card}>
        <div style={row}><div>Enabled</div><input type="checkbox" checked={!!p.enabled} onChange={e=>setP({...p,enabled:e.target.checked})}/></div>
        <div style={row}><div>Threshold</div><input className="field" style={field} type="number" step="0.1" value={p.threshold} onChange={e=>setP({...p,threshold:parseFloat(e.target.value)})}/></div>
        <div style={row}><div>Allow quarantine</div><input type="checkbox" checked={!!p.allow_quarantine} onChange={e=>setP({...p,allow_quarantine:e.target.checked})}/></div>
        <div style={row}><div>Allow DNS deny</div><input type="checkbox" checked={!!p.allow_dns_deny} onChange={e=>setP({...p,allow_dns_deny:e.target.checked})}/></div>
        <div style={row}><div>Allow disable account</div><input type="checkbox" checked={!!p.allow_disable_account} onChange={e=>setP({...p,allow_disable_account:e.target.checked})}/></div>
        <div style={row}><div>Dry-run (audit only)</div><input type="checkbox" checked={!!p.dry_run} onChange={e=>setP({...p,dry_run:e.target.checked})}/></div>
        <div style={{marginTop:12}}>
          <button style={btn} onClick={save}>Save</button>
          <span style={{marginLeft:10,opacity:.85}}>{msg}</span>
        </div>
      </div>
    </div>
  );
}

function Account(){
  const [me,setMe]=useState(null);
  const [msg,setMsg]=useState("");
  const [promo, setPromo] = useState(localStorage.getItem("promo_code") || "");

  useEffect(()=>{ apiGet("/me").then(setMe).catch(()=>{}); },[]);
  if(!me) return <div>Loading…</div>;

  const paid = me.plan !== "trial";

  async function openPortal(){
    try{
      const j = await apiGet('/billing/portal');
      const url = j?.url;
      if (url) window.open(url, '_blank', 'noopener');
    }catch(_e){
      alert('Unable to open billing portal right now.');
    }
  }

  async function createAccountKey(){
    setMsg("");
    try{
      let r;
      try{ r = await apiPost("/apikeys", {}); }
      catch(_e){ r = await apiPost("/apikeys/create", {}); }
      if(!r?.api_key) throw new Error(r?.error || "No key returned");
      localStorage.setItem("api_key", r.api_key);
      setMsg("API key created and stored in localStorage.api_key");
    }catch(e){
      const base = e?.error || e?.message || "key create failed";
      const hint = (me?.plan === 'trial') ? " — API keys require a paid plan (Basic/Pro)." : "";
      setMsg(base + hint);
    }
  }

  async function activate(plan){
    try{
      const body = promo ? { plan, coupon: promo } : { plan };
      const r = await apiPost("/billing/mock-activate", body);

      // Immediately refresh /me so trial eligibility and plan_actual are correct
      const fresh = await apiGet("/me");
      setMe(fresh);
      // Notify global listeners (navbar/layout) to refetch
      window.dispatchEvent(new Event('me-updated'));

      setMsg(`Plan set to ${r.plan}${promo ? ` (promo ${promo} applied if eligible)` : ""}`);
    }catch(e){
      setMsg(e.error||"activation failed");
    }
  }
  function savePromo(){
    if (promo) localStorage.setItem("promo_code", promo);
    else localStorage.removeItem("promo_code");
    setMsg(promo ? `Saved promo code ${promo}` : "Cleared promo code");
  }

  return (
    <div>
      <h1 style={{marginTop:0}}>Account</h1>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>
        <div style={card}>
          <div style={{marginBottom:8}}><b>Current plan</b>: {me.plan}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button style={btn} onClick={()=>activate("basic")}>Choose Basic</button>
            <button style={btn} onClick={()=>activate("pro")}>Choose Pro</button>
            <button style={btn} onClick={()=>activate("pro_plus")}>Choose Pro+</button>
          </div>
          <div style={{marginTop:8, display:'flex', alignItems:'center', gap:8}}>
            <button style={btn} onClick={openPortal}>Manage billing</button>
            {me?.billing_status && (
              <span style={{marginLeft:2}}>
                <BillingStatusChip me={me} />
              </span>
            )}
          </div>
          <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr auto",gap:8,alignItems:"center"}}>
            <input
              style={{padding:"8px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.05)",color:"inherit"}}
              placeholder="Enter promo/discount code"
              value={promo}
              onChange={e=>setPromo(e.target.value)}
            />
            <button style={btn} onClick={savePromo}>Save code</button>
          </div>
          <div style={{opacity:.8,marginTop:6}}>
            Discounts are applied during checkout/billing. Saved locally and sent with upgrades.
          </div>
        </div>
        <div style={card}>
          <div style={{marginBottom:8}}><b>API Key</b></div>
          {!paid ? (
            <div>Activate a paid plan to enable API keys.</div>
          ) : (
            <>
              <div style={{marginBottom:8}}>Current (localStorage): <code>{localStorage.getItem("api_key") || "— none —"}</code></div>
              <button style={btn} onClick={createAccountKey}>Create API Key</button>
            </>
          )}
        </div>
        <div style={card}>
          <div style={{marginBottom:8}}><b>Appearance</b></div>
          <label style={{display:'flex',alignItems:'center',gap:8}}>
            <input
              type="checkbox"
              defaultChecked={typeof localStorage!=='undefined' && localStorage.getItem('reduce_motion')==='1'}
              onChange={e=>{
                if (e.target.checked) localStorage.setItem('reduce_motion','1');
                else localStorage.removeItem('reduce_motion');
                window.dispatchEvent(new Event('prefs-changed'));
              }}
            />
            <span>Reduce motion & visual effects</span>
          </label>
          <div style={{opacity:.8,fontSize:12,marginTop:6}}>Disables ambient background and most animations.</div>
        </div>
      </div>
      {/* API Keys card */}
      <KeysCard />
      {msg && <div style={{marginTop:10}}>{msg}</div>}
    </div>
  );
}

function Pricing(){
  const [me, setMe] = React.useState(null);
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [coupon, setCoupon] = React.useState(localStorage.getItem("promo_code") || "");

  React.useEffect(()=>{ apiGet("/me").then(setMe).catch(()=>{}); },[]);

  const API_BASE = (typeof globalThis !== 'undefined' && globalThis.API_BASE)
  ? globalThis.API_BASE
  : ((typeof window !== 'undefined' && window.location.hostname.includes('onrender.com'))
      ? 'https://cyberguard-pro-cloud.onrender.com/api'
      : '/api');

  async function checkout(plan){
    setErr(""); setMsg(""); setBusy(true);
    try{
      const token = localStorage.getItem("token") || "";
      const body  = coupon ? { plan, coupon } : { plan };
      const r = await fetch(`${API_BASE}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type":"application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if(!r.ok) throw new Error(j?.error || "Checkout failed");
      if(j?.url){
        // Save coupon locally for later and redirect
        if (coupon) localStorage.setItem("promo_code", coupon);
        window.location.href = j.url;
        return;
      }
      setMsg("Checkout created.");
    }catch(e){
      setErr(e?.message || String(e));
    }finally{
      setBusy(false);
    }
  }

  async function portal(){
    setErr(""); setMsg(""); setBusy(true);
    try{
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${API_BASE}/billing/portal`, {
        method: "POST",
        headers: { "Content-Type":"application/json", Authorization: `Bearer ${token}` }
      });
      const j = await r.json();
      if(!r.ok) throw new Error(j?.error || "Portal failed");
      if(j?.url){ window.location.href = j.url; return; }
      setMsg("Opened billing portal.");
    }catch(e){
      setErr(e?.message || String(e));
    }finally{
      setBusy(false);
    }
  }

  const s = {
    grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))",gap:12},
    card:{padding:16,border:"1px solid rgba(255,255,255,.12)",borderRadius:12,background:"rgba(255,255,255,.04)"},
    h:{fontWeight:700,fontSize:18},
    price:{fontSize:28,fontWeight:800,marginTop:6},
    btn:{padding:"10px 12px",borderRadius:10,border:"1px solid #2b6dff66",background:"#1f6feb",color:"#fff",cursor:"pointer"},
    ghost:{padding:"8px 10px",borderRadius:10,border:"1px solid rgba(255,255,255,.22)",background:"transparent",color:"#e6e9ef",cursor:"pointer"}
  };

  const paid = me && (me.plan === "basic" || me.plan === "pro" || me.plan === "pro_plus");

  return (
    <div>
      <h1 style={{marginTop:0}}>Pricing</h1>

      <div style={{marginBottom:12, display:"grid", gridTemplateColumns:"1fr 220px", gap:10, alignItems:"center"}}>
        <div style={{opacity:.9}}>
          Choose a plan. You can manage or cancel anytime in the billing portal.
        </div>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <input
            value={coupon}
            onChange={e=>setCoupon(e.target.value)}
            placeholder="Coupon code (optional)"
            style={{flex:1,padding:"8px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.06)",color:"inherit"}}
          />
          <button
            style={s.ghost}
            onClick={()=>{
              if (coupon) localStorage.setItem("promo_code", coupon);
              else localStorage.removeItem("promo_code");
            }}
          >
            Save
          </button>
        </div>
      </div>

      <div style={s.grid}>
        <div style={s.card}>
          <div style={s.h}>Basic</div>
          <div style={s.price}>£19.99/mo</div>
          <ul style={{opacity:.9,lineHeight:1.5}}>
            <li>Email threat scanning</li>
            <li>Core dashboards &amp; alerts</li>
            <li>Community support</li>
          </ul>
          <button disabled={busy} style={s.btn} onClick={()=>checkout("basic")}>Start Basic</button>
        </div>

        <div style={s.card}>
          <div style={s.h}>Pro</div>
          <div style={s.price}>£39.99/mo</div>
          <ul style={{opacity:.9,lineHeight:1.5}}>
            <li>Everything in Basic</li>
            <li>Endpoint (EDR) &amp; DNS protection</li>
            <li>Email &amp; chat support</li>
          </ul>
          <button disabled={busy} style={s.btn} onClick={()=>checkout("pro")}>Start Pro</button>
        </div>

        <div style={s.card}>
          <div style={s.h}>Pro+</div>
          <div style={s.price}>£99.99/mo</div>
          <ul style={{opacity:.9,lineHeight:1.5}}>
            <li>Everything in Pro</li>
            <li>UEBA &amp; Cloud security</li>
            <li>AI assistant &amp; priority support</li>
          </ul>
          <button disabled={busy} style={s.btn} onClick={()=>checkout("pro_plus")}>Start Pro+</button>
        </div>
      </div>

      <div style={{marginTop:14, display:"flex", gap:10, alignItems:"center"}}>
        <button disabled={busy || !paid} style={s.ghost} onClick={portal}>
          Manage billing
        </button>
        {paid ? (
          <span style={{opacity:.85}}>
            Current plan: <b>{me?.plan}</b>
            {me?.billing_status ? (
              <> — <span style={{fontSize:12, padding:'2px 6px', border:'1px solid rgba(255,255,255,.25)', borderRadius:999}}>{String(me.billing_status)}</span></>
            ) : null}
          </span>
        ) : (
          <span style={{opacity:.75}}>You’ll see the billing portal after subscribing.</span>
        )}
      </div>

      {(msg || err) && (
        <div style={{marginTop:10}}>
          {msg && <div style={{padding:"8px 10px",border:"1px solid #7bd88f66",background:"#7bd88f22",borderRadius:10}}>{msg}</div>}
          {err && <div style={{padding:"8px 10px",border:"1px solid #ff7a7a88",background:"#ff7a7a22",borderRadius:10}}>{err}</div>}
        </div>
      )}
    </div>
  );
}

function Admin(){
  const [me, setMe] = useState(null);
  const [tenants, setTenants] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState(null);
  const [keys, setKeys] = useState([]);
  const [chat, setChat] = useState([]);

  useEffect(()=>{ apiGet('/me').then(m=>setMe(m)).catch(()=>setMe(null)); },[]);

  async function loadTenants(){
    setErr(""); setLoading(true);
    try{
      const j = await apiGet('/admin/tenants');
      if(!j?.ok) throw new Error('failed');
      setTenants(j.tenants||[]);
    }catch(e){ setErr('Failed to load tenants'); }
    finally{ setLoading(false); }
  }

  async function viewTenant(tid){
    setSelected(tid);
    try{
      const k = await apiGet(`/admin/tenant/${encodeURIComponent(tid)}/keys`);
      setKeys(k?.keys||[]);
      const c = await apiGet(`/admin/chat/${encodeURIComponent(tid)}`);
      setChat(c?.messages||[]);
    }catch(_e){/* ignore */}
  }

  async function suspend(tid, suspend){
    await apiPost('/admin/tenants/suspend', { tenant_id: tid, suspend: !!suspend });
    await loadTenants();
  }

  async function rotateKey(tid){
    const j = await apiPost('/admin/tenants/rotate-key', { tenant_id: tid });
    alert(j?.api_key ? `New API key: ${j.api_key}` : 'Key rotated');
    await viewTenant(tid);
  }

  async function impersonate(tid){
    const adminTok = localStorage.getItem('token');
    const j = await apiPost('/admin/impersonate', { tenant_id: tid });
    if(j?.token){
      if(adminTok) localStorage.setItem('admin_token_backup', adminTok);
      localStorage.setItem('token', j.token);
      alert('Impersonation token stored. Reloading as tenant…');
      location.href = '/';
    }
  }

  async function reply(tid){
    const body = prompt('Reply as Admin:');
    if(!body) return;
    await apiPost('/admin/chat/reply', { tenant_id: tid, body });
    await viewTenant(tid);
  }

  useEffect(()=>{ loadTenants(); },[]);

  if(!me) return <div style={{padding:16}}>Loading…</div>;
  if(!(me.is_super || me.role === 'owner')) return <div style={{padding:16}}>Access denied.</div>;

  const s = {
    wrap:{padding:16,color:'#e6e9ef'},
    header:{display:'grid',gap:4,marginBottom:12},
    grid:{display:'grid',gridTemplateColumns:'minmax(260px, 420px) 1fr',gap:12,alignItems:'start'},
    card:{background:'rgba(24,26,34,.75)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,padding:12,backdropFilter:'blur(6px)'},
    row:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,.06)'},
    btn:{padding:'8px 10px',borderRadius:8,border:'1px solid #2b6dff55',background:'#2b6dff',color:'#fff',cursor:'pointer'},
    warn:{padding:'8px 10px',borderRadius:8,border:'1px solid #ff6b6b55',background:'#ff6b6b',color:'#fff',cursor:'pointer'},
    ghost:{padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'transparent',color:'#e6e9ef',cursor:'pointer'},
    err:{padding:'10px 12px',border:'1px solid #ff6b6b',background:'#ff6b6b1a',borderRadius:8,marginBottom:10}
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={{fontWeight:700}}>Admin</div>
        <div style={{opacity:.8,fontSize:13}}>Super-admin tools</div>
      </div>

      <div style={{display:'flex',gap:8,alignItems:'center',margin:'6px 0 12px'}}>
        <div style={{fontSize:12,opacity:.8}}>Preview plan as:</div>
        <select
          defaultValue={typeof localStorage!=='undefined' ? (localStorage.getItem('admin_plan_preview')||'') : ''}
          onChange={e=>{ const v=e.target.value; if(typeof localStorage!=='undefined'){ if(v) localStorage.setItem('admin_plan_preview', v); else localStorage.removeItem('admin_plan_preview'); } alert('Plan preview set. Reloading…'); location.reload(); }}
          style={{padding:'6px 8px',borderRadius:8,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.14)',color:'#e6e9ef'}}
        >
          <option value="">(tenant actual)</option>
          <option value="trial">trial</option>
          <option value="basic">basic</option>
          <option value="pro">pro</option>
          <option value="pro_plus">pro+</option>
        </select>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}>
          <input type="checkbox" defaultChecked={typeof localStorage!=='undefined' && localStorage.getItem('admin_override')==='1'} onChange={e=>{ if(typeof localStorage!=='undefined'){ if(e.target.checked) localStorage.setItem('admin_override','1'); else localStorage.removeItem('admin_override'); } alert('Override updated. Reloading…'); location.reload(); }} />
          Bypass paywall (override)
        </label>
      </div>

      {err && <div style={s.err}>{err}</div>}

      <div style={s.grid}>
        <div>
          <div style={s.card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontWeight:600}}>Tenants</div>
              <button onClick={loadTenants} style={s.ghost}>{loading? 'Loading…':'Refresh'}</button>
            </div>
            <div style={{marginTop:8}}>
              {(!tenants||!tenants.length) && <div style={{opacity:.7}}>No tenants found.</div>}
              {tenants && tenants.map(t=> (
                <div key={t.id} style={s.row}>
                  <div>
                    <div style={{fontWeight:600}}>{t.name||t.id}</div>
                    <div style={{fontSize:12,opacity:.7}}>plan: {t.plan||'trial'}</div>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>viewTenant(t.id)} style={s.btn}>Open</button>
                    {t.plan==='suspended'
                      ? <button onClick={()=>suspend(t.id,false)} style={s.btn}>Unsuspend</button>
                      : <button onClick={()=>suspend(t.id,true)} style={s.warn}>Suspend</button>}
                    <button onClick={()=>impersonate(t.id)} style={s.ghost}>Impersonate</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          {selected ? (
            <div style={{display:'grid', gap:12}}>
              {/* AdminTenantKeys card */}
              <AdminTenantKeys selected={selected} />

              <div style={s.card}>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <div style={{fontWeight:600}}>Support Chat</div>
                  <button onClick={()=>reply(selected)} style={s.btn}>Reply</button>
                </div>
                <div style={{marginTop:8, maxHeight:300, overflow:'auto'}}>
                  {(!chat||!chat.length) && <div style={{opacity:.7}}>No messages yet.</div>}
                  {chat.map(m=> (
                    <div key={m.id} style={{margin:'8px 0'}}>
                      <div style={{fontSize:12,opacity:.7}}>{m.author} • {new Date((m.created_at||0)*1000).toLocaleString()}</div>
                      <div>{m.body}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={s.card}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{fontWeight:600}}>AI Admin Assistant</div>
                </div>
                <div style={{marginTop:8}}>
                  <form onSubmit={async (e)=>{ e.preventDefault(); const q = e.target.q.value.trim(); if(!q) return; try{ const r = await apiPost('/admin/ai/ask', { question: q, tenant_id: selected }); alert(r?.answer || 'No answer'); e.target.reset(); }catch(_e){ alert('Assistant failed'); } }}>
                    <input name="q" placeholder="Ask about configuration, errors, or how to…" style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.06)',color:'#e6e9ef'}} />
                    <div style={{marginTop:8}}><button style={s.btn}>Ask</button></div>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            <div style={{opacity:.7}}>Select a tenant to view details.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Alerts (customer-ready) ---
function AlertsPage(){
  const [items, setItems] = React.useState([]);
  const [limit, setLimit] = React.useState(50);
  const [days, setDays] = React.useState(() => {
  try {
    const v = (typeof localStorage !== "undefined" && localStorage.getItem('alerts:days')) || "";
    return v ? Number(v) || 7 : 7;
  } catch {
    return 7;
  }
});
const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [q, setQ] = React.useState(() => {
  try { return (typeof localStorage !== "undefined" && localStorage.getItem('alerts:q')) || ""; }
  catch { return ""; }
});
const [onlyAnomaly, setOnlyAnomaly] = React.useState(() => {
  try { return (typeof localStorage !== "undefined" && localStorage.getItem('alerts:onlyAnomaly')) === "1"; }
  catch { return false; }
});
  // --- Alerts query helpers (sanitize/normalize) ---
  function normDays(x) {
    const n = parseInt(x, 10);
    return (Number.isFinite(n) && n > 0) ? String(n) : '7';
  }
  function cleanQ(s) {
    if (!s) return '';
    const t = String(s).trim();
    return t.length >= 2 ? t : '';
  }
  function buildAlertsQS({ q, days, onlyAnomaly, levels, limit, offset }) {
    const qs = new URLSearchParams();
    qs.set('days', normDays(days));
    const cq = cleanQ(q);
    if (cq) qs.set('q', cq);
    if (onlyAnomaly) qs.set('only_anomaly', '1');
    if (Array.isArray(levels) && levels.length) qs.set('levels', levels.join(','));
    if (limit) qs.set('limit', String(limit));
    if (offset) qs.set('offset', String(offset));
    return qs.toString();
  }	

  // Toast state for CSV export
  const [toast, setToast] = React.useState("");
  const [selected, setSelected] = React.useState(null);

  async function markReviewed(id){
    try{
      await api.post('/alerts/mark_reviewed', { id });
      setToast('Marked reviewed'); setTimeout(()=>setToast(''), 1200);
      loadAlerts(limit, days);
    }catch(e){ setErr(e?.error||'Failed to mark'); }
  }
  async function ignoreDomain(dom){
    if(!dom) return;
    try{
      await api.post('/policy/ignore_domain', { domain: dom });
      setToast('Domain ignored'); setTimeout(()=>setToast(''), 1200);
    }catch(e){ setErr(e?.error||'Failed to ignore'); }
  }
  function openInAutonomy(a){ window.location.href = '/autonomy'; }

  async function loadAlerts(nextLimit = limit, nextDays = days){
        setLoading(true); setErr("");
    try{
      const token = (typeof localStorage!=="undefined" && localStorage.getItem("token")) || "";
      const origin =
        (import.meta?.env?.VITE_API_BASE)
        || (typeof window!=="undefined" && window.location.hostname.endsWith("onrender.com")
              ? "https://cyberguard-pro-cloud.onrender.com"
              : "http://localhost:8080");

      const qs = buildAlertsQS({ q, days: nextDays, onlyAnomaly, levels: undefined, limit: nextLimit });
      const url = `${origin}/alerts/export?${qs}`;
      const r = await fetch(url, { headers:{ Authorization:`Bearer ${token}` }});
      const text = await r.text();
      let j; try { j = JSON.parse(text); } catch { j = { ok:false, error:text }; }
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`);

      const list = Array.isArray(j.alerts) ? j.alerts : [];
      setItems(list);
    }catch(e){
      setErr(e?.message || String(e));
      setItems([]);
    }finally{
      setLoading(false);
    }
  }

  React.useEffect(()=>{ loadAlerts(limit, days); },[]);
  React.useEffect(()=>{ loadAlerts(limit, days); },[days, limit]);

  function filtered(){
    const needle = q.trim().toLowerCase();
    return items.filter(a=>{
      if(onlyAnomaly && !(a?.anomaly_txt || "").trim()) return false;
      if(!needle) return true;
      const hay = [
        a?.from || a?.from_addr || "",
        a?.subject || "",
        a?.preview || "",
        a?.evt_type || ""
      ].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }

  function riskFromScore(sc){
    const n = Number(sc);
    if (!isFinite(n)) return { label:'Unknown', level:'unknown', color:'#9ca3af', bg:'rgba(156,163,175,.15)' };
    if (n >= 80) return { label:'Critical', level:'critical', color:'#fecaca', bg:'rgba(239,68,68,.15)' };
    if (n >= 60) return { label:'High', level:'high', color:'#fcd34d', bg:'rgba(245,158,11,.15)' };
    if (n >= 30) return { label:'Medium', level:'medium', color:'#93c5fd', bg:'rgba(59,130,246,.15)' };
    return { label:'Low', level:'low', color:'#86efac', bg:'rgba(34,197,94,.15)' };
  }

  const s = {
    wrap:{padding:16},
    controls:{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:8,alignItems:'center',margin:'6px 0 12px'},
    field:{padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.06)',color:'inherit'},
    ghost:{padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'transparent',color:'#e6e9ef',cursor:'pointer'},
    btn:{padding:'8px 12px',borderRadius:8,border:'1px solid #2b6dff66',background:'#1f6feb',color:'#fff',cursor:'pointer'},
    card:{padding:12,border:'1px solid rgba(255,255,255,.12)',borderRadius:10,background:'rgba(255,255,255,.04)'},
    row:{display:'grid',gridTemplateColumns:'220px 1fr 260px',gap:10,alignItems:'start',padding:'10px',borderBottom:'1px solid rgba(255,255,255,.08)',cursor:'pointer'},
    tag:{display:'inline-block',padding:'2px 6px',border:'1px solid rgba(255,255,255,.18)',borderRadius:999,opacity:.85,fontSize:12}
  };

  const list = filtered();

  // Helper for building alerts export URL
  function buildAlertsUrl(days, limit, query, anomaliesOnly){
    const origin = (import.meta?.env?.VITE_API_BASE)
      || (typeof window!=="undefined" && window.location.hostname.endsWith("onrender.com")
           ? "https://cyberguard-pro-cloud.onrender.com"
           : "http://localhost:8080");
    const qs = buildAlertsQS({ q: query, days, onlyAnomaly: anomaliesOnly, levels: undefined, limit });
    return `${origin}/alerts/export?format=csv&${qs}`;
  }

  // Export CSV helper
  async function exportCsv(){
    const token = (typeof localStorage!=="undefined" && localStorage.getItem("token")) || "";
    const url = buildAlertsUrl(days, 1000, q, onlyAnomaly);
    try{
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `alerts_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=> URL.revokeObjectURL(a.href), 1500);
      setToast('Exported CSV');
      setTimeout(()=>setToast(''), 1600);
    }catch(e){
      setErr(e?.message || 'Export failed');
    }
  }

  return (
    <div style={s.wrap}>
      <h1 style={{marginTop:0}}>Alerts</h1>

      <div style={s.controls}>
        <input
          className="field"
          style={s.field}
          placeholder="Search subject, sender, preview…"
          value={q}
          onChange={e=>setQ(e.target.value)}
        />
        <select value={days} onChange={e=>{ setDays(Number(e.target.value)||7); }} style={s.field}>
          <option value={1}>Last 24h</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13}}>
          <input type="checkbox" checked={onlyAnomaly} onChange={e=>setOnlyAnomaly(e.target.checked)} />
          Only anomalies
        </label>
        <div style={{display:'flex',gap:8}}>
          <button className="ghost" style={s.ghost} onClick={()=>loadAlerts(limit, days)} disabled={loading}>
            {loading? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="ghost" style={s.ghost} onClick={exportCsv} disabled={loading}>
            Export CSV
          </button>
          <button className="btn" style={s.btn} onClick={()=>setLimit(l=>l+50)} disabled={loading}>
            Load more (+50)
          </button>
        </div>
      </div>

      <div style={{display:'flex',gap:8,alignItems:'center',margin:'6px 0 12px',flexWrap:'wrap'}}>
        <span style={{fontSize:12,opacity:.8}}>Threat levels:</span>
        {[
          {label:'Low',     color:'#86efac', bg:'rgba(34,197,94,.15)'},
          {label:'Medium',  color:'#93c5fd', bg:'rgba(59,130,246,.15)'},
          {label:'High',    color:'#fcd34d', bg:'rgba(245,158,11,.15)'},
          {label:'Critical',color:'#fecaca', bg:'rgba(239,68,68,.15)'},
        ].map((r,i)=>(
          <span key={i} style={{padding:'2px 8px',border:'1px solid '+r.color, background:r.bg, color:r.color, borderRadius:999, fontSize:12}}>
            {r.label}
          </span>
        ))}
      </div>

      {err && <div style={{padding:'10px 12px',border:'1px solid #ff7a7a88',background:'#ff7a7a22',borderRadius:10,margin:'10px 0'}}>Error: {err}</div>}

      <div style={s.card}>
        {!loading && list.length===0 ? (
          <EmptyStateFx
            title={`No alerts${q? ' match your search' : ''}`}
            subtitle={onlyAnomaly ? 'Try turning off “Only anomalies” or broaden your date range.' : 'Try broadening your date range or clearing the search.'}
            actionHref="/test"
            actionLabel="Send a sample alert"
          />
        ) : (
          list.map(a => {
            const created = a?.created_at ? new Date(Number(a.created_at) * 1000).toLocaleString() : '—';
            return (
              <div
                key={a.id}
                onClick={() => setSelected(a)}
                title="View details"
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid rgba(255,255,255,.08)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.subject || '(no subject)'}
                  </div>
                  <div style={{ opacity: .7, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.from || a.from_addr || '—'}
                  </div>
                </div>
                <div style={{ fontSize: 12, opacity: .7, whiteSpace: 'nowrap' }}>{created}</div>
                {a.score != null && (() => {
                  const risk = riskFromScore(a.score);
                  return (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        border: `1px solid ${risk.color}`,
                        background: risk.bg,
                        color: risk.color,
                        fontSize: 12,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {risk.label} • {a.score}
                    </span>
                  );
                })()}
              </div>
            );
          })
        )}
        {loading && (
          <div style={{display:'grid',gap:8,padding:12}}>
            {Array.from({length:6}).map((_,i)=> (
              <div key={i} style={{display:'grid',gridTemplateColumns:'220px 1fr 260px',gap:10,alignItems:'center'}}>
                <SkeletonLine width="80%" />
                <SkeletonLine width="95%" />
                <SkeletonLine width="60%" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Details Drawer / Modal */}
      {selected && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',backdropFilter:'blur(4px)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}}>
          <div style={{width:'min(840px,94vw)',maxHeight:'86vh',overflow:'auto',background:'linear-gradient(180deg, rgba(28,30,38,.96), rgba(22,24,30,.94))',border:'1px solid rgba(255,255,255,.12)',borderRadius:12,padding:16,boxShadow:'0 18px 48px rgba(0,0,0,.35)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <div style={{fontWeight:700}}>Alert details</div>
              <button onClick={()=>setSelected(null)} style={{padding:'6px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'transparent',color:'#e6e9ef',cursor:'pointer'}}>Close</button>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 240px',gap:12,alignItems:'start'}}>
              <div>
                <div style={{fontSize:14,opacity:.8,marginBottom:4}}>Subject</div>
                <div style={{fontWeight:700,marginBottom:10}}>{selected.subject || '—'}</div>

                <div style={{fontSize:14,opacity:.8,marginBottom:4}}>Preview</div>
                <pre style={{whiteSpace:'pre-wrap',padding:10,border:'1px solid rgba(255,255,255,.12)',borderRadius:10,background:'rgba(255,255,255,.05)'}}>{selected.preview || '—'}</pre>
              </div>
              <div>
                <div style={{padding:12,border:'1px solid rgba(255,255,255,.12)',borderRadius:10,background:'rgba(255,255,255,.04)'}}>
                  <div style={{opacity:.8,fontSize:13,marginBottom:6}}>Meta</div>
                  <div style={{fontSize:13,display:'grid',gap:4}}>
                    <div><b>From:</b> {selected.from || selected.from_addr || '—'}</div>
                    <div><b>Type:</b> {selected.evt_type || '—'}</div>
                    {selected.score!=null
                      ? (()=>{ const risk = riskFromScore(selected.score);
                          return (
                            <div>
                              <b>Threat:</b> {risk.label} <span style={{opacity:.8}}>(score {selected.score})</span>
                            </div>
                          );
                        })()
                      : <div><b>Threat:</b> —</div>}
                    <div><b>Created:</b> {selected.created_at ? new Date(Number(selected.created_at)*1000).toLocaleString() : '—'}</div>
                    {(selected.anomaly_txt||"").trim() ? (
                      <div><b>Anomaly:</b> {selected.anomaly_txt}</div>
                    ) : null}
                    <div style={{marginTop:8}}>
                      <button style={{padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'transparent',color:'#e6e9ef',cursor:'pointer'}}
                        onClick={async ()=>{
                          try{
                            await navigator.clipboard.writeText(JSON.stringify(selected,null,2));
                            alert('Copied JSON to clipboard');
                          }catch(_e){ alert('Copy failed'); }
                        }}>
                        Copy JSON
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
      {toast && (
        <div style={{position:'fixed',bottom:20,left:'50%',transform:'translateX(-50%)',padding:'8px 12px',border:'1px solid rgba(255,255,255,.2)',background:'rgba(0,0,0,.7)',borderRadius:8,zIndex:1000}}>
          {toast}
        </div>
      )}
    </div>
  );
}

// --- Onboarding Checklist for Dashboard ---
function OnboardingChecklist(){
  const [me, setMe] = React.useState(null);
  const [conn, setConn] = React.useState([]);
  const [hasAlert, setHasAlert] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(()=>{
    (async()=>{
      try{
        const m = await apiGet('/me');
        setMe(m||{});
        try{
          const s = await apiGet('/integrations/status');
          setConn(s?.items||[]);
        }catch(_e){}
        try{
          const a = await apiGet('/alerts/export?days=30&limit=1');
          setHasAlert(Array.isArray(a?.alerts) && a.alerts.length>0);
        }catch(_e){ setHasAlert(false); }
      }finally{ setLoading(false); }
    })();
  },[]);

  const get = (t)=> (conn||[]).find(x=>x.type===t);
  const emailConnected = !!get('email') && get('email').status==='connected';
  const edrConnected   = !!get('edr')   && get('edr').status==='connected';
  const dnsConnected   = !!get('dns')   && get('dns').status==='connected';

  const steps = [
    { key:'email',  label:'Connect your email provider', done: emailConnected,    href:'/integrations' },
    { key:'poll',   label:'Ingest your first batch of alerts', done: hasAlert,     href:'/alerts' },
    { key:'review', label:'Review alerts and mark any anomalies', done: hasAlert,  href:'/alerts' },
    { key:'edr',    label:'Protect endpoints (EDR)', done: edrConnected,           href:'/integrations' },
    { key:'dns',    label:'Enable DNS protection', done: dnsConnected,             href:'/integrations' },
  ];
  const doneCount = steps.filter(s=>s.done).length;

  const s = {
    wrap:{padding:12, marginBottom:12, border:'1px solid rgba(255,255,255,.12)', borderRadius:12, background:'rgba(255,255,255,.04)'},
    head:{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8},
    row:{display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,.06)'},
    btn:{padding:'6px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.2)', background:'transparent', color:'#e6e9ef', cursor:'pointer'},
    badge:{fontSize:12, opacity:.85, border:'1px solid rgba(255,255,255,.18)', borderRadius:999, padding:'2px 8px'}
  };

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <div style={{fontWeight:700}}>Getting started</div>
        <div style={s.badge}>{doneCount}/{steps.length} done</div>
      </div>
      {loading ? (
        <div style={{opacity:.75}}>Loading checklist…</div>
      ) : (
        <div>
          {steps.map(step=> (
            <div key={step.key} style={s.row}>
              <div style={{width:22, textAlign:'center'}}>{step.done ? '✅' : '⬜️'}</div>
              <div style={{flex:1}}>{step.label}</div>
              <a href={step.href} style={s.btn}>Open</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Onboarding tips block for dashboard
function OnboardingTips() {
  const s = {
    wrap: { marginTop: 12, padding: 12, border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, background: 'rgba(255,255,255,.03)' },
    tip: { fontSize: 13, marginBottom: 4, opacity: 0.85 }
  };
  return (
    <div style={s.wrap}>
      <div style={s.tip}>• The dashboard shows your security integrations and live alerts.</div>
      <div style={s.tip}>• Green "Connected" means data is flowing in from that source.</div>
      <div style={s.tip}>• The Alerts page lists suspicious activity — click any alert for details.</div>
      <div style={{...s.tip, marginTop:4}}>Threat score legend:&nbsp;
        <span style={{background:'rgba(34,197,94,.2)',padding:'1px 6px',borderRadius:6}}>Low (0–39)</span>
        &nbsp;·&nbsp;
        <span style={{background:'rgba(234,179,8,.2)',padding:'1px 6px',borderRadius:6}}>Medium (40–69)</span>
        &nbsp;·&nbsp;
        <span style={{background:'rgba(220,38,38,.2)',padding:'1px 6px',borderRadius:6}}>High (70–100)</span>
      </div>
      <div style={s.tip}>Sources: Email, DNS, EDR, Cloud (shown per alert).</div>
      <div style={s.tip}>Tip: hover any status label to see what it means.</div>
    </div>
  );
}

// --- Autonomy (Pro+) ---
function AutonomyPage(){
  const [me, setMe] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [policy, setPolicy] = React.useState(null);
  const [actions, setActions] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState('all'); // all | proposed | approved | executed | failed
  const [toast, setToast] = React.useState("");
  const canApprove = !!(me?.is_super || (String(me?.role||'').toLowerCase()==='owner') || (String(me?.role||'').toLowerCase()==='admin'));

  const API_ORIGIN =
    (import.meta?.env?.VITE_API_BASE)
    || (typeof window !== 'undefined' && window.location.hostname.endsWith('onrender.com')
          ? 'https://cyberguard-pro-cloud.onrender.com'
          : 'http://localhost:8080');

  async function api(path, opts = {}) {
    const token = localStorage.getItem("token") || "";
    const url = `${API_ORIGIN}${path.startsWith('/') ? path : '/' + path}`;
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { ok:false, error:text }; }
    if (!res.ok) throw Object.assign(new Error(json.error || res.statusText), { detail: json });
    return json;
  }

  async function loadAll(){
    setLoading(true); setErr("");
    try{
      const m = await api('/me');
      setMe(m);
      const pol = await api('/ai/policies');
      setPolicy(Array.isArray(pol?.items) ? pol.items[0] || { mode:'manual' } : { mode:'manual' });
      const acts = await api('/ai/actions');
      setActions(Array.isArray(acts?.items) ? acts.items : []);
    }catch(e){ setErr(e?.message || 'load failed'); }
    finally{ setLoading(false); }
  }

  React.useEffect(()=>{ loadAll(); },[]);

  // Initialize filter from localStorage
  React.useEffect(()=>{
    try{ const v = (typeof localStorage!=="undefined" && localStorage.getItem('autonomy:filter')) || 'all'; setStatusFilter(v || 'all'); }catch{}
  },[]);
  // Persist filter on change
  React.useEffect(()=>{ try{ if(typeof localStorage!=="undefined"){ localStorage.setItem('autonomy:filter', String(statusFilter)); } }catch{} },[statusFilter]);

  const caps = planCapabilities(me?.effective_plan || me?.plan_actual || me?.plan || 'trial', me);
  const proPlus = caps.ai; // same gating

  async function setMode(mode){
    setBusy(true); setErr("");
    try{
      const j = await api('/ai/policies', { method:'POST', body:{ mode } });
      setPolicy(j?.policy || { mode });
    }catch(e){ setErr(e?.detail?.error || e?.message || 'failed to update'); }
    finally{ setBusy(false); }
  }
  async function propose(){
    setBusy(true); setErr("");
    try{
      await api('/ai/propose', { method:'POST' });
      const acts = await api('/ai/actions');
      setActions(Array.isArray(acts?.items) ? acts.items : []);
    }catch(e){ setErr(e?.detail?.error || e?.message || 'propose failed'); }
    finally{ setBusy(false); }
  }
  async function approveOne(id){
    if(!id) return; if(!canApprove){ setErr('Not permitted'); return; }
    setBusy(true); setErr("");
    try{
      await api('/ai/approve', { method:'POST', body:{ id } });
      const acts = await api('/ai/actions');
      setActions(Array.isArray(acts?.items) ? acts.items : []);
    }catch(e){ setErr(e?.detail?.error || e?.message || 'approve failed'); }
    finally{ setBusy(false); }
  }
  async function executeOne(id){
    if(!id) return; if(!canApprove){ setErr('Not permitted'); return; }
    setBusy(true); setErr("");
    try{
      await api('/ai/execute', { method:'POST', body:{ id } });
      const acts = await api('/ai/actions');
      setActions(Array.isArray(acts?.items) ? acts.items : []);
    }catch(e){ setErr(e?.detail?.error || e?.message || 'execute failed'); }
    finally{ setBusy(false); }
  }

  async function bulkApprove(){
    if(!canApprove){ setErr('Not permitted'); return; }
    const targets = actions.filter(a => String(a.status||'').toLowerCase()==='proposed').map(a=>a.id);
    if(targets.length===0) return;
    setBusy(true); setErr("");
    try{
      for (const id of targets) { await api('/ai/approve', { method:'POST', body:{ id } }); }
      const acts = await api('/ai/actions');
      setActions(Array.isArray(acts?.items) ? acts.items : []);
      setToast(`Approved ${targets.length} action${targets.length===1?'':'s'}`);
      setTimeout(()=>setToast(''), 1600);
    }catch(e){ setErr(e?.detail?.error || e?.message || 'bulk approve failed'); }
    finally{ setBusy(false); }
  }
  async function bulkExecute(){
    if(!canApprove){ setErr('Not permitted'); return; }
    const targets = actions.filter(a => String(a.status||'').toLowerCase()==='approved').map(a=>a.id);
    if(targets.length===0) return;
    setBusy(true); setErr("");
    try{
      for (const id of targets) { await api('/ai/execute', { method:'POST', body:{ id } }); }
      const acts = await api('/ai/actions');
      setActions(Array.isArray(acts?.items) ? acts.items : []);
      setToast(`Executed ${targets.length} action${targets.length===1?'':'s'}`);
      setTimeout(()=>setToast(''), 1600);
    }catch(e){ setErr(e?.detail?.error || e?.message || 'bulk execute failed'); }
    finally{ setBusy(false); }
  }

  const s={ wrap:{padding:16}, card:{padding:12,border:'1px solid rgba(255,255,255,.12)',borderRadius:10,background:'rgba(255,255,255,.04)'},
            btn:{padding:'8px 12px',borderRadius:8,border:'1px solid #2b6dff66',background:'#1f6feb',color:'#fff',cursor:'pointer'},
            ghost:{padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'transparent',color:'#e6e9ef',cursor:'pointer'} };

  if (loading) return <div style={s.wrap}>Loading…</div>;
  if (!proPlus) return (
    <div style={s.wrap}>
      <h1 style={{marginTop:0}}>Autonomy (beta)</h1>
      <div style={s.card}>This feature is available on <b>Pro+</b>. If you are on a trial of Basic/Pro, it unlocks temporarily.</div>
    </div>
  );

  const filteredActions = Array.isArray(actions) ? actions.filter(a => {
    const s = String(a.status||'').toLowerCase();
    if (statusFilter === 'all') return true;
    return s === statusFilter;
  }) : [];

  return (
    <div style={s.wrap}>
      <h1 style={{marginTop:0}}>Autonomy (beta)</h1>
      {policy?.mode === 'auto' && (
        <div style={{margin:'8px 0', padding:'8px 10px', border:'1px solid #7bd88f55', background:'#7bd88f22', borderRadius:8}}>
          <b>Auto-run is ON:</b> approved actions execute automatically every minute.
        </div>
      )}
      {err && <div style={{padding:'8px 10px',border:'1px solid #ff7a7a88',background:'#ff7a7a22',borderRadius:8,marginBottom:8}}>Error: {err}</div>}

      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:12}}>
        <div style={s.card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontWeight:700}}>Policy</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{opacity:.85,fontSize:12}}>Mode:</span>
              <select value={policy?.mode||'manual'} onChange={e=>setMode(e.target.value)} disabled={busy} style={{padding:'6px 8px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.06)',color:'inherit'}}>
                <option value="manual">manual</option>
                <option value="auto">auto</option>
              </select>
              <button style={s.ghost} onClick={loadAll} disabled={busy}>Refresh</button>
            </div>
          </div>
          <div style={{opacity:.85,marginTop:6}}>When set to <b>auto</b>, approved actions will execute automatically.</div>
        </div>

        <div style={s.card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontWeight:700}}>Actions</div>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <label style={{fontSize:12,opacity:.85}}>Filter:</label>
              <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} disabled={busy}
                style={{padding:'6px 8px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.06)',color:'inherit'}}>
                <option value="all">all</option>
                <option value="proposed">proposed</option>
                <option value="approved">approved</option>
                <option value="executed">executed</option>
                <option value="failed">failed</option>
              </select>
              <span style={{fontSize:12,opacity:.8}}>({filteredActions.length})</span>
              <button style={s.btn} onClick={propose} disabled={busy}>Propose actions</button>
              {canApprove && <button style={s.ghost} onClick={bulkApprove} disabled={busy}>Approve all proposed</button>}
              {canApprove && <button style={s.ghost} onClick={bulkExecute} disabled={busy}>Execute all approved</button>}
              <button style={s.ghost} onClick={loadAll} disabled={busy}>Refresh</button>
            </div>
          </div>
          <div style={{marginTop:8, borderTop:'1px solid rgba(255,255,255,.08)'}}>
            <div style={{display:'grid',gridTemplateColumns:'160px 1fr 120px 120px 180px',gap:8,padding:'8px 0',opacity:.75,fontSize:12}}>
              <div>When</div><div>Action</div><div>Status</div><div>By</div><div>Controls</div>
            </div>
            {filteredActions.length===0 ? (
              <div style={{opacity:.75}}>No actions yet.</div>
            ) : filteredActions.map(a=> (
              <div key={a.id} style={{display:'grid',gridTemplateColumns:'160px 1fr 120px 120px 180px',gap:8,padding:'8px 0',borderTop:'1px solid rgba(255,255,255,.06)'}}>
                <div>{a.created_at ? new Date(Number(a.created_at)*1000).toLocaleString() : '—'}</div>
                <div style={{whiteSpace:'pre-wrap'}}>{a.summary || a.type || JSON.stringify(a.params||{})}</div>
                <div>{a.status || 'proposed'}</div>
                <div>{a.actor || 'system'}</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {canApprove && String(a.status||'').toLowerCase()==='proposed' && (
                    <button style={s.btn} disabled={busy} onClick={()=>approveOne(a.id)}>Approve</button>
                  )}
                  {canApprove && String(a.status||'').toLowerCase()==='approved' && (
                    <button style={s.btn} disabled={busy} onClick={()=>executeOne(a.id)}>Execute</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {toast && (
        <div style={{position:'fixed',bottom:20,left:'50%',transform:'translateX(-50%)',padding:'8px 12px',border:'1px solid rgba(255,255,255,.2)',background:'rgba(0,0,0,.7)',borderRadius:8,zIndex:1000}}>
          {toast}
        </div>
      )}
    </div>
  );
}
// Wrap Dashboard to inject onboarding widget without touching original Dashboard implementation
// Reusable collapsible section with localStorage persistence
function CollapsibleSection({ id, title, defaultCollapsed=false, children }) {
  const key = `cgpc:collapse:${id}`;
  const [collapsed, setCollapsed] = React.useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v ? v === '1' : defaultCollapsed;
    } catch {
      return defaultCollapsed;
    }
  });
  React.useEffect(() => {
    try { localStorage.setItem(key, collapsed ? '1' : '0'); } catch {}
  }, [collapsed]);

  return (
    <div style={{border:'1px solid rgba(255,255,255,.12)', borderRadius:12, background:'rgba(255,255,255,.04)', margin:'12px 0'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,padding:'10px 12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button
            onClick={() => setCollapsed(x => !x)}
            aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            style={{
              width:28,height:28,display:'inline-flex',alignItems:'center',justifyContent:'center',
              borderRadius:8,border:'1px solid rgba(255,255,255,.18)',background:'transparent',
              cursor:'pointer',color:'inherit'
            }}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          {/* Replace h2 text title with logo if matches brand title */}
          {title === "Cyber Guard Pro" || title === "CyberGuard Pro" ? (
            <img src="/brand/logo.png" alt="CyberGuard Pro" style={{height:54,width:"auto",display:"block",objectFit:"contain"}} />
          ) : (
            <h2 style={{margin:0,fontSize:16}}>{title}</h2>
          )}
        </div>
        <div style={{opacity:.7,fontSize:12}}>{collapsed ? 'Show' : 'Hide'}</div>
      </div>
      {!collapsed && (
        <div style={{padding:'0 12px 12px 12px'}}>
          {children}
        </div>
      )}
    </div>
  );
}
function LiveEmailScan(){
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [selected, setSelected] = React.useState(null);

  async function load(){
    setLoading(true); setErr("");
    try{
      const token = (typeof localStorage!=="undefined" && localStorage.getItem("token")) || "";
      const API_BASE = (typeof globalThis !== 'undefined' && globalThis.API_BASE)
  ? globalThis.API_BASE
  : ((typeof window !== 'undefined' && window.location.hostname.includes('onrender.com'))
      ? 'https://cyberguard-pro-cloud.onrender.com/api'
      : '/api');
      const r = await fetch(`${API_BASE}/alerts/export?days=1&limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include'
      });
      const text = await r.text();
      let j;
      try { j = JSON.parse(text); }
      catch { throw new Error(text || "Invalid response"); }
      if(!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`);

      const list = Array.isArray(j.alerts) ? j.alerts : [];
      list.sort((a,b)=> Number(b.created_at||0) - Number(a.created_at||0));
      setItems(list);
    }catch(e){
      setErr(e?.message || String(e));
    }finally{
      setLoading(false);
    }
  }

  React.useEffect(()=>{ load(); },[]);
  React.useEffect(()=>{ const t = setInterval(load, 15000); return ()=>clearInterval(t); },[]);

  function riskFromScore(sc){
    const n = Number(sc);
    if (!isFinite(n)) return { label:'Unknown', color:'#9ca3af', bg:'rgba(156,163,175,.15)' };
    if (n >= 80) return { label:'Critical', color:'#fecaca', bg:'rgba(239,68,68,.15)' };
    if (n >= 60) return { label:'High',     color:'#fcd34d', bg:'rgba(245,158,11,.15)' };
    if (n >= 30) return { label:'Medium',   color:'#93c5fd', bg:'rgba(59,130,246,.15)' };
    return { label:'Low',      color:'#86efac', bg:'rgba(34,197,94,.15)' };
  }
  function src(a){
    const v=String(a?.evt_type||a?.type||a?.source||"").toLowerCase();
    if(v.includes("dns")) return "DNS";
    if(v.includes("edr")||v.includes("endpoint")) return "EDR";
    if(v.includes("cloud")||v.includes("aws")||v.includes("azure")||v.includes("gcp")) return "Cloud";
    return (a?.from || a?.from_addr) ? "Email" : "—";
  }
  const s = {
    wrap:{marginTop:12, padding:12, border:'1px solid rgba(255,255,255,.12)', borderRadius:12, background:'rgba(255,255,255,.04)'},
    head:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8},
    grid:{display:'grid',gridTemplateColumns:'160px 120px 1fr 140px',gap:10,alignItems:'center'},
    pill:(c,b)=>({fontSize:12,padding:'2px 8px',borderRadius:999,border:`1px solid ${c}`,background:b,color:c,display:'inline-block'})
  };
  const scanCss = `
  /* Futuristic left-to-right scanner bar */
  @keyframes sweepX { from{ transform: translateX(-30%);} to{ transform: translateX(130%);} }
  @keyframes glowPulse { 0%{opacity:.35} 50%{opacity:.95} 100%{opacity:.35} }
  .scan-rail{
    position:relative;
    height:18px;
    flex:1;
    border-radius:999px;
    background: linear-gradient(90deg, rgba(37,161,255,.08), rgba(123,216,143,.08));
    border:1px solid rgba(255,255,255,.12);
    overflow:hidden;
    box-shadow:
      inset 0 0 14px rgba(37,161,255,.25),
      0 0 24px rgba(123,216,143,.2);
  }
  .scan-rail .grid{
    position:absolute; inset:0;
    background-image:
      repeating-linear-gradient(90deg, rgba(255,255,255,.06) 0 1px, transparent 1px 50px);
    opacity:.25;
    mix-blend-mode:screen;
    pointer-events:none;
  }
  .scan-rail .sweep{
    position:absolute; inset:-20% -40%;
    background: linear-gradient(90deg,
      rgba(37,161,255,0) 0%,
      rgba(37,161,255,.6) 45%,
      rgba(123,216,143,.7) 55%,
      rgba(123,216,143,0) 100%);
    filter: blur(6px);
    animation: sweepX 2.6s linear infinite;
    pointer-events:none;
  }
  .scan-rail .glow{
    position:absolute; inset:0;
    background: radial-gradient(ellipse at center, rgba(37,161,255,.35), rgba(37,161,255,0) 60%);
    animation: glowPulse 3s ease-in-out infinite;
    pointer-events:none;
  }
  `;

  return (
    <div style={s.wrap} aria-label="Live Email Scan">
      <div style={s.head}>
        <div style={{fontWeight:700}}>Live Email Scan</div>
        <div style={{display:'flex',alignItems:'center',gap:10, flex:1}}>
          <style>{scanCss}</style>
          <div className="scan-rail" aria-hidden="true" style={{flex:1, minWidth:220}}>
            <div className="grid"></div>
            <div className="glow"></div>
            <div className="sweep"></div>
          </div>
          <div style={{opacity:.8,fontSize:12, whiteSpace:'nowrap'}}>
            {loading? 'Refreshing…' : `Scanned last 24h: ${items.length}`}
          </div>
        </div>
      </div>

      {err && <div style={{padding:'8px 10px',border:'1px solid #ff7a7a88',background:'#ff7a7a22',borderRadius:8,marginBottom:8}}>Error: {err}</div>}

      <div style={{borderTop:'1px solid rgba(255,255,255,.08)'}}>
        <div style={{...s.grid, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,.08)', fontSize:12, opacity:.75}}>
          <div>When</div><div>Source</div><div>Subject / From</div><div>Threat</div>
        </div>

        {(items.slice(0, 12)).map(a=>{
          const when = a?.created_at ? new Date(Number(a.created_at)*1000).toLocaleString() : '—';
          const risk = (a.score!=null) ? riskFromScore(a.score) : null;
          return (
            <div key={a.id} style={s.grid} onClick={()=>setSelected(a)} title="Open details">
              <div style={{opacity:.85}}>{when}</div>
              <div>{src(a)}</div>
              <div style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                <b>{a.subject || '(no subject)'}</b>
                <span style={{opacity:.7}}> — {a.from || a.from_addr || '—'}</span>
              </div>
              <div>
                {risk ? <span style={s.pill(risk.color, risk.bg)}>{risk.label} • {a.score}</span> : '—'}
              </div>
            </div>
          );
        })}
        {(!loading && items.length===0) && (
          <div style={{padding:'8px 0'}}>
            <EmptyStateFx
              title="No messages scanned yet"
              subtitle="Connect email and give it a moment—new messages will appear as they arrive."
              actionHref="/integrations"
              actionLabel="Connect email"
            />
          </div>
        )}
      </div>

      <div style={{marginTop:10}}>
        <a href="/alerts" style={{fontSize:12}}>Open full Alerts →</a>
      </div>

      {selected && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',backdropFilter:'blur(4px)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}}>
          <div style={{width:'min(840px,94vw)',maxHeight:'86vh',overflow:'auto',background:'linear-gradient(180deg, rgba(28,30,38,.96), rgba(22,24,30,.94))',border:'1px solid rgba(255,255,255,.12)',borderRadius:12,padding:16,boxShadow:'0 18px 48px rgba(0,0,0,.35)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <div style={{fontWeight:700}}>Scanned email details</div>
              <button onClick={()=>setSelected(null)} style={{padding:'6px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'transparent',color:'#e6e9ef',cursor:'pointer'}}>Close</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 240px',gap:12,alignItems:'start'}}>
              <div>
                <div style={{fontSize:14,opacity:.8,marginBottom:4}}>Subject</div>
                <div style={{fontWeight:700,marginBottom:10}}>{selected.subject || '—'}</div>
                <div style={{fontSize:14,opacity:.8,marginBottom:4}}>Preview</div>
                <pre style={{whiteSpace:'pre-wrap',padding:10,border:'1px solid rgba(255,255,255,.12)',borderRadius:10,background:'rgba(255,255,255,.05)'}}>{selected.preview || '—'}</pre>
              </div>
              <div>
                <div style={{padding:12,border:'1px solid rgba(255,255,255,.12)',borderRadius:10,background:'rgba(255,255,255,.04)'}}>
                  <div style={{fontSize:13,opacity:.8,marginBottom:6}}>Meta</div>
                  <div style={{fontSize:13,display:'grid',gap:4}}>
                    <div><b>From:</b> {selected.from || selected.from_addr || '—'}</div>
                    <div><b>Source:</b> {src(selected)}</div>
                    <div><b>Received:</b> {selected.created_at ? new Date(Number(selected.created_at)*1000).toLocaleString() : '—'}</div>
                    {selected.score!=null ? (()=>{const r=riskFromScore(selected.score); return <div><b>Threat:</b> {r.label} <span style={{opacity:.8}}>(score {selected.score})</span></div>;})() : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// --- Safe fallbacks for optional UI blocks used by the enhanced dashboard ---
// If these components are not bundled in this build, provide lightweight stand‑ins
// so DashboardWithOnboarding can still render a full page instead of falling back
// to the minimal Dashboard placeholder.
try { if (typeof CollapsibleSection === 'undefined') {
  // eslint-disable-next-line no-var
  var CollapsibleSection = function CollapsibleSectionFallback({ id, title, children }){
    return (
      <div style={{ margin: '12px 0' }}>
        {title ? <div style={{ opacity: .85, fontWeight: 700, marginBottom: 6 }}>{title}</div> : null}
        <div>{children}</div>
      </div>
    );
  };
} } catch(_e) {}
try { if (typeof OnboardingChecklist === 'undefined') {
  // eslint-disable-next-line no-var
  var OnboardingChecklist = function OnboardingChecklistFallback(){
    return <div style={{ opacity: .8 }}>Welcome! Connect an email provider to get started.</div>;
  };
} } catch(_e) {}
try { if (typeof OnboardingTips === 'undefined') {
  // eslint-disable-next-line no-var
  var OnboardingTips = function OnboardingTipsFallback(){
    return <div style={{ opacity: .8 }}>Tips will appear here when the full module is available.</div>;
  };
} } catch(_e) {}
try { if (typeof LiveEmailScan === 'undefined') {
  // eslint-disable-next-line no-var
  var LiveEmailScan = function LiveEmailScanFallback(){ return null; };
} } catch(_e) {}
try { if (typeof LiveStatusTicker === 'undefined') {
  // eslint-disable-next-line no-var
  var LiveStatusTicker = function LiveStatusTickerFallback(){ return null; };
} } catch(_e) {}
// --- Dynamic API base (prod -> Render backend; dev -> local /api) ---
const __CG_DYNAMIC_API_BASE =
  (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com'))
    ? 'https://cyberguard-pro-cloud.onrender.com/api'
    : '/api';
// expose globally so every component can reuse the same value
try { globalThis.API_BASE = globalThis.API_BASE || __CG_DYNAMIC_API_BASE; } catch (_e) {}
// DashboardWithOnboarding: wrapper for Dashboard with onboarding/tips sections
function DashboardWithOnboarding(props){
  return (
    <div style={{padding:16}}>
      {/* Onboarding/tips: place Get started first under trial banner */}
      <CollapsibleSection id="onboarding" title="Get started" defaultCollapsed={true}>
        <OnboardingChecklist/>
      </CollapsibleSection>

      { (function(){
          try { if (typeof LiveStatusTicker === 'function') return <LiveStatusTicker inline />; } catch(_){}
          return (
            <div style={{
              position:'relative', margin:'8px 0 12px', zIndex: 1,
              background:'rgba(8,10,14,.9)',
              border:'1px solid rgba(255,255,255,.12)',
              borderRadius:8,
              padding:'6px 10px',
              fontSize:12, opacity:.9
            }}>
              Status: loading…
            </div>
          );
        })() }

      {/* Render existing Dashboard next */}
      <Dashboard {...props} />

      {/* Live Email Scan — static, always visible */}
      <LiveEmailScan/>

      {/* Explanation section remains collapsible */}
      <CollapsibleSection id="explain" title="What am I looking at?" defaultCollapsed={true}>
        <OnboardingTips/>
      </CollapsibleSection>
    </div>
  );
}

function AuthLogin(){
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState('');

  const inp = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,.15)",
    background: "rgba(255,255,255,.06)",
    color: "inherit",
    marginBottom: 10
  };
  const btn = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,.2)",
    background: "rgba(255,255,255,.12)",
    cursor: "pointer"
  };
  const API_BASE = (typeof globalThis !== 'undefined' && globalThis.API_BASE)
  ? globalThis.API_BASE
  : ((typeof window !== 'undefined' && window.location.hostname.includes('onrender.com'))
      ? 'https://cyberguard-pro-cloud.onrender.com/api'
      : '/api');
  // --- TEMP: dev-login helper for troubleshooting auth (removable) ---
  async function devLogin(){
    const API_BASE = (typeof globalThis !== 'undefined' && globalThis.API_BASE)
      ? globalThis.API_BASE
      : ((typeof window !== 'undefined' && window.location.hostname.includes('onrender.com'))
          ? 'https://cyberguard-pro-cloud.onrender.com/api'
          : '/api');
    try{
      // Try both /auth/dev-login and legacy /api/auth/dev-login just in case
      const tryUrls = [
        `${API_BASE.replace(/\/api$/, '')}/auth/dev-login`,
        `${API_BASE}/auth/dev-login`
      ];
      let res = null, text = '';
      for (const u of tryUrls) {
        try {
          res = await fetch(u, { method:'POST', credentials:'include' });
          text = await res.text();
          if (res.ok) break;
        } catch (_) { /* try next */ }
      }
      if (!res) throw new Error('no response');
      let j; try { j = JSON.parse(text); } catch { j = { ok:false, error:text }; }

      // Log full response to help diagnose 500/HTML cases
      try { console.log('[dev-login]', res.status, j || text); } catch {}

      if (!res.ok || !j?.token) throw new Error(j?.error || `HTTP ${res.status}`);

      try { localStorage.setItem('token', j.token); } catch {}
      // quick sanity check that /me works via cookie or header
      try {
        const me1 = await fetch(`${API_BASE}/me`, { credentials:'include' });
        const t2  = await fetch(`${API_BASE}/me`, { headers:{ Authorization:`Bearer ${j.token}` } });
        console.log('[me-cookie]', me1.status, await me1.text());
        console.log('[me-bearer]', t2.status, await t2.text());
      } catch(_e){}
      if (typeof window !== 'undefined') window.location.replace('/');
    }catch(e){
      try { setErr(String(e?.message || e)); } catch(_){}
      try { console.error('[dev-login failed]', e); } catch(_){}
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: '80px auto' }}>
      <h1 style={{ marginBottom: 16 }}>Sign in</h1>
      <form onSubmit={onSubmit}>
        <input style={inp} type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email" />
        <input style={inp} type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Password" />
        {err && <div style={{ color: '#ff7777', marginBottom: 10 }}>{err}</div>}
        <button style={btn} disabled={loading} type="submit">{loading ? 'Signing in…' : 'Save & Continue'}</button>
        <button
          type="button"
          onClick={devLogin}
          style={{ ...btn, marginTop: 8 }}
        >
          Dev login (temp)
        </button>
      </form>
    </div>
  );
}
try { globalThis.AuthLogin = globalThis.AuthLogin || AuthLogin; } catch (_e) {}

function RequireAuth({ children }){
  const [ok, setOk] = React.useState(() => {
    try { return !!(typeof localStorage !== 'undefined' && localStorage.getItem('token')); }
    catch { return false; }
  });

  React.useEffect(() => {
    if (ok) return;
    const API_BASE = (typeof globalThis !== 'undefined' && globalThis.API_BASE)
  ? globalThis.API_BASE
  : ((typeof window !== 'undefined' && window.location.hostname.includes('onrender.com'))
      ? 'https://cyberguard-pro-cloud.onrender.com/api'
      : '/api');
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/me`, { credentials: 'include' });
        if (r.ok) setOk(true);
      } catch { /* ignore */ }
    })();
  }, [ok]);

  if (!ok) return <Navigate to="/login" replace />;
  return children;
}

/* --- RequireAuth: expose globally to satisfy any stale chunks and prevent ReferenceError --- */
try { globalThis.RequireAuth = globalThis.RequireAuth || RequireAuth; } catch (_e) { /* no-op */ }

// --- Hard alias to catch any stale <RequireAuthSafe> references from older chunks ---
// Ensure a real identifier exists in this module (prevents ReferenceError in strict ESM)
var RequireAuthSafe = function RequireAuthSafe(props){ 
  return React.createElement(RequireAuth, props); 
};
try { globalThis.RequireAuthSafe = globalThis.RequireAuthSafe || RequireAuthSafe; } catch (_e) {}

  async function refresh(){
    try{
      const [alerts, integ, actions] = await Promise.all([
        api('/alerts/export?days=1&limit=50'),
        api('/integrations/status'),
        api('/ai/actions').catch(()=>({items:[]}))
      ]);

      // Alerts summary
      let aMsgs = [];
      if (alerts && Array.isArray(alerts.alerts)){
        const list = alerts.alerts;
        const today = list.length;
        const high = list.filter(a=> Number(a?.score||0) >= 60 && Number(a?.score||0) < 80).length;
        const crit = list.filter(a=> Number(a?.score||0) >= 80).length;
        aMsgs.push(`Today: ${today} alerts` + (high||crit? ` (${high} high, ${crit} critical)` : ''));
      }

      // Integrations summary
      let iMsgs = [];
      const items = Array.isArray(integ?.items) ? integ.items : [];
      if (items.length){
        const ok = items.filter(x=> x.status==='connected' || x.status==='ok').length;
        const pend = items.filter(x=> x.status==='pending').length;
        const err = items.filter(x=> x.status==='error' || (x.last_error && String(x.last_error).trim())).length;
        iMsgs.push(`Integrations: ${ok} ok` + (pend? `, ${pend} pending`:'') + (err? `, ${err} error`:''));
      } else {
        iMsgs.push('No integrations connected — set up Email, DNS, EDR');
      }

      // AI actions summary (best-effort)
      let aiMsgs = [];
      const acts = Array.isArray(actions?.items) ? actions.items : [];
      if (acts.length){
        const proposed = acts.filter(a=> String(a.status||'').toLowerCase()==='proposed').length;
        const approved = acts.filter(a=> String(a.status||'').toLowerCase()==='approved').length;
        const executed = acts.filter(a=> String(a.status||'').toLowerCase()==='executed').length;
        aiMsgs.push(`AI: ${proposed} proposed, ${approved} approved, ${executed} executed`);
      }

      const next = [ ...aMsgs, ...iMsgs, ...aiMsgs ];
      setMsgs(next.length ? next : ['Status: no data yet']);
    }catch(_e){ setMsgs(['Status: no data yet']); }
  }

  React.useEffect(()=>{ refresh(); const t=setInterval(refresh, 30000); return ()=>clearInterval(t); },[]);

  const css = `
    @keyframes tickerScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @media (prefers-reduced-motion: reduce) { .ticker-track { animation: none !important; } }
  `;

  const bar = inline ? {
    position:'relative', margin:'8px 0 12px', zIndex: 1,
    background:'rgba(8,10,14,.9)',
    border:'1px solid rgba(255,255,255,.12)',
    borderRadius:8,
    padding:'6px 10px',
  } : {
    position:'fixed', left:0, right:0, bottom:0, zIndex: 1200,
    background:'rgba(8,10,14,.9)',
    borderTop:'1px solid rgba(255,255,255,.12)',
    backdropFilter:'blur(6px)',
    padding:'6px 10px',
  };

  const chip = {
    display:'inline-flex', alignItems:'center', gap:6,
    border:'1px solid rgba(255,255,255,.18)', borderRadius:999,
    padding:'2px 8px', marginRight:10,
    background:'rgba(255,255,255,.04)', fontSize:12
  };

  const content = msgs.join(' • ');
  const dup = `${content}  •  ${content}`;

  return (
    <div role="region" aria-label="Live status ticker" style={bar}>
      <style>{css}</style>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{...chip, fontWeight:700}}>Status</span>
        <div style={{position:'relative', overflow:'hidden', flex:1, height:22}}>
          <div className="ticker-track" style={{
            whiteSpace:'nowrap', display:'inline-block',
            willChange:'transform',
            animation:'tickerScroll 40s linear infinite'
          }}>
            {dup}
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple layout wrapper to avoid runtime ReferenceError when Layout is not defined.
// Safe layout wrapper: uses global Layout if present, otherwise falls back to a simple padded div.
function LayoutSafe({ children }) {
  try {
    if (typeof Layout === 'function') {
      return <Layout>{children}</Layout>;
    }
  } catch (_e) { /* ignore and fall back */ }
  return <div style={{ padding: 16 }}>{children}</div>;
}

// Guard to avoid runtime ReferenceError if AuthLogin isn't defined yet
function LoginGuard(){
  try {
    if (typeof AuthLogin === 'function') return <AuthLogin/>;
  } catch (_e) { /* ignore */ }
  // Minimal inline fallback login (never blocks build/runtime)
  const [email,setEmail] = React.useState("");
  const [password,setPassword] = React.useState("");
  const [err,setErr] = React.useState("");
  const [busy,setBusy] = React.useState(false);
  const API_BASE = (typeof globalThis !== 'undefined' && globalThis.API_BASE)
  ? globalThis.API_BASE
  : ((typeof window !== 'undefined' && window.location.hostname.includes('onrender.com'))
      ? 'https://cyberguard-pro-cloud.onrender.com/api'
      : '/api');
  async function submit(e){
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      // 1) Try normal login first
      const resp = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      const raw = await resp.text();
      let j; try { j = JSON.parse(raw); } catch { j = {}; }

      if (resp.ok && j && j.token) {
        try { localStorage.setItem('token', j.token); } catch {}
        if (typeof window !== 'undefined') window.location.replace('/');
        return;
      }

      // 2) Fallback: dev-login (temporary) — handles 500s from /auth/login
      // Try both without and with '/api' to be robust across environments
      const tryUrls = [
        `${API_BASE.replace(/\/api$/, '')}/auth/dev-login`,
        `${API_BASE}/auth/dev-login`
      ];
      let okToken = null, lastErr = null;
      for (const u of tryUrls) {
        try {
          const r2 = await fetch(u, { method:'POST', credentials:'include' });
          const t2 = await r2.text();
          let j2; try { j2 = JSON.parse(t2); } catch { j2 = {}; }
          if (r2.ok && j2 && j2.token) { okToken = j2.token; break; }
          lastErr = j2?.error || `HTTP ${r2.status}`;
        } catch (e2) {
          lastErr = String(e2?.message || e2);
        }
      }
      if (okToken) {
        try { localStorage.setItem('token', okToken); } catch {}
        if (typeof window !== 'undefined') window.location.replace('/');
        return;
      }

      // 3) Bubble a clear error (include server body if available)
      const msg = j?.error || lastErr || (raw ? raw.slice(0, 200) : `HTTP ${resp.status}`);
      throw new Error(msg || 'login failed');
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{maxWidth:380,margin:'80px auto'}}>
      <h1 style={{marginBottom:16}}>Sign in</h1>
      <form onSubmit={submit}>
        <input style={{width:'100%',marginBottom:10}} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input style={{width:'100%',marginBottom:10}} type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
        {err && <div style={{color:'#ff7777',marginBottom:10}}>{err}</div>}
        <button type="submit" disabled={busy} style={{width:'100%'}}>{busy? 'Signing in…':'Sign in'}</button>
      </form>
    </div>
  );
}

// SafePolicy: fall back to a minimal placeholder if real Policy component isn't available
function PolicySafe(props){
  try {
    if (typeof Policy === 'function') {
      return <Policy {...props} />;
    }
  } catch (_e) { /* ignore and fall through */ }
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Policy</h1>
      <div style={{ opacity: .8 }}>The Policy module isn't available in this build. You can continue using the rest of the app.</div>
    </div>
  );
}
// Expose a safe Policy for any stale chunks that reference window.Policy
try {
  if (typeof globalThis !== 'undefined' && typeof globalThis.Policy === 'undefined') {
    globalThis.Policy = PolicySafe;
  }
} catch (_e) { /* no-op */ }
// SafeAccount: fall back to a minimal placeholder if real Account component isn't available
function AccountSafe(props){
  try {
    if (typeof Account === 'function') {
      return <Account {...props} />;
    }
  } catch (_e) { /* ignore and fall through */ }
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Account</h1>
      <div style={{ opacity: .8 }}>The Account page isn't available in this build. You can continue using the rest of the app.</div>
    </div>
  );
}
// Expose a safe Account for any stale chunks that reference window.Account
try {
  if (typeof globalThis !== 'undefined' && typeof globalThis.Account === 'undefined') {
    globalThis.Account = AccountSafe;
  }
} catch (_e) { /* no-op */ }
// SafeAlerts: fall back to a minimal placeholder if real AlertsPage component isn't available

function AlertsPageSafe(props){
  try {
    if (typeof AlertsPage === 'function') {
      return <AlertsPage {...props} />;
    }
  } catch (_e) { /* ignore and fall through */ }
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Alerts</h1>
      <div style={{ opacity: .8 }}>The Alerts page isn't available in this build. You can continue using the rest of the app.</div>
    </div>
  );
}

// Expose a safe AlertsPage for any stale chunks that reference window.AlertsPage
try {
  if (typeof globalThis !== 'undefined' && typeof globalThis.AlertsPage === 'undefined') {
    globalThis.AlertsPage = AlertsPageSafe;
  }
} catch (_e) { /* no-op */ }

// SafeRegister: wrapper for Register page (global if present, else lazy-load, else placeholder)
function RegisterSafe(props) {
  try {
    if (typeof Register === "function") {
      return <Register {...props} />;
    }
  } catch (_e) { /* ignore */ }

  const Lazy = React.useMemo(
    () =>
      React.lazy(() =>
        import(/* @vite-ignore */ './pages/Register.jsx')
          .then(mod => ({
            default:
              mod?.default ||
              mod?.Register ||
              ((p) => (
                <div style={{ padding: 16 }}>
                  <h1 style={{ marginTop: 0 }}>Register</h1>
                  <div style={{ opacity: 0.8 }}>
                    The Register page isn’t available in this build. You can continue using the rest of the app.
                  </div>
                </div>
              )),
          }))
          .catch(() => ({
            default: (p) => (
              <div style={{ padding: 16 }}>
                <h1 style={{ marginTop: 0 }}>Register</h1>
                <div style={{ opacity: 0.8 }}>
                  The Register page isn’t available in this build. You can continue using the rest of the app.
                </div>
              </div>
            ),
          }))
      ),
    []
  );

  return (
    <React.Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <Lazy {...props} />
    </React.Suspense>
  );
}

// Expose a safe Register for any stale chunks that reference window.Register
try {
  if (typeof globalThis !== 'undefined' && typeof globalThis.Register === 'undefined') {
    globalThis.Register = RegisterSafe;
  }
} catch (_e) { /* no-op */ }

// SafeAdmin: try global Admin; else lazy-load from pages/Admin.jsx; else show placeholder
function AdminSafe(props){
  // 1) If a global Admin is available (defined earlier), use it
  try {
    if (typeof Admin === 'function') {
      return <Admin {...props} />;
    }
  } catch (_e) { /* fall through to lazy import */ }

  // 2) Lazy import the Admin page module if it exists on disk
  const [{ Comp }, setState] = React.useState({ Comp: null });
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mod = await import('./pages/Admin.jsx');
        if (!alive) return;
        const C = mod?.default || mod?.Admin || null;
        if (C) setState({ Comp: C });
      } catch (_err) {
        // ignore — we'll render the placeholder below
      }
    })();
    return () => { alive = false; };
  }, []);

  if (Comp) return <Comp {...props} />;

  // 3) Minimal placeholder so the route never crashes
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Admin</h1>
      <div style={{ opacity: .8 }}>The Admin page is loading or not available in this build.</div>
    </div>
  );
}

// SafeAdminConsole: use global AdminConsolePage if present; else lazy-load; else show placeholder
function AdminConsolePageSafe(props){
  // 1) If a global AdminConsolePage is available (defined elsewhere), use it
  try {
    if (typeof AdminConsolePage === 'function') {
      return <AdminConsolePage {...props} />;
    }
  } catch (_e) { /* ignore and fall through */ }

  // 2) Otherwise, render a lightweight placeholder so the route never breaks the build
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Admin Console</h1>
      <div style={{ opacity: .8 }}>
        The Admin Console module isn’t available in this build. You can continue using the rest of the app.
      </div>
    </div>
  );
}
// Expose a safe Admin for any stale chunks that reference window.Admin
try {
  if (typeof globalThis !== 'undefined' && typeof globalThis.Admin === 'undefined') {
    globalThis.Admin = AdminSafe;
  }
} catch (_e) { /* no-op */ }
// SafeAutonomy: fall back to a minimal placeholder if real AutonomyPage isn't available
function AutonomySafe(props){
  try {
    if (typeof AutonomyPage === 'function') {
      return <AutonomyPage {...props} />;
    }
  } catch (_e) { /* ignore and fall through */ }
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Autonomy (beta)</h1>
      <div style={{ opacity: .8 }}>The Autonomy page isn't available in this build. You can continue using the rest of the app.</div>
    </div>
  );
}
// Expose a safe AutonomyPage for any stale chunks that reference window.AutonomyPage
try {
  if (typeof globalThis !== 'undefined' && typeof globalThis.AutonomyPage === 'undefined') {
    globalThis.AutonomyPage = AutonomySafe;
  }
} catch (_e) { /* no-op */ }
// --- Ensure a Dashboard symbol exists so routes can render a real dashboard ---
// We alias Dashboard to the enhanced DashboardWithOnboarding so both names exist.
function Dashboard(props){
  // Prefer the enhanced dashboard if it exists
  try {
    if (typeof DashboardWithOnboarding === 'function') {
      return <DashboardWithOnboarding {...props} />;
    }
  } catch (_e) { /* fall through to lightweight fallback */ }

  // Lightweight self-contained fallback so the page isn't stuck on "Loading…"
  const [me, setMe] = React.useState(null);
  const [err, setErr] = React.useState('');

  const API_BASE = (typeof globalThis !== 'undefined' && globalThis.API_BASE)
  ? globalThis.API_BASE
  : ((typeof window !== 'undefined' && window.location.hostname.includes('onrender.com'))
      ? 'https://cyberguard-pro-cloud.onrender.com/api'
      : '/api');

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/me`, { credentials: 'include' });
        const j = await r.json().catch(()=>({}));
        if (!alive) return;
        if (r.ok) setMe(j); else setErr(j?.error || `HTTP ${r.status}`);
      } catch(e){
        if (alive) setErr(String(e?.message || e));
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Dashboard</h2>
      {err && (
        <div style={{ padding:'8px 10px', border:'1px solid #ff7a7a88', background:'#ff7a7a22', borderRadius:8, marginBottom:10 }}>
          Error: {err}
        </div>
      )}
      {!me ? (
        <div style={{ opacity: .8 }}>Loading profile…</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ padding: '10px 12px', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, background: 'rgba(255,255,255,.04)' }}>
            Signed in as <b>{me.email || me.user?.email || 'you'}</b> — plan: <code>{String(me.effective_plan || me.plan_actual || me.plan || 'unknown')}</code>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            <a href="/alerts" style={{ padding:12, border:'1px solid rgba(255,255,255,.12)', borderRadius:10, display:'block' }}>Open Alerts</a>
            <a href="/integrations" style={{ padding:12, border:'1px solid rgba(255,255,255,.12)', borderRadius:10, display:'block' }}>Integrations</a>
            <a href="/account" style={{ padding:12, border:'1px solid rgba(255,255,255,.12)', borderRadius:10, display:'block' }}>Account</a>
          </div>
        </div>
      )}
    </div>
  );
}

// Expose to globalThis to avoid any bundler scoping surprises when other guards check presence
try {
  globalThis.Dashboard = Dashboard;
  // Also expose the wrapper in case any guard checks it by name on window/globalThis
  if (typeof DashboardWithOnboarding === 'function') {
    globalThis.DashboardWithOnboarding = DashboardWithOnboarding;
  }
} catch (_e) { /* no-op */ }
// SafeDashboard: fall back to Dashboard or a minimal placeholder if needed
function SafeDashboard(props){
  // Try to render the real dashboard first
  try {
    if (typeof DashboardWithOnboarding === 'function') {
      return <DashboardWithOnboarding {...props} />;
    }
  } catch (_e) { /* ignore */ }
  try {
    if (typeof Dashboard === 'function') {
      return <Dashboard {...props} />;
    }
  } catch (_e) { /* ignore */ }

  // If neither dashboard exists, show a diagnostic panel instead of an empty "Loading…"
  const [diag, setDiag] = React.useState({ token:false, meOk:null, plan:null, error:null });

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = (()=>{ try { return !!localStorage.getItem('token'); } catch { return false; } })();
        let meOk = null, plan = null;
        try {
          const API_BASE = (typeof globalThis !== 'undefined' && globalThis.API_BASE)
  ? globalThis.API_BASE
  : ((typeof window !== 'undefined' && window.location.hostname.includes('onrender.com'))
      ? 'https://cyberguard-pro-cloud.onrender.com/api'
      : '/api');
          const r = await fetch(`${API_BASE}/me`, { credentials: 'include' });
          meOk = r.ok;
          if (r.ok) {
            const j = await r.json().catch(()=>({}));
            plan = j?.effective_plan || j?.plan_actual || j?.plan || null;
          }
        } catch (e) {
          meOk = false;
        }
        if (alive) setDiag({ token, meOk, plan, error:null });
      } catch (e) {
        if (alive) setDiag({ token:false, meOk:false, plan:null, error:String(e?.message||e) });
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Dashboard loading…</h2>
      <p style={{ opacity: .8 }}>We couldn't find a Dashboard component in this build. The app will still work; below is a quick diagnostic to help us fix the route without a blank screen.</p>
      <ul style={{ lineHeight: 1.6 }}>
        <li>DashboardWithOnboarding: <code>{(typeof DashboardWithOnboarding === 'function') ? 'present' : 'missing'}</code></li>
        <li>Dashboard: <code>{(typeof Dashboard === 'function') ? 'present' : 'missing'}</code></li>
        <li>Token in localStorage: <code>{diag.token ? 'present' : 'missing'}</code></li>
        <li>/me via cookie: <code>{diag.meOk === null ? 'checking…' : diag.meOk ? '200 OK' : '401/failed'}</code></li>
        {diag.plan ? <li>Plan detected: <code>{String(diag.plan)}</code></li> : null}
        {diag.error ? <li>Error: <code>{String(diag.error)}</code></li> : null}
      </ul>
      <div style={{ display:'flex', gap:8, marginTop:8 }}>
        <button onClick={() => window.location.reload()} style={{ padding:'8px 12px' }}>Reload</button>
        <a href="/login" style={{ padding:'8px 12px', border:'1px solid rgba(255,255,255,.2)', borderRadius:8 }}>Go to login</a>
      </div>
    </div>
  );
}
// --- SafeErrorBoundary: always shows a visible error box instead of failing silently ---
class SafeErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { err: null, info: null }; }
  componentDidCatch(error, info){
    try { console.error('[SafeErrorBoundary]', error, info); } catch {}
    this.setState({ err: error, info });
  }
  render(){
    if (this.state && this.state.err) {
      const msg = String(this.state.err?.message || this.state.err || 'Unknown error');
      return (
        <div style={{padding:16, margin:16, border:'1px solid #ff7a7a88', background:'#ff7a7a22', borderRadius:10}}>
          <div style={{fontWeight:700, marginBottom:6}}>App error</div>
          <div style={{whiteSpace:'pre-wrap'}}>{msg}</div>
          <div style={{opacity:.8, marginTop:6, fontSize:12}}>
            If this persists, check the console for a stack trace logged by SafeErrorBoundary.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
/* --- SAFETY GUARD: if RequireAuth identifier is missing at runtime, provide a permissive fallback --- */
if (typeof RequireAuth === 'undefined') {
  // eslint-disable-next-line no-var
  var RequireAuth = function RequireAuth(props){ return props && props.children; };
  try { globalThis.RequireAuth = globalThis.RequireAuth || RequireAuth; } catch (_e) {}
}
function App(){
  return (
    <SafeErrorBoundary>
      <LayoutSafe>
        <>
          <Routes>
            <Route path="/login" element={<Login/>}/>
            <Route path="/register" element={<RegisterSafe/>}/>

            <Route path="/" element={<RequireAuth><Dashboard api={API}/></RequireAuth>} />
            <Route path="/dashboard" element={<RequireAuth><Dashboard api={API}/></RequireAuth>} />
            <Route path="/integrations" element={<RequireAuth><Integrations api={API}/></RequireAuth>} />
            <Route path="/policy" element={<RequireAuth><PolicySafe api={API}/></RequireAuth>} />
            <Route path="/pricing" element={<RequireAuth><PricingPage/></RequireAuth>} />
            <Route path="/account" element={<RequireAuth><AccountSafe api={API}/></RequireAuth>} />
            <Route path="/alerts" element={<RequireAuth><AlertsPageSafe/></RequireAuth>} />
            <Route path="/autonomy" element={<RequireAuth><AutonomySafe/></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth><AdminSafe api={API}/></RequireAuth>} />

            <Route path="/admin/console" element={<Navigate to="/admin/console/trial" replace />}/>
            <Route path="/admin/console/trial" element={<RequireAuth><AdminConsolePageSafe page="trial" /></RequireAuth>} />
            <Route path="/admin/console/retention" element={<RequireAuth><AdminConsolePageSafe page="retention" /></RequireAuth>} />
            <Route path="/admin/console/audit" element={<RequireAuth><AdminConsolePageSafe page="audit" /></RequireAuth>} />
            <Route path="/test" element={<RequireAuth><TestEvents api={API}/></RequireAuth>} />
            <Route path="/support" element={<RequireAuth><Support/></RequireAuth>} /> 
            <Route path="*" element={<Navigate to="/" replace />}/>
          </Routes>
        </>
      </LayoutSafe>
    </SafeErrorBoundary>
  );
}

// --- Integrations Wizard UI ---
function LockedTile({ title, reason }) {
  return (
    <div style={{ padding: 16, border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, background: "rgba(255,255,255,.04)", opacity: 0.9 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700 }}>{title || 'Locked feature'}</div>
        <span style={{ fontSize: 12, opacity: .8, border: '1px solid rgba(255,255,255,.18)', borderRadius: 999, padding: '2px 8px' }}>🔒 Locked</span>
      </div>
      {reason && <div style={{ opacity: .85, marginTop: 6 }}>{reason}</div>}
    </div>
  );
}
function Integrations({ api }) {
  // Human-friendly help text for connection statuses (used as hover tooltips)
  function statusHelp(st) {
    const s = String(st || '').toLowerCase();
    if (s === 'connected') return '✅ We are receiving data from this integration.';
    if (s === 'pending')   return '⏳ Waiting for setup to complete or data to arrive.';
    if (s === 'error')     return '❌ Connection failed. Click Connect again or re-authorize.';
    if (s === 'new')       return 'New: not connected yet.';
    return 'Status unknown.';
  }
  const [meState, setMeState] = React.useState(null);
  React.useEffect(()=>{ apiGet('/me').then(setMeState).catch(()=>setMeState(null)); },[]);
  // Listen for global /me-updated events and refresh
  React.useEffect(() => {
    const onUpdated = () => { apiGet('/me').then(setMeState).catch(()=>{}); };
    window.addEventListener('me-updated', onUpdated);
    return () => window.removeEventListener('me-updated', onUpdated);
  }, []);
  // Auto-refresh at trial end (in case plan changes)
  React.useEffect(() => {
    let timer = null;
    try {
      const t = meState?.trial || null;
      const planActual = String(meState?.plan_actual || meState?.plan || '').toLowerCase();
      if (t && t.active && (planActual === 'basic' || planActual === 'pro') && t.ends_at) {
        const endMs = typeof t.ends_at === 'string' && t.ends_at.includes('T')
          ? new Date(t.ends_at).getTime()
          : Number(t.ends_at) * 1000;
        const delta = Math.max(0, endMs - Date.now()) + 1500;
        timer = setTimeout(() => {
          apiGet('/me').then(setMeState).catch(()=>{});
          window.dispatchEvent(new Event('me-updated'));
        }, delta);
      }
    } catch (_e) {}
    return () => { if (timer) try { clearTimeout(timer); } catch(_e){} };
  }, [meState?.trial?.ends_at, meState?.trial?.active, meState?.plan_actual, meState?.plan]);
  const caps = planCapabilities(meState?.effective_plan || meState?.plan_actual || meState?.plan || 'trial', meState);
  // --- Helper functions for email provider normalization and OAuth ---
  function normEmailProvider(p){
    p = (p||'').toLowerCase();
    if(p==='o365'||p==='m365'||p==='office365') return 'm365';
    if(p==='gmail'||p==='google'||p==='gworkspace'||p==='gws') return 'google';
    if(p==='imap') return 'imap';
    return p;
  }
  function startEmailOAuth(p){
    const n = normEmailProvider(p);
    const tok = (typeof localStorage !== 'undefined' && localStorage.getItem('token')) || '';
    if(n==='m365'){
      window.location.href = `${API_BASE}/auth/m365/start?token=${encodeURIComponent(tok)}`;
      return;
    }
    if(n==='google'){
      window.location.href = `${API_BASE}/auth/google/start?token=${encodeURIComponent(tok)}`;
      return;
    }
  }

  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState({ items: [] });
  const [emailProvider, setEmailProvider] = React.useState('imap');
  const [out, setOut] = React.useState("");
  const [err, setErr] = React.useState("");
  const [toast, setToast] = React.useState("");
  const [edrToken, setEdrToken] = React.useState("");
  const [dnsInfo, setDnsInfo] = React.useState(null);

  // --- Integrations connection status ---
  const [connStatus, setConnStatus] = React.useState(null);
  const [loadingStatus, setLoadingStatus] = React.useState(false);

  async function fetchConnStatus() {
    try {
      setLoadingStatus(true);
      const token = localStorage.getItem('token') || '';
      const r = await fetch(API_BASE + "/integrations/status", {
        headers: { Authorization: "Bearer " + token }
      });
      const j = await r.json();
      if (j.ok) {
        setConnStatus(j.items || []);
        // also keep existing 'status' in sync for tiles that already use it
        setStatus(j || { items: [] });
      }
    } catch (e) {
      console.error("status load failed", e);
    } finally {
      setLoadingStatus(false);
    }
  }

  // --- Email Wizard state ---
  const [wizOpen, setWizOpen] = React.useState(false);
  const [wizStep, setWizStep] = React.useState(0);
  const [wizProvider, setWizProvider] = React.useState('o365');
  const [wizForm, setWizForm] = React.useState({ scope:'all', imapHost:'', imapPort:993, imapUser:'', imapPass:'', imapTLS:true });
  const [wizMsg, setWizMsg] = React.useState('');
  const [wizErr, setWizErr] = React.useState('');

  function openEmailWizard(provider){
    setWizProvider(provider);
    setWizStep(0);
    setWizForm({ scope:'all', imapHost:'', imapPort:993, imapUser:'', imapPass:'', imapTLS:true });
    setWizMsg(''); setWizErr('');
    setWizOpen(true);
  }

  async function wizNext(){
    setWizErr(''); setWizMsg('');
    // Step actions per provider
    if(wizStep===1){
      // Perform connect call on step 2
      if(wizProvider==='imap'){
        await safe(async()=>{
          return await api.post('/integrations/email/connect', { provider:'imap', settings:{
            host: wizForm.imapHost, port: Number(wizForm.imapPort), username: wizForm.imapUser, password: wizForm.imapPass, tls: !!wizForm.imapTLS, scope: wizForm.scope
          }});
        });
        setWizMsg('IMAP connected.');
      } else {
        setWizMsg('Redirecting to provider for sign-in...');
        startEmailOAuth(wizProvider);
        return; // do not advance; user returns via /auth/.../callback
      }
    }
    if(wizStep===2){
      // Test
      await safe(async()=>{
        return await api.post('/integrations/email/test', { provider: wizProvider });
      });
      setWizMsg('Test message queued.');
    }
    setWizStep(s=>Math.min(3, s+1));
  }

  function wizBack(){ setWizErr(''); setWizMsg(''); setWizStep(s=>Math.max(0, s-1)); }
  function wizClose(){ setWizOpen(false); refresh(); }

  const styles = {
    card: { padding: 16, border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, background: "rgba(255,255,255,.04)" },
    ghost: { padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: "#e6e9ef", cursor: "pointer" },
    modal:{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000, backdropFilter:'blur(6px)' },
    sheet:{ width:'min(760px, 94vw)', background:'linear-gradient(180deg, rgba(28,30,38,.92), rgba(22,24,30,.9))', border:'1px solid rgba(255,255,255,.12)', borderRadius:16, padding:18, boxShadow:'0 18px 48px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.06)' }
  };

  async function refresh() {
    return fetchConnStatus();
  }
  React.useEffect(() => { fetchConnStatus(); }, []);
  React.useEffect(() => { const t = setInterval(fetchConnStatus, 10000); return () => clearInterval(t); }, []);

  function getState(type){
    return (status.items||[]).find(s=>s.type===type) || { status:'disconnected' };
  }

  async function safe(fn){
    setBusy(true); setErr(""); setOut("");
    try{ const r = await fn(); setOut(JSON.stringify(r,null,2)); await refresh(); }
    catch(e){ setErr(e?.error ? String(e.error) : String(e)); }
    finally{ setBusy(false); }
  }

  async function copy(text){
    try{ await navigator.clipboard.writeText(String(text)); setToast('Copied to clipboard'); setTimeout(()=>setToast(''), 1200); }
    catch(_e){ setToast('Copy failed'); setTimeout(()=>setToast(''), 1200); }
  }

  // Handle OAuth return flags (?connected=..., ok=..., err=...)
  React.useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search || '');
      const connected = sp.get('connected');
      if (connected) {
        const ok  = sp.get('ok');
        const err = sp.get('err');

        if (ok === '1') {
          setToast((connected === 'm365' ? 'Microsoft 365' : 'Google') + ' connected');
        } else {
          setToast(`Connection failed${err ? `: ${err}` : ''}`);
        }
        setTimeout(() => setToast(''), 1800);

        // remove flags from the URL (Safari-safe)
        sp.delete('connected');
        sp.delete('ok');
        sp.delete('err');

        const qs = sp.toString();
        const clean = window.location.origin + window.location.pathname + (qs ? ('?' + qs) : '');
        window.history.replaceState({}, '', clean);

        fetchConnStatus();
      }
    } catch (_e) {
      console.warn("Ignored OAuth URL cleanup error", _e);
    }
  }, []);
  // Load current connection status on first render
  React.useEffect(() => {
    fetchConnStatus();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{marginTop:0}}>Integrations</h1>
      {/* Connection status summary */}
      <div style={{margin:"10px 0", padding:"10px 12px", border:"1px solid #e5e7eb", background:"#0b0c0d", borderRadius:10}}>
        <div style={{fontSize:14, opacity:0.9, marginBottom:6}}>
          <b>Current connections</b> {loadingStatus ? '(refreshing...)' : ''}
        </div>
        {Array.isArray(connStatus) && connStatus.length > 0 ? (
          <ul style={{listStyle:"none", padding:0, margin:0, display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:8}}>
            {connStatus.map((c,i)=>(
              <li key={i} style={{padding:"8px 10px", background:"#111316", border:"1px solid #1f2328", borderRadius:8}}>
                <div style={{fontSize:12, opacity:0.8}}>{(c.type||'').toUpperCase()} • {c.provider||'—'}</div>
                <div style={{fontSize:13, marginTop:4}} title={statusHelp(c.status)}>
                  {c.status === 'connected' ? '✅ Connected'
                    : c.status === 'pending' ? '⏳ Pending'
                    : c.status === 'error'   ? '❌ Error'
                    : '—'}
                </div>
                {c.account && (
                  <div style={{fontSize:12, opacity:.8, marginTop:4}}>
                    Connected as: {c.account.displayName || c.account.mail || c.account.userPrincipalName || '—'}
                  </div>
                )}
                {(c.status === 'error' || (c.last_error && String(c.last_error).trim())) && (
                  <div style={{marginTop:6, display:'grid', gap:6}}>
                    <div style={{fontSize:12, padding:'4px 6px', border:'1px solid #ff7a7a88', background:'#ff7a7a22', borderRadius:6}}>
                      Error{c.last_error ? ': ' + String(c.last_error) : ''}
                    </div>
                    <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                      {/* Re-auth / Reconnect */}
                      <button
                        style={styles.ghost}
                        onClick={() => {
                          const t = String(c.provider || c.type || '').toLowerCase();
                          if (t.includes('m365') || t.includes('o365') || t.includes('office')) { startEmailOAuth('o365'); return; }
                          if (t.includes('google') || t.includes('gws')  || t.includes('gmail')) { startEmailOAuth('gmail'); return; }
                          if (t.includes('imap')) { openEmailWizard('imap'); return; }
                          if (c.type === 'edr') { safe(()=>api.post('/integrations/edr/enrollment-token',{})); return; }
                          if (c.type === 'dns') { safe(()=>api.get('/integrations/dns/bootstrap')); return; }
                        }}
                      >
                        Re-auth / Reconnect
                      </button>

                      {/* Admin-only: Reset connector */}
                      {(meState?.is_super || meState?.role === 'owner') && (
                        <button
                          style={styles.ghost}
                          title="Admin: reset connector state"
                          onClick={() => { if (confirm(`Reset ${String(c.type||'integration')} connector?`)) { safe(()=>api.post('/admin/ops/connector/reset', { type: c.type })); } }}
                        >
                          Reset connector (admin)
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{fontSize:13, opacity:0.8}}>No integrations connected yet.</div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>

        {/* Email */}
        <div style={styles.card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontWeight:700}}>Email Security</div>
            <span style={{opacity:.85,fontSize:12}} title={statusHelp(getState('email').status)}>
              {getState('email').status}
              {getState('email').status === 'error' && (
                <span style={{marginLeft:8, fontSize:11, padding:'2px 6px', border:'1px solid #ff7a7a88', background:'#ff7a7a22', borderRadius:999}}>error</span>
              )}
            </span>
          </div>
          <div style={{opacity:.85,marginTop:6}}>Connect your provider to scan for phishing/malware.</div>
          <div style={{display:'flex',gap:8,alignItems:'center',marginTop:8,flexWrap:'wrap'}}>
            <select value={emailProvider} onChange={e=>setEmailProvider(e.target.value)} style={{padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.06)',color:'inherit'}}>
              <option value="o365">Microsoft 365</option>
              <option value="gmail">Google Workspace</option>
              <option value="imap">Generic IMAP</option>
            </select>
            <button
              style={btn}
              disabled={busy}
              onClick={()=>{
                const p = (emailProvider||'').toLowerCase();
                // For M365 / Google, jump straight to OAuth start endpoints
                if (p === 'o365' || p === 'gmail') {
                  startEmailOAuth(p);
                } else {
                  // IMAP goes through the guided wizard
                  openEmailWizard(p);
                }
              }}
            >
              Connect
            </button>
          </div>
        </div>

        {/* EDR */}
        {caps.edr ? (
          <div style={styles.card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontWeight:700}}>Endpoint (EDR)</div>
              <span style={{opacity:.85,fontSize:12}} title={statusHelp(getState('edr').status)}>
                {getState('edr').status}
                {getState('edr').status === 'error' && (
                  <span style={{marginLeft:8, fontSize:11, padding:'2px 6px', border:'1px solid #ff7a7a88', background:'#ff7a7a22', borderRadius:999}}>error</span>
                )}
              </span>
            </div>
            <div style={{opacity:.85,marginTop:6}}>Generate an enrollment token for your agent installer.</div>
            <div style={{display:'flex',gap:8,alignItems:'center',marginTop:8,flexWrap:'wrap'}}>
              <button style={btn} disabled={busy} onClick={()=>safe(async()=>{ const j=await api.post('/integrations/edr/enrollment-token',{}); setEdrToken(j?.token||''); return j; })}>Get enrollment token</button>
              {edrToken && (
                <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
                  <code style={{opacity:.9}}>{edrToken}</code>
                  <button style={styles.ghost} onClick={()=>copy(edrToken)}>Copy</button>
                </span>
              )}
            </div>
          </div>
        ) : (
          <LockedTile title="Endpoint (EDR)" reason="Upgrade to Pro or Pro+ to enable endpoint security." />
        )}

        {/* DNS */}
        {caps.dns ? (
          <div style={styles.card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontWeight:700}}>DNS Protection</div>
              <span style={{opacity:.85,fontSize:12}} title={statusHelp(getState('dns').status)}>
                {getState('dns').status}
                {getState('dns').status === 'error' && (
                  <span style={{marginLeft:8, fontSize:11, padding:'2px 6px', border:'1px solid #ff7a7a88', background:'#ff7a7a22', borderRadius:999}}>error</span>
                )}
              </span>
            </div>
            <div style={{opacity:.85,marginTop:6}}>Bootstrap to get resolver IPs and your token.</div>
            <div style={{display:'flex',gap:8,alignItems:'center',marginTop:8,flexWrap:'wrap'}}>
              <button style={btn} disabled={busy} onClick={()=>safe(async()=>{ const j=await api.get('/integrations/dns/bootstrap'); setDnsInfo(j); return j; })}>Bootstrap</button>
              {dnsInfo && (
                <span style={{display:'inline-flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <span>Resolvers: <code>{(dnsInfo.resolver_ips||[]).join(', ')}</code></span>
                  <span>• Token: <code>{dnsInfo.token}</code></span>
                  <button style={styles.ghost} onClick={()=>copy(dnsInfo.token)}>Copy</button>
                </span>
              )}
            </div>
          </div>
        ) : (
          <LockedTile title="DNS Protection" reason="Upgrade to Pro or Pro+ to enable DNS protection." />
        )}

        {/* UEBA */}
        {caps.ueba ? (
          <div style={styles.card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontWeight:700}}>UEBA</div>
              <span style={{opacity:.85,fontSize:12}} title={statusHelp(getState('ueba').status)}>
                {getState('ueba').status}
                {getState('ueba').status === 'error' && (
                  <span style={{marginLeft:8, fontSize:11, padding:'2px 6px', border:'1px solid #ff7a7a88', background:'#ff7a7a22', borderRadius:999}}>error</span>
                )}
              </span>
            </div>
            <div style={{opacity:.85,marginTop:6}}>Connect M365 or Google Workspace to stream audit/sign-in logs.</div>
            <div style={{display:'flex',gap:8,alignItems:'center',marginTop:8,flexWrap:'wrap'}}>
              <button style={btn} disabled={busy} onClick={()=>safe(()=>api.post('/integrations/ueba/connect', { provider:'m365', settings:{} }))}>Connect M365</button>
              <button style={btn} disabled={busy} onClick={()=>safe(()=>api.post('/integrations/ueba/connect', { provider:'gworkspace', settings:{} }))}>Connect GWS</button>
            </div>
          </div>
        ) : (
          <LockedTile title="UEBA" reason="Available on Pro+ plan." />
        )}

        {/* Cloud */}
        {caps.cloud ? (
          <div style={styles.card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontWeight:700}}>Cloud Security</div>
              <span style={{opacity:.85,fontSize:12}} title={statusHelp(getState('cloud').status)}>
                {getState('cloud').status}
                {getState('cloud').status === 'error' && (
                  <span style={{marginLeft:8, fontSize:11, padding:'2px 6px', border:'1px solid #ff7a7a88', background:'#ff7a7a22', borderRadius:999}}>error</span>
                )}
              </span>
            </div>
            <div style={{opacity:.85,marginTop:6}}>Connect AWS / Azure / GCP for cloud findings & audit logs.</div>
            <div style={{display:'flex',gap:8,alignItems:'center',marginTop:8,flexWrap:'wrap'}}>
              <button style={btn} disabled={busy} onClick={()=>safe(()=>api.post('/integrations/cloud/connect', { provider:'aws', settings:{} }))}>Connect AWS</button>
              <button style={btn} disabled={busy} onClick={()=>safe(()=>api.post('/integrations/cloud/connect', { provider:'azure', settings:{} }))}>Connect Azure</button>
              <button style={btn} disabled={busy} onClick={()=>safe(()=>api.post('/integrations/cloud/connect', { provider:'gcp', settings:{} }))}>Connect GCP</button>
            </div>
          </div>
        ) : (
          <LockedTile title="Cloud Security" reason="Available on Pro+ plan." />
        )}

        {/* AI Assistant (placeholder) */}
        <div style={styles.card}>
          <div style={{fontWeight:700}}>AI Security Assistant</div>
          <div style={{opacity:.85,marginTop:6}}>Ask natural‑language questions, triage alerts, and get guidance (preview).</div>
          <div style={{marginTop:8}}>
            {planCapabilities(meState?.effective_plan || meState?.plan_actual || meState?.plan || 'trial', meState).ai ? (
              <Link to="/autonomy"><button style={btn}>Open Autonomy</button></Link>
            ) : (
              <LockedTile title="AI Security Assistant" reason="Available on Pro+ (trial preview unlocks it temporarily)." />
            )}
          </div>
        </div>
      </div>

      {/* Debug panel toggle */}
      <div style={{marginTop:12}}>
        <button style={styles.ghost} onClick={()=>setOut(o=> o ? '' : '{"ok": true}')}>
          {out? 'Hide debug' : 'Show debug'}
        </button>
      </div>
      {(out||err) && (
        <div style={{marginTop:12}}>
          {err && <div style={{padding:'10px 12px',border:'1px solid #ff7a7a88',background:'#ff7a7a22',borderRadius:10,margin:'10px 0'}}>Error: {err}</div>}
          {out && <pre style={{whiteSpace:'pre-wrap',padding:10,border:'1px solid rgba(255,255,255,.12)',borderRadius:10,background:'rgba(255,255,255,.05)'}}>{out}</pre>}
        </div>
      )}

      {wizOpen && (
        <div style={styles.modal}>
          <div style={styles.sheet}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontWeight:700}}>Email Setup — {wizProvider==='o365'?'Microsoft 365':wizProvider==='gmail'?'Google Workspace':'Generic IMAP'}</div>
              <button style={styles.ghost} onClick={wizClose}>Close</button>
            </div>

            {/* Stepper */}
            <div style={{display:'flex',gap:8,margin:'12px 0'}}>
              {[0,1,2,3].map(i=> (
                <div key={i} style={{padding:'4px 8px',borderRadius:999,border:'1px solid rgba(255,255,255,.2)',background: i<=wizStep ? '#1f6feb' : 'transparent'}}>{i+1}</div>
              ))}
            </div>

            {/* Steps */}
            {wizStep===0 && (
              <div>
                <div style={{opacity:.85}}>Choose scope and confirm provider.</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:10}}>
                  <div>
                    <div style={{opacity:.8,marginBottom:6}}>Provider</div>
                    <select value={wizProvider} onChange={e=>setWizProvider(e.target.value)} style={{padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.06)',color:'inherit'}}>
                      <option value="o365">Microsoft 365</option>
                      <option value="gmail">Google Workspace</option>
                      <option value="imap">Generic IMAP</option>
                    </select>
                  </div>
                  <div>
                    <div style={{opacity:.8,marginBottom:6}}>Mailbox scope</div>
                    <select value={wizForm.scope} onChange={e=>setWizForm({...wizForm, scope:e.target.value})} style={{padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.06)',color:'inherit'}}>
                      <option value="all">All users</option>
                      <option value="subset">Selected users</option>
                    </select>
                  </div>
                </div>
                <div style={{marginTop:12}}>
                  <button style={btn} onClick={wizNext}>Continue</button>
                </div>
              </div>
            )}

            {wizStep===1 && (
              <div>
                {wizProvider==='imap' ? (
                  <div>
                    <div style={{opacity:.85}}>Enter your IMAP server details.</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:10}}>
                      <input placeholder="Host" value={wizForm.imapHost} onChange={e=>setWizForm({...wizForm, imapHost:e.target.value})} style={{padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.06)',color:'inherit'}}/>
                      <input placeholder="Port" type="number" value={wizForm.imapPort} onChange={e=>setWizForm({...wizForm, imapPort:e.target.value})} style={{padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.06)',color:'inherit'}}/>
                      <input placeholder="Username" value={wizForm.imapUser} onChange={e=>setWizForm({...wizForm, imapUser:e.target.value})} style={{padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.06)',color:'inherit'}}/>
                      <input placeholder="Password" type="password" value={wizForm.imapPass} onChange={e=>setWizForm({...wizForm, imapPass:e.target.value})} style={{padding:'8px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.06)',color:'inherit'}}/>
                      <label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={!!wizForm.imapTLS} onChange={e=>setWizForm({...wizForm, imapTLS:e.target.checked})}/>Use TLS</label>
                    </div>
                    <div style={{marginTop:12,display:'flex',gap:8}}>
                      <button style={btn} onClick={wizBack}>Back</button>
                      <button style={btn} onClick={wizNext}>Connect</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{opacity:.85}}>We will open the provider authorization flow and request read‑only access to messages for scanning.</div>
                    <div style={{marginTop:12,display:'flex',gap:8}}>
                      <button style={btn} onClick={wizBack}>Back</button>
                      <button style={btn} onClick={wizNext}>Authorize & Connect</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {wizStep===2 && (
              <div>
                <div style={{opacity:.85}}>Connection complete. Send a test to verify events are arriving.</div>
                <div style={{marginTop:12,display:'flex',gap:8}}>
                  <button style={btn} onClick={wizBack}>Back</button>
                  <button style={btn} onClick={wizNext}>Send test</button>
                </div>
              </div>
            )}

            {wizStep===3 && (
              <div>
                <div style={{opacity:.85}}>All set. You can close this window.</div>
                <div style={{marginTop:12}}>
                  <button style={btn} onClick={wizClose}>Finish</button>
                </div>
              </div>
            )}

            {(wizErr || wizMsg) && (
              <div style={{marginTop:12}}>
                {wizErr && <div style={{padding:'10px 12px',border:'1px solid #ff7a7a88',background:'#ff7a7a22',borderRadius:10}}>Error: {wizErr}</div>}
                {wizMsg && <div style={{padding:'10px 12px',border:'1px solid #7bd88f55',background:'#7bd88f22',borderRadius:10}}>{wizMsg}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={{position:'fixed',bottom:20,left:'50%',transform:'translateX(-50%)',padding:'8px 12px',border:'1px solid rgba(255,255,255,.2)',background:'rgba(0,0,0,.7)',borderRadius:8,zIndex:1000}}>
          {toast}
        </div>
      )}
    </div>
  );
}
function TestEvents({ api }){
  const [out, setOut] = React.useState("");
  const [err, setErr] = React.useState("");
  const [me, setMe] = React.useState(null);
  const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("api_key")) || "";

  React.useEffect(()=>{ apiGet("/me").then(setMe).catch(()=>{}); },[]);
  const caps = planCapabilities(me?.effective_plan || me?.plan_actual || me?.plan || "trial", me);
const planStr = String(me?.effective_plan || me?.plan_actual || me?.plan || '').toLowerCase();
  const adminPreviewTE = (typeof localStorage!=='undefined' && (localStorage.getItem('admin_plan_preview')||'')).toLowerCase();
  const showTrial = !!(me?.trial?.active) && (planStr === 'basic' || planStr === 'pro') && adminPreviewTE !== 'pro_plus';
  const isProPlus = planStr === 'pro_plus';
  const trialDays = Number(me?.trial?.days_left ?? 0);
  const styles = {
    row:{display:"flex",alignItems:"center",gap:12,margin:"10px 0"},
    btn:{padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"},
    pre:{whiteSpace:"pre-wrap",padding:10,border:"1px solid rgba(255,255,255,.12)",borderRadius:10,background:"rgba(255,255,255,.05)",marginTop:12},
    warn:{margin:"10px 0",padding:"10px 12px",border:"1px solid #c69026",background:"#c6902615",borderRadius:10},
    err :{margin:"10px 0",padding:"10px 12px",border:"1px solid #ff7a7a88",background:"#ff7a7a22",borderRadius:10}
  };

  async function send(path, payload){
    setErr(""); setOut("Sending…");
    try{
      const j = await api.postWithKey(path, payload, apiKey);
      setOut(JSON.stringify(j, null, 2));
    }catch(e){
      setErr(e?.error ? String(e.error) : String(e));
      setOut("");
    }
  }

  const base = API_BASE;

  return (
    <div style={{padding:16}}>
      <h1 style={{marginTop:0}}>Test Events</h1>
     {showTrial && !isProPlus && (
  <div style={{margin:"10px 0",padding:"10px 12px",border:"1px solid #c69026",background:"#c6902615",borderRadius:10}}>
    Pro+ trial — <b>{trialDays}</b> day{trialDays===1?'':'s'} left. Enjoy Pro+ features during your trial.
  </div>
)}
      {!apiKey && (
        <div style={styles.warn}>
          No API key set. Create one in <a href="/account">Account</a>; it will be read from <code>localStorage.api_key</code>.
        </div>
      )}

      {/* Email — always */}
      <div style={styles.row}>
        <b>Email</b>
        <button
          style={styles.btn}
          disabled={!apiKey}
          onClick={()=>send("email/scan",{
            emails:[{from:"Support <help@paypa1.com>",subject:"Urgent: verify your account"}]
          })}
        >Send sample</button>
      </div>

      {/* EDR — Pro/Pro+ */}
      {caps.edr ? (
        <>
          <div style={styles.row}>
            <b>EDR</b>
            <button
              style={styles.btn}
              disabled={!apiKey}
              onClick={()=>send("edr/ingest",{
                events:[{host:"FINANCE-LAPTOP-7",process:"powershell.exe",cmdline:"powershell -enc SQBFAE4A...",file_ops:{burst:1200}}]
              })}
            >Send sample</button>
          </div>
        </>
      ) : (
        <div style={styles.row}><b>EDR</b><span style={{opacity:.8}}>Locked — upgrade to Pro or Pro+.</span></div>
      )}

      {/* DNS — Pro/Pro+ */}
      {caps.dns ? (
        <>
          <div style={styles.row}>
            <b>DNS</b>
            <button
              style={styles.btn}
              disabled={!apiKey}
              onClick={()=>send("dns/ingest",{
                events:[{qname:"evil-top-domain.top",qtype:"A",newly_registered:true,verdict:"dns-tunnel"}]
              })}
            >Send sample</button>
          </div>
        </>
      ) : (
        <div style={styles.row}><b>DNS</b><span style={{opacity:.8}}>Locked — upgrade to Pro or Pro+.</span></div>
      )}

      {/* UEBA — Pro+ */}
      {caps.ueba ? (
        <div style={styles.row}>
          <b>UEBA</b>
          <button
            style={styles.btn}
            onClick={()=>alert("UEBA test will be enabled once /ueba/ingest exists in the API.")}
          >Coming soon</button>
        </div>
      ) : (
        <div style={styles.row}><b>UEBA</b><span style={{opacity:.8}}>Locked — available on Pro+.</span></div>
      )}

      {/* Cloud — Pro+ */}
      {caps.cloud ? (
        <div style={styles.row}>
          <b>Cloud</b>
          <button
            style={styles.btn}
            onClick={()=>alert("Cloud test will be enabled once /cloud/ingest exists in the API.")}
          >Coming soon</button>
        </div>
      ) : (
        <div style={styles.row}><b>Cloud</b><span style={{opacity:.8}}>Locked — available on Pro+.</span></div>
      )}

      {/* AI — Pro+ (preview on Trial) */}
      {caps.ai ? (
        <div style={styles.row}>
          <b>AI</b>
          <button
            style={styles.btn}
            onClick={()=>alert(showTrial
              ? "Trial preview: this will call /ai/ask with a sample question and display the model's answer."
              : "AI test coming soon: will exercise /ai/ask with a sample question and show the model's answer here.")}
          >{showTrial ? "Preview (trial)" : "Preview"}</button>
        </div>
      ) : (
        <div style={styles.row}><b>AI</b><span style={{opacity:.8}}>Locked — available on Pro+.</span></div>
      )}

      {(out||err) && (
        <div>
          {err && <div style={styles.err}>Error: {err}</div>}
          {out && <pre style={styles.pre}>{out}</pre>}
        </div>
      )}
    </div>
  );
}
// ---- Capabilities Helper ----
function planCapabilities(plan, me){
  const p = String(plan || '').toLowerCase();
  const trialActive = !!(me?.trial?.active);
  const trialUnlock = trialActive && (p === 'basic' || p === 'pro');
  let effective = trialUnlock ? 'pro_plus' : p;

  // Super‑admin preview: if the admin UI stored an override, honor it here.
  // This is read‑only and only affects the current browser; it does not change billing.
  try {
    const preview = ((typeof localStorage !== 'undefined' && localStorage.getItem('admin_plan_preview')) || '').toLowerCase();
    if (me?.is_super && (preview === 'pro_plus' || preview === 'pro+')) {
      effective = 'pro_plus';
    }
  } catch (_) {}

  return {
    email: true, // always
    edr:   effective === 'pro' || effective === 'pro_plus',
    dns:   effective === 'pro' || effective === 'pro_plus',
    ueba:  effective === 'pro_plus',
    cloud: effective === 'pro_plus',
    ai:    effective === 'pro_plus'
  };
}


/**
 * normalizeRisk(v):
 * Accepts a string label (e.g., "critical", "high", "medium", "low") or a numeric score (0–100)
 * and returns one of: 'critical' | 'high' | 'medium' | 'low' | 'unknown'.
 */
function normalizeRisk(v){
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'low' || s === 'unknown') return s;
  const n = Number(v);
  if (Number.isFinite(n)) {
    if (n >= 80) return 'critical';
    if (n >= 60) return 'high';
    if (n >= 30) return 'medium';
    if (n >= 0)  return 'low';
  }
  return 'unknown';
}

// --- BillingPanel: self-serve subscriptions (Basic/Pro/Pro+) + Portal ---

function BillingPanel() {
  const [me, setMe] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  const API_BASE = (typeof globalThis !== 'undefined' && globalThis.API_BASE)
  ? globalThis.API_BASE
  : ((typeof window !== 'undefined' && window.location.hostname.includes('onrender.com'))
      ? 'https://cyberguard-pro-cloud.onrender.com/api'
      : '/api');

  async function api(path, opts = {}) {
    const token = localStorage.getItem("token") || "";
    const url = `${API_BASE}${path.startsWith('/') ? path : '/' + path}`;
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { ok:false, error:text }; }
    if (!res.ok) throw Object.assign(new Error(json.error || res.statusText), { detail: json });
    return json;
  }

  React.useEffect(() => {
    (async () => {
      try {
        const j = await api("/me");
        setMe(j);
      } catch (e) {
        setErr(e?.message || "failed to load profile");
      }
    })();
  }, []);

  // Billing status helper tooltip
  function billingHelp(st){
    const s = String(st||'').toLowerCase();
    if(s==='active') return 'Active: billing is in good standing.';
    if(s==='trialing' || s==='trial') return 'Trialing: you are on a trial; features may be limited after it ends.';
    if(s==='past_due') return 'Past due: a payment failed or is overdue. Update your payment method.';
    if(s==='payment_failed') return 'Payment failed: please update your card in the billing portal.';
    if(s==='canceled' || s==='cancelled') return 'Canceled: your subscription is canceled; access may be limited.';
    return 'Billing status';
  }

  async function startCheckout(planKey) {
    setLoading(true); setErr("");
    try {
      const j = await api("/billing/checkout", { method: "POST", body: { plan: planKey } });
      if (j?.ok && j?.url) {
        window.location.href = j.url;
      } else {
        setErr(j?.error || "checkout failed");
      }
    } catch (e) {
      setErr(e?.detail?.error || e?.message || "checkout error");
    } finally {
      setLoading(false);
    }
  }

  async function openPortal() {
    setLoading(true); setErr("");
    try {
      const j = await api("/billing/portal", { method: "POST" });
      if (j?.ok && j?.url) {
        window.location.href = j.url;
      } else {
        setErr(j?.error || "portal failed");
      }
    } catch (e) {
      setErr(e?.detail?.error || e?.message || "portal error");
    } finally {
      setLoading(false);
    }
  }

  const trialDays = me?.trial?.days_left ?? 0;
  const effective = me?.effective_plan || me?.plan_actual || me?.plan || "none";

  return (
    <div style={{ maxWidth: 840, margin: "32px auto", padding: 24 }}>
      <h2 style={{ marginBottom: 8 }}>Billing</h2>
      <p style={{ color: "#666", marginTop: 0 }}>
        Current plan: <b>{String(effective).toUpperCase()}</b>
        {me?.billing_status ? (
          <> — <span title={billingHelp(me.billing_status)} style={{fontSize:12, padding:'2px 6px', border:'1px solid rgba(255,255,255,.25)', borderRadius:999}}>{String(me.billing_status)}</span></>
        ) : null}
        {me?.trial?.active ? (
          <> — trial active, <b>{trialDays}</b> day{trialDays===1?"":"s"} left</>
        ) : null}
      </p>

      {err ? (
        <div style={{ background: "#fee", border: "1px solid #f99", padding: 12, borderRadius: 6, marginBottom: 12 }}>
          {String(err)}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 16 }}>
        <PlanCard
          name="Basic"
          price="£19.99/mo"
          features={[
            "Email threat scanning",
            "Core alerts & dashboard",
            "API access (rate-limited)"
          ]}
          onChoose={() => startCheckout("basic")}
          loading={loading}
        />
        <PlanCard
          name="Pro"
          price="£39.99/mo"
          features={[
            "Everything in Basic",
            "EDR & DNS ingest",
            "Advanced policy controls"
          ]}
          onChoose={() => startCheckout("pro")}
          loading={loading}
        />
        <PlanCard
          name="Pro+"
          price="£99.99/mo"
          features={[
            "Everything in Pro",
            "Cloud & UEBA ingest",
            "Priority support"
          ]}
          onChoose={() => startCheckout("pro_plus")}
          loading={loading}
          highlight
        />
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <button onClick={openPortal} disabled={loading} style={{ padding: "10px 14px" }}>
          Manage billing (Stripe portal)
        </button>
        <Link to="/" style={{ alignSelf: "center" }}>← Back to dashboard</Link>
      </div>
    </div>
  );
}
// Route shim: keep /pricing working by rendering BillingPanel
function PricingPage(){
  return <BillingPanel/>;
}
function PlanCard({ name, price, features, onChoose, loading, highlight }) {
  return (
    <div style={{
      border: "1px solid " + (highlight ? "#65a" : "#ddd"),
      borderRadius: 8,
      padding: 16,
      boxShadow: highlight ? "0 2px 10px rgba(0,0,0,0.06)" : "none"
    }}>
      <h3 style={{ marginTop: 0 }}>{name}</h3>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{price}</div>
      <ul style={{ paddingLeft: 18, marginTop: 8 }}>
        {features.map((f, i) => <li key={i}>{f}</li>)}
      </ul>
      <button
        onClick={onChoose}
        disabled={loading}
        style={{ marginTop: 12, width: "100%", padding: "10px 12px" }}
      >
        {loading ? "Please wait…" : `Choose ${name}`}
      </button>
    </div>
  );
}
// --- Remove small logo block in sidebar/header if present ---
function Support(){
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [hp, setHp] = React.useState(""); // honeypot
  const [sent, setSent] = React.useState(false);
  const [err, setErr] = React.useState("");

  const API_BASE = (typeof globalThis !== 'undefined' && globalThis.API_BASE)
  ? globalThis.API_BASE
  : ((typeof window !== 'undefined' && window.location.hostname.includes('onrender.com'))
      ? 'https://cyberguard-pro-cloud.onrender.com/api'
      : '/api');

  async function submit(e){
    e.preventDefault();
    setErr("");
    try{
      if (hp) { setSent(true); return; } // bot trap
      const r = await fetch(`${API_BASE}/support/send`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ name, email, message, hp })
      });
      const t = await r.text();
      let j; try { j = JSON.parse(t); } catch { j = { ok:false, error:t }; }
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setSent(true);
    } catch(e){
      setErr(e?.message || "send failed");
    }
  }

  const s = {
    wrap:{maxWidth:600, margin:"40px auto", padding:16},
    input:{padding:"10px 12px", borderRadius:8, border:"1px solid rgba(255,255,255,.2)", background:"rgba(255,255,255,.06)", color:"inherit"},
    btn  :{padding:"10px 12px", borderRadius:8, border:"1px solid rgba(255,255,255,.2)", background:"#1f6feb", color:"#fff", cursor:"pointer"}
  };

  return (
    <div style={s.wrap}>
      <h1 style={{marginTop:0}}>Support</h1>
      <p style={{opacity:.8}}>Questions or issues? Send us a message and we’ll get back to you.</p>
      {sent ? (
        <div style={{padding:"10px 12px", border:"1px solid #7bd88f55", background:"#7bd88f22", borderRadius:10}}>
          ✅ Thanks! Your message was sent.
        </div>
      ) : (
        <form onSubmit={submit} style={{display:"grid", gap:10}}>
          <label>Name</label>
          <input style={s.input} value={name} onChange={e=>setName(e.target.value)} required />
          <label>Email</label>
          <input style={s.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
          {/* honeypot */}
          <div style={{position:"absolute", left:"-5000px"}}>
            <input value={hp} onChange={e=>setHp(e.target.value)} tabIndex="-1" autoComplete="off" />
          </div>
          <label>Message</label>
          <textarea style={s.input} value={message} onChange={e=>setMessage(e.target.value)} rows={6} required />
          <button type="submit" style={s.btn}>Send</button>
          {err && <div style={{padding:"8px 10px", border:"1px solid #ff7a7a88", background:"#ff7a7a22", borderRadius:8}}>Error: {err}</div>}
        </form>
      )}
      <p style={{marginTop:12, opacity:.85}}>
        Or email <a href="mailto:support@cyberguardpro.com">support@cyberguardpro.com</a>
      </p>
    </div>
  );
}
// ---- DEBUG OVERLAY (temporary, to diagnose blank screen) ----
function DebugOverlay(){
  const loc = (typeof useLocation !== 'undefined') ? useLocation() : { pathname: '(no-router)' };
  const [visible, setVisible] = React.useState(()=>{
    try{ return localStorage.getItem('debug:overlay') === '1'; }catch{ return true; }
  });
  React.useEffect(()=>{
    // Ensure page is visibly styled even if app styles fail
    try{
      document.body.style.background = document.body.style.background || '#0b0c0d';
      document.body.style.color = document.body.style.color || '#e6e9ef';
    }catch(_e){}
  },[]);
  React.useEffect(()=>{ try{ localStorage.setItem('debug:overlay', visible? '1':'0'); }catch{} },[visible]);
  if(!visible) return null;
  return (
    <div style={{position:'fixed',top:8,left:8,right:8,zIndex:99999,pointerEvents:'none'}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <span style={{pointerEvents:'auto',padding:'4px 8px',border:'1px solid #2b6dff66',background:'rgba(37,99,235,.15)',borderRadius:8,fontSize:12}}>DEBUG: mounted</span>
        <span style={{pointerEvents:'auto',padding:'4px 8px',border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.08)',borderRadius:8,fontSize:12}}>path: {String(loc?.pathname||'/?')}</span>
        <span style={{pointerEvents:'auto',padding:'4px 8px',border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.08)',borderRadius:8,fontSize:12}}>token: { (typeof localStorage!=='undefined' && localStorage.getItem('token')) ? 'present' : 'missing' }</span>
        <button onClick={()=>setVisible(false)} style={{pointerEvents:'auto',padding:'2px 6px',borderRadius:6,border:'1px solid rgba(255,255,255,.25)',background:'transparent',color:'inherit',cursor:'pointer'}}>hide</button>
      </div>
    </div>
  );
}

// Global error taps to surface any silent runtime errors
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e)=>{ try{ console.error('[global error]', e.message, e.error); }catch{} });
  window.addEventListener('unhandledrejection', (e)=>{ try{ console.error('[unhandled rejection]', e.reason); }catch{} });
}


// --- Sidebar/header brand logo (replace text with larger logo, prevent stretching) ---
// (Look for where we previously injected the brand logo in the sidebar/header)
// (Update to use the new style: height 54, objectFit: contain)

// Example: <img src="/brand/logo.png" alt="Cyber Guard Pro" style={{height:36,width:"auto"}} />
// Replace with:
// <img src="/brand/logo.png" alt="Cyber Guard Pro" style={{height:54,width:"auto",display:"block",objectFit:"contain"}} />

// --- SAFETY NET: global fetch shim to always attach Authorization and avoid stray preview header ---
(() => {
  if (typeof window === 'undefined' || window.__authFetchShim) return;
  // Runtime kill-switch: allow disabling the shim via ?noShim=1 or localStorage "debug:disable_shim" = "1"
  try {
    const qp = new URLSearchParams(String(window.location && window.location.search || ''));
    const disableShim = qp.has('noShim') || (localStorage.getItem('debug:disable_shim') === '1');
    if (disableShim) {
      console.warn('[authFetchShim] disabled by flag (?noShim=1 or localStorage debug:disable_shim=1)');
      return;
    }
  } catch (_e) { /* ignore */ }
  window.__authFetchShim = true;
  const orig = window.fetch.bind(window);
  const API_HOST  = 'cyberguard-pro-cloud.onrender.com';
  const API_HTTP  = 'http://localhost:8080';
  const API_HTTPS = 'https://cyberguard-pro-cloud.onrender.com';
const PUBLIC_NOAUTH = [
    /\/__ping\b/,
    /\/__env\b/,
    /\/__routes\b/,
    /\/__whoami\b/,
    /\/auth\/dev-status\b/,
    /\/auth\/dev-login\b/,
    /\/auth\/login\b/,
    /\/auth\/logout\b/,
    /\/auth\/refresh\b/
  ];

  function looksLikeApi(u){
    try {
      if (!u) return false;
      const s = String(u);
      return s.startsWith(API_HTTP) || s.startsWith(API_HTTPS) || s.startsWith('/api') || s.includes(API_HOST);
    } catch { return false; }
  }
  const isAuthPath = (u) => /\/auth\/(login|logout|refresh|dev-login|dev-status)\b/.test(String(u||''));

  // Expose a tiny XHR-based diagnostic that bypasses this fetch shim entirely.
  // Usage from DevTools: await window.__cg_xhrDiag()
  try {
    window.__cg_xhrDiag = async function __cg_xhrDiag() {
      function xhr(method, url, body) {
        return new Promise((resolve) => {
          try {
            const x = new XMLHttpRequest();
            x.open(method, url, true);
            x.withCredentials = true; // include cookies if any
            x.onreadystatechange = function() {
              if (x.readyState === 4) {
                resolve({ status: x.status, body: x.responseText, headers: x.getAllResponseHeaders() });
              }
            };
            if (body) {
              x.setRequestHeader('Content-Type', 'application/json');
              x.send(JSON.stringify(body));
            } else {
              x.send();
            }
          } catch (e) {
            resolve({ status: 0, body: String(e && (e.message || e)), headers: '' });
          }
        });
      }
      const base = 'https://cyberguard-pro-cloud.onrender.com';
      const ping   = await xhr('GET',  base + '/__ping');
      const status = await xhr('GET',  base + '/auth/dev-status');
      const login  = await xhr('POST', base + '/auth/dev-login');
      let me = { status: 0, body: '' };
      try {
        const j = JSON.parse(login.body || '{}');
        if (j && j.token) {
          me = await (async () => {
            return new Promise((resolve) => {
              try {
                const x = new XMLHttpRequest();
                x.open('GET', base + '/api/me', true);
                x.setRequestHeader('Authorization', 'Bearer ' + j.token);
                x.onreadystatechange = function(){
                  if (x.readyState === 4) resolve({ status: x.status, body: x.responseText, headers: x.getAllResponseHeaders() });
                };
                x.send();
              } catch (e) {
                resolve({ status: 0, body: String(e && (e.message || e)), headers: '' });
              }
            });
          })();
        }
      } catch (_) {}
      try { console.log('[xhrDiag] __ping', ping.status, ping.body && ping.body.slice(0, 200)); } catch (_) {}
      try { console.log('[xhrDiag] dev-status', status.status, status.body && status.body.slice(0, 200)); } catch (_) {}
      try { console.log('[xhrDiag] dev-login', login.status, login.body && login.body.slice(0, 200)); } catch (_) {}
      try { console.log('[xhrDiag] me (with Authorization)', me.status, me.body && me.body.slice(0, 200)); } catch (_) {}
      return { ping, status, login, me };
    };
  } catch (_e) { /* ignore */ }

  async function refreshIfNeeded() {
    try {
      const r = await orig(API_HTTPS + '/api/auth/refresh', { method:'POST', credentials:'include' });
      return r.ok;
    } catch { return false; }
  }

  // small helper to safely set a header whether headers is a Headers object or a plain object
  function setHeader(hdrs, k, v){
    try {
      if (hdrs && typeof hdrs.set === 'function') { hdrs.set(k, v); return hdrs; }
      const h2 = Object.assign({}, hdrs || {});
      h2[k] = v;
      return h2;
    } catch { 
      const h2 = Object.assign({}, hdrs || {});
      h2[k] = v;
      return h2;
    }
  }

  // Best-effort diagnostic logger for 500s on auth routes
  async function logAuth500(url, res) {
    try {
      const body = await res.clone().text();
      console.error('[auth 500]', url, res.status, body.slice(0, 400));
      // Try to gather quick diagnostics (non-fatal)
      const who = await orig(`${API_HTTPS}/__whoami`, { credentials:'include' }).catch(()=>null);
      if (who) {
        const t = await who.text().catch(()=> '');
        console.warn('[whoami]', who.status, t.slice(0, 300));
      }
      const st = await orig(`${API_HTTPS}/auth/dev-status`, { credentials:'include' }).catch(()=>null);
      if (st) {
        const t = await st.text().catch(()=> '');
        console.warn('[dev-status]', st.status, t.slice(0, 200));
      }
    } catch (_) {}
  }

  window.fetch = async (input, init = {}) => {
    let url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApi = looksLikeApi(url);
    const isAuth = isAuthPath(url);

    if (isApi) {
      // Ensure cookies are sent
      init = { credentials: 'include', ...init };
      if (!init.credentials) init.credentials = 'include';

      // Attach Authorization only for protected API calls:
      // - must be API
      // - not an auth route
      // - not a public diagnostics route (e.g. __ping, __whoami, __env, __routes)
      if (!isAuth) {
        try {
          const pathStr = String(url || '');
          const isPublic = PUBLIC_NOAUTH.some(rx => rx.test(pathStr));
          if (!isPublic) {
            const tok = localStorage.getItem('token');
            if (tok) {
              init.headers = setHeader(init.headers, 'Authorization', 'Bearer ' + tok);
            }
          }
        } catch {}
      }
    }

    let res = await orig(input, init);

    // Transparent fallback: if /auth/login 500s, attempt /auth/dev-login once and retry original request
    try {
      const isAuthLogin = /\/auth\/login\b/.test(String(url||''));
      const alreadyTried = !!(init && (init.headers?.['X-CG-DevLogin-Retry'] || (typeof init.headers?.get === 'function' && init.headers.get('X-CG-DevLogin-Retry'))));
      if (isApi && isAuthLogin && res.status === 500 && !alreadyTried) {
        await logAuth500(url, res);
        // Try both variants to support deployments with and without /api
        const tryUrls = [
          (API_HTTPS + '/auth/dev-login'),
          (API_HTTPS + '/api/auth/dev-login')
        ];
        let ok = false, token = null;
        for (const u of tryUrls) {
          try {
            const r2 = await orig(u, { method: 'POST', credentials: 'include' });
            const t2 = await r2.text();
            let j2; try { j2 = JSON.parse(t2); } catch { j2 = {}; }
            if (r2.ok && j2 && j2.token) { ok = true; token = j2.token; break; }
            if (r2.status >= 500) await logAuth500(u, r2);
          } catch (_e) { /* continue */ }
        }
        if (ok && token) {
          try { localStorage.setItem('token', token); } catch (_) {}
          // Re-run the original /auth/login request once to keep the caller flow consistent,
          // but mark it so we don't loop this fallback.
          const newInit = { ...(init || {}) };
          newInit.headers = setHeader(newInit.headers, 'X-CG-DevLogin-Retry', '1');
          res = await orig(input, newInit);
          // Let the app know session likely changed
          try { window.dispatchEvent(new Event('me-updated')); } catch {}
        }
      }
    } catch (_e) { /* ignore */ }

    // If an API call came back 401, try a silent cookie refresh once and retry
    if (isApi && res.status === 401) {
      const ok = await refreshIfNeeded();
      if (ok) res = await orig(input, init);
    }

    return res;
  };
})();

// --- Silent session refresher to keep cookies alive ---
// --- STAGING DEV-LOGIN HELPERS (adds token-based sign-in on Render/cyberguardpro.uk) ---
try {
  // Global API constant for routes/components that pass `api={API}`
  const __API_HTTPS = 'https://cyberguard-pro-cloud.onrender.com';
  if (typeof window !== 'undefined') {
    if (typeof globalThis.API === 'undefined') {
      globalThis.API = __API_HTTPS;
    }
  }

  // Consider Render and cyberguardpro.uk as staging
  const STAGING = (typeof window !== 'undefined')
    ? /cyberguardpro\.uk|onrender\.com/i.test(String(window.location.hostname || ''))
    : false;

  // Dev sign-in: call /auth/dev-login, stash token, refresh app
  async function devSignIn() {
    const base = __API_HTTPS;
    try {
      const r = await fetch(base + '/auth/dev-login', { method: 'POST', credentials: 'include' });
      const t = await r.text();
      let j; try { j = JSON.parse(t); } catch { j = {}; }
      if (j && j.token) {
        try { localStorage.setItem('token', j.token); } catch {}
        try { window.dispatchEvent(new Event('me-updated')); } catch {}
        location.replace('/'); // reload so guards pick up session
        return;
      }
      console.warn('[devSignIn] dev-login did not return a token:', t.slice(0, 200));
      alert('Dev login failed (no token). Check server logs.');
    } catch (e) {
      console.warn('[devSignIn] error', e && (e.message || e));
      alert('Dev login error: ' + String(e && (e.message || e)));
    }
  }

  // Make available in console and for buttons
  try { globalThis.devSignIn = globalThis.devSignIn || devSignIn; } catch {}

  // On /login in staging, add a visible “Sign in (staging)” and intercept the form
  if (STAGING) {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        if (String(location.pathname || '/') !== '/login') return;
        if (document.getElementById('__dev-login-btn')) return; // avoid duplicates

        const btn = document.createElement('button');
        btn.id = '__dev-login-btn';
        btn.textContent = 'Sign in (staging)';
        btn.onclick = (e) => { e.preventDefault(); devSignIn(); };
        Object.assign(btn.style, {
          position: 'fixed',
          right: '16px',
          top: '16px',
          zIndex: 100000,
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,.25)',
          background: '#1f6feb',
          color: '#fff',
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,.25)'
        });
        document.body.appendChild(btn);

        // Also fall back to dev-login if the page’s form is submitted
        const form = document.querySelector('form');
        if (form && !form.__cgPatched) {
          form.__cgPatched = true;
          form.addEventListener('submit', (ev) => {
            try { ev.preventDefault(); devSignIn(); } catch (_) {}
          });
        }
      } catch (_) {}
    });
  }
} catch (_e) { /* ignore */ }
// --- END STAGING DEV-LOGIN HELPERS ---
(function startSilentRefresh(){
  try {
    const tick = async ()=>{
      try { await fetch('/api/auth/refresh', { method:'POST', credentials:'include' }); } catch {}
    };
    tick();
    setInterval(tick, 10 * 60 * 1000); // every 10 minutes
  } catch {}
})();
function __showFatalOverlay(error){
  try {
    const id = '__fatal-overlay__';
    // Update existing overlay if present
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.position = 'fixed';
      el.style.inset = '16px';
      el.style.zIndex = '999999';
      el.style.padding = '16px';
      el.style.border = '1px solid #ff7a7a88';
      el.style.background = '#0b0c0d';
      el.style.color = '#e6e9ef';
      el.style.borderRadius = '10px';
      el.style.boxShadow = '0 18px 48px rgba(0,0,0,.4)';
      document.body.appendChild(el);
    }
    el.innerHTML = '';

    const title = document.createElement('div');
    title.style.fontWeight = '700';
    title.style.marginBottom = '6px';
    title.textContent = 'Startup error';

    const msg = document.createElement('div');
    msg.style.whiteSpace = 'pre-wrap';
    msg.style.margin = '6px 0';
    msg.textContent = String(error && (error.message || error.reason) || error || 'Unknown error');

    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.marginTop = '8px';
    pre.textContent = (error && (error.stack || ''));

    const env = document.createElement('div');
    env.style.opacity = '.85';
    env.style.marginTop = '10px';
    env.style.fontSize = '12px';
    try {
      const info = {
        react: (window.React && window.React.version) || '(?)',
        hasReact: !!window.React,
        hasReactDOM: !!(window.ReactDOM && window.ReactDOM.createRoot),
        location: (window.location && window.location.href) || '(no window)'
      };
      env.textContent = 'env: ' + JSON.stringify(info);
    } catch(_) {}

    el.appendChild(title);
    el.appendChild(msg);
    el.appendChild(pre);
    el.appendChild(env);

    try { console.error('[fatal]', error); } catch {}
  } catch(_) {}
}

// Ensure a root node exists and show a tiny boot hint so we know HTML is visible
(function __ensureRoot(){
  try{
    document.body.style.background = document.body.style.background || '#0b0c0d';
    document.body.style.color = document.body.style.color || '#e6e9ef';
    let root = document.getElementById('root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'root';
      root.textContent = 'Booting…';
      document.body.appendChild(root);
    }
  }catch(e){ __showFatalOverlay(e); }
})();


// Safety: export React and ReactDOM to global scope for error overlays and diagnostics
try { globalThis.React = React; globalThis.ReactDOM = ReactDOM; } catch(_) {}

(function __mount(){
  try {
    const rootEl = document.getElementById('root');
    if (!rootEl) throw new Error('Root element not found');

    // Basic sanity diagnostics before mounting full app
    if (!(window.ReactDOM && typeof ReactDOM.createRoot === 'function')) {
      throw new Error('ReactDOM.createRoot unavailable');
    }

    const root = ReactDOM.createRoot(rootEl);

    // Phase 1: mount a tiny boot component so the page never stays blank
    function BootOK(){
      return React.createElement('div', { style:{padding:'8px',opacity:.7,fontSize:12} }, 'booting…');
    }
    root.render(React.createElement(BootOK));

    // Phase 2: switch to the real app in a microtask; if that fails, show overlay and keep BootOK
    queueMicrotask(() => {
      try {
        root.render(
          React.createElement(React.StrictMode, null,
            React.createElement(BrowserRouter, null,
              React.createElement(DebugOverlay, null),
              React.createElement(App, null)
            )
          )
        );
      } catch (e) {
        __showFatalOverlay(e);
      }
    });
  } catch (e) {
    __showFatalOverlay(e);
  }
})();

// Upgrade global error taps to also show fatal overlay if React hasn't mounted yet
if (typeof window !== 'undefined') {
  const handler = (err) => { try { __showFatalOverlay(err && (err.error || err.reason || err)); } catch(_){} };
  window.addEventListener('error', handler);
  window.addEventListener('unhandledrejection', handler);
}

// Only a single BrandLogo definition should exist in this file.