import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import pg from "pg";
import bcrypt from "bcryptjs";
import OpenAI from "openai";
import { EventEmitter } from "events";
import { URLSearchParams } from "url";
import querystring from "node:querystring";

const OPENAI_API_KEY=process.env.OPENAI_API_KEY||"";
const AI_MODEL=process.env.AI_MODEL||"gpt-4o-mini";
const SLACK_WEBHOOK_URL=process.env.SLACK_WEBHOOK_URL||"";
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const PORT=process.env.PORT||8080;
const BRAND="CyberGuard Pro Cloud API";
const JWT_SECRET=process.env.JWT_SECRET||"dev_secret_key";
const ADMIN_KEY=process.env.ADMIN_KEY||"dev_admin_key";
const DATABASE_URL = process.env.DATABASE_URL || "postgres://cybermon:cyberpass@localhost:5432/cyberguardpro";
const isRender = !!process.env.RENDER || /render\.com/.test(DATABASE_URL);
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: isRender ? { rejectUnauthorized: false } : false,
});
const q=(sql,vals=[])=>pool.query(sql,vals);
const bus = new EventEmitter();
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(/[\s,]+/)
  .filter(Boolean)
  .map(s => s.toLowerCase());
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

// ===== Email OAuth env (M365 + Google) =====
const M365_CLIENT_ID     = process.env.M365_CLIENT_ID || "";
const M365_CLIENT_SECRET = process.env.M365_CLIENT_SECRET || "";
const M365_TENANT        = process.env.M365_TENANT || process.env.M365_TENANT_ID || "common";
const M365_REDIRECT      = process.env.M365_REDIRECT || process.env.M365_REDIRECT_URI || ""; // e.g. https://your-api.onrender.com/auth/m365/callback

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT      = process.env.GOOGLE_REDIRECT || process.env.GOOGLE_REDIRECT_URI || ""; // e.g. https://your-api.onrender.com/auth/google/callback

// ----- CORS (explicit allowlist) -----
const ALLOWED_ORIGINS = Array.from(new Set(
  (`${process.env.CORS_ORIGINS||''},https://cyberguard-pro-cloud.onrender.com,https://cyberguard-pro-cloud-1.onrender.com,http://localhost:5173`)
    .split(/[\,\s]+/)
    .map(s => (s||'').trim().toLowerCase().replace(/\/$/, ''))
    .filter(Boolean)
));

// Frontend URL for post-auth redirects
const FRONTEND_URL = process.env.FRONTEND_URL || ALLOWED_ORIGINS[0] || "http://localhost:5173";

function corsOrigin(origin, cb){
  if (!origin) return cb(null, true); // non-browser / same-host
  const norm = String(origin).trim().toLowerCase().replace(/\/$/, '');
  const allowed = ALLOWED_ORIGINS.includes(norm);
  return cb(null, allowed);
}

app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: [
    "Origin","X-Requested-With","Content-Type","Accept","Authorization",
    "x-api-key","x-admin-key","x-plan-preview","x-admin-override"
  ],
  exposedHeaders: [
    "RateLimit-Policy","RateLimit-Limit","RateLimit-Remaining","RateLimit-Reset"
  ]
}));

// Preflight
app.options("*", cors({
  origin: corsOrigin,
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: [
    "Origin","X-Requested-With","Content-Type","Accept","Authorization",
    "x-api-key","x-admin-key","x-plan-preview","x-admin-override"
  ],
  exposedHeaders: [
    "RateLimit-Policy","RateLimit-Limit","RateLimit-Remaining","RateLimit-Reset"
  ],
  optionsSuccessStatus: 204
}));
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

// redacted request logging
morgan.token("body",req=>{
  const b={...req.body};
  if(b.password) b.password="***";
  if(b.token) b.token="***";
  return JSON.stringify(b).slice(0,400);
});
app.use(morgan(':method :url :status - :response-time ms :body'));

// ---------- helpers ----------
const now=()=>Math.floor(Date.now()/1000);
const authMiddleware=async (req,res,next)=>{
  try{
    const hdr=req.headers.authorization||"";
    const tok=hdr.startsWith("Bearer ")?hdr.slice(7):"";
    const dec=jwt.verify(tok,JWT_SECRET);
    req.user = {
  email: dec.email,
  tenant_id: dec.tenant_id,
  role: dec.role || 'member',
  is_super: !!dec.is_super
};
    next();
  }catch(e){ return res.status(401).json({error:"Invalid token"}); }
};
const adminMiddleware=(req,res,next)=>{
  if((req.headers["x-admin-key"]||"")!==ADMIN_KEY) return res.status(401).json({error:"unauthorized"});
  next();
};
const requirePaid = plan => ["basic","pro","pro_plus"].includes(String(plan||"").toLowerCase());
async function enforceActive(req, res, next){
try{
  const flags = readAdminFlags(req);
  if(req.user?.is_super && flags.override){ return next(); }

  const t = await getEffectivePlan(req.user.tenant_id, req);
  const allowed = (t.effective && t.effective !== 'suspended');
  if (!allowed) return res.status(402).json({ error: 'subscription inactive' });
  next();
}catch(e){
  console.error('enforceActive error', e);
  return res.status(500).json({ error: 'billing check failed' });
}
}
function requireSuper(req, res, next) { if (!req.user?.is_super) return res.status(403).json({ error: 'forbidden' }); next(); }
function requireOwner(req, res, next) { if (!(req.user?.is_super || (req.user?.role === 'owner'))) return res.status(403).json({ error: 'forbidden' }); next(); }

function readAdminFlags(req){
  const preview = req.headers['x-plan-preview']; // 'trial'|'basic'|'pro'|'pro+'
  const override = req.headers['x-admin-override'] === '1';
  return { preview, override };
}

async function getEffectivePlan(tenant_id, req){
  const { rows } = await q(`SELECT plan, trial_started_at, trial_ends_at, trial_status FROM tenants WHERE tenant_id=$1`, [tenant_id]);
  if(!rows.length) return { plan:null, trial_started_at:null, trial_ends_at:null, trial_status:null, effective:'none', trial_active:false };
  const t = rows[0];
  const nowEpoch = now();

  const basePlan = String(t.plan || 'basic').toLowerCase();
  const trialEligible = (basePlan === 'basic' || basePlan === 'pro');
  const trialActive   = trialEligible && (t.trial_ends_at ? Number(t.trial_ends_at) > nowEpoch : false);

  // Super admin preview override (UI can pass x-plan-preview)
  const flags = readAdminFlags(req||{headers:{}});
  let effective = t.plan || 'basic';
  if (trialActive) effective = 'pro_plus';
  if (flags && flags.preview && (req?.user?.is_super)) {
    effective = String(flags.preview).toLowerCase();
  }

  return {
    plan: t.plan,
    trial_started_at: t.trial_started_at || null,
    trial_ends_at: t.trial_ends_at || null,
    trial_status: t.trial_status || (trialActive ? 'active' : 'ended'),
    effective,
    trial_active: trialActive
  };
}

async function aiReply(tenant_id, prompt){
  try{
    const key = process.env.OPENAI_API_KEY;
    if(!key){
      if(/how|why|help|error|fix|configure/i.test(prompt||'')){
        return 'Troubleshooting steps: 1) Verify API key in Account. 2) Confirm subscription or trial is active. 3) Test your ingest endpoint with curl. 4) Check Admin > Tenants > Logs. Paste error messages for specific guidance.';
      }
      return 'Thanks for your message. An admin will respond shortly.';
    }
    const r = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages:[
          {role:'system', content:`You are the CyberGuard Pro Admin Assistant. You know product features, plans (Basic, Pro, Pro+), trial flow, endpoints (/email/ingest, /endpoint/ingest, /network/ingest, /cloud/ingest), alert SSE (/alerts/stream), account/billing, admin tools (suspend, rotate key, impersonate), and Render/Node/Postgres basics. Give concise, actionable steps.`},
          {role:'user', content: String(prompt||'')}
        ],
        temperature: 0.3,
        max_tokens: 400
      })
    });
    const j = await r.json();
    return j.choices?.[0]?.message?.content || 'I have noted your message.';
  }catch(e){
    console.error('aiReply error', e);
    return 'Assistant is unavailable right now. An admin will reply shortly.';
  }
}

// ---- API key based auth for integrations & connector upsert helper ----
async function tenantIdFromApiKey(key){
  if(!key) return null;
  try{
    const { rows } = await q(`SELECT tenant_id FROM apikeys WHERE id=$1 AND revoked=false`, [key]);
    return rows[0]?.tenant_id || null;
  }catch(_e){ return null; }
}
function apiKeyAuth(req,res,next){
  const key = req.headers['x-api-key'] || req.headers['x_api_key'];
  if(!key) return res.status(401).json({ error: 'Missing x-api-key' });
  tenantIdFromApiKey(key).then(tid=>{
    if(!tid) return res.status(401).json({ error: 'Invalid API key' });
    req.user = { tenant_id: tid, role: 'integration' };
    next();
  }).catch(()=>res.status(500).json({ error: 'api key check failed' }));
}
async function upsertConnector(tenant_id, type, provider, patch){
  const id = `${type}:${tenant_id}`;
  await q(`INSERT INTO connectors(id,tenant_id,type,provider,status,details,created_at,updated_at)
           VALUES($1,$2,$3,$4,COALESCE($5,'connected'),COALESCE($6::jsonb,'{}'::jsonb),EXTRACT(EPOCH FROM NOW()),EXTRACT(EPOCH FROM NOW()))
           ON CONFLICT (id) DO UPDATE SET
             provider=EXCLUDED.provider,
             status=COALESCE(EXCLUDED.status,'connected'),
             details=COALESCE(connectors.details,'{}'::jsonb) || COALESCE(EXCLUDED.details,'{}'::jsonb),
             updated_at=EXTRACT(EPOCH FROM NOW())`,
           [id, tenant_id, type, provider||null, patch?.status||'connected', patch?.details? JSON.stringify(patch.details) : '{}']);
}

// ====== Email connector helpers ======
async function getEmailConnector(tenant_id){
  // Prefer deterministic id for single-email-connector design
  const id = `email:${tenant_id}`;
  const byId = await q(`SELECT id, tenant_id, type, provider, status, details, updated_at FROM connectors WHERE id=$1`, [id]);
  if (byId.rows && byId.rows.length) return byId.rows[0];
  // Fallback: latest email connector if schema was older
  const latest = await q(`SELECT id, tenant_id, type, provider, status, details, updated_at FROM connectors WHERE tenant_id=$1 AND type='email' ORDER BY updated_at DESC LIMIT 1`, [tenant_id]);
  return latest.rows[0] || null;
}

function maskTokens(details){
  try{
    const d = JSON.parse(JSON.stringify(details||{}));
    if(d.tokens){
      if(d.tokens.access_token) d.tokens.access_token = d.tokens.access_token.slice(0,6)+"…";
      if(d.tokens.refresh_token) d.tokens.refresh_token = d.tokens.refresh_token.slice(0,6)+"…";
    }
    return d;
  }catch(_){ return details || {}; }
}

