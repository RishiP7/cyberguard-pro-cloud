import React, {useEffect, useState} from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from "react-router-dom";

import Dashboard from "./pages/Dashboard.jsx";
import Integrations from "./pages/Integrations.jsx";
import Policy from "./pages/Policy.jsx";
import Account from "./pages/Account.jsx";
import Admin from "./pages/Admin.jsx";
import TestEvents from "./pages/TestEvents.jsx";
import Login from "./pages/Login.jsx";

const API = import.meta.env.VITE_API_BASE || "http://localhost:8080";

function Layout({children}) {
  const [token, setToken] = useState(localStorage.getItem("token"));
  useEffect(()=> {
    const onStorage = ()=> setToken(localStorage.getItem("token"));
    window.addEventListener("storage", onStorage);
    return ()=> window.removeEventListener("storage", onStorage);
  },[]);
  const loggedIn = !!token;

  const header = {
    position:"sticky", top:0, zIndex:10,
    display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"10px 14px", borderBottom:"1px solid rgba(255,255,255,.08)",
    background:"linear-gradient(180deg,#0b0d12,#131620)", color:"#e6e9ef"
  };
  const nav = {display:"flex", gap:10, alignItems:"center"};
  const link = {padding:"8px 10px", border:"1px solid rgba(255,255,255,.15)", borderRadius:10, textDecoration:"none", color:"#e6e9ef", background:"transparent"};
  const btn = {padding:"8px 10px", border:"1px solid rgba(255,255,255,.15)", borderRadius:10, color:"#fff", background:"#1f6feb", cursor:"pointer"};
  const page = {minHeight:"100vh", background:"linear-gradient(180deg,#0b0d12,#131620)", color:"#e6e9ef", fontFamily:"-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif"};
  const inner = {maxWidth:1100, margin:"0 auto", padding:"18px"};

  return (
    <div style={page}>
      <header style={header}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <img src="/logo-cgp.png" alt="Logo" style={{height:60}} />
        </div>
        <nav style={nav}>
          {loggedIn ? (
            <>
              <Link style={link} to="/">Dashboard</Link>
              <Link style={link} to="/integrations">Integrations</Link>
              <Link style={link} to="/policy">Policy</Link>
              <Link style={link} to="/account">Account</Link>
              <Link style={link} to="/admin">Admin</Link>
              <Link style={link} to="/test">Test</Link>
              <button
                style={btn}
                onClick={()=>{ localStorage.removeItem("token"); localStorage.removeItem("api_key"); location.href="/login"; }}>
                Logout
              </button>
            </>
          ) : (
            <Link style={btn} to="/login">Login</Link>
          )}
        </nav>
      </header>
      <div style={inner}>{children}</div>
    </div>
  );
}

function RequireAuth({children}) {
  const token = localStorage.getItem("token");
  const loc = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

function App(){
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<Login api={API}/>} />
        <Route path="/" element={<RequireAuth><Dashboard api={API}/></RequireAuth>} />
        <Route path="/integrations" element={<RequireAuth><Integrations api={API}/></RequireAuth>} />
        <Route path="/policy" element={<RequireAuth><Policy api={API}/></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><Account api={API}/></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><Admin api={API}/></RequireAuth>} />
        <Route path="/test" element={<RequireAuth><TestEvents api={API}/></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>
);
