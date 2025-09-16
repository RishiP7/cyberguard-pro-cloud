import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API } from "../lib/api.js";

export default function Register(){
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e){
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);
    try{
      const payload = { company: company.trim(), email: email.trim().toLowerCase(), password };
      const j = await API.post("/auth/register", payload);
      if(j?.error){ setErr(j.error); return; }
      setMsg("🎉 Account created! Redirecting to login…");
      setTimeout(()=>navigate("/login"), 1400);
    }catch(_e){
      setErr("⚠️ Could not register right now. Please try again.");
    } finally { setLoading(false); }
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={headerRow}>
          <div style={title}>Create your account</div>
          <div style={subtitle}>7‑day free trial • no card required</div>
        </div>

        <form onSubmit={submit} style={{display:"grid", gap:12, marginTop:14}}>
          <label style={label}>Company
            <input style={input} value={company} onChange={e=>setCompany(e.target.value)} placeholder="Your company" required />
          </label>
          <label style={label}>Email
            <input type="email" style={input} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" required />
          </label>
          <label style={label}>Password
            <input type="password" style={input} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimum 8 characters" minLength={8} required />
          </label>

          {err && <div style={errorBox}>{err}</div>}
          {msg && <div style={okBox}>{msg}</div>}

          <button disabled={loading} style={{...btnPrimary, opacity: loading? .7:1}}>
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <div style={{marginTop:14, fontSize:13, opacity:.85}}>
          Already have an account? <Link to="/login" style={{color:"#8cc8ff"}}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}

// --- styles (match dark/glass UI used elsewhere) ---
const wrap={minHeight:"calc(100vh - 60px)", display:"grid", placeItems:"start center", paddingTop:40,
  background:"transparent", color:"#e6e9ef", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Helvetica,Arial,sans-serif"};
const card={ width:"min(520px, 92vw)", background:"rgba(24,26,34,.75)", border:"1px solid rgba(255,255,255,.08)", borderRadius:14,
  boxShadow:"0 10px 30px rgba(0,0,0,.35)", padding:22, backdropFilter:"blur(6px)" };
const headerRow={ display:"grid", gap:6 };
const title={ fontSize:20, fontWeight:600 };
const subtitle={ fontSize:13, opacity:.7 };
const label={ display:"grid", gap:6, fontSize:13 };
const input={ width:"100%", padding:"11px 12px", borderRadius:10, border:"1px solid rgba(255,255,255,.14)",
  background:"rgba(255,255,255,.06)", color:"#e6e9ef", outline:"none" };
const btnPrimary={ padding:"11px 12px", borderRadius:10, border:"1px solid #2b6dff55", background:"#2b6dff",
  color:"#fff", fontWeight:600, cursor:"pointer" };
const errorBox={ padding:"10px 12px", border:"1px solid #ff6b6b", background:"#ff6b6b1a", borderRadius:10 };
const okBox={ padding:"10px 12px", border:"1px solid #2ecc71", background:"#2ecc711a", borderRadius:10 };