// ===== M365 email polling helpers =====
async function getM365AccessTokenForTenant(tenant_id){
  const conn = await getEmailConnector(tenant_id);
  if(!conn || conn.provider !== 'm365') return { ok:false, reason:'not m365-connected' };
  const details = conn.details || {};
  let access = details?.tokens?.access_token || null;
  const refresh = details?.tokens?.refresh_token || null;
  if (access) return { ok:true, access };
  if (!refresh) return { ok:false, reason:'no tokens' };

  const candidates = Array.from(new Set([
    details.tenant_used || details.tokens?.tenant || null,
    (process.env.M365_TENANT || process.env.M365_TENANT_ID || '').trim() || null,
    'consumers',
    'common'
  ].filter(Boolean)));

  let lastErr = null;
  for (const ten of candidates) {
    try {
      const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(ten)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type':'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.M365_CLIENT_ID || '',
          client_secret: process.env.M365_CLIENT_SECRET || '',
          grant_type: 'refresh_token',
          refresh_token: refresh,
          redirect_uri: process.env.M365_REDIRECT_URI || ''
        })
      });
      const j = await r.json().catch(()=>({}));
      if (r.ok && j.access_token) {
        access = j.access_token;
        await upsertConnector(tenant_id, 'email', 'm365', {
          status: 'connected',
          details: { ...(details||{}), tenant_used: ten, tokens: { ...(details?.tokens||{}), ...j } }
        });
        return { ok:true, access };
      }
      lastErr = j;
    } catch (e) { lastErr = e; }
  }
  return { ok:false, reason:'refresh_failed', detail:lastErr };
}

async function graphGet(tenant_id, path){
  const conn = await getEmailConnector(tenant_id);
  if(!conn || conn.provider !== 'm365') throw new Error('not m365-connected');
  const base = 'https://graph.microsoft.com/v1.0';
  const details = conn.details || {};
  let access = details?.tokens?.access_token || null;
  const refresh = details?.tokens?.refresh_token || null;
  async function doGet(tok){
    return fetch(base + path, { headers: { Authorization: `Bearer ${tok}` } });
  }
  if(!access && refresh){
    const rTok = await getM365AccessTokenForTenant(tenant_id);
    if(!rTok.ok) throw new Error('token_unavailable');
    access = rTok.access;
  }
  let resp = await doGet(access);
  if(resp.status === 401 && refresh){
    const rTok = await getM365AccessTokenForTenant(tenant_id);
    if(!rTok.ok) throw new Error('refresh_failed');
    access = rTok.access;
    resp = await doGet(access);
  }
  return resp;
}

function classifyEmail(subject, bodyPreview){
  const txt = ((subject||'') + ' ' + (bodyPreview||''))
    .toLowerCase()
    .slice(0, 8000);

  let score = -0.1; // normal default

  const keywordsHigh = /(urgent|verify\s+account|confirm\s+identity|password\s*reset|wire\s*transfer|bank\s*details|gift\s*(card|cards)|crypto|bitcoin|invoice\s*(overdue|due)|action\s*required|refund)/i;
  const keywordsMed  = /(click\s*here|open\s*attachment|security\s*alert|login\s*issue|detect(ed)?|blocked|suspended|outlook|microsoft|office\s*365|sharepoint|onedrive)/i;

  if (keywordsHigh.test(txt)) score = -1.0;
  else if (keywordsMed.test(txt)) score = -0.6;

  // Presence of URL nudges suspicious unless already high
  const hasUrl = /(https?:\/\/|www\.)[\w\-._~:/?#\[\]@!$&'()*+,;=%]+/.test(txt);
  if (hasUrl && score > -1.0) score = Math.min(score, -0.6);

  return score;
}

// ---- Realtime scans ring buffer (per-tenant, in-memory) ----
const recentScans = new Map(); // tenant_id -> [{subject,from,when,severity,score}, ...]
function pushRecentScan(tenant_id, row){
  const arr = recentScans.get(tenant_id) || [];
  arr.unshift(row);
  if (arr.length > 100) arr.pop();
  recentScans.set(tenant_id, arr);
}
function getRecentScans(tenant_id){
  return recentScans.get(tenant_id) || [];
}
async function scanAndRecordEmails(tenant_id, items){
  let alertsCreated = 0;
  for(const m of items){
    const subj = m.subject || '';
    const from = m.from?.emailAddress?.address || null;
    const preview = m.bodyPreview || '';
    // Derive the canonical timestamp for this email (used by UI)
    const when = (
      m.receivedDateTime
        ? m.receivedDateTime
        : (m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString())
    );
    // Event that will be persisted into alerts.event_json
    const ev = { type:'email', from, subject: subj, preview, when, anomaly:false };
    const score = classifyEmail(subj, preview);
    ev.anomaly = (score <= -0.6);
    // --- realtime scan fanout (for frontend "RealtimeEmailScans") ---
    const severity = (score <= -0.8) ? 'high' : (score <= -0.6) ? 'medium' : 'none';
    try {
      // in-memory recent ring buffer
      pushRecentScan(tenant_id, {
        subject: subj,
        from,
        when,
        severity,
        score
      });
      // SSE broadcast
      bus.emit('scan', { tenant_id, scan: { subject: subj, from, when, severity, score } });
    } catch(_e) {}
    const alert = await writeAlert(tenant_id, ev);
    if(alert) alertsCreated++;
  }
  return alertsCreated;
}

async function fetchM365Inbox(tenant_id, maxCount=10){
  const sel = '$select=receivedDateTime,from,subject,bodyPreview,webLink';
  const ord = '$orderby=receivedDateTime desc';
  const top = `$top=${Math.max(1, Math.min(25, maxCount))}`;
  const path = `/me/messages?${sel}&${ord}&${top}`;
  const r = await graphGet(tenant_id, path);
  if(!r.ok){
    const t = await r.text().catch(()=>"");
    throw new Error(`graph ${r.status}: ${t.slice(0,200)}`);
  }
  const j = await r.json();
  return Array.isArray(j?.value) ? j.value : [];
}

// ===== M365 delta polling (only new/changed messages) =====
async function fetchM365Delta(tenant_id, pageTop = 25) {
  const sel  = '$select=receivedDateTime,from,subject,bodyPreview,webLink';
  const base = `/me/mailFolders/Inbox/messages/delta?${sel}&$orderby=receivedDateTime%20desc&$top=${Math.max(1,Math.min(50,pageTop))}`;

  const conn = await getEmailConnector(tenant_id);
  const prev = conn?.details?.delta?.m365 || null;

  let url = prev ? prev.replace('https://graph.microsoft.com/v1.0','') : base;
  let items = [];

  while (url) {
    const r = await graphGet(tenant_id, url);
    if (!r.ok) {
      const t = await r.text().catch(()=> "");
      throw new Error(`delta ${r.status}: ${t.slice(0,200)}`);
    }
    const j = await r.json();
    if (Array.isArray(j?.value)) items = items.concat(j.value);

    const next  = j['@odata.nextLink'] || null;
    const delta = j['@odata.deltaLink'] || null;
    if (next) { url = next.replace('https://graph.microsoft.com/v1.0',''); continue; }
    if (delta) {
      await upsertConnector(tenant_id, 'email', 'm365', {
        status: 'connected',
        details: { ...(conn?.details||{}), delta: { ...(conn?.details?.delta||{}), m365: delta } }
      });
    }
    break;
  }
  return items;
}

// ===== Gmail helpers (refresh + list) =====
async function getGoogleAccessTokenForTenant(tenant_id){
  const conn = await getEmailConnector(tenant_id);
  if(!conn || conn.provider !== 'google') return { ok:false };
  const details = conn.details || {};
  let access = details?.tokens?.access_token || null;
  const refresh = details?.tokens?.refresh_token || null;
  if (access) return { ok:true, access };
  if (!refresh) return { ok:false };
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: refresh
    })
  });
  const j = await r.json();
  if(!r.ok || !j.access_token) return { ok:false };
  await upsertConnector(tenant_id, 'email', 'google', { status:'connected', details: { ...(details||{}), tokens: { ...(details?.tokens||{}), ...j } } });
  return { ok:true, access: j.access_token };
}

async function gmailList(tenant_id, qStr = 'newer_than:1d', max = 25){
  const conn = await getEmailConnector(tenant_id);
  if(!conn || conn.provider !== 'google') return [];
  const accTok = await getGoogleAccessTokenForTenant(tenant_id);
  if(!accTok.ok) return [];

  const params = new URLSearchParams({ q: qStr, maxResults: String(Math.max(1,Math.min(100,max))) });
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accTok.access}` }
  });
  if(!r.ok) return [];
  const j = await r.json();
  const ids = (j.messages||[]).map(m=>m.id).slice(0,max);

  const out = [];
  for(const id of ids){
    const pr = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date&metadataHeaders=To`,{
      headers:{ Authorization:`Bearer ${accTok.access}` }
    });
    if(pr.ok){
      const msg = await pr.json();
      const headers = Object.fromEntries((msg.payload?.headers||[]).map(h=>[h.name.toLowerCase(), h.value]));
      out.push({
        id: msg.id,
        subject: headers['subject']||'',
        from: { emailAddress: { address: headers['from']||null } },
        receivedDateTime: headers['date']||null,
        internalDate: msg.internalDate || null,
        bodyPreview: ''
      });
    }
  }
  return out;
}
// ---------- DB bootstrap (idempotent) ----------
(async ()=>{
  await q(`
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE TABLE IF NOT EXISTS tenants(
    tenant_id TEXT PRIMARY KEY,
    id TEXT,
    name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'trial',
    contact_email TEXT,
    notes TEXT,
    is_demo BOOLEAN DEFAULT false,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
  );
  -- Backward compatibility for older schemas
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS id TEXT;
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE tenants SET tenant_id = COALESCE(tenant_id, id);
  UPDATE tenants SET id = COALESCE(id, tenant_id);
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_started_at BIGINT;
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at BIGINT;
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_status TEXT;
  CREATE TABLE IF NOT EXISTS users(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_id);
  -- API keys (single canonical schema: TEXT id)
  CREATE TABLE IF NOT EXISTS apikeys(
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT false,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
  );
  CREATE INDEX IF NOT EXISTS apikeys_tenant_idx ON apikeys(tenant_id);
  -- Migrate from older UUID-based id column to TEXT, if needed
  DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name='apikeys' AND column_name='id' AND data_type='uuid'
    ) THEN
      ALTER TABLE apikeys ALTER COLUMN id TYPE TEXT USING id::text;
    END IF;
  END $$;

  CREATE TABLE IF NOT EXISTS policy(
    tenant_id TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT true,
    threshold NUMERIC NOT NULL DEFAULT -0.6,
    allow_quarantine BOOLEAN NOT NULL DEFAULT true,
    allow_dns_deny BOOLEAN NOT NULL DEFAULT true,
    allow_disable_account BOOLEAN NOT NULL DEFAULT true,
    dry_run BOOLEAN NOT NULL DEFAULT false,
    feeds JSONB NOT NULL DEFAULT '{"email":true,"edr":true,"dns":true,"ueba":true,"cloud":true}'
  );

  CREATE TABLE IF NOT EXISTS alerts(
    id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    event_json JSONB NOT NULL,
    score NUMERIC NOT NULL,
    status TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
CREATE TABLE IF NOT EXISTS ai_summaries(
  alert_id UUID PRIMARY KEY,
  summary TEXT NOT NULL,
  recommended_actions TEXT,
  model TEXT,
  created_at BIGINT NOT NULL
);
  CREATE INDEX IF NOT EXISTS alerts_tenant_idx ON alerts(tenant_id);
  CREATE INDEX IF NOT EXISTS alerts_created_idx ON alerts(created_at DESC);

  CREATE TABLE IF NOT EXISTS actions(
    id UUID PRIMARY KEY,
    alert_id UUID NOT NULL,
    tenant_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_kind TEXT,
    result_json JSONB,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS actions_alert_idx ON actions(alert_id);

  CREATE TABLE IF NOT EXISTS usage_events(
    id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS usage_month_idx ON usage_events(tenant_id,created_at);
  `);
await q(`
  CREATE TABLE IF NOT EXISTS ops_runs(
    id UUID PRIMARY KEY,
    run_type TEXT NOT NULL,
    details JSONB,
    created_at BIGINT NOT NULL
  );
`);
  await q(`
  -- Integrations / connectors state
  CREATE TABLE IF NOT EXISTS connectors (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    type TEXT NOT NULL,            -- 'email','edr','dns','ueba','cloud'
    provider TEXT,                 -- e.g. 'gmail','o365','aws','gcp','azure','imap'
    status TEXT NOT NULL DEFAULT 'disconnected',  -- 'connected','pending','error','disconnected'
    details JSONB DEFAULT '{}'::jsonb,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
  );
  CREATE INDEX IF NOT EXISTS connectors_tenant_idx ON connectors(tenant_id);
  CREATE INDEX IF NOT EXISTS connectors_type_idx ON connectors(type);

  -- EDR agents registry
  CREATE TABLE IF NOT EXISTS edr_agents (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    hostname TEXT,
    platform TEXT,             -- 'windows','macos','linux'
    enroll_token TEXT,
    last_seen BIGINT,
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
  );
  CREATE INDEX IF NOT EXISTS edr_agents_tenant_idx ON edr_agents(tenant_id);
  `);
  await q(`
  CREATE TABLE IF NOT EXISTS chat_messages(
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    author TEXT NOT NULL, -- 'user' | 'admin' | 'ai'
    body TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_messages_tenant_idx ON chat_messages(tenant_id, created_at);
  `);
  })().catch(console.error);
