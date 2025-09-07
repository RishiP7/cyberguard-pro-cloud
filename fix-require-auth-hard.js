const fs = require('fs');
const p = 'web-ready/src/main.jsx';
let s = fs.readFileSync(p, 'utf8');
const before = s;

// Ensure Navigate is in the react-router-dom import
const rr = /import\s*\{\s*([^}]*)\}\s*from\s*['"]react-router-dom['"]\s*;?/;
if (rr.test(s)) {
  s = s.replace(rr, (_m, inside) => {
    const parts = new Set(
      inside.split(',').map(x => x.trim()).filter(Boolean)
    );
    parts.add('Navigate');
    return `import { ${Array.from(parts).sort().join(', ')} } from "react-router-dom";`;
  });
} else {
  // No named import found; add one at the top
  s = `import { Navigate } from "react-router-dom";\n` + s;
}

// Replace ANY existing function RequireAuth(...) { ... } with the clean one
const cleanBlock =
`function RequireAuth({ children }){
  const token = (typeof localStorage !== 'undefined' && localStorage.getItem('token')) || '';
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
`;
s = s.replace(/function\s+RequireAuth\s*\([\s\S]*?\}\s*\n/, cleanBlock);

// Also remove any stray duplicated fragment like “({ children }) { ... }”
s = s.replace(/\n\(\{\s*children\s*\}\)\s*\{[\s\S]*?\}\s*\n/g, '\n');

// If somehow the function didn’t exist, append the clean one once
if (!/function\s+RequireAuth\s*\(/.test(s)) {
  s = s + '\n' + cleanBlock;
}

if (s !== before) {
  fs.writeFileSync(p, s, 'utf8');
  console.log('✅ main.jsx patched: Navigate import ensured + RequireAuth normalized.');
} else {
  console.log('ℹ️ main.jsx already clean.');
}
