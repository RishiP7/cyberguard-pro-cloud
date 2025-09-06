import React from "react";
import { Link } from "react-router-dom";
const Card = ({title, price, features, highlight}) => (
  <div style={{border:`1px solid ${highlight ? "#65a" : "#ddd"}`, borderRadius:10, padding:16}}>
    <h3 style={{marginTop:0}}>{title}</h3>
    <div style={{fontSize:22, fontWeight:700}}>{price}</div>
    <ul>{features.map((f,i)=><li key={i}>{f}</li>)}</ul>
    <Link to="/signup" style={{border:"1px solid #1f6feb", padding:"8px 12px", borderRadius:8}}>Get started</Link>
  </div>
);
export default function Pricing(){
  return (
    <section>
      <h1 style={{marginTop:0}}>Pricing</h1>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:14}}>
        <Card title="Basic" price="£19.99/mo" features={["Email scanning","Core alerts","API (rate limited)"]}/>
        <Card title="Pro" price="£39.99/mo" features={["Everything in Basic","EDR & DNS","Policy controls"]}/>
        <Card title="Pro+" price="£99.99/mo" features={["Everything in Pro","Cloud & UEBA","Priority support"]} highlight/>
      </div>
    </section>
  );
}
