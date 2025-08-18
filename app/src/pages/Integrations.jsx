import React, {useEffect, useState} from "react";

export default function Integrations({api}){
  const [me,setMe]=useState(null);
  const [err,setErr]=useState("");

  useEffect(()=> {
    const token=localStorage.getItem("token");
    fetch(`${api}/me`,{headers:{Authorization:`Bearer ${token}`}})
      .then(r=>r.json()).then(j=>{ if(j.error) setErr(j.error); else setMe(j); })
      .catch(()=>setErr("API error"));
  },[api]);

  if(err) return <div>{err}</div>;
  if(!me) return <div>Loading…</div>;

  const paid = ["basic","pro","pro_plus"].includes(me.plan);
  const pro = ["pro","pro_plus"].includes(me.plan);
  const proPlus = me.plan==="pro_plus";

  const box={border:"1px solid rgba(255,255,255,.1)",borderRadius:12,padding:16,background:"rgba(255,255,255,.03)",marginBottom:12};
  const btn={padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};
  const hint={opacity:.8,fontSize:13,marginTop:6};

  return (
    <div>
      <h1 style={{marginTop:0}}>Integrations</h1>
      {!paid && <div style={{...box,borderColor:"#c69026"}}>Your plan is <b>{me.plan}</b>. Upgrade in <a href="/account">Account</a> to enable integrations.</div>}

      <div style={box}>
        <div style={{fontWeight:700}}>Email Scanner</div>
        <div style={hint}>Connect IMAP or webhook to scan inbound mail for phishing.</div>
        <button style={btn} disabled={!paid} onClick={()=>alert("In docs: IMAP/webhook setup")}>
          View setup instructions
        </button>
      </div>

      <div style={box}>
        <div style={{fontWeight:700}}>EDR Agent</div>
        <div style={hint}>Stream endpoint telemetry (process, command line, file ops) to detect malware.</div>
        <button style={btn} disabled={!pro} onClick={()=>alert("In docs: EDR agent install command")}>
          View setup instructions { !pro && "(Pro+)" }
        </button>
      </div>

      <div style={box}>
        <div style={{fontWeight:700}}>DNS Logs</div>
        <div style={hint}>Post resolver logs to catch DGAs, tunneling, and C2.</div>
        <button style={btn} disabled={!pro} onClick={()=>alert("In docs: DNS forwarder snippet")}>
          View setup instructions { !pro && "(Pro+)" }
        </button>
      </div>

      <div style={box}>
        <div style={{fontWeight:700}}>UEBA (M365 Audit)</div>
        <div style={hint}>Monitor sign-in anomalies, mass downloads, impossible travel.</div>
        <button style={btn} disabled={!proPlus} onClick={()=>alert("In docs: Graph audit permissions + webhook URL")}>
          View setup instructions { !proPlus && "(Pro+ only)" }
        </button>
      </div>

      <div style={box}>
        <div style={{fontWeight:700}}>Cloud (CloudTrail/Defender)</div>
        <div style={hint}>Forward cloud security logs for high-severity detections.</div>
        <button style={btn} disabled={!proPlus} onClick={()=>alert("In docs: CloudTrail/Defender forwarding")}>
          View setup instructions { !proPlus && "(Pro+ only)" }
        </button>
      </div>
    </div>
  );
}
