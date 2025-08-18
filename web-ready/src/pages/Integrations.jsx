import React, { useEffect, useState } from "react";
import { apiGet } from "../api";

export default function Integrations(){
  const [me,setMe] = useState(null);
  const [err,setErr] = useState("");

  useEffect(()=>{ (async()=>{
    try { setMe(await apiGet("/me")); }
    catch(e){ setErr(e.error||"Failed to load profile"); }
  })(); },[]);

  if (err) return <Page><h1>Integrations</h1><ErrorBox>{err}</ErrorBox></Page>;
  if (!me) return <Page><h1>Integrations</h1><div>Loading…</div></Page>;

  const paid = ["basic","pro","pro_plus"].includes(me.plan);
  const proPlus = me.plan === "pro_plus";

  return (
    <Page>
      <h1>Integrations</h1>

      {!paid && <Warn>Activate a plan in <b>Account</b> to enable integrations.</Warn>}

      <Grid>
        <Block title="Email (phish detection)">
          <p>Scan inbound emails for phishing indicators.</p>
          <Small>Endpoint: <code>/email/scan</code></Small>
        </Block>

        <Block title="EDR (endpoint telemetry)">
          <p>Stream suspicious process and file activity.</p>
          <Small>Endpoint: <code>/edr/ingest</code></Small>
        </Block>

        <Block title="DNS (resolver logs)">
          <p>Post DNS queries to detect tunnels and DGA.</p>
          <Small>Endpoint: <code>/dns/ingest</code></Small>
        </Block>

        <Block title={`UEBA (Microsoft 365 Audit) ${!proPlus ? "— Pro+ only" : ""}`} disabled={!proPlus}>
          <p>Sign-in anomalies, impossible travel, mass downloads.</p>
          <Small>Docs: set Graph permissions and webhook URL.</Small>
        </Block>

        <Block title={`Cloud (CloudTrail/Defender) ${!proPlus ? "— Pro+ only" : ""}`} disabled={!proPlus}>
          <p>Forward high-severity cloud security findings.</p>
          <Small>Docs: forwarding setup steps.</Small>
        </Block>
      </Grid>
    </Page>
  );
}

function Page({children}){ return <div style={{padding:16}}>{children}</div>; }
function Grid({children}){ return <div style={{display:"grid",gridTemplateColumns:"repeat(2, minmax(260px, 1fr))",gap:12}}>{children}</div>; }
function Block({title,children,disabled}){
  return (
    <div style={{
      border:"1px solid rgba(255,255,255,.12)",borderRadius:12,padding:16,
      background:"rgba(255,255,255,.04)",opacity:disabled?.8:1
    }}>
      <div style={{fontWeight:700,marginBottom:6}}>{title}</div>
      <div>{children}</div>
    </div>
  );
}
function Warn({children}){ return <div style={{margin:"10px 0",padding:"10px 12px",border:"1px solid #c69026",background:"#c6902615",borderRadius:10}}>{children}</div>; }
function ErrorBox({children}){ return <div style={{margin:"10px 0",padding:"10px 12px",border:"1px solid #ff7a7a88",background:"#ff7a7a22",borderRadius:10}}>{children}</div>; }
function Small({children}){ return <div style={{opacity:.8,fontSize:13,marginTop:6}}>{children}</div>; }
