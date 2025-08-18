import React,{useEffect,useState} from "react";
const BASE = import.meta.env.VITE_API_BASE || "";
export default function Account(){
  const [me,setMe]=useState(null);
  const [keys,setKeys]=useState([]);
  const [msg,setMsg]=useState("");
  useEffect(()=>{ (async()=>{
    const t=localStorage.getItem("token")||"";
    const r1=await fetch(`${BASE}/me`,{headers:{Authorization:`Bearer ${t}`}});
    const j1=await r1.json(); setMe(j1);
    const r2=await fetch(`${BASE}/apikeys`,{headers:{Authorization:`Bearer ${t}`}});
    const j2=await r2.json(); setKeys(j2.keys||[]);
  })();},[]);
  async function createKey(){
    const t=localStorage.getItem("token")||"";
    const r=await fetch(`${BASE}/apikeys`,{method:"POST",headers:{Authorization:`Bearer ${t}`}});
    const j=await r.json(); if(j.api_key){ localStorage.setItem("api_key",j.api_key); setMsg("API key created and saved"); 
      const r2=await fetch(`${BASE}/apikeys`,{headers:{Authorization:`Bearer ${t}`}});
      const j2=await r2.json(); setKeys(j2.keys||[]);
    } else { setMsg(j.error||"Failed"); }
  }
  async function upgrade(plan){
    const t=localStorage.getItem("token")||"";
    const r=await fetch(`${BASE}/billing/mock-activate`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({plan})});
    const j=await r.json(); setMsg(`Plan set to ${j.plan||"?"}`);
    const r1=await fetch(`${BASE}/me`,{headers:{Authorization:`Bearer ${t}`}});
    const j1=await r1.json(); setMe(j1);
  }
  if(!me) return <div>Loading...</div>;
  const btn={padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};
  const box={border:"1px solid rgba(255,255,255,.1)",borderRadius:12,padding:16,background:"rgba(255,255,255,.03)",margin:"0 0 12px"};
  const thtd={padding:"6px 8px",borderBottom:"1px solid rgba(255,255,255,.08)"};
  return (
    <div>
      <h2 style={{marginTop:0}}>Account</h2>
      <div style={box}>
        <div><b>Company:</b> {me.name}</div>
        <div><b>Plan:</b> {me.plan}</div>
        <div style={{marginTop:8}}>
          <button style={btn} onClick={()=>upgrade("basic")}>Switch to Basic</button>{' '}
          <button style={btn} onClick={()=>upgrade("pro")}>Upgrade to Pro</button>{' '}
          <button style={btn} onClick={()=>upgrade("pro_plus")}>Upgrade to Pro+</button>
        </div>
      </div>
      <div style={box}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><b>API Keys</b></div>
          {me.plan!=="trial" && <button style={btn} onClick={createKey}>Create API Key</button>}
        </div>
        {me.plan==="trial" && <div style={{marginTop:8,opacity:.8}}>No active plan. Choose a plan above to enable API key creation.</div>}
        {keys.length>0 && (
          <div style={{marginTop:8,overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%"}}>
              <thead><tr><th style={thtd}>Key ID</th><th style={thtd}>Created</th><th style={thtd}>Status</th></tr></thead>
              <tbody>
                {keys.map(k=>(
                  <tr key={k.id}>
                    <td style={thtd}>{k.id}</td>
                    <td style={thtd}>{k.created_at? new Date(Number(k.created_at)*1000).toLocaleString():'-'}</td>
                    <td style={thtd}>{k.revoked?'revoked':'active'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {msg && <div style={{marginTop:8,opacity:.9}}>{msg}</div>}
    </div>
  );
}
