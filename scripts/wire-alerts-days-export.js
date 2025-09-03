import fs from 'fs';
const path = 'web-ready/src/main.jsx';
let src = fs.readFileSync(path, 'utf8');

// Insert helper if missing
if (!src.includes('function buildExportHref(q, onlyAnomaly, days)')) {
  src = src.replace(
    /function AlertsPage\\s*\\(/,
    `function AlertsPage(` // keep signature
  );
  // Insert helper just before the first 'return (' inside AlertsPage
  src = src.replace(
    /(function AlertsPage[\\s\\S]*?\\{[\\s\\S]*?)(\\n\\s*return\\s*\\()/,
    `$1\n  function buildExportHref(q, onlyAnomaly, days){\n    const d = (typeof days !== 'undefined' && days != null) ? days : 7;\n    const parts = [\n      \`format=csv\`,\n      \`days=\${encodeURIComponent(String(d))}\`,\n      \`limit=1000\`\n    ];\n    if (q) parts.push(\`q=\${encodeURIComponent(q)}\`);\n    if (onlyAnomaly) parts.push(\`only_anomaly=1\`);\n    return '/alerts/export?' + parts.join('&');\n  }\n\n  $2`
  );
}

// Update export href to use helper
src = src.replace(
  /href=\\{[\\s\\S]*?title=\"Export filtered alerts to CSV\"[\\s\\S]*?\\}/m,
  m => m.replace(/href=\\{[\\s\\S]*?\\}/, 'href={buildExportHref(q, onlyAnomaly, days)}')
);

// Ensure alerts load uses ?days
src = src.replace(
  /apiGet\\('\\/alerts'\\)/,
  "apiGet(`/alerts?days=${encodeURIComponent(String(typeof days !== 'undefined' && days != null ? days : 7))}`)"
);

// Ensure effect depends on days
src = src.replace(
  /React\\.useEffect\\(\\(\\)=>\\{\\s*load\\(\\);\\s*\\},\\s*\\[\\s*\\]\\s*\\);/,
  'React.useEffect(()=>{ load(); },[days]);'
);

fs.writeFileSync(path, src, 'utf8');
console.log('Alerts export wired to days; list reloads on days change.');
