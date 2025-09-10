import fs from 'fs';

const path = 'web-ready/src/main.jsx';
let s = fs.readFileSync(path, 'utf8');
const before = s;

// What we’ll insert (safe in JSX)
const brandBlock = `
{/* CGP brand (autoinserted) */}
<div data-cgp-brand style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
  <img
    src="/brand/logo.png"
    alt="Cyber Guard Pro"
    style={{ height: 22, width: "auto" }}
    onError={(e)=>{ try { if (e?.target) e.target.src = "/brand/logo.png"; } catch(_){} }}
  />
  <h2 style={{ margin: 0, fontSize: 18 }}>Cyber Guard Pro</h2>
</div>`.trim();

// 1) If the brand already exists anywhere, do nothing.
if (!/data-cgp-brand/.test(s)) {
  // 2) Find the very first <nav ...> (this is the sidebar in your app)
  const navIdx = s.indexOf('<nav');
  if (navIdx !== -1) {
    // Make sure we didn’t already put a logo just above this nav
    const windowBefore = s.slice(Math.max(0, navIdx - 400), navIdx);
    if (!/\/brand\/logo\.(svg|png)"/.test(windowBefore) && !/data-cgp-brand/.test(windowBefore)) {
      const insertAt = s.lastIndexOf('\n', navIdx) + 1;
      s = s.slice(0, insertAt) + brandBlock + '\n' + s.slice(insertAt);
      console.log('✅ Inserted brand block above first <nav> at index', navIdx);
    } else {
      console.log('ℹ️ Brand appears to already be present near the sidebar <nav>; no insert.');
    }
  } else {
    console.log('⚠️ Could not find a <nav> to anchor the brand insertion.');
  }
} else {
  console.log('ℹ️ data-cgp-brand already present; no changes.');
}

if (s !== before) {
  fs.writeFileSync(path, s, 'utf8');
  console.log('✅ Sidebar brand patch written to', path);
} else {
  console.log('ℹ️ No changes to', path);
}
