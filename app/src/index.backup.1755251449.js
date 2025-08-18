import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://cybermon:cyberpass@localhost:5432/cyberguardpro';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';
const ADMIN_KEY = process.env.ADMIN_KEY || 'dev_admin_key'; // owner console access
const BRAND = 'CyberGuard Pro';

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: false });
const app = express();
app.use(cors());
app.use(bodyParser.json());

function now(){ return Math.floor(Date.now()/1000); }
function signToken({tenant_id, email}){ return jwt.sign({tenant_id, email}, JWT_SECRET, { expiresIn: '12h' }); }

function authMiddleware(req,res,next){
  const h = req.headers.authorization||'';
  if(!h.startsWith('Bearer ')) return res.status(401).json({ error:'Missing Bearer token' });
  try{
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
  }catch(e){
    return res.status(401).json({ error:'Invalid token' });
  }
  next();
}

function adminMiddleware(req,res,next){
  if((req.headers['x-admin-key']||'') !== ADMIN_KEY) return res.status(401).json({ error:'admin key required' });
  next();
}

app.get('/', (_req,res)=>res.json({ ok:true, service:`${BRAND} Cloud API`, version:'2.2.0' }));

// ===== Auth =====
app.post('/auth/register', async (req,res)=>{
  const { email, password, company } = req.body||{};
  if(!email || !password || !company) return res.status(400).json({ error:'email, password, company required' });
  const tenant_id = company; // simple: name as id; you could slugify
  const password_hash = await bcrypt.hash(password, 10);

  // upsert tenant (trial by default)
  await pool.query(`
    INSERT INTO tenants(id, name, plan, created_at)
    VALUES($1,$2,$3,$4)
    ON CONFLICT (id) DO NOTHING
  `,[tenant_id, company, 'trial', now()]);

  const id = uuidv4();
  try{
    await pool.query(`
      INSERT INTO users(id, email, password_hash, tenant_id, role, created_at)
      VALUES($1,$2,$3,$4,$5,$6)
    `,[id, email, password_hash, tenant_id, 'member', now()]);
  }catch(e){
    if(String(e).includes('duplicate key')) return res.status(409).json({ error:'email already registered' });
    throw e;
  }

  const token = signToken({ tenant_id, email });
  res.json({ ok:true, token, tenant_id, plan:'trial' });
});

app.post('/auth/login', async (req,res)=>{
  const { email, password } = req.body||{};
  if(!email || !password) return res.status(400).json({ error:'email and password required' });
  const { rows } = await pool.query('SELECT id, email, password_hash, tenant_id, role FROM users WHERE email=$1 LIMIT 1',[email]);
  if(!rows.length) return res.status(401).json({ error:'invalid credentials' });
  const u = rows[0];
  const ok = await bcrypt.compare(password, u.password_hash);
  if(!ok) return res.status(401).json({ error:'invalid credentials' });
  const token = signToken({ tenant_id: u.tenant_id, email: u.email });
  res.json({ ok:true, token });
});

// ===== Billing (dev mock) =====
app.post('/billing/mock-activate', authMiddleware, async (req,res)=>{
  const { plan } = req.body||{};
  if(!['basic','pro','pro_plus'].includes(String(plan||'').toLowerCase()))
    return res.status(400).json({ error:'plan must be basic|pro|pro_plus' });
  const p = String(plan).toLowerCase();
  await pool.query('UPDATE tenants SET plan=$1 WHERE id=$2',[p, req.user.tenant_id]);
  res.json({ ok:true, plan:p });
});

// ===== API keys =====
app.post('/apikeys', authMiddleware, async (req,res)=>{
  const id = uuidv4();
  await pool.query('INSERT INTO apikeys(id, tenant_id, created_at, revoked) VALUES($1,$2,$3,false)',[id, req.user.tenant_id, now()]);
  res.json({ ok:true, api_key:id });
});

app.get('/apikeys', authMiddleware, async (req,res)=>{
  const { rows } = await pool.query('SELECT id, revoked, created_at FROM apikeys WHERE tenant_id=$1 ORDER BY created_at DESC',[req.user.tenant_id]);
  res.json({ ok:true, keys: rows });
});

app.post('/apikeys/revoke', authMiddleware, async (req,res)=>{
  const { id } = req.body||{};
  if(!id) return res.status(400).json({ error:'id required' });
  await pool.query('UPDATE apikeys SET revoked=true WHERE id=$1 AND tenant_id=$2',[id, req.user.tenant_id]);
  res.json({ ok:true });
});

