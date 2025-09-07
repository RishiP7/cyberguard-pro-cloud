import fs from 'fs';

const P = 'app/src/index.js';
let s = fs.readFileSync(P, 'utf8');
const before = s;

// Normalize quotes for matching
const q = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// New no-DB /me route
const NEW_ME = `
app.get('/me', authMiddleware, async (req, res) => {
  try {
    const { sub, email, role = 'owner', plan = 'pro_plus', tenant_id = 'tenant_admin' } = req.user || {};
    if (!email && !sub) return res.status(401).json({ error: 'not authed' });

    // Temporary no-DB tenant info so the web app can load
    return res.json({
      ok: true,
      user: { email: email || sub, role, plan, tenant_id },
      tenant: { id: tenant_id, name: 'Cyber Guard Pro', plan }
    });
  } catch (e) {
    console.error('/me error', e);
    return res.status(500).json({ ok:false, error:'server error' });
  }
});
`.trim();

// Try to replace any existing /me route (greedy block from "app.get('/me'" to the matching "});")
let replaced = false;
s = s.replace(/app\.get\(\s*['"]\/me['"][\s\S]*?\}\)\s*;\s*/g, () => { replaced = true; return NEW_ME + '\n'; });

// If not found, insert after express.json() or near top-level routes
if (!replaced) {
  if (/app\.use\(\s*express\.json\(\)\s*\)\s*;/.test(s)) {
    s = s.replace(/app\.use\(\s*express\.json\(\)\s*\)\s*;\s*/, m => m + '\n' + NEW_ME + '\n');
    replaced = true;
  }
}

// As a last resort, append near the end before app.listen
if (!replaced) {
  s = s.replace(/(\n\s*app\.listen\([\s\S]*?\)\s*;)/, '\n' + NEW_ME + '\n$1');
}

if (s !== before) {
  fs.writeFileSync(P, s, 'utf8');
  console.log('✅ Patched /me to a no-DB version (uses JWT only).');
} else {
  console.log('ℹ️ No changes made (route may already be patched).');
}
