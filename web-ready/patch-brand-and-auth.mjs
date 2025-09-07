import fs from "fs";
const P="web-ready/src/main.jsx";
let s=fs.readFileSync(P,"utf8"), before=s;

/** A) Replace any brand header block with a pure image **/
const BRAND_IMG = `<div data-cgp-brand style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
  <img src="/brand/logo.png" alt="Cyber Guard Pro" style={{height:36,width:"auto"}} />
</div>`;
/* common forms we've seen */
s = s
  // <h2 ...>Cyber Guard Pro</h2>
  .replace(/<h2[^>]*>\s*Cyber\s*Guard\s*Pro\s*<\/h2>/i, BRAND_IMG)
  // our earlier injected brand block (replace whatever is inside)
  .replace(/<div[^>]*data-cgp-brand[^>]*>[\s\S]*?<\/div>/g, BRAND_IMG);

/** B) Make sure react-router-dom import includes Navigate (for the auth gate) */
s = s.replace(
  /import\s*\{\s*([^}]+)\}\s*from\s*['"]react-router-dom['"];/,
  (m,g)=> g.includes("Navigate") ? m : `import { ${g.trim().replace(/\s+/g," ")}, Navigate } from 'react-router-dom';`
);

/** C) Normalize RequireAuth so the shell only renders when a token exists */
const cleanRA = `
function RequireAuth({ children }){
  const token = (typeof localStorage !== 'undefined' && localStorage.getItem('token')) || '';
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
`.trim();
if (/function\s+RequireAuth\s*\(/.test(s)){
  s = s.replace(/function\s+RequireAuth\s*\([\s\S]*?\}\s*\n/, cleanRA + "\n");
} else {
  // append once if somehow missing
  s += "\n" + cleanRA + "\n";
}

// Write if changed
if (s!==before){ fs.writeFileSync(P,s,"utf8"); console.log("✅ Brand swapped to logo, auth gate normalized."); }
else { console.log("ℹ️ No changes needed."); }
