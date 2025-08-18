import React, {useEffect, useState} from "react";

export default function Admin({api}){
  const [key,setKey]=useState(localStorage.getItem("ADMIN_KEY")||"");
  const [items,setItems]=useState(null);
  const [err,setErr]=useState("");

  async function load(k){
    setErr("");
    try{
      const r=await fetch(`${api}/admin/tenants`,{headers:{'x-admin-key':k}});
      const j=await r.json();
      if(j.error){ setErr(j.error); setItems(null); }
      else setItems(j.tenants||[]);
    }catch{ setErr("API error"); }
  }

  useEffect(()=>{ if(key) load(key); },[]);

  const box={padding:16,border:"1px solid rgba(255,255,255,.1)",borderRadius:12,background:"rgba(255,255,255,.04)"};
  const inp={padding:"8px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.05)",color:"inherit",minWidth:340,marginRight:8};
  const btn={padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};

  return (
    <div>
      <h1 style={{marginTop:0}}>Admin</h1>
      <div style={{...box,marginBottom:12}}>
        <input style={inp} value={key} onChange={e=>setKey(e.target.value)} placeholder="ADMIN_KEY (e.g. dev_admin_key)"/>
        <button style={btn} onClick={()=>{ localStorage.setItem("ADMIN_KEY",key); load(key); }}>Load tenants</button>
      </div>
      {err && <div style={{marginBottom:12,color:"#ff8a8a"}}>{err}</div>}
      {items && (
        <div style={box}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              <th style={thtd}>Tenant</th><th style={thtd}>Plan</th><th style={thtd}>Users</th><th style={thtd}>Active keys</th><th style={thtd}>Last alert</th>
            </tr></thead>
            <tbody>
              {items.map(t=>(
                <tr key={t.id}>
                  <td style={thtd}>{t.name}</td>
                  <td style={thtd}>{t.plan}</td>
                  <td style={thtd}>{t.users}</td>
                  <td style={thtd}>{t.active_keys}</td>
                  <td style={thtd}>{t.last_alert? new Date(Number(t.last_alert)*1000).toLocaleString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
const thtd={textAlign:"left",padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.08)"};
