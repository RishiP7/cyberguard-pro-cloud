import React, { useState } from "react";
import { API_BASE } from "../api";

export default function TestEvents(){
  const [out,setOut] = useState("");
  const apiKey = localStorage.getItem("api_key") || "";
  const me = JSON.parse(localStorage.getItem("me") || "{}");
  const isTrial = (me?.plan || "trial") === "trial" && me?.trial?.active;
  const trialDays = me?.trial?.days_left ?? null;

  async function send(path, body){
    setOut("Sending…");
    try{
      const r = await fetch(`${API_BASE}/${path}`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "x-api-key": apiKey || "" },
        body: JSON.stringify(body||{})
      });
      const text = await r.text();
      setOut((r.ok? "OK " : `HTTP ${r.status} `) + text);
    }catch(e){
      setOut(`Network error: ${e.message||e}`);
    }
  }

  return (
    <div style={{padding:16}}>
      <h1>Test Events</h1>
      {isTrial && (
        <div style={{margin:"10px 0",padding:"10px 12px",border:"1px solid #c69026",background:"#c6902615",borderRadius:10}}>
          Trial active — <b>{trialDays}</b> day{trialDays===1?'':'s'} left. Upgrade to keep protection after your trial.
        </div>
      )}
      <div style={{margin:"8px 0",opacity:.85}}>API key: <code>{apiKey || "— none — (create in Account)"}</code></div>

      <Row><b>Email</b>
        <button style={btn} onClick={()=>send("email/scan",{emails:[{from:"Support <help@paypa1.com>",subject:"Urgent: verify your account"}]})}>Send sample</button>
      </Row>

      <Row><b>EDR</b>
        <button style={btn} onClick={()=>send("edr/ingest",{events:[{host:"FINANCE-LAPTOP-7",process:"powershell.exe",cmdline:"powershell -enc SQBFAE4A...",file_ops:{burst:1200}}]})}>Send sample</button>
      </Row>

      <Row><b>DNS</b>
        <button style={btn} onClick={()=>send("dns/ingest",{events:[{qname:"evil-top-domain.top",qtype:"A",newly_registered:true,verdict:"dns-tunnel"}]})}>Send sample</button>
      </Row>

      <pre style={pre}>{out || "— output —"}</pre>
    </div>
  );
}
function Row({children}){ return <div style={{display:"flex",alignItems:"center",gap:12,margin:"10px 0"}}>{children}</div>; }
const btn={padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};
const pre={whiteSpace:"pre-wrap",padding:10,border:"1px solid rgba(255,255,255,.12)",borderRadius:10,background:"rgba(255,255,255,.05)",marginTop:12};