// ===== Ingest + Alerts/Actions (already in your app) =====
// NOTE: This block assumes you already have tables alerts/actions and simple policy
// Keep your existing logic — here’s a tiny “pass-through” example with tenant scoping:

function apiKeyMiddleware(req,res,next){
  const k = req.headers['x-api-key']||'';
  if(!k) return res.status(401).json({ error:'Missing API key' });
  pool.query('SELECT tenant_id, revoked FROM apikeys WHERE id=$1 LIMIT 1',[k]).then(({rows})=>{
    if(!rows.length || rows[0].revoked) return res.status(401).json({ error:'Invalid API key' });
    req.tenant_id = rows[0].tenant_id;
    next();
  }).catch(next);
}

async function insertAlert(tenant_id, event, score, status){
  const id = uuidv4();
  await pool.query(`
    INSERT INTO alerts(id, tenant_id, event_json, score, status, created_at)
    VALUES($1,$2,$3,$4,$5,$6)
  `,[id, tenant_id, event, score, status, now()]);
  return id;
}
async function insertAction(alert_id, action, target_kind){
  const id = uuidv4();
  await pool.query(`
    INSERT INTO actions(id, alert_id, action, target_kind, created_at)
    VALUES($1,$2,$3,$4,$5)
  `,[id, alert_id, action, target_kind, now()]);
  return id;
}

function scoreEdm(evt){ // simple scoring example
  if(evt.file_ops?.burst >= 1000) return -0.6;
  return -0.2;
}
function scoreDns(evt){ return evt.verdict==='dns-tunnel' ? -1.0 : -0.2; }
function scoreUeba(evt){ return (evt.anomaly||'').includes('impossible') ? -1.0 : -0.2; }

app.post('/edr/ingest', apiKeyMiddleware, async (req,res)=>{
  const events = req.body?.events||[];
  const out = [];
  for(const e of events){
    const evt = { ...e, type:'edr' };
    const score = scoreEdm(evt);
    const status = score<=-0.6 ? 'remediated' : 'new';
    const alert_id = await insertAlert(req.tenant_id, evt, score, status);
    if(status==='remediated') await insertAction(alert_id, 'quarantine', 'edr');
    out.push({ score, anomaly:score<=-0.5 });
  }
  res.json({ tenant_id:req.tenant_id, results: out });
});

app.post('/dns/ingest', apiKeyMiddleware, async (req,res)=>{
  const events = req.body?.events||[];
  const out = [];
  for(const e of events){
    const evt = { ...e, type:'dns' };
    const score = scoreDns(evt);
    const status = score<=-0.6 ? 'remediated' : 'new';
    const alert_id = await insertAlert(req.tenant_id, evt, score, status);
    if(status==='remediated') await insertAction(alert_id, 'dns_deny', 'dns');
    out.push({ score, anomaly:score<=-0.5 });
  }
  res.json({ tenant_id:req.tenant_id, results: out });
});

app.post('/logs/ingest', apiKeyMiddleware, async (req,res)=>{
  const events = req.body?.events||[];
  const out = [];
  for(const e of events){
    const evt = { ...e, type:'ueba' };
    const score = scoreUeba(evt);
    const status = score<=-0.6 ? 'remediated' : 'new';
    const alert_id = await insertAlert(req.tenant_id, evt, score, status);
    if(status==='remediated') await insertAction(alert_id, 'disable_account', 'ueba');
    out.push({ score, anomaly:score<=-0.5 });
  }
  res.json({ tenant_id:req.tenant_id, results: out });
});

app.get('/alerts', authMiddleware, async (req,res)=>{
  const { rows } = await pool.query(
    "SELECT id, tenant_id, event_json AS event, score, status, created_at FROM alerts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200",
    [req.user.tenant_id]
  );
  res.json({ ok:true, alerts: rows });
});

app.get('/actions', authMiddleware, async (req,res)=>{
  const { rows } = await pool.query(
    "SELECT id, alert_id, action, target_kind, created_at FROM actions WHERE alert_id IN (SELECT id FROM alerts WHERE tenant_id=$1) ORDER BY created_at DESC LIMIT 200",
    [req.user.tenant_id]
  );
  res.json({ ok:true, actions: rows });
});

