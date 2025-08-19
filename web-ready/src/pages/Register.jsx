import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API } from "../main.jsx";

export default function Register(){
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e){
    e.preventDefault();
    setErr("");
    setLoading(true);
    try{
      const payload = { company: company.trim(), email: email.trim(), password };
      const j = await API.post("/auth/register", payload);
      if(j?.error){
        setErr(j.error);
        return;
      }
      setOk(true);
      setTimeout(()=>navigate("/login"), 1200);
    }catch(_e){
      setErr("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Wrap>
      <Card>
        <h1 style={{margin:"0 0 12px"}}>Create account</h1>
        <p style={{margin:"0 0 12px", opacity:.8, fontSize:13}}>Start your 7‑day free trial. No card required to begin.</p>
        <form onSubmit={submit} style={{display:"grid",gap:10,marginTop:12}}>
          <label>Company
            <input required placeholder="Your company" autoComplete="organization" value={company} onChange={e=>setCompany(e.target.value)} style={inp}/>
          </label>
          <label>Email
            <input type="email" required placeholder="you@company.com" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={inp}/>
          </label>
          <label>Password
            <input type="password" required minLength={8} placeholder="Minimum 8 characters" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} style={inp}/>
          </label>
          {err && <div style={errBox}>{err}</div>}
          {ok && <div style={okBox}>Account created — redirecting…</div>}
          <button style={primary} disabled={loading || ok}>{loading ? "Creating…" : "Create account"}</button>
        </form>
        <div style={{marginTop:10,opacity:.8,fontSize:13}}>
          Already have an account? <Link to="/login" style={{color:"#9ecbff"}}>Login</Link>
        </div>
      </Card>
    </Wrap>
  );
}

function Wrap({children}){return <div style={wrap}>{children}</div>;}
function Card({children}){return <div style={card}>{children}</div>;}
const wrap={minHeight:"100vh",display:"grid",placeItems:"center",background:"linear-gradient(180deg,#0b0d12,#131620)",color:"#e6e9ef",
  fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Helvetica,Arial,sans-serif"};
const card={width:"min(480px,92vw)",padding:20,background:"rgba(24,26,34,.8)",border:"1px solid rgba(255,255,255,.08)",borderRadius:14,backdropFilter:"blur(6px)"};
const inp={width:"100%",marginTop:6,padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"inherit"};
const primary={padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer",opacity:1};
const errBox={padding:"8px 10px",border:"1px solid #ff6961",background:"#ff69611a",borderRadius:8};
const okBox={padding:"8px 10px",border:"1px solid #2ecc71",background:"#2ecc711a",borderRadius:8};
// subtle disabled styling via inline attr
// (React will set disabled on <button>; we reduce opacity via inline style when disabled)
