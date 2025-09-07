import fs from 'fs';

const P = 'web-ready/src/main.jsx';
let s = fs.readFileSync(P, 'utf8');
const before = s;

// --- A) Keep only ONE BrandLogo() ---
const defRe = /function\s+BrandLogo\s*\(\)\s*\{[\s\S]*?\n\}\n?/g;
const defs = s.match(defRe) || [];
if (defs.length > 1) {
  // Keep the LAST one (the one we’ve been using near Layout)
  const keep = defs[defs.length - 1];
  s = s.replace(defRe, '');
  s = s.replace(/function\s+Layout\s*\(/, keep + '\n\nfunction Layout(');
}

// If after removal we lost BrandLogo entirely (edge case), inject a canonical one
if (!/function\s+BrandLogo\s*\(\)/.test(s)) {
  const canonical = `
function BrandLogo(){
  const candidates=["/brand/logo.png","/brand/logo.svg"];
  const [src,setSrc]=React.useState(candidates[0]);
  return (
    <img
      src={src}
      alt="Cyber Guard Pro"
      style={{height:48, width:"auto", objectFit:"contain", display:"block"}}
      onError={()=>{ const i=candidates.indexOf(src); if(i<candidates.length-1) setSrc(candidates[i+1]); }}
    />
  );
}
`.trim() + '\n\n';
  s = s.replace(/function\s+Layout\s*\(/, canonical + 'function Layout(');
}

// --- B) Ensure the kept BrandLogo uses non-squashing, taller style ---
s = s.replace(
  /(<img[\s\S]*?style=\{\{)[\s\S]*?\}\}/,
  (m, p1) =>
    /BrandLogo\(\)/.test(m) ? `${p1}height:48, width:"auto", objectFit:"contain", display:"block"}}` : m
);

// --- C) Replace the top-left H2 brand text with the logo ---
s = s.replace(/<h2[^>]*>\s*Cyber\s*Guard\s*Pro\s*<\/h2>/gi, '<BrandLogo/>');

// --- D) Remove any small duplicate logo block
s = s.replace(/\n\s*<div\s+data-cgp-brand[\s\S]*?<\/div>\s*\n/gi, '\n');

if (s !== before) {
  fs.writeFileSync(P, s, 'utf8');
  console.log('✅ Fixed duplicate BrandLogo, enforced tall non-squashed logo, replaced title with <BrandLogo/>, and removed mini-logo.');
} else {
  console.log('ℹ️ No changes were necessary.');
}
