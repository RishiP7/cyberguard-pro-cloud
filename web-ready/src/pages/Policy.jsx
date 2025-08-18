import React,{useEffect,useState} from "react";
const BASE = import.meta.env.VITE_API_BASE || "";
export default function Policy(){
  const [p,setP]=useState(null); const [msg,setMsg]=useState("");
  useEffect(()=>{ (async()=>{
    const t=localStorage.getItem("token")||"";
    const r=await fetch(`${BASE}/policy`,{headers:{Authorization:`Bearer ${t}`}});
    const j=await r.json(); setP(j);
  })();},[]);
  async function save(){
    const t=localStorage.getItem("token")||"";
    const r=await fetch(`${BASE}/policy`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify(p)});
    const j=await r.json(); setP(j); setMsg("Saved");
    setTimeout(()=>setMsg(""),1500);
  }
  if(!p) return <div>Loading...</div>;
  const row={margin:"8px 0"};
  const btn={padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};
  return (
    <div>
      <h2 style={{marginTop:0}}>Policy</h2>
      <div style={row}><label><input type="checkbox" checked={!!p.enabled} onChange={e=>setP({...p,enabled:e.target.checked})}/> Enabled</label></div>
      <div style={row}>Threshold: <input type="number" step="0.1" value={p.threshold} onChange={e=>setP({...p,threshold:Number(e.target.value)})}/></div>
      <div style={row}><label><input type="checkbox" checked={!!p.allow_quarantine} onChange={e=>setP({...p,allow_quarantine:e.target.checked})}/> Allow quarantine</label></div>
      <div style={row}><label><input type="checkbox" checked={!!p.allow_dns_deny} onChange={e=>setP({...p,allow_dns_deny:e.target.checked})}/> Allow DNS deny</label></div>
      <div style={row}><label><input type="checkbox" checked={!!p.allow_disable_account} onChange={e=>setP({...p,allow_disable_account:e.target.checked})}/> Allow disable account</label></div>
      <div style={row}><label><input type="checkbox" checked={!!p.dry_run} onChange={e=>setP({...p,dry_run:e.target.checked})}/> Dry-run (audit only)</label></div>
      <button style={btn} onClick={save}>Save</button> {msg}
    </div>
  );
}
