import fs from 'node:fs';

const p = 'app/src/index.js';
const before = fs.readFileSync(p, 'utf8');
let s = before;

// Ensure express.json()
if (!/app\.use\(\s*express\.json\(\)\s*\)/.test(s)) {
  s = s.replace(/(const\s+app\s*=\s*express\(\)\s*;)/,
                `$1\napp.use(express.json());`);
}

// Ensure jsonwebtoken import
if (!/from\s+['"]jsonwebtoken['"]/.test(s)) {
  s = s.replace(
    /(import[\s\S]*?from\s+['"]express['"]\s*;?\s*\n)/,
    (m) => m + `import jwt from 'jsonwebtoken';\n`
  );
}

// Add /auth/admin-login (idempotent)
if (!/app\.post\(\s*['"]\/auth\/admin-login['"]/.test(s)) {
  const block = `
app.post('/auth/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@cyberguardpro.com';
    const adminPass  = process.env.ADMIN_PASSWORD || 'ChangeMeNow!';
    if (email === adminEmail && password === adminPass) {
      const token = (await import('jsonwebtoken')).default.sign(
        { sub: email, role: 'owner', plan: 'pro_plus' },
        process.env.JWT_SECRET || 'dev-secret',
        { expiresIn: '12h' }
      );
      return res.json({ ok: true, token });
    }
    return res.status(401).json({ ok:false, error: 'invalid credentials' });
  } catch (e) {
    console.error('auth/admin-login error', e);
    return res.status(500).json({ ok:false, error: 'server error' });
  }
});
`.trim();
  // place it right after express.json for clarity
  s = s.replace(/app\.use\(\s*express\.json\(\)\s*\);?/, (m)=> m + `\n\n${block}\n`);
}

if (s !== before) {
  fs.writeFileSync(p, s, 'utf8');
  console.log('✅ Added /auth/admin-login (env-based) + ensured express.json & jwt import.');
} else {
  console.log('ℹ️ API already has /auth/admin-login.');
}
