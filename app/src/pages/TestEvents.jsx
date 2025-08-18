import React,{useEffect,useState} from "react";
import { Link } from "react-router-dom";

export default function TestEvents({api}){
  const [apiKey,setApiKey]=useState(localStorage.getItem("api_key")||"");
  const [result,setResult]=useState("");

  useEffect(()=>{ setApiKey(localStorage.getItem("api_key")||""); },[]);

  async function send(path, body){
    setResult("");
    try{
      const r=await fetch(`${api}/${path}`,{
        method:"POST",
        headers:{ "Content-Type":"application/json", "x-api-key": apiKey },
        body: JSON.stringify(body)
      });
      const j=await r.json().catch(()=>({ok:false}));
      setResult(JSON.stringify(j,null,2));
    }catch(e){ setResult("Network error"); }
  }

  const box={border:"1px solid rgba(255,255,255,.1)",borderRadius:12,padding:16,background:"rgba(255,255,255,.03)",marginBottom:12};
  const btn={padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};

  return (
    <div>
      <h1 style={{marginTop:0}}>Test Events</h1>
      <div style={{marginBottom:10}}><Link to="/" style={{textDecoration:"none"}}>← Back to Dashboard</Link></div>

      <div style={box}>
        <div style={{marginBottom:6}}>API key (from localStorage): <code>{apiKey || "— none —"}</code></div>
        <div style={{opacity:.8}}>Create one in <a href="/account">Account</a> (paid plans).</div>
      </div>

      <div style={box}>
        <div style={{fontWeight:700,marginBottom:6}}>Email (phish)</div>
        <button style={btn} onClick={()=>send("email/scan",{emails:[{from:"Support <help@paypa1.com>",subject:"Urgent: verify your account"}]})}>Send sample</button>
      </div>

      <div style={box}>
        <div style={{fontWeight:700,marginBottom:6}}>EDR (PowerShell suspicious)</div>
        <button style={btn} onClick={()=>send("edr/ingest",{events:[{host:"FINANCE-LAPTOP-7",process:"powershell.exe",cmdline:"powershell -enc SQBFAE4A...",file_ops:{burst:1200}}]})}>Send sample</button>
      </div>

      <div style={box}>
        <div style={{fontWeight:700,marginBottom:6}}>DNS (DNS tunnel)</div>
        <button style={btn} onClick={()=>send("dns/ingest",{events:[{qname:"evil-top-domain.top",qtype:"A",newly_registered:true,verdict:"dns-tunnel"}]})}>Send sample</button>
      </div>

      <div style={{whiteSpace:"pre-wrap",padding:10,border:"1px solid rgba(255,255,255,.1)",borderRadius:10,background:"rgba(255,255,255,.05)"}}>
        {result || "— output —"}
      </div>
    </div>
  );
}