// ===== Integrations: Summary =====
app.get('/integrations/status', authMiddleware, async (req,res)=>{
  try{
    const { rows } = await q(`SELECT type,provider,status,details,updated_at FROM connectors WHERE tenant_id=$1`, [req.user.tenant_id]);
    return res.json({ ok:true, items: rows });
  }catch(e){ return res.status(500).json({ error:'status failed' }); }
});

// ===== Integrations: Email =====
app.get('/integrations/email/status', authMiddleware, async (req,res)=>{
  try{
    const conn = await getEmailConnector(req.user.tenant_id);
    return res.json({ ok:true, connector: conn ? { provider: conn.provider, status: conn.status, details: maskTokens(conn.details), updated_at: conn.updated_at } : null });
  }catch(e){ return res.status(500).json({ error: 'status failed' }); }
});
app.post('/integrations/email/connect', authMiddleware, enforceActive, async (req,res)=>{
  try{
    const { provider, settings } = req.body||{};
    if(!provider) return res.status(400).json({ error:'missing provider' });
    await upsertConnector(req.user.tenant_id, 'email', provider, { status:'connected', details: settings||{} });
    return res.json({ ok:true });
  }catch(e){ return res.status(500).json({ error:'connect failed' }); }
});

// ===== OAuth: Microsoft 365 (Outlook) =====
// helpers to pull token from query or header
function extractBearer(req) {
  const qTok = (req.query?.token || "").trim();
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h || "");
  return qTok || (m ? m[1] : "");
}

// --- M365 OAuth start (robust) ---
app.get("/auth/m365/start", async (req, res) => {
  try {
    const FRONTEND_URL = process.env.FRONTEND_URL || "https://cyberguard-pro-cloud-1.onrender.com";
    // Prefer multi-tenant flows unless a specific tenant is configured
    const wantedTenant = (process.env.M365_TENANT || "").trim().toLowerCase();
    const TENANT = wantedTenant && wantedTenant !== "common" && wantedTenant !== "consumers"
      ? wantedTenant
      : (wantedTenant || "common");
    const CLIENT_ID = process.env.M365_CLIENT_ID;
    const REDIRECT = process.env.M365_REDIRECT_URI || (FRONTEND_URL.replace(/\/$/,"") + "/auth/m365/callback");
    const SECRET = process.env.JWT_SECRET;

    if (!CLIENT_ID || !REDIRECT) {
      return res.status(500).json({
        error: "m365 env missing",
        have: { CLIENT_ID: !!CLIENT_ID, REDIRECT: !!REDIRECT }
      });
    }

    // verify the user token (from ?token= or Authorization header)
    const tok = extractBearer(req);
    if (!tok) return res.status(401).json({ error: "missing token" });

    let decoded;
    try { decoded = jwt.verify(tok, SECRET); }
    catch(e){ return res.status(401).json({ error: "invalid token" }); }

    // build authorization URL
    const authParams = {
      client_id: CLIENT_ID,
      response_type: "code",
      response_mode: "query",
      redirect_uri: REDIRECT,
      scope: ["openid","offline_access","email","User.Read","Mail.Read"].join(" "),
      state: Buffer.from(JSON.stringify({
        r: (process.env.FRONTEND_URL || "https://cyberguard-pro-cloud-1.onrender.com") + "/integrations",
        t: tok
      })).toString("base64url")
    };

    const authUrl = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?` +
      querystring.stringify(authParams);

    // go to Microsoft login
    return res.redirect(302, authUrl);

  } catch (e) {
    console.error("m365/start failed", e);
    return res.status(500).json({ error: "start failed" });
  }
});

// TEMP: quick diag to see what API is reading
app.get("/auth/m365/diag", (req, res) => {
  const tok = extractBearer(req);
  let d = null;
  try { d = jwt.decode(tok || ""); } catch(_){}
  res.json({
    ok: true,
    from: "diag",
    have: {
      CLIENT_ID: !!process.env.M365_CLIENT_ID,
      REDIRECT: !!process.env.M365_REDIRECT_URI,
      TENANT: process.env.M365_TENANT || null
    },
    token_present: !!tok,
    token_decoded: d || null
  });
});

app.get("/auth/m365/callback", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query || {};
    if (error) return res.status(400).send(String(error_description || error));
    if (!code || !state) return res.status(400).send("missing code/state");

    // Decode our state (base64url JSON: { r, t }) to recover the user's JWT
    let sessionToken = null;
    try {
      const decodedState = JSON.parse(Buffer.from(String(state), "base64url").toString("utf8"));
      sessionToken = decodedState?.t || null;
    } catch (_) {}
    if (!sessionToken) return res.status(400).send("bad state");

    let sess;
    try {
      sess = jwt.verify(sessionToken, JWT_SECRET);
    } catch (_) {
      return res.status(401).send("invalid session");
    }
    const tenant_id = sess?.tenant_id;
    if (!tenant_id) return res.status(400).send("missing tenant in session");

    // Preferred tenant from env; fall back to 'common'
    const envTenant = (process.env.M365_TENANT || process.env.M365_TENANT_ID || "").trim();
    const preferredTenant = envTenant || "common";
    const redirectUri = process.env.M365_REDIRECT_URI || process.env.M365_REDIRECT || ((process.env.FRONTEND_URL || "https://cyberguard-pro-cloud-1.onrender.com").replace(/\/$/, "") + "/auth/m365/callback");

    async function exchangeWithTenant(tenantSlug) {
      const body = new URLSearchParams({
        client_id: process.env.M365_CLIENT_ID || "",
        client_secret: process.env.M365_CLIENT_SECRET || "",
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: redirectUri,
        scope: "offline_access openid email Mail.Read"
      });
      const resp = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantSlug)}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      const json = await resp.json();
      return { ok: resp.ok && !!json?.access_token, json };
    }

    // Try env tenant first, then consumers, then common
    const attempts = [preferredTenant, "consumers", "common"]
      .filter((v, i, a) => v && a.indexOf(v) === i);

    let tokens = null; let usedTenant = null;
    for (const t of attempts) {
      const r = await exchangeWithTenant(t);
      if (r.ok) { tokens = r.json; usedTenant = t; break; }
      const msg = (r.json?.error_description || r.json?.error || '').toString();
      const personal = /personal Microsoft account|AADSTS70000121/i.test(msg);
      if (!personal && t !== attempts[attempts.length-1]) continue;
    }

    if (!tokens || !tokens.access_token) {
      console.error('m365 token exchange failed (all attempts)');
      const to = `${FRONTEND_URL.replace(/\/$/, '')}/integrations?connected=m365&ok=0&err=${encodeURIComponent('token_exchange_failed')}`;
      return res.redirect(to);
    }

    // Fetch identity for “Connected as …”
    let account = null;
    try {
      const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      if (meRes.ok) {
        const me = await meRes.json();
        account = {
          id: me?.id || null,
          upn: me?.userPrincipalName || null,
          displayName: me?.displayName || null,
          mail: me?.mail || null
        };
      }
    } catch(_) {}

    await upsertConnector(tenant_id, 'email', 'm365', {
      status: 'connected',
      details: { tokens, account, delta: { m365: null }, tenant_used: usedTenant }
    });
    const to = `${FRONTEND_URL.replace(/\/$/, "")}/integrations?connected=m365&ok=1`;
    return res.redirect(to);
  } catch (e) {
    console.error("M365 callback error", e);
    const to = `${FRONTEND_URL.replace(/\/$/, "")}/integrations?connected=m365&ok=0&err=${encodeURIComponent("callback_failed")}`;
    return res.redirect(to);
  }
});

// ===== OAuth: Google Workspace (Gmail) =====
app.get("/auth/google/start", async (req, res) => {
  try {
    // Accept token from Authorization header or ?token= query
    let tok = null;
    const h = req.headers.authorization || "";
    if (h.startsWith("Bearer ")) tok = h.slice(7);
    if (!tok && req.query && req.query.token) tok = String(req.query.token);

    if (!tok) return res.status(401).json({ error: "missing token" });

    let decoded;
    try {
      decoded = jwt.verify(tok, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT) return res.status(500).json({ error: "google not configured" });

    const state = jwt.sign(
      { tenant_id: decoded.tenant_id, t: Date.now() },
      JWT_SECRET,
      { expiresIn: "10m" }
    );
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT,
      response_type: "code",
      scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
      access_type: "offline",
      prompt: "consent",
      state
    });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return res.redirect(authUrl);
  } catch (e) {
    console.error("google start error", e);
    return res.status(500).json({ error: "start failed" });
  }
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query || {};
    if (error) return res.status(400).send(String(error_description || error));
    if (!code || !state) return res.status(400).send("missing code/state");

    let decoded;
    try {
      decoded = jwt.verify(String(state), JWT_SECRET);
    } catch {
      return res.status(400).send("bad state");
    }
    const tenant_id = decoded?.tenant_id;
    if (!tenant_id) return res.status(400).send("bad state payload");

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT) {
      return res.status(500).send("google not configured");
    }

    const body = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: GOOGLE_REDIRECT
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      const txt = typeof tokens === 'string' ? tokens : JSON.stringify(tokens).slice(0,300);
      const to = `${FRONTEND_URL.replace(/\/$/,"")}/integrations?connected=google&ok=0&err=${encodeURIComponent('token exchange failed')}`;
      return res.redirect(to);
    }

    // Fetch Gmail profile to capture the account email
    const profRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    let profile = null;
    if (profRes.ok) {
      profile = await profRes.json().catch(()=>null);
    }

    await upsertConnector(tenant_id, "email", "google", {
      status: "connected",
      details: {
        account: {
          emailAddress: profile?.emailAddress || null,
          messagesTotal: profile?.messagesTotal || null,
          threadsTotal: profile?.threadsTotal || null
        },
        tokens
      }
    });

    const to = `${FRONTEND_URL.replace(/\/$/,"")}/integrations?connected=google&ok=1`;
    return res.redirect(to);
  } catch (e) {
    console.error("google callback error", e);
    const to = `${FRONTEND_URL.replace(/\/$/,"")}/integrations?connected=google&ok=0&err=${encodeURIComponent('callback failed')}`;
    return res.redirect(to);
  }
});

// ===== Simple verification endpoint used by the wizard =====
app.post("/integrations/email/test", authMiddleware, async (req, res) => {
  try {
    const c = await getEmailConnector(req.user.tenant_id);
    if (!c) return res.json({ ok: true, connected: false, reason: "no connector" });

    if (c.provider === "m365") {
      const details = c.details || {};
      let access = details?.tokens?.access_token || null;
      const refresh = details?.tokens?.refresh_token || null;
      if (!access && refresh) {
        // attempt refresh via helper (tries tenant_used, env, consumers, common)
        const rTok = await getM365AccessTokenForTenant(req.user.tenant_id);
        if (rTok.ok) access = rTok.access;
      }
      if (!access) return res.json({ ok: true, connected: false, provider: 'm365', reason: 'no access token' });

      // Use /me endpoint (requires User.Read and openid/email scopes)
      async function graphTiny(tok){
        return fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${tok}` }
        });
      }

      let r = await graphTiny(access);
      if (r.status === 401 && refresh) {
        const rTok = await getM365AccessTokenForTenant(req.user.tenant_id);
        if (rTok.ok) { access = rTok.access; r = await graphTiny(access); }
      }
      if (!r.ok) {
        const t = await r.text().catch(()=>"");
        return res.json({ ok:true, connected:false, provider:'m365', reason:`graph ${r.status}`, detail:t.slice(0,160) });
      }
      const me = await r.json().catch(()=> ({}));
      return res.json({
        ok: true,
        connected: true,
        provider: 'm365',
        account: {
          id: me?.id || null,
          displayName: me?.displayName || null,
          mail: me?.mail || null,
          userPrincipalName: me?.userPrincipalName || null
        }
      });
    }

    if (c.provider === "google") {
      const details = c.details || {};
      let access = details?.tokens?.access_token || null;
      const refresh = details?.tokens?.refresh_token || null;
      if (!access) return res.json({ ok: true, connected: false, provider: 'google', reason: "no access token" });

      async function gmailProfile(tok){
        return fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tok}` } });
      }
      let profRes = await gmailProfile(access);
      if (profRes.status === 401 && refresh) {
        const rr = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID || "",
            client_secret: GOOGLE_CLIENT_SECRET || "",
            grant_type: "refresh_token",
            refresh_token: refresh
          })
        });
        if (rr.ok) {
          const newTok = await rr.json();
          access = newTok.access_token || access;
          await upsertConnector(req.user.tenant_id, "email", "google", {
            status: "connected",
            details: { ...details, tokens: { ...(details.tokens||{}), ...newTok } }
          });
          profRes = await gmailProfile(access);
        }
      }
      if (!profRes.ok) {
        const t = await profRes.text().catch(()=>"");
        return res.json({ ok:true, connected:false, provider:'google', reason:`gmail ${profRes.status}`, detail:t.slice(0,160) });
      }
      const prof = await profRes.json().catch(()=>({}));
      return res.json({ ok:true, connected:true, provider:'google', account:{ emailAddress: prof?.emailAddress||null } });
    }

    const hasToken = !!(c?.details?.tokens?.access_token || c?.details?.tokens?.refresh_token);
    return res.json({ ok:true, connected: hasToken, provider: c.provider });
  } catch (e) {
    console.error("email test failed", e);
    return res.status(500).json({ error: "test failed" });
  }
});
// ===== Manual refresh endpoint for Google =====
app.post('/auth/google/refresh', authMiddleware, async (req,res)=>{
  try{
    const c = await getEmailConnector(req.user.tenant_id);
    if(!c || c.provider !== 'google') return res.status(400).json({ error:'not google-connected' });
    const refresh = c.details?.tokens?.refresh_token;
    if(!refresh) return res.status(400).json({ error:'no refresh token' });

    const r = await fetch('https://oauth2.googleapis.com/token',{
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID || '',
        client_secret: GOOGLE_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
        refresh_token: refresh
      })
    });
    const j = await r.json();
    if(!r.ok) return res.status(500).json({ ok:false, error:'refresh failed', detail: j });

    await upsertConnector(req.user.tenant_id, 'email', 'google', { status:'connected', details: { ...(c.details||{}), tokens: { ...(c.details?.tokens||{}), ...j } } });
    return res.json({ ok:true });
  }catch(e){ return res.status(500).json({ error:'refresh failed' }); }
});

// ===== Manual refresh endpoint for M365 =====
app.post('/auth/m365/refresh', authMiddleware, async (req,res)=>{
  try{
    const c = await getEmailConnector(req.user.tenant_id);
    if(!c || c.provider !== 'm365') return res.status(400).json({ error:'not m365-connected' });
    const details = c.details || {};
    const refresh = details?.tokens?.refresh_token;
    if(!refresh) return res.status(400).json({ error:'no refresh token' });

    const candidates = Array.from(new Set([
      details.tenant_used || details.tokens?.tenant || null,
      (process.env.M365_TENANT || process.env.M365_TENANT_ID || '').trim() || null,
      'consumers',
      'common'
    ].filter(Boolean)));

    let last = null;
    for (const ten of candidates) {
      const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(ten)}/oauth2/v2.0/token`,{
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body: new URLSearchParams({
          client_id: process.env.M365_CLIENT_ID || '',
          client_secret: process.env.M365_CLIENT_SECRET || '',
          grant_type: 'refresh_token',
          refresh_token: refresh,
          redirect_uri: process.env.M365_REDIRECT_URI || ''
        })
      });
      const j = await r.json();
      if (r.ok && j.access_token) {
        await upsertConnector(req.user.tenant_id, 'email', 'm365', {
          status:'connected',
          details: { ...(details||{}), tenant_used: ten, tokens: { ...(details?.tokens||{}), ...j } }
        });
        return res.json({ ok:true, tenant_used: ten });
      }
      last = j;
    }
    return res.status(500).json({ ok:false, error:'refresh failed', detail:last });
  }catch(e){ return res.status(500).json({ error:'refresh failed' }); }
});

