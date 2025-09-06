import React from "react";
export default function Support(){
  const [msg,setMsg] = React.useState("");
  const [email,setEmail] = React.useState("");
  const [sent,setSent] = React.useState(false);
  async function submit(e){
    e.preventDefault();
    // Placeholder: wire to email/webhook later
    setSent(true);
  }
  return (
    <section>
      <h1 style={{marginTop:0}}>Support</h1>
      {sent ? <div>Thanks — we’ll be in touch.</div> : (
        <form onSubmit={submit} style={{display:"grid", gap:10, maxWidth:520}}>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" />
          <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="How can we help?" rows={6}/>
          <button type="submit" style={{border:"1px solid #1f6feb", padding:"8px 12px", borderRadius:8}}>Send</button>
        </form>
      )}
    </section>
  );
}
