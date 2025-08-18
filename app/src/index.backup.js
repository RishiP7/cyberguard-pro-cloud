import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 8080;
const BRAND = 'CyberGuard Pro';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://cybermon:cyberpass@localhost:5432/cyberguardpro';

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: false });

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ===== Policy (per-tenant, in-memory) =====
const defaultPolicy = { enabled: true, threshold: -0.90, feeds: { email:true, edr:true, dns:true, ueba:true } };
const policyByTenant = new Map();
const getPolicy = (tenantId)=> policyByTenant.get(tenantId) || defaultPolicy;
const setPolicy = (tenantId, patch)=>{
  const cur = getPolicy(tenantId);
  const merged = {
    enabled: patch.enabled ?? cur.enabled,
    threshold: (patch.threshold !== undefined) ? Number(patch.threshold) : cur.threshold,
    feeds: { ...cur.feeds, ...(patch.feeds||{}) }
  };
  policyByTenant.set(tenantId, merged);
  return merged;
};

// ===== Helpers =====
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error:'Missing token' });
  try { req.user = jwt.verify(header.slice(7), JWT_SECRET); next(); }
  catch { return res.status(401).json({ error:'Invalid token' }); }
}
async function apiKeyTenant(req) {
  const key = req.headers['x-api-key'];
  if (!key) return null;
  const { rows } = await pool.query('SELECT tenant_id FROM apikeys WHERE id=$1 AND revoked=false',[key]);
  return rows[0]?.tenant_id || null;
}
async function recordAction({ alertId, action, target_kind }) {
  const id = uuidv4();
  await pool.query(
    'INSERT INTO actions(id, alert_id, action, target_kind, created_at) VALUES($1,$2,$3,$4,$5)',
    [id, alertId, action, target_kind||null, Math.floor(Date.now()/1000)]
  );
  return id;
}
async function saveAlert(tenant_id, eventObj, score) {
  const id = uuidv4();
  let status = 'new';
  const pol = getPolicy(tenant_id);
  if (pol.enabled && score <= (pol.threshold ?? -0.9)) {
    status = 'remediated';
    const type = (eventObj.type||'').toLowerCase();
    const action = type==='edr' ? 'quarantine' : type==='dns' ? 'dns_deny' : type==='ueba' ? 'disable_account' : 'block_sender';
    await recordAction({ alertId:id, action, target_kind:type||null });
  }
  await pool.query(
    'INSERT INTO alerts(id, tenant_id, event_json, score, status, created_at) VALUES($1,$2,$3,$4,$5,$6)',
    [id, tenant_id, eventObj, score, status, Math.floor(Date.now()/1000)]
  );
  return id;
}

// ===== Health =====
app.get('/', (_req,res)=> res.json({ ok:true, service:`${BRAND} Cloud API`, version:'2.1.0' }));