// ===== Safe debug endpoint for email connector (masked) =====
app.get('/integrations/email/debug', authMiddleware, async (req,res)=>{
  try{
    const c = await getEmailConnector(req.user.tenant_id);
    if(!c) return res.json({ ok:true, connector:null });
    return res.json({ ok:true, connector: { id:c.id, provider:c.provider, status:c.status, details: maskTokens(c.details), updated_at:c.updated_at } });
  }catch(e){ return res.status(500).json({ error:'debug failed' }); }
});

// ===== Integrations: EDR =====
app.get('/integrations/edr/status', authMiddleware, async (req,res)=>{
  try{
    const { rows } = await q(`SELECT provider,status,details,updated_at FROM connectors WHERE tenant_id=$1 AND type='edr'`,[req.user.tenant_id]);
    return res.json({ ok:true, connector: rows[0]||null });
  }catch(e){ return res.status(500).json({ error: 'status failed' }); }
});
app.post('/integrations/edr/enrollment-token', authMiddleware, enforceActive, async (req,res)=>{
  try{
    const enroll = 'enr_' + uuidv4().replace(/-/g,'');
    await upsertConnector(req.user.tenant_id, 'edr', 'agent', { status:'connected' });
    await q(`INSERT INTO edr_agents(id, tenant_id, enroll_token, created_at)
             VALUES($1,$2,$3,EXTRACT(EPOCH FROM NOW()))
             ON CONFLICT (id) DO NOTHING`,
            ['tok:'+enroll, req.user.tenant_id, enroll]);
    return res.json({ ok:true, token: enroll });
  }catch(e){ return res.status(500).json({ error:'token failed' }); }
});
app.post('/edr/enroll', async (req,res)=>{
  try{
    const { token, hostname, platform } = req.body||{};
    if(!token) return res.status(400).json({ error:'missing token' });
    const rec = await q(`SELECT tenant_id FROM edr_agents WHERE id=$1 AND enroll_token=$2`, ['tok:'+token, token]).then(r=>r.rows[0]);
    if(!rec) return res.status(401).json({ error:'invalid token' });
    const agent_id = 'agt_' + uuidv4().replace(/-/g,'');
    await q(`UPDATE edr_agents SET id=$1, hostname=$2, platform=$3, enroll_token=NULL, last_seen=EXTRACT(EPOCH FROM NOW()) WHERE id=$4`,
            [agent_id, hostname||null, platform||null, 'tok:'+token]);
    return res.json({ ok:true, agent_id });
  }catch(e){ return res.status(500).json({ error:'enroll failed' }); }
});

// ===== Integrations: DNS =====
app.get('/integrations/dns/status', authMiddleware, async (req,res)=>{
  try{
    const { rows } = await q(`SELECT provider,status,details,updated_at FROM connectors WHERE tenant_id=$1 AND type='dns'`,[req.user.tenant_id]);
    return res.json({ ok:true, connector: rows[0]||null });
  }catch(e){ return res.status(500).json({ error: 'status failed' }); }
});
app.get('/integrations/dns/bootstrap', authMiddleware, enforceActive, async (req,res)=>{
  try{
    await upsertConnector(req.user.tenant_id, 'dns', 'resolver', { status:'connected' });
    const resolver_ips = ['9.9.9.9', '149.112.112.112'];
    const token = 'dns_' + uuidv4().slice(0,8);
    return res.json({ ok:true, resolver_ips, token });
  }catch(e){ return res.status(500).json({ error:'bootstrap failed' }); }
});

// ===== Integrations: UEBA =====
app.get('/integrations/ueba/status', authMiddleware, async (req,res)=>{
  try{
    const { rows } = await q(`SELECT provider,status,details,updated_at FROM connectors WHERE tenant_id=$1 AND type='ueba'`,[req.user.tenant_id]);
    return res.json({ ok:true, connector: rows[0]||null });
  }catch(e){ return res.status(500).json({ error: 'status failed' }); }
});
app.post('/integrations/ueba/connect', authMiddleware, enforceActive, async (req,res)=>{
  try{
    const { provider, settings } = req.body||{}; // 'm365'|'gworkspace'
    if(!provider) return res.status(400).json({ error:'missing provider' });
    await upsertConnector(req.user.tenant_id, 'ueba', provider, { status:'connected', details: settings||{} });
    return res.json({ ok:true });
  }catch(e){ return res.status(500).json({ error:'connect failed' }); }
});

// ===== Integrations: Cloud =====
app.get('/integrations/cloud/status', authMiddleware, async (req,res)=>{
  try{
    const { rows } = await q(`SELECT provider,status,details,updated_at FROM connectors WHERE tenant_id=$1 AND type='cloud'`,[req.user.tenant_id]);
    return res.json({ ok:true, connector: rows[0]||null });
  }catch(e){ return res.status(500).json({ error: 'status failed' }); }
});
app.post('/integrations/cloud/connect', authMiddleware, enforceActive, async (req,res)=>{
  try{
    const { provider, settings } = req.body||{}; // 'aws'|'gcp'|'azure'
    if(!provider) return res.status(400).json({ error:'missing provider' });
    await upsertConnector(req.user.tenant_id, 'cloud', provider, { status:'connected', details: settings||{} });
    return res.json({ ok:true });
  }catch(e){ return res.status(500).json({ error:'connect failed' }); }
});

// ---------- rate limits ----------
const authLimiter=rateLimit({windowMs:15*60*1000,max:50,standardHeaders:true,legacyHeaders:false});
const ingestLimiter=rateLimit({windowMs:60*1000,max:180,standardHeaders:true,legacyHeaders:false});
app.use("/auth",authLimiter);
app.use(["/email/scan","/edr/ingest","/dns/ingest","/logs/ingest","/cloud/ingest"],ingestLimiter);

// ---------- health ----------
app.get("/",(_req,res)=>res.json({ok:true,service:BRAND,version:"2.3.0"}));
app.get("/health",async (_req,res)=>{
  try{ await q("SELECT 1"); res.json({ok:true,db:true,uptime:process.uptime()}); }
  catch(e){ res.status(500).json({ok:false,db:false}); }
});

