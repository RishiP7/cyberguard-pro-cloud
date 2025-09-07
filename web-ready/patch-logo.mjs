import fs from 'fs';
const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p,'utf8');
const before = s;

const brandBlock = `
<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
  <img src="/brand/logo.png" alt="Cyber Guard Pro" style={{ height: 22, width: "auto" }} />
  <h2 style={{ margin: 0, fontSize: 18 }}>Cyber Guard Pro</h2>
</div>`;

s = s.replace(/<h2[^>]*>\s*Cyber\s*Guard\s*Pro\s*<\/h2>/i, brandBlock);

if (s !== before) {
  fs.writeFileSync(p, s, 'utf8');
  console.log('✅ Replaced brand heading with logo + text.');
} else {
  console.log('ℹ️ Couldn’t find brand heading; no change.');
}
