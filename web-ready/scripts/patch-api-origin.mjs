import fs from 'fs';
const P = 'web-ready/src/main.jsx';
let s = fs.readFileSync(P, 'utf8');
const before = s;

// A) Ensure a robust API_ORIGIN constant once, near the top
if (!/const\s+API_ORIGIN\s*=/.test(s)) {
  // insert right after first import block if present, else at top
  const m = s.match(/^(?:import[^\n]*\n)+/);
  const snippet =
`const API_ORIGIN =
  (typeof window !== 'undefined' && window.API_ORIGIN) ||
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_ORIGIN) ||
  'https://cyberguard-pro-cloud.onrender.com';\n`;
  s = m ? s.replace(m[0], m[0] + snippet) : (snippet + s);
}

// B) Make sure AuthLogin (and any login) posts to absolute URL
// Replace any fetch(`/auth/admin-login`...) or fetch('/auth/admin-login'...) variants
s = s.replace(
  /fetch\(\s*([`'"])\s*\/auth\/admin-login\s*\1/g,
  "fetch(API_ORIGIN.replace(/\\/$/, '') + '/auth/admin-login'"
);

// (Optional) also cover /auth/login if any views still use it
s = s.replace(
  /fetch\(\s*([`'"])\s*\/auth\/login\s*\1/g,
  "fetch(API_ORIGIN.replace(/\\/$/, '') + '/auth/login'"
);

if (s !== before) {
  fs.writeFileSync(P, s, 'utf8');
  console.log('✅ Patched: API_ORIGIN fallback + absolute login URL(s).');
} else {
  console.log('ℹ️ No changes needed.');
}
