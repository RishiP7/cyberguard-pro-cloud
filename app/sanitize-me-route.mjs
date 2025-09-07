import fs from 'fs';

const P = 'app/src/index.js';
let s = fs.readFileSync(P, 'utf8');
const before = s;

// A) Remove any existing /me handler (including our earlier markers)
//    Also remove a single stray closing brace '}' that might follow it.
s = s
  // remove any block with our markers
  .replace(/\/\*\s*=====.*?\/me.*?=====.*?\*\/[\s\S]*?(?:\n\}\s*\n)?/g, '')
  // remove naked app.get('/me', ...) blocks that might not have markers
  .replace(
    /app\.get\(\s*['"]\/me['"]\s*,[\s\S]*?\)\s*;\s*(?:\n\}\s*\n)?/g,
    ''
  );

// B) Clean up accidental orphan braces near the old line 1266
//    (only remove braces that are alone on a line to be conservative)
s = s.replace(/\n\}\s*\n(?=\n|\/\/|\/\*|const|let|var|app\.|import|export)/g, '\n');

// C) Insert a fresh, balanced NO-DB /me route right after express.json()
const ROUTE = `
/* ===== NO-DB /me (clean) ===== */
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
/* ===== /me end ===== */
`.trim() + "\n";

// ensure express.json exists; if not, add it
if (!/app\.use\(\s*express\.json\(\)\s*\)\s*;?/.test(s)) {
  s = s.replace(
    /const\s+app\s*=\s*express\(\)\s*;?/,
    m => `${m}\napp.use(express.json());`
  );
}

// inject route after express.json()
s = s.replace(
  /app\.use\(\s*express\.json\(\)\s*\)\s*;?/,
  m => `${m}\n${ROUTE}`
);

// D) Quick local balance check for route payload (very conservative)
const afterIdx = s.indexOf("/* ===== NO-DB /me (clean) ===== */");
if (afterIdx === -1) {
  throw new Error("Failed to insert /me route");
}
const snippet = s.slice(afterIdx, afterIdx + 600);
const opens = (snippet.match(/\{/g) || []).length;
const closes = (snippet.match(/\}/g) || []).length;
if (opens !== closes) {
  throw new Error(`Brace mismatch in /me route snippet: {=${opens}}=${closes}`);
}

// Write file if changed
if (s !== before) {
  fs.writeFileSync(P, s, 'utf8');
  console.log('✅ /me sanitized and reinserted cleanly after express.json().');
} else {
  console.log('ℹ️ No changes were necessary.');
}
