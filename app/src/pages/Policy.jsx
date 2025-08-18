import React, {useEffect, useState} from "react";

export default function Policy({api}){
  const [p,setP]=useState(null);
  const [msg,setMsg]=useState("");

  async function load(){
    setMsg(""); 
    const token=localStorage.getItem("token");
    const r=await fetch(`${api}/policy`,{headers:{Authorization:`Bearer ${token}`}});
    const j=await r.json(); setP(j);
  }
  async function save(){
    setMsg("");
    const token=localStorage.getItem("token");
    const r=await fetch(`${api}/policy`,{
      method:"POST",
      headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      body: JSON.stringify(p)
    });
    const j=await r.json(); setP(j); setMsg("Saved");
  }

  useEffect(()=>{ load(); },[]);

  if(!p) return <div>Loading…</div>;

  const row={display:"grid",gridTemplateColumns:"200px 1fr",gap:12,alignItems:"center",margin:"8px 0"};
  const field={padding:"8px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.05)",color:"inherit"};
  const btn={padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};

  return (
    <div>
      <h1 style={{marginTop:0}}>Policy</h1>
      <div style={row}><div>Enabled</div><input type="checkbox" checked={!!p.enabled} onChange={e=>setP({...p,enabled:e.target.checked})} /></div>
      <div style={row}><div>Threshold</div><input className="field" style={field} type="number" step="0.1" value={p.threshold} onChange={e=>setP({...p,threshold:parseFloat(e.target.value)})} /></div>
      <div style={row}><div>Allow quarantine</div><input type="checkbox" checked={!!p.allow_quarantine} onChange={e=>setP({...p,allow_quarantine:e.target.checked})} /></div>
      <div style={row}><div>Allow DNS deny</div><input type="checkbox" checked={!!p.allow_dns_deny} onChange={e=>setP({...p,allow_dns_deny:e.target.checked})} /></div>
      <div style={row}><div>Allow disable account</div><input type="checkbox" checked={!!p.allow_disable_account} onChange={e=>setP({...p,allow_disable_account:e.target.checked})} /></div>
      <div style={row}><div>Dry-run (audit only)</div><input type="checkbox" checked={!!p.dry_run} onChange={e=>setP({...p,dry_run:e.target.checked})} /></div>
      <div style={{marginTop:12}}>
        <button style={btn} onClick={save}>Save</button>
        <span style={{marginLeft:10,opacity:.85}}>{msg}</span>
      </div>
    </div>
  );
}
