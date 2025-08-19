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
    const r=await fetch(`${BASE}/billing/activate`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({plan})});
    const j=await r.json(); setMsg(`Plan set to ${j.plan||"?"}`);
    const r1=await fetch(`${BASE}/me`,{headers:{Authorization:`Bearer ${t}`}});
    const j1=await r1.json(); setMe(j1);
  }
  if(!me) return <div>Loading...</div>;
  const paid = me.plan !== "trial";
  const trial = me?.trial;
  const showTrialBanner = (me.plan === "trial");
  const btn={padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};
  const box={border:"1px solid rgba(255,255,255,.1)",borderRadius:12,padding:16,background:"rgba(255,255,255,.03)",margin:"0 0 12px"};
  const thtd={padding:"6px 8px",borderBottom:"1px solid rgba(255,255,255,.08)"};
  const highlight = { background: 'rgba(31,111,235,.12)' };
  const col = (p) => (me.plan === p ? { ...thtd, ...highlight } : thtd);
  return (
    <div>
      <h1 style={{marginTop:0}}>Account</h1>
      {showTrialBanner && (
        <div style={{margin:"10px 0",padding:"10px 12px",border:"1px solid #c69026",background:"#c6902615",borderRadius:10}}>
          {trial?.active ? (
            <>Trial active — <b>{trial.days_left}</b> day{trial.days_left===1?'':'s'} left. Choose a plan below to keep protection after your trial.</>
          ) : (
            <>Your free trial has ended. Please choose a plan to continue using the service.</>
          )}
        </div>
      )}
      <div style={box}>
        <div><b>Company:</b> {me.name}</div>
        <div><b>Plan:</b> {me.plan}</div>
        <div style={{marginTop:8}}>
          <button style={btn} onClick={()=>upgrade("basic")}>Choose Basic</button>{' '}
          <button style={btn} onClick={()=>upgrade("pro")}>Choose Pro</button>{' '}
          <button style={btn} onClick={()=>upgrade("pro_plus")}>Choose Pro+</button>
        </div>
      </div>
      <div style={box}>
        <div style={{display:'flex',alignItems:'center',gap:12,justifyContent:'space-between'}}>
          <h3 style={{margin:'4px 0'}}>Compare plans</h3>
          <div style={{flex:1}} />
          <div style={{opacity:.8,fontSize:12}}>Basic £299 · Pro £599 · Pro+ £999 per month</div>
          {me.plan!=='pro_plus' && (
            <button style={{padding:"8px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"}}
                    onClick={()=>upgrade('pro_plus')}>Upgrade to Pro+</button>
          )}
        </div>
        <div style={{overflowX:'auto', marginTop:8}}>
          <table style={{borderCollapse:'collapse', width:'100%'}}>
            <thead>
              <tr>
                <th style={thtd}></th>
                <th style={col('basic')}>Basic</th>
                <th style={col('pro')}>Pro</th>
                <th style={col('pro_plus')}>Pro+</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={thtd} title="Scans company inboxes for phishing, spoofing, and malicious attachments">Email inbox monitoring</td>
                <td style={col('basic')}>✓</td><td style={col('pro')}>✓</td><td style={col('pro_plus')}>✓</td>
              </tr>
              <tr>
                <td style={thtd} title="Detects suspicious traffic, port scans, and blocklist hits on your network">Network monitoring</td>
                <td style={col('basic')}>–</td><td style={col('pro')}>✓</td><td style={col('pro_plus')}>✓</td>
              </tr>
              <tr>
                <td style={thtd} title="Watches endpoints for risky processes, malware, and anomalous behavior">Endpoint monitoring</td>
                <td style={col('basic')}>–</td><td style={col('pro')}>✓</td><td style={col('pro_plus')}>✓</td>
              </tr>
              <tr>
                <td style={thtd} title="Finds cloud misconfigurations and exposed keys/secrets">Cloud config & secrets</td>
                <td style={col('basic')}>–</td><td style={col('pro')}>–</td><td style={col('pro_plus')}>✓</td>
              </tr>
              <tr>
                <td style={thtd} title="Autonomous AI that quarantines threats, blocks IPs, and enforces policies">AI Security Agent (auto)</td>
                <td style={col('basic')}>–</td><td style={col('pro')}>–</td><td style={col('pro_plus')}>✓</td>
              </tr>
              <tr>
                <td style={thtd} title="New alerts appear instantly without refreshing the page">Real‑time alerts (live)</td>
                <td style={col('basic')}>✓</td><td style={col('pro')}>✓</td><td style={col('pro_plus')}>✓</td>
              </tr>
              <tr>
                <td style={thtd} title="Automatic responses that contain threats according to your policies">Policy enforcement</td>
                <td style={col('basic')}>–</td><td style={col('pro')}>–</td><td style={col('pro_plus')}>✓</td>
              </tr>
              <tr>
                <td style={thtd} title="Send high‑priority alerts to your team via Slack or Email">Slack/Email notifications</td>
                <td style={col('basic')}>–</td><td style={col('pro')}>✓</td><td style={col('pro_plus')}>✓</td>
              </tr>
              <tr>
                <td style={thtd} title="Programmatic access for integrating CyberGuard Pro into your systems">API access</td>
                <td style={col('basic')}>✓</td><td style={col('pro')}>✓</td><td style={col('pro_plus')}>✓</td>
              </tr>
              <tr>
                <td style={thtd} title="Faster response times and escalation with our team">Priority support</td>
                <td style={col('basic')}>–</td><td style={col('pro')}>–</td><td style={col('pro_plus')}>✓</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{marginTop:12, fontSize:13, lineHeight:1.5, opacity:.9}}>
          <p><b>Basic:</b> Email inbox monitoring, real‑time alerts, and API access to get started with CyberGuard Pro.</p>
          <p><b>Pro:</b> Everything in Basic plus full network and endpoint monitoring, Slack/Email notifications, and enhanced visibility for your team.</p>
          <p><b>Pro+:</b> The complete package — all Pro features plus cloud configuration & secrets scanning, automated AI Security Agent, policy enforcement, and priority support.</p>
        </div>
        <div style={{marginTop:8, opacity:.85, fontSize:12}}>
          Trial includes Basic features for 7 days.
        </div>
      </div>
      <div style={box}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><b>API Keys</b></div>
          {me.plan!=="trial" && <button style={btn} onClick={createKey}>Create API Key</button>}
        </div>
        {me.plan==="trial" && (
          <div style={{marginTop:8,opacity:.9,background:"#fffae6",padding:"10px 12px",border:"1px solid #e0c94d",borderRadius:8}}>
            <b>Heads up!</b> During your free trial, API access is limited. 
            Upgrade to a paid plan to generate and use your own API keys with CyberGuard Pro.
          </div>
        )}
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
        {keys.length===0 && (
          <div style={{marginTop:8,opacity:.8}}>
            You haven’t created any API keys yet. 
            <br />
            Once your plan is active, you can create a key here and it will be listed below.
          </div>
        )}
      </div>
      {msg && <div style={{marginTop:8,opacity:.9}}>{msg}</div>}
    </div>
  );
}
