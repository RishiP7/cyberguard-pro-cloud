import fs from 'node:fs';
const p = 'web-ready/src/main.jsx';
const before = fs.readFileSync(p,'utf8');
let s = before;

// Ensure Navigate import exists
if (!/from\s+['"]react-router-dom['"]/.test(s)) {
  s = `import { Navigate } from 'react-router-dom';\n` + s;
} else {
  s = s.replace(/import\s*\{\s*([^}]+)\}\s*from\s*['"]react-router-dom['"];/,
                (m,g)=> m.includes('Navigate') ? m : `import { ${g.trim().replace(/\s+/g,' ')}, Navigate } from 'react-router-dom';`);
}

// Swap the login endpoint inside AuthLogin to /auth/admin-login
s = s.replace(/fetch\(\s*`?\$\{?API_ORIGIN\}?\/auth\/login`?/g,
              (m)=> m.replace('/auth/login','/auth/admin-login'));

if (s !== before) {
  fs.writeFileSync(p, s, 'utf8');
  console.log('✅ Web: AuthLogin now posts to /auth/admin-login; Navigate import ensured.');
} else {
  console.log('ℹ️ No changes to web login were required.');
}
