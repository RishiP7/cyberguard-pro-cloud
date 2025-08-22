import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import Register from "./pages/Register.jsx";
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
        {err && <div style={{marginTop:8,padding:'8px 10px',border:'1px solid #ff7a7a88',background:'#ff7a7a22',borderRadius:8}}>{String(err)}</div>}
        {msg && <div style={successBox}>{String(msg)}</div>}
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


// ===== Minimal API wrapper (re-added) =====
const API_BASE = (import.meta?.env?.VITE_API_BASE)
  || (typeof window !== 'undefined' && window.location.hostname.endsWith('onrender.com')
        ? 'https://cyberguard-pro-cloud.onrender.com'
        : 'http://localhost:8080');

function authHeaders(){
  const t = localStorage.getItem("token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function adminPreviewHeaders(){
  const h = {};
  try{
    const lp = localStorage.getItem('admin_plan_preview');
    const or = localStorage.getItem('admin_override');
    if(lp) h['x-plan-preview'] = lp;
    if(or === '1') h['x-admin-override'] = '1';
  }catch(_e){}
  return h;
}

async function parse(r){
  const ct = r.headers.get("content-type")||"";
  if (ct.includes("application/json")) return r.json();
  return r.text();
}

async function apiGet(path){
  const r = await fetch(`${API_BASE}${path}`, { headers: { ...authHeaders(), ...adminPreviewHeaders() } });
  if (!r.ok) throw await parse(r);
  return parse(r);
}
async function apiPost(path, body){
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type":"application/json", ...authHeaders(), ...adminPreviewHeaders() },
    body: JSON.stringify(body||{})
  });
  if (!r.ok) throw await parse(r);
  return parse(r);
}
async function adminGet(path){
  const adminKey = (typeof localStorage !== "undefined" && localStorage.getItem("admin_key"))
    || (typeof window !== "undefined" && window.__ADMIN_KEY__)
    || "dev_admin_key";
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { "x-admin-key": adminKey }
  });
  if (!r.ok) throw await parse(r);
  return parse(r);
}