// ===== Admin (owner) — no customer data, metadata only =====
app.get('/admin/tenants', adminMiddleware, async (_req,res)=>{
  const { rows } = await pool.query(`
    SELECT t.id, t.name, t.plan, t.created_at,
      (SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.id) AS users,
      (SELECT COUNT(*) FROM apikeys k WHERE k.tenant_id=t.id AND NOT k.revoked) AS active_keys,
      (SELECT MAX(created_at) FROM alerts a WHERE a.tenant_id=t.id) AS last_alert
    FROM tenants t
    ORDER BY t.created_at DESC
    LIMIT 500
  `);
  res.json({ ok:true, tenants: rows });
});

app.post('/admin/revoke-key', adminMiddleware, async (req,res)=>{
  const { id } = req.body||{};
  if(!id) return res.status(400).json({ error:'id required' });
  await pool.query('UPDATE apikeys SET revoked=true WHERE id=$1',[id]);
  res.json({ ok:true });
});

app.listen(PORT, ()=>console.log(`${BRAND} API listening on :${PORT}`));

// ===== Me (current tenant & plan) =====
app.get('/me', authMiddleware, async (req,res)=>{
  try{
    const { rows } = await pool.query(
      'SELECT id, name, plan FROM tenants WHERE id=$1',
      [req.user.tenant_id]
    );
    if(rows.length){
      return res.json({ ok:true, tenant: rows[0] });
    }
    // Fallback if tenant row wasn't created yet
    return res.json({ ok:true, tenant: { id:req.user.tenant_id, name:req.user.tenant_id, plan:'trial' } });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'failed to load /me' });
  }
});

// ===== Upgrade (alias of mock-activate) =====
app.post('/billing/upgrade', authMiddleware, async (req,res)=>{
  try{
    const { plan } = req.body || {};
    const allowed = new Set(['basic','pro','pro_plus','trial']);
    if(!plan || !allowed.has(plan)) return res.status(400).json({ error:'invalid plan' });

    // upsert tenant with new plan
    await pool.query(`
      INSERT INTO tenants(id, name, plan, created_at)
      VALUES($1,$2,$3, EXTRACT(EPOCH FROM NOW()))
      ON CONFLICT (id) DO UPDATE SET plan=EXCLUDED.plan
    `, [req.user.tenant_id, req.user.tenant_id, plan]);

    res.json({ ok:true, plan });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'upgrade failed' });
  }
});

// ===== Stripe test-mode billing (optional) =====
import Stripe from 'stripe';
const STRIPE_SECRET = process.env.STRIPE_SECRET || "";             // sk_test_***
const PRICE_BASIC   = process.env.STRIPE_PRICE_BASIC || "";        // price_***
const PRICE_PRO     = process.env.STRIPE_PRICE_PRO || "";          // price_***
const PRICE_PROPLUS = process.env.STRIPE_PRICE_PROPLUS || "";      // price_***
const PUBLIC_BASE   = process.env.PUBLIC_BASE || "http://localhost:5173"; // where to send user back

