import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Api, setToken } from "../lib/api.js";

export default function Login(){
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  async function submit(e){
    e.preventDefault();
    setErr("");
    try{
      const j = await Api.post("/auth/login", { email, password });
      if(!j?.token){
        setErr(j?.error || "Login failed");
        return;
      }
      setToken(j.token);
      navigate("/");
    }catch(e){
      setErr(e?.message || "Network error");
    }
  }

  return (
    <Wrap>
      <Card>
        <h1 style={{margin:"0 0 12px"}}>Login</h1>
        <p style={{opacity:.8,marginTop:-6}}>Sign in to continue</p>
        <form onSubmit={submit} style={{display:"grid",gap:10,marginTop:12}}>
          <label>Email
            <input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={inp}/>
          </label>
          <label>Password
            <input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={inp}/>
          </label>
          {err && <div style={errBox}>{err}</div>}
          <button style={primary}>Sign in</button>
        </form>
        <div style={{marginTop:10,opacity:.8,fontSize:13}}>
          No account? <Link to="/register" style={{color:"#9ecbff"}}>Register</Link>
        </div>
      </Card>
    </Wrap>
  );
}

function Wrap({children}){return <div style={wrap}>{children}</div>;}
function Card({children}){return <div style={card}>{children}</div>;}
const wrap={minHeight:"100vh",display:"grid",placeItems:"center",background:"linear-gradient(180deg,#0b0d12,#131620)",color:"#e6e9ef",
  fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Helvetica,Arial,sans-serif"};
const card={width:"min(420px,92vw)",padding:20,background:"rgba(24,26,34,.8)",border:"1px solid rgba(255,255,255,.08)",borderRadius:14,backdropFilter:"blur(6px)"};
const inp={width:"100%",marginTop:6,padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"inherit"};
const primary={padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};
const errBox={padding:"8px 10px",border:"1px solid #ff6961",background:"#ff69611a",borderRadius:8};
