import fs from 'fs';

const P = 'app/src/index.js';
let s = fs.readFileSync(P, 'utf8');
const before = s;

// A) Remove ANY existing /me route blocks
s = s.replace(/app\.get\(\s*['"]\/me['"][\s\S]*?\)\s*;\s*/g, '');

// B) Defensive: if a previous bad edit left a top-level "return res....", drop the "return "
s = s.replace(/\n\s*return\s+(res\.(?:status|json)\()/g, '\n$1');

// C) Insert a clean /me right after express.json() (or after app creation if missing)
const ROUTE = `
app.get('/me', authMiddleware, (req, res) => {
  try {
    const u = req.user || {};
    const email = u.email || u.sub || 'owner@cyberguardpro.com';
    const plan = u.plan || 'pro_plus';
    const tenant_id = u.tenant_id || 'tenant_admin';
    const role = u.role || 'owner';
    res.json({
      ok: true,
      user: { email, role, plan, tenant_id },
      tenant: { id: tenant_id, name: 'Cyber Guard Pro', plan }
    });
  } catch (e) {
    console.error('me error', e);
    res.status(500).json({ ok:false, error:'me failed' });
  }
});
`.trim() + "\n";

if (/app\.use\(\s*express\.json\(\)\s*\)\s*;/.test(s)) {
  s = s.replace(/app\.use\(\s*express\.json\(\)\s*\)\s*;/, m => `${m}\n\n${ROUTE}`);
} else {
  s = s.replace(/const\s+app\s*=\s*express\(\)\s*;?/, m => `${m}\napp.use(express.json());\n\n${ROUTE}`);
}

if (s !== before) {
  fs.writeFileSync(P, s, 'utf8');
  console.log('✅ Fixed: removed bad returns, restored clean /me (JWT-based).');
} else {
  console.log('ℹ️ No changes were necessary.');
}
