import React, {useState} from "react";

export default function Login({api}){
  const [email, setEmail] = useState("you3@example.com");
  const [password, setPassword] = useState("test123");
  const [msg, setMsg] = useState("");

  async function submit(e){
    e.preventDefault();
    setMsg("");
    try{
      const r = await fetch(`${api}/auth/login`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ email, password })
      });
      const j = await r.json();
      if(j.token){
        localStorage.setItem("token", j.token);
        location.href = "/";
      }else{
        setMsg(j.error || "Login failed");
      }
    }catch(e){
      setMsg("Network error");
    }
  }

  const box={maxWidth:420,margin:"40px auto",padding:20,border:"1px solid rgba(255,255,255,.12)",borderRadius:12,background:"rgba(255,255,255,.03)"};
  const inp={width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"inherit",marginBottom:10};
  const btn={width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",cursor:"pointer"};
  const err={marginTop:8,opacity:.9,color:"#ff8a8a"};

  return (
    <div style={box}>
      <h2 style={{marginTop:0}}>Login</h2>
      <form onSubmit={submit}>
        <input style={inp} value={email} onChange={e=>setEmail(e.target.value)} placeholder="email" />
        <input style={inp} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="password" />
        <button style={btn} type="submit">Sign in</button>
      </form>
      {msg && <div style={err}>{msg}</div>}
    </div>
  );
}