let stripe = null;
if (STRIPE_SECRET) {
  try { stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-06-20" }); } catch {}
}

// Create a Checkout Session and return a URL
app.post('/billing/stripe/create-checkout', authMiddleware, async (req,res)=>{
  try{
    if(!stripe) return res.status(400).json({ error:"Stripe not configured" });
    const { plan } = req.body||{};
    const map = { basic: PRICE_BASIC, pro: PRICE_PRO, pro_plus: PRICE_PROPLUS };
    const price = map[plan];
    if(!price) return res.status(400).json({ error:"invalid plan" });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${PUBLIC_BASE}/pricing?success=1&plan=${plan}`,
      cancel_url: `${PUBLIC_BASE}/pricing?canceled=1`,
      metadata: { tenant_id: req.user.tenant_id, email: req.user.email, plan },
    });

    res.json({ ok:true, url: session.url });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:"stripe checkout failed" });
  }
});

// Webhook to mark plan active after payment (test-mode safe)
app.post('/billing/stripe/webhook', express.raw({type:'application/json'}), async (req,res)=>{
  try{
    if(!stripe) return res.status(400).send('Stripe not configured');
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || ""; // whsec_***

    let event = null;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("Webhook signature verify failed", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // When the session completes, activate plan on our side
    if(event.type === 'checkout.session.completed'){
      const sess = event.data.object;
      const plan = sess?.metadata?.plan;
      const tenant = sess?.metadata?.tenant_id;
      const allowed = new Set(['basic','pro','pro_plus']);
      if (tenant && allowed.has(plan)) {
        await pool.query(`
          INSERT INTO tenants(id, name, plan, created_at)
          VALUES($1,$2,$3, EXTRACT(EPOCH FROM NOW()))
          ON CONFLICT (id) DO UPDATE SET plan=EXCLUDED.plan
        `, [tenant, tenant, plan]);
        console.log(`Stripe webhook: upgraded ${tenant} -> ${plan}`);
      }
    }

    res.json({ received: true });
  }catch(e){
    console.error(e);
    res.status(500).send('webhook error');
  }
});

// NOTE: Keep mock endpoints in dev for easy testing
// app.post('/billing/mock-activate') already exists
// app.post('/billing/upgrade') already exists


// ===== Admin security (GDPR-aware) =====
const ADMIN_KEY = process.env.ADMIN_KEY || "";
function adminMiddleware(req,res,next){
  if(!ADMIN_KEY) return res.status(403).json({ error:"admin key not set" });
  const k = req.headers["x-admin-key"];
  if(k !== ADMIN_KEY) return res.status(403).json({ error:"forbidden" });
  next();
}

// List tenants with plan & safe aggregates (no raw data)
app.get('/admin/tenants', adminMiddleware, async (_req,res)=>{
  try{
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.name,
        t.plan,
        t.created_at,
        COALESCE(u.cnt,0)  AS users,
        COALESCE(k.cnt,0)  AS active_keys,
        COALESCE(a.last,0) AS last_alert
      FROM tenants t
      LEFT JOIN (
        SELECT tenant_id, COUNT(*) AS cnt
        FROM users GROUP BY tenant_id
      ) u ON u.tenant_id = t.id
      LEFT JOIN (
        SELECT tenant_id, COUNT(*) AS cnt
        FROM apikeys WHERE NOT revoked GROUP BY tenant_id
      ) k ON k.tenant_id = t.id
      LEFT JOIN (
        SELECT tenant_id, MAX(created_at) AS last
        FROM alerts GROUP BY tenant_id
      ) a ON a.tenant_id = t.id
      ORDER BY t.created_at DESC
      LIMIT 1000
    `);
    res.json({ ok:true, tenants: rows });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'admin tenants failed' });
  }
});

// List API keys for a tenant (no secrets other than key IDs)
app.get('/admin/tenant/:id/keys', adminMiddleware, async (req,res)=>{
  try{
    const { rows } = await pool.query(
      `SELECT id, revoked, created_at FROM apikeys WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json({ ok:true, keys: rows });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'admin keys failed' });
  }
});

// Revoke an API key
app.post('/admin/revoke-key', adminMiddleware, async (req,res)=>{
  try{
    const { id } = req.body||{};
    if(!id) return res.status(400).json({ error:'id required' });
    await pool.query(`UPDATE apikeys SET revoked=true WHERE id=$1`, [id]);
    res.json({ ok:true });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'admin revoke failed' });
  }
});
// ===== Admin security (GDPR-aware) =====
const ADMIN_KEY = process.env.ADMIN_KEY || "";
function adminMiddleware(req,res,next){
  if(!ADMIN_KEY) return res.status(403).json({ error:"admin key not set" });
  const k = req.headers["x-admin-key"];
  if(k !== ADMIN_KEY) return res.status(403).json({ error:"forbidden" });
  next();
}

// List tenants with plan & safe aggregates (no raw data)
app.get('/admin/tenants', adminMiddleware, async (_req,res)=>{
  try{
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.name,
        t.plan,
        t.created_at,
        COALESCE(u.cnt,0)  AS users,
        COALESCE(k.cnt,0)  AS active_keys,
        COALESCE(a.last,0) AS last_alert
      FROM tenants t
      LEFT JOIN (SELECT tenant_id, COUNT(*) AS cnt FROM users GROUP BY tenant_id) u ON u.tenant_id=t.id
      LEFT JOIN (SELECT tenant_id, COUNT(*) AS cnt FROM apikeys WHERE NOT revoked GROUP BY tenant_id) k ON k.tenant_id=t.id
      LEFT JOIN (SELECT tenant_id, MAX(created_at) AS last FROM alerts GROUP BY tenant_id) a ON a.tenant_id=t.id
      ORDER BY t.created_at DESC
      LIMIT 1000
    `);
    res.json({ ok:true, tenants: rows });
  }catch(e){
    console.error(e); res.status(500).json({ error:'admin tenants failed' });
  }
});