// ===== Auth & Billing (mock) =====
app.post('/auth/login', (req,res)=>{
  const { email, password } = req.body||{};
  if (!email || password!=='test123') return res.status(401).json({ error:'invalid credentials' });
  const token = jwt.sign({ tenant_id: email, email }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});
app.post('/billing/mock-activate', authMiddleware, (req,res)=>{
  res.json({ ok:true, plan: req.body?.plan || 'pro_plus' });
});

// ===== API Keys (persisted) =====
app.post('/apikeys', authMiddleware, async (req,res)=>{
  const id = uuidv4();
  await pool.query('INSERT INTO apikeys(id, tenant_id, created_at, revoked) VALUES($1,$2,$3,false)',
    [id, req.user.tenant_id, Math.floor(Date.now()/1000)]);
  res.json({ ok:true, api_key:id });
});
app.post('/apikeys/revoke', authMiddleware, async (req,res)=>{
  const { api_key } = req.body||{};
  if(!api_key) return res.status(400).json({ error:'api_key required' });
  const { rowCount } = await pool.query('UPDATE apikeys SET revoked=true WHERE id=$1 AND tenant_id=$2',[api_key, req.user.tenant_id]);
  if(!rowCount) return res.status(404).json({ error:'not found' });
  res.json({ ok:true });
});

// ===== Policy routes =====
app.get('/policy', authMiddleware, (req,res)=> res.json(getPolicy(req.user.tenant_id)));
app.post('/policy', authMiddleware, (req,res)=> res.json(setPolicy(req.user.tenant_id, req.body||{})));

// ===== Ingest: Email =====
app.post('/email/scan', async (req,res)=>{
  const tenant_id = await apiKeyTenant(req);
  if(!tenant_id) return res.status(401).json({ error:'Invalid API key' });
  const emails = req.body?.emails || [];
  const results = [];
  for(const m of emails){
    let r=0;
    if (m.display_name_domain && m.from_domain && m.display_name_domain.toLowerCase()!==m.from_domain.toLowerCase()) r+=2;
    if (Array.isArray(m.attachment_types) && m.attachment_types.some(t=>/zip|exe|js|vbs|scr|bat|cmd|ps1|docm|xlsm/i.test(t))) r+=2;
    if (Array.isArray(m.urls) && m.urls.some(u=>/(bit\.ly|tinyurl|\.ru|\.cn|\.tk|\.top|mega\.nz|drive\.google)/i.test(u))) r+=2;
    if (m.spf_pass===false) r+=1;
    if (m.dkim_pass===false) r+=1;
    if (m.dmarc_pass===false) r+=1;
    if (/urgent|verify|password|suspend|invoice/i.test(m.subject||'')) r+=1;
    const score = -Math.min(r,10)/10;
    const anomaly = r>=3;
    results.push({ email:{ from:m.from, subject:m.subject }, score, anomaly });
    if (anomaly) await saveAlert(tenant_id, { type:'email', ...m }, score);
  }
  res.json({ tenant_id, results });
});

// ===== Ingest: EDR =====
app.post('/edr/ingest', async (req,res)=>{
  const tenant_id = await apiKeyTenant(req);
  if(!tenant_id) return res.status(401).json({ error:'Invalid API key' });
  const events = req.body?.events || [];
  const results = [];
  for(const ev of events){
    let r=0;
    if (/powershell\.exe|cmd\.exe|wscript\.exe/i.test(ev.process||'')) r+=1;
    if (/-enc|FromBase64String/i.test(ev.cmdline||'')) r+=2;
    if ((ev.file_ops?.burst||0) > 500) r+=3;
    const score = -Math.min(r,10)/10;
    const anomaly = r>=3;
    results.push({ score, anomaly });
    if (anomaly) await saveAlert(tenant_id, { type:'edr', ...ev }, score);
  }
  res.json({ tenant_id, results });
});

// ===== Ingest: DNS =====
app.post('/dns/ingest', async (req,res)=>{
  const tenant_id = await apiKeyTenant(req);
  if(!tenant_id) return res.status(401).json({ error:'Invalid API key' });
  const events = req.body?.events || [];
  const results = [];
  for(const ev of events){
    let r=0;
    if (/\.(zip|top|tk|ru|cn)$/i.test(ev.qname||'')) r+=1;
    if (ev.newly_registered) r+=2;
    if (/dns-tunnel|iodine|dnscat/i.test(ev.verdict||'')) r+=3;
    const score = -Math.min(r,6)/6;
    const anomaly = r>=2;
    results.push({ score, anomaly });
    if (anomaly) await saveAlert(tenant_id, { type:'dns', ...ev }, score);
  }
  res.json({ tenant_id, results });
});

// ===== Ingest: UEBA / Logs =====
app.post('/logs/ingest', async (req,res)=>{
  const tenant_id = await apiKeyTenant(req);
  if(!tenant_id) return res.status(401).json({ error:'Invalid API key' });
  const events = req.body?.events || [];
  const results = [];
  for(const ev of events){
    let r=0;
    if (ev.anomaly==='impossible_travel') r+=3;
    if (ev.mass_download) r+=2;
    if (ev.off_hours) r+=1;
    const score = -Math.min(r,6)/6;
    const anomaly = r>=2;
    results.push({ score, anomaly });
    if (anomaly) await saveAlert(tenant_id, { type:'ueba', ...ev }, score);
  }
  res.json({ tenant_id, results });
});

// ===== Views =====
app.get('/alerts', authMiddleware, async (req,res)=>{
  const { rows } = await pool.query(
    "SELECT id, tenant_id, event_json AS event, score, status, created_at FROM alerts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200",
    [req.user.tenant_id]
  );
  res.json({ ok:true, alerts: rows });
});
app.get('/actions', authMiddleware, async (req,res)=>{
  const { rows } = await pool.query(
    "SELECT id, alert_id, action, target_kind, created_at FROM actions ORDER BY created_at DESC LIMIT 200"
  );
  res.json({ ok:true, actions: rows });
});

// ===== Start =====
app.listen(PORT, ()=>console.log(`${BRAND} API (persisted) listening on :${PORT}`));
