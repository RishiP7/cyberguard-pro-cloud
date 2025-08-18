import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API } from "../main.jsx";

export default function Register(){
  const [company, setCompany] = useState("Fresh Prints London");
  const [email, setEmail] = useState("newuser@example.com");
  const [password, setPassword] = useState("test123");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const navigate = useNavigate();

  async function submit(e){
    e.preventDefault();
    setErr("");
    try{
      const r = await fetch(`${API}/auth/register`,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ company, email, password })
      });
      const j = await r.json();
      if(!r.ok){
        setErr(j?.error || "Register failed");
        return;
      }
      setOk(true);
      setTimeout(()=>navigate("/login"), 1200);
    }catch(e){
      setErr("Network error");
    }
  }

  return (
    <Wrap>
      <Card>
        <h1 style={{margin:"0 0 12px"}}>Create account</h1>
        <form onSubmit={submit} style={{display:"grid",gap:10,marginTop:12}}>
          <label>Company
            <input value={company} onChange={e=>setCompany(e.target.value)} style={inp}/>
          </label>
          <label>Email
            <input value={email} onChange={e=>setEmail(e.target.value)} style={inp}/>
          </label>
          <label>Password
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={inp}/>
          </label>
          {err && <div style={errBox}>{err}</div>}
          {ok && <div style={okBox}>Account created — redirecting…</div>}
          <button style={primary}>Create account</button>
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
const primary={padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};
const errBox={padding:"8px 10px",border:"1px solid #ff6961",background:"#ff69611a",borderRadius:8};
const okBox={padding:"8px 10px",border:"1px solid #2ecc71",background:"#2ecc711a",borderRadius:8};
