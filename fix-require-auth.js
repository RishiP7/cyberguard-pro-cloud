import fs from 'node:fs';

const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');
const before = s;

// A) Ensure react-router-dom import contains Navigate
s = s.replace(
  /import\s*\{\s*([^}]*)\}\s*from\s*["']react-router-dom["'];?/,
  (_m, inner) => {
    const parts = inner.split(',').map(x=>x.trim()).filter(Boolean);
    const set = new Set(parts);
    set.add('Navigate');
    return `import { ${Array.from(set).sort().join(', ')} } from "react-router-dom";`;
  }
);

// B) Replace ANY existing RequireAuth definition with a clean one
const reqAuthRe =
  /function\s+RequireAuth\s*\([^)]*\)\s*\{[\s\S]*?\}\s*/g;

const cleanRequireAuth = `
function RequireAuth({ children }){
  const token = (typeof localStorage !== 'undefined' && localStorage.getItem('token')) || '';
  return token ? children : <Navigate to="/login" replace />;
}
`.trim() + "\n";

if (reqAuthRe.test(s)) {
  s = s.replace(reqAuthRe, cleanRequireAuth);
} else {
  // if we didn't find it, just append right after AuthLogin()
  s = s.replace(/function\s+AuthLogin[\s\S]*?\}\s*\n/, m => m + "\n" + cleanRequireAuth);
}

if (s !== before) {
  fs.writeFileSync(p, s, 'utf8');
  console.log('✅ Fixed RequireAuth and ensured Navigate import.');
} else {
  console.log('ℹ️ No changes made (already correct).');
}
