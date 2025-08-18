import React, {useEffect, useState} from "react";
const BASE = import.meta.env.VITE_API_BASE || "";
export default function Dashboard(){
  const [me,setMe] = useState(null);
  const [usage,setUsage] = useState(null);
  const [error,setError] = useState("");
  useEffect(()=>{
    const t = localStorage.getItem("token")||"";
    (async()=>{
      try{
        const r1 = await fetch(`${BASE}/me`,{headers:{Authorization:`Bearer ${t}`}}); 
        const j1 = await r1.json(); if(!r1.ok) throw new Error(j1.error||"me failed");
        setMe(j1);
        const r2 = await fetch(`${BASE}/usage`,{headers:{Authorization:`Bearer ${t}`}}); 
        const j2 = await r2.json(); if(!r2.ok) throw new Error(j2.error||"usage failed");
        setUsage(j2);
      }catch(e){ setError(e.message||"API error"); }
    })();
  },[]);
  const grid={display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12};
  const card={padding:16,border:"1px solid rgba(255,255,255,.1)",borderRadius:12,background:"rgba(255,255,255,.04)"};
  if(error) return <div style={card}>Error: {error}</div>;
  if(!me||!usage) return <div style={card}>Loading...</div>;
  return (
    <div>
      <h2 style={{marginTop:0}}>Dashboard</h2>
      <div style={{opacity:.8,marginBottom:10}}>Tenant: <b>{me.name}</b> · Plan: <b>{me.plan}</b></div>
      <div style={grid}>
        <div style={card}><div>API Calls (30d)</div><div style={{fontSize:22,fontWeight:700}}>{usage.api_calls??0}</div></div>
        <div style={card}><div>Alerts (24h)</div><div style={{fontSize:22,fontWeight:700}}>{usage.alerts_24h??0}</div></div>
        <div style={card}><div>Remediated (24h)</div><div style={{fontSize:22,fontWeight:700}}>{usage.remediated_24h??0}</div></div>
        <div style={card}><div>Active Keys</div><div style={{fontSize:22,fontWeight:700}}>{usage.active_keys??0}</div></div>
      </div>
    </div>
  );
}
