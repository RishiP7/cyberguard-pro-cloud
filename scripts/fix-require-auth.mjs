import fs from 'node:fs';

const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');
const before = s;

// A) Ensure Navigate is in the react-router-dom import
{
  const m = s.match(/import\s*\{([^}]*)\}\s*from\s*['"]react-router-dom['"]/);
  if (m) {
    const items = m[1].split(',').map(x => x.trim()).filter(Boolean);
    const set = new Set(items);
    set.add('Navigate');
    const merged = Array.from(set).sort().join(', ');
    s = s.replace(m[0], `import { ${merged} } from "react-router-dom"`);
  } else {
    s = `import { Navigate } from "react-router-dom";\n` + s;
  }
}

// B) Remove ANY duplicate stray fragment like:  ({ children }) { ... }
s = s.replace(/\n[ \t]*\(\{\s*children\s*\}\)\s*\{[\s\S]*?\}\s*\n/g, '\n');

// C) Replace or append a single clean RequireAuth()
const clean = `
function RequireAuth({ children }){
  const token = (typeof localStorage !== 'undefined' && localStorage.getItem('token')) || '';
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
`.trim() + "\n";

if (/function\s+RequireAuth\s*\(/.test(s)) {
  s = s.replace(/function\s+RequireAuth\s*\([\s\S]*?\}\s*\n/, clean + '\n');
} else {
  s = s + '\n' + clean;
}

if (s !== before) {
  fs.writeFileSync(p, s, 'utf8');
  console.log('✅ Fixed: Navigate import + removed stray fragment + normalized RequireAuth.');
} else {
  console.log('ℹ️ No changes needed.');
}