async function apiPostWithKey(path, body, apiKey){
  const p = path.startsWith("/") ? path : `/${path}`;
  const r = await fetch(`${API_BASE}${p}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
      ...authHeaders(),
      ...adminPreviewHeaders()
    },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw await parse(r);
  return parse(r);
}

export const API = { get: apiGet, post: apiPost, admin: adminGet, postWithKey: apiPostWithKey };
// ===== End minimal API wrapper =====
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

function ErrorBoundary({children}){
  const [err,setErr] = useState(null);
  return err
    ? <div style={{padding:16}}><h2>Something went wrong</h2><pre style={pre}>{String(err)}</pre></div>
    : <ErrorCatcher onError={setErr}>{children}</ErrorCatcher>;
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
function Layout({children}){
  const nav = useNav();
  const me = nav.me;
  const authed = useAuthFlag();

  // Correct ordering + single source of truth for the trial badge
  const info = trialInfo(me); // normalized {active, days_left, ends_at}
  const actualPlan = String(me?.plan_actual || me?.plan || '').toLowerCase();
  const adminPreview = (typeof localStorage!=='undefined' && (localStorage.getItem('admin_plan_preview')||'')).toLowerCase();
  const showTrialBadge = info.active && (actualPlan === 'basic' || actualPlan === 'pro') && adminPreview !== 'pro_plus';
  return (
    <div>
      <div style={bar}>
        <div style={left}>
          <img src="/logo-cgp.png" alt="Logo" style={{height: 60, marginRight: 10}}/>
        </div>
        <div style={navRow}>
          <N to="/">Dashboard</N>
          <N to="/integrations">Integrations</N>
          <N to="/policy">Policy</N>
          <N to="/account">Account</N>
          {(me?.is_super || me?.role === 'owner') && (<N to="/admin">Admin</N>)}
          <N to="/test">Test</N>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {me?.is_super && (<span style={badgeSA}>Super Admin</span>)}
          {showTrialBadge && (
            <Link
              to="/account"
              style={{
                marginRight:8,
                padding:'4px 10px',
                border:'1px solid #c69026',
                background:'linear-gradient(180deg,#c6902633,#c690261a)',
                borderRadius:999,
                fontSize:12,
                color:'#fff',
                textDecoration:'none',
                boxShadow:'inset 0 1px 0 rgba(255,255,255,.08)'
              }}
              title="Your Pro+ trial is active — click to manage plan"
            >
              Pro+ trial ({info.days_left}d left)
            </Link>
          )}
          {authed ? (
            <button
              style={btnGhost}
              onClick={()=>{
                localStorage.removeItem("token");
                window.dispatchEvent(new Event('token-changed'));
                location.href="/login";
              }}
            >
              Logout
            </button>
          ) : (
            <Link to="/login" style={btnGhost}>Login</Link>
          )}
        </div>
      </div>
      <div style={{padding:16, maxWidth: 1100, margin: "0 auto"}}>
        <SuperAdminBanner me={me} />
        <TrialNotice me={me} />
        {!me?.is_super && typeof localStorage!=='undefined' && localStorage.getItem('admin_token_backup') && (
          <div style={{margin:'8px 0 12px',padding:'8px 10px',border:'1px solid #ffb84d',background:'#ffb84d1a',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div><b>Impersonating tenant</b> — you’re viewing the app as a customer.</div>
            <button
              onClick={()=>{ const b=localStorage.getItem('admin_token_backup'); if(b){ localStorage.setItem('token', b); localStorage.removeItem('admin_token_backup'); location.reload(); } }}
              style={{padding:'6px 10px',borderRadius:8,border:'1px solid #2b6dff55',background:'#2b6dff',color:'#fff',cursor:'pointer'}}
            >Exit impersonation</button>
          </div>
        )}
        {children}
        <AIDock me={me} />
      </div>
    </div>
  );
}
function N({to,children}){ return <Link to={to} style={navItem}>{children}</Link>; }
const bar   ={
  display:"grid",
  gridTemplateColumns:"220px 1fr auto",
  gap:12,alignItems:"center",
  padding:"10px 14px",
  borderBottom:"1px solid rgba(255,255,255,.12)",
  background:"linear-gradient(180deg, rgba(12,14,18,.72), rgba(10,12,16,.64))",
  backdropFilter:"blur(12px)",
  position:"sticky",top:0,zIndex:10,
  boxShadow:"0 8px 24px rgba(0,0,0,.28)"
};
const left  ={display:"flex",alignItems:"center"};
const navRow={display:"flex",gap:10,flexWrap:"wrap"};
const navItem={
  padding:"8px 12px",
  borderRadius:10,
  border:"1px solid rgba(255,255,255,.18)",
  textDecoration:"none",
  color:"#e6e9ef",
  background:"linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.04))",
  boxShadow:"inset 0 1px 0 rgba(255,255,255,.06)"
};
const btnGhost={
  padding:"8px 12px",
  borderRadius:10,
  border:"1px solid rgba(255,255,255,.22)",
  background:"rgba(255,255,255,.04)",
  color:"#e6e9ef",
  textDecoration:"none",
  cursor:"pointer",
  backdropFilter:"blur(8px)",
  boxShadow:"inset 0 1px 0 rgba(255,255,255,.06)"
};
const th    ={textAlign:"left",padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.12)",opacity:.8};
const td    ={padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.06)"};


function LockedTile({ title, reason }) {
  return (
    <div style={{border:"1px solid rgba(255,255,255,.12)",borderRadius:12,padding:16,background:"rgba(255,255,255,.04)",opacity:.7}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontWeight:700}}>{title}</div>
        <span style={{padding:"2px 8px",border:"1px solid rgba(255,255,255,.2)",borderRadius:999,fontSize:12,opacity:.85}}>Locked</span>
      </div>
      <div style={{opacity:.8,marginTop:6}}>{reason}</div>
      <div style={{marginTop:10}}>
        <a href="/account" style={{textDecoration:"none",padding:"8px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,.2)",color:"inherit"}}>Upgrade</a>
      </div>
    </div>
  );
}

// ---------- Auth helpers ----------
function useAuthFlag(){
  const [authed, setAuthed] = React.useState(!!localStorage.getItem("token"));
  React.useEffect(()=>{
    const update = () => setAuthed(!!localStorage.getItem("token"));
    window.addEventListener('storage', update);
    window.addEventListener('token-changed', update);
    update(); // initialize once
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('token-changed', update);
    };
  },[]);
  return authed;
}
function useNav(){
  const [me,setMe]=useState(null);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState(null);
  useEffect(()=>{
    let mounted = true;

    async function fetchMe(){
      try{
        if(!localStorage.getItem("token")){ if(mounted){ setMe(null); setLoading(false); } return; }
        const m = await apiGet("/me");
        const withTrial = { ...m, trial: trialInfo(m) };
        if(mounted) setMe(withTrial);
      }catch(e){ if(mounted) setErr(e.error||"API error"); }
      finally{ if(mounted) setLoading(false); }
    }

    fetchMe();

    const onUpdated = () => { setLoading(true); fetchMe(); };
    window.addEventListener('me-updated', onUpdated);

    return ()=>{ mounted=false; window.removeEventListener('me-updated', onUpdated); };
  },[]);
  return { me, loading, err };
}
function RequireAuth({children}){
  const { me, loading } = useNav();
  if(loading) return <div style={{padding:16}}>Loading…</div>;
  if(!me) return <Navigate to="/login" replace />;
  return children;
}

// ---------- Pages ----------
function Login(){
  const [email,setEmail]=useState("hello@freshprintslondon.com");
  const [password,setPassword]=useState("test123");
  const [msg,setMsg]=useState("");
  const nav=useNavigate();
  async function submit(e){
    e.preventDefault();
    setMsg("");
    try{
      const j = await API.post("/auth/login", { email, password });
      if(!j?.token){ setMsg(j?.error||"Login failed"); return; }
      localStorage.setItem("token", j.token);
      window.dispatchEvent(new Event('token-changed'));
      nav("/");
    }catch(e){ setMsg(e?.error || "Network error"); }
  }
  return (
    <div style={{maxWidth:380, margin:"40px auto"}}>
      <div style={card}>
        <h2 style={{marginTop:0}}>Login</h2>
        <form onSubmit={submit}>
          <input style={inp} value={email} onChange={e=>setEmail(e.target.value)} placeholder="email"/>
          <input style={inp} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="password"/>
          <button style={btn} type="submit">Sign in</button>
        </form>
        {msg && <div style={{marginTop:8, color:"#ff8a8a"}}>{msg}</div>}
        <div style={{marginTop:10, opacity:.9}}>
          New here? <a href="/register" style={{color:"#7db2ff",textDecoration:"none"}}>Create an account</a>
        </div>
      </div>
    </div>
  );
}
const inp={width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"inherit",marginBottom:10};

function RealtimeEmailScans() {
  const [emails, setEmails] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const API_ORIGIN =
    (import.meta?.env?.VITE_API_BASE)
    || (typeof window !== 'undefined' && window.location.hostname.endsWith('onrender.com')
          ? 'https://cyberguard-pro-cloud.onrender.com'
          : 'http://localhost:8080');

  async function pollNow() {
    const token = (typeof localStorage !== 'undefined' && localStorage.getItem('token')) || '';
    if (!token) return;
    try {
      setBusy(true);
      const r = await fetch(`${API_ORIGIN}/email/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ max: 10 })
      });
      try { console.log('PollNow result', await r.json()); } catch (_e) {}
    } catch (_e) {
      // no-op
    } finally {
      setBusy(false);
    }
  }

  // Preload recent email alerts so the table isn't empty while waiting for SSE
  React.useEffect(() => {
    const token = (typeof localStorage !== 'undefined' && localStorage.getItem('token')) || '';
    if (!token) return;
    const base = (import.meta?.env?.VITE_API_BASE)
      || (typeof window !== 'undefined' && window.location.hostname.endsWith('onrender.com')
            ? 'https://cyberguard-pro-cloud.onrender.com'
            : 'http://localhost:8080');
    fetch(`${base}/alerts`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(j => {
        const rows = (j.alerts || [])
          .filter(a => (a?.event?.type || '').toLowerCase() === 'email')
          .slice(0, 25)
          .map(a => ({
            subject: a?.event?.email?.subject || a?.event?.subject || '(no subject)',
            from: a?.event?.email?.from || a?.event?.from || '-',
            date: (() => {
              const w = a?.event?.email?.when
                || a?.event?.email?.receivedDateTime
                || a?.event?.email?.internalDate
                || a?.created_at
                || (Date.now()/1000);
              return (typeof w === 'string' && w.includes('T')) ? w : new Date(Number(w) * 1000).toISOString();
            })(),
            score: Number(a?.score || 0)
          }));
        // Ensure newest first by actual email timestamp
        rows.sort((b, a) => new Date(a.date).getTime() - new Date(b.date).getTime());
        if (rows.length) setEmails(rows);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    const base = (import.meta?.env?.VITE_API_BASE)
      || (typeof window !== 'undefined' && window.location.hostname.endsWith('onrender.com')
            ? 'https://cyberguard-pro-cloud.onrender.com'
            : 'http://localhost:8080');
    const token = (typeof localStorage !== 'undefined' && localStorage.getItem('token')) || '';
    if (!token) return;

    let es = null;
    let closed = false;

    function open(paths, idx = 0) {
      if (closed) return;
      const p = paths[idx];
      if (!p) return; // no more fallbacks

      const url = new URL(`${base}${p}`);
      if (token) url.searchParams.set('token', token);

      if (es) { try { es.close(); } catch (_e) {} es = null; }
      es = new EventSource(url.toString());

      es.onmessage = (e) => {
        try {
          const a = JSON.parse(e.data || '{}');

          const subject =
            a.subject ||
            a?.event?.email?.subject ||
            a?.event?.subject ||
            '(no subject)';

          const from =
            a.from ||
            a?.event?.email?.from ||
            a?.event?.from ||
            '-';

          const when = (() => {
            const w = a.when
              || a.date
              || a?.event?.email?.receivedDateTime
              || a?.event?.email?.internalDate
              || a?.created_at
              || (Date.now()/1000);
            return (typeof w === 'string' && w.includes('T')) ? w : new Date(Number(w) * 1000).toISOString();
          })();

          const score = Number(a.score ?? 0);

          const row = { subject, from, date: when, score };
          setEmails(prev => {
            const next = [row, ...prev];
            next.sort((b, a) => new Date(a.date).getTime() - new Date(b.date).getTime());
            return next.slice(0, 50);
          });
        } catch (_e) {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        try { es.close(); } catch (_e) {}
        es = null;
        // fall back to the next endpoint after a short backoff
        setTimeout(() => open(paths, idx + 1), 1500);
      };
    }

    // Prefer dedicated scans stream; fall back gracefully
    open(['/scans/stream', '/email/stream', '/alerts/stream']);

    return () => {
      closed = true;
      if (es) { try { es.close(); } catch (_e) {} es = null; }
    };
  }, []);

  const rowStyle = (score) => {
    if (score >= 70) return { background: 'rgba(255, 82, 82, 0.15)', borderLeft: '4px solid #ff5252' };
    if (score >= 40) return { background: 'rgba(255, 193, 7, 0.15)', borderLeft: '4px solid #ffc107' };
    return { background: 'rgba(123, 216, 143, 0.12)', borderLeft: '4px solid #7bd88f' };
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontWeight:700}}>Real‑time Email Scans</div>
        <div>
          <button onClick={pollNow} disabled={busy} style={{padding:'6px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.06)',color:'inherit',cursor:'pointer'}}>
            {busy ? 'Polling…' : 'Poll now'}
          </button>
        </div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr>
              <th style={{textAlign:"left",padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.12)",opacity:.8}}>Subject</th>
              <th style={{textAlign:"left",padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.12)",opacity:.8}}>From</th>
              <th style={{textAlign:"left",padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.12)",opacity:.8}}>When</th>
              <th style={{textAlign:"left",padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.12)",opacity:.8}}>Score</th>
            </tr>
          </thead>
          <tbody>
            {emails.length === 0 && (
              <tr>
                <td colSpan="4" style={{padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.06)",opacity:.8}}>
                  Waiting for new email events…
                </td>
              </tr>
            )}
            {emails.map((r, i) => (
              <tr key={i} style={rowStyle(Number(r.score||0))}>
                <td style={{padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.06)"}}>{r.subject}</td>
                <td style={{padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.06)"}}>{r.from}</td>
                <td style={{padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
                  {new Date(r.date).toLocaleString()}
                </td>
                <td style={{padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.06)"}}>{Number(r.score||0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Dashboard(){
  const [me,setMe]=useState(null);
  const [stats,setStats]=useState(null);
  const [alerts,setAlerts]=useState([]);
  const [err,setErr]=useState(null);

  useEffect(()=>{
    (async()=>{
      try{
        const m = await apiGet("/me"); setMe(m);
        const u = await apiGet("/usage"); setStats(u);
        const a = await apiGet("/alerts"); setAlerts(a.alerts||[]);
      }catch(e){ setErr(e.error||"API error"); }
    })();
  },[]);
  if(err) return <div style={{padding:16}}>{err}</div>;
  if(!me) return <div style={{padding:16}}>Loading…</div>;

  return (
    <div>
      <h1 style={{marginTop:0}}>Dashboard</h1>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4, minmax(180px,1fr))",gap:12}}>
        <Stat title="Tenant" value={me.name}/>
        <Stat title="Plan" value={me.plan}/>
        <Stat title="API calls (30d)" value={stats?.api_calls_30d ?? stats?.month_events ?? "-"}/>
        <Stat title="Alerts (24h)" value={stats?.alerts_24h ?? "-"}/>
      </div>

      <div style={{marginTop:16}}>
        <div style={{fontWeight:700, marginBottom:8}}>Recent alerts</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              <th style={th}>When</th><th style={th}>Type</th><th style={th}>Score</th><th style={th}>Status</th>
            </tr></thead>
            <tbody>
              {(alerts||[]).slice(0,10).map(a=>(
                <tr key={a.id}>
                  <td style={td}>{new Date(Number(a.created_at)*1000).toLocaleString()}</td>
                  <td style={td}>{a?.event?.type || "-"}</td>
                  <td style={td}>{a?.score}</td>
                  <td style={td}>{a?.status}</td>
                </tr>
              ))}
              {(!alerts || alerts.length===0) && <tr><td style={td} colSpan={4}>No alerts yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <RealtimeEmailScans />
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
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(280px,1fr))",gap:12}}>
        <div style={card}>
          <div style={{marginBottom:8}}><b>Current plan</b>: {me.plan}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button style={btn} onClick={()=>activate("basic")}>Choose Basic</button>
            <button style={btn} onClick={()=>activate("pro")}>Choose Pro</button>
            <button style={btn} onClick={()=>activate("pro_plus")}>Choose Pro+</button>
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
      </div>
      {/* API Keys card */}
      <KeysCard />
      {msg && <div style={{marginTop:10}}>{msg}</div>}
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


function App(){
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
  <Route path="/login" element={<Login/>}/>
  <Route path="/register" element={<Register/>}/>
  <Route path="/" element={<RequireAuth><Dashboard api={API}/></RequireAuth>}/>
  <Route path="/integrations" element={<RequireAuth><Integrations api={API}/></RequireAuth>}/>
  <Route path="/policy" element={<RequireAuth><Policy api={API}/></RequireAuth>}/>
  <Route path="/account" element={<RequireAuth><Account api={API}/></RequireAuth>}/>
  <Route path="/admin" element={<RequireAuth><Admin api={API}/></RequireAuth>}/>
  <Route path="/test" element={<RequireAuth><TestEvents api={API}/></RequireAuth>}/>
  <Route path="*" element={<Navigate to="/" replace />}/>
</Routes>
      </Layout>
    </ErrorBoundary>
  );
}

// --- Integrations Wizard UI ---
function Integrations({ api }) {
  const [meState, setMeState] = React.useState(null);
  React.useEffect(()=>{ apiGet('/me').then(setMeState).catch(()=>setMeState(null)); },[]);
  const caps = planCapabilities(meState?.plan || 'trial', meState);
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
    const url = new URL(window.location.href);
    const sp = url.searchParams;
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

      // remove flags from the URL
      sp.delete('connected');
      sp.delete('ok');
      sp.delete('err');
      window.history.replaceState({}, '', url.toString());

      fetchConnStatus();
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
                <div style={{fontSize:13, marginTop:4}}>
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
            <span style={{opacity:.85,fontSize:12}}>{getState('email').status}</span>
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
              <span style={{opacity:.85,fontSize:12}}>{getState('edr').status}</span>
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
              <span style={{opacity:.85,fontSize:12}}>{getState('dns').status}</span>
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
              <span style={{opacity:.85,fontSize:12}}>{getState('ueba').status}</span>
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
              <span style={{opacity:.85,fontSize:12}}>{getState('cloud').status}</span>
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
            {planCapabilities(meState?.plan || 'trial', meState).ai ? (
              <button style={btn} onClick={()=>alert('AI assistant preview. Full features on Pro+.')}>Open Assistant</button>
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
  const caps = planCapabilities(me?.plan || "trial", me);
  const planStr = String(me?.plan_actual || me?.plan || '').toLowerCase();
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
  const effective = trialUnlock ? 'pro_plus' : p;

  return {
    email: true, // always
    edr:   effective === 'pro' || effective === 'pro_plus',
    dns:   effective === 'pro' || effective === 'pro_plus',
    ueba:  effective === 'pro_plus',
    cloud: effective === 'pro_plus',
    ai:    effective === 'pro_plus'
  };
}
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App/>
    </BrowserRouter>
  </React.StrictMode>
);
