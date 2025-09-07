import fs from 'node:fs';

const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');
const before = s;

// --- A) Ensure react-router-dom import contains needed symbols
const NEED = [
  'BrowserRouter','Routes','Route','Navigate',
  'Link','NavLink','useLocation','useNavigate','Outlet'
];

{
  const m = s.match(/import\s*\{([^}]*)\}\s*from\s*['"]react-router-dom['"]/);
  if (m) {
    const items = m[1].split(',').map(x => x.trim()).filter(Boolean);
    const set = new Set(items);
    for (const n of NEED) set.add(n);
    const merged = Array.from(set).sort().join(', ');
    s = s.replace(m[0], `import { ${merged} } from "react-router-dom"`);
  } else {
    s = `import { ${NEED.join(', ')} } from "react-router-dom";\n` + s;
  }
}

// --- B) Remove ANY stray "({ children }) { ... }" function-like fragments
let rmCount = 0;
s = s.replace(/\n[ \t]*\(\{\s*children\s*\}\)\s*\{[\s\S]*?\}\s*(?=\n|$)/g, () => { rmCount++; return '\n'; });

// --- C) Remove ALL existing RequireAuth() definitions
let raCount = 0;
s = s.replace(/function\s+RequireAuth\s*\([\s\S]*?\}\s*\n/g, () => { raCount++; return ''; });

// --- D) Append a single clean RequireAuth
const cleanRequireAuth = `
function RequireAuth({ children }){
  const token = (typeof localStorage !== 'undefined' && localStorage.getItem('token')) || '';
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
`.trim() + "\n";
s += '\n' + cleanRequireAuth;

// Write back if changed
if (s !== before) {
  fs.writeFileSync(p, s, 'utf8');
  console.log(\`✅ main.jsx sanitized: removed \${rmCount} stray child-fragments, \${raCount} old RequireAuth, ensured router imports, and added clean RequireAuth.\`);
} else {
  console.log('ℹ️ main.jsx unchanged (already clean).');
}
