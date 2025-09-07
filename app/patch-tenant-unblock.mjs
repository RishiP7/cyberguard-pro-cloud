import fs from 'fs';
const P = 'app/src/index.js';
let s = fs.readFileSync(P, 'utf8');
const before = s;

/* A) Ensure admin-login signs token with tenant_id + is_super */
s = s.replace(
  /app\.post\(\s*['"]\/auth\/admin-login['"][\s\S]*?res\.json\(\s*\{\s*ok:\s*true,\s*token\s*\}\s*\)\s*;?\s*\}\s*\)\s*;?/m,
  (m) => m.replace(
    /jwt\.sign\(\s*\{\s*([\s\S]*?)\}\s*,\s*([\s\S]*?)\)\s*/m,
    (mm, payload, rest) => {
      // if tenant_id already present, leave unchanged
      if (/tenant_id\s*:/.test(payload)) return mm;
      const patchedPayload =
`{
  ${payload.trim().replace(/,+\s*$/,'')},
  tenant_id: 'tenant_admin',
  is_super: true
}`;
      return `jwt.sign(${patchedPayload}, ${rest})`;
    }
  )
);

/* B) Replace /me with a no-DB variant that reads from JWT (or add it if missing) */
const ME_ROUTE = `
app.get('/me', authMiddleware, (req, res) => {
  try {
    const u = req.user || {};
    const email = u.email || u.sub || 'owner@cyberguardpro.com';
    const plan = u.plan || 'pro_plus';
    const tenant_id = u.tenant_id || 'tenant_admin';
    const role = u.role || 'owner';
    return res.json({
      ok: true,
      user: { email, role, plan, tenant_id },
      tenant: { id: tenant_id, name: 'Cyber Guard Pro', plan }
    });
  } catch (e) {
    console.error('me error', e);
    return res.status(500).json({ ok:false, error:'me failed' });
  }
});
`;

// remove any existing /me then add our version just after express.json()
s = s.replace(/app\.get\(\s*['"]\/me['"][\s\S]*?\)\s*;\s*/g, '');
if (/app\.use\(\s*express\.json\(\)\s*\)\s*;/.test(s)) {
  s = s.replace(/app\.use\(\s*express\.json\(\)\s*\)\s*;/, m => `${m}\n\n${ME_ROUTE}`);
} else {
  s = s.replace(/const\s+app\s*=\s*express\(\)\s*;?/, m => `${m}\napp.use(express.json());\n\n${ME_ROUTE}`);
}

if (s !== before) {
  fs.writeFileSync(P, s, 'utf8');
  console.log('✅ Patched: admin-login now includes tenant_id; /me uses JWT fallback.');
} else {
  console.log('ℹ️ No changes were necessary.');
}
