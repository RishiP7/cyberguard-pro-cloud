import fs from 'fs';

const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');
const before = s;

// Try to locate the sidebar brand area
// We look for the left column container then the first <h2> inside it.
const sideStart = s.indexOf(`width: 220`);
let replaced = false;

function makeLogoBlock() {
  return `
  <div style={{display:"flex",alignItems:"center",gap:10}}>
    <img
      src={(typeof window!=="undefined" && (window.LOGO_URL || (typeof localStorage!=="undefined" && localStorage.getItem("logo_url")))) || "/brand/logo.svg"}
      alt="Cyber Guard Pro"
      style={{height:22, width:"auto"}}
      onError={(e)=>{ try{ if(e && e.target){ e.target.style.display="none"; } }catch(_){} }}
    />
    <h2 style={{margin:0,fontSize:18}}>Cyber Guard Pro</h2>
  </div>`.trim();
}

// Pattern 1: replace existing H2 brand text (with/without the space in Guard)
const h2re = /<h2\s+style=\{\{[^}]*\}\}>\s*Cyber\s*Guard\s*Pro\s*<\/h2>/;

if (h2re.test(s)) {
  s = s.replace(h2re, makeLogoBlock());
  replaced = true;
} else if (sideStart !== -1) {
  // Pattern 2: inject a logo block after we enter the sidebar column (safe fallback)
  const insertAt = s.indexOf('<nav', sideStart);
  if (insertAt !== -1) {
    s = s.slice(0, sideStart) +
        s.slice(sideStart, insertAt) +
        makeLogoBlock() + '\n' +
        s.slice(insertAt);
    replaced = true;
  }
}

if (replaced) {
  fs.writeFileSync(p, s, 'utf8');
  console.log('✅ Added logo block in the sidebar.');
} else {
  console.log('ℹ️ Could not find a safe place to inject the logo (no changes).');
}
