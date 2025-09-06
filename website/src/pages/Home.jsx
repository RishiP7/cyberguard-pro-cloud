import React from "react";
import { Link } from "react-router-dom";
export default function Home(){
  return (
    <section>
      <h1 style={{marginTop:0}}>Modern SME security in one place</h1>
      <p>Email, EDR, DNS, Cloud and AI triage—fast setup, sane defaults.</p>
      <div style={{display:"flex",gap:12,marginTop:12}}>
        <Link to="/signup" style={{border:"1px solid #1f6feb", padding:"10px 14px", borderRadius:10}}>Start free trial</Link>
        <Link to="/pricing" style={{padding:"10px 14px"}}>See pricing</Link>
      </div>
    </section>
  );
}
