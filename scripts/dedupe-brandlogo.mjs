import fs from 'fs';

const P = 'web-ready/src/main.jsx';
let s = fs.readFileSync(P, 'utf8');
const before = s;

// A) Find ALL BrandLogo function blocks
const reAll = /function\s+BrandLogo\s*\([\s\S]*?\n\}\n/g;
const blocks = s.match(reAll) || [];

// B) If at least one exists, keep ONLY the first, delete the rest
if (blocks.length > 0) {
  // normalize the first to the non-squashed style (height:54, width:auto, contain)
  let keep = blocks[0]
    // make sure the style is the tall/non-squashed one
    .replace(/style=\{\{[^}]*\}\}/g, 'style={{height:54,width:"auto",objectFit:"contain",display:"block"}}');

  // also ensure we try PNG then SVG
  keep = keep.replace(
    /const\s+candidates\s*=\s*\[[^\]]+\]/,
    'const candidates=["/brand/logo.png","/brand/logo.svg"]'
  );

  // Replace the first block with the normalized one
  s = s.replace(blocks[0], keep);

  // Remove all remaining duplicates
  for (let i = 1; i < blocks.length; i++) {
    s = s.replace(blocks[i], '');
  }
}

// C) Make sure the top-left brand text is replaced with the logo
s = s.replace(/<h2[^>]*>\s*Cyber\s*Guard\s*Pro\s*<\/h2>/gi, '<BrandLogo/>');

// D) Remove any small duplicate brand block that was injected earlier
s = s.replace(/\n\s*<div\s+data-cgp-brand[\s\S]*?<\/div>\s*\n/gi, '\n');

// E) Write out only if changed
if (s !== before) {
  fs.writeFileSync(P, s, 'utf8');
  console.log('✅ Deduped BrandLogo, enforced non-squashed style, and swapped header text to <BrandLogo/>.');
} else {
  console.log('ℹ️ No changes necessary.');
}
