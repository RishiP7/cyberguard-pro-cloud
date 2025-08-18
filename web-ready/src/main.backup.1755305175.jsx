import React, {useEffect, useState} from "react";
import ReactDOM from "react-dom/client";
import {BrowserRouter, Routes, Route, Navigate, Link, useNavigate} from "react-router-dom";

import Dashboard from "./pages/Dashboard.jsx";
import Integrations from "./pages/Integrations.jsx";
import Policy from "./pages/Policy.jsx";
import Account from "./pages/Account.jsx";
import Admin from "./pages/Admin.jsx";
import TestEvents from "./pages/TestEvents.jsx";

const BASE = import.meta.env.VITE_API_BASE || "";

function useAuth() {
  const [token, setToken] = useState(localStorage.getItem("token")||"");
  const login = (t)=>{ localStorage.setItem("token", t); setToken(t); };
  const logout = ()=>{ localStorage.removeItem("token"); setToken(""); };
  return { token, login, logout };
}

function Header({onLogout}) {
  const nav = {display:"flex",alignItems:"center",gap:10};
  const bar = {display:"flex",justifyContent:"space-between",alignItems:"center",
    padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,.08)",
    background:"#0e1116",color:"#e6e9ef",position:"sticky",top:0,zIndex:5};
  const link={padding:"8px 10px",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,textDecoration:"none",color:"#e6e9ef",background:"transparent"};
  const brand={display:"flex",alignItems:"center",gap:10,fontWeight:700};
  const logo = "/logo-cgp.png"; // place file at public/logo-cgp.png (optional)

  return (
    <div style={bar}>
      <div style={brand}>
        <img src={logo} onError={(e)=>{e.currentTarget.style.display='none'}} alt="" width="24" height="24"/>
        CyberGuard Pro
      </div>
      <div style={nav}>
        <Link to="/" style={link}>Dashboard</Link>
        <Link to="/integrations" style={link}>Integrations</Link>
        <Link to="/policy" style={link}>Policy</Link>
        <Link to="/account" style={link}>Account</Link>
        <Link to="/admin" style={link}>Admin</Link>
        <Link to="/test" style={link}>Test Events</Link>
        <button onClick={onLogout} style={{...link, background:"#1f6feb", color:"#fff"}}>Logout</button>
      </div>
    </div>
  );
}

function Layout({children, onLogout}) {
  const wrap={minHeight:"100vh",background:"linear-gradient(180deg,#0b0d12,#131620)",color:"#e6e9ef",
    fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif"};
  const main={maxWidth:"1100px",margin:"0 auto",padding:"16px"};
  return (
    <div style={wrap}>
      <Header onLogout={onLogout}/>
      <main style={main}>{children}</main>
    </div>
  );
}

function Login() {
  const { login } = useAuthInner();
  const [email,setEmail] = useState("");
  const [pass,setPass] = useState("");
  const [err,setErr] = useState("");
  const nav = useNavigate();

  async function doLogin(e){
    e.preventDefault();
    setErr("");
    try{
      const r = await fetch(`${BASE}/auth/login`,{
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ email, password: pass })
      });
      const j = await r.json();
      if(!r.ok || !j.token){ setErr(j.error||"Login failed"); return; }
      localStorage.setItem("token", j.token);
      login(j.token);
      nav("/");
    }catch(e){ setErr("Network error"); }
  }

  const card={maxWidth:420,margin:"8vh auto",padding:20,border:"1px solid rgba(255,255,255,.12)",borderRadius:12,background:"rgba(255,255,255,.04)"};
  const inp={width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.05)",color:"inherit",marginTop:8};
  const btn={width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"#1f6feb",color:"#fff",marginTop:12,cursor:"pointer"};
  const errBox={marginTop:10,padding:"8px 10px",border:"1px solid #ff6b6b55",background:"#ff6b6b15",borderRadius:8};

  return (
    <div style={card}>
      <h2 style={{margin:0}}>Sign in</h2>
      <div style={{opacity:.75,marginTop:6,fontSize:13}}>API: {BASE||"(missing VITE_API_BASE)"}</div>
      <form onSubmit={doLogin}>
        <label>Email<input className="inp" style={inp} value={email} onChange={e=>setEmail(e.target.value)} /></label>
        <label>Password<input type="password" style={inp} value={pass} onChange={e=>setPass(e.target.value)} /></label>
        <button style={btn} type="submit">Login</button>
      </form>
      {err && <div style={errBox}>{err}</div>}
    </div>
  );
}

// tiny auth context so Login/Layout can coordinate
const AuthContext = React.createContext(null);
function useAuthInner(){ return React.useContext(AuthContext); }

function App(){
  const auth = useAuth();
  const [ready,setReady] = useState(false);

  // enforce login before showing app
  useEffect(()=>{ setReady(true); },[]);

  if(!ready) return null;
  const token = auth.token || localStorage.getItem("token") || "";

  if(!token){
    return (
      <AuthContext.Provider value={auth}>
        <Login/>
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={auth}>
      <Layout onLogout={auth.logout}>
        <Routes>
          <Route path="/" element={<Dashboard/>}/>
          <Route path="/integrations" element={<Integrations/>}/>
          <Route path="/policy" element={<Policy/>}/>
          <Route path="/account" element={<Account/>}/>
          <Route path="/admin" element={<Admin/>}/>
          <Route path="/test" element={<TestEvents/>}/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </Layout>
    </AuthContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>
);
