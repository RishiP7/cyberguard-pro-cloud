import React, { useEffect, useState, useMemo } from "react";


// ===== Minimal API wrapper (re-added) =====
const API_BASE = (import.meta?.env?.VITE_API_BASE) || "http://localhost:8080";

function authHeaders(){
  const t = localStorage.getItem("token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function parse(r){
  const ct = r.headers.get("content-type")||"";
  if (ct.includes("application/json")) return r.json();
  return r.text();
}

async function apiGet(path){
  const r = await fetch(`${API_BASE}${path}`, { headers: { ...authHeaders() } });
  if (!r.ok) throw await parse(r);
  return parse(r);
}
async function apiPost(path, body){
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type":"application/json", ...authHeaders() },
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
      ...authHeaders() // will add Authorization if present; harmless for key-based endpoints
    },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw await parse(r);
  return parse(r);
}

const API = { get: apiGet, post: apiPost, admin: adminGet, postWithKey: apiPostWithKey };
// ===== End minimal API wrapper =====
const card={padding:16,border:"1px solid rgba(255,255,255,.12)",borderRadius:12,background:"rgba(255,255,255,.04)"};
const btn={padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};
const pre={whiteSpace:"pre-wrap",padding:10,border:"1px solid rgba(255,255,255,.12)",borderRadius:10,background:"rgba(255,255,255,.05)",marginTop:12};
const errBox={padding:"10px 12px",border:"1px solid #ff7a7a88",background:"#ff7a7a22",borderRadius:10,margin:"10px 0"};
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from "react-router-dom";

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

// ---------- Layout ----------
function Layout({children}){
  const nav = useNav();
  const me = nav.me;
  const authed = useAuthFlag();
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
          <N to="/admin">Admin</N>
          <N to="/test">Test</N>
        </div>
        <div>
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
      <div style={{padding:16, maxWidth: 1100, margin: "0 auto"}}>{children}</div>
    </div>
  );
}
function N({to,children}){ return <Link to={to} style={navItem}>{children}</Link>; }
const bar   ={display:"grid",gridTemplateColumns:"220px 1fr auto",gap:12,alignItems:"center",padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,.12)",background:"rgba(10,12,16,.7)",backdropFilter:"blur(8px)",position:"sticky",top:0,zIndex:10};
const left  ={display:"flex",alignItems:"center"};
const navRow={display:"flex",gap:10,flexWrap:"wrap"};
const navItem={padding:"6px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,.15)",textDecoration:"none",color:"#e6e9ef",background:"rgba(255,255,255,.05)"};
const btnGhost={padding:"8px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,.2)",background:"transparent",color:"#e6e9ef",textDecoration:"none",cursor:"pointer"};
const th    ={textAlign:"left",padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.12)",opacity:.8};
const td    ={padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.06)"};

// ---- Plan gating helpers ----
function planCapabilities(plan, me){
  const trialIsActive = !!me?.trial?.active;
  return {
    email: true,
    edr:   plan !== 'basic',
    dns:   plan !== 'basic',
    ueba:  plan === 'pro_plus',
    cloud: plan === 'pro_plus',
    // AI: Pro+ full; Trial only if still active
    ai: (plan === 'pro_plus') || (plan === 'trial' && trialIsActive),
  };
}

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
    let mounted=true;
    (async()=>{
      try{
        if(!localStorage.getItem("token")){ setMe(null); setLoading(false); return; }
        const m=await apiGet("/me");
        if(mounted) setMe(m);
      }catch(e){ if(mounted) setErr(e.error||"API error"); }
      finally{ if(mounted) setLoading(false); }
    })();
    return ()=>{ mounted=false; };
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
      const r = await fetch(`${API_BASE}/auth/login`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({email,password}) });
      const j = await r.json();
      if(!r.ok || !j.token) throw new Error(j.error||"login failed");
      localStorage.setItem("token", j.token);
      window.dispatchEvent(new Event('token-changed'));
      nav("/");
    }catch(e){ setMsg(String(e.message||e)); }
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
      </div>
    </div>
  );
}
const inp={width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"inherit",marginBottom:10};

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
      </div>
    </div>
  );
}
function Stat({title,value}){ return <div style={card}><div style={{opacity:.75,fontSize:13}}>{title}</div><div style={{fontSize:22,fontWeight:700,marginTop:6}}>{value}</div></div>; }


function Block({title,children,disabled}){ return <div style={{...card, opacity:disabled?.8:1}}><div style={{fontWeight:700,marginBottom:6}}>{title}</div>{children}</div>; }
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

  async function activate(plan){
    try{
      // Backend may ignore coupon, that's fine — we persist for checkout handoff later.
      const body = promo ? { plan, coupon: promo } : { plan };
      const r = await apiPost("/billing/mock-activate", body);
      setMe({...me, plan:r.plan});
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
              <button style={btn} onClick={async ()=>{
                try{
                  const r=await apiPost("/apikeys",{});
                  localStorage.setItem("api_key", r.api_key);
                  setMsg("API key created and stored in localStorage.api_key");
                }catch(e){ setMsg(e.error||"key create failed"); }
              }}>Create API Key</button>
            </>
          )}
        </div>
      </div>
      {msg && <div style={{marginTop:10}}>{msg}</div>}
    </div>
  );
}