// ---------- auth ----------
app.post("/auth/login", async (req, res) => {
  try {
    let { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "missing email or password" });
    }

    email = String(email).toLowerCase().trim();

    // Look up user by lowercase email
    const { rows } = await q(
      `SELECT id, email, password_hash, tenant_id, role FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );
    if (!rows.length) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    const user = rows[0];

    // Compare password safely
    const ok = await bcrypt.compare(String(password), user.password_hash || "");
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    // Issue JWT
    const is_super = ADMIN_EMAILS.includes((user.email || "").toLowerCase());
const token = jwt.sign(
  { tenant_id: user.tenant_id, email: user.email, role: user.role || 'member', is_super },
  JWT_SECRET,
  { expiresIn: "7d" }
);
return res.json({ ok: true, token, role: user.role || 'member', is_super });
  } catch (e) {
    return res.status(500).json({ error: "login failed" });
  }
});

app.post("/auth/register",async (req,res)=>{
  try{
    let {company,email,password}=req.body||{};
    if(!company||!email||!password) return res.status(400).json({error:"missing"});
    email = String(email).toLowerCase().trim();
    company = String(company).trim();

    const nowEpoch = now();
    const endsEpoch = nowEpoch + 7*24*3600; // 7-day trial

    await q(`INSERT INTO tenants(tenant_id,id,name,plan,trial_started_at,trial_ends_at,trial_status,created_at,updated_at)
             VALUES($1,$1,$2,'basic',$3,$4,'active',$5,$5)
             ON CONFLICT (tenant_id) DO UPDATE SET
               name=EXCLUDED.name,
               updated_at=EXCLUDED.updated_at`,
      [company, company, nowEpoch, endsEpoch, nowEpoch]
    );

    const hash = await bcrypt.hash(password, 10);
    await q(`INSERT INTO users(email,password_hash,tenant_id,role,created_at)
             VALUES($1,$2,$3,'member',$4)
             ON CONFLICT (email) DO UPDATE SET tenant_id=EXCLUDED.tenant_id`,
      [email,hash,company,nowEpoch]
    );

    res.json({ok:true});
  }catch(e){ res.status(500).json({error:"register failed"}); }
});

// ---------- me / usage ----------
app.get("/me",authMiddleware,async (req,res)=>{
  try{
    const {rows}=await q(`SELECT tenant_id,name,plan,contact_email,trial_started_at,trial_ends_at,trial_status,created_at,updated_at FROM tenants WHERE tenant_id=$1`,[req.user.tenant_id]);
    if(!rows.length) return res.status(404).json({error:"tenant not found"});
    const me = rows[0];
    const eff = await getEffectivePlan(req.user.tenant_id, req);
    me.effective_plan = eff.effective;
    me.trial_active   = eff.trial_active;
    me.plan_actual = eff.plan || me.plan;
    me.role = req.user.role || 'member';
    me.is_super = !!req.user.is_super;
    // --- normalized trial object for frontend ---
    const nowEpoch = now();
    const endsEpoch = (me.trial_ends_at ? Number(me.trial_ends_at) : null) ?? (eff.trial_ends_at ? Number(eff.trial_ends_at) : null);
    const days_left = endsEpoch ? Math.max(0, Math.ceil((endsEpoch - nowEpoch) / (24 * 3600))) : 0;
    me.trial = {
      active: !!(eff.trial_active),
      days_left,
      ends_at: endsEpoch ? new Date(endsEpoch * 1000).toISOString() : null
    };
    // Only Basic/Pro can have an active Pro+ trial
    const basePlanNow = String(me.plan || '').toLowerCase();
    const trialEligibleNow = (basePlanNow === 'basic' || basePlanNow === 'pro');
    if (!trialEligibleNow) {
      me.trial = { active:false, days_left:0, ends_at:null };
    }
    res.json({ ok: true, ...me });
  }catch(e){ res.status(500).json({error:"me failed"}); }
});

app.get("/trial/status", authMiddleware, async (req,res)=>{
  try{
    const t = await getEffectivePlan(req.user.tenant_id, req);
    const nowEpoch = now();
    const basePlan = String(t.plan || '').toLowerCase();
    const eligible = (basePlan === 'basic' || basePlan === 'pro');
    const days_left = (eligible && t.trial_ends_at)
      ? Math.max(0, Math.ceil((Number(t.trial_ends_at)-nowEpoch)/(24*3600)))
      : 0;
    res.json({
      ok: true,
      active: eligible ? !!t.trial_active : false,
      ends_at: eligible ? (t.trial_ends_at || null) : null,
      days_left,
      effective_plan: t.effective,
      plan_actual: t.plan || null
    });
  }catch(e){
    res.status(500).json({ ok:false, error:'trial status failed' });
  }
});

// ---- Admin: start trial (Basic/Pro only) ----
app.post('/admin/trial/start', authMiddleware, requireSuper, async (req, res) => {
  try{
    const { tenant_id, days } = req.body || {};
    const tid = tenant_id || req.user.tenant_id;
    const d = Math.max(1, Math.min(30, Number(days || 7)));
    const nowEpoch = now();
    const ends = nowEpoch + d * 24 * 3600;

    // Ensure tenant exists and is eligible (Basic/Pro only)
    const trow = await q(`SELECT plan FROM tenants WHERE tenant_id=$1`, [tid]).then(r => r.rows[0]);
    if (!trow) return res.status(404).json({ ok:false, error: 'tenant not found' });
    const basePlan = String(trow.plan || 'basic').toLowerCase();
    if (!(basePlan === 'basic' || basePlan === 'pro')) {
      return res.status(400).json({ ok:false, error: 'trial only available for Basic/Pro tenants' });
    }

    await q(
      `UPDATE tenants
          SET trial_started_at = COALESCE(trial_started_at, $2),
              trial_ends_at    = $3,
              trial_status     = 'active',
              updated_at       = $4
        WHERE tenant_id=$1`,
      [tid, nowEpoch, ends, nowEpoch]
    );

    const days_left = Math.max(0, Math.ceil((ends - nowEpoch) / 86400));
    return res.json({
      ok: true,
      tenant_id: tid,
      trial: { active: true, days_left, ends_at: new Date(ends * 1000).toISOString() }
    });
  }catch(e){
    console.error('admin trial start failed', e);
    return res.status(500).json({ ok:false, error: 'trial start failed' });
  }
});

// ---- Admin: end trial now ----
app.post('/admin/trial/end', authMiddleware, requireSuper, async (req, res) => {
  try{
    const { tenant_id } = req.body || {};
    const tid = tenant_id || req.user.tenant_id;
    const nowEpoch = now();

    const r = await q(
      `UPDATE tenants
          SET trial_ends_at = $2,
              trial_status  = 'ended',
              updated_at    = $2
        WHERE tenant_id=$1
        RETURNING tenant_id`,
      [tid, nowEpoch]
    );

    if (!r.rowCount) return res.status(404).json({ ok:false, error: 'tenant not found' });
    return res.json({ ok:true, tenant_id: tid, trial: { active:false, days_left:0, ends_at: new Date(nowEpoch * 1000).toISOString() } });
  }catch(e){
    console.error('admin trial end failed', e);
    return res.status(500).json({ ok:false, error: 'trial end failed' });
  }
});

app.get("/admin/preview-plan", authMiddleware, requireSuper, async (req,res)=>{
  const t = await getEffectivePlan(req.user.tenant_id, req);
  res.json({ ok:true, effective: t.effective, base_plan: t.plan, trial_active: t.trial_active, trial_ends_at: t.trial_ends_at||null });
});

app.get("/usage",authMiddleware,async (req,res)=>{
  const start=new Date(); start.setUTCDate(1); start.setUTCHours(0,0,0,0);
  const startEpoch=Math.floor(start.getTime()/1000);
  const {rows}=await q(`SELECT COUNT(*)::int AS events FROM usage_events WHERE tenant_id=$1 AND created_at>=$2`,[req.user.tenant_id,startEpoch]);
  res.json({ok:true,month_events:rows[0]?.events||0,month_starts_at:startEpoch});
});
app.post('/admin/impersonate', authMiddleware, requireSuper, async (req,res)=>{
  const { tenant_id } = req.body || {};
  if(!tenant_id) return res.status(400).json({error:'missing tenant_id'});
  const token = jwt.sign({ tenant_id, email: req.user.email, role:'owner', is_super:false }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ok:true, token});
});

app.post('/admin/tenants/suspend', authMiddleware, requireSuper, async (req,res)=>{
  const { tenant_id, suspend } = req.body || {};
  if(!tenant_id) return res.status(400).json({error:'missing tenant_id'});
  await q(
    `UPDATE tenants
       SET plan = CASE WHEN $2 THEN 'suspended'
                       ELSE COALESCE(NULLIF(plan,'suspended'),'basic') END,
           updated_at = EXTRACT(EPOCH FROM NOW())
     WHERE tenant_id=$1`,
    [tenant_id, !!suspend]
  );
  res.json({ok:true});
});

app.post('/admin/tenants/rotate-key', authMiddleware, requireOwner, async (req,res)=>{
  const { tenant_id } = req.body || {};
  const tid = (req.user.is_super && tenant_id) ? tenant_id : req.user.tenant_id;
  const newKey = uuidv4();
  await q(`INSERT INTO apikeys(id,tenant_id,created_at,revoked) VALUES($1,$2,$3,false)`, [newKey, tid, now()]);
  res.json({ok:true, api_key:newKey});
});

app.get('/admin/chat/:tenant_id', authMiddleware, requireSuper, async (req,res)=>{
  try{
    const { tenant_id } = req.params;
    const { rows } = await q(`SELECT * FROM chat_messages WHERE tenant_id=$1 ORDER BY created_at ASC`, [tenant_id]);
    res.json({ok:true, messages:rows});
  }catch(e){ res.status(500).json({error:'chat load failed'}); }
});

app.post('/admin/chat/reply', authMiddleware, requireSuper, async (req,res)=>{
  try{
    const { tenant_id, body } = req.body || {};
    if(!tenant_id || !body) return res.status(400).json({error:'missing fields'});
    const msg_id = `m_${uuidv4()}`;
    await q(
      `INSERT INTO chat_messages(id,chat_id,tenant_id,author,body,created_at)
       VALUES($1,$2,$3,'admin',$4,$5)`,
      [msg_id, tenant_id, tenant_id, body, now()]
    );
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:'reply failed'}); }
});

app.post('/chat/send', authMiddleware, async (req,res)=>{
  try{
    const { body } = req.body||{};
    if(!body) return res.status(400).json({error:'missing body'});
    const msg_id = `m_${uuidv4()}`;
    const t = now();
    // use tenant_id as chat_id grouping key (no separate chats table needed)
    await q(`INSERT INTO chat_messages(id,chat_id,tenant_id,author,body,created_at) VALUES($1,$2,$3,'user',$4,$5)`,[msg_id, req.user.tenant_id, req.user.tenant_id, body, t]);
    const aiText = await aiReply(req.user.tenant_id, body);
    const ai_id = `m_${uuidv4()}`;
    await q(`INSERT INTO chat_messages(id,chat_id,tenant_id,author,body,created_at) VALUES($1,$2,$3,'ai',$4,$5)`,[ai_id, req.user.tenant_id, req.user.tenant_id, aiText, now()]);
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:'chat failed'}); }
});

app.post('/admin/ai/ask', authMiddleware, requireSuper, async (req,res)=>{
  try{
    const { question, tenant_id } = req.body||{};
    const context = `Tenant: ${tenant_id||req.user.tenant_id}. Provide steps, relevant endpoints, and quick checks.`;
    const a = await aiReply(tenant_id||req.user.tenant_id, `${context}\n\nQ: ${question}`);
    res.json({ok:true, answer:a});
  }catch(e){ console.error(e); res.status(500).json({error:'ai failed'}); }
});
// ---------- billing mocks ----------
app.post("/billing/mock-activate",authMiddleware,async (req,res)=>{
  try{
    const plan=(req.body?.plan||"").toLowerCase();
    if(!["basic","pro","pro_plus"].includes(plan)) return res.status(400).json({error:"bad plan"});
    await q(`UPDATE tenants SET plan=$1,updated_at=EXTRACT(EPOCH FROM NOW()) WHERE tenant_id=$2`,[plan,req.user.tenant_id]);
    res.json({ok:true,plan});
  }catch(e){ res.status(500).json({error:"activate failed"}); }
});

app.post("/billing/activate",authMiddleware,async (req,res)=>{
  try{
    const plan=(req.body?.plan||"").toLowerCase();
    if(!["basic","pro","pro_plus"].includes(plan)) return res.status(400).json({error:"bad plan"});
    await q(`UPDATE tenants SET plan=$1,updated_at=EXTRACT(EPOCH FROM NOW()) WHERE tenant_id=$2`,[plan,req.user.tenant_id]);
    res.json({ok:true,plan});
  }catch(e){ res.status(500).json({error:"activate failed"}); }
});

// ---------- policy ----------
app.get("/policy",authMiddleware,async (req,res)=>{
  const {rows}=await q(`SELECT tenant_id,enabled,threshold,allow_quarantine,allow_dns_deny,allow_disable_account,dry_run,feeds FROM policy WHERE tenant_id=$1`,[req.user.tenant_id]);
  if(!rows.length){
    await q(`INSERT INTO policy(tenant_id) VALUES($1) ON CONFLICT DO NOTHING`,[req.user.tenant_id]);
    return res.json({
      ok:true,
      tenant_id: req.user.tenant_id,
      enabled:true,
      threshold:-0.6,
      allow_quarantine:true,
      allow_dns_deny:true,
      allow_disable_account:true,
      dry_run:false,
      feeds:{email:true,edr:true,dns:true,ueba:true,cloud:true}
    });
  }
  return res.json({ ok:true, ...rows[0] });
});
app.post("/policy",authMiddleware,async (req,res)=>{
  const p=req.body||{};
  await q(`INSERT INTO policy(tenant_id,enabled,threshold,allow_quarantine,allow_dns_deny,allow_disable_account,dry_run,feeds)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (tenant_id) DO UPDATE SET
             enabled=EXCLUDED.enabled,threshold=EXCLUDED.threshold,
             allow_quarantine=EXCLUDED.allow_quarantine,
             allow_dns_deny=EXCLUDED.allow_dns_deny,
             allow_disable_account=EXCLUDED.allow_disable_account,
             dry_run=EXCLUDED.dry_run,feeds=EXCLUDED.feeds`,
           [req.user.tenant_id,!!p.enabled,Number(p.threshold??-0.6),!!p.allow_quarantine,!!p.allow_dns_deny,!!p.allow_disable_account,!!p.dry_run,p.feeds||{email:true,edr:true,dns:true,ueba:true,cloud:true}]);
  const {rows}=await q(`SELECT * FROM policy WHERE tenant_id=$1`,[req.user.tenant_id]);
  res.json(rows[0]);
});

// ---------- helpers for apikeys schema normalization ----------
async function ensureApikeysSchema(){
  // Create table if missing and ensure an `id TEXT` column exists
  await q(`
    CREATE TABLE IF NOT EXISTS apikeys(
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      revoked BOOLEAN NOT NULL DEFAULT false,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
    );
  `);
  // If some older deploy created the table without `id`, add it
  await q(`ALTER TABLE apikeys ADD COLUMN IF NOT EXISTS id TEXT`);
  // If the column exists but is UUID, convert to TEXT (idempotent)
  await q(`DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='apikeys' AND column_name='id' AND data_type='uuid'
    ) THEN
      ALTER TABLE apikeys ALTER COLUMN id TYPE TEXT USING id::text;
    END IF;
  END $$;`);
}

async function withApikeysRetry(op){
  try { return await op(); }
  catch(e){
    // If failure is due to missing column or bad type, fix and retry once
    if(String(e?.message||'').match(/column\s+"?id"?\s+does\s+not\s+exist/i) || e?.code === '42703'){
      await ensureApikeysSchema();
      return await op();
    }
    throw e;
  }
}

// ---------- apikeys ----------
// New API key endpoints (string keys)
import crypto from "crypto";
app.post('/apikeys', authMiddleware, async (req,res)=>{
  try{
    // Super Admin can always create (testing/impersonation)
    if(!(req.user?.is_super)){
      const t = await getEffectivePlan(req.user.tenant_id, req);
      const nowEpoch = now();
      const trialActive = t.trial_ends_at ? Number(t.trial_ends_at) > nowEpoch : true;
      const plan = t.effective || t.plan;
      const allowed = (plan && plan !== 'suspended') && (plan !== 'trial' ? true : trialActive);
      if (!allowed) return res.status(402).json({ error: 'subscription inactive' });
    }
    const key = 'key_' + crypto.randomUUID().replace(/-/g,'');
    await withApikeysRetry(()=> q(
      `INSERT INTO apikeys(id, tenant_id, revoked, created_at)
       VALUES($1,$2,false,EXTRACT(EPOCH FROM NOW()))`,
      [key, req.user.tenant_id]
    ));
    return res.json({ ok:true, api_key: key });
  }catch(e){
    console.error('apikeys create failed', e);
    if (req.user?.is_super) {
      return res.status(500).json({ error: 'key create failed', code: e.code||null, detail: String(e.message||e) });
    }
    return res.status(500).json({ error: 'key create failed' });
  }
});

app.post('/apikeys/create', authMiddleware, async (req,res)=>{
  try{
    // Super Admin can always create (testing/impersonation)
    if(!(req.user?.is_super)){
      const t = await getEffectivePlan(req.user.tenant_id, req);
      const nowEpoch = now();
      const trialActive = t.trial_ends_at ? Number(t.trial_ends_at) > nowEpoch : true;
      const plan = t.effective || t.plan;
      const allowed = (plan && plan !== 'suspended') && (plan !== 'trial' ? true : trialActive);
      if (!allowed) return res.status(402).json({ error: 'subscription inactive' });
    }
    const key = 'key_' + crypto.randomUUID().replace(/-/g,'');
    await withApikeysRetry(()=> q(
      `INSERT INTO apikeys(id, tenant_id, revoked, created_at)
       VALUES($1,$2,false,EXTRACT(EPOCH FROM NOW()))`,
      [key, req.user.tenant_id]
    ));
    return res.json({ ok:true, api_key: key });
  }catch(e){
    console.error('apikeys create (alias) failed', e);
    if (req.user?.is_super) {
      return res.status(500).json({ error: 'key create failed', code: e.code||null, detail: String(e.message||e) });
    }
    return res.status(500).json({ error: 'key create failed' });
  }
});
app.get("/apikeys",authMiddleware,async (req,res)=>{
  const {rows}=await q(`SELECT id,revoked,created_at FROM apikeys WHERE tenant_id=$1 ORDER BY created_at DESC`,[req.user.tenant_id]);
  res.json({ok:true,keys:rows});
});
app.post("/apikeys/revoke",authMiddleware,async (req,res)=>{
  const {id}=req.body||{};
  await q(`UPDATE apikeys SET revoked=true WHERE id=$1 AND tenant_id=$2`,[id,req.user.tenant_id]);
  res.json({ok:true});
});

app.get('/alerts/stream', async (req, res) => {
  try {
    let token = null;
    const h = req.headers?.authorization || '';
    if (h.startsWith('Bearer ')) token = h.slice(7);
    if (!token && req.query && req.query.token) token = String(req.query.token);
    if (!token) return res.status(401).end();
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { tenant_id: decoded.tenant_id, email: decoded.email };
  } catch (e) { return res.status(401).end(); }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const tenant = req.user.tenant_id;
  const listener = (payload) => {
    if (payload.tenant_id !== tenant) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  bus.on('alert', listener);

  res.write(`event: ping\n`);
  res.write(`data: {"ok":true}\n\n`);

  req.on('close', () => bus.off('alert', listener));
});

// Realtime scan stream (includes non-alert emails with severity "none"|"medium"|"high")
app.get('/scans/stream', async (req, res) => {
  try {
    let token = null;
    const h = req.headers?.authorization || '';
    if (h.startsWith('Bearer ')) token = h.slice(7);
    if (!token && req.query && req.query.token) token = String(req.query.token);
    if (!token) return res.status(401).end();
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { tenant_id: decoded.tenant_id, email: decoded.email };
  } catch (e) { return res.status(401).end(); }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const tenant = req.user.tenant_id;
  const listener = (payload) => {
    if (payload.tenant_id !== tenant) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  bus.on('scan', listener);

  res.write(`event: ping\n`);
  res.write(`data: {"ok":true}\n\n`);

  req.on('close', () => bus.off('scan', listener));
});
// Back-compat alias for older frontends that listen on /email/stream
app.get('/email/stream', async (req, res) => {
  try {
    let token = null;
    const h = req.headers?.authorization || '';
    if (h.startsWith('Bearer ')) token = h.slice(7);
    if (!token && req.query && req.query.token) token = String(req.query.token);
    if (!token) return res.status(401).end();
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { tenant_id: decoded.tenant_id, email: decoded.email };
  } catch (e) { return res.status(401).end(); }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const tenant = req.user.tenant_id;
  const listener = (payload) => {
    if (payload.tenant_id !== tenant) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  bus.on('scan', listener);

  res.write(`event: ping\n`);
  res.write(`data: {"ok":true}\n\n`);

  req.on('close', () => bus.off('scan', listener));
});
// Recent scans for initial UI fill (non-persistent; in-memory ring buffer)
app.get('/email/recent-scans', authMiddleware, async (req,res)=>{
  try{
    return res.json({ ok:true, items: getRecentScans(req.user.tenant_id) });
  }catch(e){
    return res.status(500).json({ ok:false, error: 'recent scans failed' });
  }
});

// ---------- ingest helpers ----------
// ===== Email: on-demand poll & scan (provider-aware: M365 delta or Gmail) =====
app.post('/email/poll', authMiddleware, enforceActive, async (req,res)=>{
  try{
    const max = Number(req.body?.max||10);
    const conn = await getEmailConnector(req.user.tenant_id);
    if(!conn || conn.status!=='connected'){
      return res.status(400).json({ ok:false, error:'no connected email provider' });
    }

    let items = [];
    if(conn.provider === 'm365'){
      // Prefer delta (only new/changed); fall back to inbox page if delta errs
      try{
        items = await fetchM365Delta(req.user.tenant_id, Math.max(1, Math.min(50, max)));
      }catch(_e){
        items = await fetchM365Inbox(req.user.tenant_id, max);
      }
    }else if(conn.provider === 'google'){
      items = await gmailList(req.user.tenant_id, 'newer_than:1d', Math.max(1, Math.min(50, max)));
    }else{
      return res.status(400).json({ ok:false, error:`unsupported provider: ${conn.provider}` });
    }

    const created = await scanAndRecordEmails(req.user.tenant_id, items);
    await saveUsage(req.user.tenant_id, 'email_poll');

    // Include a little status echo back
    const account = (conn.details && conn.details.account) ? conn.details.account : null;
    return res.json({ ok:true, provider: conn.provider, fetched: items.length, alerts_created: created, account });
  }catch(e){
    console.error('email poll failed', e);
    return res.status(500).json({ ok:false, error: 'poll failed', detail: String(e.message||e) });
  }
});
async function checkKey(req){
  const key=(req.headers["x-api-key"]||"").trim();
  if(!key) return null;
  const {rows}=await q(`SELECT tenant_id,revoked FROM apikeys WHERE id=$1`,[key]);
  if(!rows.length||rows[0].revoked) return null;
  return rows[0].tenant_id;
}
const saveUsage=(tenant_id,kind)=>q(`INSERT INTO usage_events(id,tenant_id,kind,created_at) VALUES($1,$2,$3,$4)`,[uuidv4(),tenant_id,kind,now()]);
const scoreOf=ev=>{
  if(ev.type==="dns" && (ev.verdict==="dns-tunnel"||ev.newly_registered)) return -1;
  if(ev.type==="edr" && /enc|frombase64string|mimikatz|cobalt/i.test(ev.cmdline||"")) return -0.6;
  if(ev.type==="email" && ev.anomaly) return -1;
  if(ev.type==="ueba" && (ev.impossible_travel||ev.mass_download||ev.off_hours)) return -1;
  return -0.2;
};
async function maybeAct(tenant_id,alert,policy){
  const needTwoSignals=true; // safety
  const critical=Number(alert.score)<=Number(policy.threshold??-0.6);
  const ev=alert.event_json;
  const signals=[];
  if(ev.type==="dns"&&(policy.allow_dns_deny)) signals.push("dns_deny");
  if(ev.type==="edr"&&(policy.allow_quarantine)) signals.push("quarantine");
  if(ev.type==="ueba"&&(policy.allow_disable_account)) signals.push("disable_account");
  // require two distinct signals OR critical
  const okToAct=policy.enabled && (critical || signals.length>=2);
  if(!okToAct) return;
  for(const act of signals){
    const id=uuidv4();
    const result={ok:true,dry_run:policy.dry_run===true};
    await q(`INSERT INTO actions(id,alert_id,tenant_id,action,target_kind,result_json,created_at)
             VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [id,alert.id,tenant_id,act,ev.type,result,now()]);
  }
}
async function writeAlert(tenant_id,ev){
  const {rows:pRows}=await q(`SELECT * FROM policy WHERE tenant_id=$1`,[tenant_id]);
  const p=pRows[0]||{enabled:true,threshold:-0.6,allow_quarantine:true,allow_dns_deny:true,allow_disable_account:true,dry_run:false,feeds:{email:true,edr:true,dns:true,ueba:true,cloud:true}};
  if(!p.enabled) return null;
  const score=scoreOf(ev);
  const id=uuidv4();
  await q(`INSERT INTO alerts(id,tenant_id,event_json,score,status,created_at)
           VALUES($1,$2,$3,$4,'new',$5)`,[id,tenant_id,ev,score,now()]);
  const alert={id,tenant_id,event_json:ev,score,status:'new',created_at:now()};
  await maybeAct(tenant_id,alert,p);
  try { bus.emit('alert', { tenant_id, alert }); } catch(_e) {}
  return alert;
}