// List API keys for a tenant (IDs, status, timestamps only)
app.get('/admin/tenant/:id/keys', adminMiddleware, async (req,res)=>{
  try{
    const { rows } = await pool.query(
      `SELECT id, revoked, created_at FROM apikeys WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json({ ok:true, keys: rows });
  }catch(e){
    console.error(e); res.status(500).json({ error:'admin keys failed' });
  }
});

// Revoke an API key
app.post('/admin/revoke-key', adminMiddleware, async (req,res)=>{
  try{
    const { id } = req.body||{};
    if(!id) return res.status(400).json({ error:'id required' });
    await pool.query(`UPDATE apikeys SET revoked=true WHERE id=$1`, [id]);
    res.json({ ok:true });
  }catch(e){
    console.error(e); res.status(500).json({ error:'admin revoke failed' });
  }
});
// ===== Admin: tenant profile (GDPR-safe) =====
app.get('/admin/tenant/:id', adminMiddleware, async (req,res)=>{
  try{
    const { rows } = await pool.query(
      `SELECT id, name, plan, contact_email, notes, is_demo, created_at, updated_at
       FROM tenants WHERE id=$1`, [req.params.id]
    );
    if(!rows.length) return res.status(404).json({ error:'tenant not found' });
    res.json({ ok:true, tenant: rows[0] });
  }catch(e){ console.error(e); res.status(500).json({ error:'admin tenant get failed' }); }
});

app.patch('/admin/tenant/:id', adminMiddleware, async (req,res)=>{
  try{
    const { name, contact_email, notes, is_demo } = req.body || {};
    // Only update provided fields
    const fields = [];
    const vals = [];
    let i=1;
    if(typeof name === 'string'){ fields.push(`name=$${i++}`); vals.push(name); }
    if(typeof contact_email === 'string'){ fields.push(`contact_email=$${i++}`); vals.push(contact_email); }
    if(typeof notes === 'string'){ fields.push(`notes=$${i++}`); vals.push(notes); }
    if(typeof is_demo === 'boolean'){ fields.push(`is_demo=$${i++}`); vals.push(is_demo); }
    fields.push(`updated_at=EXTRACT(EPOCH FROM NOW())`);
    if(vals.length===0){ return res.json({ ok:true, updated:false }); }
    vals.push(req.params.id);
    const sql = `UPDATE tenants SET ${fields.join(', ')} WHERE id=$${i} RETURNING id,name,plan,contact_email,notes,is_demo,created_at,updated_at`;
    const { rows } = await pool.query(sql, vals);
    res.json({ ok:true, tenant: rows[0] });
  }catch(e){ console.error(e); res.status(500).json({ error:'admin tenant patch failed' }); }
});
// ===== Admin: tenant profile (GDPR-safe) =====
app.get('/admin/tenant/:id', adminMiddleware, async (req,res)=>{
  try{
    const { rows } = await pool.query(
      `SELECT id, name, plan, contact_email, notes, is_demo, created_at, updated_at
       FROM tenants WHERE id=$1`, [req.params.id]
    );
    if(!rows.length) return res.status(404).json({ error:'tenant not found' });
    res.json({ ok:true, tenant: rows[0] });
  }catch(e){ console.error(e); res.status(500).json({ error:'admin tenant get failed' }); }
});

app.patch('/admin/tenant/:id', adminMiddleware, async (req,res)=>{
  try{
    const { name, contact_email, notes, is_demo } = req.body || {};
    const fields = [], vals = []; let i=1;
    if(typeof name === 'string'){ fields.push(`name=$${i++}`); vals.push(name); }
    if(typeof contact_email === 'string'){ fields.push(`contact_email=$${i++}`); vals.push(contact_email); }
    if(typeof notes === 'string'){ fields.push(`notes=$${i++}`); vals.push(notes); }
    if(typeof is_demo === 'boolean'){ fields.push(`is_demo=$${i++}`); vals.push(is_demo); }
    fields.push(`updated_at=EXTRACT(EPOCH FROM NOW())`);
    if(vals.length===0){ return res.json({ ok:true, updated:false }); }
    vals.push(req.params.id);
    const sql = `UPDATE tenants SET ${fields.join(', ')} WHERE id=$${i}
                 RETURNING id,name,plan,contact_email,notes,is_demo,created_at,updated_at`;
    const { rows } = await pool.query(sql, vals);
    res.json({ ok:true, tenant: rows[0] });
  }catch(e){ console.error(e); res.status(500).json({ error:'admin tenant patch failed' }); }
});
