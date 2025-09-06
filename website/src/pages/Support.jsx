import React, { useState } from "react";

export default function Support() {
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: wire up to backend (Mailgun/Sendgrid or GitHub Issues webhook)
    console.log("Support request:", msg);
    setSent(true);
  };

  return (
    <section style={{padding:"40px 20px", maxWidth:640, margin:"0 auto"}}>
      <h1>Support</h1>
      <p>If you have an issue or question, fill the form below. Our team will respond quickly.</p>
      {sent ? (
        <p style={{color:"lightgreen"}}>✅ Request sent! We'll be in touch.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <textarea
            value={msg}
            onChange={e=>setMsg(e.target.value)}
            placeholder="Describe your issue..."
            required
            style={{width:"100%",height:120,margin:"12px 0"}}
          />
          <button type="submit">Send</button>
        </form>
      )}
      <p>Or email us directly: <a href="mailto:support@cyberguardpro.com">support@cyberguardpro.com</a></p>
    </section>
  );
}
