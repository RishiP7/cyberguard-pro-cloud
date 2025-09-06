import React from "react";
import { Link } from "react-router-dom";

export default function Footer(){
  const wrap = {
    marginTop: 48, padding: "16px 20px",
    borderTop: "1px solid #1f2328", background: "#0b0c0d",
    color: "#e6e9ef"
  };
  const a = { color: "#9bbcff", textDecoration: "none" };
  return (
    <footer style={wrap} role="contentinfo">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div>© {new Date().getFullYear()} CyberGuard Pro</div>
        <nav aria-label="Legal">
          <Link to="/legal/privacy" style={a}>Privacy</Link> ·{" "}
          <Link to="/legal/terms" style={a}>Terms</Link> ·{" "}
          <Link to="/legal/cookie" style={a}>Cookie</Link> ·{" "}
          <Link to="/legal/dpa" style={a}>DPA</Link> ·{" "}
          <Link to="/legal/accessibility" style={a}>Accessibility</Link>
        </nav>
      </div>
    </footer>
  );
}
