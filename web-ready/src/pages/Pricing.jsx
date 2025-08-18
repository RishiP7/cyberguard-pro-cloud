import React, { useEffect, useMemo, useState } from "react";
const API_BASE = (import.meta?.env?.VITE_API_BASE) || "http://localhost:8080";

const PLANS = [
  { id:"basic",   name:"Basic",   price:"£299/mo", blurb:"Email/inbox threat monitoring for small teams." },
  { id:"pro",     name:"Pro",     price:"£599/mo", blurb:"Email + Endpoint, DNS, UEBA coverage." },
  { id:"pro_plus",name:"Pro+",    price:"£899/mo", blurb:"Full-stack protection + priority auto-remediation." },
];

export default function Pricing(){
  const token = useMemo(()=>localStorage.getItem("token")||"",[]);
  const [current,setCurrent]=useState(null);
  const [selected,setSelected]=useState("");
  const [msg,setMsg]=useState("");
  const [apiKey,setApiKey]=useState(localStorage.getItem("apiKey")||"");
  const [busy,setBusy]=useState(false);

  async function loadMe(){
    if(!token) return;
    try{
      const r=await fetch(`${API_BASE}/me`,{headers:{Authorization:"Bearer "+token}});
      const j=await r.json().catch(()=>({}));
      if(j.ok) setCurrent(j.tenant);
    }catch(e){}
  }
  useEffect(()=>{ loadMe(); },[]);

  async function mockChoose(planId){
    if(!token){ setMsg("Please login first."); location.href="/login"; return; }
    setBusy(true); setMsg("Activating (mock)…"); setSelected(planId);
    try{
      const r = await fetch(`${API_BASE}/billing/upgrade`,{
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+token },
        body: JSON.stringify({ plan: planId })
      });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || !j.ok) throw new Error(j.error || "Upgrade failed");
      setMsg(`✅ Plan set to ${planId.replace('_',' + ').toUpperCase()}`);
      await loadMe();
    }catch(e){ setMsg("Upgrade error: "+String(e.message||e)); }
    finally{ setBusy(false); }
  }

  async function stripeCheckout(planId){
    if(!token){ setMsg("Please login first."); location.href="/login"; return; }
    setBusy(true); setMsg("Creating Stripe checkout…"); setSelected(planId);
    try{
      const r = await fetch(`${API_BASE}/billing/stripe/create-checkout`,{
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+token },
        body: JSON.stringify({ plan: planId })
      });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || !j.ok || !j.url) throw new Error(j.error || "Stripe init failed");
      location.href = j.url; // redirect to Stripe
    }catch(e){ setMsg("Stripe error: "+String(e.message||e)); setBusy(false); }
  }

  async function createKey(){
    if(!token){ setMsg("Please login first."); location.href="/login"; return; }
    if(!current || current.plan==='trial'){ setMsg("Select a plan first."); return; }
    setBusy(true); setMsg("Creating API key…");
    try{
      const r=await fetch(`${API_BASE}/apikeys`,{method:"POST",headers:{Authorization:"Bearer "+token}});
      const t=await r.text(); let j={}; try{ j=JSON.parse(t);}catch{}
      if(!r.ok || !j.api_key) throw new Error(j.error || t || "Could not create API key");
      setApiKey(j.api_key); localStorage.setItem("apiKey", j.api_key);
      setMsg("API key created ✓");
    }catch(e){ setMsg("API key error: "+String(e.message||e)); }
    finally{ setBusy(false); }
  }

  function copyKey(){ if(apiKey) navigator.clipboard?.writeText(apiKey).then(()=>setMsg("Copied ✓")).catch(()=>setMsg("Copy failed")); }

  const ui={page:{minHeight:"100vh",background:"linear-gradient(180deg,#0b0d12,#131620)",color:"#e6e9ef",
    fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Helvetica,Arial,sans-serif"},
    shell:{maxWidth:1100, margin:"0 auto", padding:"22px 18px 40px"},
    nav:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18},
    brand:{display:"flex",alignItems:"center",gap:10,fontWeight:800,letterSpacing:.2,opacity:.98,fontSize:18},
    dot:{width:12,height:12,borderRadius:999,background:"#1f6feb",boxShadow:"0 0 12px #1f6feb"},
    links:{display:"flex",gap:8,flexWrap:"wrap"},
    link:(active)=>({padding:"8px 10px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:active?"rgba(255,255,255,.1)":"transparent",color:"#e6e9ef",textDecoration:"none"}),
    grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16,marginTop:10},
    card:{background:"linear-gradient(180deg,rgba(28,30,38,.8),rgba(24,26,34,.8))",
      border:"1px solid rgba(255,255,255,.08)",borderRadius:16,boxShadow:"0 10px 30px rgba(0,0,0,.35)",backdropFilter:"blur(8px)",padding:16},
    price:{fontSize:22,fontWeight:800,margin:"2px 0 6px"},
    muted:{opacity:.85}, btn:{padding:"10px 12px",borderRadius:12,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"white",cursor:"pointer",fontWeight:600,width:"100%"},
    ghost:{padding:"8px 12px",borderRadius:12,border:"1px solid rgba(255,255,255,.15)",background:"transparent",color:"#e6e9ef",cursor:"pointer"},
    code:{fontFamily:"ui-monospace,Menlo,Consolas,monospace",padding:"8px 10px",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,background:"rgba(255,255,255,.06)"},
    row:{display:"grid",gap:10,marginTop:12}, ok:{padding:"10px 12px",border:"1px solid #2ecc7155",background:"#2ecc7111",borderRadius:10,margin:"8px 0"},
    tag:(id)=>({padding:"4px 10px",borderRadius:999,fontSize:12,background:(current?.plan===id)?"#2ea043":"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)"})
  };

  const hasActivePlan = !!(current && current.plan && current.plan !== 'trial');

  return (
    <div style={ui.page}>
      <div style={ui.shell}>

        {/* Top nav */}
        <div style={ui.nav}>
          <div style={ui.brand}><div style={ui.dot}/><div>CyberGuard&nbsp;Pro</div></div>
          <div style={ui.links}>
            {current && <span style={ui.tag(current.plan)}>Current plan: {String(current.plan).replace('_',' + ').toUpperCase()}</span>}
            <a href="/" style={ui.link(false)}>Dashboard</a>
            <a href="/policy" style={ui.link(false)}>Policy</a>
            <a href="/test" style={ui.link(false)}>Test Events</a>
            <a href="/admin" style={ui.link(false)}>Admin</a>
            <a href="/login" style={ui.link(false)}>Login</a>
          </div>
        </div>

        <div style={{...ui.card, marginBottom:16}}>
          <h1 style={{margin:"6px 0 8px"}}>Choose your plan</h1>
          <div style={ui.muted}>Switch plans at any time. Upgrades take effect immediately.</div>
        </div>

        {/* Plans */}
        <div style={ui.grid}>
          {PLANS.map(p=>{
            const isCurrent = current?.plan === p.id;
            return (
              <div key={p.id} style={ui.card}>
                <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between"}}>
                  <h2 style={{margin:"4px 0 6px"}}>{p.name}</h2>
                  <div style={ui.price}>{p.price}</div>
                </div>
                <div style={{...ui.muted, marginBottom:10}}>{p.blurb}</div>
                <ul style={{margin:"8px 0 14px",paddingLeft:18, lineHeight:1.5}}>
                  {p.id==="basic" && (<><li>Email threat detection</li><li>Spoofing/phishing checks</li><li>Attachment & link risk scoring</li></>)}
                  {p.id==="pro" && (<><li>Everything in Basic</li><li>Endpoint & DNS telemetry</li><li>User behavior analytics (UEBA)</li></>)}
                  {p.id==="pro_plus" && (<><li>Everything in Pro</li><li>Full-stack + auto-remediation</li><li>Priority support</li></>)}
                </ul>
                <div style={{display:"grid",gap:8}}>
                  <button
                    style={ui.btn}
                    onClick={()=>mockChoose(p.id)}
                    disabled={busy || isCurrent}
                  >
                    {isCurrent ? "Current plan ✓" : (busy && selected===p.id ? "Updating…" : `Activate (Mock): ${p.name}`)}
                  </button>
                  <button
                    style={{...ui.ghost}}
                    onClick={()=>stripeCheckout(p.id)}
                    disabled={busy}
                    title="Uses Stripe test mode (optional)"
                  >
                    Pay with Stripe (test)
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {msg && <div style={ui.ok}>{msg}</div>}

        {/* API key helper — only if plan is active */}
        {hasActivePlan && (
          <div style={{...ui.card, marginTop:16}}>
            <h3 style={{margin:"0 0 8px"}}>API key</h3>
            {!apiKey ? (
              <>
                <div style={ui.muted}>Generate a key to integrate with your systems (Email/EDR/DNS/UEBA).</div>
                <div style={{marginTop:10}}><button style={{...ui.btn, width:260}} onClick={createKey} disabled={busy}>{busy?"Working…":"Generate API Key"}</button></div>
              </>
            ) : (
              <>
                <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <code style={ui.code}>{apiKey}</code>
                  <button style={ui.ghost} onClick={copyKey}>Copy</button>
                </div>
                <div style={{marginTop:10}}>
                  <a href="/" style={ui.link(true)}>Go to Dashboard</a>
                  <span> · </span>
                  <a href="/test" style={ui.link(false)}>Send Test Events</a>
                </div>
              </>
            )}
          </div>
        )}

        {!hasActivePlan && (
          <div style={{...ui.card, marginTop:16, border:"1px solid #c6902655", background:"#c6902611"}}>
            <b>No active plan.</b> Choose a plan above to enable API key creation.
          </div>
        )}

      </div>
    </div>
  );
}
