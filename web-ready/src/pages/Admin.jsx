import React, { useEffect, useState } from "react";
import { adminGet } from "../api";

export default function Admin(){
  const [rows,setRows] = useState([]);
  const [err,setErr] = useState("");
  const [loading,setLoading] = useState(true);

  useEffect(()=>{ (async()=>{
    try{
      const r = await adminGet("/admin/tenants");
      setRows(r.tenants||[]);
    }catch(e){
      setErr(e.error || "Failed to load tenants. Is ADMIN_KEY correct on the server?");
    }finally{ setLoading(false); }
  })(); },[]);

  return (
    <div style={{padding:16}}>
      <h1>Admin</h1>
      {loading && <div>Loading…</div>}
      {err && <Err>{err}</Err>}
      {!loading && !err && (
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              <Th>Tenant</Th><Th>Plan</Th><Th>Users</Th><Th>Active Keys</Th><Th>Last alert</Th>
            </tr></thead>
            <tbody>
              {rows.map((t)=>(
                <tr key={t.id}>
                  <Td>{t.name}</Td>
                  <Td>{t.plan}</Td>
                  <Td>{t.users}</Td>
                  <Td>{t.active_keys}</Td>
                  <Td>{t.last_alert ? new Date(Number(t.last_alert)*1000).toLocaleString() : "-"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function Th({children}){ return <th style={{textAlign:"left",padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.12)",opacity:.8}}>{children}</th>; }
function Td({children}){ return <td style={{padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,.06)"}}>{children}</td>; }
function Err({children}){ return <div style={{margin:"10px 0",padding:"10px 12px",border:"1px solid #ff7a7a88",background:"#ff7a7a22",borderRadius:10}}>{children}</div>; }
