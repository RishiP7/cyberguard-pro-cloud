import fs from 'node:fs';

const p = 'app/src/index.js';
const before = fs.readFileSync(p, 'utf8');
let s = before;

// ensure express.json()
if (!/app\.use\(\s*express\.json\(\)\s*\)/.test(s)) {
  s = s.replace(/(const\s+app\s*=\s*express\(\)\s*;)/,
                `$1\napp.use(express.json());`);
}

// ensure jwt import
if (!/from\s+['"]jsonwebtoken['"]/.test(s)) {
  s = s.replace(
    /(import[\s\S]*?from\s+['"]express['"]\s*;?\s*\n)/,
    (m) => m + `import jwt from 'jsonwebtoken';\n`
  );
}

// add /auth/login if missing
if (!/app\.post\(\s*['"]\/auth\/login['"]/.test(s)) {
  const block = `
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@cyberguardpro.com';
    const adminPass  = process.env.ADMIN_PASSWORD || 'ChangeMeNow!';
    if (email === adminEmail && password === adminPass) {
      const token = jwt.sign(
        { sub: email, role: 'owner', plan: 'pro_plus' },
        process.env.JWT_SECRET || 'dev-secret',
        { expiresIn: '12h' }
      );
      return res.json({ ok: true, token });
    }
    return res.status(401).json({ ok:false, error: 'invalid credentials' });
  } catch (e) {
    console.error('auth/login error', e);
    return res.status(500).json({ ok:false, error: 'server error' });
  }
});
`.trim();

  if (/app\.use\(\s*express\.json\(\)\s*\)/.test(s)) {
    s = s.replace(/app\.use\(\s*express\.json\(\)\s*\);?/, (m)=> m + `\n\n${block}\n`);
  } else {
    s = s.replace(/(const\s+app\s*=\s*express\(\)\s*;)/, (m)=> m + `\n\n${block}\n`);
  }
}

if (s !== before) {
  fs.writeFileSync(p, s, 'utf8');
  console.log('✅ Patched API: express.json, jsonwebtoken import, and /auth/login added.');
} else {
  console.log('ℹ️ No API changes needed.');
}