// ---------- ingest (plan-gated) ----------
app.post("/email/scan",async (req,res)=>{
  try{
    const tenant_id=await checkKey(req); if(!tenant_id) return res.status(401).json({error:"Invalid API key"});
    const eff = await getEffectivePlan(tenant_id, req);
    if(!requirePaid(eff.effective||"none")) return res.status(403).json({error:"plan not active"});
    const emails=req.body?.emails||[];
    await saveUsage(tenant_id,"email");
    const results=[];
    for(const e of emails){
      const ev={type:"email",anomaly:!!(e?.anomaly||e?.subject?.match(/verify|urgent|invoice/i))};
      const alert=await writeAlert(tenant_id,ev);
      results.push({email:{from:e?.from,subject:e?.subject},score:alert?.score??-0.2,anomaly:!!ev.anomaly});
    }
    res.json({tenant_id,results});
  }catch(e){ res.status(500).json({error:"ingest failed"}); }
});

app.post("/edr/ingest",async (req,res)=>{
  const tenant_id=await checkKey(req); if(!tenant_id) return res.status(401).json({error:"Invalid API key"});
  const eff = await getEffectivePlan(tenant_id, req);
  if(!["pro","pro_plus"].includes(eff.effective)) return res.status(403).json({error:"plan not active"});
  await saveUsage(tenant_id,"edr");
  const events=req.body?.events||[];
  const results=[];
  for(const e of events){
    const ev={type:"edr",host:e.host,process:e.process,cmdline:e.cmdline,file_ops:e.file_ops};
    const alert=await writeAlert(tenant_id,ev);
    results.push({score:alert?.score??-0.2,anomaly:Number(alert?.score)<=-0.6});
  }
  res.json({tenant_id,results});
});

