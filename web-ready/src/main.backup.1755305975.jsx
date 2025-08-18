import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";

const API = import.meta.env.VITE_API_BASE?.replace(/\/+$/,"") || "";
const json = (r)=> { if(!r.ok) throw new Error(r.statusText); return r.json(); };
const token = () => localStorage.getItem("token") || "";

function Layout({children}) {
  const nav = [
    { to: "/", label: "Dashboard" },
    { to: "/integrations", label: "Integrations" },
    { to: "/policy", label: "Policy" },
    { to: "/account", label: "Account" },
    { to: "/admin", label: "Admin" },
    { to: "/test", label: "Test Events" },
  ];
  return (
    <div style={appWrap}>
      <header style={topbar}>
        <div style={brandWrap}>
          <img src="/logo-cgp.png" alt="Logo" style={{ height: 60 }} />
        </div>
        <nav style={navWrap}>
          {nav.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              style={({isActive})=>({
                ...navBtn,
                background: isActive ? "rgba(255,255,255,.10)" : "transparent"
              })}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main style={mainWrap}>{children}</main>
    </div>
  );
}

function Dashboard(){
  const [me,setMe]=React.useState(null);
  const [err,setErr]=React.useState("");
  React.useEffect(()=>{
    if(!token()) { setErr("Not logged in"); return; }
    fetch(`${API}/me`,{headers:{Authorization:`Bearer ${token()}`}})
      .then(json).then(setMe).catch(()=>setErr("API error"));
  },[]);
  return (
    <section style={section}>
      <h1 style={h1}>Dashboard</h1>
      {!token() ? <div style={warn}>Please log in.</div> :
        err ? <div style={warn}>{err}</div> :
        me ? (
          <div style={grid4}>
            <Card title="Tenant" value={me.name||me.tenant_id}/>
            <Card title="Plan" value={me.plan}/>
            <Card title="DB health" value="ok"/>
            <Card title="API" value={API||"—"}/>
          </div>
        ) : <div>Loading…</div>}
    </section>
  );
}

function Integrations(){
  const k = localStorage.getItem("api_key");
  return (
    <section style={section}>
      <h1 style={h1}>Integrations</h1>
      <div style={{opacity:.8, marginBottom:12}}>API Key: <code style={code}>{k||"— none —"}</code></div>
      <div style={grid3}>
        <Block title="Email (phish)">
          <p style={muted}>Post phish samples to <code style={code}>/email/scan</code></p>
        </Block>
        <Block title="EDR">
          <p style={muted}>Send suspicious process events to <code style={code}>/edr/ingest</code></p>
        </Block>
        <Block title="DNS">
          <p style={muted}>Forward resolver logs to <code style={code}>/dns/ingest</code></p>
        </Block>
      </div>
    </section>
  );
}

function Policy(){
  const [p,setP]=React.useState(null);
  const [msg,setMsg]=React.useState("");
  React.useEffect(()=>{
    if(!token()) return;
    fetch(`${API}/policy`,{headers:{Authorization:`Bearer ${token()}`}})
      .then(json).then(setP).catch(()=>setP(null));
  },[]);
  const save=async()=>{
    setMsg("");
    const r = await fetch(`${API}/policy`,{
      method:"POST",
      headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token()}`},
      body: JSON.stringify(p||{})
    }).then(json).catch(()=>({error:true}));
    setMsg(r.error ? "Save failed" : "Saved ✓");
  };
  return (
    <section style={section}>
      <h1 style={h1}>Policy</h1>
      {!token() ? <div style={warn}>Log in to edit policy.</div> :
       !p ? <div>Loading…</div> :
       <div style={{display:"grid",gap:10,maxWidth:520}}>
         <label><input type="checkbox" checked={!!p.enabled} onChange={e=>setP({...p,enabled:e.target.checked})}/> Enabled</label>
         <div>Threshold: <input type="number" step="0.1" value={p.threshold} onChange={e=>setP({...p,threshold:Number(e.target.value)})}/></div>
         <label><input type="checkbox" checked={!!p.dry_run} onChange={e=>setP({...p,dry_run:e.target.checked})}/> Dry-run (audit-only)</label>
         <button style={btn} onClick={save}>Save</button>
         <div>{msg}</div>
       </div>}
    </section>
  );
}

function Account(){
  const [me,setMe]=React.useState(null);
  const [key,setKey]=React.useState(localStorage.getItem("api_key")||"");
  const canCreate = me && ["basic","pro","pro_plus"].includes(me.plan);
  const refreshMe=()=>fetch(`${API}/me`,{headers:{Authorization:`Bearer ${token()}`}}).then(json).then(setMe);
  React.useEffect(()=>{ if(token()) refreshMe(); },[]);
  const createKey=async()=>{
    const r = await fetch(`${API}/apikeys`,{method:"POST",headers:{Authorization:`Bearer ${token()}`}}).then(json);
    const k = r.api_key; setKey(k); localStorage.setItem("api_key",k);
  };
  const upgrade=async(plan)=>{
    await fetch(`${API}/billing/mock-activate`,{
      method:"POST",
      headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token()}`},
      body: JSON.stringify({plan})
    }).then(json);
    await refreshMe();
  };
  return (
    <section style={section}>
      <h1 style={h1}>Account</h1>
      {!token() ? <div style={warn}>Log in to view account.</div> :
       !me ? <div>Loading…</div> :
       <>
         <div style={grid3}>
           <Card title="Plan" value={me.plan}/>
           <Card title="Tenant" value={me.name||me.tenant_id}/>
           <Card title="Email" value={me.contact_email || "—"}/>
         </div>
         <Block title="Billing (dev)">
           <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
             <button style={btn} onClick={()=>upgrade("basic")}>Activate Basic</button>
             <button style={btn} onClick={()=>upgrade("pro")}>Activate Pro</button>
             <button style={btn} onClick={()=>upgrade("pro_plus")}>Activate Pro+</button>
           </div>
         </Block>
         <Block title="API Key">
           {canCreate ? (
             key ? <div>Key: <code style={code}>{key}</code></div> :
             <button style={btn} onClick={createKey}>Create API Key</button>
           ) : <div style={muted}>No active paid plan. Upgrade to create an API key.</div>}
         </Block>
       </>}
    </section>
  );
}

