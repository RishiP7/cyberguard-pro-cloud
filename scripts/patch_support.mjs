import fs from 'node:fs';
const p = 'app/src/index.js';
let s = fs.readFileSync(p,'utf8');
let changed = false;

// A) Ensure imports
if (!/from ['"]xss['"]/.test(s)) {
  s = s.replace(/(\n\s*import .*?;[\r\n]+)/, m => `${m}import xss from 'xss';\n`);
  changed = true;
}
if (!/from ['"]@sendgrid\/mail['"]/.test(s)) {
  s = s.replace(/(\n\s*import .*?;[\r\n]+)/, m => `${m}import sgMail from '@sendgrid/mail';\n`);
  changed = true;
}
if (!/sgMail\.setApiKey\(/.test(s)) {
  // put it near other app bootstrapping (after CORS/helmet/morgan usually)
  s = s.replace(/app\.use\(helmet\(\)\);\s*\n/, m => `${m}sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');\n`);
  changed = true;
}

// B) Add /support/send if missing
if (!/app\.post\(['"]\/support\/send['"]/.test(s)) {
  const block = `
/**
 * Support form endpoint
 * POST /support/send  { name, email, message }
 */
app.post('/support/send', async (req, res) => {
  try {
    const name = String(req.body?.name || '').slice(0, 200);
    const email = String(req.body?.email || '').slice(0, 320);
    const message = String(req.body?.message || '').slice(0, 5000);

    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      return res.status(400).json({ ok:false, error:'invalid email' });
    }

    const safeName = xss(name);
    const safeMsg  = xss(message);

    const to   = process.env.SUPPORT_TO   || 'cyberguardpro@outlook.com';
    const from = process.env.SUPPORT_FROM || 'cyberguardpro@outlook.com';
    const subject = \`Support: \${safeName || email} (\${new Date().toISOString().slice(0,10)})\`;

    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ ok:false, error: 'SENDGRID_API_KEY not set' });
    }

    await sgMail.send({
      to,
      from,
      subject,
      text: \`From: \${safeName} <\${email}>\n\n\${safeMsg}\`,
      replyTo: email
    });

    return res.json({ ok:true });
  } catch (e) {
    console.error('support/send failed', e);
    return res.status(500).json({ ok:false, error:'send failed' });
  }
});
`;
  // append just before the final start/listen if possible; otherwise at end
  if (/app\.listen\(/.test(s)) {
    s = s.replace(/(\n\s*app\.listen\([^\n]*\);\s*\n)/, block + '$1');
  } else {
    s += '\n' + block;
  }
  changed = true;
}

if (changed) {
  fs.writeFileSync(p, s);
  console.log('✅ support endpoint patched into', p);
} else {
  console.log('ℹ️ No changes needed (imports + route already present).');
}