app.post("/dns/ingest",async (req,res)=>{
  const tenant_id=await checkKey(req); if(!tenant_id) return res.status(401).json({error:"Invalid API key"});
  const eff = await getEffectivePlan(tenant_id, req);
  if(!["pro","pro_plus"].includes(eff.effective)) return res.status(403).json({error:"plan not active"});
  await saveUsage(tenant_id,"dns");
  const events=req.body?.events||[];
  const results=[];
  for(const e of events){
    const ev={type:"dns",qname:e.qname,qtype:e.qtype,resolved_ip:e.resolved_ip,newly_registered:!!e.newly_registered,verdict:e.verdict};
    const alert=await writeAlert(tenant_id,ev);
    results.push({score:alert?.score??-0.2,anomaly:Number(alert?.score)<=-0.6});
  }
  res.json({tenant_id,results});
});

app.post("/logs/ingest",async (req,res)=>{
  const tenant_id=await checkKey(req); if(!tenant_id) return res.status(401).json({error:"Invalid API key"});
  const eff = await getEffectivePlan(tenant_id, req);
  if(!["pro","pro_plus"].includes(eff.effective)) return res.status(403).json({error:"plan not active"});
  await saveUsage(tenant_id,"logs");
  const events=req.body?.events||[];
  const results=[];
  for(const e of events){
    const ev={type:"ueba",source:e.source,principal:e.principal,action:e.action,ip:e.ip,geo:e.geo,impossible_travel:!!e.anomaly,off_hours:!!e.off_hours,mass_download:!!e.mass_download};
    const alert=await writeAlert(tenant_id,ev);
    results.push({score:alert?.score??-0.2,anomaly:Number(alert?.score)<=-0.6});
  }
  res.json({tenant_id,results});
});

app.post("/cloud/ingest",async (req,res)=>{
  const tenant_id=await checkKey(req); if(!tenant_id) return res.status(401).json({error:"Invalid API key"});
  const eff = await getEffectivePlan(tenant_id, req);
  if(eff.effective!=="pro_plus") return res.status(403).json({error:"plan not active"});
  await saveUsage(tenant_id,"cloud");
  res.json({ok:true});
});

// ---------- views ----------
app.get("/alerts",authMiddleware,async (req,res)=>{
  const {rows}=await q(`SELECT id,tenant_id,event_json AS event,score,status,created_at FROM alerts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`,[req.user.tenant_id]);
  res.json({ok:true,alerts:rows});
});

// Convenience: alerts ordered by actual email timestamp (event.when) newest first
app.get("/alerts/recent", authMiddleware, async (req, res) => {
  try{
    const { rows } = await q(`
      SELECT
        id,
        tenant_id,
        event_json AS event,
        score,
        status,
        created_at,
        COALESCE(
          NULLIF(event_json->>'when','')::timestamptz,
          to_timestamp(created_at)
        ) AS when_ts
      FROM alerts
      WHERE tenant_id=$1
      ORDER BY when_ts DESC
      LIMIT 200
    `,[req.user.tenant_id]);
    res.json({ ok:true, alerts: rows });
  }catch(e){
    console.error('alerts/recent failed', e);
    res.status(500).json({ ok:false, error: 'recent failed' });
  }
});
// Quick 7-day severity summary for Alerts Dashboard
app.get("/alerts/summary", authMiddleware, async (req,res)=>{
  try{
    const since = now() - 7*24*3600;
    const { rows } = await q(`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN score <= -0.8 THEN 1 ELSE 0 END)::int AS high,
        SUM(CASE WHEN score > -0.8 AND score <= -0.6 THEN 1 ELSE 0 END)::int AS medium,
        SUM(CASE WHEN score > -0.6 THEN 1 ELSE 0 END)::int AS low
      FROM alerts WHERE tenant_id=$1 AND created_at >= $2
    `,[req.user.tenant_id, since]);
    const r = rows[0] || { total:0, high:0, medium:0, low:0 };
    return res.json({ ok:true, window_days:7, ...r });
  }catch(e){
    console.error('alerts summary failed', e);
    return res.status(500).json({ ok:false, error:'summary failed' });
  }
});
app.get("/actions",authMiddleware,async (req,res)=>{
  const {rows}=await q(`SELECT id,alert_id,tenant_id,action,target_kind,result_json,created_at FROM actions WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`,[req.user.tenant_id]);
  res.json({ok:true,actions:rows});
});

// ---------- admin (GDPR-aware) ----------
app.get("/admin/tenants", authMiddleware, requireSuper, async (_req,res)=>{
  const {rows}=await q(`
    SELECT t.tenant_id AS id,t.name,t.plan,t.created_at,
     (SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.tenant_id) AS users,
     (SELECT COUNT(*) FROM apikeys k WHERE k.tenant_id=t.tenant_id AND NOT k.revoked) AS active_keys,
     (SELECT MAX(created_at) FROM alerts a WHERE a.tenant_id=t.tenant_id) AS last_alert
    FROM tenants t ORDER BY t.created_at DESC LIMIT 500`);
  res.json({ok:true,tenants:rows});
});
app.get("/admin/tenant/:id", authMiddleware, requireSuper, async (req,res)=>{
  const {rows}=await q(`SELECT tenant_id AS id,name,plan,contact_email,created_at,updated_at,is_demo FROM tenants WHERE tenant_id=$1`,[req.params.id]);
  res.json({ok:true,tenant:rows[0]||null});
});
app.get("/admin/tenant/:id/keys", authMiddleware, requireSuper, async (req,res)=>{
  const {rows}=await q(`SELECT id,revoked,created_at FROM apikeys WHERE tenant_id=$1 ORDER BY created_at DESC`,[req.params.id]);
  res.json({ok:true,keys:rows});
});

// New admin route for listing keys (duplicate, for compatibility)
app.get('/admin/tenant/:id/keys', authMiddleware, requireSuper, async (req,res)=>{
  try{
    const tid = req.params.id;
    const { rows } = await q(
      `SELECT id, revoked, created_at
         FROM apikeys
        WHERE tenant_id=$1
        ORDER BY created_at DESC`,
      [tid]
    );
    return res.json({ ok:true, keys: rows });
  }catch(e){
    console.error('admin keys list failed', e);
    return res.status(500).json({ error: 'keys list failed' });
  }
});
app.post("/admin/revoke-key", authMiddleware, requireSuper, async (req,res)=>{
  const {id}=req.body||{}; if(!id) return res.status(400).json({error:"id required"});
  await q(`UPDATE apikeys SET revoked=true WHERE id=$1`,[id]);
  res.json({ok:true});
});
app.get("/admin/sar.csv", authMiddleware, requireSuper, async (_req,res)=>{
  const {rows}=await q(`SELECT tenant_id AS id,name,plan,created_at,updated_at FROM tenants ORDER BY created_at`);
  const lines=["id,name,plan,created_at,updated_at",...rows.map(r=>`${JSON.stringify(r.id)},${JSON.stringify(r.name)},${r.plan},${r.created_at},${r.updated_at}`)];
  res.setHeader("Content-Type","text/csv"); res.send(lines.join("\n"));
});
// Allow/deny seeding usage events in the current environment
const ALLOW_ADMIN_SEED = process.env.ALLOW_ADMIN_SEED === 'true';
// ---------- data retention & backup diagnostics ----------
// Retain alerts for RETAIN_ALERT_DAYS (default 90) and usage_events for RETAIN_USAGE_DAYS (default 180)
const RETAIN_ALERT_DAYS = Number(process.env.RETAIN_ALERT_DAYS || 90);
const RETAIN_USAGE_DAYS = Number(process.env.RETAIN_USAGE_DAYS || 180);