function Admin(){
  const [rows,setRows]=React.useState(null);
  const [err,setErr]=React.useState("");
  React.useEffect(()=>{
    fetch(`${API}/admin/tenants`,{headers:{ "x-admin-key":"dev_admin_key" }})
      .then(json).then(r=>setRows(r.tenants||[])).catch(()=>setErr("API error"));
  },[]);
  return (
    <section style={section}>
      <h1 style={h1}>Admin</h1>
      {err && <div style={warn}>{err}</div>}
      {!rows ? <div>Loading…</div> :
       rows.length===0 ? <div style={muted}>No tenants</div> :
       <div style={{overflowX:"auto"}}>
         <table style={{width:"100%",borderCollapse:"collapse"}}>
           <thead><tr>
             <th style={thtd}>Tenant</th><th style={thtd}>Plan</th><th style={thtd}>Users</th>
             <th style={thtd}>Active Keys</th><th style={thtd}>Last Alert</th>
           </tr></thead>
           <tbody>
             {rows.map((t,i)=>(
               <tr key={i}>
                 <td style={thtd}>{t.name||t.id}</td>
                 <td style={thtd}>{t.plan}</td>
                 <td style={thtd}>{t.users}</td>
                 <td style={thtd}>{t.active_keys}</td>
                 <td style={thtd}>{t.last_alert ? new Date(Number(t.last_alert)*1000).toLocaleString() : "—"}</td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>}
    </section>
  );
}

function TestEvents(){
  const [result,setResult]=React.useState("");
  const put=(path,body)=>fetch(`${API}/${path}`,{
    method:"POST",
    headers:{ "Content-Type":"application/json", "x-api-key": (localStorage.getItem("api_key")||"") },
    body: JSON.stringify(body)
  }).then(json);
  return (
    <section style={section}>
      <h1 style={h1}>Test Events</h1>
      <div style={grid3}>
        <Block title="Email (phish)"><button style={btn} onClick={()=>put("email/scan",{emails:[{from:"Support <help@paypa1.com>",subject:"Urgent: verify your account"}]}).then(r=>setResult(JSON.stringify(r,null,2))).catch(e=>setResult(String(e)))}>Send sample</button></Block>
        <Block title="EDR"><button style={btn} onClick={()=>put("edr/ingest",{events:[{host:"FINANCE-LAPTOP-7",process:"powershell.exe",cmdline:"powershell -enc SQBFAE4A...",file_ops:{burst:1200}}]}).then(r=>setResult(JSON.stringify(r,null,2))).catch(e=>setResult(String(e)))}>Send sample</button></Block>
        <Block title="DNS"><button style={btn} onClick={()=>put("dns/ingest",{events:[{qname:"evil-top-domain.top",qtype:"A",newly_registered:true,verdict:"dns-tunnel"}]}).then(r=>setResult(JSON.stringify(r,null,2))).catch(e=>setResult(String(e)))}>Send sample</button></Block>
      </div>
      {result && <pre style={pre}>{result}</pre>}
    </section>
  );
}

function App(){
  const loc = useLocation();
  return (
    <Layout>
      <Routes location={loc}>
        <Route path="/" element={<Dashboard/>}/>
        <Route path="/integrations" element={<Integrations/>}/>
        <Route path="/policy" element={<Policy/>}/>
        <Route path="/account" element={<Account/>}/>
        <Route path="/admin" element={<Admin/>}/>
        <Route path="/test" element={<TestEvents/>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </Layout>
  );
}

const appWrap = {minHeight:"100vh",background:"linear-gradient(180deg,#0b0d12,#131620)",color:"#e6e9ef",fontFamily:"-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial,sans-serif"};
const topbar = {display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",borderBottom:"1px solid rgba(255,255,255,.08)",position:"sticky",top:0,backdropFilter:"blur(8px)"};
const brandWrap = {display:"flex",alignItems:"center",gap:10};
const navWrap = {display:"flex",gap:8,flexWrap:"wrap"};
const navBtn = {padding:"8px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,.15)",textDecoration:"none",color:"#e6e9ef"};
const mainWrap = {display:"grid",placeItems:"start",padding:"20px 16px"};
const section = {width:"min(1100px,96vw)",margin:"0 auto"};
const h1 = {margin:"0 0 12px",fontSize:22,fontWeight:800,letterSpacing:.3};
const grid4 = {display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12};
const grid3 = {display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12};
const card = {padding:16,border:"1px solid rgba(255,255,255,.1)",borderRadius:12,background:"rgba(255,255,255,.04)"};
const btn = {padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};
const warn = {padding:"10px 12px",border:"1px solid #c69026",background:"#c6902615",borderRadius:10,margin:"8px 0"};
const code = {padding:"2px 6px",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,background:"rgba(255,255,255,.05)"};
const muted = {opacity:.8};
function Card({title,value}){return <div style={card}><div style={{opacity:.75,fontSize:13}}>{title}</div><div style={{fontSize:22,fontWeight:700,marginTop:6}}>{value}</div></div>;}
function Block({title,children}){return <div style={card}><div style={{fontWeight:700,marginBottom:8}}>{title}</div>{children}</div>;}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter><App/></BrowserRouter>
  </React.StrictMode>
);
