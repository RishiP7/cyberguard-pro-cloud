import fs from 'fs';

const P = 'app/src/index.js';
let s = fs.readFileSync(P, 'utf8');
const before = s;

// Find the split point (start of app code)
const appIdx = s.indexOf('const app = express(');
if (appIdx < 0) {
  console.error('Could not find "const app = express(" — aborting to be safe.');
  process.exit(1);
}

// Work only on the header (everything before app init)
let head = s.slice(0, appIdx);
const tail = s.slice(appIdx);

// 1) Remove any try { ... } catch(e) { ... } blocks in the header
head = head.replace(/\btry\s*\{\s*/g, '');                       // drop any 'try {'
head = head.replace(/\}\s*catch\s*\([^)]*\)\s*\{\s*[\s\S]*?\}/g, ''); // drop matching 'catch { ... }'

// 2) Remove any orphan lone closing braces left behind in header
head = head.replace(/^\s*}\s*$/gm, '');

// Stitch back
const out = head + tail;

if (out !== before) {
  fs.writeFileSync(P, out, 'utf8');
  console.log('✅ Cleaned header: removed stray try/catch or orphan braces before app init.');
} else {
  console.log('ℹ️ No changes were necessary.');
}
