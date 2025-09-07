import fs from 'fs';

const P = 'app/src/index.js';
let s = fs.readFileSync(P, 'utf8');
const before = s;

// A) ensure jsonwebtoken import
if (!/from ['"]jsonwebtoken['"]/.test(s)) {
  const importBlock = s.match(/^(?:import[^\n]*\n)+/m)?.[0] ?? '';
  if (importBlock) {
    s = s.replace(importBlock, importBlock + "import jwt from 'jsonwebtoken';\n");
  } else {
    s = "import jwt from 'jsonwebtoken';\n" + s;
  }
}

// B) replace /auth/admin-login so it issues a token WITH tenant_id + is_super
const adminRe = /app\.post\(\s*['"]\/auth\/admin-login['"][\s\S]*?\n\}\);\s*/m;
const adminNew = `
app.post('/auth/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@cyberguardpro.com';
    const adminPass  = process.env.ADMIN_PASSWORD || 'ChangeMeNow!';
    if (email === adminEmail && password === adminPass) {
      const token = jwt.sign(
        {
          sub: email,
          email,
          role: 'owner',
          plan: 'pro_plus',
          tenant_id: 'tenant_admin',
          is_super: true
        },
        process.env.JWT_SECRET || 'dev-secret',
        { expiresIn: '12h' }
      );
      return res.json({ ok: true, token });
    }
    return res.status(401).json({ ok:false, error:'invalid credentials' });
  } catch (e) {
    console.error('auth/admin-login error', e);
    return res.status(500).json({ ok:false, error:'server error' });
  }
});
`.trim() + "\n";

if (adminRe.test(s)) {
  s = s.replace(adminRe, adminNew);
} else {
  // fallback: insert after express.json()
  s = s.replace(/app\.use\(\s*express\.json\(\)\s*\)\s*;?/, m => m + "\n\n" + adminNew);
}

// C) best-effort: ensure ANY jwt.sign payload includes tenant_id + is_super
s = s.replace(/jwt\.sign\(\s*\{\s*([\s\S]*?)\}\s*,\s*([^)]+)\)/g, (m, payload, rest) => {
  if (/tenant_id/.test(payload)) return m;
  const newPayload =
    payload.replace(/,\s*$/,'').trim() +
    `,\n    tenant_id: 'tenant_admin',\n    is_super: true`;
  return `jwt.sign({\n    ${newPayload}\n  }, ${rest})`;
});

// D) add /admin/bootstrap-tenant if missing
if (!/\/admin\/bootstrap-tenant'/.test(s)) {
  const bootstrap = `
app.post('/admin/bootstrap-tenant', authMiddleware, async (req, res) => {
  try {
    if (!req.user?.is_super) {
      return res.status(403).json({ ok:false, error: 'forbidden' });
    }
    const tid = req.user?.tenant_id;
    if (!tid) return res.status(400).json({ ok:false, error:'no tenant_id in token' });

    await q(
      \`INSERT INTO tenants(tenant_id, name, plan, created_at, updated_at)
       VALUES($1,$2,'pro_plus',EXTRACT(EPOCH FROM NOW()),EXTRACT(EPOCH FROM NOW()))
       ON CONFLICT (tenant_id) DO NOTHING\`,
      [tid, 'Cyber Guard Pro']
    );

    return res.json({ ok:true, tenant_id: tid });
  } catch (e) {
    console.error('bootstrap-tenant error', e);
    return res.status(500).json({ ok:false, error:'bootstrap failed' });
  }
});
`.trim();

  // insert right before app.listen(...)
  s = s.replace(/app\.listen\([\s\S]*$/, bootstrap + "\n\n$&");
}

if (s !== before) {
  fs.writeFileSync(P, s, 'utf8');
  console.log('✅ Patched admin-login, normalized jwt payload, and added /admin/bootstrap-tenant.');
} else {
  console.log('ℹ️ No changes needed.');
}
