import React, {useEffect, useState} from "react";

export default function Account({api}){
  const [me,setMe]=useState(null);
  const [usage,setUsage]=useState(null);
  const [msg,setMsg]=useState("");

  async function refresh(){
    setMsg("");
    const token=localStorage.getItem("token");
    const [m,u]=await Promise.all([
      fetch(`${api}/me`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json()),
      fetch(`${api}/usage`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json()).catch(()=>({}))
    ]);
    setMe(m); setUsage(u);
  }
  useEffect(()=>{ refresh(); },[]);

  async function activate(plan){
    const token=localStorage.getItem("token");
    const r=await fetch(`${api}/billing/mock-activate`,{
      method:"POST",
      headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      body: JSON.stringify({ plan })
    });
    const j=await r.json();
    if(j.ok){ setMsg(`Plan set to ${j.plan}`); refresh(); }
    else setMsg(j.error||"Plan change failed");
  }

  async function createKey(){
    setMsg("");
    const token=localStorage.getItem("token");
    const r=await fetch(`${api}/apikeys`,{method:"POST",headers:{Authorization:`Bearer ${token}`}});
    const j=await r.json();
    if(j.api_key){
      localStorage.setItem("api_key", j.api_key);
      setMsg("API key created and saved to localStorage.api_key");
    } else setMsg(j.error||"Key create failed");
  }

  if(!me) return <div>Loading…</div>;

  const card={padding:16,border:"1px solid rgba(255,255,255,.1)",borderRadius:12,background:"rgba(255,255,255,.04)",marginBottom:12};
  const btn={padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer",marginRight:8};

  const paid = ["basic","pro","pro_plus"].includes(me.plan);

  return (
    <div>
      <h1 style={{marginTop:0}}>Account</h1>

      <div style={card}>
        <div><b>Company:</b> {me.name}</div>
        <div><b>Plan:</b> {me.plan}</div>
        <div><b>API calls (30d):</b> {usage?.api_calls_30d ?? "-"}</div>
        <div style={{marginTop:10}}>
          <button style={btn} onClick={()=>activate("basic")}>Choose Basic</button>
          <button style={btn} onClick={()=>activate("pro")}>Choose Pro</button>
          <button style={btn} onClick={()=>activate("pro_plus")}>Choose Pro+</button>
        </div>
      </div>

      <div style={card}>
        <div style={{marginBottom:8}}><b>API Key</b></div>
        {!paid ? (
          <div>Activate a paid plan to enable API keys.</div>
        ) : (
          <>
            <div style={{marginBottom:8}}>Current (from localStorage): <code>{localStorage.getItem("api_key") || "— none —"}</code></div>
            <button style={btn} onClick={createKey}>Create API Key</button>
          </>
        )}
      </div>

      {msg && <div style={{marginTop:6,opacity:.9}}>{msg}</div>}
    </div>
  );
}