function Admin(){
  const [items,setItems]=useState(null);
  const [err,setErr]=useState(null);
  const [adminKey, setAdminKey] = useState(localStorage.getItem("admin_key") || "");
  function saveKey(){
    localStorage.setItem("admin_key", adminKey);
    setItems(null); setErr(null);
    adminGet("/admin/tenants").then(setItems).catch(e=>setErr(e.error||"API error"));
  }
  useEffect(()=>{ adminGet("/admin/tenants").then(setItems).catch(e=>setErr(e.error||"API error")); },[]);
  if(err) return <div style={{padding:16}}>{err}</div>;
  if(!items) return <div style={{padding:16}}>Loading…</div>;
  const list = items?.tenants || items || [];
  return (
    <div>
      <h1 style={{marginTop:0}}>Admin</h1>
      <div style={{...card, marginBottom:12}}>
        <div style={{fontWeight:700, marginBottom:6}}>Admin key</div>
        <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
          <input
            style={{padding:"8px 10px", borderRadius:8, border:"1px solid rgba(255,255,255,.2)", background:"rgba(255,255,255,.05)", color:"inherit", minWidth:320}}
            placeholder="paste your ADMIN_KEY"
            value={adminKey}
            onChange={e=>setAdminKey(e.target.value)}
          />
          <button style={btn} onClick={saveKey}>Save</button>
        </div>
        <div style={{opacity:.8, marginTop:6}}>Stored in <code>localStorage.admin_key</code>. The Admin page uses it for <code>x-admin-key</code>.</div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr><th style={th}>Tenant</th><th style={th}>Plan</th><th style={th}>Users</th><th style={th}>Active keys</th><th style={th}>Last alert</th></tr></thead>
          <tbody>
            {list.length===0 && <tr><td style={td} colSpan={5}>No tenants</td></tr>}
            {list.map((t,i)=>(
              <tr key={i}>
                <td style={td}>{t.name||t.id}</td>
                <td style={td}>{t.plan||"-"}</td>
                <td style={td}>{t.users ?? "-"}</td>
                <td style={td}>{t.active_keys ?? "-"}</td>
                <td style={td}>{t.last_alert ? new Date(Number(t.last_alert)*1000).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

function Integrations({ api }){
  const [me,setMe]=React.useState(null);
  const [out, setOut] = React.useState("");
  const [err, setErr] = React.useState("");
  const apiKey = (typeof localStorage !== "undefined" && localStorage.getItem("api_key")) || "";

  React.useEffect(()=>{ apiGet("/me").then(setMe).catch(()=>{}); },[]);
  const caps = planCapabilities(me?.plan || "trial", me);
  const isTrial = (me?.plan || "trial") === "trial";
  const trialDays = me?.trial?.days_left ?? null;

  const styles = {
    card:{border:"1px solid rgba(255,255,255,.12)",borderRadius:12,padding:16,background:"rgba(255,255,255,.04)"},
    grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(280px,1fr))",gap:12},
    btn:{padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"},
    pre:{whiteSpace:"pre-wrap",padding:10,border:"1px solid rgba(255,255,255,.12)",borderRadius:10,background:"rgba(255,255,255,.05)"},
    warn:{margin:"10px 0",padding:"10px 12px",border:"1px solid #c69026",background:"#c6902615",borderRadius:10},
    err :{margin:"10px 0",padding:"10px 12px",border:"1px solid #ff7a7a88",background:"#ff7a7a22",borderRadius:10},
    muted:{opacity:.8}
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

  return (
    <div style={{padding:16}}>
      <h1 style={{marginTop:0}}>Integrations</h1>
      {isTrial && (
        <div style={{margin:"10px 0",padding:"10px 12px",border:"1px solid #c69026",background:"#c6902615",borderRadius:10}}>
          Trial {me?.trial?.active ? `— ${trialDays} day${trialDays===1?'':'s'} left` : 'expired'}. {me?.trial?.active ? 'Enjoy preview access to AI features.' : 'Upgrade to Pro+ to continue using AI.'}
        </div>
      )}
      {!apiKey && (
        <div style={styles.warn}>
          No API key set. Create one in <a href="/account">Account</a>, then it will be read from <code>localStorage.api_key</code>.
        </div>
      )}
      <div style={styles.grid}>
        {/* Email — always available */}
        <div style={styles.card}>
          <div style={{fontWeight:700,marginBottom:6}}>Email scanner (Web API)</div>
          <div style={styles.muted}>POST <code>/email/scan</code> with batched emails.</div>
          <div style={{marginTop:8}}>
            <button style={styles.btn} disabled={!apiKey} onClick={()=>send("email/scan",{
              emails:[{from:"Support <help@paypa1.com>",subject:"Urgent: verify your account"}]
            })}>Send sample</button>
          </div>
        </div>

        {/* EDR */}
        {caps.edr ? (
          <div style={styles.card}>
            <div style={{fontWeight:700,marginBottom:6}}>EDR (agent logs)</div>
            <div style={styles.muted}>POST <code>/edr/ingest</code> with telemetry.</div>
            <div style={{marginTop:8}}>
              <button style={styles.btn} disabled={!apiKey} onClick={()=>send("edr/ingest",{
                events:[{host:"FINANCE-LAPTOP-7",process:"powershell.exe",cmdline:"powershell -enc SQBFAE4A...",file_ops:{burst:1200}}]
              })}>Send sample</button>
            </div>
          </div>
        ) : (
          <LockedTile title="EDR (agent logs)" reason="Available on Pro and Pro+ plans."/>
        )}

        {/* DNS */}
        {caps.dns ? (
          <div style={styles.card}>
            <div style={{fontWeight:700,marginBottom:6}}>DNS (resolver logs)</div>
            <div style={styles.muted}>POST <code>/dns/ingest</code> with DNS query events.</div>
            <div style={{marginTop:8}}>
              <button style={styles.btn} disabled={!apiKey} onClick={()=>send("dns/ingest",{
                events:[{qname:"evil-top-domain.top",qtype:"A",newly_registered:true,verdict:"dns-tunnel"}]
              })}>Send sample</button>
            </div>
          </div>
        ) : (
          <LockedTile title="DNS (resolver logs)" reason="Available on Pro and Pro+ plans."/>
        )}

        {/* UEBA */}
        {caps.ueba ? (
          <div style={styles.card}>
            <div style={{fontWeight:700,marginBottom:6}}>UEBA (M365 Audit)</div>
            <div style={styles.muted}>Monitor sign‑in anomalies, mass downloads, impossible travel.</div>
            <div style={{marginTop:8}}>
              <button style={styles.btn} onClick={()=>alert("Setup in docs: M365 Graph audit permissions + webhook URL to /ueba/ingest (coming soon)")}>View setup instructions</button>
            </div>
          </div>
        ) : (
          <LockedTile title="UEBA (M365 Audit)" reason="Available on Pro+ plan."/>
        )}

        {/* Cloud */}
        {caps.cloud ? (
          <div style={styles.card}>
            <div style={{fontWeight:700,marginBottom:6}}>Cloud (CloudTrail/Defender)</div>
            <div style={styles.muted}>Forward cloud security logs for high‑severity detections.</div>
            <div style={{marginTop:8}}>
              <button style={styles.btn} onClick={()=>alert("Setup in docs: CloudTrail/Defender forwarding to /cloud/ingest (coming soon)")}>View setup instructions</button>
            </div>
          </div>
        ) : (
          <LockedTile title="Cloud (CloudTrail/Defender)" reason="Available on Pro+ plan."/>
        )}

        {/* AI Security Assistant */}
        {caps.ai ? (
          <div style={styles.card}>
            <div style={{fontWeight:700,marginBottom:6}}>AI Security Assistant</div>
            <div style={styles.muted}>Natural-language investigations, continuous correlation, and auto-summaries.</div>
            <div style={{marginTop:8}}>
              <button
                style={styles.btn}
                onClick={()=>alert(isTrial
                  ? "Trial preview: The AI assistant will triage alerts, summarize incidents, and answer questions. Full access on Pro+."
                  : "Preview: The AI assistant will triage alerts, summarize incidents, and answer questions. Endpoints will be /ai/ask and /ai/summarize.")}
              >{isTrial ? "Preview (trial)" : "Preview"}</button>
            </div>
          </div>
        ) : (
          <LockedTile title="AI Security Assistant" reason="Available on Pro+ plan."/>
        )}
      </div>

      {(out||err) && (
        <div style={{marginTop:12}}>
          {err && <div style={styles.err}>Error: {err}</div>}
          {out && <pre style={styles.pre}>{out}</pre>}
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
  const isTrial = (me?.plan || "trial") === "trial";
  const trialDays = me?.trial?.days_left ?? null;

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
      {isTrial && (
        <div style={{margin:"10px 0",padding:"10px 12px",border:"1px solid #c69026",background:"#c6902615",borderRadius:10}}>
          Trial {me?.trial?.active ? `— ${trialDays} day${trialDays===1?'':'s'} left` : 'expired'}. {me?.trial?.active ? 'Enjoy preview access to AI features.' : 'Upgrade to Pro+ to continue using AI.'}
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
            onClick={()=>alert(isTrial
              ? "Trial preview: this will call /ai/ask with a sample question and display the model's answer."
              : "AI test coming soon: will exercise /ai/ask with a sample question and show the model's answer here.")}
          >{isTrial ? "Preview (trial)" : "Preview"}</button>
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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>
);
