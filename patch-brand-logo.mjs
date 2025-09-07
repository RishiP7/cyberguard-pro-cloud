import fs from 'fs';

const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');
const before = s;

// A) Ensure we have react-router-dom import still intact (no-op if already present)
if (!/from\s+['"]react-router-dom['"]/.test(s)) {
  s = `import { BrowserRouter, Routes, Route, Link, NavLink, Navigate } from "react-router-dom";\n` + s;
} else {
  // Ensure Navigate exists (no-op if already there)
  s = s.replace(
    /import\s*\{\s*([^}]*)\}\s*from\s*['"]react-router-dom['"];/,
    (m, g) => (g.includes('Navigate') ? m : `import { ${g.replace(/\s+/g,' ').trim()}, Navigate } from 'react-router-dom';`)
  );
}

// B) Inject BrandLogo component once (right after first import React)
if (!/function\s+BrandLogo\s*\(/.test(s)) {
  s = s.replace(
    /import\s+React[^;\n]*;?\s*\n/,
    (imp) => imp +
`
// --- BrandLogo: tries overrides + common paths, falls back to text ---
function BrandLogo(){
  const override = (typeof window!=='undefined' && (window.LOGO_URL || (typeof localStorage!=='undefined' && localStorage.getItem('logo_url')))) || '';
  const candidates = [
    override,
    '/brand/logo.svg',
    '/logo.svg',
    '/logo.png',
    '/logo192.png',
    '/assets/logo.svg',
    '/assets/logo.png'
  ].filter(Boolean);

  const [srcIdx, setSrcIdx] = React.useState(0);
  const src = candidates[srcIdx] || '';

  if (!src) {
    // nothing to try; render text only
    return <h2 style={{margin:0,fontSize:18}}>Cyber Guard Pro</h2>;
  }
  return (
    <img
      src={src}
      alt="Cyber Guard Pro"
      style={{height:22, width:'auto', display:'block'}}
      onError={()=>{
        // try next candidate
        if (srcIdx < candidates.length - 1) setSrcIdx(srcIdx+1);
      }}
    />
  );
}
`
  );
}

// C) Replace the brand H2 in the sidebar with logo + text fallback.
// We search for the left sidebar container (width: 220 ...) and swap the FIRST <h2> below it.
function injectLogoBlock(markup){
  return `
  <div style={{display:'flex',alignItems:'center',gap:10}}>
    <BrandLogo/>
    <h2 style={{margin:0,fontSize:18}}>Cyber Guard Pro</h2>
  </div>
`.trim();
}

// Try direct replace of existing h2
let replaced = false;
const h2re = /<h2\s+style=\{\{[^}]*\}\}>[\s\S]*?<\/h2>/;
if (h2re.test(s)) {
  s = s.replace(h2re, injectLogoBlock());
  replaced = true;
}

// If not found, try to insert just before <nav ...> in the sidebar block
if (!replaced){
  const sideIdx = s.indexOf(`width: 220`);
  if (sideIdx !== -1) {
    const navIdx = s.indexOf('<nav', sideIdx);
    if (navIdx !== -1) {
      s = s.slice(0, navIdx) + injectLogoBlock() + '\n' + s.slice(navIdx);
      replaced = true;
    }
  }
}

if (s !== before) {
  fs.writeFileSync(p, s, 'utf8');
  console.log(replaced ? '✅ BrandLogo injected into sidebar.' : 'ℹ️ BrandLogo added (could not auto-place; no structural match).');
} else {
  console.log('ℹ️ No changes made (file already patched).');
}
