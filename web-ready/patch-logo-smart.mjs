import fs from 'fs';

const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');
const before = s;

// Brand block (img + text, with PNG fallback if you add it later)
const brandBlock = `
<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
  <img
    src="/brand/logo.svg"
    alt="Cyber Guard Pro"
    style={{ height: 22, width: "auto" }}
    onError={(e)=>{ try {
      if (e?.target) { e.target.src = "/brand/logo.png"; }
    } catch(_){} }}
  />
  <h2 style={{ margin: 0, fontSize: 18 }}>Cyber Guard Pro</h2>
</div>`;

// 1) Try to replace an existing H2 that contains "Cyber Guard Pro"
const h2Re = /<h2[^>]*>[^<]*Cyber\s*Guard\s*Pro[^<]*<\/h2>/i;
if (h2Re.test(s)) {
  s = s.replace(h2Re, brandBlock);
} else {
  // 2) If no H2 match, inject brand block right before the FIRST <nav> in the sidebar.
  //    We find the first <nav ...> and put our block just above it.
  //    To avoid injecting in the main content, we try to pick the earliest <nav>.
  s = s.replace(/\n\s*<nav\b/, `\n        ${brandBlock}\n        <nav`);
}

// Only write if changed
if (s !== before) {
  fs.writeFileSync(p, s, 'utf8');
  console.log('✅ Sidebar brand patched (logo + text).');
} else {
  console.log('ℹ️ No changes were necessary (pattern may already be patched).');
}
