import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Pricing from "./pages/Pricing.jsx";
import Support from "./pages/Support.jsx";
import Privacy from "./pages/legal/Privacy.jsx";
import Terms from "./pages/legal/Terms.jsx";
import Cookie from "./pages/legal/Cookie.jsx";
import DPA from "./pages/legal/DPA.jsx";
import Accessibility from "./pages/legal/Accessibility.jsx";

function SignupRedirect(){
  const nav = useNavigate();
  const loc = useLocation();
  React.useEffect(()=>{
    const appBase = (import.meta.env.VITE_APP_BASE || "/app");
    const to = new URL(appBase + "/register", window.location.origin);
    // preserve UTM params
    const sp = new URLSearchParams(loc.search);
    sp.forEach((v,k)=> to.searchParams.set(k,v));
    window.location.replace(to.toString());
  }, [nav, loc.search]);
  return <div style={{padding:24}}>Redirecting to sign up…</div>;
}

function Layout({children}) {
  return (
    <div style={{maxWidth:1100, margin:"0 auto", padding:"20px"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <Link to="/" style={{textDecoration:"none"}}><b>CyberGuard Pro</b></Link>
        <nav style={{display:"flex",gap:12}}>
          <Link to="/pricing">Pricing</Link>
          <Link to="/support">Support</Link>
          <a href={(import.meta.env.VITE_APP_BASE || "/app")}>Sign in</a>
          <Link to="/signup" style={{border:"1px solid #1f6feb", padding:"6px 10px", borderRadius:8}}>Get started</Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer style={{marginTop:40, paddingTop:16, borderTop:"1px solid #eee", fontSize:14, display:"grid", gap:8}}>
        <div>© {new Date().getFullYear()} CyberGuard Pro</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <Link to="/legal/privacy">Privacy</Link>
          <Link to="/legal/terms">Terms</Link>
          <Link to="/legal/cookie">Cookie</Link>
          <Link to="/legal/dpa">DPA</Link>
          <Link to="/legal/accessibility">Accessibility</Link>
        </div>
      </footer>
    </div>
  );
}

function App(){
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home/>}/>
          <Route path="/pricing" element={<Pricing/>}/>
          <Route path="/support" element={<Support/>}/>
          <Route path="/signup" element={<SignupRedirect/>}/>
          <Route path="/legal/privacy" element={<Privacy/>}/>
          <Route path="/legal/terms" element={<Terms/>}/>
          <Route path="/legal/cookie" element={<Cookie/>}/>
          <Route path="/legal/dpa" element={<DPA/>}/>
          <Route path="/legal/accessibility" element={<Accessibility/>}/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(<App/>);
