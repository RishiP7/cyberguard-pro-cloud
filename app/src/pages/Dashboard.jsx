import React, {useEffect, useState} from "react";

export default function Dashboard({api}){
  const [me,setMe]=useState(null);
  const [stats,setStats]=useState(null);
  const [err,setErr]=useState("");

  useEffect(()=> {
    const token = localStorage.getItem("token");
    if(!token){ setErr("Not logged in"); return; }
    Promise.all([
      fetch(`${api}/me`, { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.json()),
      fetch(`${api}/usage`, { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.json()).catch(()=>({}))
    ]).then(([m,u])=>{
      if(m.error){ setErr(m.error); return; }
      setMe(m);
      setStats(u);
    }).catch(()=> setErr("API error"));
  },[api]);

  if(err) return <div>{err}</div>;
  if(!me) return <div>Loading…</div>;

  const grid={display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12};
  const card={padding:16,border:"1px solid rgba(255,255,255,.1)",borderRadius:12,background:"rgba(255,255,255,.04)"};
  const Panel=({title,children})=>(<div style={card}><div style={{opacity:.75,fontSize:13}}>{title}</div><div style={{marginTop:6}}>{children}</div></div>);

  return (
    <div>
      <h1 style={{marginTop:0}}>Dashboard</h1>
      <div style={grid}>
        <Panel title="Tenant">{me.name}</Panel>
        <Panel title="Plan">{me.plan}</Panel>
        <Panel title="API calls (30d)">{stats?.api_calls_30d ?? "-"}</Panel>
        <Panel title="Alerts (24h)">{stats?.alerts_24h ?? "-"}</Panel>
      </div>
    </div>
  );
}