function cutoffEpoch(days){
  const d = Math.max(1, Number(days || 1));
  return Math.floor(Date.now()/1000) - (d * 24 * 3600);
}

async function retentionPreview(){
  const a = await q(`SELECT COUNT(*)::int AS n FROM alerts WHERE created_at < $1`, [cutoffEpoch(RETAIN_ALERT_DAYS)]);
  const u = await q(`SELECT COUNT(*)::int AS n FROM usage_events WHERE created_at < $1`, [cutoffEpoch(RETAIN_USAGE_DAYS)]);
  return { alerts: a.rows[0]?.n || 0, usage_events: u.rows[0]?.n || 0 };
}

async function retentionRun(){
  const a = await q(`
    WITH del AS (
      DELETE FROM alerts
       WHERE created_at < $1
       RETURNING 1
    )
    SELECT COUNT(*)::int AS n FROM del
  `, [cutoffEpoch(RETAIN_ALERT_DAYS)]);
  const u = await q(`
    WITH del AS (
      DELETE FROM usage_events
       WHERE created_at < $1
       RETURNING 1
    )
    SELECT COUNT(*)::int AS n FROM del
  `, [cutoffEpoch(RETAIN_USAGE_DAYS)]);
  return { alerts_deleted: a.rows[0]?.n || 0, usage_events_deleted: u.rows[0]?.n || 0 };
}
// Record administrative ops runs (auditing)
const recordOpsRun = (type, details) =>
  q(
    `INSERT INTO ops_runs(id, run_type, details, created_at)
     VALUES($1,$2,$3,$4)`,
    [uuidv4(), String(type||'unknown'), details || {}, now()]
  );
// Super Admin: retention preview
app.get('/admin/ops/retention/preview', authMiddleware, requireSuper, async (_req, res) => {
  try{
    const p = await retentionPreview();
    res.json({ ok:true, keep: { alerts_days: RETAIN_ALERT_DAYS, usage_days: RETAIN_USAGE_DAYS }, pending: p });
  }catch(e){
    res.status(500).json({ ok:false, error:'preview failed' });
  }
});

// Super Admin: retention run now
app.post('/admin/ops/retention/run', authMiddleware, requireSuper, async (_req, res) => {
  try{
    const del = await retentionRun();
    // audit trail
    try { await recordOpsRun('retention_run', del); } catch(_e) {}
    res.json({ ok:true, deleted: del });
  }catch(e){
    res.status(500).json({ ok:false, error:'retention run failed' });
  }
});
// Super Admin: lightweight backup/DB diagnostics
app.get('/admin/ops/backup/diag', authMiddleware, requireSuper, async (_req, res) => {
  try{
    const ver = await q(`SELECT version() AS version`);
    const tz  = await q(`SELECT current_setting('TimeZone') AS tz`);
    const nowts = await q(`SELECT NOW() AT TIME ZONE 'UTC' AS utc_now`);
    res.json({
      ok: true,
      db: {
        version: ver.rows[0]?.version || null,
        timezone: tz.rows[0]?.tz || null,
        utc_now: nowts.rows[0]?.utc_now || null
      },
      notes: 'Use your provider’s automated backups & snapshots. This endpoint only surfaces DB metadata so you can record it in ops runbooks.'
    });
  }catch(e){
    res.status(500).json({ ok:false, error:'backup diag failed' });
  }
});
// Super Admin: seed usage events for retention testing
// Super Admin: seed usage events for retention testing (gated by ALLOW_ADMIN_SEED)
app.post('/admin/ops/seed/usage', authMiddleware, requireSuper, async (req, res) => {
  try {
    if (!ALLOW_ADMIN_SEED) {
      return res.status(403).json({ ok:false, error: 'disabled in this environment' });
    }
    // Accept either query or body params
    const rawDays  = (req.query?.days_ago ?? req.body?.days_ago ?? 200);
    const rawCount = (req.query?.count    ?? req.body?.count    ?? 500);

    const daysAgo = Math.max(1, Math.min(3650, Number(rawDays)));
    const count   = Math.max(1, Math.min(5000, Number(rawCount)));

    const baseTs = now() - (daysAgo * 24 * 3600);
    let inserted = 0;

    // Spread events roughly over the chosen backdated day
    for (let i = 0; i < count; i++) {
      const jitter = Math.floor(Math.random() * (24 * 3600));
      const ts = baseTs + jitter;
      await q(
        `INSERT INTO usage_events(id, tenant_id, kind, created_at)
         VALUES($1,$2,$3,$4)`,
        [uuidv4(), req.user.tenant_id, 'email', ts]
      );
      inserted++;
    }

    // audit trail
    try { await recordOpsRun('seed_usage', { days_ago: daysAgo, count: inserted }); } catch(_e) {}

    return res.json({
      ok: true,
      seeded: { count: inserted, days_ago: daysAgo },
      hint: 'Use /admin/ops/retention/preview and /admin/ops/retention/run to verify purge.'
    });
  } catch (e) {
    console.error('seed usage failed', e);
    return res.status(500).json({ ok:false, error: 'seed failed' });
  }
});
// Super Admin: usage age buckets (per-tenant) for diagnostics
app.get('/admin/ops/usage/buckets', authMiddleware, requireSuper, async (req, res) => {
  try {
    const tid = req.user.tenant_id;
    const nowEpoch = now();
    const cut90  = nowEpoch -  90 * 24 * 3600;
    const cut180 = nowEpoch - 180 * 24 * 3600;

    const lt90 = await q(
      `SELECT COUNT(*)::int AS n
         FROM usage_events
        WHERE tenant_id=$1 AND created_at >= $2`,
      [tid, cut90]
    );

    const d90_180 = await q(
      `SELECT COUNT(*)::int AS n
         FROM usage_events
        WHERE tenant_id=$1 AND created_at < $2 AND created_at >= $3`,
      [tid, cut90, cut180]
    );

    const gt180 = await q(
      `SELECT COUNT(*)::int AS n
         FROM usage_events
        WHERE tenant_id=$1 AND created_at < $2`,
      [tid, cut180]
    );

    return res.json({
      ok: true,
      buckets: {
        "<90d": lt90.rows[0]?.n || 0,
        "90-180d": d90_180.rows[0]?.n || 0,
        ">180d": gt180.rows[0]?.n || 0
      },
      keep: { alerts_days: RETAIN_ALERT_DAYS, usage_days: RETAIN_USAGE_DAYS }
    });
  } catch (e) {
    console.error('usage buckets failed', e);
    return res.status(500).json({ ok: false, error: 'buckets failed' });
  }
});

// Super Admin: exact usage counts by age buckets (per-tenant)
app.get('/admin/ops/usage/counts', authMiddleware, requireSuper, async (req, res) => {
  try {
    const tid = req.user.tenant_id;
    const nowEpoch = now();
    const cut90  = nowEpoch -  90 * 24 * 3600;
    const cut180 = nowEpoch - 180 * 24 * 3600;

    const r = await q(
      `SELECT
         SUM(CASE WHEN created_at >= $2 THEN 1 ELSE 0 END)::int AS lt90,
         SUM(CASE WHEN created_at <  $2 AND created_at >= $3 THEN 1 ELSE 0 END)::int AS d90_180,
         SUM(CASE WHEN created_at <  $3 THEN 1 ELSE 0 END)::int AS gt180
       FROM usage_events
       WHERE tenant_id = $1`,
      [tid, cut90, cut180]
    );

    const counts = {
      "<90d":     r.rows[0]?.lt90     || 0,
      "90-180d":  r.rows[0]?.d90_180  || 0,
      ">180d":    r.rows[0]?.gt180    || 0
    };

    return res.json({
      ok: true,
      counts,
      keep: { alerts_days: RETAIN_ALERT_DAYS, usage_days: RETAIN_USAGE_DAYS }
    });
  } catch (e) {
    console.error('usage counts failed', e);
    return res.status(500).json({ ok: false, error: 'counts failed' });
  }
});

// Daily retention at 03:15 UTC
(function scheduleDailyRetention(){
  function msUntilNext(hourUTC, minuteUTC){
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(hourUTC, minuteUTC, 0, 0);
    if(next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next.getTime() - now.getTime();
  }
  const firstDelay = msUntilNext(3, 15); // 03:15 UTC
  setTimeout(async () => {
    try{
      const del = await retentionRun();
      console.log('[retention]', new Date().toISOString(), del);
    }catch(e){
      console.warn('[retention] failed', e?.message || e);
    }
    setInterval(async () => {
      try{
        const del = await retentionRun();
        console.log('[retention]', new Date().toISOString(), del);
      }catch(e){
        console.warn('[retention] failed', e?.message || e);
      }
    }, 24*60*60*1000);
  }, firstDelay);
})();

// ---------- summary job (console log in dev) ----------
setInterval(async ()=>{
  try{
    const {rows}=await q(`
      SELECT tenant_id, COUNT(*)::int AS alerts_24
      FROM alerts WHERE created_at>(EXTRACT(EPOCH FROM NOW())-24*3600)
      GROUP BY tenant_id ORDER BY alerts_24 DESC LIMIT 20`);
    if(rows.length) console.log("[daily-summary]",new Date().toISOString(),rows);
  }catch(_e){}
}, 6*60*60*1000);

// ---------- background email poller (provider-aware: M365 delta + Gmail) ----------
setInterval(async ()=>{
  try{
    // Pull a small batch of connected email connectors
    const { rows } = await q(`
      SELECT tenant_id, provider
      FROM connectors
      WHERE type='email' AND status='connected'
      ORDER BY updated_at DESC
      LIMIT 100
    `);

    for(const r of rows){
      try{
        let items = [];
        if(r.provider === 'm365'){
          try{
            items = await fetchM365Delta(r.tenant_id, 25);
          }catch(_e){
            items = await fetchM365Inbox(r.tenant_id, 10);
          }
        }else if(r.provider === 'google'){
          items = await gmailList(r.tenant_id, 'newer_than:1d', 25);
        }else{
          continue; // unsupported
        }

        const created = await scanAndRecordEmails(r.tenant_id, items);
        if(created>0) console.log('[poll]', r.tenant_id, r.provider, 'alerts:', created);
      }catch(inner){
        console.warn('[poll] tenant failed', r.tenant_id, r.provider, String(inner.message||inner));
      }
    }
  }catch(e){
    console.warn('background poller error', e);
  }
}, 5*60*1000); // every 5 minutes

// ---------- start ----------
app.listen(PORT,()=>console.log(`${BRAND} listening on :${PORT}`));

// ---------- Super Admin DB diagnostics ----------
app.get('/admin/db/diag', authMiddleware, requireSuper, async (_req,res)=>{
  try{
    const t = await q(`SELECT to_regclass('public.apikeys') IS NOT NULL AS apikeys_exists`);
    const c = await q(`SELECT COUNT(*)::int AS cnt FROM apikeys`);
    return res.json({ ok:true, apikeys_table: t.rows[0]?.apikeys_exists===true, apikey_count: c.rows[0]?.cnt||0 });
  }catch(e){
    console.error('db diag failed', e);
    return res.status(500).json({ ok:false, error: String(e.message||e) });
  }
});